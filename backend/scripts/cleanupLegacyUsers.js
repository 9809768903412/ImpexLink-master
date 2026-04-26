const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const KEEP_EMAILS = new Set([
  'emman.uy@impex.com',
  'lita.deleon@impex.com',
  'josephine.padilla@impex.com',
  'princess.espino@impex.com',
  'paula.caraig@impex.com',
  'abdul.usop@impex.com',
  'jason.mendizabal@impex.com',
  'myra.flores@impex.com',
  'letty.cervantes@impex.com',
  'connie.celestial@impex.com',
  'charlene.biza@impex.com',
  'enar.valencia@impex.com',
  'kat.cacabilos@impex.com',
  'danilo.benosa@impex.com',
  'robel.tabora@impex.com',
  'carlos.martinez@impex.com',
  'procurement@ateneoctc.com',
  'procurement@robinsonsland.com',
  'procurement@ayalaland.com',
]);

async function main() {
  const users = await prisma.user.findMany({
    orderBy: { userId: 'asc' },
    select: { userId: true, fullName: true, email: true },
  });

  const usersToRemove = users.filter((user) => !KEEP_EMAILS.has(user.email));
  const removeIds = usersToRemove.map((user) => user.userId);

  if (removeIds.length === 0) {
    console.log('No legacy users found.');
    return;
  }

  console.log('Removing legacy users:');
  usersToRemove.forEach((user) => {
    console.log(`- ${user.userId}: ${user.fullName} <${user.email}>`);
  });

  await prisma.$transaction([
    prisma.notification.deleteMany({ where: { userId: { in: removeIds } } }),
    prisma.productWatch.deleteMany({ where: { userId: { in: removeIds } } }),
    prisma.userRole.deleteMany({ where: { userId: { in: removeIds } } }),

    prisma.auditLog.updateMany({ where: { userId: { in: removeIds } }, data: { userId: null } }),
    prisma.stockTransaction.updateMany({ where: { userId: { in: removeIds } }, data: { userId: null } }),
    prisma.materialRequest.updateMany({ where: { requestedBy: { in: removeIds } }, data: { requestedBy: null } }),
    prisma.materialRequest.updateMany({ where: { approvedBy: { in: removeIds } }, data: { approvedBy: null } }),
    prisma.clientOrder.updateMany({ where: { createdBy: { in: removeIds } }, data: { createdBy: null } }),
    prisma.project.updateMany({ where: { assignedPmId: { in: removeIds } }, data: { assignedPmId: null } }),
    prisma.delivery.updateMany({ where: { assignedDriverId: { in: removeIds } }, data: { assignedDriverId: null } }),
    prisma.supplierOrder.updateMany({ where: { approvedById: { in: removeIds } }, data: { approvedById: null } }),

    prisma.user.deleteMany({ where: { userId: { in: removeIds } } }),
  ]);

  const remaining = await prisma.user.findMany({
    orderBy: { userId: 'asc' },
    select: { userId: true, fullName: true, email: true },
  });

  console.log(`Cleanup complete. Remaining users: ${remaining.length}`);
  remaining.forEach((user) => {
    console.log(`- ${user.userId}: ${user.fullName} <${user.email}>`);
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
