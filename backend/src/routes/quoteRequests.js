const express = require('express');
const prisma = require('../utils/prisma');
const { parsePagination, buildPaginatedResponse, parseSort } = require('../utils/pagination');
const { requireAuth, requireRole, getRoleList } = require('../middleware/auth');
const { isPositiveInt, isNonNegativeNumber, isValidDateString, isNonEmptyString } = require('../utils/validate');
const { resolveLinkedClient } = require('../utils/clientVisibility');

const router = express.Router();
router.use(requireAuth);

function hasRole(req, role) {
  return getRoleList(req.user).includes(String(role).toUpperCase());
}

async function resolveClientIdForUser(userId) {
  return (await resolveLinkedClient(prisma, userId))?.client?.clientId || null;
}

async function canManageQuote(req, quoteRequest) {
  if (hasRole(req, 'ADMIN')) return true;
  if (hasRole(req, 'SALES_AGENT')) return true;
  if (hasRole(req, 'PROJECT_MANAGER')) {
    const project = quoteRequest.project || (quoteRequest.projectId
      ? await prisma.project.findUnique({ where: { projectId: quoteRequest.projectId } })
      : null);
    return project?.assignedPmId === req.user.userId;
  }
  if (hasRole(req, 'CLIENT')) {
    const clientId = await resolveClientIdForUser(req.user.userId);
    return Boolean(clientId && quoteRequest.clientId === clientId);
  }
  return false;
}

async function buildQuoteScope(req) {
  const roleList = getRoleList(req.user);
  if (roleList.includes('ADMIN') || roleList.includes('PRESIDENT')) {
    return {};
  }

  const scopes = [];

  if (roleList.includes('CLIENT')) {
    const clientId = await resolveClientIdForUser(req.user.userId);
    if (clientId) {
      scopes.push({ clientId });
    }
  }

  if (roleList.includes('SALES_AGENT')) {
    scopes.push({});
  }

  if (roleList.includes('PROJECT_MANAGER')) {
    scopes.push({ project: { assignedPmId: req.user.userId } });
  }

  if (scopes.length === 0) {
    return { quoteRequestId: -1 };
  }

  return scopes.length === 1 ? scopes[0] : { OR: scopes };
}

