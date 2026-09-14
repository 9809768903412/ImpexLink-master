import { describe, expect, it } from 'vitest';
import {
  canApproveMaterialRequests,
  canCreateMaterialRequests,
  canFulfillMaterialRequests,
  canViewMaterialRequests,
} from '@/lib/roles';

describe('Material request permissions', () => {
  it('shows the module only to workflow participants', () => {
    for (const role of ['admin', 'president', 'project_manager', 'engineer', 'paint_chemist', 'warehouse_staff'] as const) {
      expect(canViewMaterialRequests(role)).toBe(true);
    }
    expect(canViewMaterialRequests('sales_agent')).toBe(false);
    expect(canViewMaterialRequests('client')).toBe(false);
    expect(canViewMaterialRequests('driver')).toBe(false);
  });

  it('separates creation, approval, and fulfillment capabilities', () => {
    expect(canCreateMaterialRequests('engineer')).toBe(true);
    expect(canCreateMaterialRequests('paint_chemist')).toBe(true);
    expect(canCreateMaterialRequests('president')).toBe(false);

    expect(canApproveMaterialRequests('project_manager')).toBe(true);
    expect(canApproveMaterialRequests('president')).toBe(true);
    expect(canApproveMaterialRequests('warehouse_staff')).toBe(false);

    expect(canFulfillMaterialRequests('warehouse_staff')).toBe(true);
    expect(canFulfillMaterialRequests('admin')).toBe(true);
    expect(canFulfillMaterialRequests('president')).toBe(false);
  });
});
