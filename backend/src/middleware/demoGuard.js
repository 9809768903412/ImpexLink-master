const jwt = require('jsonwebtoken');

const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function getDemoEmailSet() {
  return new Set(
    String(process.env.DEMO_USER_EMAILS || '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

function blockDemoWrites(req, res, next) {
  if (READ_ONLY_METHODS.has(req.method.toUpperCase())) return next();

  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next();

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret');
    const email = String(payload?.email || '').toLowerCase();
    if (email && getDemoEmailSet().has(email)) {
      return res.status(403).json({
        error: 'Demo account is read-only. Changes are disabled in demo mode.',
        code: 'DEMO_READ_ONLY',
      });
    }
    return next();
  } catch (_err) {
    return next();
  }
}

module.exports = { blockDemoWrites };
