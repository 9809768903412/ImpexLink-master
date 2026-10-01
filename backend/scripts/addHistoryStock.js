// Manual, idempotent stock adjustment for the nine imported training SKUs only.
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { connectDatabase, backupDatabase } = require('./historyDatabase');
const { SIMULATION_TAG, THORTEX_PRODUCTS, findThortexProduct } = require('../src/utils/aiAnalytics');
const OPERATION = '[STOCK-ADD:HISTORY-V1:2026-10-02:20]';
const QUANTITY = 20;

async function resolveTargets(db, manifest) {
  assert.equal(manifest.tag, SIMULATION_TAG, 'Wrong import manifest');
  assert.equal(manifest.productIds.length, 9, 'Expected the nine imported products');
  const products = await db.product.findMany({ where: { productId: { in: manifest.productIds }, deletedAt: null }, orderBy: { productId: 'asc' } });
  assert.equal(products.length, 9, 'An imported product is missing or deleted');
  const keys = new Set();
  for (const product of products) {
    const catalog = findThortexProduct(product.itemName);
    assert.ok(catalog, 'Product no longer matches the approved packaged catalog');
    keys.add(catalog.key);
    assert.ok(await db.stockTransaction.findFirst({ where: { productId: product.productId, notes: { contains: SIMULATION_TAG } } }), 'Product lacks the original import provenance');
  }
  assert.deepEqual([...keys].sort(), THORTEX_PRODUCTS.map((item) => item.key).sort());
  return products;
}

async function addStock(db, manifest) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(71942026)`;
    assert.equal(await tx.stockTransaction.count({ where: { notes: { contains: OPERATION } } }), 0, 'This stock addition already ran; refusing to add another 20');
    const products = await resolveTargets(tx, manifest);
    const results = [];
    for (const product of products) {
      const newBalance = product.qtyOnHand + QUANTITY;
      const status = newBalance <= product.lowStockThreshold ? 'LOW_STOCK' : 'AVAILABLE';
      await tx.product.update({ where: { productId: product.productId }, data: { qtyOnHand: newBalance, status } });
      await tx.stockTransaction.create({ data: { productId: product.productId, type: 'ADJUSTMENT', qtyChange: QUANTITY, newBalance, notes: `${SIMULATION_TAG} ${OPERATION} User-approved sample stock addition of ${QUANTITY} packages. No supplier receipt or purchase payment is asserted.` } });
      await tx.auditLog.create({ data: { action: 'UPDATE', target: `Stock:${product.productId}`, details: `${SIMULATION_TAG} ${OPERATION} Requested adjustment +${QUANTITY} packages for ${product.itemName}; balance ${product.qtyOnHand} → ${newBalance}.` } });
      results.push({ productId: product.productId, name: findThortexProduct(product.itemName).name, before: product.qtyOnHand, added: QUANTITY, after: newBalance });
    }
    return results;
  }, { isolationLevel: 'Serializable', timeout: 60000 });
}

async function main() {
  const manifestPath = process.argv.find((argument) => argument.endsWith('import-manifest.json'));
  assert.ok(manifestPath, 'Provide the original import-manifest.json path');
  const manifest = JSON.parse(fs.readFileSync(path.resolve(manifestPath), 'utf8'));
  const db = connectDatabase();
  try {
    const targets = await resolveTargets(db, manifest);
    console.log('Targets:', JSON.stringify(targets.map((item) => ({ id: item.productId, name: findThortexProduct(item.itemName).name, before: item.qtyOnHand, added: QUANTITY }))));
    if (!process.argv.includes('--apply')) { console.log('Dry run only. Use --apply to back up and add stock.'); return; }
    const backup = await backupDatabase(db);
    console.log('Verified pre-stock backup:', backup.path);
    const results = await addStock(db, manifest);
    for (const item of results) {
      const product = await db.product.findUnique({ where: { productId: item.productId } });
      const transaction = await db.stockTransaction.findFirst({ where: { productId: item.productId, notes: { contains: OPERATION } } });
      assert.equal(product.qtyOnHand, item.after);
      assert.equal(transaction.qtyChange, QUANTITY);
      assert.equal(transaction.newBalance, item.after);
    }
    assert.equal(await db.stockTransaction.count({ where: { notes: { contains: OPERATION } } }), 9);
    assert.equal(await db.auditLog.count({ where: { details: { contains: OPERATION } } }), 9);
    fs.writeFileSync(path.join(backup.path, 'stock-addition.json'), JSON.stringify({ operation: OPERATION, verified: true, results }, null, 2), { mode: 0o600, flag: 'wx' });
    console.log('Verified stock addition:', JSON.stringify(results));
  } finally { await db.$disconnect(); }
}
if (require.main === module) main().catch((error) => { console.error(error.code || error.message); process.exitCode = 1; });
module.exports = { OPERATION, QUANTITY, resolveTargets, addStock };
