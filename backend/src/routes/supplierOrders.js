const express = require('express');
const prisma = require('../utils/prisma');
const { parsePagination, buildPaginatedResponse, parseSort } = require('../utils/pagination');
const { requireAuth, requireRole } = require('../middleware/auth');
const { isPositiveInt, isNonNegativeNumber, isNonEmptyString } = require('../utils/validate');

const router = express.Router();
router.use(requireAuth);

function normalizeSupplierTerms(terms) {
  const normalized = String(terms || 'Net 30').trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (normalized.includes('15')) return { method: 'NET_15', creditDays: 15 };
  if (normalized.includes('60')) return { method: 'NET_60', creditDays: 60 };
  if (normalized.includes('CASH')) return { method: 'CASH', creditDays: 0 };
  if (normalized.includes('GCASH')) return { method: 'GCASH', creditDays: 0 };
  if (normalized.includes('CHEQUE') || normalized.includes('CHECK')) return { method: 'CHEQUE', creditDays: 0 };
  return { method: 'NET_30', creditDays: 30 };
}

function paymentStatusFromPoStatus(status) {
  const normalized = String(status || 'PENDING').toUpperCase();
  if (normalized === 'PAID') return 'PAID';
  if (normalized === 'RECEIVED') return 'RECEIVED';
  if (normalized === 'DRAFT') return 'PENDING';
  return 'PENDING';
}

function dueDateFromTerms(orderDate = new Date(), creditDays = 30) {
  const date = new Date(orderDate);
  date.setDate(date.getDate() + Number(creditDays || 0));
  return date;
}

async function ensureSupplierOrderPayment(order, userId, overrides = {}) {
  if (!order?.orderId) return null;
  const existing = await prisma.paymentTransaction.findFirst({
    where: {
      direction: 'OFFICE_TO_SUPPLIER',
      supplierOrderId: order.orderId,
    },
  });
  const terms = normalizeSupplierTerms(order.terms || existing?.method);
  const status = overrides.status || paymentStatusFromPoStatus(order.status);
  const creditDays = Number(overrides.creditDays ?? existing?.creditDays ?? terms.creditDays);
  const data = {
    method: overrides.method || existing?.method || terms.method,
    status,
    amount: Number(overrides.amount ?? order.total ?? 0),
    creditDays,
    dueDate: overrides.dueDate || existing?.dueDate || dueDateFromTerms(order.orderDate || new Date(), creditDays),
    paidAt:
      overrides.paidAt !== undefined
        ? overrides.paidAt
        : status === 'PAID'
        ? existing?.paidAt || new Date()
        : null,
    referenceNumber: overrides.referenceNumber !== undefined ? overrides.referenceNumber : existing?.referenceNumber || null,
    notes: overrides.notes !== undefined ? overrides.notes : existing?.notes || 'Created from purchase order flow',
    supplierId: order.supplierId || existing?.supplierId || null,
    supplierOrderId: order.orderId,
    createdById: existing?.createdById || userId || null,
  };
  if (existing) {
    return prisma.paymentTransaction.update({
      where: { paymentId: existing.paymentId },
      data,
    });
  }
  return prisma.paymentTransaction.create({
    data: {
      direction: 'OFFICE_TO_SUPPLIER',
      ...data,
    },
  });
}

async function getReceivedQuantities(orderId, items = []) {
  const productIds = items.map((item) => item.productId).filter(Boolean);
  if (!orderId || productIds.length === 0) return new Map();
  const transactions = await prisma.stockTransaction.findMany({
    where: {
      type: 'PURCHASE',
      productId: { in: productIds },
      notes: { contains: `PO ${orderId}` },
    },
    select: { productId: true, qtyChange: true },
  });
  return transactions.reduce((acc, tx) => {
    acc.set(tx.productId, (acc.get(tx.productId) || 0) + Number(tx.qtyChange || 0));
    return acc;
  }, new Map());
}

