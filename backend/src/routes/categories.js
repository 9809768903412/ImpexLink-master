const express = require('express');
const prisma = require('../utils/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (_req, res, next) => {
  try {
    const categories = await prisma.productCategory.findMany({
      where: { deletedAt: null },
    });
    res.json(categories);
  } catch (err) {
    next(err);
  }
});

router.post('/', requireRole(['ADMIN']), async (req, res, next) => {
  try {
    const { categoryName } = req.body;
    const category = await prisma.productCategory.create({ data: { categoryName } });
    res.status(201).json(category);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const category = await prisma.productCategory.findUnique({
      where: { categoryId: Number(req.params.id), deletedAt: null },
    });
    if (!category) return res.status(404).json({ error: 'Not found' });
    res.json(category);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireRole(['ADMIN']), async (req, res, next) => {
  try {
    const category = await prisma.productCategory.update({
      where: { categoryId: Number(req.params.id) },
      data: { categoryName: req.body.categoryName },
    });
    res.json(category);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireRole(['ADMIN']), async (req, res, next) => {
  try {
    await prisma.productCategory.update({
      where: { categoryId: Number(req.params.id) },
      data: { deletedAt: new Date() },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
