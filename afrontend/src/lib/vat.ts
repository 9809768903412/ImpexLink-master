export const VAT_RATE = (() => {
  const raw = Number(import.meta.env.VITE_VAT_RATE ?? 0.12);
  if (Number.isFinite(raw) && raw >= 0) return raw;
  return 0.12;
})();

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export const calcLineAmounts = (quantity: number, unitPrice: number) => {
  const net = roundMoney(quantity * unitPrice);
  const vat = roundMoney(net * VAT_RATE);
  const total = roundMoney(net + vat);
  return { net, vat, total };
};

export const calcTotalsFromItems = (items: { quantity: number; unitPrice: number }[]) => {
  return items.reduce(
    (acc, item) => {
      const line = calcLineAmounts(item.quantity, item.unitPrice);
      return {
        net: roundMoney(acc.net + line.net),
        vat: roundMoney(acc.vat + line.vat),
        total: roundMoney(acc.total + line.total),
      };
    },
    { net: 0, vat: 0, total: 0 }
  );
};
