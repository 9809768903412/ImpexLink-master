const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const KEEP_CLIENT_NAMES = ['Ateneo CTC', 'Robinsons Land', 'Ayala Land'];

async function main() {
  const staleClients = await prisma.client.findMany({
    where: {
      deletedAt: null,
      clientName: { notIn: KEEP_CLIENT_NAMES },
    },
    orderBy: { clientId: 'asc' },
  });

  if (staleClients.length === 0) {
    console.log('No stale client data to clean.');
    return;
  }

  const staleClientIds = staleClients.map((client) => client.clientId);

  await prisma.$transaction(async (tx) => {
    await tx.delivery.updateMany({
      where: {
        deletedAt: null,
        clientOrder: { clientId: { in: staleClientIds } },
      },
      data: { deletedAt: new Date() },
    });

    await tx.clientOrder.updateMany({
      where: { clientId: { in: staleClientIds }, deletedAt: null },
      data: {
        deletedAt: new Date(),
        projectId: null,
      },
    });

    await tx.quoteRequest.updateMany({
      where: { clientId: { in: staleClientIds }, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    await tx.project.updateMany({
      where: { clientId: { in: staleClientIds }, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    await tx.client.updateMany({
      where: { clientId: { in: staleClientIds }, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  });

  console.log('Cleaned stale client data:');
  staleClients.forEach((client) => {
    console.log(`- ${client.clientName} (#${client.clientId})`);
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
