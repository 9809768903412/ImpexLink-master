const MATERIAL_REQUEST_VIEW_ROLES = [
  'ADMIN',
  'PRESIDENT',
  'PROJECT_MANAGER',
  'ENGINEER',
  'PAINT_CHEMIST',
  'WAREHOUSE_STAFF',
];

function normalizeRoles(roles = []) {
  return roles.map((role) => String(role).toUpperCase());
}

function hasAnyRole(roles, allowed) {
  const normalized = normalizeRoles(roles);
  return allowed.some((role) => normalized.includes(role));
}

function buildMaterialRequestScope(roles, userId) {
  const normalized = normalizeRoles(roles);
  if (normalized.includes('ADMIN')) return {};

  const scopes = [];
  if (normalized.includes('PRESIDENT')) {
    scopes.push({ status: { in: ['PM_APPROVED', 'APPROVED', 'REJECTED', 'FULFILLED'] } });
  }
  if (normalized.includes('PROJECT_MANAGER')) {
    scopes.push({ assignedProjectManagerId: userId });
  }
  if (normalized.includes('ENGINEER') || normalized.includes('PAINT_CHEMIST')) {
    scopes.push({ requestedBy: userId });
  }
  if (normalized.includes('WAREHOUSE_STAFF')) {
    scopes.push({ status: { in: ['APPROVED', 'FULFILLED'] } });
  }

  if (scopes.length === 0) return { requestId: -1 };
  return scopes.length === 1 ? scopes[0] : { OR: scopes };
}

function canReviewAsProjectManager(roles, userId, request) {
  return hasAnyRole(roles, ['ADMIN']) || (
    hasAnyRole(roles, ['PROJECT_MANAGER']) &&
    Number(request?.assignedProjectManagerId) === Number(userId)
  );
}

function canReviewAsPresident(roles) {
  return hasAnyRole(roles, ['ADMIN', 'PRESIDENT']);
}

function canFulfillMaterialRequest(roles) {
  return hasAnyRole(roles, ['ADMIN', 'WAREHOUSE_STAFF']);
}

function isMaterialRequestTransitionAllowed(currentStatus, nextStatus) {
  if (currentStatus === nextStatus) return true;
  const transitions = {
    PENDING: ['PM_APPROVED', 'REJECTED'],
    PM_APPROVED: ['APPROVED', 'REJECTED'],
    APPROVED: ['FULFILLED'],
    REJECTED: [],
    FULFILLED: [],
  };
  return (transitions[currentStatus] || []).includes(nextStatus);
}

module.exports = {
  MATERIAL_REQUEST_VIEW_ROLES,
  buildMaterialRequestScope,
  canReviewAsProjectManager,
  canReviewAsPresident,
  canFulfillMaterialRequest,
  isMaterialRequestTransitionAllowed,
};
