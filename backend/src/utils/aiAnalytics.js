const SIMULATION_TAG = '[SIMULATED:HISTORY-V1]';
const THORTEX_PRODUCTS = [
  { key: 'epoxy-pie-3', name: 'Thortex Epoxy PIE (3 kgs)', unit: 'kit', price: 10000, aliases: ['Epoxy PIE (3 kgs)'], color: '#2563eb' },
  { key: 'epoxy-underwater-3', name: 'Thortex Epoxy Underwater (3 kgs)', unit: 'kit', price: 12000, aliases: ['Epoxy Underwater (3 kgs)'], color: '#dc2626' },
  { key: 'poly-tech-16', name: 'Thortex Poly-Tech CSM (16 ltrs)', unit: 'pail', price: 42800, aliases: ['Poly-tech CSM (16 ltrs)'], color: '#16a34a' },
  { key: 'seal-tech-20', name: 'Thortex Seal-Tech AW (20 ltrs)', unit: 'pail', price: 48500, aliases: ['Seal Tech AW 20 ltrs', 'Seal-tech AW (20 ltrs)'], color: '#f97316' },
  { key: 'seal-tech-5', name: 'Thortex Seal-Tech AW (5 ltrs)', unit: 'pail', price: 13550, aliases: ['Seal Tech AW 5 ltrs', 'Seal-tech AW (5 ltrs)'], color: '#7c3aed' },
  { key: 'metal-tech-2', name: 'Thortex Metal-Tech EG (2 kgs)', unit: 'kit', price: 16500, aliases: ['Metal Tech EG', 'Metal-tech EG (2 kgs)'], color: '#0f766e' },
  { key: 'metal-tech-1', name: 'Thortex Metal-Tech EG (1kg)', unit: 'kit', price: 8500, aliases: ['Metal-tech EG (1 kg)'], color: '#be185d' },
  { key: 'cerami-tech-eg-1', name: 'Thortex Cerami-Tech EG (1kg)', unit: 'kit', price: 16500, aliases: ['Ceramic Tech EG', 'Cerami-tech EG (1 kg)'], color: '#a16207' },
  { key: 'cerami-tech-fg-1', name: 'Thortex Cerami-Tech FG (1kg)', unit: 'kit', price: 16500, aliases: ['Ceramic Tech FG', 'Cerami-tech FG (1 kg)'], color: '#475569' },
];

