const fs = require('fs/promises');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const backendRoot = path.join(__dirname, '..');
const liveDir = path.join(backendRoot, 'uploads', 'proofs');
const pendingDir = path.join(backendRoot, 'storage', 'pending-proofs');

function basenameSet(values) {
  return new Set(
    values
      .filter(Boolean)
      .map((value) => path.basename(String(value)))
  );
}

async function listFiles(dir) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function removeFiles(dir, names) {
  for (const name of names) {
    await fs.unlink(path.join(dir, name)).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}

async function main() {
  const [users, pending] = await Promise.all([
    prisma.user.findMany({ select: { proofDocUrl: true } }),
    prisma.pendingRegistration.findMany({ select: { proofDocUrl: true } }),
  ]);

  const referencedLive = basenameSet(
    users.map((user) => user.proofDocUrl).filter((value) => String(value).startsWith('/uploads/proofs/'))
  );
  const referencedPending = basenameSet(
    pending.map((entry) => entry.proofDocUrl).filter((value) => String(value).startsWith('/pending-proofs/'))
  );

  const [liveFiles, pendingFiles] = await Promise.all([listFiles(liveDir), listFiles(pendingDir)]);

  const orphanLive = liveFiles.filter((name) => !referencedLive.has(name));
  const orphanPending = pendingFiles.filter((name) => !referencedPending.has(name));

  if (orphanLive.length === 0 && orphanPending.length === 0) {
    console.log('No orphan proof files found.');
    return;
  }

  if (orphanLive.length > 0) {
    console.log('Removing orphan live proof files:');
    orphanLive.forEach((name) => console.log(`- uploads/proofs/${name}`));
    await removeFiles(liveDir, orphanLive);
  }

  if (orphanPending.length > 0) {
    console.log('Removing orphan pending proof files:');
    orphanPending.forEach((name) => console.log(`- storage/pending-proofs/${name}`));
    await removeFiles(pendingDir, orphanPending);
  }

  console.log(`Cleanup complete. Removed ${orphanLive.length} live file(s) and ${orphanPending.length} pending file(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
