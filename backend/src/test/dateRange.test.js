const test = require('node:test');
const assert = require('node:assert/strict');
const { dateRangeWhere } = require('../utils/dateRange');

test('date range creates inclusive database bounds before pagination', () => {
  const from = '2026-09-01T00:00:00+08:00';
  const to = '2026-09-30T23:59:59.999+08:00';
  assert.deepEqual(dateRangeWhere({ dateFrom: from, dateTo: to }, 'createdAt'), { createdAt: { gte: new Date(from), lte: new Date(to) } });
  assert.deepEqual(dateRangeWhere({}, 'createdAt'), {});
  assert.deepEqual(dateRangeWhere({ dateFrom: from }, 'orderDate'), { orderDate: { gte: new Date(from) } });
});
test('date filter rejects invalid and reversed ranges with HTTP 400', () => {
  assert.throws(() => dateRangeWhere({ dateFrom: 'invalid' }, 'createdAt'), { status: 400 });
  assert.throws(() => dateRangeWhere({ dateFrom: '2026-10-01', dateTo: '2026-09-01' }, 'createdAt'), { status: 400 });
});
