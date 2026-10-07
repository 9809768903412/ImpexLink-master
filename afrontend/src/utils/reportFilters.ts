export type ReportCriterion = { column: number; operator: 'contains' | 'equals' | 'gte' | 'lte'; value: string };
export function matchesReportRow(row: Array<string | number>, criteria: ReportCriterion[]) {
  return criteria.every(({ column, operator, value }) => {
    if (!value.trim()) return true;
    const cell = String(row[column] ?? '').trim().toLowerCase();
    const query = value.trim().toLowerCase();
    if (operator === 'contains') return cell.includes(query);
    if (operator === 'equals') return cell === query;
    const numeric = (text: string) => text.replace(/,/g, '').replace(/^(php|₱)\s*/i, '');
    if (!numeric(cell) || !numeric(query)) return false;
    const a = Number(numeric(cell)), b = Number(numeric(query));
    return Number.isFinite(a) && Number.isFinite(b) && (operator === 'gte' ? a >= b : a <= b);
  });
}
