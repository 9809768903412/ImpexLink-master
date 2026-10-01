// Presentation only: database provenance is retained by the backend.
// Never change object keys, source/filter values, IDs, or the stored records.
export function cleanDisplayPrefixes(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(/\[(?:SIMULATED(?::HISTORY-V1)?|STOCK-ADD:HISTORY-V1:\d{4}-\d{2}-\d{2}:\d+)\]\s*/g, '');
  if (Array.isArray(value)) return value.map(cleanDisplayPrefixes);
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cleanDisplayPrefixes(item)]));
  }
  return value;
}
