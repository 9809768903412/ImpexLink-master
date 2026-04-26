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
    const unread = req.query.unread === 'true';
    const userId = req.user?.userId;
    const where = {
      AND: [
        q
          ? {
              OR: [
                { title: { contains: q, mode: 'insensitive' } },
                { message: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {},
        unread ? { read: false } : {},
        userId ? { userId } : {},
      ],
    };
    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        skip: pagination ? (pagination.page - 1) * pagination.pageSize : undefined,
        take: pagination ? pagination.pageSize : undefined,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.notification.count({ where }),
    ]);
    const data = notifications.map((n) => ({
      id: n.notificationId.toString(),
      type: n.type.toLowerCase().replace(/_/g, '-'),
      title: n.title,
      message: n.message,
      read: n.read,
      createdAt: n.createdAt.toISOString(),
      link: n.link || undefined,
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
    const notification = await prisma.notification.create({
      data: {
        type: req.body.type ? req.body.type.toUpperCase().replace(/-/g, '_') : 'AI_ALERT',
        title: req.body.title,
        message: req.body.message,
        userId: req.user.userId,
        link: req.body.link || null,
      },
    });
    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: 'NOTIFY',
        target: 'Notification',
        details: `Created notification ${notification.notificationId}`,
      },
    });
    res.status(201).json(notification);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const notification = await prisma.notification.update({
      where: { notificationId: Number(req.params.id) },
      data: { read: Boolean(req.body.read) },
    });
    res.json(notification);
  } catch (err) {
    next(err);
  }
});

router.post('/mark-all-read', async (_req, res, next) => {
  try {
    await prisma.notification.updateMany({ where: { userId: _req.user.userId }, data: { read: true } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.notification.delete({ where: { notificationId: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/', async (_req, res, next) => {
  try {
    await prisma.notification.deleteMany({ where: { userId: _req.user.userId } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
