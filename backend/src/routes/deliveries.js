const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const prisma = require('../utils/prisma');
const { parsePagination, buildPaginatedResponse, parseSort } = require('../utils/pagination');
const { requireAuth, requireRole, getRoleList } = require('../middleware/auth');
const { isPositiveInt, isNonNegativeNumber, isValidDateString, isNonEmptyString } = require('../utils/validate');
const {
  resolveClientAccess,
  buildNestedClientOrderScope,
} = require('../utils/clientVisibility');

const router = express.Router();
router.use(requireAuth);

const proofDir = path.join(__dirname, '..', '..', 'uploads', 'deliveries');
if (!fs.existsSync(proofDir)) {
  fs.mkdirSync(proofDir, { recursive: true });
}

const uploadProof = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, proofDir),
    filename: (_req, file, cb) => {
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${Date.now()}-${safeName}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'application/pdf', 'image/heic', 'image/heif'];
    const extension = path.extname(String(file.originalname || '')).toLowerCase();
    const allowedExtensions = new Set(['.jpg', '.jpeg', '.png', '.pdf', '.heic']);
    if (!allowedMimeTypes.includes(file.mimetype) && !allowedExtensions.has(extension)) {
      return cb(new Error('Invalid file type'));
    }
    cb(null, true);
  },
});

function hasRole(req, role) {
  return getRoleList(req.user).includes(String(role).toUpperCase());
}

let deliveryColumnSupport = null;

async function getDeliveryColumnSupport() {
  if (deliveryColumnSupport) return deliveryColumnSupport;
  const optionalColumns = [
    'delivery_method',
    'batch_number',
    'batch_count',
    'load_kg',
    'third_party_provider',
    'third_party_reference',
  ];
  try {
    const rows = await prisma.$queryRaw`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'deliveries'
        AND column_name IN ('delivery_method', 'batch_number', 'batch_count', 'load_kg', 'third_party_provider', 'third_party_reference')
    `;
    const found = new Set(rows.map((row) => row.column_name));
    deliveryColumnSupport = {
      batches: optionalColumns.every((column) => found.has(column)),
    };
  } catch (err) {
    console.error('Delivery optional column check failed:', err.message || err);
    deliveryColumnSupport = { batches: false };
  }
  return deliveryColumnSupport;
}

function deliverySelect(includeOptionalColumns = false) {
  return {
    deliveryId: true,
    drNumber: true,
    clientOrderId: true,
    assignedDeliveryGuyId: true,
    status: true,
    itemsCount: true,
    eta: true,
    receivedBy: true,
    receiverName: true,
    receiverAddress: true,
    receiverContactNumber: true,
    receivedAt: true,
    notes: true,
    proofOfDeliveryUrl: true,
    returnRejectionReason: true,
    createdAt: true,
    deletedAt: true,
    ...(includeOptionalColumns
      ? {
          deliveryMethod: true,
          batchNumber: true,
          batchCount: true,
          loadKg: true,
          thirdPartyProvider: true,
          thirdPartyReference: true,
        }
      : {}),
    assignedDeliveryGuy: { select: { fullName: true } },
    clientOrder: {
      select: {
        clientOrderId: true,
        clientId: true,
        orderNumber: true,
        status: true,
        createdBy: true,
        client: { select: { clientName: true, contactPerson: true, address: true, phone: true } },
        project: { select: { projectName: true } },
        items: { include: { product: true } },
      },
    },
  };
}

async function validateDeliveryGuyAssignment(assignedDeliveryGuyId) {
  if (!assignedDeliveryGuyId) return null;
  const driver = await prisma.user.findUnique({
    where: { userId: Number(assignedDeliveryGuyId) },
    include: { role: true, userRoles: { include: { role: true } } },
  });
  if (!driver || driver.deletedAt) {
    throw new Error('Assigned driver not found');
  }
  const roleNames = [
    driver.role?.roleName,
    ...(driver.userRoles || []).map((entry) => entry.role?.roleName),
  ]
    .filter(Boolean)
    .map((role) => String(role).toUpperCase());
  if (!roleNames.includes('DELIVERY_GUY') && !roleNames.includes('DRIVER')) {
    throw new Error('Assigned user must have the Driver role');
  }
  return driver.userId;
}

