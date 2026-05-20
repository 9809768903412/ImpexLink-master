const express = require('express');
const prisma = require('../utils/prisma');
const { parsePagination, buildPaginatedResponse, parseSort } = require('../utils/pagination');
const { requireAuth, requireRole, getRoleList } = require('../middleware/auth');
const { isPositiveInt, isValidDateString } = require('../utils/validate');

const router = express.Router();
router.use(requireAuth);

const DECISION_ROLES = ['ADMIN'];
const PROCUREMENT_ROLES = ['ADMIN'];

function hasRole(req, role) {
  return getRoleList(req.user).includes(String(role).toUpperCase());
}

function includeRequestRelations() {
  return {
    project: true,
    requester: true,
    approver: true,
    assignedProjectManager: true,
    items: {
      include: {
        product: {
          include: {
            category: true,
          },
        },
      },
    },
  };
}

function areAllPaintItems(request) {
  return Array.isArray(request?.items) && request.items.length > 0 && request.items.every(
    (item) => item.product?.category?.categoryName === 'Paint & Consumables'
  );
}

async function canAccessProject(req, projectId) {
  if (hasRole(req, 'ADMIN')) return true;
  if (!projectId) return false;
  const project = await prisma.project.findUnique({ where: { projectId: Number(projectId) } });
  if (!project) return false;
  if (hasRole(req, 'PROJECT_MANAGER')) {
    return project.assignedPmId === req.user.userId;
  }
  if (hasRole(req, 'ENGINEER') || hasRole(req, 'PAINT_CHEMIST')) {
    return true;
  }
  return false;
}

function canProjectManagerReview(req, request) {
  return hasRole(req, 'ADMIN');
}

function canPresidentReview(req) {
  return hasRole(req, 'ADMIN');
}

async function getUsersByRoles(roleNames = []) {
  const normalized = roleNames.map((role) => String(role).toUpperCase());
  return prisma.user.findMany({
    where: {
      deletedAt: null,
      status: 'ACTIVE',
      OR: [
        { role: { roleName: { in: normalized } } },
        { userRoles: { some: { role: { roleName: { in: normalized } } } } },
      ],
    },
    select: { userId: true },
  });
}

async function notifyUsers(users, notification) {
  const uniqueUserIds = [...new Set(users.map((user) => user.userId).filter(Boolean))];
  if (uniqueUserIds.length === 0) return;
  await prisma.notification.createMany({
    data: uniqueUserIds.map((userId) => ({
      userId,
      type: 'REQUEST_APPROVAL',
      title: notification.title,
      message: notification.message,
      link: notification.link || '/admin/requests',
    })),
  });
}

function getRequestScopeWhere(req) {
  const scopes = [];

  if (hasRole(req, 'ADMIN')) {
    scopes.push({ status: { in: ['APPROVED', 'FULFILLED'] } });
  }

  if (hasRole(req, 'PROJECT_MANAGER')) {
    scopes.push({ assignedProjectManagerId: req.user.userId });
  }

  if (hasRole(req, 'ENGINEER')) {
    scopes.push({ requestedBy: req.user.userId });
  }

  if (hasRole(req, 'PAINT_CHEMIST')) {
    scopes.push({ requestedBy: req.user.userId });
  }

  if (scopes.length === 0) {
    return { requestId: -1 };
  }

  return scopes.length === 1 ? scopes[0] : { OR: scopes };
}

