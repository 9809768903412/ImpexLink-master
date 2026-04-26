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
        include: { product: true, user: true },
        where,
        skip: pagination ? (pagination.page - 1) * pagination.pageSize : undefined,
        take: pagination ? pagination.pageSize : undefined,
        orderBy: { date: 'desc' },
      }),
      prisma.stockTransaction.count({ where }),
    ]);

    const data = txns.map((t) => ({
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
