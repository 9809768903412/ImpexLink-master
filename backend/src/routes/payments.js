const express = require('express');
const prisma = require('../utils/prisma');
const { requireAuth, requireRole, getRoleList } = require('../middleware/auth');
const { parsePagination, buildPaginatedResponse, parseSort } = require('../utils/pagination');
const { isNonNegativeNumber, isPositiveInt } = require('../utils/validate');
const { resolveClientAccess, canAccessClientOwnedRecord } = require('../utils/clientVisibility');

const router = express.Router();
router.use(requireAuth);

const CLIENT_METHODS = ['CHEQUE', 'AUTO_DEPOSIT'];
const SUPPLIER_METHODS = ['CASH', 'GCASH', 'CHEQUE', 'NET_15', 'NET_30', 'NET_60'];
const STATUSES = ['PENDING', 'RECEIVED', 'PAID', 'OVERDUE', 'CANCELLED'];

function hasRole(req, role) {
  return getRoleList(req.user).includes(String(role).toUpperCase());
}

function normalize(value) {
  return String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
}

function dueDateFromCreditDays(creditDays) {
  const date = new Date();
  date.setDate(date.getDate() + Number(creditDays || 30));
  return date;
}

function mapPayment(payment) {
  return {
    id: payment.paymentId.toString(),
    direction: payment.direction.toLowerCase().replace(/_/g, '-'),
    method: payment.method.toLowerCase().replace(/_/g, '-'),
    status: payment.status.toLowerCase(),
    amount: Number(payment.amount || 0),
    creditDays: payment.creditDays,
    dueDate: payment.dueDate ? payment.dueDate.toISOString().split('T')[0] : null,
    paidAt: payment.paidAt ? payment.paidAt.toISOString() : null,
    referenceNumber: payment.referenceNumber || null,
    notes: payment.notes || null,
    clientId: payment.clientId?.toString() || null,
    clientName: payment.client?.clientName || null,
    clientOrderId: payment.clientOrderId?.toString() || null,
    clientOrderNumber: payment.clientOrder?.orderNumber || null,
    supplierId: payment.supplierId?.toString() || null,
    supplierName: payment.supplier?.supplierName || null,
    supplierOrderId: payment.supplierOrderId?.toString() || null,
    supplierPoNumber: payment.supplierOrderId ? `PO-${new Date(payment.supplierOrder?.orderDate || payment.createdAt).getFullYear()}-${String(payment.supplierOrderId).padStart(4, '0')}` : null,
    createdByName: payment.createdBy?.fullName || null,
    createdAt: payment.createdAt.toISOString(),
    updatedAt: payment.updatedAt.toISOString(),
  };
}

function includePaymentRelations() {
  return {
    client: true,
    clientOrder: true,
    supplier: true,
    supplierOrder: true,
    createdBy: true,
  };
}

async function buildPaymentScope(req) {
  if (hasRole(req, 'ADMIN') || hasRole(req, 'PRESIDENT')) return {};
  if (hasRole(req, 'CLIENT')) {
    const access = await resolveClientAccess(prisma, req.user.userId);
    if (!access?.client?.clientId) return { paymentId: -1 };
    return { clientId: access.client.clientId };
  }
  return { paymentId: -1 };
}

