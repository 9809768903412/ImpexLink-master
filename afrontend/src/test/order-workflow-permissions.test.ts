import { describe, expect, it } from 'vitest';
import { canManageClientOrders, canViewClientOrders } from '@/lib/roles';

describe('order workflow role isolation', () => {
  it('allows assigned coordination roles to view orders', () => {
    expect(canViewClientOrders('admin')).toBe(true);
    expect(canViewClientOrders('sales_agent')).toBe(true);
    expect(canViewClientOrders('warehouse_staff')).toBe(true);
  });

  it('allows only admin and warehouse to mutate order workflow stages', () => {
    expect(canManageClientOrders('admin')).toBe(true);
    expect(canManageClientOrders('warehouse_staff')).toBe(true);
    expect(canManageClientOrders('sales_agent')).toBe(false);
    expect(canManageClientOrders('client')).toBe(false);
  });
});
