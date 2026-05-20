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
  driver: 'Driver',
  receiver: 'Receiver',
  project_in_charge: 'Project In-charge',
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
  'driver',
  'receiver',
  'project_in_charge',
];

export const isPresident = (role?: RoleInput) => hasRole(role, 'president');
export const isAdmin = (role?: RoleInput) => hasRole(role, 'admin');
export const isClient = (role?: RoleInput) => hasRole(role, 'client');

export const canManageUsers = (role?: RoleInput) => hasRole(role, 'admin');

export const canAccessSettings = (role?: RoleInput) => {
  const roles = normalizeRoles(role);
  return roles.length > 0 && !roles.some((r) => ['client', 'warehouse_staff', 'driver', 'delivery_guy', 'receiver'].includes(r));
};

export const canViewCompanySettings = (role?: RoleInput) =>
  normalizeRoles(role).some((r) => ['admin', 'president'].includes(r));

export const canViewInventory = (role?: RoleInput) =>
  normalizeRoles(role).some((r) => ['admin', 'warehouse_staff', 'paint_chemist'].includes(r));

export const canManageInventory = (role?: RoleInput) =>
  normalizeRoles(role).some((r) => ['admin', 'warehouse_staff'].includes(r));

export const canViewProjects = (role?: RoleInput) =>
  normalizeRoles(role).some((r) => ['admin', 'project_manager', 'president', 'engineer', 'project_in_charge'].includes(r));

export const canViewMaterialRequests = (role?: RoleInput) =>
  normalizeRoles(role).some((r) =>
    ['admin', 'project_manager', 'engineer', 'paint_chemist'].includes(r)
  );

export const canCreateMaterialRequests = (role?: RoleInput) =>
  normalizeRoles(role).some((r) => ['engineer', 'paint_chemist'].includes(r));

export const canApproveMaterialRequests = (role?: RoleInput) =>
  normalizeRoles(role).some((r) => ['admin'].includes(r));

export const canViewClientOrders = (role?: RoleInput) =>
  normalizeRoles(role).some((r) => ['admin'].includes(r));

export const canManageClientOrders = (role?: RoleInput) =>
  normalizeRoles(role).some((r) => ['admin'].includes(r));

export const canViewPurchaseOrders = (role?: RoleInput) => hasRole(role, 'admin');

export const canViewSuppliers = (role?: RoleInput) => hasRole(role, 'admin');

export const canViewLogistics = (role?: RoleInput) =>
  normalizeRoles(role).some((r) => ['admin', 'warehouse_staff', 'driver'].includes(r));

export const canManageLogistics = (role?: RoleInput) =>
  normalizeRoles(role).some((r) => ['admin', 'warehouse_staff', 'driver'].includes(r));

export const canViewReports = (role?: RoleInput) =>
  normalizeRoles(role).some((r) => ['admin', 'president'].includes(r));
export const canViewPayments = (role?: RoleInput) =>
  normalizeRoles(role).some((r) => ['admin', 'president'].includes(r));
export const canViewAIInsights = (role?: RoleInput) =>
  normalizeRoles(role).some((r) => ['admin', 'president'].includes(r));
export const canViewAuditLogs = (role?: RoleInput) =>
  normalizeRoles(role).some((r) => ['admin', 'president'].includes(r));

export const canViewProofCenter = (role?: RoleInput) =>
  normalizeRoles(role).some((r) => ['admin', 'president', 'warehouse_staff'].includes(r));

export const canViewNotifications = (role?: RoleInput) => {
  const roles = normalizeRoles(role);
  return (
    roles.length > 0 &&
    !roles.some((r) => ['client', 'warehouse_staff', 'delivery_guy', 'driver', 'receiver'].includes(r))
  );
};

export const canViewMessages = (role?: RoleInput) => {
  const roles = normalizeRoles(role);
  return roles.length > 0 && !roles.some((r) => ['client', 'warehouse_staff', 'delivery_guy', 'driver', 'receiver'].includes(r));
};