router.get('/', requireRole(['ADMIN', 'PRESIDENT', 'SALES_AGENT', 'PROJECT_MANAGER', 'CLIENT']), async (req, res, next) => {
  try {
    const pagination = parsePagination(req.query);
    const q = req.query.q ? String(req.query.q) : '';
    const status = req.query.status ? String(req.query.status).toUpperCase() : '';
    const roleList = getRoleList(req.user);
    const clientId = req.query.clientId ? Number(req.query.clientId) : null;
    if (
      !roleList.includes('ADMIN') &&
      !roleList.includes('PRESIDENT') &&
      !roleList.includes('SALES_AGENT') &&
      !roleList.includes('PROJECT_MANAGER') &&
      !roleList.includes('CLIENT')
    ) {
      return res.json([]);
    }
    const scopeWhere = await buildQuoteScope(req);
    const where = {
      AND: [
        scopeWhere,
        { deletedAt: null },
        q
          ? {
              OR: [
                { client: { clientName: { contains: q, mode: 'insensitive' } } },
                { project: { projectName: { contains: q, mode: 'insensitive' } } },
                { customRequirements: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {},
        status ? { status } : {},
        clientId && (roleList.includes('ADMIN') || roleList.includes('PRESIDENT')) ? { clientId } : {},
      ],
    };
    const sort = parseSort(req.query, ['createdAt', 'status']);
    const orderBy = sort ? { [sort.sortBy]: sort.sortDir } : { createdAt: 'desc' };
    const [requests, total] = await Promise.all([
      prisma.quoteRequest.findMany({
        include: { client: true, project: true, items: true },
        where,
        skip: pagination ? (pagination.page - 1) * pagination.pageSize : undefined,
        take: pagination ? pagination.pageSize : undefined,
        orderBy,
      }),
      prisma.quoteRequest.count({ where }),
    ]);

    const data = requests.map((r) => ({
      id: r.quoteRequestId.toString(),
      clientId: r.clientId?.toString() || null,
      clientName: r.client?.clientName || 'Client',
      projectName: r.project?.projectName || null,
      items: r.items.map((item) => ({
        name: item.itemName,
        quantity: item.quantity,
        notes: item.notes || null,
      })),
      customRequirements: r.customRequirements || null,
      status: r.status.toLowerCase(),
      createdAt: r.createdAt.toISOString(),
      respondedAt: r.respondedAt ? r.respondedAt.toISOString() : null,
      quotedAmount: r.quotedAmount ? Number(r.quotedAmount) : null,
    }));

    if (pagination) {
      return res.json(buildPaginatedResponse(data, total, pagination.page, pagination.pageSize));
    }
    return res.json(data);
  } catch (err) {
    next(err);
  }
});

router.post('/', requireRole(['ADMIN', 'SALES_AGENT', 'CLIENT']), async (req, res, next) => {
  try {
    const { clientId, projectId, items, customRequirements } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one item is required' });
    }
    if (items.some((item) => !isNonEmptyString(item.name) || Number(item.quantity || 0) <= 0)) {
      return res.status(400).json({ error: 'Item name and quantity are required' });
    }
    if (clientId && !isPositiveInt(clientId)) {
      return res.status(400).json({ error: 'Invalid client' });
    }
    if (projectId && !isPositiveInt(projectId)) {
      return res.status(400).json({ error: 'Invalid project' });
    }

    let resolvedClientId = clientId ? Number(clientId) : null;
    if (hasRole(req, 'CLIENT')) {
      resolvedClientId = await resolveClientIdForUser(req.user.userId);
      if (!resolvedClientId) {
        return res.status(400).json({ error: 'No client account is linked to this user' });
      }
    }
    if (hasRole(req, 'PROJECT_MANAGER')) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const request = await prisma.quoteRequest.create({
      data: {
        clientId: resolvedClientId,
        projectId: projectId ? Number(projectId) : null,
        customRequirements,
        items: {
          create: items.map((item) => ({
            itemName: item.name,
            quantity: Number(item.quantity || 0),
            notes: item.notes,
          })),
        },
      },
      include: { client: true, project: true, items: true },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: 'CREATE',
        target: 'QuoteRequest',
        details: `Created quote request ${request.quoteRequestId}`,
      },
    });

    res.status(201).json(request);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireRole(['ADMIN', 'SALES_AGENT', 'PROJECT_MANAGER', 'CLIENT']), async (req, res, next) => {
  try {
    if (req.body.status) {
      const status = req.body.status.toUpperCase();
      if (!['PENDING', 'RESPONDED', 'ACCEPTED', 'DECLINED'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }
    }
    if (req.body.respondedAt && !isValidDateString(req.body.respondedAt)) {
      return res.status(400).json({ error: 'Invalid responded date' });
    }
    if (req.body.quotedAmount !== undefined && !isNonNegativeNumber(req.body.quotedAmount)) {
      return res.status(400).json({ error: 'Quoted amount must be 0 or greater' });
    }

    const existing = await prisma.quoteRequest.findUnique({
      where: { quoteRequestId: Number(req.params.id) },
      include: { project: true },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Quote request not found' });
    }
    if (!(await canManageQuote(req, existing))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const isClient = hasRole(req, 'CLIENT');
    const nextStatus = req.body.status ? req.body.status.toUpperCase() : undefined;
    if (isClient && nextStatus && !['ACCEPTED', 'DECLINED'].includes(nextStatus)) {
      return res.status(403).json({ error: 'Clients can only accept or decline quote responses' });
    }

    const request = await prisma.quoteRequest.update({
      where: { quoteRequestId: Number(req.params.id) },
      data: {
        status: nextStatus,
        respondedAt: req.body.respondedAt ? new Date(req.body.respondedAt) : nextStatus === 'RESPONDED' ? new Date() : undefined,
        quotedAmount: !isClient ? req.body.quotedAmount : undefined,
      },
    });
    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: 'UPDATE',
        target: 'QuoteRequest',
        details: `Updated quote request ${request.quoteRequestId}`,
      },
    });
    res.json(request);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireRole(['ADMIN']), async (req, res, next) => {
  try {
    const quoteRequestId = Number(req.params.id);
    await prisma.quoteRequest.update({
      where: { quoteRequestId },
      data: { deletedAt: new Date() },
    });
    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: 'DELETE',
        target: 'Quote Request',
        details: `Soft-deleted quote request ${quoteRequestId}`,
      },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
