const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function inferBaseName(name) {
  return String(name || '')
    .replace(/\b(procurement|purchasing|buyer|account)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  const clients = await prisma.client.findMany({ where: { deletedAt: null }, orderBy: { clientId: 'asc' } });
  for (const duplicate of clients) {
    if (!/procurement|purchasing|buyer|account/i.test(String(duplicate.clientName))) continue;
    const baseName = inferBaseName(duplicate.clientName);
    if (!baseName || baseName === duplicate.clientName) continue;

    const canonical = await prisma.client.findFirst({
      where: {
        deletedAt: null,
        clientName: { equals: baseName, mode: 'insensitive' },
        clientId: { not: duplicate.clientId },
      },
      orderBy: { clientId: 'asc' },
    });

    if (!canonical) continue;

    await prisma.$transaction(async (tx) => {
      await tx.project.updateMany({ where: { clientId: duplicate.clientId }, data: { clientId: canonical.clientId } });
      await tx.clientOrder.updateMany({ where: { clientId: duplicate.clientId }, data: { clientId: canonical.clientId } });
      await tx.quoteRequest.updateMany({ where: { clientId: duplicate.clientId }, data: { clientId: canonical.clientId } });
      await tx.client.update({ where: { clientId: duplicate.clientId }, data: { deletedAt: new Date() } });
    });

    console.log(`Relinked ${duplicate.clientName} (#${duplicate.clientId}) -> ${canonical.clientName} (#${canonical.clientId})`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
