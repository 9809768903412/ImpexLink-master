const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { sendEmail, getEmailDiagnostics, sanitizeEmailError } = require('../utils/mailer');

const router = express.Router();

router.get('/', requireAuth, requireRole(['ADMIN', 'PRESIDENT']), async (req, res, next) => {
  try {
    const to = String(req.query.to || req.user?.email || '').trim();
    if (!to) {
      return res.status(400).json({ error: 'Missing target email address' });
    }

    const diagnostics = getEmailDiagnostics();
    const sent = await sendEmail({
      to,
      subject: 'Impex Engineering test email',
      text: 'This is a live test email from the Railway-hosted Impex Engineering backend.',
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.5;">
          <h2>Impex Engineering test email</h2>
          <p>This is a live test email from the Railway-hosted Impex Engineering backend.</p>
          <p><strong>Environment:</strong> ${diagnostics.nodeEnv}</p>
          <p><strong>From:</strong> ${diagnostics.from}</p>
          <p style="color:#666;font-size:12px;">Triggered from /api/test-email for delivery debugging.</p>
        </div>
      `,
    });

    return res.json({
      ok: true,
      sent,
      diagnostics,
    });
  } catch (error) {
    return res.status(503).json({
      ok: false,
      error: error.message || 'Email test failed',
      details: sanitizeEmailError(error),
      diagnostics: getEmailDiagnostics(),
    });
  }
});

module.exports = router;
