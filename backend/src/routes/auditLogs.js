const express = require('express');
const prisma = require('../utils/prisma');
const { parsePagination, buildPaginatedResponse } = require('../utils/pagination');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);
router.use(requireRole(['ADMIN', 'PRESIDENT']));

router.get('/', async (req, res, next) => {
  try {
    const pagination = parsePagination(req.query);
    const q = req.query.q ? String(req.query.q) : '';
    const action = req.query.action ? String(req.query.action).toUpperCase() : '';
    const userId = req.query.userId ? Number(req.query.userId) : null;
    const where = {
      AND: [
        q
          ? {
              OR: [
                { target: { contains: q, mode: 'insensitive' } },
                { details: { contains: q, mode: 'insensitive' } },
                { user: { fullName: { contains: q, mode: 'insensitive' } } },
              ],
            }
          : {},
        action ? { action } : {},
        userId ? { userId } : {},
      ],
    };
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        include: { user: true },
        where,
        skip: pagination ? (pagination.page - 1) * pagination.pageSize : undefined,
        take: pagination ? pagination.pageSize : undefined,
        orderBy: { timestamp: 'desc' },
      }),
      prisma.auditLog.count({ where }),
    ]);

    const data = logs.map((log) => ({
      id: log.logId.toString(),
      userId: log.userId?.toString() || null,
      userName: log.user?.fullName || 'System',
      timestamp: log.timestamp.toISOString(),
      action: log.action,
      target: log.target,
      details: log.details || '',
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
    const log = await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: req.body.action || 'CREATE',
        target: req.body.target || 'System',
        details: req.body.details || '',
      },
    });
    res.status(201).json(log);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.auditLog.delete({ where: { logId: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
