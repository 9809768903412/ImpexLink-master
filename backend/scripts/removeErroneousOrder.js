// Explicit, one-order maintenance operation. Never run automatically.
const assert = require('assert/strict');
const { connectDatabase, backupDatabase } = require('./historyDatabase');
const orderNumber = 'ORD-2025-8296';
const db = connectDatabase();
async function main() {
  assert.equal(process.argv[2], '--apply', 'Explicit --apply required');
  const backup = await backupDatabase(db);
  console.log('Verified backup:', backup.path);
  const result = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(71942026)`;
    const order = await tx.clientOrder.findUnique({ where: { orderNumber }, include: { items: true, deliveries: true, payments: true } });
    assert.ok(order && order.clientOrderId === 10 && !order.deletedAt, 'Exact active order not found');
    assert.equal(order.status, 'APPROVED');
    assert.equal(order.deliveries.length, 0, 'Order has deliveries; refusing');
    assert.equal(order.payments.length, 0, 'Order has payments; refusing');
    assert.deepEqual(order.items.map(i => [i.productId, i.quantity]).sort((a,b)=>a[0]-b[0]), [[8,3],[11,5],[28,90]]);
    const originals = [];
    for (const item of order.items) {
      const ledger = await tx.stockTransaction.findMany({ where: { productId: item.productId }, orderBy: [{ date: 'asc' }, { transactionId: 'asc' }] });
      const issues = ledger.filter(row => row.type === 'ISSUE' && row.notes?.trim() === `Order ${orderNumber}`);
      assert.equal(issues.length, 1, 'Issue match is ambiguous');
      const issue = issues[0];
      assert.equal(issue.qtyChange, -item.quantity);
      const product = await tx.product.findUnique({ where: { productId: item.productId } });
      assert.ok(ledger.length && product);
      assert.equal(ledger.at(-1).newBalance, product.qtyOnHand, 'Latest stock balance does not reconcile');
      originals.push({ issue, productId: item.productId, previousStock: product.qtyOnHand });
      let offset = 0;
      for (const row of ledger) {
        if (row.transactionId === issue.transactionId) offset = item.quantity;
        const balance = row.newBalance + offset;
        assert.ok(balance >= 0);
        if (row.transactionId === issue.transactionId) {
          await tx.stockTransaction.update({ where: { transactionId: row.transactionId }, data: { type: 'ADJUSTMENT', qtyChange: 0, newBalance: balance, notes: `Voided erroneous stock issue for ${orderNumber}; original quantity ${row.qtyChange}. See removal audit log.` } });
        } else if (balance !== row.newBalance) {
          await tx.stockTransaction.update({ where: { transactionId: row.transactionId }, data: { newBalance: balance } });
        }
      }
      await tx.product.update({ where: { productId: item.productId }, data: { qtyOnHand: product.qtyOnHand + item.quantity } });
    }
    await tx.clientOrder.update({ where: { clientOrderId: order.clientOrderId }, data: { deletedAt: new Date() } });
    await tx.auditLog.create({ data: { action: 'DELETE', target: `ClientOrder:${order.clientOrderId}`, details: `User-requested recoverable removal of erroneous ${orderNumber}. No deliveries or payments. Original ISSUE entries voided to zero ADJUSTMENT; later ledger balances recalculated and stock restored. Original records: ${JSON.stringify(originals)}. Backup: ${backup.path}. Restoring order alone does not reinstate voided issues.` } });
    return { removed: orderNumber, restored: order.items.map(i=>({ productId:i.productId, quantity:i.quantity })) };
  }, { isolationLevel: 'Serializable', timeout: 180000 });
  console.log(JSON.stringify(result));
}
main().catch(error => { console.error('Removal failed:', error.code || error.name, error.code ? '' : error.message); process.exitCode = 1; }).finally(()=>db.$disconnect());
