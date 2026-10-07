import { expect, it } from 'vitest';
import { matchesReportRow } from '@/utils/reportFilters';

it('combines column matches and numeric bounds on report values', () => {
  const criteria = [
    { column: 0, operator: 'equals' as const, value: 'Delivered' },
    { column: 1, operator: 'gte' as const, value: '1000' },
    { column: 1, operator: 'lte' as const, value: '2000' },
  ];
  expect(matchesReportRow(['delivered', '1,500.00'], criteria)).toBe(true);
  expect(matchesReportRow(['not delivered', '1,500.00'], criteria)).toBe(false);
  expect(matchesReportRow(['delivered', '500'], criteria)).toBe(false);
  expect(matchesReportRow(['delivered', 'unknown'], criteria)).toBe(false);
  expect(matchesReportRow(['delivered', ''], criteria)).toBe(false);
  expect(matchesReportRow(['Project A'], [{ column: 0, operator: 'contains', value: 'project' }])).toBe(true);
  expect(matchesReportRow(['Project A'], [{ column: 0, operator: 'equals', value: '' }])).toBe(true);
});
