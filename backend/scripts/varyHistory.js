// Manual only. Rebalances the imported training history without changing annual
// purchased quantities, current stock, real transactions, dates or accounts.
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { Prisma } = require('@prisma/client');
const { connectDatabase, backupDatabase } = require('./historyDatabase');
const { SIMULATION_TAG } = require('../src/utils/aiAnalytics');
const { calculateOrderTotals } = require('../src/utils/orderWorkflow');
const { calculateDeliveryPlan } = require('../src/utils/deliveryRules');
const OPERATION = '[HISTORY-VARIATION:V1]';

function allocate(total, weights) {
  assert.ok(Number.isInteger(total) && total >= weights.length, 'Cannot preserve positive line quantities');
  const remaining = total - weights.length;
  const sum = weights.reduce((a, b) => a + b, 0);
  assert.ok(sum > 0 && weights.every((weight) => weight > 0), 'Invalid weights');
  const exact = weights.map((weight) => remaining * weight / sum);
  const result = exact.map((value) => 1 + Math.floor(value));
  const ranking = exact.map((value, index) => ({ index, remainder: value % 1 })).sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let left = total - result.reduce((a, b) => a + b, 0), index = 0; left > 0; left--, index++) result[ranking[index].index]++;
  return result;
}

async function varyHistory(db, manifest, apply = false) {
  assert.equal(manifest.tag, SIMULATION_TAG, 'Wrong history manifest');
  assert.equal(manifest.orderIds.length, 96, 'Expected the original 96 imported orders');
  assert.equal(manifest.productIds.length, 9, 'Expected nine imported products');
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(71942026)`;
    assert.equal(await tx.auditLog.count({ where: { details: { contains: OPERATION } } }), 0, 'Variation already applied');
    const orders = await tx.clientOrder.findMany({ where: { clientOrderId: { in: manifest.orderIds } }, include: { items: { include: { product: true } }, deliveries: { include: { items: true } }, payments: true }, orderBy: [{ createdAt: 'asc' }, { clientOrderId: 'asc' }] });
    assert.equal(orders.length, 96, 'Missing imported orders');
    const groups = new Map();
    const quantities = new Map();
    const projectIds = [...new Set(orders.map((order) => order.projectId).filter(Boolean))];
    for (const projectId of projectIds) {
      assert.ok(manifest.projectIds?.includes(projectId), 'Unexpected project');
      assert.equal(await tx.clientOrder.count({ where: { projectId, clientOrderId: { notIn: manifest.orderIds } } }), 0, 'Training project has other orders; refusing to overwrite its value');
    }
    orders.forEach((order, index) => {
      assert.ok(order.specialInstructions?.includes(SIMULATION_TAG) && order.orderNumber.startsWith('SIM-H1-') && order.status === 'DELIVERED', 'Refusing a non-training or incomplete order');
      assert.equal(order.deliveries.length, 1, 'Expected a single completed batch');
      assert.equal(order.deliveries[0].status, 'DELIVERED');
      assert.equal(order.payments.length, 1, 'Expected one payment per imported order');
      for (const item of order.items) {
        assert.ok(manifest.productIds.includes(item.productId), 'Unexpected product');
        const key = `${Math.floor(index / 48)}:${item.productId}`;
        const group = groups.get(key) || [];
        group.push({ item, index, month: Math.floor(index / 4) });
        groups.set(key, group);
      }
    });
    for (const group of groups.values()) {
      const weights = group.map(({ index, month, item }) => [0.45, 0.7, 1.25, 0.85, 1.6, 0.55, 0.95, 1.4, 0.75, 1.15, 1.8, 0.6][month % 12] * (month === 7 || month === 18 ? 1.7 : 1) * (0.7 + ((index * 7 + item.productId * 3) % 9) / 10));
      const values = allocate(group.reduce((sum, row) => sum + row.item.quantity, 0), weights);
      group.forEach((row, index) => quantities.set(row.item.itemId, values[index]));
    }
    const stock = await tx.stockTransaction.findMany({ where: { productId: { in: manifest.productIds } }, orderBy: [{ date: 'asc' }, { transactionId: 'asc' }] });
    const plannedDeltas = new Map();
    const monthly = Array(24).fill(0);
    const changes = [];
    for (const [index, order] of orders.entries()) {
      const lines = order.items.map((item) => ({ ...item, quantity: quantities.get(item.itemId), unitPrice: Number(item.unitPrice) }));
      const totals = calculateOrderTotals(lines);
      const load = calculateDeliveryPlan(lines);
      assert.ok(load.totalKg <= 1000 && load.batchCount === 1, 'Rebalanced order requires additional batches; refusing update');
      const delivery = order.deliveries[0];
      assert.equal(Number(order.payments[0].amount), Number(order.total), 'Existing payment does not reconcile');
      for (const line of lines) {
        const matches = stock.filter((row) => row.productId === line.productId && row.type === 'ISSUE' && row.notes?.includes(SIMULATION_TAG) && row.notes.split(/\s+/).includes(order.orderNumber));
        assert.equal(matches.length, 1, 'Cannot uniquely resolve imported stock issue');
        assert.equal(matches[0].qtyChange, -order.items.find((item) => item.itemId === line.itemId).quantity, 'Existing stock issue does not reconcile');
        plannedDeltas.set(matches[0].transactionId, -line.quantity);
        assert.equal(delivery.items.filter((item) => item.orderItemId === line.itemId).length, 1, 'Missing delivery line');
        monthly[Math.floor(index / 4)] += line.quantity;
      }
      changes.push({ order, lines, totals, loadKg: load.totalKg });
    }
    const products = await tx.product.findMany({ where: { productId: { in: manifest.productIds } } });
    assert.equal(products.length, 9);
    const balances = new Map();
    const ledger = [];
    for (const row of stock) {
      const opening = balances.has(row.productId) ? balances.get(row.productId) : row.newBalance - row.qtyChange;
      const qtyChange = plannedDeltas.get(row.transactionId) ?? row.qtyChange;
      const newBalance = opening + qtyChange;
      assert.ok(newBalance >= 0, 'Rebalanced history would create negative stock');
      balances.set(row.productId, newBalance);
      ledger.push({ row, qtyChange, newBalance });
    }
    for (const product of products) assert.equal(balances.get(product.productId), product.qtyOnHand, 'Current stock would change; refusing update');
    if (apply) {
      // Parameterized bulk statements avoid hundreds of cross-region round trips.
      // SQL updates intentionally preserve all original workflow timestamps.
      const itemValues = Prisma.join(changes.flatMap(({ lines }) => lines.map((line) => Prisma.sql`(${line.itemId}, ${line.quantity})`)));
      await tx.$executeRaw(Prisma.sql`UPDATE public.client_order_items AS t SET quantity = v.qty::integer FROM (VALUES ${itemValues}) AS v(id, qty) WHERE t.item_id = v.id::integer`);
      const deliveryItemValues = Prisma.join(changes.flatMap(({ order, lines }) => lines.map((line) => Prisma.sql`(${order.deliveries[0].items.find((item) => item.orderItemId === line.itemId).deliveryItemId}, ${line.quantity})`)));
      await tx.$executeRaw(Prisma.sql`UPDATE public.delivery_items AS t SET quantity = v.qty::integer FROM (VALUES ${deliveryItemValues}) AS v(id, qty) WHERE t.delivery_item_id = v.id::integer`);
      const orderValues = Prisma.join(changes.map(({ order, totals }) => Prisma.sql`(${order.clientOrderId}, ${totals.subtotal}, ${totals.vat}, ${totals.total})`));
      await tx.$executeRaw(Prisma.sql`UPDATE public.client_orders AS t SET subtotal = v.subtotal::numeric, vat = v.vat::numeric, total = v.total::numeric FROM (VALUES ${orderValues}) AS v(id, subtotal, vat, total) WHERE t.client_order_id = v.id::integer`);
      const paymentValues = Prisma.join(changes.map(({ order, totals }) => Prisma.sql`(${order.payments[0].paymentId}, ${totals.total})`));
      await tx.$executeRaw(Prisma.sql`UPDATE public.payment_transactions AS t SET amount = v.amount::numeric FROM (VALUES ${paymentValues}) AS v(id, amount) WHERE t.payment_id = v.id::integer`);
      const deliveryValues = Prisma.join(changes.map(({ order, loadKg }) => Prisma.sql`(${order.deliveries[0].deliveryId}, ${loadKg})`));
      await tx.$executeRaw(Prisma.sql`UPDATE public.deliveries AS t SET load_kg = v.kg::numeric FROM (VALUES ${deliveryValues}) AS v(id, kg) WHERE t.delivery_id = v.id::integer`);
      const changedLedger = ledger.filter(({ row, qtyChange, newBalance }) => qtyChange !== row.qtyChange || newBalance !== row.newBalance);
      if (changedLedger.length) {
        const stockValues = Prisma.join(changedLedger.map(({ row, qtyChange, newBalance }) => Prisma.sql`(${row.transactionId}, ${qtyChange}, ${newBalance})`));
        await tx.$executeRaw(Prisma.sql`UPDATE public.stock_transactions AS t SET qty_change = v.qty::integer, new_balance = v.balance::integer FROM (VALUES ${stockValues}) AS v(id, qty, balance) WHERE t.transaction_id = v.id::integer`);
      }
      await tx.auditLog.createMany({ data: changes.map(({ order, lines }) => ({ action: 'UPDATE', target: `ClientOrder:${order.clientOrderId}`, details: `${SIMULATION_TAG} ${OPERATION} Developer rebalanced estimated training activity for ${order.orderNumber}. Before: ${JSON.stringify(order.items.map((item) => ({ productId: item.productId, quantity: item.quantity })))} After: ${JSON.stringify(lines.map((item) => ({ productId: item.productId, quantity: item.quantity })))}. Order, payment, delivery and stock quantities reconciled; this is not a real historical event.` })) });
      // These isolated training projects summarize their completed orders.
      for (const projectId of projectIds) {
        await tx.project.update({ where: { projectId }, data: { totalValue: changes.filter((change) => change.order.projectId === projectId).reduce((sum, change) => sum + change.totals.total, 0) } });
      }
    }
    return { applied: apply, orders: changes.length, monthlyPackages: monthly, min: Math.min(...monthly), max: Math.max(...monthly), currentStockPreserved: true, annualPurchasesPreserved: true };
  }, { isolationLevel: 'Serializable', timeout: 180000 });
}

async function main() {
  const manifestPath = process.argv[2];
  if (!manifestPath || manifestPath.startsWith('--')) throw new Error('Provide the original import-manifest.json path');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const db = connectDatabase();
  try {
    console.log('Dry run:', JSON.stringify(await varyHistory(db, manifest)));
    if (!process.argv.includes('--apply')) return;
    const backup = await backupDatabase(db);
    console.log('Verified backup:', backup.path);
    const result = await varyHistory(db, manifest, true);
    fs.writeFileSync(path.join(backup.path, 'history-variation.json'), JSON.stringify(result, null, 2), { mode: 0o600, flag: 'wx' });
    console.log(JSON.stringify(result));
  } finally { await db.$disconnect(); }
}
if (require.main === module) main().catch((error) => { console.error(error.code || error.message); process.exitCode = 1; });
module.exports = { allocate, varyHistory };
