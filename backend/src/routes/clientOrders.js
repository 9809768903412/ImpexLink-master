const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const prisma = require('../utils/prisma');
const { parsePagination, buildPaginatedResponse, parseSort } = require('../utils/pagination');
const { requireAuth, requireRole, getRoleList } = require('../middleware/auth');
const { isPositiveInt } = require('../utils/validate');
const {
  resolveClientAccess,
  buildClientOrderScope,
  canAccessClientOwnedRecord,
} = require('../utils/clientVisibility');
const { calculateDeliveryPlan } = require('../utils/deliveryRules');
const { mirrorUploadedFile } = require('../utils/uploadedFiles');
const {
  calculateOrderTotals,
  canTransitionOrderForRoles,
  splitItemsIntoDeliveryBatches,
} = require('../utils/orderWorkflow');

const router = express.Router();
router.use(requireAuth);

function hasRole(req, role) {
  return getRoleList(req.user).includes(String(role).toUpperCase());
}

function normalizeOrderStatusForResponse(status) {
  const normalized = String(status || 'PENDING').toUpperCase();
  if (normalized === 'SHIPPED') return 'ready-for-delivery';
  return normalized.toLowerCase();
}

function normalizeOrderStatusForWrite(status) {
  const normalized = String(status || '').toUpperCase().replace(/-/g, '_');
  if (normalized === 'READY_FOR_DELIVERY') return 'SHIPPED';
  return normalized;
}

function orderPaymentStatusToTransactionStatus(status) {
  const normalized = String(status || 'PENDING').toUpperCase();
  if (normalized === 'PAID') return 'PAID';
  if (normalized === 'VERIFIED') return 'RECEIVED';
  if (normalized === 'FAILED') return 'CANCELLED';
  return 'PENDING';
}

function paymentDueDateFromOrder(orderDate = new Date(), creditDays = 30) {
  const date = new Date(orderDate);
  date.setDate(date.getDate() + creditDays);
  return date;
}

async function ensureClientOrderPayment(order, userId, overrides = {}, db = prisma) {
  if (!order?.clientOrderId) return null;
  const existing = await db.paymentTransaction.findFirst({
    where: {
      direction: 'CLIENT_TO_OFFICE',
      clientOrderId: order.clientOrderId,
    },
  });
  const status = overrides.status || orderPaymentStatusToTransactionStatus(order.paymentStatus);
  const amount = Number(overrides.amount ?? order.total ?? 0);
  const creditDays = Number(overrides.creditDays ?? existing?.creditDays ?? 30);
  const data = {
    method: overrides.method || existing?.method || 'CHEQUE',
    status,
    amount,
    creditDays,
    dueDate: overrides.dueDate || existing?.dueDate || paymentDueDateFromOrder(order.createdAt || new Date(), creditDays),
    paidAt:
      overrides.paidAt !== undefined
        ? overrides.paidAt
        : ['PAID', 'RECEIVED'].includes(status)
        ? existing?.paidAt || new Date()
        : null,
    referenceNumber: overrides.referenceNumber !== undefined ? overrides.referenceNumber : existing?.referenceNumber || null,
    notes: overrides.notes !== undefined ? overrides.notes : existing?.notes || 'Created from client order flow',
    clientId: order.clientId || existing?.clientId || null,
    clientOrderId: order.clientOrderId,
    createdById: existing?.createdById || userId || order.createdBy || null,
  };
  if (existing) {
    return db.paymentTransaction.update({
      where: { paymentId: existing.paymentId },
      data,
    });
  }
  return db.paymentTransaction.create({
    data: {
      direction: 'CLIENT_TO_OFFICE',
      ...data,
    },
  });
}

function canTransitionOrder(req, currentStatus, requestedStatus) {
  return canTransitionOrderForRoles(getRoleList(req.user), currentStatus, requestedStatus);
}