async function buildDeliveryScope(req) {
  const roleList = getRoleList(req.user);
  if (roleList.includes('ADMIN') || roleList.includes('WAREHOUSE_STAFF')) {
    return {};
  }

  const scopes = [];

  if (roleList.includes('CLIENT')) {
    const access = await resolveClientAccess(prisma, req.user.userId);
    if (access?.client?.clientId) {
      scopes.push(buildNestedClientOrderScope(access));
    }
  }

  if (roleList.includes('PROJECT_MANAGER')) {
    scopes.push({ clientOrder: { project: { assignedPmId: req.user.userId } } });
  }

  if (roleList.includes('SALES_AGENT')) {
    scopes.push({ clientOrder: { assignedSalesAgentId: req.user.userId } });
  }

  if (roleList.includes('DRIVER')) {
    return {};
  }

  if (roleList.includes('RECEIVER')) {
    return {};
  }

  if (scopes.length === 0) {
    return { deliveryId: -1 };
  }

  return scopes.length === 1 ? scopes[0] : { OR: scopes };
}

function mapDelivery(d) {
  return {
    id: d.deliveryId.toString(),
    drNumber: d.drNumber,
    orderId: d.clientOrderId?.toString() || null,
    orderNumber: d.clientOrder?.orderNumber || '',
    clientId: d.clientOrder?.clientId?.toString() || null,
    clientName: d.clientOrder?.client?.clientName || 'Client',
    clientContactPerson: d.clientOrder?.client?.contactPerson || null,
    projectName: d.clientOrder?.project?.projectName || null,
    items: (d.clientOrder?.items || []).map((item) => ({
      itemId: item.productId?.toString() || '',
      itemName: item.product?.itemName || '',
      unit: item.product?.unit || '',
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice || 0),
      amount: Number(item.unitPrice || 0) * item.quantity,
    })),
    status: d.status.toLowerCase().replace(/_/g, '-'),
    eta: d.eta ? d.eta.toISOString() : null,
    issuedBy: 'System',
    issuedAt: d.createdAt.toISOString(),
    receivedBy: d.receivedBy || null,
    receiverName: d.receiverName || d.receivedBy || null,
    receiverAddress: d.receiverAddress || d.clientOrder?.client?.address || null,
    receiverContactNumber: d.receiverContactNumber || d.clientOrder?.client?.phone || null,
    receivedAt: d.receivedAt ? d.receivedAt.toISOString() : null,
    notes: d.notes || null,
    returnRejectionReason: d.returnRejectionReason || null,
    proofOfDelivery: d.proofOfDeliveryUrl || null,
    assignedDeliveryGuyId: d.assignedDeliveryGuyId?.toString() || null,
    deliveryGuyName: d.assignedDeliveryGuy?.fullName || null,
    deliveryMethod: d.deliveryMethod || 'TRUCK',
    batchNumber: d.batchNumber || 1,
    batchCount: d.batchCount || 1,
    loadKg: d.loadKg === null || d.loadKg === undefined ? null : Number(d.loadKg),
    thirdPartyProvider: d.thirdPartyProvider || null,
    thirdPartyReference: d.thirdPartyReference || null,
  };
}

router.get('/', requireRole(['ADMIN', 'WAREHOUSE_STAFF', 'DRIVER', 'DELIVERY_GUY', 'CLIENT']), async (req, res, next) => {
  try {
    const pagination = parsePagination(req.query);
    const q = req.query.q ? String(req.query.q) : '';
    const status = req.query.status ? String(req.query.status).toUpperCase().replace(/-/g, '_') : '';
    const includeDeleted = req.query.includeDeleted === 'true';
    const onlyDeleted = req.query.onlyDeleted === 'true';
    let clientId = null;
    const roleList = getRoleList(req.user);
    const scopeWhere = await buildDeliveryScope(req);
    const where = {
      AND: [
        scopeWhere,
        onlyDeleted ? { deletedAt: { not: null } } : includeDeleted ? {} : { deletedAt: null },
        q
          ? {
              OR: [
                { drNumber: { contains: q, mode: 'insensitive' } },
                { clientOrder: { orderNumber: { contains: q, mode: 'insensitive' } } },
                { clientOrder: { client: { clientName: { contains: q, mode: 'insensitive' } } } },
                { assignedDeliveryGuy: { fullName: { contains: q, mode: 'insensitive' } } },
              ],
            }
          : {},
        status ? { status } : {},
        clientId && (roleList.includes('ADMIN') || roleList.includes('WAREHOUSE_STAFF'))
          ? { clientOrder: { clientId } }
          : {},
      ],
    };
    const sort = parseSort(req.query, ['createdAt', 'status', 'eta']);
    const orderBy = sort ? { [sort.sortBy]: sort.sortDir } : { createdAt: 'desc' };
    const columnSupport = await getDeliveryColumnSupport();
    const [deliveries, total] = await Promise.all([
      prisma.delivery.findMany({
        select: deliverySelect(columnSupport.batches),
        where,
        skip: pagination ? (pagination.page - 1) * pagination.pageSize : undefined,
        take: pagination ? pagination.pageSize : undefined,
        orderBy,
      }),
      prisma.delivery.count({ where }),
    ]);

    const data = deliveries.map(mapDelivery);

    if (pagination) {
      return res.json(buildPaginatedResponse(data, total, pagination.page, pagination.pageSize));
    }
    return res.json(data);
  } catch (err) {
    next(err);
  }
});

