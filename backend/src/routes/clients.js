const express = require('express');
const prisma = require('../utils/prisma');
const { parsePagination, buildPaginatedResponse, parseSort } = require('../utils/pagination');
const { requireAuth, requireRole, getRoleList } = require('../middleware/auth');
const { isEmail, isNonEmptyString, isPositiveInt } = require('../utils/validate');
const { resolveLinkedClient } = require('../utils/clientVisibility');

const router = express.Router();
router.use(requireAuth);

const hasRole = (req, role) => getRoleList(req.user).includes(String(role).toUpperCase());

router.get('/', async (req, res, next) => {
  try {
    const pagination = parsePagination(req.query);
    const q = req.query.q ? String(req.query.q) : '';
    let where = q
      ? {
          OR: [
            { clientName: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
            { address: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {};
    where = { ...where, deletedAt: null };
    if (hasRole(req, 'CLIENT')) {
      const client = (await resolveLinkedClient(prisma, req.user.userId))?.client;
      if (client?.clientId) {
        where = { clientId: client.clientId, deletedAt: null };
      }
    }
    const sort = parseSort(req.query, ['clientName', 'email', 'address']);
    const orderBy = sort ? { [sort.sortBy]: sort.sortDir } : { clientName: 'asc' };
    const [clients, total] = await Promise.all([
      prisma.client.findMany({
        where,
        skip: pagination ? (pagination.page - 1) * pagination.pageSize : undefined,
        take: pagination ? pagination.pageSize : undefined,
        orderBy,
      }),
      prisma.client.count({ where }),
    ]);
    const data = clients.map((c) => ({
      id: c.clientId.toString(),
      name: c.clientName,
      contactPerson: c.contactPerson || c.clientName,
      email: c.email,
      phone: c.phone || null,
      address: c.address,
      tin: c.tin || null,
      visibilityScope: String(c.visibilityScope || 'COMPANY').toLowerCase(),
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
    const { clientName, address, email, contactPerson, phone, tin, visibilityScope } = req.body;
    if (!isNonEmptyString(clientName)) return res.status(400).json({ error: 'Client name is required' });
    if (email && !isEmail(email)) {
      return res.status(400).json({ error: 'Invalid email' });
    }
    const client = await prisma.client.create({
      data: {
        clientName,
        address,
        email,
        contactPerson,
        phone,
        tin,
        visibilityScope: String(visibilityScope || 'company').toUpperCase() === 'USER' ? 'USER' : 'COMPANY',
      },
    });
    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: 'CREATE',
        target: 'Client',
        details: `Created client ${client.clientName}`,
      },
    });
    res.status(201).json(client);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireRole(['ADMIN', 'CLIENT']), async (req, res, next) => {
  try {
    if (hasRole(req, 'CLIENT')) {
      const client = (await resolveLinkedClient(prisma, req.user.userId))?.client;
      if (!client || client.clientId !== Number(req.params.id)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }
    if (req.body.clientName !== undefined && !isNonEmptyString(req.body.clientName)) {
      return res.status(400).json({ error: 'Client name is required' });
    }
    if (req.body.email && !isEmail(req.body.email)) {
      return res.status(400).json({ error: 'Invalid email' });
    }
    if (
      req.body.visibilityScope !== undefined &&
      !['company', 'user', 'COMPANY', 'USER'].includes(String(req.body.visibilityScope))
    ) {
      return res.status(400).json({ error: 'Invalid visibility scope' });
    }
    const client = await prisma.client.update({
      where: { clientId: Number(req.params.id) },
      data: {
        clientName: req.body.clientName,
        address: req.body.address,
        email: req.body.email,
        contactPerson: req.body.contactPerson,
        phone: req.body.phone,
        tin: req.body.tin,
        visibilityScope:
          req.body.visibilityScope !== undefined
            ? String(req.body.visibilityScope).toUpperCase() === 'USER'
              ? 'USER'
              : 'COMPANY'
            : undefined,
      },
    });
    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: 'UPDATE',
        target: 'Client',
        details: `Updated client ${client.clientName}`,
      },
    });
    res.json(client);
  } catch (err) {
    next(err);
  }
});

router.post('/merge', requireRole(['ADMIN']), async (req, res, next) => {
  try {
    const sourceClientId = Number(req.body.sourceClientId);
    const targetClientId = Number(req.body.targetClientId);
    const reason = String(req.body.reason || '').trim();
    if (!isPositiveInt(sourceClientId) || !isPositiveInt(targetClientId)) {
      return res.status(400).json({ error: 'Source and target clients are required' });
    }
    if (sourceClientId === targetClientId) {
      return res.status(400).json({ error: 'Choose two different clients to merge' });
    }
    const [source, target] = await Promise.all([
      prisma.client.findFirst({ where: { clientId: sourceClientId, deletedAt: null } }),
      prisma.client.findFirst({ where: { clientId: targetClientId, deletedAt: null } }),
    ]);
    if (!source || !target) return res.status(404).json({ error: 'Client not found' });

    const result = await prisma.$transaction(async (tx) => {
      const [projects, clientOrders, quoteRequests, payments] = await Promise.all([
        tx.project.updateMany({ where: { clientId: sourceClientId }, data: { clientId: targetClientId } }),
        tx.clientOrder.updateMany({ where: { clientId: sourceClientId }, data: { clientId: targetClientId } }),
        tx.quoteRequest.updateMany({ where: { clientId: sourceClientId }, data: { clientId: targetClientId } }),
        tx.paymentTransaction.updateMany({ where: { clientId: sourceClientId }, data: { clientId: targetClientId } }),
      ]);
      await tx.client.update({
        where: { clientId: sourceClientId },
        data: { deletedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          userId: req.user.userId,
          action: 'MERGE',
          target: 'Client',
          details: `Merged client ${source.clientName} (${sourceClientId}) into ${target.clientName} (${targetClientId})${reason ? `. Reason: ${reason}` : ''}`,
        },
      });
      return {
        projects: projects.count,
        clientOrders: clientOrders.count,
        quoteRequests: quoteRequests.count,
        payments: payments.count,
      };
    });

    res.json({
      ok: true,
      sourceClientId: sourceClientId.toString(),
      targetClientId: targetClientId.toString(),
      mergedInto: target.clientName,
      moved: result,
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireRole(['ADMIN']), async (req, res, next) => {
  try {
    const clientId = Number(req.params.id);
    await prisma.client.update({
      where: { clientId },
      data: { deletedAt: new Date() },
    });
    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: 'DELETE',
        target: 'Client',
        details: `Soft-deleted client ${clientId}`,
      },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
