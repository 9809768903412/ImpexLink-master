const express = require('express');
const path = require('path');
const prisma = require('../utils/prisma');
const { requireAuth, requireRole, getRoleList } = require('../middleware/auth');
const { parsePagination, buildPaginatedResponse } = require('../utils/pagination');

const router = express.Router();
router.use(requireAuth);
router.use(requireRole(['ADMIN', 'PRESIDENT', 'WAREHOUSE_STAFF', 'SALES_AGENT', 'DELIVERY_GUY']));

function normalizeType(value) {
  const v = String(value || 'all').toLowerCase();
  return ['all', 'registration', 'payment', 'delivery'].includes(v) ? v : 'all';
}

function normalizeStatus(value) {
  const v = String(value || '').trim();
  return v ? v.toLowerCase() : '';
}

function parseDateStart(value) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseDateEnd(value) {
  if (!value) return null;
  const parsed = new Date(`${value}T23:59:59.999Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function fileNameFromUrl(fileUrl) {
  if (!fileUrl) return '';
  return path.basename(String(fileUrl));
}

function isAdminLike(roles) {
  return roles.includes('ADMIN') || roles.includes('PRESIDENT');
}

function hasDeliveryAccess(roles) {
  return roles.some((role) => ['ADMIN', 'PRESIDENT', 'WAREHOUSE_STAFF', 'DELIVERY_GUY'].includes(role));
}

function hasPaymentAccess(roles) {
  return roles.some((role) => ['ADMIN', 'PRESIDENT', 'WAREHOUSE_STAFF', 'SALES_AGENT'].includes(role));
}

function toRecord(payload) {
  return {
    ...payload,
    fileName: fileNameFromUrl(payload.fileUrl),
  };
}

function includeBySearch(record, query) {
  if (!query) return true;
  const haystack = [
    record.ownerName,
    record.ownerEmail,
    record.reference,
    record.projectName,
    record.fileName,
    record.type,
    record.status,
  ]
    .map((value) => String(value || '').toLowerCase())
    .join(' ');
  return haystack.includes(query);
}

function includeByDateRange(record, fromDate, toDate) {
  if (!fromDate && !toDate) return true;
  const stamp = new Date(record.uploadedAt);
  if (Number.isNaN(stamp.getTime())) return false;
  if (fromDate && stamp < fromDate) return false;
  if (toDate && stamp > toDate) return false;
  return true;
}

function includeByStatus(record, status) {
  if (!status) return true;
  return String(record.status || '').toLowerCase() === status;
}

router.get('/', async (req, res, next) => {
  try {
    const roles = getRoleList(req.user);
    const q = String(req.query.q || '').trim().toLowerCase();
    const type = normalizeType(req.query.type);
    const status = normalizeStatus(req.query.status);
    const fromDate = parseDateStart(req.query.from);
    const toDate = parseDateEnd(req.query.to);
    const pagination = parsePagination(req.query) || { page: 1, pageSize: 20 };

    const includeRegistration = type === 'all' || type === 'registration';
    const includePayment = type === 'all' || type === 'payment';
    const includeDelivery = type === 'all' || type === 'delivery';

    const records = [];

    if (includeRegistration && isAdminLike(roles)) {
      const users = await prisma.user.findMany({
        where: {
          deletedAt: null,
          proofDocUrl: { not: null },
        },
        select: {
          userId: true,
          fullName: true,
          email: true,
          status: true,
          proofDocUrl: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      users.forEach((user) => {
        records.push(
          toRecord({
            id: `user-${user.userId}`,
            type: 'registration',
            status: String(user.status || 'active').toLowerCase(),
            ownerName: user.fullName || 'Unknown user',
            ownerEmail: user.email || null,
            reference: user.email || `USER-${user.userId}`,
            projectName: null,
            fileUrl: user.proofDocUrl,
            uploadedAt: user.createdAt.toISOString(),
            source: 'user',
          })
        );
      });

      const pendingRegistrations = await prisma.pendingRegistration.findMany({
        where: {
          proofDocUrl: { not: null },
        },
        select: {
          pendingId: true,
          fullName: true,
          email: true,
          companyName: true,
          proofDocUrl: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      pendingRegistrations.forEach((pending) => {
        records.push(
          toRecord({
            id: `pending-${pending.pendingId}`,
            type: 'registration',
            status: 'pending-verification',
            ownerName: pending.fullName || pending.companyName || 'Pending registration',
            ownerEmail: pending.email || null,
            reference: pending.email || `PENDING-${pending.pendingId}`,
            projectName: null,
            fileUrl: pending.proofDocUrl,
            uploadedAt: pending.createdAt.toISOString(),
            source: 'pending_registration',
          })
        );
      });
    }

    if (includePayment && hasPaymentAccess(roles)) {
      const paymentWhere = {
        deletedAt: null,
        paymentProofUrl: { not: null },
      };

      if (roles.includes('SALES_AGENT') && !isAdminLike(roles) && !roles.includes('WAREHOUSE_STAFF')) {
        paymentWhere.assignedSalesAgentId = req.user.userId;
      }

      const orders = await prisma.clientOrder.findMany({
        where: paymentWhere,
        select: {
          clientOrderId: true,
          orderNumber: true,
          paymentStatus: true,
          paymentProofUrl: true,
          updatedAt: true,
          client: {
            select: { clientName: true, email: true },
          },
          project: {
            select: { projectName: true },
          },
          assignedSalesAgent: {
            select: { fullName: true },
          },
        },
        orderBy: { updatedAt: 'desc' },
      });

      orders.forEach((order) => {
        records.push(
          toRecord({
            id: `payment-${order.clientOrderId}`,
            type: 'payment',
            status: String(order.paymentStatus || 'pending').toLowerCase(),
            ownerName: order.client?.clientName || 'Client',
            ownerEmail: order.client?.email || null,
            reference: order.orderNumber,
            projectName: order.project?.projectName || null,
            fileUrl: order.paymentProofUrl,
            uploadedAt: order.updatedAt.toISOString(),
            source: 'client_order',
            handledBy: order.assignedSalesAgent?.fullName || null,
          })
        );
      });
    }

    if (includeDelivery && hasDeliveryAccess(roles)) {
      const deliveryWhere = {
        deletedAt: null,
        proofOfDeliveryUrl: { not: null },
      };

      if (roles.includes('DELIVERY_GUY') && !isAdminLike(roles) && !roles.includes('WAREHOUSE_STAFF')) {
        deliveryWhere.assignedDeliveryGuyId = req.user.userId;
      }

      const deliveries = await prisma.delivery.findMany({
        where: deliveryWhere,
        select: {
          deliveryId: true,
          drNumber: true,
          status: true,
          proofOfDeliveryUrl: true,
          createdAt: true,
          assignedDeliveryGuy: {
            select: { fullName: true, email: true },
          },
          clientOrder: {
            select: {
              orderNumber: true,
              client: {
                select: { clientName: true, email: true },
              },
              project: {
                select: { projectName: true },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      deliveries.forEach((delivery) => {
        records.push(
          toRecord({
            id: `delivery-${delivery.deliveryId}`,
            type: 'delivery',
            status: String(delivery.status || 'pending').toLowerCase().replace(/_/g, '-'),
            ownerName:
              delivery.clientOrder?.client?.clientName ||
              delivery.assignedDeliveryGuy?.fullName ||
              'Delivery',
            ownerEmail: delivery.clientOrder?.client?.email || delivery.assignedDeliveryGuy?.email || null,
            reference: delivery.drNumber || delivery.clientOrder?.orderNumber || `DELIVERY-${delivery.deliveryId}`,
            projectName: delivery.clientOrder?.project?.projectName || null,
            fileUrl: delivery.proofOfDeliveryUrl,
            uploadedAt: delivery.createdAt.toISOString(),
            source: 'delivery',
            handledBy: delivery.assignedDeliveryGuy?.fullName || null,
          })
        );
      });
    }

    const filtered = records
      .filter((record) => includeBySearch(record, q))
      .filter((record) => includeByStatus(record, status))
      .filter((record) => includeByDateRange(record, fromDate, toDate))
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());

    const total = filtered.length;
    const start = (pagination.page - 1) * pagination.pageSize;
    const data = filtered.slice(start, start + pagination.pageSize);

    res.json(buildPaginatedResponse(data, total, pagination.page, pagination.pageSize));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
