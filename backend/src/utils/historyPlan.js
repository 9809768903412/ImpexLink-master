const { THORTEX_PRODUCTS, SIMULATION_TAG } = require('./aiAnalytics');
const { calculateOrderTotals } = require('./orderWorkflow');

function buildHistoryPlan(now = new Date()) {
  // The previous 24 complete calendar months; no future workflow events.
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 24, 1));
  const orders = [];
  const purchases = [];
  for (let month = 0; month < 24; month += 1) {
    for (let stop = 0; stop < 4; stop += 1) {
      const index = month * 4 + stop;
      const date = (day, hour = 1) => new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + month, day, hour));
      const submittedAt = date(3 + stop * 6);
      const items = Array.from({ length: 3 }, (_, line) => {
        const product = THORTEX_PRODUCTS[(index * 2 + line) % THORTEX_PRODUCTS.length];
        // Deterministic training activity: quiet months, project peaks and a modest
        // second-year increase. No fabricated values are added by the chart.
        const seasonal = [0.45, 0.7, 1.25, 0.85, 1.6, 0.55, 0.95, 1.4, 0.75, 1.15, 1.8, 0.6][month % 12];
        const projectPeak = month === 7 || month === 18 ? 1.7 : 1;
        const quantity = Math.max(1, Math.round((1 + (month * 7 + stop * 3 + line * 5) % 9) * seasonal * projectPeak * (month >= 12 ? 1.15 : 1)));
        return { key: product.key, quantity, unitPrice: product.price };
      });
      orders.push({
        reference: `SIM-H1-${submittedAt.toISOString().slice(0, 7).replace('-', '')}-${stop + 1}`,
        month, clientIndex: index % 3, items,
        ...calculateOrderTotals(items),
        submittedAt, reviewedAt: date(3 + stop * 6, 3), coordinatedAt: date(3 + stop * 6, 4),
        approvedAt: date(3 + stop * 6, 5), proofAt: date(4 + stop * 6), paidAt: date(4 + stop * 6, 3),
        processedAt: date(4 + stop * 6, 4), readyAt: date(5 + stop * 6),
        loadedAt: date(6 + stop * 6), departedAt: date(6 + stop * 6, 2),
        eta: date(6 + stop * 6, 6), delayAt: index % 8 === 0 ? date(6 + stop * 6, 5) : null,
        receivedAt: date(6 + stop * 6, index % 8 === 0 ? 7 : 5),
      });
    }
  }
  for (let year = 0; year < 2; year += 1) {
    const annualOrders = orders.filter((order) => Math.floor(order.month / 12) === year);
    const items = THORTEX_PRODUCTS.map((product) => ({
      key: product.key,
      quantity: annualOrders.reduce((sum, order) => sum + order.items.filter((item) => item.key === product.key).reduce((total, item) => total + item.quantity, 0), 0),
      unitPrice: Math.round(product.price * 0.65),
    }));
    purchases.push({
      reference: `SIM-H1-ANNUAL-${year + 1}`,
      orderedAt: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + year * 12, 1, 0)),
      paidAt: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + year * 12, 1, 1)),
      receivedAt: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + year * 12, 2, 1)),
      items, ...calculateOrderTotals(items),
    });
  }
  return { tag: SIMULATION_TAG, from: start.toISOString().slice(0, 10), to: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)).toISOString().slice(0, 10), orders, purchases };
}

function validateHistoryPlan(plan) {
  const balance = new Map(THORTEX_PRODUCTS.map((item) => [item.key, 0]));
  const events = [
    ...plan.purchases.map((order) => ({ at: order.receivedAt, items: order.items, direction: 1 })),
    ...plan.orders.map((order) => ({ at: order.processedAt, items: order.items, direction: -1 })),
  ].sort((a, b) => a.at - b.at);
  for (const event of events) for (const item of event.items) {
    const next = balance.get(item.key) + event.direction * item.quantity;
    if (next < 0) throw new Error('Estimated stock would become negative.');
    balance.set(item.key, next);
  }
  if ([...balance.values()].some((quantity) => quantity !== 0)) throw new Error('Historical purchases and issues do not reconcile.');
  for (const order of plan.orders) {
    const dates = [order.submittedAt, order.reviewedAt, order.coordinatedAt, order.approvedAt, order.proofAt, order.paidAt, order.processedAt, order.readyAt, order.loadedAt, order.departedAt, order.receivedAt];
    if (dates.some((date, index) => index && date < dates[index - 1])) throw new Error('Invalid workflow chronology.');
    if (JSON.stringify(calculateOrderTotals(order.items)) !== JSON.stringify({ subtotal: order.subtotal, vat: order.vat, total: order.total })) throw new Error('Order totals do not reconcile.');
  }
  return { months: 24, orders: plan.orders.length, supplierOrders: plan.purchases.length, stockIssues: plan.orders.reduce((sum, order) => sum + order.items.length, 0), from: plan.from, to: plan.to };
}
module.exports = { buildHistoryPlan, validateHistoryPlan };
