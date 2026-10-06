const test = require('node:test');
const assert = require('node:assert/strict');
const { allocate, varyHistory } = require('../../scripts/varyHistory');
const { buildHistoryPlan } = require('../utils/historyPlan');
const { THORTEX_PRODUCTS, SIMULATION_TAG } = require('../utils/aiAnalytics');

test('monthly allocation keeps exact annual totals, positive integer lines and deterministic peaks', () => {
  const weights = [0.45, 0.7, 1.25, 0.85, 1.6, 0.55, 0.95, 1.4, 0.75, 1.15, 1.8, 0.6];
  const values = allocate(200, weights);
  assert.equal(values.reduce((a, b) => a + b, 0), 200);
  assert.ok(values.every((value) => Number.isInteger(value) && value >= 1));
  assert.ok(values[10] > values[0] * 2);
  assert.deepEqual(allocate(200, weights), values);
  assert.throws(() => allocate(3, weights));
});

function fixture() {
  const plan = buildHistoryPlan(new Date('2026-10-07T00:00:00Z'));
  const products = THORTEX_PRODUCTS.map((product, index) => ({ ...product, productId: index + 52, qtyOnHand: 20, itemName: `[SIMULATED] ${product.name}` }));
  const stock = [];
  const orders = plan.orders.map((order, index) => {
    const items = order.items.map((item, line) => ({ ...item, itemId: index * 3 + line + 1, productId: products.find((product) => product.key === item.key).productId, product: products.find((product) => product.key === item.key) }));
    return { ...order, clientOrderId: index + 1, orderNumber: order.reference, createdAt: order.submittedAt, updatedAt: order.receivedAt, specialInstructions: SIMULATION_TAG, status: 'DELIVERED', projectId: index % 3 + 1, items, payments: [{ paymentId: index + 1, amount: order.total, updatedAt: order.paidAt }], deliveries: [{ deliveryId: index + 1, status: 'DELIVERED', items: items.map((item) => ({ deliveryItemId: item.itemId, orderItemId: item.itemId, quantity: item.quantity })) }] };
  });
  const events = [...plan.purchases.map((purchase) => ({ date: purchase.receivedAt, lines: purchase.items, sign: 1, reference: purchase.reference })), ...plan.orders.map((order) => ({ date: order.processedAt, lines: order.items, sign: -1, reference: order.reference }))].sort((a, b) => a.date - b.date);
  const balances = new Map();
  for (const event of events) for (const item of event.lines) {
    const productId = products.find((product) => product.key === item.key).productId;
    const qtyChange = event.sign * item.quantity;
    const newBalance = (balances.get(productId) || 0) + qtyChange;
    balances.set(productId, newBalance);
    stock.push({ transactionId: stock.length + 1, productId, qtyChange, newBalance, type: event.sign === 1 ? 'PURCHASE' : 'ISSUE', notes: `${SIMULATION_TAG} ${event.reference}`, date: event.date });
  }
  products.forEach((product) => stock.push({ transactionId: stock.length + 1, productId: product.productId, qtyChange: 20, newBalance: 20, type: 'ADJUSTMENT', date: new Date('2026-10-02'), notes: 'stock addition' }));
  const writes = [];
  const audits = [];
  const update = async (input) => { writes.push(input); };
  const db = { $executeRaw: async (query) => { if (query.sql?.startsWith('UPDATE')) writes.push({ sql: query.sql, values: query.values }); return 1; }, auditLog: { count: async () => audits.length, createMany: async ({ data }) => audits.push(...data) }, product: { findMany: async () => products }, clientOrder: { findMany: async () => orders, update, count: async () => 0 }, stockTransaction: { findMany: async () => stock, update }, clientOrderItem: { update }, deliveryItem: { update }, paymentTransaction: { update }, delivery: { update }, project: { update } };
  db.$transaction = async (callback) => callback(db);
  return { db, orders, stock, writes, audits, manifest: { tag: SIMULATION_TAG, orderIds: orders.map((order) => order.clientOrderId), productIds: products.map((product) => product.productId), projectIds: [1, 2, 3] } };
}

test('variation dry run reconciles stock and monthly variation without writes', async () => {
  const state = fixture();
  const result = await varyHistory(state.db, state.manifest);
  assert.equal(result.applied, false);
  assert.ok(result.max > result.min * 2);
  assert.equal(state.writes.length, 0);
  assert.equal(state.audits.length, 0);
});
test('variation apply reconciles all linked entities and records maintenance provenance', async () => {
  const state = fixture();
  const result = await varyHistory(state.db, state.manifest, true);
  assert.equal(result.applied, true);
  assert.equal(state.audits.length, 96);
  assert.ok(state.audits.every((audit) => audit.details.includes(SIMULATION_TAG)));
  assert.ok(state.writes.some((write) => write.data?.totalValue));
  assert.ok(state.writes.some((write) => write.sql?.includes('public.stock_transactions') && write.values.some((value) => value < 0)));
  assert.equal(state.writes.filter((write) => write.sql).length, 6);
  await assert.rejects(() => varyHistory(state.db, state.manifest, true), /already applied/);
});
test('unexpected live order or mismatched ledger aborts before writes', async () => {
  const state = fixture();
  state.orders[0].specialInstructions = 'Real customer order';
  await assert.rejects(() => varyHistory(state.db, state.manifest, true), /non-training/);
  assert.equal(state.writes.length, 0);
  const badLedger = fixture();
  badLedger.stock.find((row) => row.type === 'ISSUE').qtyChange -= 1;
  await assert.rejects(() => varyHistory(badLedger.db, badLedger.manifest, true), /stock issue does not reconcile/);
  assert.equal(badLedger.writes.length, 0);
});
