const express = require('express');
const prisma = require('../utils/prisma');
const { parsePagination, buildPaginatedResponse, parseSort } = require('../utils/pagination');
const { requireAuth, requireRole } = require('../middleware/auth');
const { isNonEmptyString, isNonNegativeNumber } = require('../utils/validate');

const router = express.Router();
router.use(requireAuth);

function resolveStatus(qtyOnHand, lowStockThreshold) {
  if (qtyOnHand <= 0) return 'OUT_OF_STOCK';
  if (qtyOnHand <= lowStockThreshold) return 'LOW_STOCK';
  return 'AVAILABLE';
}

async function notifyWatchers(productId, itemName) {
  if (!productId) return;
  const watches = await prisma.productWatch.findMany({
    where: { productId },
    include: { user: true },
  });
  if (watches.length === 0) return;
  const notifications = watches
    .filter((w) => w.userId)
    .map((w) => ({
      userId: w.userId,
      type: 'LOW_STOCK',
      title: 'Item back in stock',
      message: `${itemName} is now available.`,
      link: '/client/order',
    }));
  if (notifications.length > 0) {
    await prisma.notification.createMany({ data: notifications });
    await prisma.auditLog.create({
      data: {
        action: 'NOTIFY',
        target: 'Notification',
        details: `Sent ${notifications.length} back-in-stock notifications for ${itemName}`,
      },
    });
  }
  await prisma.productWatch.deleteMany({ where: { productId } });
}

