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

    const [products, currentTxns, projects, materialRequests, deliveries] = await Promise.all([
      prisma.product.findMany({
        where: { deletedAt: null },
        select: { productId: true, qtyOnHand: true, lowStockThreshold: true },
      }),
      prisma.stockTransaction.findMany({
        where: { date: { gte: startCurrent, lt: now } },
        select: { productId: true, qtyChange: true },
      }),
      prisma.project.findMany({
        where: { deletedAt: null },
        select: { status: true, startDate: true },
      }),
      prisma.materialRequest.findMany({
        where: { deletedAt: null },
        select: { status: true, createdAt: true },
      }),
      prisma.delivery.findMany({
        where: { deletedAt: null },
        select: { status: true, createdAt: true },
      }),
    ]);

    const totalItems = products.reduce((sum, p) => sum + p.qtyOnHand, 0);

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

    const activeProjects = projects.filter((project) => project.status === 'ACTIVE').length;
    const activeProjectsPrev = projects.filter(
      (project) =>
        project.status === 'ACTIVE' && (!project.startDate || new Date(project.startDate) <= startCurrent)
    ).length;

    const pendingRequestStatuses = new Set(['PENDING', 'PM_APPROVED']);
    const pendingRequests = materialRequests.filter((request) =>
      pendingRequestStatuses.has(String(request.status))
    ).length;
    const pendingRequestsPrev = materialRequests.filter(
      (request) =>
        pendingRequestStatuses.has(String(request.status)) && new Date(request.createdAt) < startCurrent
    ).length;

    const activeDeliveryStatuses = new Set(['PENDING', 'IN_TRANSIT']);
    const ongoingDeliveries = deliveries.filter((delivery) =>
      activeDeliveryStatuses.has(String(delivery.status))
    ).length;
    const ongoingDeliveriesPrev = deliveries.filter(
      (delivery) =>
        activeDeliveryStatuses.has(String(delivery.status)) && new Date(delivery.createdAt) < startCurrent
    ).length;

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
