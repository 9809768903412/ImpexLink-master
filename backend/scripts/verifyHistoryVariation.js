// Read-only post-update verification against the immediate pre-update backup.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const assert = require('assert/strict');
const { connectDatabase, quoteIdentifier } = require('./historyDatabase');
const { buildUsageTrends, parseInsightFilters } = require('../src/utils/aiAnalytics');

function readRows(directory, table) {
  const contents = zlib.gunzipSync(fs.readFileSync(path.join(directory, `${table}.ndjson.gz`))).toString();
  return contents ? contents.split('\n').map((line) => JSON.parse(line)) : [];
}
const stable = (row) => JSON.stringify(Object.fromEntries(Object.entries(row).sort(([a], [b]) => a.localeCompare(b))));

async function verify(db, backupPath, importManifest) {
  const beforeOrders = readRows(backupPath, 'client_orders').filter((row) => importManifest.orderIds.includes(row.client_order_id));
  const beforeItems = readRows(backupPath, 'client_order_items').filter((row) => importManifest.orderIds.includes(row.client_order_id));
  const scopes = {
    client_orders: { key: 'client_order_id', ids: importManifest.orderIds, fields: ['subtotal', 'vat', 'total'] },
    client_order_items: { key: 'item_id', ids: beforeItems.map((row) => row.item_id), fields: ['quantity'] },
    deliveries: { key: 'delivery_id', ids: importManifest.deliveryIds, fields: ['load_kg'] },
    delivery_items: { key: 'delivery_item_id', ids: readRows(backupPath, 'delivery_items').filter((row) => importManifest.deliveryIds.includes(row.delivery_id)).map((row) => row.delivery_item_id), fields: ['quantity'] },
    payment_transactions: { key: 'payment_id', ids: readRows(backupPath, 'payment_transactions').filter((row) => importManifest.orderIds.includes(row.client_order_id)).map((row) => row.payment_id), fields: ['amount'] },
    stock_transactions: { key: 'transaction_id', ids: readRows(backupPath, 'stock_transactions').filter((row) => importManifest.productIds.includes(row.product_id)).map((row) => row.transaction_id), fields: ['qty_change', 'new_balance'] },
    projects: { key: 'project_id', ids: importManifest.projectIds, fields: ['total_value'] },
    products: { key: 'product_id', ids: [], fields: [] },
    users: { key: 'user_id', ids: [], fields: [] },
    roles: { key: 'role_id', ids: [], fields: [] },
    user_roles: { key: 'user_role_id', ids: [], fields: [] },
    order_items: { key: 'item_id', ids: [], fields: [] },
    orders: { key: 'order_id', ids: [], fields: [] },
    suppliers: { key: 'supplier_id', ids: [], fields: [] },
    uploaded_files: { key: 'file_id', ids: [], fields: [] },
  };
  const results = [];
  for (const [table, scope] of Object.entries(scopes)) {
    const before = readRows(backupPath, table);
    const after = (await db.$queryRawUnsafe(`SELECT row_to_json(t)::text AS row FROM public.${quoteIdentifier(table)} t`)).map(({ row }) => JSON.parse(row));
    assert.equal(after.length, before.length, `${table}: record count changed`);
    const byId = new Map(after.map((row) => [row[scope.key], row]));
    // Some join tables use composite keys: compare whole rows when untouched.
    if (before.length && before[0][scope.key] === undefined) {
      assert.deepEqual(after.map(stable).sort(), before.map(stable).sort(), `${table}: unrelated records changed`);
    } else for (const row of before) {
      const current = byId.get(row[scope.key]);
      assert.ok(current, `${table}: missing record`);
      const fields = scope.ids.includes(row[scope.key]) ? scope.fields : [];
      const omit = (value) => Object.fromEntries(Object.entries(value).filter(([key]) => !fields.includes(key)));
      assert.equal(stable(omit(current)), stable(omit(row)), `${table}: unexpected field change`);
    }
    results.push({ table, records: before.length, scopedFieldsVerified: true });
  }
  const oldAudits = readRows(backupPath, 'audit_logs');
  const currentAudits = (await db.$queryRawUnsafe('SELECT row_to_json(t)::text AS row FROM public.audit_logs t')).map(({ row }) => JSON.parse(row));
  const auditKey = Object.keys(oldAudits[0] || {}).find((key) => key.endsWith('_id') && key !== 'user_id');
  for (const row of oldAudits) assert.ok(currentAudits.some((current) => current[auditKey] === row[auditKey] && stable(current) === stable(row)), 'Original audit changed');
  const maintenance = currentAudits.filter((row) => row.details?.includes('[HISTORY-VARIATION:V1]'));
  assert.equal(maintenance.length, 96, 'Expected 96 maintenance audit entries');
  const orders = await db.clientOrder.findMany({ where: { clientOrderId: { in: importManifest.orderIds } }, include: { items: true, payments: true, deliveries: { include: { items: true } } }, orderBy: { createdAt: 'asc' } });
  const monthly = {};
  for (const order of orders) {
    assert.equal(Number(order.total), Number(order.payments[0].amount), 'Payment amount mismatch');
    assert.equal(Number(order.total), Number(order.subtotal) + Number(order.vat), 'Order total mismatch');
    for (const item of order.items) assert.equal(item.quantity, order.deliveries[0].items.find((line) => line.orderItemId === item.itemId).quantity, 'Delivery quantity mismatch');
    const month = order.createdAt.toISOString().slice(0, 7);
    monthly[month] = (monthly[month] || 0) + order.items.reduce((sum, item) => sum + item.quantity, 0);
  }
  assert.equal(orders.length, beforeOrders.length);
  const issues = await db.stockTransaction.findMany({ where: { productId: { in: importManifest.productIds }, type: 'ISSUE' }, include: { product: true } });
  const products = await db.product.findMany({ where: { productId: { in: importManifest.productIds } } });
  const trend = buildUsageTrends(products, issues, parseInsightFilters({ from: importManifest.from, to: importManifest.to, source: 'simulated' }));
  for (const month of trend.usageTrends) assert.equal(month.totalUsage, monthly[month.key], 'Stock history and order quantities disagree');
  return { tables: results, maintenanceAudits: maintenance.length, monthlyPackages: monthly, databaseTrendMatchesOrders: true };
}
async function main() {
  const [backupPath, importPath] = process.argv.slice(2);
  assert.ok(backupPath && importPath, 'Provide backup directory and original import manifest');
  const db = connectDatabase();
  try { console.log(JSON.stringify(await verify(db, backupPath, JSON.parse(fs.readFileSync(importPath, 'utf8'))), null, 2)); }
  finally { await db.$disconnect(); }
}
if (require.main === module) main().catch((error) => { console.error(error.code || error.message); process.exitCode = 1; });
module.exports = { verify };
