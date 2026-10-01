import { describe, expect, it } from 'vitest';
import { getAuditCalendarRange, getAuditDateRange } from '@/utils/auditDateRange';

describe('audit date ranges while typing', () => {
  it.each(['', '2', '2026', '2026-', '2026-0', '2026-13', '999999-01', '0000-01', 'not-a-date'])('does not throw or send invalid timestamps for %s', (input) => {
    expect(getAuditDateRange(input)).toEqual({});
  });
  it('uses complete calendar-month boundaries including leap days', () => {
    expect(getAuditDateRange('2024-02')).toEqual({
      dateFrom: new Date(2024, 1, 1).toISOString(),
      dateTo: new Date(2024, 2, 1, 0, 0, 0, -1).toISOString(),
    });
  });
  it('ignores invalid day selections', () => {
    expect(getAuditDateRange('', new Date('invalid'))).toEqual({});
  });
  it('includes the full final day in a custom calendar range', () => {
    expect(getAuditCalendarRange(new Date(2026, 0, 3), new Date(2026, 2, 5))).toEqual({
      dateFrom: new Date(2026, 0, 3).toISOString(),
      dateTo: new Date(2026, 2, 5, 23, 59, 59, 999).toISOString(),
    });
    expect(getAuditCalendarRange(new Date('invalid'))).toEqual({});
    expect(getAuditCalendarRange(new Date(2026, 2, 5), new Date(2026, 0, 3))).toEqual({});
  });
});