router.get('/', async (req, res, next) => {
  try {
    const pagination = parsePagination(req.query);
    const q = req.query.q ? String(req.query.q) : '';
    const direction = req.query.direction ? normalize(req.query.direction) : '';
    const status = req.query.status ? normalize(req.query.status) : '';
    const scopeWhere = await buildPaymentScope(req);
    const where = {
      AND: [
        scopeWhere,
        direction ? { direction } : {},
        status ? { status } : {},
        q
          ? {
              OR: [
                { referenceNumber: { contains: q, mode: 'insensitive' } },
                { client: { clientName: { contains: q, mode: 'insensitive' } } },
                { supplier: { supplierName: { contains: q, mode: 'insensitive' } } },
                { clientOrder: { orderNumber: { contains: q, mode: 'insensitive' } } },
              ],
            }
          : {},
      ],
    };
    const sort = parseSort(req.query, ['createdAt', 'dueDate', 'amount', 'status']);
    const orderBy = sort ? { [sort.sortBy]: sort.sortDir } : { createdAt: 'desc' };
    const [payments, total] = await Promise.all([
      prisma.paymentTransaction.findMany({
        where,
        include: includePaymentRelations(),
        skip: pagination ? (pagination.page - 1) * pagination.pageSize : undefined,
        take: pagination ? pagination.pageSize : undefined,
        orderBy,
      }),
      prisma.paymentTransaction.count({ where }),
    ]);
    const data = payments.map(mapPayment);
    if (pagination) return res.json(buildPaginatedResponse(data, total, pagination.page, pagination.pageSize));
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.get('/summary', requireRole(['ADMIN', 'PRESIDENT']), async (_req, res, next) => {
  try {
    const payments = await prisma.paymentTransaction.findMany();
    const summary = payments.reduce(
      (acc, payment) => {
        const amount = Number(payment.amount || 0);
        if (payment.direction === 'CLIENT_TO_OFFICE') acc.clientReceivables += amount;
        if (payment.direction === 'OFFICE_TO_SUPPLIER') acc.supplierPayables += amount;
        if (payment.status === 'OVERDUE') acc.overdue += amount;
        if (['PAID', 'RECEIVED'].includes(payment.status)) acc.cleared += amount;
        return acc;
      },
      { clientReceivables: 0, supplierPayables: 0, overdue: 0, cleared: 0 }
    );
    res.json(summary);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const direction = normalize(req.body.direction || 'CLIENT_TO_OFFICE');
    const method = normalize(req.body.method);
    const status = normalize(req.body.status || 'PENDING');
    const creditDays = Number(req.body.creditDays || (method === 'NET_15' ? 15 : method === 'NET_60' ? 60 : 30));
    if (!['CLIENT_TO_OFFICE', 'OFFICE_TO_SUPPLIER'].includes(direction)) {
      return res.status(400).json({ error: 'Invalid payment direction' });
    }
    if (direction === 'CLIENT_TO_OFFICE' && !CLIENT_METHODS.includes(method)) {
      return res.status(400).json({ error: 'Client payments must use Cheque or Auto Deposit.' });
    }
    if (direction === 'OFFICE_TO_SUPPLIER' && !SUPPLIER_METHODS.includes(method)) {
      return res.status(400).json({ error: 'Invalid supplier payment method.' });
    }
    if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid payment status' });
    if (!isNonNegativeNumber(req.body.amount)) return res.status(400).json({ error: 'Amount must be 0 or greater' });
    if (!Number.isFinite(creditDays) || creditDays < 0) return res.status(400).json({ error: 'Credit days must be 0 or greater' });

    let clientId = req.body.clientId ? Number(req.body.clientId) : null;
    let clientOrderId = req.body.clientOrderId ? Number(req.body.clientOrderId) : null;
    const supplierId = req.body.supplierId ? Number(req.body.supplierId) : null;
    const supplierOrderId = req.body.supplierOrderId ? Number(req.body.supplierOrderId) : null;

    if (hasRole(req, 'CLIENT')) {
      if (direction !== 'CLIENT_TO_OFFICE') return res.status(403).json({ error: 'Clients can only record client payments.' });
      const access = await resolveClientAccess(prisma, req.user.userId);
      if (!access?.client?.clientId) return res.status(403).json({ error: 'No client account found.' });
      clientId = access.client.clientId;
      if (clientOrderId) {
        const order = await prisma.clientOrder.findUnique({ where: { clientOrderId }, include: { client: true } });
        if (!order || !canAccessClientOwnedRecord(access, order)) return res.status(403).json({ error: 'Forbidden' });
      }
    } else if (!(hasRole(req, 'ADMIN') || hasRole(req, 'PRESIDENT'))) {
      return res.status(403).json({ error: 'Only Admin, President, or Client can create payment records.' });
    }

    if (clientOrderId && !isPositiveInt(clientOrderId)) return res.status(400).json({ error: 'Invalid client order' });
    if (supplierOrderId && !isPositiveInt(supplierOrderId)) return res.status(400).json({ error: 'Invalid supplier order' });

    const payment = await prisma.paymentTransaction.create({
      data: {
        direction,
        method,
        status,
        amount: Number(req.body.amount || 0),
        creditDays,
        dueDate: req.body.dueDate ? new Date(req.body.dueDate) : dueDateFromCreditDays(creditDays),
        paidAt: ['PAID', 'RECEIVED'].includes(status) ? new Date() : null,
        referenceNumber: req.body.referenceNumber || null,
        notes: req.body.notes || null,
        clientId,
        clientOrderId,
        supplierId,
        supplierOrderId,
        createdById: req.user.userId,
      },
      include: includePaymentRelations(),
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: 'CREATE',
        target: 'Payment',
        details: `Created ${direction} payment ${payment.paymentId}`,
      },
    });

    res.status(201).json(mapPayment(payment));
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireRole(['ADMIN', 'PRESIDENT']), async (req, res, next) => {
  try {
    const status = req.body.status ? normalize(req.body.status) : undefined;
    if (status && !STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid payment status' });
    const payment = await prisma.paymentTransaction.update({
      where: { paymentId: Number(req.params.id) },
      data: {
        status,
        method: req.body.method ? normalize(req.body.method) : undefined,
        amount: req.body.amount !== undefined ? Number(req.body.amount) : undefined,
        creditDays: req.body.creditDays !== undefined ? Number(req.body.creditDays) : undefined,
        dueDate: req.body.dueDate ? new Date(req.body.dueDate) : undefined,
        paidAt: status && ['PAID', 'RECEIVED'].includes(status) ? new Date() : undefined,
        referenceNumber: req.body.referenceNumber,
        notes: req.body.notes,
      },
      include: includePaymentRelations(),
    });
    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: 'UPDATE',
        target: 'Payment',
        details: `Updated payment ${payment.paymentId}`,
      },
    });
    res.json(mapPayment(payment));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
