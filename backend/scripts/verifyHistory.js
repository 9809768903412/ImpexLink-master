const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const assert = require('assert/strict');
const { connectDatabase, quoteIdentifier } = require('./historyDatabase');
const { SIMULATION_TAG, parseInsightFilters, buildUsageTrends } = require('../src/utils/aiAnalytics');

async function verify(db, backupPath) {
  const manifest = JSON.parse(fs.readFileSync(path.join(backupPath, 'manifest.json')));
  // Compare raw JSON strings so Decimal/bigint precision is never lost.
  for (const entry of manifest.tables) {
    const bytes = fs.readFileSync(path.join(backupPath, entry.filename));
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), entry.sha256, `Backup hash: ${entry.table}`);
    const raw = zlib.gunzipSync(bytes).toString();
    const originals = raw ? raw.split('\n') : [];
    const current = await db.$queryRawUnsafe(`SELECT row_to_json(t)::text AS row FROM public.${quoteIdentifier(entry.table)} t`);
    const currentRows = new Set(current.map((row) => row.row));
    assert.ok(originals.every((row) => currentRows.has(row)), `An original record changed in ${entry.table}`);
    if (['users', 'roles', 'user_roles'].includes(entry.table)) assert.equal(current.length, entry.count, 'Accounts must be untouched');
  }
  const orders = await db.clientOrder.findMany({ where: { specialInstructions: { contains: SIMULATION_TAG } }, include: { items: true, payments: true, deliveries: { include: { items: true } } } });
  assert.equal(orders.length, 96);
  for (const order of orders) {
    assert.equal(order.status, 'DELIVERED');
    assert.equal(order.paymentStatus, 'PAID');
    assert.equal(order.payments.length, 1);
    assert.equal(Number(order.payments[0].amount), Number(order.total));
    assert.equal(order.deliveries.length, 1);
    const delivery = order.deliveries[0];
    assert.equal(delivery.status, 'DELIVERED');
    assert.ok(delivery.receiverName && delivery.proofOfDeliveryUrl && delivery.loadedAt && delivery.receivedAt);
    assert.ok(delivery.createdAt <= delivery.loadedAt && delivery.loadedAt <= delivery.receivedAt);
    assert.ok(Number(delivery.loadKg) <= 1000);
    assert.equal(delivery.items.length, order.items.length);
    for (const item of order.items) assert.equal(delivery.items.find((line) => line.orderItemId === item.itemId)?.quantity, item.quantity);
    for (const url of [order.paymentProofUrl, delivery.proofOfDeliveryUrl]) assert.ok(await db.uploadedFile.findUnique({ where: { storageKey: url.slice(1) } }), 'Missing simulated evidence file');
  }
  const products = await db.product.findMany();
  const transactions = await db.stockTransaction.findMany({ orderBy: [{ date: 'asc' }, { transactionId: 'asc' }] });
  for (const product of products.filter((item) => item.itemName.startsWith('[SIMULATED]'))) {
    let balance = 0;
    for (const transaction of transactions.filter((row) => row.productId === product.productId)) {
      balance += transaction.qtyChange;
      assert.equal(transaction.newBalance, balance);
      assert.ok(balance >= 0);
    }
    assert.equal(balance, product.qtyOnHand);
  }
  const trends = buildUsageTrends(products, transactions, parseInsightFilters({ from: '2024-10-01', to: '2026-09-30', source: 'simulated' }));
  assert.equal(trends.dataCoverage.issueCount, 288);
  assert.equal(trends.dataCoverage.activeMonths, 24);
  // Exercise the actual read-only analysis handler with provider text disabled.
  // No production credentials/session tokens or write endpoints are involved.
  process.env.AI_PROVIDER = 'groq';
  process.env.GROQ_API_KEY = '';
  const router = require('../src/routes/ai');
  const handler = router.stack.find((layer) => layer.route?.path === '/analysis').route.stack[0].handle;
  let analysis;
  let failure;
  try {
    await handler({ query: { from: '2024-10-01', to: '2026-09-30', source: 'simulated', product: 'all' } }, { json: (value) => { analysis = value; }, status() { return this; } }, (error) => { failure = error; });
    if (failure) throw failure;
    assert.equal(analysis.dataCoverage.issueCount, 288);
    assert.equal(analysis.logisticsSnapshot.measuredDeliveries, 96);
    assert.equal(analysis.logisticsSnapshot.onTimeRate, 88);
    assert.deepEqual(analysis.usageTrends, trends.usageTrends);
  } finally { await require('../src/utils/prisma').$disconnect(); }
  return { originalRecordsPreserved: true, accountsUnchanged: true, orders: orders.length, ...trends.dataCoverage, simulatedUsage: trends.usageTrends.reduce((sum, row) => sum + row.totalUsage, 0) };
}
if (require.main === module) {
  if (!process.argv[2]) throw new Error('Provide the pre-import backup directory.');
  const db = connectDatabase();
  verify(db, path.resolve(process.argv[2])).then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error('Verification failed:', error.code || error.message); process.exitCode = 1; }).finally(() => db.$disconnect());
}
module.exports = { verify };
