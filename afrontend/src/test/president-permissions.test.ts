import { describe, expect, it } from 'vitest';
import {
  canAccessSettings,
  canManageClientOrders,
  canManageInventory,
  canManageLogistics,
  canManageUsers,
  canViewAIInsights,
  canViewAuditLogs,
  canViewClientOrders,
  canViewInventory,
  canViewLogistics,
  canViewMaterialRequests,
  canViewMessages,
  canViewNotifications,
  canViewPayments,
  canViewProofCenter,
  canViewPurchaseOrders,
  canViewProjects,
  canViewReports,
  canViewSuppliers,
} from '@/lib/roles';

describe('President permissions', () => {
  it('can view the approved executive modules', () => {
    expect(canViewProjects('president')).toBe(true);
    expect(canViewPayments('president')).toBe(true);
    expect(canViewReports('president')).toBe(true);
    expect(canViewAIInsights('president')).toBe(true);
    expect(canViewAuditLogs('president')).toBe(true);
    expect(canViewProofCenter('president')).toBe(true);
    expect(canViewMessages('president')).toBe(true);
    expect(canViewNotifications('president')).toBe(true);
    expect(canAccessSettings('president')).toBe(true);
  });

  it('cannot access or manage operational modules', () => {
    expect(canViewInventory('president')).toBe(false);
    expect(canViewMaterialRequests('president')).toBe(false);
    expect(canViewClientOrders('president')).toBe(false);
    expect(canViewPurchaseOrders('president')).toBe(false);
    expect(canViewSuppliers('president')).toBe(false);
    expect(canViewLogistics('president')).toBe(false);
    expect(canManageUsers('president')).toBe(false);
    expect(canManageInventory('president')).toBe(false);
    expect(canManageClientOrders('president')).toBe(false);
    expect(canManageLogistics('president')).toBe(false);
  });
});
