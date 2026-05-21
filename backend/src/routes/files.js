const express = require('express');
const path = require('path');
const fs = require('fs');

const router = express.Router();

const allowedRoots = [
  {
    prefix: '/uploads/',
    dir: path.join(__dirname, '..', '..', 'uploads'),
  },
  {
    prefix: '/pending-proofs/',
    dir: path.join(__dirname, '..', '..', 'storage', 'pending-proofs'),
  },
];

function resolveAllowedFile(filePath) {
  const normalizedPath = `/${String(filePath || '').replace(/^\/+/, '').replace(/\\/g, '/')}`;
  const root = allowedRoots.find((entry) => normalizedPath.startsWith(entry.prefix));
  if (!root) return null;

  const relativePath = normalizedPath.slice(root.prefix.length);
  const absolutePath = path.resolve(root.dir, relativePath);
  const allowedDir = path.resolve(root.dir);
  if (!absolutePath.startsWith(`${allowedDir}${path.sep}`) && absolutePath !== allowedDir) return null;
  return absolutePath;
}

router.get('/', (req, res) => {
  const absolutePath = resolveAllowedFile(req.query.path);
  if (!absolutePath) {
    return res.status(400).json({ error: 'Invalid file path' });
  }
  if (!fs.existsSync(absolutePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  res.setHeader('Content-Disposition', `inline; filename="${path.basename(absolutePath).replace(/"/g, '')}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=300');
  return res.sendFile(absolutePath);
});

module.exports = router;