function mapRequest(r) {
  return {
    id: r.requestId.toString(),
    requestNumber: r.requestNumber,
    projectId: r.projectId?.toString() || null,
    projectName: r.project?.projectName || 'Unknown',
    requestedBy: r.requester?.fullName || 'User',
    requestedById: r.requestedBy?.toString() || null,
    approvedBy: r.approver?.fullName || null,
    approvedById: r.approvedBy?.toString() || null,
    assignedProjectManagerId: r.assignedProjectManagerId?.toString() || null,
    assignedProjectManagerName: r.assignedProjectManager?.fullName || null,
    approvedAt: r.approvedAt ? r.approvedAt.toISOString() : null,
    date: r.requestDate.toISOString(),
    items: r.items.map((item) => ({
      itemId: item.productId?.toString() || '',
      itemName: item.product?.itemName || '',
      unit: item.product?.unit || '',
      quantity: item.quantity,
      unitPrice: item.product ? Number(item.product.unitPrice) : 0,
      amount: item.product ? Number(item.product.unitPrice) * item.quantity : 0,
      notes: item.notes || null,
    })),
    purpose: r.purpose || '',
    urgency: (r.urgency || 'NORMAL').toLowerCase(),
    status: r.status.toLowerCase(),
    estimatedCost: Number(r.estCost || 0),
    remarks: r.remarks || null,
  };
}

router.get('/', async (req, res, next) => {
  try {
    const roleList = getRoleList(req.user);
    const isClient = roleList.includes('CLIENT');
    const isAdmin = roleList.includes('ADMIN');
    const isProjectManager = roleList.includes('PROJECT_MANAGER');
    const isEngineer = roleList.includes('ENGINEER');
    const isPaintChemist = roleList.includes('PAINT_CHEMIST');

    if (isClient) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (!isAdmin && !isProjectManager && !isEngineer && !isPaintChemist) {
      return res.json([]);
    }
    const pagination = parsePagination(req.query);
    const q = req.query.q ? String(req.query.q) : '';
    const status = req.query.status ? String(req.query.status).toUpperCase() : '';
    const includeDeleted = req.query.includeDeleted === 'true';
    const onlyDeleted = req.query.onlyDeleted === 'true';
    const where = {
      AND: [
        getRequestScopeWhere(req),
        onlyDeleted ? { deletedAt: { not: null } } : includeDeleted ? {} : { deletedAt: null },
        q
          ? {
              OR: [
                { requestNumber: { contains: q, mode: 'insensitive' } },
                { project: { projectName: { contains: q, mode: 'insensitive' } } },
              ],
            }
          : {},
        status ? { status } : {},
      ],
    };
    const sort = parseSort(req.query, ['createdAt', 'status', 'urgency']);
    const orderBy = sort ? { [sort.sortBy]: sort.sortDir } : { createdAt: 'desc' };
    const [requests, total] = await Promise.all([
      prisma.materialRequest.findMany({
        include: includeRequestRelations(),
        where,
        skip: pagination ? (pagination.page - 1) * pagination.pageSize : undefined,
        take: pagination ? pagination.pageSize : undefined,
        orderBy,
      }),
      prisma.materialRequest.count({ where }),
    ]);

    const data = requests.map(mapRequest);

    if (pagination) {
      return res.json(buildPaginatedResponse(data, total, pagination.page, pagination.pageSize));
    }
    return res.json(data);
  } catch (err) {
    next(err);
  }
});

