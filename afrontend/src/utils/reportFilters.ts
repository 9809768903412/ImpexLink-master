export type ReportCriterion = { column: number; operator: 'contains' | 'equals' | 'gte' | 'lte' | 'between'; value: string; upper?: string; kind?: 'number' | 'date' | 'text' };
export function matchesReportRow(row: Array<string | number>, criteria: ReportCriterion[]) {
  return criteria.every(({ column, operator, value, upper, kind }) => {
    if (!value.trim() && !upper?.trim()) return true;
    const cell = String(row[column] ?? '').trim().toLowerCase();
    const query = value.trim().toLowerCase();
    if (operator === 'contains') return cell.includes(query);
    if (operator === 'equals' && !kind) return cell === query;
    if (operator === 'equals' && kind === 'text') return cell === query;
    const numeric = (text: string) => text.replace(/,/g, '').replace(/^(php|₱)\s*/i, '');
    const parse = (text: string) => {
      if (kind !== 'date') return numeric(text) ? Number(numeric(text)) : NaN;
      if (/^\d{4}-\d{2}-\d{2}/.test(text)) return Date.parse(`${text.slice(0, 10)}T00:00:00Z`);
      const date = new Date(text);
      return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    };
    const a = parse(cell), b = query ? parse(query) : undefined, c = upper?.trim() ? parse(upper.trim()) : undefined;
    if (!Number.isFinite(a) || (b !== undefined && !Number.isFinite(b)) || (c !== undefined && !Number.isFinite(c))) return false;
    if (operator === 'equals') return a === b;
    if (operator === 'gte') return b !== undefined && a >= b;
    if (operator === 'lte') return b !== undefined && a <= b;
    return (b === undefined || a >= b) && (c === undefined || a <= c);
  });
}
