const express = require('express');
const prisma = require('../utils/prisma');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/warehouse-risks', async (_req, res, next) => {
  try {
    const products = await prisma.product.findMany({ where: { deletedAt: null } });
    const purchases = await prisma.stockTransaction.groupBy({
      by: ['productId'],
      where: { type: 'PURCHASE' },
      _max: { date: true },
    });
    const purchaseMap = new Map(
      purchases.map((p) => [p.productId, p._max.date])
    );

    const toDays = (ms) => Math.floor(ms / (1000 * 60 * 60 * 24));
    const now = new Date();

    const risks = products.map((p) => {
      const lastPurchase = purchaseMap.get(p.productId) || p.createdAt || now;
      const daysInStock = Math.max(0, toDays(now.getTime() - new Date(lastPurchase).getTime()));
      const shelfLifeDays = p.shelfLifeDays || 180;
      const daysToExpiry = shelfLifeDays - daysInStock;
      const percentUsed = shelfLifeDays > 0 ? Math.min(100, Math.round((daysInStock / shelfLifeDays) * 100)) : 0;

      const stockRisk =
        p.qtyOnHand === 0
          ? 'critical'
          : p.qtyOnHand <= Math.max(1, Math.floor(p.lowStockThreshold * 0.2))
          ? 'high'
          : p.qtyOnHand <= p.lowStockThreshold
          ? 'medium'
          : 'low';

      const ageRisk =
        daysToExpiry <= 0
          ? 'critical'
          : daysToExpiry <= 10
          ? 'high'
          : daysToExpiry <= 30
          ? 'medium'
          : 'low';

      const riskOrder = ['low', 'medium', 'high', 'critical'];
      const riskLevel =
        riskOrder.indexOf(ageRisk) >= riskOrder.indexOf(stockRisk) ? ageRisk : stockRisk;

      const ageReason =
        daysToExpiry <= 0
          ? `Past shelf life by ${Math.abs(daysToExpiry)} days`
          : `Shelf life ${shelfLifeDays} days • ${daysToExpiry} days left (${percentUsed}% used)`;
      const stockReason =
        p.qtyOnHand <= p.lowStockThreshold
          ? `Low stock: ${p.qtyOnHand}/${p.lowStockThreshold}`
          : 'Stock healthy';

      return {
        itemId: p.productId.toString(),
        itemName: p.itemName,
        riskLevel,
        reason: `${ageReason} • ${stockReason}`,
        recommendedAction:
          riskLevel === 'critical'
            ? 'Prioritize usage or reorder immediately'
            : riskLevel === 'high'
            ? 'Use soon and plan replenishment'
            : 'Monitor stock age',
        shelfLifeDays,
        daysInStock,
        daysToExpiry,
      };
    });
    res.json(risks);
  } catch (err) {
    next(err);
  }
});

router.get('/reorder-suggestions', async (_req, res, next) => {
  try {
    const products = await prisma.product.findMany();
    const suggestions = products
      .filter((p) => p.qtyOnHand <= p.lowStockThreshold)
      .map((p) => ({
        itemId: p.productId.toString(),
        itemName: p.itemName,
        currentQty: p.qtyOnHand,
        suggestedQty: Math.max(p.lowStockThreshold * 2, 10),
        estimatedCost: Number(p.unitPrice) * Math.max(p.lowStockThreshold * 2, 10),
      }));
    res.json(suggestions);
  } catch (err) {
    next(err);
  }
});

router.get('/fraud-alerts', async (_req, res, next) => {
  try {
    const alerts = [];
    res.json(alerts);
  } catch (err) {
    next(err);
  }
});

router.post('/refresh', async (_req, res) => {
  try {
    await prisma.auditLog.create({
      data: {
        userId: _req.user?.userId,
        action: 'TEST',
        target: 'AI',
        details: 'Refreshed AI insights',
      },
    });
  } catch {
    // ignore audit failures
  }
  res.json({ ok: true });
});

module.exports = router;
