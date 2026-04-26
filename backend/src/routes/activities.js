const express = require('express');
const prisma = require('../utils/prisma');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (_req, res, next) => {
  try {
    const logs = await prisma.auditLog.findMany({
      orderBy: { timestamp: 'desc' },
      take: 20,
    });

    const data = logs.map((log) => ({
      id: log.logId.toString(),
      type: log.target.toLowerCase().includes('order')
        ? 'order'
        : log.target.toLowerCase().includes('inventory')
        ? 'inventory'
        : log.target.toLowerCase().includes('request')
        ? 'request'
        : log.target.toLowerCase().includes('delivery')
        ? 'delivery'
        : log.target.toLowerCase().includes('payment')
        ? 'payment'
        : 'system',
      message: log.details || `${log.action} ${log.target}`,
      timestamp: log.timestamp.toISOString(),
    }));

    res.json(data);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
