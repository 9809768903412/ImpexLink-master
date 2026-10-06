import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { canViewNotifications, deliveryRoleCanOpenPath } from '@/lib/roles';
import { useTableDateRange } from '@/components/TableDateRangeFilter';

describe('system compliance', () => {
  it('does not redirect a delivery user away from notifications while retaining admin restrictions', () => {
    expect(deliveryRoleCanOpenPath('/admin/notifications')).toBe(true);
    expect(deliveryRoleCanOpenPath('/admin/messages')).toBe(true);
    expect(deliveryRoleCanOpenPath('/admin/inventory')).toBe(false);
    expect(deliveryRoleCanOpenPath('/admin/logistics')).toBe(false);
    expect(deliveryRoleCanOpenPath('/logistics')).toBe(true);
  });
  it('supports open-ended From/To ranges without silently treating the start as the end', () => {
    const { result } = renderHook(useTableDateRange);
    act(() => result.current.setRange({ from: new Date(2026, 8, 1) }));
    expect(result.current.dateTo).toBeUndefined();
    expect(result.current.matches('2026-10-01')).toBe(true);
    act(() => result.current.setRange({ from: undefined, to: new Date(2026, 8, 30) }));
    expect(result.current.dateFrom).toBeUndefined();
    expect(result.current.matches('2026-08-01')).toBe(true);
    expect(result.current.matches('2026-10-01')).toBe(false);
  });
  it('allows warehouse and delivery roles to access their notification module', () => {
    expect(canViewNotifications('warehouse_staff')).toBe(true);
    expect(canViewNotifications('delivery_guy')).toBe(true);
    expect(canViewNotifications('driver')).toBe(true);
    expect(canViewNotifications('client')).toBe(false);
    expect(canViewNotifications('receiver')).toBe(false);
    expect(canViewNotifications(undefined)).toBe(false);
  });
  it('filters table data over inclusive local calendar days and retains export metadata', () => {
    const { result } = renderHook(useTableDateRange);
    expect(result.current.matches(undefined)).toBe(true);
    act(() => result.current.setRange({ from: new Date(2026, 8, 1), to: new Date(2026, 8, 30) }));
    expect(result.current.matches('2026-09-01')).toBe(true);
    expect(result.current.matches('2026-09-30')).toBe(true);
    expect(result.current.matches('2026-10-01')).toBe(false);
    expect(result.current.matches(undefined)).toBe(false);
    expect(result.current.filters).toEqual([{ label: 'From date', value: '2026-09-01' }, { label: 'To date', value: '2026-09-30' }]);
    act(() => result.current.setRange(undefined));
    expect(result.current.matches('2026-10-01')).toBe(true);
  });
});
