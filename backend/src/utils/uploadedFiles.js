const fs = require('fs/promises');
const path = require('path');
const prisma = require('./prisma');

function normalizeUploadPath(fileUrl) {
  const normalized = `/${String(fileUrl || '').replace(/^\/+/, '').replace(/\\/g, '/')}`;
  if (!normalized.startsWith('/uploads/') && !normalized.startsWith('/pending-proofs/')) return null;
  return normalized;
}

function fileKeyFromPath(fileUrl) {
  const normalized = normalizeUploadPath(fileUrl);
  if (!normalized) return null;
  return normalized.replace(/^\/+/, '');
}

async function mirrorUploadedFile({ file, fileUrl }) {
  const storageKey = fileKeyFromPath(fileUrl);
  if (!storageKey || !file?.path) return null;
  const data = await fs.readFile(file.path);
  const originalName = path.basename(file.originalname || file.filename || storageKey).slice(0, 255);
  const mimeType = String(file.mimetype || 'application/octet-stream').slice(0, 120);
  await prisma.$executeRaw`
    INSERT INTO uploaded_files (storage_key, original_name, mime_type, size_bytes, data)
    VALUES (${storageKey}, ${originalName}, ${mimeType}, ${data.length}, ${data})
    ON CONFLICT (storage_key)
    DO UPDATE SET
      original_name = EXCLUDED.original_name,
      mime_type = EXCLUDED.mime_type,
      size_bytes = EXCLUDED.size_bytes,
      data = EXCLUDED.data
  `;
  return storageKey;
}

async function findUploadedFileByPath(fileUrl) {
  const storageKey = fileKeyFromPath(fileUrl);
  if (!storageKey) return null;
  const filename = path.basename(storageKey);
  const rows = await prisma.$queryRaw`
    SELECT storage_key AS "storageKey",
           original_name AS "originalName",
           mime_type AS "mimeType",
           size_bytes AS "sizeBytes",
           data
    FROM uploaded_files
    WHERE storage_key = ${storageKey}
       OR storage_key LIKE ${`%/${filename}`}
    ORDER BY CASE WHEN storage_key = ${storageKey} THEN 0 ELSE 1 END, created_at DESC
    LIMIT 1
  `;
  return rows?.[0] || null;
}

module.exports = {
  mirrorUploadedFile,
  findUploadedFileByPath,
  fileKeyFromPath,
};