router.post('/', requireRole(['ENGINEER', 'PAINT_CHEMIST']), async (req, res, next) => {
  try {
    const { projectId, items, purpose, urgency } = req.body;
    const requestNumber = req.body.requestNumber || `REQ-${new Date().getFullYear()}-${Math.floor(Math.random() * 9000 + 1000)}`;
    if (!projectId || !isPositiveInt(projectId)) return res.status(400).json({ error: 'Project is required' });
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one item is required' });
    }
    if (urgency && !['LOW', 'NORMAL', 'HIGH', 'CRITICAL'].includes(String(urgency).toUpperCase())) {
      return res.status(400).json({ error: 'Invalid urgency level' });
    }
    if (!(await canAccessProject(req, projectId))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    let estCost = 0;
    let itemCreates = [];
    try {
      itemCreates = await Promise.all(
        items.map(async (item) => {
          if (Number(item.quantity || 0) <= 0) {
            throw new Error('Quantity must be greater than 0');
          }
          const product = await prisma.product.findUnique({
            where: { productId: Number(item.itemId || item.productId) },
            include: { category: true },
          });
          if (!product) {
            throw new Error('Invalid product');
          }
          if (hasRole(req, 'PAINT_CHEMIST') && product.category?.categoryName !== 'Paint & Consumables') {
            throw new Error('Paint Chemist requests are limited to paint and consumable items.');
          }
          estCost += Number(product.unitPrice) * Number(item.quantity || 0);
          return {
            productId: item.itemId ? Number(item.itemId) : Number(item.productId),
            quantity: Number(item.quantity || 0),
            notes: item.notes || null,
          };
        })
      );
    } catch (err) {
      return res.status(400).json({ error: err.message || 'Invalid items' });
    }

    const project = await prisma.project.findUnique({
      where: { projectId: Number(projectId) },
      select: { assignedPmId: true, assignedPm: { select: { userId: true } }, projectName: true },
    });

    const request = await prisma.materialRequest.create({
      data: {
        requestNumber,
        projectId: Number(projectId),
        requestedBy: req.user.userId,
        assignedProjectManagerId: project?.assignedPmId || null,
        urgency: urgency ? urgency.toUpperCase() : 'NORMAL',
        estCost,
        purpose: purpose || null,
        items: { create: itemCreates },
      },
      include: includeRequestRelations(),
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: 'CREATE',
        target: 'MaterialRequest',
        details: `Created request ${request.requestNumber}`,
      },
    });

    if (project?.assignedPm?.userId) {
      await notifyUsers([project.assignedPm], {
        title: 'Material request needs PM review',
        message: `${request.requestNumber} for ${project.projectName} is waiting for Project Manager review.`,
      });
    }

    res.status(201).json(mapRequest(request));
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireRole([...DECISION_ROLES, ...PROCUREMENT_ROLES]), async (req, res, next) => {
  try {
    const status = req.body.status ? req.body.status.toUpperCase() : undefined;
    if (status && !['PENDING', 'PM_APPROVED', 'APPROVED', 'REJECTED', 'FULFILLED'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    if (req.body.requestDate && !isValidDateString(req.body.requestDate)) {
      return res.status(400).json({ error: 'Invalid request date' });
    }

    const existing = await prisma.materialRequest.findUnique({
      where: { requestId: Number(req.params.id) },
      include: includeRequestRelations(),
    });
    if (!existing) {
      return res.status(404).json({ error: 'Request not found' });
    }
    const remarks = req.body.remarks || null;
    const isReject = status === 'REJECTED';
    const isPmApproval = status === 'PM_APPROVED';
    const isPresidentApproval = status === 'APPROVED';
    const isFulfill = status === 'FULFILLED';

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    if ((isPmApproval || (isReject && existing.status === 'PENDING')) && !canProjectManagerReview(req, existing)) {
      return res.status(403).json({ error: 'Only Admin or President can review this request.' });
    }

    if ((isPresidentApproval || (isReject && existing.status === 'PM_APPROVED')) && !canPresidentReview(req)) {
      return res.status(403).json({ error: 'Only the President can give final approval.' });
    }

    if (isPmApproval && existing.status !== 'PENDING') {
      return res.status(400).json({ error: 'Only pending requests can move to office review.' });
    }

    if (isPresidentApproval && existing.status !== 'PM_APPROVED') {
      return res.status(400).json({ error: 'Only office-reviewed requests can receive final approval.' });
    }

    if (isReject && !['PENDING', 'PM_APPROVED'].includes(existing.status)) {
      return res.status(400).json({ error: 'Only requests under review can be rejected.' });
    }

    if (isFulfill) {
      if (!hasRole(req, 'ADMIN')) {
        return res.status(403).json({ error: 'Only Admin can fulfill approved requests.' });
      }
      if (existing.status !== 'APPROVED') {
        return res.status(400).json({ error: 'Only approved requests can be fulfilled.' });
      }
    }

    if (status === existing.status) {
      return res.json(mapRequest(existing));
    }

    if (isPresidentApproval) {
      for (const item of existing.items) {
        const product = await prisma.product.findUnique({
          where: { productId: item.productId },
        });
        if (!product) continue;
        if (product.qtyOnHand - item.quantity < 0) {
          return res.status(400).json({ error: `Insufficient stock for ${product.itemName}` });
        }
      }
    }

    const request = await prisma.materialRequest.update({
      where: { requestId: Number(req.params.id) },
      data: {
        status,
        remarks,
        approvedAt: isPresidentApproval ? new Date() : isReject ? null : undefined,
        approvedBy: isPresidentApproval ? req.user.userId : isReject ? null : undefined,
      },
      include: includeRequestRelations(),
    });

    if (isPresidentApproval) {
      for (const item of request.items) {
        const product = await prisma.product.findUnique({
          where: { productId: item.productId },
        });
        if (!product) continue;
        const newBalance = product.qtyOnHand - item.quantity;
        if (newBalance < 0) {
          return res.status(400).json({ error: `Insufficient stock for ${product.itemName}` });
        }
        const updatedStatus = newBalance <= 0 ? 'OUT_OF_STOCK' : newBalance <= product.lowStockThreshold ? 'LOW_STOCK' : 'AVAILABLE';
        await prisma.product.update({
          where: { productId: product.productId },
          data: { qtyOnHand: newBalance, status: updatedStatus },
        });
        await prisma.stockTransaction.create({
          data: {
            productId: product.productId,
            type: 'ISSUE',
            qtyChange: -item.quantity,
            newBalance,
            userId: req.user.userId,
            notes: `Project: ${request.project?.projectName || 'Unknown'} | Material request ${request.requestNumber}`,
          },
        });
      }
    }

    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: status === 'APPROVED' ? 'APPROVE' : status === 'REJECTED' ? 'REJECT' : 'UPDATE',
        target: 'MaterialRequest',
        details: `Updated request ${request.requestNumber} to ${status || 'UNCHANGED'}`,
      },
    });

    if (isPmApproval) {
      const admins = await getUsersByRoles(['ADMIN']);
      await notifyUsers(admins, {
        title: 'Material request needs Admin approval',
        message: `${request.requestNumber} has Project Manager approval and is waiting for final approval.`,
      });
    }

    if (isPresidentApproval) {
      const procurementUsers = await getUsersByRoles(PROCUREMENT_ROLES);
      await notifyUsers(procurementUsers, {
        title: 'Material request approved for Procurement',
        message: `${request.requestNumber} has final approval and is ready for Procurement.`,
      });
      if (request.requestedBy) {
        await notifyUsers([{ userId: request.requestedBy }], {
          title: 'Material request approved',
          message: `${request.requestNumber} has final approval and is now with Procurement.`,
        });
      }
    }

    if (isReject && request.requestedBy) {
      const step = existing.status === 'PENDING' ? 'Project Manager' : 'President';
      await notifyUsers([{ userId: request.requestedBy }], {
        title: 'Material request rejected',
        message: `${request.requestNumber} was rejected by the ${step}.`,
      });
    }

    res.json(mapRequest(request));
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireRole(['ADMIN']), async (req, res, next) => {
  try {
    const requestId = Number(req.params.id);
    await prisma.materialRequest.update({
      where: { requestId },
      data: { deletedAt: new Date() },
    });
    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: 'DELETE',
        target: 'Material Request',
        details: `Soft-deleted request ${requestId}`,
      },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.put('/:id/restore', requireRole(['ADMIN']), async (req, res, next) => {
  try {
    const requestId = Number(req.params.id);
    const request = await prisma.materialRequest.update({
      where: { requestId },
      data: { deletedAt: null },
      include: includeRequestRelations(),
    });
    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: 'UPDATE',
        target: 'MaterialRequest',
        details: `Restored request ${requestId}`,
      },
    });
    res.json(mapRequest(request));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
