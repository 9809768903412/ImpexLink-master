const test = require('node:test');
const assert = require('node:assert/strict');
const { addStock, OPERATION } = require('../../scripts/addHistoryStock');
const { THORTEX_PRODUCTS, SIMULATION_TAG } = require('../utils/aiAnalytics');

function fixture() {
  const products = THORTEX_PRODUCTS.map((item, index) => ({ productId: index + 52, itemName: `[SIMULATED] ${item.name}`, qtyOnHand: index, lowStockThreshold: 0 }));
  const transactions = [];
  const audits = [];
  const db = {
    $executeRaw: async () => 1,
    product: {
      findMany: async () => products.map((row) => ({ ...row })),
      update: async ({ where, data }) => Object.assign(products.find((row) => row.productId === where.productId), data),
    },
    stockTransaction: {
      findFirst: async () => ({ notes: SIMULATION_TAG }),
      count: async () => transactions.length,
      create: async ({ data }) => { transactions.push(data); },
    },
    auditLog: { create: async ({ data }) => { audits.push(data); } },
    $transaction: async (callback) => callback(db),
  };
  return { db, products, transactions, audits, manifest: { tag: SIMULATION_TAG, productIds: products.map((row) => row.productId) } };
}
test('stock adjustment adds twenty instead of overwriting balances and records each delta', async () => {
  const state = fixture();
  const result = await addStock(state.db, state.manifest);
  assert.equal(result.length, 9);
  result.forEach((item, index) => assert.equal(item.after, index + 20));
  assert.equal(state.audits.length, 9);
  assert.equal(state.transactions.length, 9);
  assert.ok(state.transactions.every((row) => row.type === 'ADJUSTMENT' && row.qtyChange === 20 && row.notes.includes(OPERATION)));
});
test('rerunning the same operation cannot silently double stock', async () => {
  const state = fixture();
  await addStock(state.db, state.manifest);
  await assert.rejects(() => addStock(state.db, state.manifest), /already ran/);
  assert.equal(state.transactions.length, 9);
});
test('unexpected product targets are rejected before any writes', async () => {
  const state = fixture();
  state.products[0].itemName = 'Unrelated existing product';
  await assert.rejects(() => addStock(state.db, state.manifest), /approved packaged catalog/);
  assert.equal(state.transactions.length, 0);
  assert.equal(state.audits.length, 0);
});
