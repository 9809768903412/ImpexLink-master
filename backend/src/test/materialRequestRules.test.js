const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildMaterialRequestScope,
  canReviewAsProjectManager,
  canReviewAsPresident,
  canFulfillMaterialRequest,
  isMaterialRequestTransitionAllowed,
} = require('../utils/materialRequestRules');

test('Admin can view the complete material request history', () => {
  assert.deepEqual(buildMaterialRequestScope(['ADMIN'], 10), {});
});

test('material request visibility is isolated by role', () => {
  assert.deepEqual(buildMaterialRequestScope(['PROJECT_MANAGER'], 10), { assignedProjectManagerId: 10 });
  assert.deepEqual(buildMaterialRequestScope(['ENGINEER'], 20), { requestedBy: 20 });
  assert.deepEqual(buildMaterialRequestScope(['PRESIDENT'], 30), {
    status: { in: ['PM_APPROVED', 'APPROVED', 'REJECTED', 'FULFILLED'] },
  });
  assert.deepEqual(buildMaterialRequestScope(['WAREHOUSE_STAFF'], 40), {
    status: { in: ['APPROVED', 'FULFILLED'] },
  });
});

test('material request actions follow the approval stages', () => {
  assert.equal(canReviewAsProjectManager(['PROJECT_MANAGER'], 10, { assignedProjectManagerId: 10 }), true);
  assert.equal(canReviewAsProjectManager(['PROJECT_MANAGER'], 11, { assignedProjectManagerId: 10 }), false);
  assert.equal(canReviewAsPresident(['PRESIDENT']), true);
  assert.equal(canReviewAsPresident(['PROJECT_MANAGER']), false);
  assert.equal(canFulfillMaterialRequest(['WAREHOUSE_STAFF']), true);
  assert.equal(canFulfillMaterialRequest(['PRESIDENT']), false);
});

test('material requests cannot skip or reverse workflow stages', () => {
  assert.equal(isMaterialRequestTransitionAllowed('PENDING', 'PM_APPROVED'), true);
  assert.equal(isMaterialRequestTransitionAllowed('PM_APPROVED', 'APPROVED'), true);
  assert.equal(isMaterialRequestTransitionAllowed('APPROVED', 'FULFILLED'), true);
  assert.equal(isMaterialRequestTransitionAllowed('PENDING', 'APPROVED'), false);
  assert.equal(isMaterialRequestTransitionAllowed('FULFILLED', 'PENDING'), false);
  assert.equal(isMaterialRequestTransitionAllowed('REJECTED', 'APPROVED'), false);
});