router.post('/', requireRole(['ADMIN', 'WAREHOUSE_STAFF']), async (req, res, next) => {
  try {
    const columnSupport = await getDeliveryColumnSupport();
    const {
      drNumber,
      clientOrderId,
      status,
      eta,
      itemsCount,
      deliveryMethod,
      loadKg,
      thirdPartyProvider,
      thirdPartyReference,
      receiverName,
      receiverAddress,
      receiverContactNumber,
      notes,
    } = req.body;
    if (!isNonEmptyString(drNumber)) return res.status(400).json({ error: 'DR number is required' });
    if (!clientOrderId || !isPositiveInt(clientOrderId)) return res.status(400).json({ error: 'Client order is required' });
    if (eta && !isValidDateString(eta)) {
      return res.status(400).json({ error: 'Invalid ETA' });
    }
    if (itemsCount !== undefined && !isNonNegativeNumber(itemsCount)) {
      return res.status(400).json({ error: 'Invalid items count' });
    }
    if (status) {
      const s = status.toUpperCase().replace('-', '_');
      if (!['PENDING', 'IN_TRANSIT', 'DELIVERED', 'RETURN_PENDING', 'RETURN_REJECTED', 'RETURNED', 'DELAYED'].includes(s)) {
        return res.status(400).json({ error: 'Invalid status' });
      }
    }

    const defaultEta = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const delivery = await prisma.delivery.create({
      data: {
        drNumber,
        clientOrderId: Number(clientOrderId),
        assignedDeliveryGuyId: null,
        status: status ? status.toUpperCase().replace('-', '_') : 'PENDING',
        eta: eta ? new Date(eta) : defaultEta,
        itemsCount,
        ...(columnSupport.batches
          ? {
              deliveryMethod: deliveryMethod ? String(deliveryMethod).toUpperCase() : thirdPartyProvider ? 'LALAMOVE' : 'TRUCK',
              loadKg: loadKg === undefined || loadKg === '' ? null : Number(loadKg),
              thirdPartyProvider: thirdPartyProvider || null,
              thirdPartyReference: thirdPartyReference || null,
            }
          : {}),
        receiverName: receiverName || null,
        receiverAddress: receiverAddress || null,
        receiverContactNumber: receiverContactNumber || null,
        notes: notes || null,
      },
      select: deliverySelect(columnSupport.batches),
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: 'CREATE',
        target: 'Delivery',
        details: `Created delivery ${delivery.drNumber}`,
      },
    });

    res.status(201).json(mapDelivery(delivery));
  } catch (err) {
    if (err.message?.includes('Assigned')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.put('/:id', requireRole(['ADMIN', 'WAREHOUSE_STAFF', 'DRIVER', 'DELIVERY_GUY']), async (req, res, next) => {
  try {
    const columnSupport = await getDeliveryColumnSupport();
    if (req.body.status) {
      const s = req.body.status.toUpperCase().replace(/[-\s]+/g, '_');
      if (!['PENDING', 'IN_TRANSIT', 'DELIVERED', 'RETURN_PENDING', 'RETURN_REJECTED', 'RETURNED', 'DELAYED'].includes(s)) {
        return res.status(400).json({ error: 'Invalid status' });
      }
    }
    if (req.body.receivedAt && !isValidDateString(req.body.receivedAt)) {
      return res.status(400).json({ error: 'Invalid received date' });
    }
    if (req.body.receivedBy !== undefined && !isNonEmptyString(req.body.receivedBy)) {
      return res.status(400).json({ error: 'Received by is required' });
    }

    const existing = await prisma.delivery.findUnique({
      where: { deliveryId: Number(req.params.id) },
      select: deliverySelect(columnSupport.batches),
    });
    if (!existing) return res.status(404).json({ error: 'Delivery not found' });

    if (req.body.assignedDeliveryGuyId !== undefined) {
      return res.status(400).json({ error: 'Delivery assignment is disabled in the single-driver workflow' });
    }

    const currentStatus = existing.status;
    const requestedStatus = req.body.status ? req.body.status.toUpperCase().replace(/[-\s]+/g, '_') : null;
    if (requestedStatus) {
      const allowed =
        (currentStatus === 'PENDING' && ['IN_TRANSIT', 'DELAYED'].includes(requestedStatus)) ||
        ((currentStatus === 'IN_TRANSIT' || currentStatus === 'DELAYED') && ['DELIVERED', 'DELAYED'].includes(requestedStatus)) ||
        (currentStatus === 'DELIVERED' && requestedStatus === 'RETURN_PENDING') ||
        (currentStatus === 'RETURN_PENDING' && ['RETURNED', 'RETURN_REJECTED'].includes(requestedStatus));
      if (!allowed) {
        return res.status(400).json({ error: `Invalid status transition: ${currentStatus} -> ${requestedStatus}` });
      }
      if (
        requestedStatus === 'IN_TRANSIT' &&
        !['APPROVED', 'PROCESSING', 'SHIPPED'].includes(existing.clientOrder?.status)
      ) {
        return res.status(400).json({ error: 'Order must be approved before delivery can begin.' });
      }
      if (requestedStatus === 'DELIVERED' && !req.body.receivedBy) {
        return res.status(400).json({ error: 'Received by is required' });
      }
      if (requestedStatus === 'RETURN_PENDING' && !req.body.notes) {
        return res.status(400).json({ error: 'Return reason is required' });
      }
      if (requestedStatus === 'DELAYED' && !req.body.notes) {
        return res.status(400).json({ error: 'Delay reason is required' });
      }
      if (requestedStatus === 'DELAYED' && !req.body.eta) {
        return res.status(400).json({ error: 'Updated ETA is required for delayed deliveries' });
      }
      if (requestedStatus === 'RETURN_REJECTED' && !req.body.returnRejectionReason) {
        return res.status(400).json({ error: 'Return rejection reason is required' });
      }
    }

    const delivery = await prisma.delivery.update({
      where: { deliveryId: Number(req.params.id) },
      data: {
        status: requestedStatus || undefined,
        eta: req.body.eta ? new Date(req.body.eta) : undefined,
        receivedBy: req.body.receivedBy,
        receiverName: req.body.receiverName || req.body.receivedBy,
        receiverAddress: req.body.receiverAddress,
        receiverContactNumber: req.body.receiverContactNumber,
        receivedAt: req.body.receivedAt ? new Date(req.body.receivedAt) : requestedStatus === 'DELIVERED' ? new Date() : undefined,
        notes: req.body.notes,
        proofOfDeliveryUrl: req.body.proofOfDelivery || undefined,
        returnRejectionReason: req.body.returnRejectionReason,
        ...(columnSupport.batches
          ? {
              deliveryMethod: req.body.deliveryMethod ? String(req.body.deliveryMethod).toUpperCase() : undefined,
              loadKg: req.body.loadKg === undefined || req.body.loadKg === '' ? undefined : Number(req.body.loadKg),
              thirdPartyProvider: req.body.thirdPartyProvider,
              thirdPartyReference: req.body.thirdPartyReference,
            }
          : {}),
      },
      select: deliverySelect(columnSupport.batches),
    });

    const updatedStatus = requestedStatus;
    if (updatedStatus && existing.clientOrderId) {
      const orderStatus =
        updatedStatus === 'IN_TRANSIT'
          ? 'SHIPPED'
          : updatedStatus === 'DELIVERED'
          ? 'DELIVERED'
          : null;
      if (orderStatus) {
        await prisma.clientOrder.update({
          where: { clientOrderId: existing.clientOrderId },
          data: { status: orderStatus },
        });
      }
    }

    if (updatedStatus === 'RETURNED' && existing.status === 'RETURN_PENDING' && existing.clientOrder?.items?.length) {
      for (const item of existing.clientOrder.items) {
        if (!item.productId) continue;
        const product = await prisma.product.findUnique({ where: { productId: item.productId } });
        if (!product) continue;
        const newBalance = product.qtyOnHand + item.quantity;
        const statusValue = newBalance <= 0 ? 'OUT_OF_STOCK' : newBalance <= product.lowStockThreshold ? 'LOW_STOCK' : 'AVAILABLE';
        await prisma.product.update({
          where: { productId: product.productId },
          data: { qtyOnHand: newBalance, status: statusValue },
        });
        await prisma.stockTransaction.create({
          data: {
            productId: product.productId,
            type: 'RETURN',
            qtyChange: item.quantity,
            newBalance,
            userId: req.user.userId,
            notes: `Returned items from ${delivery.drNumber}`,
          },
        });
      }
      await prisma.auditLog.create({
        data: {
          userId: req.user.userId,
          action: 'UPDATE',
          target: 'Stock',
          details: `Restocked items from return ${delivery.drNumber}`,
        },
      });
    }

    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: 'UPDATE',
        target: 'Delivery',
        details:
          updatedStatus === 'RETURN_REJECTED'
            ? `Return rejected for ${delivery.drNumber}`
            : updatedStatus === 'IN_TRANSIT'
            ? `Delivery begun for ${delivery.drNumber}`
            : updatedStatus === 'DELAYED'
            ? `Delivery delayed for ${delivery.drNumber}: ${req.body.notes || 'No reason provided'}`
            : `Updated delivery ${delivery.drNumber}`,
      },
    });

    if (existing?.clientOrder?.clientId) {
      const client = await prisma.client.findUnique({ where: { clientId: existing.clientOrder.clientId } });
      if (client?.email) {
        const clientUser = await prisma.user.findUnique({ where: { email: client.email } });
        if (clientUser) {
          const message =
            updatedStatus === 'RETURN_REJECTED'
              ? `Return request rejected for ${delivery.drNumber}. Reason: ${req.body.returnRejectionReason || 'Not provided'}.`
              : updatedStatus === 'IN_TRANSIT'
              ? `Delivery ${delivery.drNumber} has begun and is now in transit.`
              : updatedStatus === 'DELAYED'
              ? `Delivery ${delivery.drNumber} is delayed. Reason: ${req.body.notes || 'Not provided'}. Updated ETA: ${
                  delivery.eta ? new Date(delivery.eta).toLocaleString('en-PH') : 'To be scheduled'
                }.`
              : `Delivery ${delivery.drNumber} status is now ${delivery.status.toLowerCase().replace(/_/g, ' ')}.`;
          await prisma.notification.create({
            data: {
              userId: clientUser.userId,
              type: 'DELIVERY_UPDATE',
              title: 'Delivery update',
              message,
              link: '/client/deliveries',
            },
          });
        }
      }
    }

    res.json(mapDelivery(delivery));
  } catch (err) {
    if (err.message?.includes('Assigned')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.post('/:id/confirm', requireRole(['CLIENT']), async (req, res, next) => {
  try {
    const columnSupport = await getDeliveryColumnSupport();
    const delivery = await prisma.delivery.findUnique({
      where: { deliveryId: Number(req.params.id) },
      select: deliverySelect(columnSupport.batches),
    });
    if (!delivery) return res.status(404).json({ error: 'Delivery not found' });
    if (delivery.status !== 'IN_TRANSIT' && delivery.status !== 'DELAYED') {
      return res.status(400).json({ error: 'Only active deliveries can be confirmed.' });
    }
    const access = await resolveClientAccess(prisma, req.user.userId);
    const ownsByClient = access?.client && delivery.clientOrder?.clientId === access.client.clientId;
    const ownsByCreator = delivery.clientOrder?.createdBy === req.user.userId;
    if (!ownsByClient || (access?.isUserScoped && !ownsByCreator)) return res.status(403).json({ error: 'Forbidden' });

    const receivedBy = req.body.receivedBy;
    if (!isNonEmptyString(receivedBy)) {
      return res.status(400).json({ error: 'Received by is required' });
    }

    const updated = await prisma.delivery.update({
      where: { deliveryId: delivery.deliveryId },
      data: {
        status: 'DELIVERED',
        receivedBy,
        receivedAt: new Date(),
        notes: req.body.notes || delivery.notes,
      },
      select: deliverySelect(columnSupport.batches),
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: 'CONFIRM',
        target: 'Delivery',
        details: `Client confirmed delivery ${updated.drNumber}`,
      },
    });

    res.json(mapDelivery(updated));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/return', requireRole(['CLIENT']), async (req, res, next) => {
  try {
    const columnSupport = await getDeliveryColumnSupport();
    const delivery = await prisma.delivery.findUnique({
      where: { deliveryId: Number(req.params.id) },
      select: deliverySelect(columnSupport.batches),
    });
    if (!delivery) return res.status(404).json({ error: 'Delivery not found' });
    if (delivery.status !== 'DELIVERED') {
      return res.status(400).json({ error: 'Only delivered items can be returned.' });
    }
    const access = await resolveClientAccess(prisma, req.user.userId);
    const ownsByClient = access?.client && delivery.clientOrder?.clientId === access.client.clientId;
    const ownsByCreator = delivery.clientOrder?.createdBy === req.user.userId;
    if (!ownsByClient || (access?.isUserScoped && !ownsByCreator)) return res.status(403).json({ error: 'Forbidden' });
    if (!isNonEmptyString(req.body.reason)) {
      return res.status(400).json({ error: 'Return reason is required' });
    }

    const updated = await prisma.delivery.update({
      where: { deliveryId: delivery.deliveryId },
      data: {
        status: 'RETURN_PENDING',
        notes: req.body.reason,
      },
      select: deliverySelect(columnSupport.batches),
    });

    const admins = await prisma.user.findMany({
      where: { role: { roleName: 'ADMIN' }, deletedAt: null },
    });
    if (admins.length > 0) {
      await prisma.notification.createMany({
        data: admins.map((admin) => ({
          userId: admin.userId,
          type: 'DELIVERY_UPDATE',
          title: 'Return requested',
          message: `Return requested for ${updated.drNumber}. Reason: ${req.body.reason}`,
          link: '/admin/logistics',
        })),
      });
    }

    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: 'UPDATE',
        target: 'Delivery',
        details: `Client requested return for delivery ${updated.drNumber}`,
      },
    });

    res.json(mapDelivery(updated));
  } catch (err) {
    next(err);
  }
});


router.post('/:id/proof', requireRole(['ADMIN', 'WAREHOUSE_STAFF', 'DRIVER', 'DELIVERY_GUY']), uploadProof.single('proof'), async (req, res, next) => {
  try {
    const columnSupport = await getDeliveryColumnSupport();
    const existing = await prisma.delivery.findUnique({
      where: { deliveryId: Number(req.params.id) },
      select: { deliveryId: true },
    });
    if (!existing) return res.status(404).json({ error: 'Delivery not found' });
    if (!req.file) {
      return res.status(400).json({ error: 'Proof file is required' });
    }

    const proofPath = `/uploads/deliveries/${req.file.filename}`;
    const delivery = await prisma.delivery.update({
      where: { deliveryId: existing.deliveryId },
      data: { proofOfDeliveryUrl: proofPath },
      select: deliverySelect(columnSupport.batches),
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: 'UPDATE',
        target: 'Delivery',
        details: `Uploaded proof of delivery for ${delivery.drNumber}`,
      },
    });

    res.json(mapDelivery(delivery));
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireRole(['ADMIN']), async (req, res, next) => {
  try {
    const deliveryId = Number(req.params.id);
    await prisma.delivery.update({
      where: { deliveryId },
      data: { deletedAt: new Date() },
      select: { deliveryId: true },
    });
    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: 'DELETE',
        target: 'Delivery',
        details: `Soft-deleted delivery ${deliveryId}`,
      },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.put('/:id/restore', requireRole(['ADMIN']), async (req, res, next) => {
  try {
    const deliveryId = Number(req.params.id);
    const columnSupport = await getDeliveryColumnSupport();
    const delivery = await prisma.delivery.update({
      where: { deliveryId },
      data: { deletedAt: null },
      select: deliverySelect(columnSupport.batches),
    });
    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: 'UPDATE',
        target: 'Delivery',
        details: `Restored delivery ${deliveryId}`,
      },
    });
    res.json(mapDelivery(delivery));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
