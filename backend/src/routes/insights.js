const express = require('express');
const prisma = require('../utils/prisma');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (_req, res, next) => {
  try {
    const products = await prisma.product.findMany();
    const lowStock = products.filter((p) => p.qtyOnHand <= p.lowStockThreshold).length;

    const pendingOrders = await prisma.clientOrder.count({
      where: { status: { in: ['PENDING', 'PROCESSING'] } },
    });

    const deliveries = await prisma.delivery.count({
      where: { status: { in: ['PENDING', 'IN_TRANSIT'] } },
    });

    res.json({ lowStock, pendingOrders, deliveries });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
