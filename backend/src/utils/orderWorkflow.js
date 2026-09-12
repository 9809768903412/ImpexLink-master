const VAT_RATE = 0.12;

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function calculateOrderTotals(items) {
  return items.reduce(
    (totals, item) => {
      const net = roundMoney(Number(item.unitPrice) * Number(item.quantity));
      const vat = roundMoney(net * VAT_RATE);
      return {
        subtotal: roundMoney(totals.subtotal + net),
        vat: roundMoney(totals.vat + vat),
        total: roundMoney(totals.total + net + vat),
      };
    },
    { subtotal: 0, vat: 0, total: 0 },
  );
}

function canTransitionOrderForRoles(roles, currentStatus, requestedStatus) {
  if (!requestedStatus || requestedStatus === currentStatus) return true;
  const normalizedRoles = roles.map((role) => String(role).toUpperCase());

  if (
    normalizedRoles.includes('ADMIN') &&
    currentStatus === 'PENDING' &&
    ['APPROVED', 'CANCELLED'].includes(requestedStatus)
  ) {
    return true;
  }

  if (
    normalizedRoles.includes('WAREHOUSE_STAFF') &&
    ((currentStatus === 'APPROVED' && requestedStatus === 'PROCESSING') ||
      (currentStatus === 'PROCESSING' && requestedStatus === 'SHIPPED'))
  ) {
    return true;
  }

  return false;
}

function deriveOrderStatusFromDeliveries(deliveries) {
  const active = deliveries.filter((delivery) => !delivery.deletedAt);
  if (active.length > 0 && active.every((delivery) => delivery.status === 'DELIVERED')) {
    return 'DELIVERED';
  }
  return 'SHIPPED';
}

function splitItemsIntoDeliveryBatches(items, batchCount) {
  const count = Math.max(1, Number(batchCount) || 1);
  const batches = Array.from({ length: count }, () => []);
  for (const item of items) {
    const quantity = Number(item.quantity) || 0;
    const base = Math.floor(quantity / count);
    const remainder = quantity % count;
    for (let index = 0; index < count; index += 1) {
      const batchQuantity = base + (index < remainder ? 1 : 0);
      if (batchQuantity > 0) {
        batches[index].push({ orderItemId: item.itemId, quantity: batchQuantity });
      }
    }
  }
  return batches;
}

module.exports = {
  calculateOrderTotals,
  canTransitionOrderForRoles,
  deriveOrderStatusFromDeliveries,
  splitItemsIntoDeliveryBatches,
};
