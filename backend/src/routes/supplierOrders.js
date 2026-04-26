const express = require('express');
const prisma = require('../utils/prisma');
const { parsePagination, buildPaginatedResponse, parseSort } = require('../utils/pagination');
const { requireAuth, requireRole } = require('../middleware/auth');
const { isPositiveInt, isNonNegativeNumber, isNonEmptyString } = require('../utils/validate');

const router = express.Router();
router.use(requireAuth);

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
        include: { supplier: true, items: { include: { product: true } } },
        where,
        skip: pagination ? (pagination.page - 1) * pagination.pageSize : undefined,
        take: pagination ? pagination.pageSize : undefined,
        orderBy,
      }),
      prisma.supplierOrder.count({ where }),
    ]);

    const data = orders.map((order) => ({
      id: order.orderId.toString(),
      poNumber: `PO-${new Date(order.orderDate).getFullYear()}-${String(order.orderId).padStart(4, '0')}`,
      supplierId: order.supplierId?.toString() || null,
      supplierName: order.supplier?.supplierName || 'Unknown Supplier',
      date: order.orderDate.toISOString().split('T')[0],
      terms: order.terms || 'Net 30',
      items: order.items.map((item) => ({
        itemId: item.productId?.toString() || '',
        itemName: item.product?.itemName || 'Item',
        unit: item.product?.unit || '',
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        amount: Number(item.unitPrice) * item.quantity,
      })),
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

    const nextStatus = (req.body.status || order.status || '').toUpperCase();
    if (nextStatus === 'RECEIVED' && existing.items?.length) {
      for (const item of existing.items) {
        if (!item.productId) continue;
        const product = item.product;
        if (!product) continue;
        const newBalance = product.qtyOnHand + item.quantity;
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
            type: 'PURCHASE',
            qtyChange: item.quantity,
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
