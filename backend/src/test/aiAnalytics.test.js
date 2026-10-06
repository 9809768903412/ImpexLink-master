const test = require('node:test');
const assert = require('node:assert/strict');
const { THORTEX_PRODUCTS, SIMULATION_TAG, findThortexProduct, parseInsightFilters, buildUsageTrends, buildLogisticsSnapshot, lockAnalysisMetrics } = require('../utils/aiAnalytics');
const { buildHistoryPlan, validateHistoryPlan } = require('../utils/historyPlan');

test('nine packaged products map explicitly, without confusing sizes or rolls', () => {
  assert.equal(THORTEX_PRODUCTS.length, 9);
  for (const item of THORTEX_PRODUCTS) assert.equal(findThortexProduct(`[SIMULATED] ${item.name}`).key, item.key);
  assert.equal(findThortexProduct('Poly Tech CSM roll'), undefined);
  assert.notEqual(findThortexProduct('Thortex Metal-Tech EG (1kg)').key, findThortexProduct('Thortex Metal-Tech EG (2 kgs)').key);
});
test('trends use only recorded negative issues and honor all filters', () => {
  const product = THORTEX_PRODUCTS[0];
  const products = [{ productId: 1, itemName: product.name }];
  const base = { productId: 1, date: new Date('2026-01-04'), type: 'ISSUE', qtyChange: -3 };
  const transactions = [base, { ...base, qtyChange: -5, notes: SIMULATION_TAG }, { ...base, type: 'ADJUSTMENT', qtyChange: -999 }, { ...base, qtyChange: 20 }, { ...base, date: new Date('2025-12-31'), qtyChange: -99 }];
  const filters = parseInsightFilters({ from: '2026-01-01', to: '2026-02-28', source: 'existing' });
  const existing = buildUsageTrends(products, transactions, filters);
  assert.equal(existing.usageTrends[0].totalUsage, 3);
  assert.equal(existing.usageTrends[1].totalUsage, 0);
  assert.equal(existing.dataCoverage.issueCount, 1);
  assert.equal(buildUsageTrends(products, transactions, { ...filters, source: 'simulated' }).usageTrends[0].totalUsage, 5);
  assert.equal(buildUsageTrends(products, transactions, { ...filters, source: 'all', product: THORTEX_PRODUCTS[1].key }).dataCoverage.issueCount, 0);
});
test('invalid filter dates and sources are rejected', () => {
  for (const query of [{ from: '2026-02-30' }, { from: '2030-01-01', to: '2020-01-01' }, { source: 'real' }, { product: 'unknown' }]) assert.throws(() => parseInsightFilters(query), { status: 400 });
});
test('missing arrival dates cannot imply 100% on time; delayed deliveries share one truck', () => {
  assert.equal(buildLogisticsSnapshot([{ status: 'DELIVERED' }]).onTimeRate, null);
  const snapshot = buildLogisticsSnapshot([
    { status: 'DELIVERED', eta: '2026-01-01T12:00:00Z', receivedAt: '2026-01-01T10:00:00Z' },
    { status: 'DELIVERED', eta: '2026-01-02T12:00:00Z', receivedAt: '2026-01-02T13:00:00Z' },
    { status: 'DELIVERED' }, { status: 'IN_TRANSIT' }, { status: 'DELAYED' },
  ]);
  assert.equal(snapshot.onTimeRate, 50);
  assert.equal(snapshot.measuredDeliveries, 2);
  assert.equal(snapshot.activeRoutes, 1);
});
test('AI cannot override database-calculated widgets', () => {
  const fallback = { summary: 'Database facts', recommendations: [], usageTrends: [{ totalUsage: 10 }], logisticsSnapshot: { onTimeRate: 50 } };
  const result = lockAnalysisMetrics({ summary: 'Advice', usageTrends: [{ totalUsage: 999 }], logisticsSnapshot: { onTimeRate: 100 } }, fallback);
  assert.equal(result.summary, 'Database facts');
  assert.deepEqual(result.usageTrends, fallback.usageTrends);
  assert.equal(result.logisticsSnapshot.onTimeRate, 50);
});
test('two years of full-flow estimates reconcile annual supply, stock, money and sole-driver dates', () => {
  const now = new Date('2026-10-02T00:00:00Z');
  const plan = buildHistoryPlan(now);
  const summary = validateHistoryPlan(plan);
  const monthly = Array.from({ length: 24 }, (_, month) => plan.orders.filter((order) => order.month === month).reduce((sum, order) => sum + order.items.reduce((total, item) => total + item.quantity, 0), 0));
  assert.ok(new Set(monthly).size > 12, 'Training months should not repeat a flat total');
  assert.ok(monthly.some((value, index) => index > 0 && value < monthly[index - 1]), 'Include quieter months');
  assert.ok(monthly.some((value, index) => index > 0 && value > monthly[index - 1]), 'Include busier months');
  assert.deepEqual(summary, { months: 24, orders: 96, supplierOrders: 2, stockIssues: 288, from: '2024-10-01', to: '2026-09-30' });
  for (let index = 0; index < plan.orders.length; index += 1) {
    const order = plan.orders[index];
    assert.ok(order.receivedAt < now);
    if (index) assert.ok(order.loadedAt > plan.orders[index - 1].receivedAt, 'Single truck trips must not overlap');
    assert.equal(order.total, order.subtotal + order.vat);
  }
  plan.purchases[0].items[0].quantity -= 1;
  assert.throws(() => validateHistoryPlan(plan));
});
