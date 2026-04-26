const express = require('express');
const prisma = require('../utils/prisma');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/stats', async (_req, res, next) => {
  try {
    const rangeDays = Number(_req.query.rangeDays || 30);
    const now = new Date();
    const startCurrent = new Date(now);
    startCurrent.setDate(startCurrent.getDate() - rangeDays);
    const startPrevious = new Date(startCurrent);
    startPrevious.setDate(startPrevious.getDate() - rangeDays);

    const products = await prisma.product.findMany();
    const totalItems = products.reduce((sum, p) => sum + p.qtyOnHand, 0);

    const currentTxns = await prisma.stockTransaction.findMany({
      where: { date: { gte: startCurrent, lt: now } },
    });

    const qtyChangeByProduct = currentTxns.reduce((acc, txn) => {
      if (!txn.productId) return acc;
      acc[txn.productId] = (acc[txn.productId] || 0) + txn.qtyChange;
      return acc;
    }, {});

    const lowStockCount = products.filter((p) => p.qtyOnHand <= p.lowStockThreshold).length;
    const lowStockPrevCount = products.filter((p) => {
      const delta = qtyChangeByProduct[p.productId] || 0;
      const startQty = p.qtyOnHand - delta;
      return startQty <= p.lowStockThreshold;
    }).length;

    const totalItemsDelta = currentTxns.reduce((sum, txn) => sum + txn.qtyChange, 0);

    const activeProjects = await prisma.project.count({
      where: { status: 'ACTIVE' },
    });
    const activeProjectsPrev = await prisma.project.count({
      where: {
        status: 'ACTIVE',
        OR: [{ startDate: null }, { startDate: { lte: startCurrent } }],
      },
    });

    const pendingRequests = await prisma.materialRequest.count({
      where: { status: { in: ['PENDING', 'PM_APPROVED'] } },
    });
    const pendingRequestsPrev = await prisma.materialRequest.count({
      where: { status: { in: ['PENDING', 'PM_APPROVED'] }, createdAt: { lt: startCurrent } },
    });

    const ongoingDeliveries = await prisma.delivery.count({
      where: { status: { in: ['PENDING', 'IN_TRANSIT'] } },
    });
    const ongoingDeliveriesPrev = await prisma.delivery.count({
      where: { status: { in: ['PENDING', 'IN_TRANSIT'] }, createdAt: { lt: startCurrent } },
    });

    const percentChange = (current, previous) => {
      if (!previous) return current === 0 ? 0 : null;
      return Math.round(((current - previous) / previous) * 1000) / 10;
    };

    res.json({
      totalItems,
      totalItemsDelta,
      totalItemsPercent: percentChange(totalItems, totalItems - totalItemsDelta),
      lowStockCount,
      lowStockDelta: lowStockCount - lowStockPrevCount,
      lowStockPercent: percentChange(lowStockCount, lowStockPrevCount),
      activeProjects,
      activeProjectsDelta: activeProjects - activeProjectsPrev,
      activeProjectsPercent: percentChange(activeProjects, activeProjectsPrev),
      pendingRequests,
      pendingRequestsDelta: pendingRequests - pendingRequestsPrev,
      pendingRequestsPercent: percentChange(pendingRequests, pendingRequestsPrev),
      ongoingDeliveries,
      ongoingDeliveriesDelta: ongoingDeliveries - ongoingDeliveriesPrev,
      ongoingDeliveriesPercent: percentChange(ongoingDeliveries, ongoingDeliveriesPrev),
      rangeDays,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/inventory-by-category', async (_req, res, next) => {
  try {
    const categories = await prisma.productCategory.findMany({
      include: { products: true },
    });

    const totalQty = categories.reduce(
      (sum, c) => sum + c.products.reduce((acc, p) => acc + p.qtyOnHand, 0),
      0
    );

    const data = categories.map((cat) => {
      const qty = cat.products.reduce((acc, p) => acc + p.qtyOnHand, 0);
      return {
        name: cat.categoryName,
        value: qty,
        percentage: totalQty ? Math.round((qty / totalQty) * 100) : 0,
      };
    });

    res.json(data.filter((c) => c.value > 0));
  } catch (err) {
    next(err);
  }
});

router.get('/delivery-status', async (_req, res, next) => {
  try {
    const deliveries = await prisma.delivery.findMany();
    const now = new Date();
    const onTime = deliveries.filter((d) => d.status === 'DELIVERED').length;
    const pending = deliveries.filter((d) => d.status === 'PENDING').length;
    const delayed = deliveries.filter(
      (d) =>
        (d.status === 'PENDING' || d.status === 'IN_TRANSIT') &&
        d.eta &&
        d.eta < now
    ).length;

    res.json({ onTime, pending, delayed });
  } catch (err) {
    next(err);
  }
});

router.get('/recent-activity', async (_req, res, next) => {
  try {
    const logs = await prisma.auditLog.findMany({
      orderBy: { timestamp: 'desc' },
      take: 10,
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
