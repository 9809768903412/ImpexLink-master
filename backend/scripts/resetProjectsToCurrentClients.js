const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs/promises');
const path = require('path');

const formsFile = path.join(__dirname, '..', 'database', 'project-forms.json');

async function requireRole(roleName) {
  const role = await prisma.role.findUnique({ where: { roleName } });
  if (!role) throw new Error(`Missing role ${roleName}`);
  return role;
}

async function ensureUserHasRole(userId, roleName) {
  const role = await requireRole(roleName);
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId, roleId: role.roleId } },
    update: {},
    create: { userId, roleId: role.roleId },
  });
}

async function main() {
  const targetClientNames = ['Ateneo CTC', 'Robinsons Land', 'Ayala Land'];
  const clients = await prisma.client.findMany({
    where: {
      deletedAt: null,
      clientName: { in: targetClientNames },
    },
    orderBy: { clientId: 'asc' },
  });

  const clientMap = Object.fromEntries(clients.map((client) => [client.clientName, client]));
  if (!clientMap['Ateneo CTC'] || !clientMap['Robinsons Land'] || !clientMap['Ayala Land']) {
    throw new Error('Current client companies are missing. Seed client accounts first.');
  }

  const users = await prisma.user.findMany({
    where: {
      email: {
        in: [
          'princess.espino@impex.com',
          'paula.caraig@impex.com',
          'abdul.usop@impex.com',
          'jason.mendizabal@impex.com',
        ],
      },
    },
  });
  const userMap = Object.fromEntries(users.map((user) => [user.email, user]));

  await ensureUserHasRole(userMap['jason.mendizabal@impex.com'].userId, 'PROJECT_MANAGER');

  await prisma.$transaction(async (tx) => {
    await tx.notification.deleteMany({ where: { type: 'PROJECT_UPDATE' } });
    await tx.materialRequestItem.deleteMany({ where: { request: { projectId: { not: null } } } });
    await tx.materialRequest.deleteMany({ where: { projectId: { not: null } } });
    await tx.quoteRequestItem.deleteMany({ where: { quoteRequest: { projectId: { not: null } } } });
    await tx.quoteRequest.deleteMany({ where: { projectId: { not: null } } });
    await tx.supplierOrder.updateMany({ where: { projectId: { not: null } }, data: { projectId: null } });
    await tx.clientOrder.updateMany({ where: { projectId: { not: null } }, data: { projectId: null } });
    await tx.project.updateMany({ where: { deletedAt: null }, data: { deletedAt: new Date() } });
  });

  await fs.writeFile(formsFile, '[]\n');

  const freshProjects = [
    {
      projectName: 'Ateneo CTC Building Renovation',
      clientId: clientMap['Ateneo CTC'].clientId,
      assignedPmId: userMap['princess.espino@impex.com'].userId,
      location: 'Quezon City',
      status: 'ACTIVE',
      startDate: new Date('2026-01-15'),
    },
    {
      projectName: 'Ateneo UD Sports Complex',
      clientId: clientMap['Ateneo CTC'].clientId,
      assignedPmId: userMap['princess.espino@impex.com'].userId,
      location: 'Quezon City',
      status: 'ON_HOLD',
      startDate: new Date('2026-02-05'),
    },
    {
      projectName: 'Robinsons Galleria Expansion',
      clientId: clientMap['Robinsons Land'].clientId,
      assignedPmId: userMap['abdul.usop@impex.com'].userId,
      location: 'Pasig City',
      status: 'ACTIVE',
      startDate: new Date('2026-01-20'),
    },
    {
      projectName: 'Ayala Mall Fit-out',
      clientId: clientMap['Ayala Land'].clientId,
      assignedPmId: userMap['jason.mendizabal@impex.com'].userId,
      location: 'Makati City',
      status: 'ACTIVE',
      startDate: new Date('2026-01-28'),
    },
  ];

  const createdProjects = [];
  for (const project of freshProjects) {
    const created = await prisma.project.create({
      data: {
        ...project,
        totalValue: 0,
      },
    });
    createdProjects.push(created);
  }

  const projectByClient = new Map([
    [clientMap['Ateneo CTC'].clientId, createdProjects.find((project) => project.projectName === 'Ateneo CTC Building Renovation')],
    [clientMap['Robinsons Land'].clientId, createdProjects.find((project) => project.projectName === 'Robinsons Galleria Expansion')],
    [clientMap['Ayala Land'].clientId, createdProjects.find((project) => project.projectName === 'Ayala Mall Fit-out')],
  ]);

  const orders = await prisma.clientOrder.findMany({ where: { deletedAt: null } });
  for (const order of orders) {
    const targetProject = projectByClient.get(order.clientId);
    if (!targetProject) continue;
    await prisma.clientOrder.update({
      where: { clientOrderId: order.clientOrderId },
      data: { projectId: targetProject.projectId },
    });
  }

  for (const project of createdProjects) {
    const ordersForProject = await prisma.clientOrder.findMany({
      where: { projectId: project.projectId, deletedAt: null },
      select: { total: true },
    });
    const totalValue = ordersForProject.reduce((sum, order) => sum + Number(order.total || 0), 0);
    await prisma.project.update({
      where: { projectId: project.projectId },
      data: { totalValue },
    });
  }

  console.log('Projects reset complete:');
  for (const project of createdProjects) {
    console.log(`- ${project.projectName} (clientId ${project.clientId})`);
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
