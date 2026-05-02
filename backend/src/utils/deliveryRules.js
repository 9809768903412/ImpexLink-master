const MAX_ITEM_QTY_PER_DELIVERY = 30;
const PAINT_CAN_KG = 16;
const TRUCK_MAX_PAINT_CANS = 20;
const TRUCK_MAX_KG = 320;
const MOTORCYCLE_MAX_KG = 20;

function isPaintItem(item) {
  const name = String(item?.product?.itemName || item?.itemName || '').toLowerCase();
  const category = String(item?.product?.category?.categoryName || item?.categoryName || '').toLowerCase();
  return category.includes('paint') || name.includes('paint') || name.includes('thinner') || name.includes('lacquer');
}

function estimateItemWeightKg(item) {
  if (isPaintItem(item)) return PAINT_CAN_KG;
  const unit = String(item?.product?.unit || item?.unit || '').toLowerCase();
  if (unit.includes('kg')) return 1;
  if (unit.includes('pail') || unit.includes('gallon') || unit.includes('can')) return PAINT_CAN_KG;
  if (unit.includes('roll')) return 20;
  if (unit.includes('unit')) return 25;
  if (unit.includes('bundle')) return 2;
  return 0.5;
}

function summarizeLoad(items = []) {
  return items.reduce(
    (acc, item) => {
      const quantity = Number(item.quantity || 0);
      const unitWeightKg = estimateItemWeightKg(item);
      const isPaint = isPaintItem(item);
      acc.totalPieces += quantity;
      acc.totalKg += quantity * unitWeightKg;
      acc.paintCans += isPaint ? quantity : 0;
      acc.maxLineQty = Math.max(acc.maxLineQty, quantity);
      return acc;
    },
    { totalPieces: 0, totalKg: 0, paintCans: 0, maxLineQty: 0 },
  );
}

function calculateDeliveryPlan(items = []) {
  const load = summarizeLoad(items);
  const batchCount = Math.max(
    1,
    Math.ceil(load.maxLineQty / MAX_ITEM_QTY_PER_DELIVERY),
    Math.ceil(load.paintCans / TRUCK_MAX_PAINT_CANS),
    Math.ceil(load.totalKg / TRUCK_MAX_KG),
  );
  const perBatchKg = load.totalKg / batchCount;
  const perBatchPaintCans = load.paintCans / batchCount;
  const method =
    perBatchKg <= MOTORCYCLE_MAX_KG && perBatchPaintCans <= 1
      ? 'MOTORCYCLE'
      : perBatchKg > TRUCK_MAX_KG || perBatchPaintCans > TRUCK_MAX_PAINT_CANS
      ? 'THIRD_PARTY'
      : 'TRUCK';

  const warnings = [];
  if (load.maxLineQty > MAX_ITEM_QTY_PER_DELIVERY) {
    warnings.push(`One or more items exceed ${MAX_ITEM_QTY_PER_DELIVERY} pcs per delivery.`);
  }
  if (load.paintCans > TRUCK_MAX_PAINT_CANS) {
    warnings.push(`Paint load exceeds ${TRUCK_MAX_PAINT_CANS} cans per truck delivery.`);
  }
  if (load.totalKg > TRUCK_MAX_KG) {
    warnings.push(`Estimated load exceeds ${TRUCK_MAX_KG}kg truck capacity.`);
  }
  if (method === 'THIRD_PARTY') {
    warnings.push('Third-party/Lalamove delivery is recommended for this load.');
  } else if (batchCount > 1) {
    warnings.push(`Order should be split into ${batchCount} delivery batches.`);
  }

  return {
    ...load,
    totalKg: Math.round(load.totalKg * 10) / 10,
    batchCount,
    method,
    warnings,
  };
}

module.exports = {
  MAX_ITEM_QTY_PER_DELIVERY,
  PAINT_CAN_KG,
  TRUCK_MAX_PAINT_CANS,
  TRUCK_MAX_KG,
  MOTORCYCLE_MAX_KG,
  calculateDeliveryPlan,
};
