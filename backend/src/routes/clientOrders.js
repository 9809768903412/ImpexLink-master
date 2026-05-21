const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const prisma = require('../utils/prisma');
const { parsePagination, buildPaginatedResponse, parseSort } = require('../utils/pagination');
const { requireAuth, requireRole, getRoleList } = require('../middleware/auth');
const { isNonNegativeNumber, isPositiveInt } = require('../utils/validate');
const {
  resolveClientAccess,
  buildClientOrderScope,
  canAccessClientOwnedRecord,
} = require('../utils/clientVisibility');
const { calculateDeliveryPlan } = require('../utils/deliveryRules');

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

async function ensureClientOrderPayment(order, userId, overrides = {}) {
  if (!order?.clientOrderId) return null;
  const existing = await prisma.paymentTransaction.findFirst({
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
    return prisma.paymentTransaction.update({
      where: { paymentId: existing.paymentId },
      data,
    });
  }
  return prisma.paymentTransaction.create({
    data: {
      direction: 'CLIENT_TO_OFFICE',
      ...data,
    },
  });
}

function canTransitionOrder(req, currentStatus, requestedStatus) {
  if (!requestedStatus || requestedStatus === currentStatus) return true;
  if (hasRole(req, 'ADMIN')) return true;

  if (hasRole(req, 'SALES_AGENT')) {
    return currentStatus === 'APPROVED' && requestedStatus === 'PROCESSING';
  }

  if (hasRole(req, 'WAREHOUSE_STAFF')) {
    return (
      (currentStatus === 'APPROVED' && requestedStatus === 'PROCESSING') ||
      (currentStatus === 'PROCESSING' && requestedStatus === 'SHIPPED')
    );
  }

  if (hasRole(req, 'CLIENT')) {
    return false;
  }

  return false;
}

async function buildOrderRoleScope(req) {
  if (hasRole(req, 'ADMIN')) {
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
      cb(null, `${Date.now()}-${safeName}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowed.includes(file.mimetype)) {
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

async function createDeliveryBatchesForOrder(order, userId, status = 'PENDING') {
  const existingDelivery = await prisma.delivery.findFirst({
    where: { clientOrderId: order.clientOrderId, deletedAt: null },
  });
  if (existingDelivery) return;

  const plan = calculateDeliveryPlan(order.items || []);
  const drSuffix = order.orderNumber?.replace(/^ORD-/, '') || String(Date.now());
  const defaultEta = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  const deliveryStatus = status === 'DELIVERED' ? 'DELIVERED' : 'PENDING';

  for (let batch = 1; batch <= plan.batchCount; batch += 1) {
    const method = plan.method === 'THIRD_PARTY' ? 'LALAMOVE' : plan.method;
    const delivery = await prisma.delivery.create({
      data: {
        drNumber: plan.batchCount > 1 ? `DR-${drSuffix}-B${batch}` : `DR-${drSuffix}`,
        clientOrderId: order.clientOrderId,
        assignedDeliveryGuyId: null,
        status: deliveryStatus,
        itemsCount: order.items?.length || 0,
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
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'CREATE',
        target: 'Delivery',
        details: `Created ${method.toLowerCase()} delivery ${delivery.drNumber} for ${order.orderNumber}`,
      },
    });
  }
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
    if (!roleList.includes('ADMIN') && !roleList.includes('CLIENT') && !roleList.includes('SALES_AGENT')) {
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
        clientId && roleList.includes('ADMIN') ? { clientId } : {},
        clientName ? { client: { clientName: { contains: clientName, mode: 'insensitive' } } } : {},
        createdBy && roleList.includes('ADMIN') ? { createdBy } : {},
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
    const { orderNumber, clientId, projectId, items, subtotal, vat, total, status, paymentStatus, specialInstructions, cancelReason } = req.body;
    if (!orderNumber) return res.status(400).json({ error: 'Order number is required' });
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one item is required' });
    }
    if (items.some((item) => Number(item.quantity || 0) <= 0)) {
      return res.status(400).json({ error: 'Quantity must be greater than 0' });
    }
    if (items.some((item) => Number(item.unitPrice || 0) < 0)) {
      return res.status(400).json({ error: 'Unit price must be 0 or greater' });
    }
    const stockCheck = await validateOrderStock(items);
    if (!stockCheck.ok) {
      return res.status(400).json({ error: stockCheck.error });
    }
    if (subtotal !== undefined && !isNonNegativeNumber(subtotal)) {
      return res.status(400).json({ error: 'Subtotal must be 0 or greater' });
    }
    if (vat !== undefined && !isNonNegativeNumber(vat)) {
      return res.status(400).json({ error: 'VAT must be 0 or greater' });
    }
    if (total !== undefined && !isNonNegativeNumber(total)) {
      return res.status(400).json({ error: 'Total must be 0 or greater' });
    }
    if (projectId !== undefined && projectId !== null && !isPositiveInt(projectId)) {
      return res.status(400).json({ error: 'Invalid project id' });
    }
    let resolvedClientId = clientId ? Number(clientId) : null;
    if (hasRole(req, 'CLIENT')) {
      const access = await resolveClientAccess(prisma, req.user.userId);
      resolvedClientId = access?.client?.clientId || null;
    }
    if (req.body.assignedSalesAgentId !== undefined && !hasRole(req, 'ADMIN')) {
      return res.status(403).json({ error: 'Only admin can assign a sales agent' });
    }
    const assignedSalesAgentId =
      req.body.assignedSalesAgentId === undefined
        ? null
        : req.body.assignedSalesAgentId === 'unassigned'
        ? null
        : await validateSalesAgentAssignment(req.body.assignedSalesAgentId);
    const requestedStatus = status ? normalizeOrderStatusForWrite(status) : 'PENDING';
    if (!hasRole(req, 'ADMIN') && requestedStatus !== 'PENDING') {
      return res.status(403).json({ error: 'Only admin can create an order as approved or processed.' });
    }
    if (!hasRole(req, 'ADMIN') && paymentStatus && String(paymentStatus).toUpperCase() !== 'PENDING') {
      return res.status(403).json({ error: 'Only admin can set payment approval status.' });
    }

    const order = await prisma.clientOrder.create({
      data: {
        orderNumber,
        clientId: resolvedClientId,
        projectId: projectId ? Number(projectId) : null,
        assignedSalesAgentId,
        subtotal,
        vat,
        total,
        status: requestedStatus,
        paymentStatus: paymentStatus ? paymentStatus.toUpperCase() : 'PENDING',
        createdBy: req.user.userId,
        specialInstructions: specialInstructions || null,
        cancelReason: cancelReason || null,
        items: {
          create: Array.isArray(items)
            ? items.map((item) => ({
                productId: item.itemId ? Number(item.itemId) : Number(item.productId),
                quantity: Number(item.quantity || 0),
                unitPrice: Number(item.unitPrice || 0),
              }))
            : [],
        },
      },
      include: { project: true, items: { include: { product: { include: { category: true } } } } },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: 'CREATE',
        target: 'ClientOrder',
        details: `Created order ${order.orderNumber}`,
      },
    });

    await ensureClientOrderPayment(order, req.user.userId);
    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: 'CREATE',
        target: 'Payment',
        details: `Created client receivable for order ${order.orderNumber}`,
      },
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

    res.status(201).json(order);
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

router.put('/:id', requireRole(['ADMIN']), async (req, res, next) => {
  try {
    if (hasRole(req, 'CLIENT')) {
      const access = await resolveClientAccess(prisma, req.user.userId);
      const order = await prisma.clientOrder.findUnique({
        where: { clientOrderId: Number(req.params.id) },
        include: { client: true },
      });
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }
      if (!canAccessClientOwnedRecord(access, order)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      return res.status(403).json({ error: 'Clients cannot approve or override order/payment status. Please upload payment proof instead.' });
    }

    if (hasRole(req, 'SALES_AGENT') && !hasRole(req, 'ADMIN')) {
      const scopedOrder = await prisma.clientOrder.findUnique({
        where: { clientOrderId: Number(req.params.id) },
      });
      if (!scopedOrder) {
        return res.status(404).json({ error: 'Order not found' });
      }
      if (scopedOrder.assignedSalesAgentId !== req.user.userId) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }
    if (req.body.assignedSalesAgentId !== undefined && !hasRole(req, 'ADMIN')) {
      return res.status(403).json({ error: 'Only admin can change the assigned sales agent' });
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
    const cancelReason =
      status === 'CANCELLED'
        ? req.body.cancelReason || 'Cancelled'
        : req.body.cancelReason;
    const existing = await prisma.clientOrder.findUnique({
      where: { clientOrderId: Number(req.params.id) },
      include: { items: { include: { product: { include: { category: true } } } } },
    });
    if (!existing) return res.status(404).json({ error: 'Order not found' });
    if (status && !canTransitionOrder(req, existing.status, status)) {
      return res.status(403).json({ error: 'You cannot move this order to that stage.' });
    }
    const assignedSalesAgentId =
      req.body.assignedSalesAgentId === undefined
        ? undefined
        : req.body.assignedSalesAgentId === 'unassigned'
        ? null
        : await validateSalesAgentAssignment(req.body.assignedSalesAgentId);

    await prisma.clientOrder.update({
      where: { clientOrderId: Number(req.params.id) },
      data: {
        status,
        paymentStatus: req.body.paymentStatus ? req.body.paymentStatus.toUpperCase() : undefined,
        cancelReason: cancelReason || undefined,
        assignedSalesAgentId,
      },
    });

    if (req.body.paymentStatus) {
      await ensureClientOrderPayment(
        { ...existing, paymentStatus: req.body.paymentStatus.toUpperCase() },
        req.user.userId,
      );
    }

    const nextStatus = (status || existing.status).toUpperCase();
    const shouldDeduct = ['APPROVED', 'PROCESSING'].includes(nextStatus);
    const shouldCreateDelivery = ['APPROVED', 'PROCESSING', 'SHIPPED', 'DELIVERED'].includes(nextStatus);
    if (shouldDeduct) {
      const existingIssue = await prisma.stockTransaction.findFirst({
        where: {
          type: 'ISSUE',
          notes: { contains: `Order ${existing.orderNumber}` },
        },
      });
      if (!existingIssue && existing.items?.length) {
        const stockCheck = await validateOrderStock(existing.items);
        if (!stockCheck.ok) {
          return res.status(400).json({ error: stockCheck.error });
        }
        for (const item of existing.items) {
          if (!item.productId) continue;
          const product = item.product;
          if (!product) continue;
          const newBalance = product.qtyOnHand - item.quantity;
          const statusValue =
            newBalance <= 0
              ? 'OUT_OF_STOCK'
              : newBalance <= product.lowStockThreshold
              ? 'LOW_STOCK'
              : 'AVAILABLE';
          await prisma.product.update({
            where: { productId: product.productId },
            data: { qtyOnHand: newBalance, status: statusValue },
          });
          await prisma.stockTransaction.create({
            data: {
              productId: product.productId,
              type: 'ISSUE',
              qtyChange: -item.quantity,
              newBalance,
              userId: req.user.userId,
              notes: `Project: ${existing.project?.projectName || 'Unknown'} | Order ${existing.orderNumber}`,
            },
          });
        }
        await prisma.auditLog.create({
          data: {
            userId: req.user.userId,
            action: 'UPDATE',
            target: 'Stock',
            details: `Issued stock for order ${existing.orderNumber}`,
          },
        });
      }
    }

    if (shouldCreateDelivery) {
      const existingDelivery = await prisma.delivery.findFirst({
        where: { clientOrderId: existing.clientOrderId, deletedAt: null },
      });
      if (!existingDelivery) {
        await createDeliveryBatchesForOrder(existing, req.user.userId, nextStatus);
      } else {
        if ((nextStatus === 'APPROVED' || nextStatus === 'PROCESSING') && existingDelivery.status !== 'PENDING') {
          await prisma.delivery.update({
            where: { deliveryId: existingDelivery.deliveryId },
            data: { status: 'PENDING' },
          });
        }
        if (nextStatus === 'DELIVERED' && existingDelivery.status !== 'DELIVERED') {
          await prisma.delivery.update({
            where: { deliveryId: existingDelivery.deliveryId },
            data: { status: 'DELIVERED', receivedAt: new Date() },
          });
        }
      }
    }

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

    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: 'UPDATE',
        target: 'ClientOrder',
        details: `Updated order ${existing.orderNumber}`,
      },
    });

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
    next(err);
  }
});

router.post('/:id/payment-proof', requireRole(['CLIENT']), upload.single('proof'), async (req, res, next) => {
  try {
    const referenceNumber = String(req.body?.referenceNumber || '').trim();
    const paymentMethod = String(req.body?.paymentMethod || req.body?.method || 'CHEQUE').trim().toUpperCase();
    const amount = req.body?.amount !== undefined && req.body?.amount !== '' ? Number(req.body.amount) : undefined;
    const notes = String(req.body?.notes || '').trim();
    if (!['CHEQUE', 'AUTO_DEPOSIT'].includes(paymentMethod)) {
      return res.status(400).json({ error: 'Client payment method must be Cheque or Auto Deposit.' });
    }
    if (!req.file && !referenceNumber) {
      return res.status(400).json({ error: 'Payment proof file or reference number is required' });
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
        amount: amount === undefined || Number.isNaN(amount) ? undefined : amount,
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
