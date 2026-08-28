const express = require('express');
const prisma = require('../utils/prisma');
const { parsePagination, buildPaginatedResponse } = require('../utils/pagination');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function isMissingNotificationStoreError(err) {
  return ['P2021', 'P2022'].includes(err?.code);
}

router.get('/', async (req, res, next) => {
  const pagination = parsePagination(req.query);
  try {
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
    if (isMissingNotificationStoreError(err)) {
      const data = [];
      if (pagination) {
        return res.json(buildPaginatedResponse(data, 0, pagination.page, pagination.pageSize));
      }
      return res.json(data);
    }
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
    if (typeof req.body.read !== 'boolean') {
      return res.status(400).json({ error: 'read must be a boolean' });
    }
    const notificationId = Number(req.params.id);
    if (!Number.isSafeInteger(notificationId) || notificationId <= 0) {
      return res.status(400).json({ error: 'Invalid notification id' });
    }
    const existing = await prisma.notification.findFirst({
      where: { notificationId, userId: req.user.userId },
    });
    if (!existing) return res.status(404).json({ error: 'Notification not found' });
    const notification = await prisma.notification.update({
      where: { notificationId },
      data: { read: req.body.read },
    });
    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: 'UPDATE',
        target: 'Notification',
        details: `${notification.read ? 'Marked read' : 'Marked unread'} notification ${notification.notificationId}`,
      },
    });
    res.json(notification);
  } catch (err) {
    next(err);
  }
});

router.post('/mark-all-read', async (_req, res, next) => {
  try {
    const result = await prisma.notification.updateMany({ where: { userId: _req.user.userId }, data: { read: true } });
    await prisma.auditLog.create({
      data: {
        userId: _req.user.userId,
        action: 'UPDATE',
        target: 'Notification',
        details: `Marked ${result.count} notifications as read`,
      },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const notificationId = Number(req.params.id);
    if (!Number.isSafeInteger(notificationId) || notificationId <= 0) {
      return res.status(400).json({ error: 'Invalid notification id' });
    }
    const existing = await prisma.notification.findFirst({
      where: { notificationId, userId: req.user.userId },
    });
    if (!existing) return res.status(404).json({ error: 'Notification not found' });
    const notification = await prisma.notification.delete({ where: { notificationId } });
    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: 'DELETE',
        target: 'Notification',
        details: `Deleted notification ${notification.notificationId}`,
      },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/', async (_req, res, next) => {
  try {
    const result = await prisma.notification.deleteMany({ where: { userId: _req.user.userId } });
    await prisma.auditLog.create({
      data: {
        userId: _req.user.userId,
        action: 'DELETE',
        target: 'Notification',
        details: `Deleted ${result.count} notifications`,
      },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