async function buildOrderRoleScope(req) {
  if (hasRole(req, 'ADMIN') || hasRole(req, 'PRESIDENT')) {
    return {};
  }

  const scopes = [];

  if (hasRole(req, 'CLIENT')) {
    const access = await resolveClientAccess(prisma, req.user.userId);
    if (access?.user?.email) {
      let client = access.client;
      if (!client) {
        const user = access.user;
        const clientName = user.fullName || user.email;
        client = await prisma.client.create({
          data: {
            clientName,
            email: user.email,
            contactPerson: user.fullName || clientName,
          },
        });
      }
      if (client?.clientId) {
        const nextAccess = {
          user: access.user,
          client,
          visibilityScope: access?.visibilityScope || 'COMPANY',
          isUserScoped: access?.isUserScoped || false,
        };
        scopes.push(buildClientOrderScope(nextAccess));
      }
    }
  }

  if (hasRole(req, 'SALES_AGENT')) {
    scopes.push({ assignedSalesAgentId: req.user.userId });
  }

  if (hasRole(req, 'PROJECT_MANAGER')) {
    scopes.push({ project: { assignedPmId: req.user.userId } });
  }

  if (hasRole(req, 'WAREHOUSE_STAFF')) {
    scopes.push({ status: { in: ['APPROVED', 'PROCESSING', 'SHIPPED'] } });
  }

  if (scopes.length === 0) {
    return { clientOrderId: -1 };
  }

  return scopes.length === 1 ? scopes[0] : { OR: scopes };
}

async function validateSalesAgentAssignment(assignedSalesAgentId) {
  if (!assignedSalesAgentId) return null;
  const salesAgent = await prisma.user.findUnique({
    where: { userId: Number(assignedSalesAgentId) },
    include: { role: true, userRoles: { include: { role: true } } },
  });
  if (!salesAgent || salesAgent.deletedAt) {
    throw new Error('Assigned sales agent not found');
  }
  const roleNames = [
    salesAgent.role?.roleName,
    ...(salesAgent.userRoles || []).map((entry) => entry.role?.roleName),
  ]
    .filter(Boolean)
    .map((role) => String(role).toUpperCase());
  if (!roleNames.includes('SALES_AGENT')) {
    throw new Error('Assigned user must have the Sales Agent role');
  }
  return salesAgent.userId;
}

