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
  date.setDate(date.getDate() + Number(creditDays ?? 30));
  return date;
}

function defaultCreditDaysForMethod(method) {
  if (method === 'NET_15') return 15;
  if (method === 'NET_30') return 30;
  if (method === 'NET_60') return 60;
  return 0;
}

function transactionStatusToOrderPaymentStatus(status) {
  const normalized = normalize(status);
  if (normalized === 'PAID') return 'PAID';
  if (normalized === 'RECEIVED') return 'VERIFIED';
  if (normalized === 'CANCELLED') return 'FAILED';
  return 'PENDING';
}

function transactionStatusToSupplierOrderStatus(status, currentStatus) {
  const normalized = normalize(status);
  if (normalized === 'PAID') return 'PAID';
  if (normalized === 'RECEIVED') return 'RECEIVED';
  return currentStatus || undefined;
}

async function syncLinkedRecordStatus(payment, userId) {
  if (!payment) return;
  if (payment.direction === 'CLIENT_TO_OFFICE' && payment.clientOrderId) {
    const paymentStatus = transactionStatusToOrderPaymentStatus(payment.status);
    const order = await prisma.clientOrder.update({
      where: { clientOrderId: payment.clientOrderId },
      data: { paymentStatus },
    });
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'UPDATE',
        target: 'ClientOrder',
        details: `Synced payment status for ${order.orderNumber} to ${paymentStatus}`,
      },
    });
  }
  if (payment.direction === 'OFFICE_TO_SUPPLIER' && payment.supplierOrderId) {
    const existing = await prisma.supplierOrder.findUnique({ where: { orderId: payment.supplierOrderId } });
    if (!existing) return;
    const status = transactionStatusToSupplierOrderStatus(payment.status, existing.status);
    if (status && status !== existing.status) {
      await prisma.supplierOrder.update({
        where: { orderId: payment.supplierOrderId },
        data: { status },
      });
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'UPDATE',
          target: 'PurchaseOrder',
          details: `Synced payment status for PO ${payment.supplierOrderId} to ${status}`,
        },
      });
    }
  }
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
    proofUrl: payment.clientOrder?.paymentProofUrl || null,
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
    const creditDays =
      req.body.creditDays !== undefined && req.body.creditDays !== null && req.body.creditDays !== ''
        ? Number(req.body.creditDays)
        : defaultCreditDaysForMethod(method);
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

    const existing =
      (direction === 'CLIENT_TO_OFFICE' && clientOrderId)
        ? await prisma.paymentTransaction.findFirst({ where: { direction, clientOrderId } })
        : (direction === 'OFFICE_TO_SUPPLIER' && supplierOrderId)
        ? await prisma.paymentTransaction.findFirst({ where: { direction, supplierOrderId } })
        : null;
    const effectiveStatus =
      hasRole(req, 'CLIENT') && existing && ['RECEIVED', 'PAID'].includes(existing.status)
        ? existing.status
        : status;
    const paymentData = {
      method,
      status: effectiveStatus,
      amount: Number(req.body.amount || 0),
      creditDays,
      dueDate: req.body.dueDate ? new Date(req.body.dueDate) : dueDateFromCreditDays(creditDays),
      paidAt: ['PAID', 'RECEIVED'].includes(effectiveStatus) ? existing?.paidAt || new Date() : null,
      referenceNumber: req.body.referenceNumber || null,
      notes: req.body.notes || null,
      clientId,
      clientOrderId,
      supplierId,
      supplierOrderId,
      createdById: existing?.createdById || req.user.userId,
    };
    const payment = existing
      ? await prisma.paymentTransaction.update({
          where: { paymentId: existing.paymentId },
          data: paymentData,
          include: includePaymentRelations(),
        })
      : await prisma.paymentTransaction.create({
          data: {
            direction,
            ...paymentData,
          },
          include: includePaymentRelations(),
        });

    await syncLinkedRecordStatus(payment, req.user.userId);

    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: existing ? 'UPDATE' : 'CREATE',
        target: 'Payment',
        details: `${existing ? 'Updated' : 'Created'} ${direction} payment ${payment.paymentId}`,
      },
    });

    res.status(201).json(mapPayment(payment));
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireRole(['ADMIN', 'PRESIDENT']), async (req, res, next) => {
  try {
    const existing = await prisma.paymentTransaction.findUnique({
      where: { paymentId: Number(req.params.id) },
    });
    if (!existing) return res.status(404).json({ error: 'Payment not found' });
    const status = req.body.status ? normalize(req.body.status) : undefined;
    if (status && !STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid payment status' });
    const method = req.body.method ? normalize(req.body.method) : undefined;
    const direction = normalize(existing.direction);
    if (method && direction === 'CLIENT_TO_OFFICE' && !CLIENT_METHODS.includes(method)) {
      return res.status(400).json({ error: 'Client payments must use Cheque or Auto Deposit.' });
    }
    if (method && direction === 'OFFICE_TO_SUPPLIER' && !SUPPLIER_METHODS.includes(method)) {
      return res.status(400).json({ error: 'Invalid supplier payment method.' });
    }
    const payment = await prisma.paymentTransaction.update({
      where: { paymentId: Number(req.params.id) },
      data: {
        status,
        method,
        amount: req.body.amount !== undefined ? Number(req.body.amount) : undefined,
        creditDays: req.body.creditDays !== undefined ? Number(req.body.creditDays) : undefined,
        dueDate: req.body.dueDate ? new Date(req.body.dueDate) : undefined,
        paidAt: status && ['PAID', 'RECEIVED'].includes(status) ? new Date() : undefined,
        referenceNumber: req.body.referenceNumber,
        notes: req.body.notes,
      },
      include: includePaymentRelations(),
    });
    await syncLinkedRecordStatus(payment, req.user.userId);
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