router.get('/', async (req, res, next) => {
  try {
    const roleList = Array.isArray(req.user?.roles)
      ? req.user.roles.map((role) => String(role).toUpperCase())
      : [String(req.user?.role || '').toUpperCase()];
    const pagination = parsePagination(req.query);
    const q = req.query.q ? String(req.query.q) : '';
    const category = roleList.includes('PAINT_CHEMIST')
      ? 'Paint & Consumables'
      : req.query.category
        ? String(req.query.category)
        : '';
    const includeDeleted = req.query.includeDeleted === 'true';
    const onlyDeleted = req.query.onlyDeleted === 'true';
    const where = {
      AND: [
        onlyDeleted ? { deletedAt: { not: null } } : includeDeleted ? {} : { deletedAt: null },
        q
          ? {
              OR: [
                { itemName: { contains: q, mode: 'insensitive' } },
                { unit: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {},
        category ? { category: { categoryName: { equals: category } } } : {},
      ],
    };

    const sort = parseSort(req.query, ['itemName', 'qtyOnHand', 'unitPrice', 'status']);
    const orderBy = sort ? { [sort.sortBy]: sort.sortDir } : { itemName: 'asc' };
    const [products, total] = await Promise.all([
      prisma.product.findMany({
        include: { category: true },
        where,
        skip: pagination ? (pagination.page - 1) * pagination.pageSize : undefined,
        take: pagination ? pagination.pageSize : undefined,
        orderBy,
      }),
      prisma.product.count({ where }),
    ]);
    const data = products.map((p) => ({
      id: p.productId.toString(),
      name: p.itemName,
      category: p.category?.categoryName || 'Uncategorized',
      unit: p.unit,
      unitPrice: Number(p.unitPrice),
      qtyOnHand: p.qtyOnHand,
      status:
        p.status === 'OUT_OF_STOCK'
          ? 'out-of-stock'
          : p.status === 'LOW_STOCK'
          ? 'low-stock'
          : 'in-stock',
      minStock: p.lowStockThreshold,
      shelfLifeDays: p.shelfLifeDays,
      description: null,
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
    const { itemName, unit, unitPrice, categoryId, categoryName, qtyOnHand, lowStockThreshold } = req.body;
    if (!isNonEmptyString(itemName)) return res.status(400).json({ error: 'Item name is required' });
    if (unitPrice !== undefined && !isNonNegativeNumber(unitPrice)) {
      return res.status(400).json({ error: 'Unit price must be 0 or greater' });
    }
    if (qtyOnHand !== undefined && !isNonNegativeNumber(qtyOnHand)) {
      return res.status(400).json({ error: 'Qty on hand must be 0 or greater' });
    }
    if (lowStockThreshold !== undefined && !isNonNegativeNumber(lowStockThreshold)) {
      return res.status(400).json({ error: 'Low stock threshold must be 0 or greater' });
    }
    const status = resolveStatus(qtyOnHand ?? 0, lowStockThreshold ?? 20);
    let resolvedCategoryId = categoryId ? Number(categoryId) : null;

    if (!resolvedCategoryId && categoryName) {
      const category = await prisma.productCategory.upsert({
        where: { categoryName },
        update: {},
        create: { categoryName },
      });
      resolvedCategoryId = category.categoryId;
    }

    const product = await prisma.product.create({
      data: {
        itemName,
        unit,
        unitPrice,
        categoryId: resolvedCategoryId,
        qtyOnHand: qtyOnHand ?? 0,
        lowStockThreshold: lowStockThreshold ?? 20,
        shelfLifeDays: req.body.shelfLifeDays ? Number(req.body.shelfLifeDays) : 180,
        status,
      },
    });

    if ((qtyOnHand ?? 0) > 0) {
      await prisma.stockTransaction.create({
        data: {
          productId: product.productId,
          type: 'PURCHASE',
          qtyChange: Number(qtyOnHand ?? 0),
          newBalance: product.qtyOnHand,
          userId: req.user.userId,
          notes: `Initial stock for ${product.itemName}`,
        },
      });
    }

    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: 'CREATE',
        target: 'Product',
        details: `Created product ${product.itemName}`,
      },
    });

    res.status(201).json(product);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const product = await prisma.product.findUnique({
      where: { productId: Number(req.params.id) },
      include: { category: true },
    });
    if (!product) return res.status(404).json({ error: 'Not found' });
    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: 'VIEW',
        target: 'Product',
        details: `Viewed product ${product.itemName}`,
      },
    });
    res.json(product);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireRole(['ADMIN']), async (req, res, next) => {
  try {
    const { qtyOnHand, lowStockThreshold, categoryName } = req.body;
    if (req.body.itemName !== undefined && !isNonEmptyString(req.body.itemName)) {
      return res.status(400).json({ error: 'Item name is required' });
    }
    if (qtyOnHand !== undefined && !isNonNegativeNumber(qtyOnHand)) {
      return res.status(400).json({ error: 'Qty on hand must be 0 or greater' });
    }
    if (lowStockThreshold !== undefined && !isNonNegativeNumber(lowStockThreshold)) {
      return res.status(400).json({ error: 'Low stock threshold must be 0 or greater' });
    }
    if (req.body.unitPrice !== undefined && !isNonNegativeNumber(req.body.unitPrice)) {
      return res.status(400).json({ error: 'Unit price must be 0 or greater' });
    }
    const existing = await prisma.product.findUnique({ where: { productId: Number(req.params.id) } });
    const status = resolveStatus(qtyOnHand ?? 0, lowStockThreshold ?? 20);
    let resolvedCategoryId = req.body.categoryId ? Number(req.body.categoryId) : undefined;

    if (!resolvedCategoryId && categoryName) {
      const category = await prisma.productCategory.upsert({
        where: { categoryName },
        update: {},
        create: { categoryName },
      });
      resolvedCategoryId = category.categoryId;
    }

    const product = await prisma.product.update({
      where: { productId: Number(req.params.id) },
      data: {
        itemName: req.body.itemName,
        unit: req.body.unit,
        unitPrice: req.body.unitPrice,
        categoryId: resolvedCategoryId,
        qtyOnHand,
        lowStockThreshold,
        shelfLifeDays: req.body.shelfLifeDays ? Number(req.body.shelfLifeDays) : undefined,
        status,
      },
    });

    if (existing && typeof qtyOnHand === 'number' && qtyOnHand !== existing.qtyOnHand) {
      const diff = qtyOnHand - existing.qtyOnHand;
      await prisma.stockTransaction.create({
        data: {
          productId: product.productId,
          type: 'ADJUSTMENT',
          qtyChange: diff,
          newBalance: qtyOnHand,
          userId: req.user.userId,
          notes: `Manual adjustment for ${product.itemName}`,
        },
      });
    }

    if (existing && typeof qtyOnHand === 'number' && existing.qtyOnHand <= 0 && qtyOnHand > 0) {
      await notifyWatchers(product.productId, product.itemName);
    }

    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: 'UPDATE',
        target: 'Product',
        details: `Updated product ${product.itemName}`,
      },
    });

    res.json(product);
  } catch (err) {
    next(err);
  }
});

