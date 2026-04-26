const express = require('express');
const prisma = require('../utils/prisma');
const { parsePagination, buildPaginatedResponse, parseSort } = require('../utils/pagination');
const { requireAuth, requireRole } = require('../middleware/auth');
const { isEmail, isNonEmptyString } = require('../utils/validate');

const router = express.Router();
router.use(requireAuth);

router.get('/', requireRole(['ADMIN', 'WAREHOUSE_STAFF']), async (req, res, next) => {
  try {
    const pagination = parsePagination(req.query);
    const q = req.query.q ? String(req.query.q) : '';
    const where = q
      ? {
          OR: [
            { supplierName: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
            { country: { contains: q, mode: 'insensitive' } },
          ],
          deletedAt: null,
        }
      : { deletedAt: null };
    const sort = parseSort(req.query, ['supplierName', 'email', 'country']);
    const orderBy = sort ? { [sort.sortBy]: sort.sortDir } : { supplierName: 'asc' };
    const [suppliers, total] = await Promise.all([
      prisma.supplier.findMany({
        where,
        skip: pagination ? (pagination.page - 1) * pagination.pageSize : undefined,
        take: pagination ? pagination.pageSize : undefined,
        orderBy,
      }),
      prisma.supplier.count({ where }),
    ]);
    const data = suppliers.map((s) => ({
      id: s.supplierId.toString(),
      name: s.supplierName,
      contactPerson: s.supplierName,
      email: s.email,
      phone: s.phone || null,
      address: s.address || s.country || null,
      tin: s.tin || null,
    }));
    if (pagination) {
      return res.json(buildPaginatedResponse(data, total, pagination.page, pagination.pageSize));
    }
    return res.json(data);
  } catch (err) {
    next(err);
  }
});

router.post('/', requireRole(['ADMIN']), async (req, res, next) => {
  try {
    if (!isNonEmptyString(req.body.supplierName)) {
      return res.status(400).json({ error: 'Supplier name is required' });
    }
    if (req.body.email && !isEmail(req.body.email)) {
      return res.status(400).json({ error: 'Invalid email' });
    }
    const supplier = await prisma.supplier.create({
      data: {
        supplierName: req.body.supplierName,
        country: req.body.country,
        email: req.body.email,
        address: req.body.address,
        phone: req.body.phone,
        tin: req.body.tin,
      },
    });
    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: 'CREATE',
        target: 'Supplier',
        details: `Created supplier ${supplier.supplierName}`,
      },
    });
    res.status(201).json(supplier);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireRole(['ADMIN']), async (req, res, next) => {
  try {
    if (req.body.supplierName !== undefined && !isNonEmptyString(req.body.supplierName)) {
      return res.status(400).json({ error: 'Supplier name is required' });
    }
    if (req.body.email && !isEmail(req.body.email)) {
      return res.status(400).json({ error: 'Invalid email' });
    }
    const supplier = await prisma.supplier.update({
      where: { supplierId: Number(req.params.id) },
      data: {
        supplierName: req.body.supplierName,
        country: req.body.country,
        email: req.body.email,
        address: req.body.address,
        phone: req.body.phone,
        tin: req.body.tin,
      },
    });
    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: 'UPDATE',
        target: 'Supplier',
        details: `Updated supplier ${supplier.supplierName}`,
      },
    });
    res.json(supplier);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireRole(['ADMIN']), async (req, res, next) => {
  try {
    const supplierId = Number(req.params.id);
    await prisma.supplier.update({
      where: { supplierId },
      data: { deletedAt: new Date() },
    });
    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: 'DELETE',
        target: 'Supplier',
        details: `Soft-deleted supplier ${supplierId}`,
      },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
