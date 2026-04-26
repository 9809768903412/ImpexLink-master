const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret');
    // Normalize legacy tokens or alternate payload shapes
    if (payload && typeof payload === 'object') {
      if (!payload.userId && payload.id) {
        payload.userId = payload.id;
      }
      if (!payload.role && payload.roleName) {
        payload.role = payload.roleName;
      }
      if (!Array.isArray(payload.roles) && payload.role) {
        payload.roles = [payload.role];
      }
    }
    req.user = payload;
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function requireRole(roles = []) {
  const allowed = roles.map((r) => String(r).toUpperCase());
  return (req, res, next) => {
    const roleList = getRoleList(req.user);
    const hasRole = roleList.some((role) => allowed.includes(role));
    if (!hasRole) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    return next();
  };
}

function getRoleList(user) {
  if (Array.isArray(user?.roles) && user.roles.length > 0) {
    return user.roles.map((r) => String(r).toUpperCase());
  }
  return user?.role ? [String(user.role).toUpperCase()] : [];
}

function hasRole(user, roles = []) {
  const allowed = roles.map((role) => String(role).toUpperCase());
  return getRoleList(user).some((role) => allowed.includes(role));
}

module.exports = { requireAuth, requireRole, getRoleList, hasRole };