const normalizeName = (name) => String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
function findThortexProduct(name) {
  const normalized = normalizeName(String(name).replace(/^\[SIMULATED\]\s*/i, ''));
  return THORTEX_PRODUCTS.find((item) => [item.name, ...item.aliases].some((alias) => normalizeName(alias) === normalized));
}
function isSimulated(record) {
  return [record.notes, record.specialInstructions, record.remarks].some((value) => String(value || '').includes(SIMULATION_TAG));
}
function matchesSource(record, source) {
  return source === 'all' || (source === 'simulated' ? isSimulated(record) : !isSimulated(record));
}
function parseInsightFilters(query = {}, now = new Date()) {
  const endDefault = now.toISOString().slice(0, 10);
  const startDefault = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 24, 1)).toISOString().slice(0, 10);
  const from = String(query.from || startDefault);
  const to = String(query.to || endDefault);
  for (const value of [from, to]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) {
      throw Object.assign(new Error('Choose valid start and end dates.'), { status: 400 });
    }
  }
  if (from > to || (new Date(to) - new Date(from)) / 86400000 > 3660) {
    throw Object.assign(new Error('Choose a date range of up to ten years with the start before the end.'), { status: 400 });
  }
  const source = String(query.source || 'all');
  const product = String(query.product || 'all');
  if (!['all', 'existing', 'simulated'].includes(source) || (product !== 'all' && !THORTEX_PRODUCTS.some((item) => item.key === product))) {
    throw Object.assign(new Error('Invalid insights filter.'), { status: 400 });
  }
  return { from, to, source, product };
}
function buildUsageTrends(products, transactions, filters) {
  const patternItems = THORTEX_PRODUCTS.filter((item) => filters.product === 'all' || item.key === filters.product);
  const byProductId = new Map(products.map((product) => [product.productId, findThortexProduct(product.itemName)]));
  const selectedKeys = new Set(patternItems.map((item) => item.key));
  const rows = [];
  const cursor = new Date(`${filters.from.slice(0, 7)}-01T00:00:00Z`);
  const lastMonth = filters.to.slice(0, 7);
  while (cursor.toISOString().slice(0, 7) <= lastMonth) {
    const key = cursor.toISOString().slice(0, 7);
    rows.push({ key, month: cursor.toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' }), totalUsage: 0, ...Object.fromEntries(patternItems.map((item) => [item.name, 0])) });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  const byMonth = new Map(rows.map((row) => [row.key, row]));
  const used = [];
  for (const transaction of transactions) {
    const day = new Date(transaction.date).toISOString().slice(0, 10);
    const item = byProductId.get(transaction.productId);
    // Adjustments and returns are not customer/material consumption.
    if (transaction.type !== 'ISSUE' || transaction.qtyChange >= 0 || !item || !selectedKeys.has(item.key) || day < filters.from || day > filters.to || !matchesSource(transaction, filters.source)) continue;
    const row = byMonth.get(day.slice(0, 7));
    row[item.name] += Math.abs(transaction.qtyChange);
    row.totalUsage += Math.abs(transaction.qtyChange);
    used.push(transaction);
  }
  const dates = used.map((transaction) => new Date(transaction.date).toISOString().slice(0, 10)).sort();
  return {
    patternItems: patternItems.map(({ key, name, color }) => ({ key, name, color })),
    productOptions: THORTEX_PRODUCTS.map(({ key, name, color }) => ({ key, name, color })),
    usageTrends: rows,
    dataCoverage: {
      ...filters, issueCount: used.length, simulatedIssueCount: used.filter(isSimulated).length,
      firstIssue: dates[0] || null, lastIssue: dates.at(-1) || null,
      activeMonths: new Set(dates.map((date) => date.slice(0, 7))).size,
      existingMeans: 'Existing records exclude this new simulated import; older seed/test records may still be included.',
    },
  };
}
function buildLogisticsSnapshot(deliveries, now = new Date()) {
  const active = deliveries.filter((delivery) => ['IN_TRANSIT', 'DELAYED'].includes(delivery.status));
  const eligible = deliveries.filter((delivery) => delivery.status === 'DELIVERED' && delivery.eta && delivery.receivedAt);
  const onTime = eligible.filter((delivery) => new Date(delivery.receivedAt) <= new Date(delivery.eta));
  const today = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  return {
    activeRoutes: active.length ? 1 : 0,
    stopsToday: deliveries.filter((delivery) => delivery.receivedAt && new Date(delivery.receivedAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }) === today).length,
    onTimeRate: eligible.length ? Math.round(onTime.length / eligible.length * 100) : null,
    measuredDeliveries: eligible.length,
    pendingDispatches: deliveries.filter((delivery) => delivery.status === 'PENDING').length,
    recommendation: active.length ? `${active.length} deliveries are on the company truck. Monitor delayed stops and ETA.` : 'No selected deliveries are currently in transit.',
    dispatches: active.map((delivery) => ({
      route: `${delivery.drNumber} - ${delivery.clientOrder?.client?.clientName || 'Client'}`,
      status: delivery.status === 'DELAYED' ? 'Delayed' : 'On Route',
      note: delivery.eta ? `ETA ${new Date(delivery.eta).toISOString()}` : 'ETA not scheduled',
    })),
  };
}
function lockAnalysisMetrics(ai, fallback) {
  // An LLM may provide advisory text, but database-calculated widgets stay authoritative.
  return {
    ...fallback,
    summary: fallback.summary,
    recommendations: Array.isArray(ai?.recommendations) && ai.recommendations.length
      ? ai.recommendations.slice(0, 3).map((item, index) => ({
          title: String(item.title || fallback.recommendations[index]?.title || 'Review'),
          message: String(item.message || ''),
          action: String(item.action || 'Review the supporting records.'),
          priority: ['low', 'medium', 'high', 'critical'].includes(item.priority) ? item.priority : 'medium',
        })) : fallback.recommendations,
  };
}
module.exports = { SIMULATION_TAG, THORTEX_PRODUCTS, findThortexProduct, isSimulated, matchesSource, parseInsightFilters, buildUsageTrends, buildLogisticsSnapshot, lockAnalysisMetrics };
