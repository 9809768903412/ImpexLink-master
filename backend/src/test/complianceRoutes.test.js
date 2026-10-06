const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../utils/prisma');
const productRouter = require('../routes/products');
const orderRouter = require('../routes/clientOrders');

function handler(router, method) {
  const route = router.stack.find((layer) => layer.route?.path === '/' && layer.route.methods[method]).route;
  return route.stack.at(-1).handle;
}
function response() {
  return { code: 200, body: null, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
}
test('duplicate inventory names are checked server-side and return 409 without creating a product', async () => {
  const original = prisma.product.findFirst;
  let captured;
  prisma.product.findFirst = async (args) => { captured = args; return { productId: 52 }; };
  try {
    const res = response();
    await handler(productRouter, 'post')({ body: { itemName: '  Thortex Epoxy PIE (3 kgs)  ' } }, res, (err) => { throw err; });
    assert.equal(res.code, 409);
    assert.match(res.body.error, /already exists/);
    assert.deepEqual(captured.where.itemName, { equals: 'Thortex Epoxy PIE (3 kgs)', mode: 'insensitive' });
  } finally { prisma.product.findFirst = original; }
});
test('order listing applies the date range to both data and count before pagination', async () => {
  const originalFind = prisma.clientOrder.findMany;
  const originalCount = prisma.clientOrder.count;
  let findArgs, countArgs;
  prisma.clientOrder.findMany = async (args) => { findArgs = args; return []; };
  prisma.clientOrder.count = async (args) => { countArgs = args; return 0; };
  try {
    const query = { page: '2', pageSize: '10', dateFrom: '2026-09-01T00:00:00Z', dateTo: '2026-09-30T23:59:59.999Z' };
    const res = response();
    await handler(orderRouter, 'get')({ query, user: { role: 'ADMIN', roles: ['ADMIN'], userId: 1 } }, res, (err) => { throw err; });
    assert.equal(res.code, 200);
    assert.equal(findArgs.skip, 10);
    assert.deepEqual(findArgs.where, countArgs.where);
    assert.deepEqual(findArgs.where.AND[0], { createdAt: { gte: new Date(query.dateFrom), lte: new Date(query.dateTo) } });
  } finally { prisma.clientOrder.findMany = originalFind; prisma.clientOrder.count = originalCount; }
});