const paymentDir = path.join(__dirname, '..', '..', 'uploads', 'payments');
if (!fs.existsSync(paymentDir)) {
  fs.mkdirSync(paymentDir, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, paymentDir),
    filename: (_req, file, cb) => {
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      const suffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `${suffix}-${safeName}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'application/pdf'];
    const extension = path.extname(String(file.originalname || '')).toLowerCase();
    const allowedExtensions = new Set(['.jpg', '.jpeg', '.png', '.heic', '.heif', '.pdf']);
    if (!allowed.includes(file.mimetype) && !allowedExtensions.has(extension)) {
      return cb(new Error('Invalid file type'));
    }
    cb(null, true);
  },
});

function mapOrder(o) {
  return {
    id: o.clientOrderId.toString(),
    orderNumber: o.orderNumber,
    clientId: o.clientId?.toString() || null,
    clientName: o.client?.clientName || 'Client',
    projectId: o.projectId?.toString() || null,
    projectName: o.project?.projectName || null,
    items: (o.items || []).map((item) => ({
      itemId: item.productId?.toString() || '',
      itemName: item.product?.itemName || '',
      unit: item.product?.unit || '',
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice || 0),
      amount: Number(item.unitPrice || 0) * item.quantity,
    })),
    subtotal: Number(o.subtotal || 0),
    vat: Number(o.vat || 0),
    total: Number(o.total || 0),
    status: normalizeOrderStatusForResponse(o.status),
    paymentStatus: String(o.paymentStatus || 'PENDING').toLowerCase(),
    chequeImage: o.paymentProofUrl || null,
    chequeVerification: null,
    poDocumentUrl: o.paymentProofUrl || null,
    poMatchStatus: null,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
    createdBy: o.createdBy?.toString() || null,
    assignedSalesAgentId: o.assignedSalesAgentId?.toString() || null,
    assignedSalesAgentName: o.assignedSalesAgent?.fullName || null,
    requirementsConfirmedAt: o.requirementsConfirmedAt?.toISOString() || null,
    requirementsConfirmedBy: o.requirementsConfirmedBy?.toString() || null,
    coordinationNotes: o.coordinationNotes || null,
    specialInstructions: o.specialInstructions || '',
    cancelReason: o.cancelReason || null,
  };
}

async function validateOrderStock(items = []) {
  const getProductId = (item) => Number(item.productId ?? item.itemId);
  const productIds = [...new Set(items.map(getProductId).filter(Boolean))];
  const products = await prisma.product.findMany({
    where: { productId: { in: productIds }, deletedAt: null },
  });
  const productMap = new Map(products.map((product) => [product.productId, product]));

  for (const item of items) {
    const productId = getProductId(item);
    const product = productMap.get(productId);
    if (!product) {
      return { ok: false, error: `Item ${productId || ''} is no longer available.` };
    }
    const quantity = Number(item.quantity || 0);
    if (quantity > product.qtyOnHand) {
      return {
        ok: false,
        error: `${product.itemName} only has ${product.qtyOnHand} ${product.unit || 'units'} in stock. Please lower the quantity.`,
      };
    }
  }

  return { ok: true };
}

async function createDeliveryBatchesForOrder(order, userId, db = prisma) {
  const existingDelivery = await db.delivery.findFirst({
    where: { clientOrderId: order.clientOrderId, deletedAt: null },
  });
  if (existingDelivery) return;

  const plan = calculateDeliveryPlan(order.items || []);
  const batchItems = splitItemsIntoDeliveryBatches(order.items || [], plan.batchCount);
  const drSuffix = order.orderNumber?.replace(/^ORD-/, '') || String(Date.now());
  const defaultEta = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  for (let batch = 1; batch <= plan.batchCount; batch += 1) {
    const method = plan.method === 'THIRD_PARTY' ? 'LALAMOVE' : plan.method;
    const delivery = await db.delivery.create({
      data: {
        drNumber: plan.batchCount > 1 ? `DR-${drSuffix}-B${batch}` : `DR-${drSuffix}`,
        clientOrderId: order.clientOrderId,
        assignedDeliveryGuyId: null,
        status: 'PENDING',
        itemsCount: batchItems[batch - 1].reduce((sum, item) => sum + item.quantity, 0),
        eta: defaultEta,
        deliveryMethod: method,
        batchNumber: batch,
        batchCount: plan.batchCount,
        loadKg: plan.totalKg / plan.batchCount,
        thirdPartyProvider: method === 'LALAMOVE' ? 'Lalamove' : null,
        notes: [
          plan.batchCount > 1 ? `Batch ${batch} of ${plan.batchCount}.` : '',
          plan.warnings.join(' '),
        ].filter(Boolean).join(' '),
      },
    });
    if (batchItems[batch - 1].length > 0) {
      await db.deliveryItem.createMany({
        data: batchItems[batch - 1].map((item) => ({
          deliveryId: delivery.deliveryId,
          orderItemId: item.orderItemId,
          quantity: item.quantity,
        })),
      });
    }
    await db.auditLog.create({
      data: {
        userId,
        action: 'CREATE',
        target: 'Delivery',
        details: `Created ${method.toLowerCase()} delivery ${delivery.drNumber} for ${order.orderNumber}`,
      },
    });
  }
}

async function generateOrderNumber(db = prisma) {
  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = `ORD-${year}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const existing = await db.clientOrder.findUnique({ where: { orderNumber: candidate } });
    if (!existing) return candidate;
  }
  throw new Error('Unable to generate a unique order number');
}

