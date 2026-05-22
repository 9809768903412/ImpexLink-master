const express = require('express');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs/promises');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../utils/prisma');
const { requireAuth } = require('../middleware/auth');
const {
  sendOtpEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  getEmailDiagnostics,
  sanitizeEmailError,
} = require('../utils/mailer');
const crypto = require('crypto');
const { resolveLinkedClient, inferCompanyNameFromUser } = require('../utils/clientVisibility');

const router = express.Router();

const liveProofDir = path.join(__dirname, '..', '..', 'uploads', 'proofs');
const pendingProofDir = path.join(__dirname, '..', '..', 'storage', 'pending-proofs');
if (!fs.existsSync(liveProofDir)) {
  fs.mkdirSync(liveProofDir, { recursive: true });
}
if (!fs.existsSync(pendingProofDir)) {
  fs.mkdirSync(pendingProofDir, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, pendingProofDir),
    filename: (_req, file, cb) => {
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      const suffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `${suffix}-${safeName}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('Invalid file type'));
    }
    cb(null, true);
  },
});

function collectRoleNames(user, roleName) {
  const primary = roleName || user.role?.roleName || user.roleName;
  const fromJoin = Array.isArray(user.userRoles)
    ? user.userRoles.map((ur) => ur?.role?.roleName).filter(Boolean)
    : [];
  const names = [primary, ...fromJoin].filter(Boolean);
  return Array.from(new Set(names.map((r) => String(r).toUpperCase())));
}

function getDemoEmailSet() {
  return new Set(
    String(process.env.DEMO_USER_EMAILS || '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

function isDemoEmail(email) {
  if (!email) return false;
  return getDemoEmailSet().has(String(email).toLowerCase());
}

function getPrimaryRoleName(user, fallbackRoleName) {
  return collectRoleNames(user, fallbackRoleName)[0] || 'CLIENT';
}

function cleanEnvValue(value) {
  return String(value || '').trim().replace(/^['"]|['"]$/g, '').trim();
}

function envFlag(key) {
  return cleanEnvValue(process.env[key]).toLowerCase() === 'true';
}

function envValue(key) {
  return cleanEnvValue(process.env[key]);
}

function canUseOtpFallback() {
  if (envFlag('REQUIRE_EMAIL_OTP_DELIVERY')) return false;
  if (envFlag('ALLOW_TEST_VERIFICATION')) return true;
  if (envValue('NODE_ENV') === 'production' && !envFlag('ALLOW_DEV_OTP_IN_PRODUCTION')) return false;
  return (
    (envValue('NODE_ENV') !== 'production' && envValue('ALLOW_DEV_OTP') !== 'false') ||
    envFlag('ALLOW_DEV_OTP')
  );
}

function requireEmailOtpDelivery() {
  return envFlag('REQUIRE_EMAIL_OTP_DELIVERY');
}

async function removePendingProof(pendingPath) {
  if (!pendingPath || !String(pendingPath).startsWith('/pending-proofs/')) return;
  const filename = path.basename(String(pendingPath));
  const absolutePath = path.join(pendingProofDir, filename);
  try {
    await fsPromises.unlink(absolutePath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

async function promotePendingProof(pendingPath) {
  if (!pendingPath) return null;
  if (!String(pendingPath).startsWith('/pending-proofs/')) {
    return pendingPath;
  }
  const filename = path.basename(String(pendingPath));
  const sourcePath = path.join(pendingProofDir, filename);
  const targetPath = path.join(liveProofDir, filename);

  try {
    await fsPromises.rename(sourcePath, targetPath);
  } catch (error) {
    if (error.code === 'EXDEV') {
      await fsPromises.copyFile(sourcePath, targetPath);
      await fsPromises.unlink(sourcePath);
    } else if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  return `/uploads/proofs/${filename}`;
}

function buildUserResponse(user, roleName, client) {
  const initials = user.fullName
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const roles = collectRoleNames(user, roleName).map((r) => r.toLowerCase());
  const primary = roles[0] || roleName || 'client';

  return {
    id: user.userId.toString(),
    name: user.fullName,
    email: user.email,
    role: primary,
    roles,
    companyName: client?.clientName || undefined,
    clientId: client?.clientId ? client.clientId.toString() : undefined,
    clientVisibilityScope: client?.visibilityScope ? String(client.visibilityScope).toLowerCase() : undefined,
    avatar: initials,
    avatarUrl: user.avatarUrl || null,
    proofDocUrl: user.proofDocUrl || null,
    phone: user.phone || null,
    status: user.status,
    emailVerified: user.emailVerified,
    isDemo: isDemoEmail(user.email),
  };
}

async function ensureClientForUser(user) {
  if (!user) return null;
  const roles = collectRoleNames(user, user.role?.roleName || user.roleName);
  if (!roles.includes('CLIENT')) return null;
  const linked = await resolveLinkedClient(prisma, user);
  if (linked?.client) return linked.client;
  const clientName = inferCompanyNameFromUser(user) || user.fullName || user.email;
  return prisma.client.create({
    data: {
      clientName,
      email: user.email,
      contactPerson: user.fullName || clientName,
    },
  });
}

async function logLoginFailure(email, reason, userId = null) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'LOGIN_FAILED',
        target: 'Auth',
        details: `Login failed for ${email}: ${reason}`,
      },
    });
  } catch {
    // ignore audit failures
  }
}

router.post('/register', upload.single('proofDoc'), async (req, res, next) => {
  try {
    const { name, email, password, role, companyName, phone } = req.body;
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) {
      return res.status(400).json({ error: 'Invalid email' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = await prisma.user.findUnique({
      where: { email },
      include: { role: true, userRoles: { include: { role: true } } },
    });
    if (existing) return res.status(409).json({ error: 'Email already in use' });

    const proofDocUrl = req.file ? `/pending-proofs/${req.file.filename}` : null;
    const passwordHash = await bcrypt.hash(password, 10);
    const verificationCode = String(crypto.randomInt(100000, 999999));
    const verificationCodeHash = await bcrypt.hash(verificationCode, 10);
    const verificationExpiresAt = new Date(Date.now() + 15 * 60 * 1000);

    const existingPending = await prisma.pendingRegistration.findUnique({ where: { email } });
    if (existingPending) {
      if (existingPending.verificationExpiresAt && existingPending.verificationExpiresAt.getTime() < Date.now()) {
        await removePendingProof(existingPending.proofDocUrl);
        await prisma.pendingRegistration.delete({ where: { email } });
      } else {
        if (proofDocUrl && existingPending.proofDocUrl && existingPending.proofDocUrl !== proofDocUrl) {
          await removePendingProof(existingPending.proofDocUrl);
        }
        await prisma.pendingRegistration.update({
          where: { email },
          data: {
            fullName: name,
            passwordHash,
            roleName: String(role).toUpperCase(),
            companyName: companyName || null,
            phone: phone || null,
            proofDocUrl: proofDocUrl ?? existingPending.proofDocUrl,
            verificationCodeHash,
            verificationExpiresAt,
          },
        });
      }
    }

    if (!existingPending || (existingPending && existingPending.verificationExpiresAt && existingPending.verificationExpiresAt.getTime() < Date.now())) {
      await prisma.pendingRegistration.create({
        data: {
          fullName: name,
          email,
          passwordHash,
          roleName: String(role).toUpperCase(),
          companyName: companyName || null,
          phone: phone || null,
          proofDocUrl,
          verificationCodeHash,
          verificationExpiresAt,
        },
      });
    }

    await prisma.auditLog.create({
      data: {
        userId: null,
        action: existingPending ? 'UPDATE' : 'CREATE',
        target: 'Registration',
        details: `${existingPending ? 'Updated' : 'Created'} pending registration for ${email}`,
      },
    });

    let emailSent = true;
    let devOtp = null;
    let emailError = null;
    try {
      await sendVerificationEmail(email, verificationCode);
    } catch (err) {
      emailSent = false;
      emailError = sanitizeEmailError(err);
      devOtp = canUseOtpFallback() ? verificationCode : null;
      console.error('Verification email failed:', err.message || err);
    }

    if (!emailSent && requireEmailOtpDelivery()) {
      return res.status(503).json({
        error: 'Verification email could not be sent',
        message: 'Registration could not continue because the email verification code was not delivered. Please check the email API settings and try again.',
        emailError,
        emailDiagnostics: getEmailDiagnostics(),
      });
    }

    return res.status(emailSent ? 201 : 202).json({
      pending: true,
      requiresVerification: true,
      emailSent,
      devOtp,
      emailDiagnostics: emailSent ? undefined : getEmailDiagnostics(),
      emailError: emailSent ? undefined : emailError,
      message: emailSent
        ? 'Please verify your email to activate your account.'
        : devOtp
          ? 'Email delivery failed. Use the verification code shown below.'
          : 'Registration was saved, but email delivery failed. Ask an admin to check /api/test-email and verify the Railway Hostinger SMTP settings, then resend the code.',
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Missing credentials' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) return res.status(400).json({ error: 'Invalid email' });

    const user = await prisma.user.findUnique({
      where: { email },
      include: { role: true },
    });

    if (!user) {
      await logLoginFailure(email, 'Invalid credentials');
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (user.deletedAt) {
      await logLoginFailure(email, 'Account deactivated', user.userId);
      return res.status(403).json({ error: 'Account deactivated' });
    }
    if (!user.emailVerified) {
      await logLoginFailure(email, 'Email not verified', user.userId);
      return res.status(403).json({ error: 'Email not verified' });
    }
    if (user.status !== 'ACTIVE') {
      await logLoginFailure(email, 'Account pending approval', user.userId);
      return res.status(403).json({ error: 'Account pending approval' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      await logLoginFailure(email, 'Invalid credentials', user.userId);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const twoFactorEnabled = Boolean(user.notificationPrefs?.twoFactorEnabled);
    if (twoFactorEnabled) {
      const otp = String(crypto.randomInt(100000, 999999));
      const otpHash = await bcrypt.hash(otp, 10);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      await prisma.user.update({
        where: { userId: user.userId },
        data: { otpCodeHash: otpHash, otpExpiresAt: expiresAt },
      });
      await prisma.auditLog.create({
        data: {
          userId: user.userId,
          action: 'VERIFY',
          target: 'Auth',
          details: `Generated login OTP for ${user.email}`,
        },
      });
      let emailSent = true;
      let devOtp = null;
      let emailError = null;
      try {
        await sendOtpEmail(user.email, otp);
      } catch (err) {
        emailSent = false;
        emailError = sanitizeEmailError(err);
        if (canUseOtpFallback()) {
          devOtp = otp;
        }
        console.error('OTP email failed:', err.message || err);
      }
      if (!emailSent && !canUseOtpFallback()) {
        return res.status(503).json({
          error: 'Email service unavailable',
          message: 'OTP email could not be sent. Check /api/test-email and Railway Hostinger SMTP variables.',
          emailError,
          emailDiagnostics: getEmailDiagnostics(),
        });
      }
      return res.json({ requiresOtp: true, emailSent, devOtp });
    }

    const client = await ensureClientForUser(user);
    const token = jwt.sign(
      {
        userId: user.userId,
        email: user.email,
        role: getPrimaryRoleName(user, user.role?.roleName),
        roles: collectRoleNames(user, user.role?.roleName),
      },
      process.env.JWT_SECRET || 'dev_secret',
      { expiresIn: '7d' }
    );

    await prisma.auditLog.create({
      data: {
        userId: user.userId,
        action: 'LOGIN',
        target: 'Auth',
        details: `User ${user.email} logged in`,
      },
    });

    return res.json({
      token,
      user: buildUserResponse(user, user.role?.roleName?.toLowerCase(), client),
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/resend-otp', async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Missing email' });
    const user = await prisma.user.findUnique({
      where: { email },
      include: { role: true, userRoles: { include: { role: true } } },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.deletedAt) return res.status(403).json({ error: 'Account deactivated' });
    const twoFactorEnabled = Boolean(user.notificationPrefs?.twoFactorEnabled);
    if (!twoFactorEnabled) {
      return res.status(400).json({ error: 'OTP not enabled for this account' });
    }

    const otp = String(crypto.randomInt(100000, 999999));
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await prisma.user.update({
      where: { userId: user.userId },
      data: { otpCodeHash: otpHash, otpExpiresAt: expiresAt },
    });
    await prisma.auditLog.create({
      data: {
        userId: user.userId,
        action: 'VERIFY',
        target: 'Auth',
        details: `Resent login OTP for ${user.email}`,
      },
    });

    let emailSent = true;
    let devOtp = null;
    let emailError = null;
    try {
      await sendOtpEmail(email, otp);
    } catch (err) {
      emailSent = false;
      emailError = sanitizeEmailError(err);
      if (canUseOtpFallback()) {
        devOtp = otp;
      }
      console.error('OTP email failed:', err.message || err);
    }
    if (!emailSent && !canUseOtpFallback()) {
      return res.status(503).json({
        error: 'Email service unavailable',
        message: 'OTP email could not be sent. Check /api/test-email and Railway Hostinger SMTP variables.',
        emailError,
        emailDiagnostics: getEmailDiagnostics(),
      });
    }
    return res.json({ ok: true, emailSent, devOtp });
  } catch (err) {
    return next(err);
  }
});

router.post('/verify-email', async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ error: 'Missing verification code' });
    const user = await prisma.user.findUnique({
      where: { email },
      include: { role: true, userRoles: { include: { role: true } } },
    });
    if (user) {
      if (user.emailVerified) return res.json({ ok: true });
      if (!user.verificationCodeHash || !user.verificationExpiresAt) {
        return res.status(400).json({ error: 'Verification not requested' });
      }
      if (user.verificationExpiresAt.getTime() < Date.now()) {
        await prisma.user.update({
          where: { userId: user.userId },
          data: { verificationCodeHash: null, verificationExpiresAt: null },
        });
        return res.status(400).json({ error: 'Verification code expired' });
      }
      const valid = await bcrypt.compare(String(otp), user.verificationCodeHash);
      if (!valid) return res.status(401).json({ error: 'Invalid verification code' });
      await prisma.user.update({
        where: { userId: user.userId },
        data: { emailVerified: true, verificationCodeHash: null, verificationExpiresAt: null },
      });
      await prisma.auditLog.create({
        data: {
          userId: user.userId,
          action: 'VERIFY',
          target: 'Auth',
          details: `Verified email for ${user.email}`,
        },
      });
      return res.json({ ok: true });
    }

    const pending = await prisma.pendingRegistration.findUnique({ where: { email } });
    if (!pending) return res.status(404).json({ error: 'Registration not found' });
    if (!pending.verificationCodeHash || !pending.verificationExpiresAt) {
      return res.status(400).json({ error: 'Verification not requested' });
    }
    if (pending.verificationExpiresAt.getTime() < Date.now()) {
      await prisma.pendingRegistration.update({
        where: { email },
        data: { verificationCodeHash: null, verificationExpiresAt: null },
      });
      return res.status(400).json({ error: 'Verification code expired' });
    }
    const valid = await bcrypt.compare(String(otp), pending.verificationCodeHash);
    if (!valid) return res.status(401).json({ error: 'Invalid verification code' });

    const roleRecord = await prisma.role.upsert({
      where: { roleName: pending.roleName },
      update: {},
      create: { roleName: pending.roleName },
    });

    const finalProofDocUrl = await promotePendingProof(pending.proofDocUrl);

    const createdUser = await prisma.user.create({
      data: {
        fullName: pending.fullName,
        email: pending.email,
        passwordHash: pending.passwordHash,
        roleId: roleRecord.roleId,
        status: pending.roleName === 'CLIENT' ? 'INACTIVE' : 'ACTIVE',
        phone: pending.phone || null,
        emailVerified: true,
        proofDocUrl: finalProofDocUrl,
        notificationPrefs: { twoFactorEnabled: true },
      },
    });

    if (pending.roleName === 'CLIENT' && pending.companyName) {
      const existingClient = await prisma.client.findFirst({ where: { clientName: pending.companyName } });
      if (!existingClient) {
        await prisma.client.create({
          data: { clientName: pending.companyName, email: pending.email },
        });
      }
    }

    await prisma.auditLog.create({
      data: {
        userId: createdUser.userId,
        action: 'CREATE',
        target: 'User',
        details: `User ${createdUser.email} verified and created`,
      },
    });

    await prisma.pendingRegistration.delete({ where: { email } });
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

router.post('/resend-verification', async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Missing email' });
    const user = await prisma.user.findUnique({
      where: { email },
      include: { role: true, userRoles: { include: { role: true } } },
    });
    if (user) {
      if (user.emailVerified) return res.json({ ok: true });
      const verificationCode = String(crypto.randomInt(100000, 999999));
      const verificationCodeHash = await bcrypt.hash(verificationCode, 10);
      const verificationExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
      await prisma.user.update({
        where: { userId: user.userId },
        data: { verificationCodeHash, verificationExpiresAt },
      });
      await prisma.auditLog.create({
        data: {
          userId: user.userId,
          action: 'VERIFY',
          target: 'Auth',
          details: `Regenerated email verification code for ${user.email}`,
        },
      });
      let emailSent = true;
      let devOtp = null;
      let emailError = null;
      try {
        await sendVerificationEmail(email, verificationCode);
      } catch (err) {
        emailSent = false;
        emailError = sanitizeEmailError(err);
        devOtp = canUseOtpFallback() ? verificationCode : null;
        console.error('Verification email failed:', err.message || err);
      }
      if (!emailSent && requireEmailOtpDelivery()) {
        return res.status(503).json({
          error: 'Verification email could not be sent',
          message: 'The verification code could not be delivered. Please check the email API settings and try again.',
          emailError,
          emailDiagnostics: getEmailDiagnostics(),
        });
      }
      return res.json({
        ok: true,
        emailSent,
        devOtp,
        emailDiagnostics: emailSent ? undefined : getEmailDiagnostics(),
        emailError: emailSent ? undefined : emailError,
        message: emailSent
          ? 'Please check your email for the verification code.'
          : devOtp
            ? 'Email delivery failed. Use the verification code shown below.'
            : 'Verification code was regenerated, but email delivery failed. Ask an admin to check /api/test-email/diagnostics.',
      });
    }

    const pending = await prisma.pendingRegistration.findUnique({ where: { email } });
    if (!pending) return res.status(404).json({ error: 'Registration not found' });
    const verificationCode = String(crypto.randomInt(100000, 999999));
    const verificationCodeHash = await bcrypt.hash(verificationCode, 10);
    const verificationExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await prisma.pendingRegistration.update({
      where: { email },
      data: { verificationCodeHash, verificationExpiresAt },
    });
    await prisma.auditLog.create({
      data: {
        userId: null,
        action: 'VERIFY',
        target: 'Registration',
        details: `Regenerated pending registration verification code for ${email}`,
      },
    });
    let emailSent = true;
    let devOtp = null;
    let emailError = null;
    try {
      await sendVerificationEmail(email, verificationCode);
    } catch (err) {
      emailSent = false;
      emailError = sanitizeEmailError(err);
      devOtp = canUseOtpFallback() ? verificationCode : null;
      console.error('Verification email failed:', err.message || err);
    }
    if (!emailSent && requireEmailOtpDelivery()) {
      return res.status(503).json({
        error: 'Verification email could not be sent',
        message: 'The verification code could not be delivered. Please check the email API settings and try again.',
        emailError,
        emailDiagnostics: getEmailDiagnostics(),
      });
    }
    return res.json({
      ok: true,
      emailSent,
      devOtp,
      emailDiagnostics: emailSent ? undefined : getEmailDiagnostics(),
      emailError: emailSent ? undefined : emailError,
      message: emailSent
        ? 'Please check your email for the verification code.'
        : devOtp
          ? 'Email delivery failed. Use the verification code shown below.'
          : 'Verification code was regenerated, but email delivery failed. Ask an admin to check /api/test-email/diagnostics.',
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/request-password-reset', async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Missing email' });
    const user = await prisma.user.findUnique({
      where: { email },
      include: { role: true, userRoles: { include: { role: true } } },
    });
    if (!user) return res.json({ ok: true });
    const resetCode = String(crypto.randomInt(100000, 999999));
    const resetCodeHash = await bcrypt.hash(resetCode, 10);
    const resetExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await prisma.user.update({
      where: { userId: user.userId },
      data: { resetCodeHash, resetExpiresAt },
    });
    await prisma.auditLog.create({
      data: {
        userId: user.userId,
        action: 'VERIFY',
        target: 'Auth',
        details: `Requested password reset for ${user.email}`,
      },
    });
    let emailSent = true;
    let devOtp = null;
    let emailError = null;
    try {
      await sendPasswordResetEmail(email, resetCode);
    } catch (err) {
      emailSent = false;
      emailError = sanitizeEmailError(err);
      if (canUseOtpFallback()) {
        devOtp = resetCode;
      }
      console.error('Reset email failed:', err.message || err);
    }
    if (!emailSent && requireEmailOtpDelivery()) {
      return res.status(503).json({
        error: 'Password reset email could not be sent',
        message: 'The password reset code could not be delivered. Please check the email API settings and try again.',
        emailError,
        emailDiagnostics: getEmailDiagnostics(),
      });
    }
    return res.json({
      ok: true,
      emailSent,
      devOtp,
      emailDiagnostics: emailSent ? undefined : getEmailDiagnostics(),
      emailError: emailSent ? undefined : emailError,
      message: emailSent
        ? 'Please check your email for the reset code.'
        : devOtp
          ? 'Email delivery failed. Use the reset code shown below.'
          : 'Reset code was generated, but email delivery failed. Please try again in a moment.',
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/reset-password', async (req, res, next) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ error: 'Missing reset information' });
    }
    if (String(newPassword).length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const user = await prisma.user.findUnique({
      where: { email },
      include: { role: true, userRoles: { include: { role: true } } },
    });
    if (!user || !user.resetCodeHash || !user.resetExpiresAt) {
      return res.status(400).json({ error: 'Reset not requested' });
    }
    if (user.resetExpiresAt.getTime() < Date.now()) {
      await prisma.user.update({
        where: { userId: user.userId },
        data: { resetCodeHash: null, resetExpiresAt: null },
      });
      return res.status(400).json({ error: 'Reset code expired' });
    }
    const valid = await bcrypt.compare(String(otp), user.resetCodeHash);
    if (!valid) return res.status(401).json({ error: 'Invalid reset code' });
    const matchesCurrentPassword = await bcrypt.compare(String(newPassword), user.passwordHash);
    if (matchesCurrentPassword) {
      return res.status(400).json({ error: 'New password must be different from your current password' });
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { userId: user.userId },
      data: { passwordHash, resetCodeHash: null, resetExpiresAt: null },
    });
    await prisma.auditLog.create({
      data: {
        userId: user.userId,
        action: 'UPDATE',
        target: 'Auth',
        details: `Reset password for ${user.email}`,
      },
    });
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

router.post('/verify-otp', async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ error: 'Missing OTP' });

    const user = await prisma.user.findUnique({
      where: { email },
      include: { role: true },
    });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    if (user.status !== 'ACTIVE') {
      return res.status(403).json({ error: 'Account pending approval' });
    }
    if (!user.otpCodeHash || !user.otpExpiresAt) {
      return res.status(400).json({ error: 'OTP not requested' });
    }
    if (user.otpExpiresAt.getTime() < Date.now()) {
      await prisma.user.update({
        where: { userId: user.userId },
        data: { otpCodeHash: null, otpExpiresAt: null },
      });
      return res.status(400).json({ error: 'OTP expired' });
    }
    const valid = await bcrypt.compare(String(otp), user.otpCodeHash);
    if (!valid) return res.status(401).json({ error: 'Invalid OTP' });

    await prisma.user.update({
      where: { userId: user.userId },
      data: { otpCodeHash: null, otpExpiresAt: null },
    });
    await prisma.auditLog.create({
      data: {
        userId: user.userId,
        action: 'LOGIN',
        target: 'Auth',
        details: `User ${user.email} logged in with OTP`,
      },
    });

    const client = await ensureClientForUser(user);
    const token = jwt.sign(
      {
        userId: user.userId,
        email: user.email,
        role: getPrimaryRoleName(user, user.role?.roleName),
        roles: collectRoleNames(user, user.role?.roleName),
      },
      process.env.JWT_SECRET || 'dev_secret',
      { expiresIn: '7d' }
    );

    return res.json({
      token,
      user: buildUserResponse(user, user.role?.roleName?.toLowerCase(), client),
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { userId: req.user.userId, deletedAt: null },
      include: { role: true, userRoles: { include: { role: true } } },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const client = await ensureClientForUser(user);

    return res.json(
      buildUserResponse(user, user.role?.roleName?.toLowerCase(), client)
    );
  } catch (err) {
    return next(err);
  }
});

router.get('/email-diagnostics', requireAuth, async (req, res) => {
  return res.json({
    ok: true,
    diagnostics: getEmailDiagnostics(),
  });
});

module.exports = router;
