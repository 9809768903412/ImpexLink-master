const express = require('express');
const prisma = require('../utils/prisma');
const { parsePagination, buildPaginatedResponse } = require('../utils/pagination');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const pagination = parsePagination(req.query);
    const q = req.query.q ? String(req.query.q) : '';
    const productId = req.query.productId ? Number(req.query.productId) : null;
    const where = {
      AND: [
        q
          ? {
              OR: [
                { notes: { contains: q, mode: 'insensitive' } },
                { product: { itemName: { contains: q, mode: 'insensitive' } } },
              ],
            }
          : {},
        productId ? { productId } : {},
      ],
    };
    const [txns, total] = await Promise.all([
      prisma.stockTransaction.findMany({
        include: { product: true, user: true, supplier: true },
        where,
        skip: pagination ? (pagination.page - 1) * pagination.pageSize : undefined,
        take: pagination ? pagination.pageSize : undefined,
        orderBy: { date: 'desc' },
      }),
      prisma.stockTransaction.count({ where }),
    ]);
    const poIds = [
      ...new Set(
        txns
          .map((t) => {
            const match = String(t.notes || '').match(/\bPO\s+#?(\d+)\b/i);
            return match ? Number(match[1]) : null;
          })
          .filter(Boolean)
      ),
    ];
    const supplierByPo = poIds.length
      ? new Map(
          (
            await prisma.supplierOrder.findMany({
              where: { orderId: { in: poIds } },
              include: { supplier: true },
            })
          ).map((order) => [
            order.orderId,
            {
              supplierId: order.supplierId?.toString() || null,
              supplierName: order.supplier?.supplierName || null,
            },
          ])
        )
      : new Map();

    const data = txns.map((t) => ({
      ...(() => {
        const match = String(t.notes || '').match(/\bPO\s+#?(\d+)\b/i);
        const linked = match ? supplierByPo.get(Number(match[1])) : null;
        const noteSupplier = String(t.notes || '').match(/\bSupplier:\s*([^|;\n]+)/i);
        const noteProject = String(t.notes || '').match(/\bProject:\s*([^|;\n]+)/i);
        return {
          supplierId: t.supplierId?.toString() || linked?.supplierId || null,
          supplierName: t.supplier?.supplierName || linked?.supplierName || (noteSupplier ? noteSupplier[1].trim() : null),
          projectName: noteProject ? noteProject[1].trim() : null,
        };
      })(),
      id: t.transactionId.toString(),
      itemId: t.productId?.toString() || null,
      date: t.date.toISOString().split('T')[0],
      type: t.type.toLowerCase(),
      qtyChange: t.qtyChange,
      newBalance: t.newBalance,
      userId: t.userId?.toString() || null,
      userName: t.user?.fullName || 'System',
      notes: t.notes || null,
    }));

    if (pagination) {
      return res.json(buildPaginatedResponse(data, total, pagination.page, pagination.pageSize));
    }
    return res.json(data);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const txn = await prisma.stockTransaction.create({
      data: {
        productId: req.body.productId ? Number(req.body.productId) : null,
        supplierId: req.body.supplierId ? Number(req.body.supplierId) : null,
        type: req.body.type ? req.body.type.toUpperCase() : 'ADJUSTMENT',
        qtyChange: Number(req.body.qtyChange || 0),
        newBalance: Number(req.body.newBalance || 0),
        userId: req.user.userId,
        notes: req.body.notes || null,
      },
    });
    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: 'UPDATE',
        target: 'Stock',
        details: `Stock transaction ${txn.transactionId} (${txn.type})`,
      },
    });
    res.status(201).json(txn);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