router.get('/', async (req, res, next) => {
  try {
    const pagination = parsePagination(req.query);
    const q = req.query.q ? String(req.query.q) : '';
    const status = req.query.status ? String(req.query.status).toUpperCase() : '';
    const includeDeleted = req.query.includeDeleted === 'true';
    const onlyDeleted = req.query.onlyDeleted === 'true';
    const roleList = Array.isArray(req.user?.roles)
      ? req.user.roles.map((r) => String(r).toUpperCase())
      : [String(req.user?.role || '').toUpperCase()];
    if (!roleList.includes('ADMIN') && !roleList.includes('PRESIDENT') && !roleList.includes('CLIENT') && !roleList.includes('SALES_AGENT') && !roleList.includes('WAREHOUSE_STAFF')) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const clientId = req.query.clientId ? Number(req.query.clientId) : null;
    const clientName = req.query.clientName ? String(req.query.clientName) : '';
    const createdBy = req.query.createdBy ? Number(req.query.createdBy) : null;
    const scopeWhere = await buildOrderRoleScope(req);
    const where = {
      AND: [
        scopeWhere,
        onlyDeleted ? { deletedAt: { not: null } } : includeDeleted ? {} : { deletedAt: null },
        q
          ? {
              OR: [
                { orderNumber: { contains: q, mode: 'insensitive' } },
                { client: { clientName: { contains: q, mode: 'insensitive' } } },
                { project: { projectName: { contains: q, mode: 'insensitive' } } },
              ],
            }
          : {},
        status ? { status } : {},
        clientId && (roleList.includes('ADMIN') || roleList.includes('PRESIDENT')) ? { clientId } : {},
        clientName ? { client: { clientName: { contains: clientName, mode: 'insensitive' } } } : {},
        createdBy && (roleList.includes('ADMIN') || roleList.includes('PRESIDENT')) ? { createdBy } : {},
      ],
    };
    const sort = parseSort(req.query, ['createdAt', 'total', 'status']);
    const orderBy = sort ? { [sort.sortBy]: sort.sortDir } : { createdAt: 'desc' };
    const [orders, total] = await Promise.all([
      prisma.clientOrder.findMany({
        include: {
          project: true,
          client: true,
          assignedSalesAgent: true,
          items: { include: { product: true } },
        },
        where,
        skip: pagination ? (pagination.page - 1) * pagination.pageSize : undefined,
        take: pagination ? pagination.pageSize : undefined,
        orderBy,
      }),
      prisma.clientOrder.count({ where }),
    ]);

    const data = orders.map(mapOrder);

    if (pagination) {
      return res.json(buildPaginatedResponse(data, total, pagination.page, pagination.pageSize));
    }
    return res.json(data);
  } catch (err) {
    next(err);
  }
});

