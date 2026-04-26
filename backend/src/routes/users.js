const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../utils/prisma');
const { parsePagination, buildPaginatedResponse } = require('../utils/pagination');
const crypto = require('crypto');
const { sendVerificationEmail } = require('../utils/mailer');
const { requireAuth, requireRole, getRoleList } = require('../middleware/auth');
const { isEmail, isNonEmptyString } = require('../utils/validate');

const router = express.Router();

router.use(requireAuth);

const requireAdmin = requireRole(['ADMIN']);

function getPrimaryRole(user) {
  return (
    user.role?.roleName?.toLowerCase() ||
    user.userRoles?.map((ur) => ur.role?.roleName?.toLowerCase()).filter(Boolean)[0] ||
    'client'
  );
}

function requestHasRole(req, role) {
  return getRoleList(req.user).includes(String(role).toUpperCase());
}

router.get('/', requireAdmin, async (req, res, next) => {
  try {
    const pagination = parsePagination(req.query);
    const q = req.query.q ? String(req.query.q) : '';
    const includeDeactivated = req.query.includeDeactivated === 'true' || req.query.includeDeleted === 'true';
    const onlyDeleted = req.query.onlyDeleted === 'true';
    const where = {
      ...(onlyDeleted ? { deletedAt: { not: null } } : includeDeactivated ? {} : { deletedAt: null }),
      ...(q
        ? {
            OR: [
              { fullName: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        include: { role: true, userRoles: { include: { role: true } } },
        where,
        skip: pagination ? (pagination.page - 1) * pagination.pageSize : undefined,
        take: pagination ? pagination.pageSize : undefined,
        orderBy: { fullName: 'asc' },
      }),
      prisma.user.count({ where }),
    ]);
    const data = users.map((user) => ({
      id: user.userId.toString(),
      name: user.fullName,
      email: user.email,
      role: getPrimaryRole(user),
      roles: user.userRoles
        ? user.userRoles.map((ur) => ur.role?.roleName?.toLowerCase()).filter(Boolean)
        : [],
      status: user.status,
      phone: user.phone || null,
      avatarUrl: user.avatarUrl || null,
      proofDocUrl: user.proofDocUrl || null,
    }));
    if (pagination) {
      return res.json(buildPaginatedResponse(data, total, pagination.page, pagination.pageSize));
    }
    return res.json(data);
  } catch (err) {
    next(err);
  }
});

router.get('/me', async (req, res, next) => {
  try {
    if (!req.user?.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const user = await prisma.user.findUnique({
      where: { userId: req.user.userId, deletedAt: null },
      include: { role: true, userRoles: { include: { role: true } } },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      id: user.userId.toString(),
      name: user.fullName,
      email: user.email,
      role: getPrimaryRole(user),
      roles: user.userRoles
        ? user.userRoles.map((ur) => ur.role?.roleName?.toLowerCase()).filter(Boolean)
        : [],
      status: user.status,
      phone: user.phone || null,
      avatarUrl: user.avatarUrl || null,
      notificationPrefs: user.notificationPrefs || null,
      emailVerified: user.emailVerified,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAdmin, async (req, res, next) => {
  try {
    const { name, email, password, role, status, phone, companyName } = req.body;
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (!isEmail(email)) {
      return res.status(400).json({ error: 'Invalid email' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: 'Email already in use' });

    const roleRecord = await prisma.role.upsert({
      where: { roleName: String(role).toUpperCase() },
      update: {},
      create: { roleName: String(role).toUpperCase() },
    });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        fullName: name,
        email,
        passwordHash,
        roleId: roleRecord.roleId,
        status: status ? String(status).toUpperCase() : 'ACTIVE',
        phone: phone || null,
        emailVerified: true,
        notificationPrefs: { twoFactorEnabled: true },
      },
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.userId, roleId: roleRecord.roleId } },
      update: {},
      create: { userId: user.userId, roleId: roleRecord.roleId },
    });

    if (String(role).toLowerCase() === 'client' && companyName) {
      await prisma.client.create({
        data: {
          clientName: companyName,
          email,
          address: null,
        },
      });
    }

    res.status(201).json({
      id: user.userId.toString(),
      name: user.fullName,
      email: user.email,
      role: roleRecord.roleName.toLowerCase(),
      status: user.status,
      phone: user.phone || null,
      avatarUrl: user.avatarUrl || null,
      proofDocUrl: user.proofDocUrl || null,
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const userId = Number(req.params.id);
    await prisma.user.update({
      where: { userId },
      data: { status: 'SUSPENDED', deletedAt: new Date() },
    });
    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: 'DELETE',
        target: 'User',
        details: `Soft-deleted user ${userId}`,
      },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.put('/:id/restore', requireAdmin, async (req, res, next) => {
  try {
    const userId = Number(req.params.id);
    await prisma.user.update({
      where: { userId },
      data: { status: 'ACTIVE', deletedAt: null },
    });
    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: 'RESTORE',
        target: 'User',
        details: `Restored user ${userId}`,
      },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.put('/me', async (req, res, next) => {
  try {
    if (!req.user?.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { name, email, phone, avatarUrl } = req.body;
    if (name !== undefined && !isNonEmptyString(name)) {
      return res.status(400).json({ error: 'Name is required' });
    }
    if (email !== undefined && !isEmail(email)) {
      return res.status(400).json({ error: 'Invalid email' });
    }
    if (email) {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing && existing.userId !== req.user.userId) {
        return res.status(409).json({ error: 'Email already in use' });
      }
    }

    const user = await prisma.$transaction(async (tx) => {
      const current = await tx.user.findUnique({ where: { userId: req.user.userId } });
      const emailChanged = email && current?.email !== email;
      const verificationCode = emailChanged ? String(crypto.randomInt(100000, 999999)) : null;
      const verificationCodeHash = emailChanged ? await bcrypt.hash(verificationCode, 10) : null;
      const verificationExpiresAt = emailChanged ? new Date(Date.now() + 15 * 60 * 1000) : null;
      const updated = await tx.user.update({
        where: { userId: req.user.userId },
        data: {
          fullName: name,
          email,
          phone: phone || null,
          avatarUrl: avatarUrl || null,
          emailVerified: emailChanged ? false : undefined,
          verificationCodeHash: emailChanged ? verificationCodeHash : undefined,
          verificationExpiresAt: emailChanged ? verificationExpiresAt : undefined,
        },
      });

      if (email && requestHasRole(req, 'CLIENT')) {
        await tx.client.updateMany({
          where: { email: current?.email },
          data: { email },
        });
      }
      return { updated, emailChanged, verificationCode };
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: 'UPDATE',
        target: 'User',
        details: `Updated profile ${user.updated.email}`,
      },
    });

    let emailSent = true;
    let devOtp = null;
    if (user.emailChanged && user.verificationCode) {
      try {
        await sendVerificationEmail(email, user.verificationCode);
      } catch (err) {
        emailSent = false;
        if (process.env.NODE_ENV !== 'production' || process.env.ALLOW_DEV_OTP === 'true') {
          devOtp = user.verificationCode;
        }
        console.error('Verification email failed:', err.message || err);
      }
    }

    res.json({
      id: user.updated.userId.toString(),
      name: user.updated.fullName,
      email: user.updated.email,
      phone: user.updated.phone || null,
      avatarUrl: user.updated.avatarUrl || null,
      proofDocUrl: user.updated.proofDocUrl || null,
      notificationPrefs: user.updated.notificationPrefs || null,
      emailVerified: user.updated.emailVerified,
      requiresVerification: user.emailChanged,
      emailSent,
      devOtp,
    });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireAdmin, async (req, res, next) => {
  try {
    const userId = Number(req.params.id);
    if (Number.isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user id' });
    }
    if (req.body.email && !isEmail(req.body.email)) {
      return res.status(400).json({ error: 'Invalid email' });
    }
    if (req.body.email) {
      const existing = await prisma.user.findUnique({ where: { email: req.body.email } });
      if (existing && existing.userId !== userId) {
        return res.status(409).json({ error: 'Email already in use' });
      }
    }
    let roleId;
    if (req.body.role) {
      const roleRecord = await prisma.role.upsert({
        where: { roleName: String(req.body.role).toUpperCase() },
        update: {},
        create: { roleName: String(req.body.role).toUpperCase() },
      });
      roleId = roleRecord.roleId;
    }
    const user = await prisma.$transaction(async (tx) => {
      const current = await tx.user.findUnique({ where: { userId, deletedAt: null }, include: { role: true } });
      const updated = await tx.user.update({
        where: { userId },
        data: {
          fullName: req.body.name,
          email: req.body.email,
          roleId,
          status: req.body.status ? String(req.body.status).toUpperCase() : undefined,
          phone: req.body.phone,
        },
        include: { role: true },
      });
      if (roleId) {
        await tx.userRole.upsert({
          where: { userId_roleId: { userId, roleId } },
          update: {},
          create: { userId, roleId },
        });
      }
      const roleName = (current?.role?.roleName || updated.role?.roleName || '').toUpperCase();
      if (req.body.email && roleName === 'CLIENT') {
        await tx.client.updateMany({
          where: { email: current?.email },
          data: { email: req.body.email },
        });
      }
      return updated;
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: 'UPDATE',
        target: 'User',
        details: `Admin updated user ${user.email}`,
      },
    });

    res.json({
      id: user.userId.toString(),
      name: user.fullName,
      email: user.email,
      role: getPrimaryRole(user),
      status: user.status,
      phone: user.phone || null,
      avatarUrl: user.avatarUrl || null,
      proofDocUrl: user.proofDocUrl || null,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/roles', requireAdmin, async (req, res, next) => {
  try {
    const userId = Number(req.params.id);
    const roleName = String(req.body.role || '').toUpperCase();
    if (Number.isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user id' });
    }
    if (!roleName) {
      return res.status(400).json({ error: 'Role is required' });
    }
    const role = await prisma.role.upsert({
      where: { roleName },
      update: {},
      create: { roleName },
    });
    const user = await prisma.user.findUnique({ where: { userId, deletedAt: null } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId: role.roleId } },
      update: {},
      create: { userId, roleId: role.roleId },
    });
    const updated = await prisma.user.findUnique({
      where: { userId },
      include: { role: true, userRoles: { include: { role: true } } },
    });
    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: 'UPDATE',
        target: 'User',
        details: `Admin granted ${roleName} to ${updated?.email}`,
      },
    });
    res.json({
      id: updated.userId.toString(),
      name: updated.fullName,
      email: updated.email,
      role: getPrimaryRole(updated),
      roles: updated.userRoles.map((ur) => ur.role?.roleName?.toLowerCase()).filter(Boolean),
      status: updated.status,
      phone: updated.phone || null,
      avatarUrl: updated.avatarUrl || null,
      proofDocUrl: updated.proofDocUrl || null,
    });
  } catch (err) {
    next(err);
  }
});

router.put('/me/notifications', async (req, res, next) => {
  try {
    await prisma.user.update({
      where: { userId: req.user.userId },
      data: { notificationPrefs: req.body },
    });
    res.json({ ok: true, preferences: req.body });
  } catch (err) {
    next(err);
  }
});

router.put('/me/password', async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword) return res.status(400).json({ error: 'Missing new password' });
    if (String(newPassword).length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const user = await prisma.user.findUnique({ where: { userId: req.user.userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (currentPassword) {
      const valid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!valid) return res.status(401).json({ error: 'Invalid password' });
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { userId: req.user.userId },
      data: { passwordHash },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