router.put('/:id/stock', requireRole(['ADMIN', 'WAREHOUSE_STAFF']), async (req, res, next) => {
  try {
    const { qtyChange, type, notes } = req.body;
    if (qtyChange === undefined || Number.isNaN(Number(qtyChange))) {
      return res.status(400).json({ error: 'Quantity change is required' });
    }
    if (!isNonNegativeNumber(Math.abs(Number(qtyChange)))) {
      return res.status(400).json({ error: 'Invalid quantity change' });
    }
    if (type) {
      const allowed = ['PURCHASE', 'ISSUE', 'ADJUSTMENT', 'RETURN'];
      const normalized = String(type).toUpperCase();
      if (!allowed.includes(normalized)) {
        return res.status(400).json({ error: 'Invalid stock transaction type' });
      }
    }
    const product = await prisma.product.findUnique({
      where: { productId: Number(req.params.id) },
    });
    if (!product) return res.status(404).json({ error: 'Not found' });

    const newBalance = product.qtyOnHand + Number(qtyChange || 0);
    if (newBalance < 0) {
      return res.status(400).json({ error: 'Insufficient stock for this adjustment' });
    }
    const status = resolveStatus(newBalance, product.lowStockThreshold);

    const updated = await prisma.product.update({
      where: { productId: product.productId },
      data: { qtyOnHand: newBalance, status },
    });

    await prisma.stockTransaction.create({
      data: {
        productId: product.productId,
        type: type ? String(type).toUpperCase() : 'ADJUSTMENT',
        qtyChange: Number(qtyChange || 0),
        newBalance,
        userId: req.user.userId,
        notes: notes || null,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: 'UPDATE',
        target: 'Stock',
        details: `${type || 'ADJUSTMENT'} ${qtyChange} for ${product.itemName} (new balance ${newBalance})`,
      },
    });

    if (product.qtyOnHand <= 0 && newBalance > 0) {
      await notifyWatchers(product.productId, product.itemName);
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/watch', async (req, res, next) => {
  try {
    const productId = Number(req.params.id);
    if (!productId) return res.status(400).json({ error: 'Invalid product id' });
    const existing = await prisma.productWatch.findFirst({
      where: { productId, userId: req.user.userId },
    });
    if (existing) {
      return res.json({ ok: true, message: 'Already watching' });
    }
    await prisma.productWatch.create({
      data: { productId, userId: req.user.userId },
    });
    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: 'CREATE',
        target: 'ProductWatch',
        details: `User is watching product ${productId}`,
      },
    });
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireRole(['ADMIN']), async (req, res, next) => {
  try {
    const productId = Number(req.params.id);
    await prisma.product.update({
      where: { productId },
      data: { deletedAt: new Date() },
    });
    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: 'DELETE',
        target: 'Product',
        details: `Soft-deleted product ${productId}`,
      },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.put('/:id/restore', requireRole(['ADMIN']), async (req, res, next) => {
  try {
    const productId = Number(req.params.id);
    const product = await prisma.product.update({
      where: { productId },
      data: { deletedAt: null },
    });
    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: 'RESTORE',
        target: 'Product',
        details: `Restored product ${productId}`,
      },
    });
    res.json(product);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