async function notifyClientOrderDelay(orderIds, reason, eta, actorId, sourceLabel) {
  const ids = [...new Set((orderIds || []).map(Number).filter(isPositiveInt))];
  if (ids.length === 0) return 0;
  const orders = await prisma.clientOrder.findMany({
    where: { clientOrderId: { in: ids } },
    include: { client: true },
  });
  let sent = 0;
  for (const order of orders) {
    if (!order.client?.email) continue;
    const user = await prisma.user.findUnique({ where: { email: order.client.email } });
    if (!user) continue;
    await prisma.notification.create({
      data: {
        userId: user.userId,
        type: 'PROJECT_UPDATE',
        title: 'Supplier delay may affect your order',
        message: `${sourceLabel} may delay order ${order.orderNumber}. Reason: ${reason || 'Supplier delivery delay'}.${eta ? ` Updated estimate: ${new Date(eta).toLocaleDateString('en-PH')}.` : ''}`,
        link: '/client/orders',
      },
    });
    sent += 1;
  }
  await prisma.auditLog.create({
    data: {
      userId: actorId,
      action: 'NOTIFY',
      target: 'ClientOrder',
      details: `Supplier delay notification sent for ${ids.length} order(s): ${reason || 'No reason provided'}`,
    },
  });
  return sent;
}

router.get('/', requireRole(['ADMIN', 'WAREHOUSE_STAFF']), async (req, res, next) => {
  try {
    const pagination = parsePagination(req.query);
    const q = req.query.q ? String(req.query.q) : '';
    const status = req.query.status ? String(req.query.status).toUpperCase() : '';
    const includeDeleted = req.query.includeDeleted === 'true';
    const onlyDeleted = req.query.onlyDeleted === 'true';
    const where = {
      AND: [
        onlyDeleted ? { deletedAt: { not: null } } : includeDeleted ? {} : { deletedAt: null },
        q
          ? {
              OR: [
                { supplier: { supplierName: { contains: q, mode: 'insensitive' } } },
                { remarks: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {},
        status ? { status } : {},
      ],
    };
    const sort = parseSort(req.query, ['orderDate', 'status', 'total']);
    const orderBy = sort ? { [sort.sortBy]: sort.sortDir } : { orderDate: 'desc' };
    const [orders, total] = await Promise.all([
      prisma.supplierOrder.findMany({
        include: { supplier: true, project: true, items: { include: { product: true } } },
        where,
        skip: pagination ? (pagination.page - 1) * pagination.pageSize : undefined,
        take: pagination ? pagination.pageSize : undefined,
        orderBy,
      }),
      prisma.supplierOrder.count({ where }),
    ]);

    const receivedMaps = await Promise.all(orders.map((order) => getReceivedQuantities(order.orderId, order.items)));
    const data = orders.map((order, orderIndex) => ({
      id: order.orderId.toString(),
      poNumber: `PO-${new Date(order.orderDate).getFullYear()}-${String(order.orderId).padStart(4, '0')}`,
      supplierId: order.supplierId?.toString() || null,
      supplierName: order.supplier?.supplierName || 'Unknown Supplier',
      projectId: order.projectId?.toString() || null,
      projectName: order.project?.projectName || null,
      date: order.orderDate.toISOString().split('T')[0],
      terms: order.terms || 'Net 30',
      items: order.items.map((item) => {
        const receivedQuantity = item.productId ? receivedMaps[orderIndex].get(item.productId) || 0 : 0;
        return {
          itemId: item.productId?.toString() || '',
          itemName: item.product?.itemName || 'Item',
          unit: item.product?.unit || '',
          quantity: item.quantity,
          receivedQuantity,
          remainingQuantity: Math.max(item.quantity - receivedQuantity, 0),
          unitPrice: Number(item.unitPrice),
          amount: Number(item.unitPrice) * item.quantity,
        };
      }),
      subtotal: Number(order.subtotal || 0),
      vat: Number(order.vat || 0),
      total: Number(order.total || 0),
      status: order.status.toLowerCase(),
      remarks: order.remarks || '',
      approvedBy: order.approvedBy || null,
      approvedById: order.approvedById?.toString() || null,
    }));

    if (pagination) {
      return res.json(buildPaginatedResponse(data, total, pagination.page, pagination.pageSize));
    }
    return res.json(data);
  } catch (err) {
    next(err);
  }
});

router.post('/', requireRole(['ADMIN']), async (req, res, next) => {
  try {
    const { supplierId, projectId, terms, remarks, items } = req.body;
    if (!supplierId || !isPositiveInt(supplierId)) return res.status(400).json({ error: 'Supplier is required' });
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one item is required' });
    }
    if (items.some((item) => Number(item.quantity || 0) <= 0)) {
      return res.status(400).json({ error: 'Quantity must be greater than 0' });
    }
    if (items.some((item) => !isNonNegativeNumber(item.unitPrice))) {
      return res.status(400).json({ error: 'Unit price must be 0 or greater' });
    }
    if (projectId && !isPositiveInt(projectId)) {
      return res.status(400).json({ error: 'Invalid project' });
    }
    const subtotal = Array.isArray(items)
      ? items.reduce((sum, item) => sum + Number(item.unitPrice || 0) * Number(item.quantity || 0), 0)
      : 0;
    const vat = subtotal * 0.12;
    const total = subtotal + vat;

    const order = await prisma.supplierOrder.create({
      data: {
        supplierId: supplierId ? Number(supplierId) : null,
        projectId: projectId ? Number(projectId) : null,
        terms: isNonEmptyString(terms) ? terms : undefined,
        remarks,
        subtotal,
        vat,
        total,
        status: 'PENDING',
        items: {
          create: Array.isArray(items)
            ? items.map((item) => ({
                productId: item.itemId ? Number(item.itemId) : null,
                quantity: Number(item.quantity || 0),
                unitPrice: Number(item.unitPrice || 0),
              }))
            : [],
        },
      },
      include: { items: true },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: 'CREATE',
        target: 'PurchaseOrder',
        details: `Created PO ${order.orderId}`,
      },
    });

    await ensureSupplierOrderPayment(order, req.user.userId);
    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: 'CREATE',
        target: 'Payment',
        details: `Created supplier payable for PO ${order.orderId}`,
      },
    });

    res.status(201).json(order);
  } catch (err) {
    next(err);
  }
});