router.post('/', requireRole(['ADMIN', 'CLIENT']), async (req, res, next) => {
  try {
    const { clientId, projectId, items, specialInstructions } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one item is required' });
    }
    if (items.some((item) => Number(item.quantity || 0) <= 0)) {
      return res.status(400).json({ error: 'Quantity must be greater than 0' });
    }
    if (!projectId || !isPositiveInt(projectId)) {
      return res.status(400).json({ error: 'An active project is required' });
    }

    const normalizedItems = items.map((item) => ({
      productId: Number(item.productId ?? item.itemId),
      quantity: Number(item.quantity),
    }));
    if (normalizedItems.some((item) => !Number.isInteger(item.productId) || item.productId <= 0)) {
      return res.status(400).json({ error: 'Each order item must reference a valid product' });
    }
    if (new Set(normalizedItems.map((item) => item.productId)).size !== normalizedItems.length) {
      return res.status(400).json({ error: 'Duplicate products are not allowed in one order' });
    }

    let resolvedClientId = clientId ? Number(clientId) : null;
    if (hasRole(req, 'CLIENT')) {
      const access = await resolveClientAccess(prisma, req.user.userId);
      resolvedClientId = access?.client?.clientId || null;
    }
    if (!resolvedClientId || !Number.isInteger(resolvedClientId)) {
      return res.status(400).json({ error: 'A valid client is required' });
    }

    const [project, products] = await Promise.all([
      prisma.project.findFirst({
        where: {
          projectId: Number(projectId),
          clientId: resolvedClientId,
          status: 'ACTIVE',
          deletedAt: null,
        },
      }),
      prisma.product.findMany({
        where: {
          productId: { in: normalizedItems.map((item) => item.productId) },
          deletedAt: null,
        },
      }),
    ]);
    if (!project) {
      return res.status(400).json({ error: 'Project must be active and belong to this client' });
    }
    const productsById = new Map(products.map((product) => [product.productId, product]));
    if (products.length !== normalizedItems.length) {
      return res.status(400).json({ error: 'One or more products are no longer available' });
    }
    const authoritativeItems = normalizedItems.map((item) => ({
      ...item,
      unitPrice: Number(productsById.get(item.productId).unitPrice),
    }));
    const stockCheck = await validateOrderStock(authoritativeItems);
    if (!stockCheck.ok) return res.status(400).json({ error: stockCheck.error });
    const totals = calculateOrderTotals(authoritativeItems);

    if (req.body.assignedSalesAgentId !== undefined && !hasRole(req, 'ADMIN')) {
      return res.status(403).json({ error: 'Only admin can assign a sales agent' });
    }
    const assignedSalesAgentId =
      req.body.assignedSalesAgentId === undefined
        ? null
        : req.body.assignedSalesAgentId === 'unassigned'
        ? null
        : await validateSalesAgentAssignment(req.body.assignedSalesAgentId);
    const order = await prisma.$transaction(async (tx) => {
      const orderNumber = await generateOrderNumber(tx);
      const created = await tx.clientOrder.create({
        data: {
          orderNumber,
          clientId: resolvedClientId,
          projectId: Number(projectId),
          assignedSalesAgentId,
          ...totals,
          status: 'PENDING',
          paymentStatus: 'PENDING',
          createdBy: req.user.userId,
          specialInstructions: specialInstructions || null,
          items: { create: authoritativeItems },
        },
        include: {
          project: true,
          client: true,
          assignedSalesAgent: true,
          items: { include: { product: true } },
        },
      });
      await tx.auditLog.create({
        data: { userId: req.user.userId, action: 'CREATE', target: 'ClientOrder', details: `Created order ${orderNumber}` },
      });
      await ensureClientOrderPayment(created, req.user.userId, {}, tx);
      await tx.auditLog.create({
        data: { userId: req.user.userId, action: 'CREATE', target: 'Payment', details: `Created client receivable for order ${orderNumber}` },
      });
      return created;
    });

    // Notify admins of new order
    const admins = await prisma.user.findMany({
      where: { role: { roleName: 'ADMIN' }, deletedAt: null },
    });
    if (admins.length > 0) {
      await prisma.notification.createMany({
        data: admins.map((admin) => ({
          userId: admin.userId,
          type: 'ORDER_APPROVAL',
          title: 'New order placed',
          message: `Order ${order.orderNumber} was placed.`,
          link: '/admin/orders',
        })),
      });
      await prisma.auditLog.create({
        data: {
          userId: req.user.userId,
          action: 'NOTIFY',
          target: 'Notification',
          details: `Sent order approval notifications for ${order.orderNumber} to ${admins.length} admins`,
        },
      });
    }

    res.status(201).json(mapOrder(order));
  } catch (err) {
    next(err);
  }
});

