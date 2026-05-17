import type { UserRole } from '@/types';

type RoleInput = UserRole | UserRole[] | undefined;

const normalizeRoles = (role?: RoleInput) =>
  Array.isArray(role) ? role : role ? [role] : [];

export const hasRole = (role: RoleInput, target: UserRole) =>
  normalizeRoles(role).includes(target);

export const ROLE_LABELS: Record<UserRole, string> = {
  president: 'President',
  admin: 'Admin',
  project_manager: 'Project Manager',
  sales_agent: 'Sales Agent',
  engineer: 'Engineer',
  paint_chemist: 'Paint Chemist',
  warehouse_staff: 'Warehouse Staff',
  delivery_guy: 'Delivery Guy',
  client: 'Client',
};

export const ADMIN_AREA_ROLES: UserRole[] = [
  'president',
  'admin',
  'project_manager',
  'sales_agent',
  'engineer',
  'paint_chemist',
  'warehouse_staff',
  'delivery_guy',
];

export const isPresident = (role?: RoleInput) => hasRole(role, 'president');
export const isAdmin = (role?: RoleInput) => hasRole(role, 'admin');
export const isClient = (role?: RoleInput) => hasRole(role, 'client');

export const canManageUsers = (role?: RoleInput) => hasRole(role, 'admin');

export const canAccessSettings = (role?: RoleInput) => {
  const roles = normalizeRoles(role);
  return roles.length > 0 && !roles.includes('client');
};

export const canViewCompanySettings = (role?: RoleInput) =>
  normalizeRoles(role).some((r) => ['admin', 'president'].includes(r));

export const canViewInventory = (role?: RoleInput) =>
  normalizeRoles(role).some((r) => ['admin', 'warehouse_staff', 'engineer', 'paint_chemist'].includes(r));

export const canManageInventory = (role?: RoleInput) =>
  normalizeRoles(role).some((r) => ['admin', 'warehouse_staff'].includes(r));

export const canViewProjects = (role?: RoleInput) =>
  normalizeRoles(role).some((r) => ['admin', 'project_manager', 'president', 'engineer'].includes(r));

export const canViewMaterialRequests = (role?: RoleInput) =>
  normalizeRoles(role).some((r) =>
    ['admin', 'project_manager', 'president', 'engineer', 'warehouse_staff'].includes(r)
  );

export const canCreateMaterialRequests = (role?: RoleInput) =>
  normalizeRoles(role).some((r) => ['engineer'].includes(r));

export const canApproveMaterialRequests = (role?: RoleInput) =>
  normalizeRoles(role).some((r) => ['project_manager', 'president'].includes(r));

export const canViewClientOrders = (role?: RoleInput) =>
  normalizeRoles(role).some((r) => ['admin', 'sales_agent', 'warehouse_staff'].includes(r));

export const canManageClientOrders = (role?: RoleInput) =>
  normalizeRoles(role).some((r) => ['admin', 'sales_agent', 'warehouse_staff'].includes(r));

export const canViewPurchaseOrders = (role?: RoleInput) => hasRole(role, 'admin');

export const canViewSuppliers = (role?: RoleInput) =>
  normalizeRoles(role).some((r) => ['admin', 'warehouse_staff'].includes(r));

export const canViewLogistics = (role?: RoleInput) =>
  normalizeRoles(role).some((r) => ['admin', 'warehouse_staff', 'delivery_guy'].includes(r));

export const canManageLogistics = (role?: RoleInput) =>
  normalizeRoles(role).some((r) => ['admin', 'delivery_guy', 'warehouse_staff'].includes(r));

export const canViewReports = (role?: RoleInput) =>
  normalizeRoles(role).some((r) => ['admin', 'president'].includes(r));
export const canViewAIInsights = (role?: RoleInput) =>
  normalizeRoles(role).some((r) => ['admin', 'president'].includes(r));
export const canViewAuditLogs = (role?: RoleInput) =>
  normalizeRoles(role).some((r) => ['admin', 'president'].includes(r));

export const canViewProofCenter = (role?: RoleInput) =>
  normalizeRoles(role).some((r) => ['admin', 'president', 'warehouse_staff', 'sales_agent'].includes(r));

export const canViewNotifications = (role?: RoleInput) => {
  const roles = normalizeRoles(role);
  return roles.length > 0 && !roles.includes('client') && !roles.includes('delivery_guy');
};
