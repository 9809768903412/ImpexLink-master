const express = require('express');
const prisma = require('../utils/prisma');

const router = express.Router();

router.get('/clients', async (_req, res, next) => {
  try {
    const count = await prisma.client.count();
    if (count === 0) {
      await prisma.client.createMany({
        data: [
          { clientName: 'Impex Client Co.', email: 'client@impex.ph', address: 'Makati City' },
          { clientName: 'Robinsons Land', email: 'procurement@rl.com', address: 'Pasig City' },
          { clientName: 'Ayala Holdings', email: 'purchasing@ayala.com', address: 'Makati City' },
          { clientName: 'SM Prime', email: 'buy@smprime.com', address: 'Pasay City' },
          { clientName: 'Megaworld Corp', email: 'orders@megaworld.com', address: 'Taguig City' },
        ],
      });
    }

    const clients = await prisma.client.findMany({
      select: { clientId: true, clientName: true },
      orderBy: { clientName: 'asc' },
    });
    res.json(
      clients.map((c) => ({
        id: c.clientId.toString(),
        name: c.clientName,
      }))
    );
  } catch (err) {
    next(err);
  }
});

module.exports = router;