router.put('/:id/assignment', requireRole(['ADMIN']), async (req, res, next) => {
  try {
    const orderId = Number(req.params.id);
    const existing = await prisma.clientOrder.findUnique({
      where: { clientOrderId: orderId },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Order not found' });
    }
    const assignedSalesAgentId =
      req.body.assignedSalesAgentId === undefined
        ? existing.assignedSalesAgentId
        : req.body.assignedSalesAgentId === 'unassigned'
        ? null
        : await validateSalesAgentAssignment(req.body.assignedSalesAgentId);
    if (
      existing.assignedSalesAgentId &&
      assignedSalesAgentId !== existing.assignedSalesAgentId
    ) {
      return res.status(409).json({ error: 'Sales agent assignment is final once assigned.' });
    }

    await prisma.clientOrder.update({
      where: { clientOrderId: orderId },
      data: { assignedSalesAgentId },
    });

    const responseOrder = await prisma.clientOrder.findUnique({
      where: { clientOrderId: orderId },
      include: {
        project: true,
        client: true,
        assignedSalesAgent: true,
        items: { include: { product: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: 'UPDATE',
        target: 'ClientOrderAssignment',
        details: `Updated sales agent assignment for ${responseOrder.orderNumber}`,
      },
    });
    if (assignedSalesAgentId && assignedSalesAgentId !== existing.assignedSalesAgentId) {
      await prisma.notification.create({
        data: {
          userId: assignedSalesAgentId,
          type: 'ORDER_APPROVAL',
          title: 'Order assigned to you',
          message: `You were assigned to ${responseOrder.orderNumber}.`,
          link: `/admin/orders?orderId=${responseOrder.clientOrderId}`,
        },
      });
    }

    res.json(mapOrder(responseOrder));
  } catch (err) {
    if (err.message?.includes('Assigned')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.put('/:id/coordination', requireRole(['SALES_AGENT']), async (req, res, next) => {
  try {
    const order = await prisma.clientOrder.findUnique({
      where: { clientOrderId: Number(req.params.id) },
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.assignedSalesAgentId !== req.user.userId) {
      return res.status(403).json({ error: 'Only the assigned sales agent can confirm requirements.' });
    }
    if (order.status !== 'PENDING') {
      return res.status(400).json({ error: 'Requirements must be confirmed before admin approval.' });
    }
    const notes = String(req.body.notes || '').trim();
    if (!notes) return res.status(400).json({ error: 'Coordination notes are required.' });

    await prisma.clientOrder.update({
      where: { clientOrderId: order.clientOrderId },
      data: {
        requirementsConfirmedAt: new Date(),
        requirementsConfirmedBy: req.user.userId,
        coordinationNotes: notes,
      },
    });
    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: 'CONFIRM',
        target: 'ClientOrderRequirements',
        details: `Confirmed customer requirements for ${order.orderNumber}`,
      },
    });
    const admins = await prisma.user.findMany({
      where: { role: { roleName: 'ADMIN' }, deletedAt: null },
      select: { userId: true },
    });
    if (admins.length > 0) {
      await prisma.notification.createMany({
        data: admins.map((admin) => ({
          userId: admin.userId,
          type: 'ORDER_APPROVAL',
          title: 'Requirements confirmed',
          message: `${order.orderNumber} is ready for admin review.`,
          link: `/admin/orders?orderId=${order.clientOrderId}`,
        })),
      });
    }
    const responseOrder = await prisma.clientOrder.findUnique({
      where: { clientOrderId: order.clientOrderId },
      include: {
        project: true,
        client: true,
        assignedSalesAgent: true,
        items: { include: { product: true } },
      },
    });
    res.json(mapOrder(responseOrder));
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireRole(['ADMIN', 'WAREHOUSE_STAFF']), async (req, res, next) => {
  try {
    if (req.body.assignedSalesAgentId !== undefined) {
      return res.status(400).json({ error: 'Use the order assignment endpoint to change the sales agent' });
    }

    const status = req.body.status ? normalizeOrderStatusForWrite(req.body.status) : undefined;
    if (status && !['PENDING', 'APPROVED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    if (req.body.paymentStatus) {
      if (!hasRole(req, 'ADMIN')) {
        return res.status(403).json({ error: 'Only admin can update payment approval status.' });
      }
      const payment = req.body.paymentStatus.toUpperCase();
      if (!['PENDING', 'VERIFIED', 'PAID', 'FAILED'].includes(payment)) {
        return res.status(400).json({ error: 'Invalid payment status' });
      }
    }
    if (status === 'CANCELLED' && !String(req.body.cancelReason || '').trim()) {
      return res.status(400).json({ error: 'Cancellation reason is required' });
    }
    const existing = await prisma.clientOrder.findUnique({
      where: { clientOrderId: Number(req.params.id) },
      include: {
        project: true,
        items: { include: { product: { include: { category: true } } } },
      },
    });
    if (!existing) return res.status(404).json({ error: 'Order not found' });
    if (status && !canTransitionOrder(req, existing.status, status)) {
      return res.status(403).json({ error: 'You cannot move this order to that stage.' });
    }
    if (status === 'APPROVED' && (!existing.assignedSalesAgentId || !existing.requirementsConfirmedAt)) {
      return res.status(400).json({
        error: 'Assign a sales agent and wait for requirements confirmation before approval.',
      });
    }
    if (status === 'APPROVED') {
      if (!existing.project || existing.project.deletedAt || existing.project.status !== 'ACTIVE' || existing.project.clientId !== existing.clientId) {
        return res.status(400).json({ error: 'The linked project is no longer active or valid for this client.' });
      }
      const stockCheck = await validateOrderStock(existing.items);
      if (!stockCheck.ok) return res.status(409).json({ error: stockCheck.error });
    }
    if (status === 'SHIPPED' && !['VERIFIED', 'PAID'].includes(existing.paymentStatus)) {
      return res.status(400).json({ error: 'Payment must be verified before the order is ready for delivery.' });
    }

    const paymentStatus = req.body.paymentStatus ? req.body.paymentStatus.toUpperCase() : undefined;
    await prisma.$transaction(async (tx) => {
      if (status === 'PROCESSING') {
        const existingIssue = await tx.stockTransaction.findFirst({
          where: { type: 'ISSUE', notes: { contains: `Order ${existing.orderNumber}` } },
        });
        if (!existingIssue) {
          for (const item of existing.items) {
            if (!item.productId) throw new Error('ORDER_PRODUCT_MISSING');
            const result = await tx.product.updateMany({
              where: { productId: item.productId, deletedAt: null, qtyOnHand: { gte: item.quantity } },
              data: { qtyOnHand: { decrement: item.quantity } },
            });
            if (result.count !== 1) throw new Error(`INSUFFICIENT_STOCK:${item.product?.itemName || item.productId}`);
            const product = await tx.product.findUnique({ where: { productId: item.productId } });
            const productStatus = product.qtyOnHand <= 0
              ? 'OUT_OF_STOCK'
              : product.qtyOnHand <= product.lowStockThreshold
                ? 'LOW_STOCK'
                : 'AVAILABLE';
            await tx.product.update({ where: { productId: item.productId }, data: { status: productStatus } });
            await tx.stockTransaction.create({
              data: {
                productId: item.productId,
                type: 'ISSUE',
                qtyChange: -item.quantity,
                newBalance: product.qtyOnHand,
                userId: req.user.userId,
                notes: `Project: ${existing.project?.projectName || 'Unknown'} | Order ${existing.orderNumber}`,
              },
            });
          }
          await tx.auditLog.create({
            data: { userId: req.user.userId, action: 'UPDATE', target: 'Stock', details: `Issued stock for order ${existing.orderNumber}` },
          });
        }
      }

      await tx.clientOrder.update({
        where: { clientOrderId: existing.clientOrderId },
        data: {
          status,
          paymentStatus,
          cancelReason: status === 'CANCELLED' ? String(req.body.cancelReason).trim() : undefined,
        },
      });
      if (paymentStatus) {
        await ensureClientOrderPayment({ ...existing, paymentStatus }, req.user.userId, {}, tx);
      }
      if (status === 'SHIPPED') {
        await createDeliveryBatchesForOrder(existing, req.user.userId, tx);
      }
      await tx.auditLog.create({
        data: { userId: req.user.userId, action: 'UPDATE', target: 'ClientOrder', details: `Updated order ${existing.orderNumber}` },
      });
    }, { isolationLevel: 'Serializable' });

    // Notify client on admin/staff updates
    if (existing.clientId) {
      const client = await prisma.client.findUnique({ where: { clientId: existing.clientId } });
      if (client?.email) {
        const clientUser = await prisma.user.findUnique({ where: { email: client.email } });
        if (clientUser) {
          await prisma.notification.create({
            data: {
              userId: clientUser.userId,
              type: 'ORDER_APPROVAL',
              title: 'Order update',
              message: `Order ${existing.orderNumber} updated. Status: ${(status || existing.status).toLowerCase()}, Payment: ${(req.body.paymentStatus || existing.paymentStatus).toLowerCase()}.`,
              link: '/client/orders',
            },
          });
          await prisma.auditLog.create({
            data: {
              userId: req.user.userId,
              action: 'NOTIFY',
              target: 'Notification',
              details: `Sent order update notification for ${existing.orderNumber} to client`,
            },
          });
        }
      }
    }

    const responseOrder = await prisma.clientOrder.findUnique({
      where: { clientOrderId: Number(req.params.id) },
      include: {
        project: true,
        client: true,
        assignedSalesAgent: true,
        items: { include: { product: true } },
      },
    });

    res.json(mapOrder(responseOrder));
  } catch (err) {
    if (err.message === 'ORDER_PRODUCT_MISSING') {
      return res.status(400).json({ error: 'An order product no longer exists.' });
    }
    if (err.message?.startsWith('INSUFFICIENT_STOCK:')) {
      return res.status(409).json({ error: `${err.message.split(':')[1]} no longer has enough stock.` });
    }
    if (err.code === 'P2034') {
      return res.status(409).json({ error: 'Inventory changed while processing. Please retry.' });
    }
    next(err);
  }
});

router.post('/:id/payment-proof', requireRole(['CLIENT']), upload.single('proof'), async (req, res, next) => {
  try {
    const referenceNumber = String(req.body?.referenceNumber || '').trim();
    const paymentMethod = String(req.body?.paymentMethod || req.body?.method || 'CHEQUE').trim().toUpperCase();
    const notes = String(req.body?.notes || '').trim();
    if (!['CHEQUE', 'AUTO_DEPOSIT'].includes(paymentMethod)) {
      return res.status(400).json({ error: 'Client payment method must be Cheque or Auto Deposit.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Payment proof file is required before submitting payment.' });
    }
    const access = await resolveClientAccess(prisma, req.user.userId);
    const order = await prisma.clientOrder.findUnique({
      where: { clientOrderId: Number(req.params.id) },
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (!canAccessClientOwnedRecord(access, order)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const paymentProofUrl = req.file ? `/uploads/payments/${req.file.filename}` : null;
    if (req.file && paymentProofUrl) {
      await mirrorUploadedFile({ file: req.file, fileUrl: paymentProofUrl });
    }
    const updated = await prisma.clientOrder.update({
      where: { clientOrderId: Number(req.params.id) },
      data: {
        paymentProofUrl: paymentProofUrl || order.paymentProofUrl,
        paymentStatus: 'PENDING',
        chequeVerification: null,
      },
    });

    await ensureClientOrderPayment(updated, req.user.userId, {
      status: 'PENDING',
      method: paymentMethod,
        amount: Number(order.total || 0),
        referenceNumber: referenceNumber || undefined,
        notes:
          notes ||
          `Client submitted ${paymentMethod === 'AUTO_DEPOSIT' ? 'auto deposit' : 'cheque'} payment proof/reference; awaiting admin approval.`,
    });

    const admins = await prisma.user.findMany({
      where: { role: { roleName: 'ADMIN' }, deletedAt: null },
    });
    if (admins.length > 0) {
      await prisma.notification.createMany({
        data: admins.map((admin) => ({
          userId: admin.userId,
          type: 'PAYMENT_VERIFIED',
          title: 'Payment proof submitted',
          message: `Client submitted ${paymentMethod === 'AUTO_DEPOSIT' ? 'auto deposit' : 'cheque'} payment proof for ${updated.orderNumber}.`,
          link: '/admin/orders',
        })),
      });
      await prisma.auditLog.create({
        data: {
          userId: req.user.userId,
          action: 'NOTIFY',
          target: 'Notification',
          details: `Sent payment proof notification for ${updated.orderNumber} to ${admins.length} admins`,
        },
      });
    }

    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: 'UPDATE',
        target: 'PaymentProof',
        details: `Client submitted payment proof/reference for ${updated.orderNumber}`,
      },
    });
    return res.status(200).json({
      ...updated,
      paymentProofUrl: updated.paymentProofUrl,
      poDocumentUrl: updated.paymentProofUrl,
      chequeVerification: null,
      poMatchStatus: null,
      verificationStatus: 'pending-admin-review',
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireRole(['ADMIN']), async (req, res, next) => {
  try {
    const orderId = Number(req.params.id);
    await prisma.clientOrder.update({
      where: { clientOrderId: orderId },
      data: { deletedAt: new Date() },
    });
    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: 'DELETE',
        target: 'Order',
        details: `Soft-deleted client order ${orderId}`,
      },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.put('/:id/restore', requireRole(['ADMIN']), async (req, res, next) => {
  try {
    const orderId = Number(req.params.id);
    const order = await prisma.clientOrder.update({
      where: { clientOrderId: orderId },
      data: { deletedAt: null },
    });
    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: 'UPDATE',
        target: 'Order',
        details: `Restored client order ${orderId}`,
      },
    });
    res.json(order);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
