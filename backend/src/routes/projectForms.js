const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const prisma = require('../utils/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');
const { isNonEmptyString, isPositiveInt } = require('../utils/validate');
const { resolveLinkedClient } = require('../utils/clientVisibility');

const router = express.Router();
router.use(requireAuth);

const formsFile = path.join(__dirname, '../../database/project-forms.json');

const normalizeRoles = (req) =>
  Array.isArray(req.user?.roles)
    ? req.user.roles.map((role) => String(role).toUpperCase())
    : [String(req.user?.role || '').toUpperCase()];

const hasRole = (req, role) => normalizeRoles(req).includes(String(role).toUpperCase());

async function readForms() {
  try {
    const raw = await fs.readFile(formsFile, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function writeForms(forms) {
  await fs.writeFile(formsFile, JSON.stringify(forms, null, 2));
}

function validateLines(lines) {
  if (!Array.isArray(lines)) return [];
  return lines
    .map((line) => ({
      qty: Number(line.qty || 0),
      unit: String(line.unit || '').trim(),
      description: String(line.description || '').trim(),
    }))
    .filter((line) => line.qty > 0 || line.unit || line.description);
}

async function ensureProjectAccess(req, projectId) {
  const project = await prisma.project.findUnique({
    where: { projectId: Number(projectId) },
    include: { client: true },
  });
  if (!project || project.deletedAt) return null;

  if (hasRole(req, 'ADMIN') || hasRole(req, 'PRESIDENT')) {
    return project;
  }

  if (hasRole(req, 'PROJECT_MANAGER')) {
    if (project.assignedPmId === req.user.userId) return project;
  }

  if (hasRole(req, 'ENGINEER')) {
    const forms = await readForms();
    const engineerRequests = await prisma.materialRequest.findMany({
      where: {
        requestedBy: req.user.userId,
        deletedAt: null,
        projectId: Number(projectId),
      },
      select: { requestId: true },
      take: 1,
    });

    const hasCreatedForm = forms.some(
      (form) => Number(form.projectId) === Number(projectId) && Number(form.createdBy) === Number(req.user.userId)
    );

    if (engineerRequests.length > 0 || hasCreatedForm) return project;
    return null;
  }

  if (hasRole(req, 'CLIENT')) {
    const client = (await resolveLinkedClient(prisma, req.user.userId))?.client;
    if (client?.clientId === project.clientId) return project;
    return null;
  }

  return null;
}

async function getAccessibleProjectIds(req) {
  if (hasRole(req, 'ADMIN') || hasRole(req, 'PRESIDENT')) {
    const projects = await prisma.project.findMany({
      where: { deletedAt: null },
      select: { projectId: true },
    });
    return new Set(projects.map((project) => Number(project.projectId)));
  }

  const ids = new Set();

  if (hasRole(req, 'PROJECT_MANAGER')) {
    const projects = await prisma.project.findMany({
      where: { assignedPmId: req.user.userId, deletedAt: null },
      select: { projectId: true },
    });
    projects.forEach((project) => ids.add(Number(project.projectId)));
  }

  if (hasRole(req, 'ENGINEER')) {
    const [requests, forms] = await Promise.all([
      prisma.materialRequest.findMany({
        where: {
          requestedBy: req.user.userId,
          deletedAt: null,
          projectId: { not: null },
        },
        select: { projectId: true },
        distinct: ['projectId'],
      }),
      readForms(),
    ]);
    requests.forEach((request) => ids.add(Number(request.projectId)));
    forms
      .filter((form) => Number(form.createdBy) === Number(req.user.userId))
      .forEach((form) => ids.add(Number(form.projectId)));
  }

  if (hasRole(req, 'CLIENT')) {
    const client = (await resolveLinkedClient(prisma, req.user.userId))?.client;
    if (client) {
      const projects = await prisma.project.findMany({
        where: { clientId: client.clientId, deletedAt: null },
        select: { projectId: true },
      });
      projects.forEach((project) => ids.add(Number(project.projectId)));
    }
  }

  return ids;
}

router.get('/', requireRole(['ADMIN', 'PRESIDENT', 'PROJECT_MANAGER', 'ENGINEER', 'CLIENT']), async (req, res, next) => {
  try {
    const projectId = req.query.projectId ? Number(req.query.projectId) : null;
    const forms = await readForms();
    let filtered = forms;

    if (projectId) {
      const project = await ensureProjectAccess(req, projectId);
      if (!project) return res.status(403).json({ error: 'Forbidden' });
      filtered = forms.filter((form) => Number(form.projectId) === projectId);
    } else if (!hasRole(req, 'ADMIN') && !hasRole(req, 'PRESIDENT')) {
      const allowedIds = await getAccessibleProjectIds(req);
      filtered = forms.filter((form) => allowedIds.has(Number(form.projectId)));
    }

    res.json(filtered.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)));
  } catch (err) {
    next(err);
  }
});

router.post('/', requireRole(['ADMIN', 'PROJECT_MANAGER', 'ENGINEER']), async (req, res, next) => {
  try {
    const projectId = Number(req.body.projectId);
    if (!isPositiveInt(projectId)) {
      return res.status(400).json({ error: 'Project is required' });
    }
    const project =
      hasRole(req, 'ENGINEER') && !hasRole(req, 'ADMIN') && !hasRole(req, 'PRESIDENT') && !hasRole(req, 'PROJECT_MANAGER')
        ? await prisma.project.findUnique({
            where: { projectId: Number(projectId) },
            include: { client: true },
          })
        : await ensureProjectAccess(req, projectId);
    if (!project) return res.status(403).json({ error: 'Forbidden' });

    const payload = {
      projectName: String(req.body.projectName || '').trim(),
      company: String(req.body.company || '').trim(),
      address: String(req.body.address || '').trim(),
      oRefNumber: String(req.body.oRefNumber || '').trim(),
      poNumber: String(req.body.poNumber || '').trim(),
      area: String(req.body.area || '').trim(),
      requestedBy: String(req.body.requestedBy || '').trim(),
      checkedBy: String(req.body.checkedBy || '').trim(),
      thortexProducts: validateLines(req.body.thortexProducts),
      consumableMaterials: validateLines(req.body.consumableMaterials),
      toolsEquipmentOthers: validateLines(req.body.toolsEquipmentOthers),
      subtotal: Number(req.body.subtotal || 0),
      vat: Number(req.body.vat || 0),
      totalCost: Number(req.body.totalCost || 0),
    };

    if (!isNonEmptyString(payload.projectName)) return res.status(400).json({ error: 'Project name is required' });
    if (!isNonEmptyString(payload.company)) return res.status(400).json({ error: 'Company is required' });

    const forms = await readForms();
    const form = {
      id: `PF-${Date.now()}`,
      projectId: String(projectId),
      ...payload,
      createdBy: String(req.user.userId),
      createdAt: new Date().toISOString(),
    };
    forms.push(form);
    await writeForms(forms);

    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: 'CREATE',
        target: 'ProjectForm',
        details: `Created project form for ${payload.projectName}`,
      },
    });

    res.status(201).json(form);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
