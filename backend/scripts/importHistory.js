// Explicit opt-in only; never runs during application startup or deployment.
const fs = require('fs');
const path = require('path');
const { connectDatabase, backupDatabase } = require('./historyDatabase');
const { THORTEX_PRODUCTS, SIMULATION_TAG } = require('../src/utils/aiAnalytics');
const { buildHistoryPlan, validateHistoryPlan } = require('../src/utils/historyPlan');
const { calculateDeliveryPlan } = require('../src/utils/deliveryRules');

async function importHistory(db, plan) {
  validateHistoryPlan(plan);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(71942026)`;
    const existing = await tx.clientOrder.count({ where: { specialInstructions: { contains: SIMULATION_TAG } } });
    if (existing) throw new Error('This simulation already exists. No records were added. Verify it before rerunning.');
    const note = `${SIMULATION_TAG} Estimated training history, not verified company activity. Prices and quantities are illustrative. No real human performed these recorded events.`;
    const products = new Map();
    const category = await tx.productCategory.upsert({ where: { categoryName: 'Construction Chemicals' }, create: { categoryName: 'Construction Chemicals' }, update: {} });
    if (category.deletedAt) throw new Error('Construction Chemicals category is archived.');
    for (const product of THORTEX_PRODUCTS) {
      const itemName = `[SIMULATED] ${product.name}`;
      if (await tx.product.findFirst({ where: { itemName } })) throw new Error('Simulation products already exist; refusing duplicate import.');
      products.set(product.key, await tx.product.create({ data: {
        itemName, unit: product.unit, unitPrice: product.price, qtyOnHand: 0, categoryId: category.categoryId,
        lowStockThreshold: 0, shelfLifeDays: 180, createdAt: new Date(`${plan.from}T00:00:00Z`),
      } }));
    }
    const supplier = await tx.supplier.create({ data: { supplierName: '[SIMULATED] Annual Thortex supplier', address: note } });
    const clients = [];
    const projects = [];
    for (let index = 0; index < 3; index += 1) {
      const client = await tx.client.create({ data: { clientName: `[SIMULATED] Training customer ${index + 1}`, address: 'Simulated Metro Manila project; not a real customer', contactPerson: 'Simulated contact' } });
      clients.push(client);
      projects.push(await tx.project.create({ data: { projectName: `[SIMULATED] Maintenance project ${index + 1}`, clientId: client.clientId, status: 'COMPLETED', startDate: new Date(plan.from), totalValue: plan.orders.filter((order) => order.clientIndex === index).reduce((sum, order) => sum + order.total, 0), location: 'Simulated Metro Manila site' } }));
    }
    const stockEvents = [];
    const audits = [];
    const orderIds = [];
    const deliveryIds = [];
    const fileRows = [];
    const proof = (reference, kind, date) => {
      const filename = `${reference}-${kind}.txt`;
      const storageKey = `uploads/simulated-history/${filename}`;
      const data = Buffer.from(`${note}\nReference: ${reference}\nDocument: ${kind}\nEvent date: ${date.toISOString()}\nSIMULATED DOCUMENT ONLY. Not a receipt, bank proof, signature, or GPS record.\n`);
      fileRows.push({ storageKey, originalName: filename, mimeType: 'text/plain', sizeBytes: data.length, data, createdAt: date });
      return `/${storageKey}`;
    };
    for (const purchase of plan.purchases) {
      const order = await tx.supplierOrder.create({ data: {
        supplierId: supplier.supplierId, orderDate: purchase.orderedAt, status: 'RECEIVED',
        terms: 'Simulated annual procurement; prepaid', remarks: `${note} ${purchase.reference}`,
        subtotal: purchase.subtotal, vat: purchase.vat, total: purchase.total,
        approvedBy: 'SIMULATED Admin approval',
        items: { create: purchase.items.map((item) => ({ productId: products.get(item.key).productId, quantity: item.quantity, unitPrice: item.unitPrice })) },
      } });
      await tx.paymentTransaction.create({ data: { direction: 'OFFICE_TO_SUPPLIER', method: 'BANK_TRANSFER', status: 'PAID', amount: purchase.total, creditDays: 0, dueDate: purchase.paidAt, paidAt: purchase.paidAt, supplierId: supplier.supplierId, supplierOrderId: order.orderId, referenceNumber: purchase.reference, notes: note, createdAt: purchase.orderedAt, updatedAt: purchase.paidAt } });
      stockEvents.push({ at: purchase.receivedAt, items: purchase.items, sign: 1, reference: purchase.reference });
      audits.push({ timestamp: purchase.orderedAt, action: 'CREATE', target: `SupplierOrder:${order.orderId}`, details: `${note} Procurement: annual order submitted.` }, { timestamp: purchase.paidAt, action: 'VERIFY', target: `SupplierOrder:${order.orderId}`, details: `${note} Admin: supplier payment verified.` }, { timestamp: purchase.receivedAt, action: 'CONFIRM', target: `SupplierOrder:${order.orderId}`, details: `${note} Warehouse: all annual quantities received.` });
    }
    for (const planned of plan.orders) {
      const client = clients[planned.clientIndex];
      const order = await tx.clientOrder.create({ data: {
        orderNumber: planned.reference, clientId: client.clientId, projectId: projects[planned.clientIndex].projectId,
        subtotal: planned.subtotal, vat: planned.vat, total: planned.total,
        status: 'DELIVERED', paymentStatus: 'PAID', chequeVerification: 'VERIFIED',
        paymentProofUrl: proof(planned.reference, 'payment-proof', planned.proofAt),
        requirementsConfirmedAt: planned.coordinatedAt, coordinationNotes: `${note} Sales Agent: requirements confirmed.`,
        orderDate: planned.submittedAt, createdAt: planned.submittedAt, updatedAt: planned.receivedAt,
        specialInstructions: note,
        items: { create: planned.items.map((item) => ({ productId: products.get(item.key).productId, quantity: item.quantity, unitPrice: item.unitPrice })) },
      }, include: { items: true } });
      orderIds.push(order.clientOrderId);
      await tx.paymentTransaction.create({ data: {
        direction: 'CLIENT_TO_OFFICE', method: 'BANK_TRANSFER', status: 'PAID', amount: planned.total,
        creditDays: 0, dueDate: planned.paidAt, paidAt: planned.paidAt, clientId: client.clientId,
        clientOrderId: order.clientOrderId, referenceNumber: `${planned.reference}-PAY`, notes: note,
        createdAt: planned.proofAt, updatedAt: planned.paidAt,
      } });
      const load = calculateDeliveryPlan(planned.items.map((item) => ({ quantity: item.quantity, product: products.get(item.key) })));
      if (load.totalKg > 1000) throw new Error('Simulation exceeds single-truck capacity.');
      const delivery = await tx.delivery.create({ data: {
        drNumber: `DR-${planned.reference}`, clientOrderId: order.clientOrderId, status: 'DELIVERED',
        createdAt: planned.readyAt, loadedAt: planned.loadedAt, eta: planned.eta, receivedAt: planned.receivedAt,
        receiverName: 'SIMULATED site receiver', receivedBy: 'SIMULATED site receiver', receiverAddress: 'Simulated Metro Manila site',
        proofOfDeliveryUrl: proof(planned.reference, 'handover-proof', planned.receivedAt),
        itemsCount: order.items.length, loadKg: load.totalKg, batchNumber: 1, batchCount: 1,
        delayType: planned.delayAt ? 'TRAFFIC' : null,
        notes: `${note} Simulated sole driver (not linked to a real account). DELIVERY_STARTED_AT:${planned.departedAt.toISOString()}`,
        items: { create: order.items.map((item) => ({ orderItemId: item.itemId, quantity: item.quantity })) },
      } });
      deliveryIds.push(delivery.deliveryId);
      stockEvents.push({ at: planned.processedAt, items: planned.items, sign: -1, reference: planned.reference });
      const stages = [
        ['submittedAt', 'CREATE', 'Client: order submitted'], ['reviewedAt', 'UPDATE', 'Admin: order reviewed'],
        ['coordinatedAt', 'CONFIRM', 'Sales Agent: customer requirements confirmed'], ['approvedAt', 'APPROVE', 'Admin: order approved'],
        ['proofAt', 'UPDATE', 'Client: simulated payment evidence submitted'], ['paidAt', 'VERIFY', 'Admin: payment verified'],
        ['processedAt', 'UPDATE', 'Warehouse: processing started and stock issued'], ['readyAt', 'UPDATE', 'Warehouse: packed and ready for delivery'],
        ['loadedAt', 'CONFIRM', 'Warehouse: vehicle loaded'], ['departedAt', 'UPDATE', 'Driver: delivery began'],
        ...(planned.delayAt ? [['delayAt', 'UPDATE', 'Driver: traffic delay reported; updated ETA recorded in simulation']] : []),
        ['receivedAt', 'CONFIRM', 'Driver: receiver and simulated POD recorded; delivery completed'],
        ['receivedAt', 'UPDATE', 'System: all batches delivered; order completed'],
      ];
      for (const [field, action, details] of stages) audits.push({ timestamp: planned[field], action, target: field === 'departedAt' || field === 'delayAt' || field === 'loadedAt' ? `Delivery:${delivery.deliveryId}` : `ClientOrder:${order.clientOrderId}`, details: `${note} ${planned.reference} ${details}` });
    }
    const balances = new Map(THORTEX_PRODUCTS.map((item) => [item.key, 0]));
    const transactions = [];
    for (const event of stockEvents.sort((a, b) => a.at - b.at)) for (const item of event.items) {
      const newBalance = balances.get(item.key) + event.sign * item.quantity;
      if (newBalance < 0) throw new Error('Negative historical stock balance.');
      balances.set(item.key, newBalance);
      transactions.push({ productId: products.get(item.key).productId, supplierId: event.sign > 0 ? supplier.supplierId : null, date: event.at, type: event.sign > 0 ? 'PURCHASE' : 'ISSUE', qtyChange: event.sign * item.quantity, newBalance, notes: `${note} ${event.reference}` });
    }
    if ([...balances.values()].some((value) => value !== 0)) throw new Error('Stock reconciliation failed.');
    await tx.stockTransaction.createMany({ data: transactions });
    await tx.auditLog.createMany({ data: audits });
    await tx.uploadedFile.createMany({ data: fileRows });
    return { tag: SIMULATION_TAG, ...validateHistoryPlan(plan), productIds: [...products.values()].map((product) => product.productId), clientIds: clients.map((client) => client.clientId), projectIds: projects.map((project) => project.projectId), supplierId: supplier.supplierId, orderIds, deliveryIds, payments: plan.orders.length + plan.purchases.length, stockTransactions: transactions.length, auditLogs: audits.length, documents: fileRows.length };
  }, { isolationLevel: 'Serializable', timeout: 300000, maxWait: 20000 });
}

async function main() {
  const plan = buildHistoryPlan();
  console.log('Plan:', JSON.stringify(validateHistoryPlan(plan)));
  if (!process.argv.includes('--apply')) { console.log('Dry run only. --apply creates a verified backup, then adds explicitly simulated records.'); return; }
  const db = connectDatabase();
  try {
    const backup = await backupDatabase(db);
    console.log('Verified backup:', backup.path);
    const result = await importHistory(db, plan);
    fs.writeFileSync(path.join(backup.path, 'import-manifest.json'), JSON.stringify(result, null, 2), { flag: 'wx', mode: 0o600 });
    console.log('Imported:', JSON.stringify({ ...result, orderIds: result.orderIds.length, deliveryIds: result.deliveryIds.length }));
  } finally { await db.$disconnect(); }
}
if (require.main === module) main().catch((error) => { console.error(error.code || error.message); process.exitCode = 1; });
module.exports = { importHistory };
