const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateOrderTotals,
  canTransitionOrderForRoles,
  deriveOrderStatusFromDeliveries,
  splitItemsIntoDeliveryBatches,
} = require('../utils/orderWorkflow');
const {
  calculateDeliveryPlan,
  summarizeTruckLoad,
} = require('../utils/deliveryRules');

test('server totals use authoritative line prices and 12% VAT', () => {
  assert.deepEqual(
    calculateOrderTotals([
      { quantity: 2, unitPrice: 100 },
      { quantity: 3, unitPrice: 10.25 },
    ]),
    { subtotal: 230.75, vat: 27.69, total: 258.44 },
  );
});

test('admin approves or rejects pending orders only', () => {
  assert.equal(canTransitionOrderForRoles(['ADMIN'], 'PENDING', 'APPROVED'), true);
  assert.equal(canTransitionOrderForRoles(['ADMIN'], 'APPROVED', 'PROCESSING'), false);
  assert.equal(canTransitionOrderForRoles(['ADMIN'], 'PROCESSING', 'SHIPPED'), false);
});

test('warehouse owns processing and ready-for-delivery transitions', () => {
  assert.equal(canTransitionOrderForRoles(['WAREHOUSE_STAFF'], 'APPROVED', 'PROCESSING'), true);
  assert.equal(canTransitionOrderForRoles(['WAREHOUSE_STAFF'], 'PROCESSING', 'SHIPPED'), true);
  assert.equal(canTransitionOrderForRoles(['SALES_AGENT'], 'APPROVED', 'PROCESSING'), false);
  assert.equal(canTransitionOrderForRoles(['ADMIN', 'WAREHOUSE_STAFF'], 'APPROVED', 'PROCESSING'), true);
});

test('an order is delivered only after every delivery batch is delivered', () => {
  assert.equal(
    deriveOrderStatusFromDeliveries([{ status: 'DELIVERED' }, { status: 'IN_TRANSIT' }]),
    'SHIPPED',
  );
  assert.equal(
    deriveOrderStatusFromDeliveries([{ status: 'DELIVERED' }, { status: 'DELIVERED' }]),
    'DELIVERED',
  );
});

test('delivery batches store exact non-duplicated item quantities', () => {
  const batches = splitItemsIntoDeliveryBatches(
    [{ itemId: 11, quantity: 5 }, { itemId: 12, quantity: 2 }],
    3,
  );
  assert.deepEqual(batches, [
    [{ orderItemId: 11, quantity: 2 }, { orderItemId: 12, quantity: 1 }],
    [{ orderItemId: 11, quantity: 2 }, { orderItemId: 12, quantity: 1 }],
    [{ orderItemId: 11, quantity: 1 }],
  ]);
});

test('internal delivery planning uses the single company truck and splits oversized loads', () => {
  const smallOrder = calculateDeliveryPlan([
    { quantity: 1, product: { itemName: 'Epoxy', unit: 'unit' } },
  ]);
  assert.equal(smallOrder.method, 'TRUCK');
  assert.equal(smallOrder.batchCount, 1);

  const oversizedOrder = calculateDeliveryPlan([
    { quantity: 50, product: { itemName: 'Industrial paint', unit: 'pail' } },
  ]);
  assert.equal(oversizedOrder.method, 'TRUCK');
  assert.ok(oversizedOrder.batchCount > 1);
});

test('truck manifest combines different loaded deliveries within capacity', () => {
  assert.deepEqual(
    summarizeTruckLoad([{ loadKg: 80 }, { loadKg: 200 }]),
    {
      deliveryCount: 2,
      totalKg: 280,
      remainingKg: 720,
      exceedsCapacity: false,
    },
  );
  assert.equal(
    summarizeTruckLoad([{ loadKg: 800 }, { loadKg: 250 }]).exceedsCapacity,
    true,
  );
});
