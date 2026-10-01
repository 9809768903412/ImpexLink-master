// Manual categorization of the nine explicitly imported SKUs; no stock changes.
const fs = require('fs');
const assert = require('assert/strict');
const { connectDatabase, backupDatabase } = require('./historyDatabase');
const { resolveTargets } = require('./addHistoryStock');

async function categorizeProducts(db, manifest) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(71942026)`;
    const products = await resolveTargets(tx, manifest);
    const category = await tx.productCategory.findUnique({ where: { categoryName: 'Construction Chemicals' } });
    assert.ok(category && !category.deletedAt, 'Active Construction Chemicals category is required');
    let changed = 0;
    for (const product of products) {
      if (product.categoryId === category.categoryId) continue;
      await tx.product.update({ where: { productId: product.productId }, data: { categoryId: category.categoryId } });
      await tx.auditLog.create({ data: { action: 'UPDATE', target: `Product:${product.productId}`, details: `Categorized ${product.itemName} as Construction Chemicals (previous category ID: ${product.categoryId ?? 'none'}). Stock and prices unchanged.` } });
      changed++;
    }
    return { changed, category: category.categoryName };
  }, { isolationLevel: 'Serializable', timeout: 60000 });
}

async function main() {
  const manifestPath = process.argv.find((argument) => argument.endsWith('import-manifest.json'));
  assert.ok(manifestPath, 'Provide original import-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const db = connectDatabase();
  try {
    const targets = await resolveTargets(db, manifest);
    console.log('Targets:', targets.map(({ productId, itemName, categoryId }) => ({ productId, itemName, categoryId })));
    console.log('Categories:', await db.productCategory.findMany({ select: { categoryId: true, categoryName: true, deletedAt: true } }));
    if (!process.argv.includes('--apply')) return;
    console.log('Verified backup:', (await backupDatabase(db)).path);
    console.log('Result:', await categorizeProducts(db, manifest));
    const products = await db.product.findMany({ where: { productId: { in: manifest.productIds } }, include: { category: true } });
    assert.ok(products.every((product) => product.category?.categoryName === 'Construction Chemicals'));
    for (const before of targets) {
      const after = products.find((product) => product.productId === before.productId);
      assert.equal(after.qtyOnHand, before.qtyOnHand);
      assert.equal(after.unitPrice.toString(), before.unitPrice.toString());
    }
    console.log('Verified all nine categories; balances and prices preserved.');
  } finally { await db.$disconnect(); }
}
if (require.main === module) main().catch((error) => { console.error(error.code || error.message); process.exitCode = 1; });
module.exports = { categorizeProducts };
