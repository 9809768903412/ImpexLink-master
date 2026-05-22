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

const legacyDirectoryAliases = new Map([
  ['pod', 'deliveries'],
  ['delivery', 'deliveries'],
  ['delivery-proofs', 'deliveries'],
  ['payment', 'payments'],
]);

function resolveAllowedFile(filePath) {
  const normalizedPath = `/${String(filePath || '').replace(/^\/+/, '').replace(/\\/g, '/')}`;
  const root = allowedRoots.find((entry) => normalizedPath.startsWith(entry.prefix));
  if (!root) return null;

  const relativePath = normalizedPath.slice(root.prefix.length);
  const allowedDir = path.resolve(root.dir);
  const candidates = [relativePath];
  const [directory, ...rest] = relativePath.split('/');
  const alias = legacyDirectoryAliases.get(String(directory || '').toLowerCase());
  if (alias && rest.length > 0) {
    candidates.push([alias, ...rest].join('/'));
  }

  for (const candidate of candidates) {
    const absolutePath = path.resolve(root.dir, candidate);
    if (!absolutePath.startsWith(`${allowedDir}${path.sep}`) && absolutePath !== allowedDir) continue;
    if (fs.existsSync(absolutePath)) return absolutePath;
  }

  const fallbackName = path.basename(relativePath);
  if (fallbackName && fallbackName !== '.' && fallbackName !== '..') {
    const stack = [allowedDir];
    while (stack.length > 0) {
      const current = stack.pop();
      let entries = [];
      try {
        entries = fs.readdirSync(current, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        const nextPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(nextPath);
        } else if (entry.name === fallbackName) {
          return nextPath;
        }
      }
    }
  }

  return path.resolve(root.dir, relativePath);
}

router.get('/', (req, res) => {
  if (!req.query.path) {
    return res.status(400).json({ error: 'Missing file path' });
  }
  const absolutePath = resolveAllowedFile(req.query.path);
  if (!absolutePath) {
    return res.status(400).json({ error: 'Invalid file path' });
  }
  if (!fs.existsSync(absolutePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  res.setHeader('Content-Disposition', `inline; filename="${path.basename(absolutePath).replace(/"/g, '')}"`);
  if (absolutePath.toLowerCase().endsWith('.heic') || absolutePath.toLowerCase().endsWith('.heif')) {
    res.type('image/heic');
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=300');
  return res.sendFile(absolutePath);
});

module.exports = router;
