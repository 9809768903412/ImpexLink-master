export function formatPesoAmount(value: number | null | undefined, fractionDigits = 2) {
  return Number(value || 0).toLocaleString('en-PH', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}
