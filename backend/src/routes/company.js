const express = require('express');
const prisma = require('../utils/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');
const { isEmail, isNonEmptyString } = require('../utils/validate');

const router = express.Router();
router.use(requireAuth);

const defaultCompanyInfo = {
  name: process.env.COMPANY_NAME || 'Impex Engineering and Industrial Supply',
  address: process.env.COMPANY_ADDRESS || '6959 Washington St., Pio Del Pilar, Makati City',
  tin: process.env.COMPANY_TIN || '100-191-563-00000',
  phone: process.env.COMPANY_PHONE || '+63 2 8123 4567',
  email: process.env.COMPANY_EMAIL || 'sales@impex.ph',
  website: process.env.COMPANY_WEBSITE || 'www.impex.ph',
};

router.get('/', async (_req, res, next) => {
  try {
    let company = await prisma.companySetting.findFirst();
    if (!company) {
      company = await prisma.companySetting.create({ data: defaultCompanyInfo });
    }
    res.json(company);
  } catch (err) {
    next(err);
  }
});

router.put('/', requireRole(['ADMIN']), async (req, res, next) => {
  try {
    if (!isNonEmptyString(req.body.name)) return res.status(400).json({ error: 'Company name is required' });
    if (!isNonEmptyString(req.body.address)) return res.status(400).json({ error: 'Company address is required' });
    if (req.body.email && !isEmail(req.body.email)) {
      return res.status(400).json({ error: 'Invalid email' });
    }
    const existing = await prisma.companySetting.findFirst();
    if (existing) {
      const updated = await prisma.companySetting.update({
        where: { companyId: existing.companyId },
        data: req.body,
      });
      await prisma.auditLog.create({
        data: {
          userId: req.user.userId,
          action: 'UPDATE',
          target: 'Company',
          details: 'Updated company settings',
        },
      });
      return res.json(updated);
    }
    const created = await prisma.companySetting.create({ data: { ...defaultCompanyInfo, ...req.body } });
    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: 'CREATE',
        target: 'Company',
        details: 'Created company settings',
      },
    });
    return res.json(created);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