router.post('/auto', requireRole(['ADMIN', 'WAREHOUSE_STAFF']), async (req, res, next) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: 'Items required' });
    if (items.some((item) => !isNonNegativeNumber(item.estimatedCost))) {
      return res.status(400).json({ error: 'Estimated cost must be 0 or greater' });
    }

    const subtotal = items.reduce((sum, item) => sum + Number(item.estimatedCost || 0), 0);
    const vat = subtotal * 0.12;
    const total = subtotal + vat;

    const order = await prisma.supplierOrder.create({
      data: {
        terms: 'Net 30',
        subtotal,
        vat,
        total,
        status: 'PENDING',
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: 'CREATE',
        target: 'PurchaseOrder',
        details: `Auto-created PO ${order.orderId}`,
      },
    });

    await ensureSupplierOrderPayment(order, req.user.userId);
    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: 'CREATE',
        target: 'Payment',
        details: `Created supplier payable for auto PO ${order.orderId}`,
      },
    });

    res.status(201).json(order);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireRole(['ADMIN']), async (req, res, next) => {
  try {
    if (req.body.status) {
      const status = req.body.status.toUpperCase();
      if (!['DRAFT', 'PENDING', 'APPROVED', 'ORDERED', 'RECEIVED', 'PAID'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }
    }
    if (req.body.approvedById && !isPositiveInt(req.body.approvedById)) {
      return res.status(400).json({ error: 'Invalid approver' });
    }
    const existing = await prisma.supplierOrder.findUnique({
      where: { orderId: Number(req.params.id) },
      include: { items: { include: { product: true } } },
    });
    if (!existing) return res.status(404).json({ error: 'Purchase order not found' });

    const order = await prisma.supplierOrder.update({
      where: { orderId: Number(req.params.id) },
      data: {
        status: req.body.status ? req.body.status.toUpperCase() : undefined,
        remarks: req.body.remarks,
        approvedBy: req.body.approvedBy,
        approvedById: req.body.approvedById ? Number(req.body.approvedById) : undefined,
      },
    });

    await ensureSupplierOrderPayment(order, req.user.userId);

    const nextStatus = (req.body.status || order.status || '').toUpperCase();
    if (nextStatus === 'RECEIVED' && existing.items?.length) {
      const receivedMap = await getReceivedQuantities(order.orderId, existing.items);
      for (const item of existing.items) {
        if (!item.productId) continue;
        const product = item.product;
        if (!product) continue;
        const remainingQty = Math.max(item.quantity - (receivedMap.get(item.productId) || 0), 0);
        if (remainingQty <= 0) continue;
        const newBalance = product.qtyOnHand + remainingQty;
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
            supplierId: existing.supplierId || order.supplierId || null,
            type: 'PURCHASE',
            qtyChange: remainingQty,
            newBalance,
            userId: req.user.userId,
            notes: `Received PO ${order.orderId}`,
          },
        });
      }
      await prisma.auditLog.create({
        data: {
          userId: req.user.userId,
          action: 'UPDATE',
          target: 'Stock',
          details: `Restocked items from PO ${order.orderId}`,
        },
      });
    }

    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: 'UPDATE',
        target: 'PurchaseOrder',
        details: `Updated PO ${order.orderId}`,
      },
    });

    res.json(order);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/receive', requireRole(['ADMIN', 'WAREHOUSE_STAFF']), async (req, res, next) => {
  try {
    const orderId = Number(req.params.id);
    const receiptItems = Array.isArray(req.body.items) ? req.body.items : [];
    const notes = String(req.body.notes || '').trim();
    if (!isPositiveInt(orderId)) return res.status(400).json({ error: 'Invalid purchase order' });
    if (receiptItems.length === 0) return res.status(400).json({ error: 'At least one received item is required' });
    if (receiptItems.some((item) => Number(item.quantity || 0) < 0)) {
      return res.status(400).json({ error: 'Received quantities must be 0 or greater' });
    }
    const existing = await prisma.supplierOrder.findUnique({
      where: { orderId },
      include: { supplier: true, project: true, items: { include: { product: true } } },
    });
    if (!existing) return res.status(404).json({ error: 'Purchase order not found' });
    if (!['ORDERED', 'APPROVED', 'PENDING'].includes(existing.status)) {
      return res.status(400).json({ error: 'Only pending, approved, or ordered POs can receive stock.' });
    }
    const receivedMap = await getReceivedQuantities(orderId, existing.items);
    const requestedByProduct = new Map();
    for (const item of receiptItems) {
      const productId = Number(item.itemId || item.productId);
      const quantity = Number(item.quantity || 0);
      if (!productId || quantity <= 0) continue;
      requestedByProduct.set(productId, (requestedByProduct.get(productId) || 0) + quantity);
    }
    if (requestedByProduct.size === 0) return res.status(400).json({ error: 'Enter at least one positive received quantity' });

    await prisma.$transaction(async (tx) => {
      for (const poItem of existing.items) {
        if (!poItem.productId || !requestedByProduct.has(poItem.productId)) continue;
        const quantity = requestedByProduct.get(poItem.productId);
        const alreadyReceived = receivedMap.get(poItem.productId) || 0;
        const remaining = poItem.quantity - alreadyReceived;
        if (quantity > remaining) {
          throw new Error(`${poItem.product?.itemName || 'Item'} can only receive ${remaining} more.`);
        }
        const product = await tx.product.findUnique({ where: { productId: poItem.productId } });
        if (!product) continue;
        const newBalance = product.qtyOnHand + quantity;
        const statusValue =
          newBalance <= 0 ? 'OUT_OF_STOCK' : newBalance <= product.lowStockThreshold ? 'LOW_STOCK' : 'AVAILABLE';
        await tx.product.update({
          where: { productId: product.productId },
          data: { qtyOnHand: newBalance, status: statusValue },
        });
        await tx.stockTransaction.create({
          data: {
            productId: product.productId,
            supplierId: existing.supplierId || null,
            type: 'PURCHASE',
            qtyChange: quantity,
            newBalance,
            userId: req.user.userId,
            notes: [`Received PO ${orderId}`, `Item ${poItem.orderItemId}`, notes].filter(Boolean).join(' | '),
          },
        });
      }
    });

    const updatedReceivedMap = await getReceivedQuantities(orderId, existing.items);
    const fullyReceived = existing.items.every((item) => {
      if (!item.productId) return true;
      return (updatedReceivedMap.get(item.productId) || 0) >= item.quantity;
    });
    const status = fullyReceived ? 'RECEIVED' : 'ORDERED';
    const order = await prisma.supplierOrder.update({
      where: { orderId },
      data: {
        status,
        remarks: [existing.remarks, notes ? `Receipt note: ${notes}` : null, fullyReceived ? 'Fully received.' : 'Partially received.']
          .filter(Boolean)
          .join('\n'),
      },
      include: { items: true },
    });
    await ensureSupplierOrderPayment(order, req.user.userId, { status: paymentStatusFromPoStatus(status) });
    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: 'RECEIVE',
        target: 'PurchaseOrder',
        details: `${fullyReceived ? 'Fully' : 'Partially'} received PO ${orderId}${notes ? `: ${notes}` : ''}`,
      },
    });
    res.json({ ok: true, status: status.toLowerCase(), fullyReceived });
  } catch (err) {
    if (err.message && err.message.includes('can only receive')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.post('/:id/delay-impact', requireRole(['ADMIN', 'WAREHOUSE_STAFF']), async (req, res, next) => {
  try {
    const orderId = Number(req.params.id);
    const reason = String(req.body.reason || '').trim();
    if (!isPositiveInt(orderId)) return res.status(400).json({ error: 'Invalid purchase order' });
    if (!reason) return res.status(400).json({ error: 'Delay reason is required' });
    const order = await prisma.supplierOrder.findUnique({
      where: { orderId },
      include: { supplier: true },
    });
    if (!order) return res.status(404).json({ error: 'Purchase order not found' });
    const notifyCount = await notifyClientOrderDelay(
      req.body.clientOrderIds,
      reason,
      req.body.eta,
      req.user.userId,
      `Supplier PO ${orderId}${order.supplier?.supplierName ? ` from ${order.supplier.supplierName}` : ''}`
    );
    await prisma.supplierOrder.update({
      where: { orderId },
      data: {
        remarks: [order.remarks, `Supplier delay: ${reason}${req.body.eta ? ` | ETA: ${new Date(req.body.eta).toLocaleDateString('en-PH')}` : ''}`]
          .filter(Boolean)
          .join('\n'),
      },
    });
    res.json({ ok: true, notified: notifyCount });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireRole(['ADMIN']), async (req, res, next) => {
  try {
    const orderId = Number(req.params.id);
    await prisma.supplierOrder.update({
      where: { orderId },
      data: { deletedAt: new Date() },
    });
    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: 'DELETE',
        target: 'Purchase Order',
        details: `Soft-deleted supplier order ${orderId}`,
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
    const order = await prisma.supplierOrder.update({
      where: { orderId },
      data: { deletedAt: null },
    });
    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: 'RESTORE',
        target: 'SupplierOrder',
        details: `Restored PO ${orderId}`,
      },
    });
    res.json(order);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
