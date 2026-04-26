const bcrypt = require('bcryptjs');
const prisma = require('../src/utils/prisma');

async function ensureRole(roleName) {
  return prisma.role.upsert({
    where: { roleName },
    update: {},
    create: { roleName },
  });
}

async function ensureCategory(categoryName) {
  return prisma.productCategory.upsert({
    where: { categoryName },
    update: {},
    create: { categoryName },
  });
}

async function ensureSupplier(supplierName) {
  const existing = await prisma.supplier.findFirst({ where: { supplierName } });
  if (existing) return existing;
  return prisma.supplier.create({
    data: {
      supplierName,
      country: 'Philippines',
    },
  });
}

async function ensureClient({ clientName, email, address, contactPerson, phone, tin }) {
  const existing = await prisma.client.findFirst({
    where: {
      clientName,
      deletedAt: null,
    },
  });
  if (existing) return existing;

  return prisma.client.create({
    data: {
      clientName,
      email,
      address,
      contactPerson,
      phone,
      tin,
    },
  });
}

async function ensureUser({ fullName, email, roleName, passwordHash }) {
  const role = await prisma.role.findUnique({ where: { roleName } });
  if (!role) throw new Error(`Role not found: ${roleName}`);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;

  return prisma.user.create({
    data: {
      fullName,
      email,
      passwordHash,
      roleId: role.roleId,
      status: 'ACTIVE',
      emailVerified: true,
      notificationPrefs: { twoFactorEnabled: false },
    },
  });
}

async function ensureUserRole(userId, roleName) {
  const role = await prisma.role.findUnique({ where: { roleName } });
  if (!role) throw new Error(`Role not found: ${roleName}`);
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId, roleId: role.roleId } },
    update: {},
    create: { userId, roleId: role.roleId },
  });
}

function toStatus(qtyOnHand, lowStockThreshold) {
  if (qtyOnHand <= 0) return 'OUT_OF_STOCK';
  if (qtyOnHand <= lowStockThreshold) return 'LOW_STOCK';
  return 'AVAILABLE';
}

async function ensureProduct(item) {
  const category = await prisma.productCategory.findUnique({
    where: { categoryName: item.categoryName },
  });
  if (!category) throw new Error(`Category not found: ${item.categoryName}`);

  const existing = await prisma.product.findFirst({
    where: { itemName: item.itemName },
  });
  if (existing) return existing;

  return prisma.product.create({
    data: {
      itemName: item.itemName,
      unit: item.unit,
      unitPrice: item.unitPrice,
      categoryId: category.categoryId,
      qtyOnHand: item.qtyOnHand,
      lowStockThreshold: item.lowStockThreshold,
      shelfLifeDays: item.shelfLifeDays,
      status: toStatus(item.qtyOnHand, item.lowStockThreshold),
    },
  });
}

async function ensureProject({
  projectName,
  clientId,
  assignedPmId,
  location = null,
  status = 'ACTIVE',
  startDate,
  totalValue = 0,
}) {
  const existing = await prisma.project.findFirst({
    where: {
      projectName,
      clientId,
      deletedAt: null,
    },
  });
  if (existing) return existing;

  return prisma.project.create({
    data: {
      projectName,
      clientId,
      assignedPmId,
      location,
      status,
      startDate,
      totalValue,
    },
  });
}

function computeOrderTotals(items, vatRate = 0.12) {
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const vat = Number((subtotal * vatRate).toFixed(2));
  const total = Number((subtotal + vat).toFixed(2));
  return {
    subtotal: Number(subtotal.toFixed(2)),
    vat,
    total,
  };
}

async function ensureClientOrder({
  orderNumber,
  clientId,
  projectId,
  createdBy,
  status = 'DELIVERED',
  paymentStatus = 'PAID',
  createdAt,
  updatedAt,
  orderDate,
  specialInstructions,
  poMatchStatus = 'genuine',
  itemSpecs,
}) {
  const existing = await prisma.clientOrder.findUnique({
    where: { orderNumber },
  });
  if (existing) return existing;

  const products = await Promise.all(
    itemSpecs.map(async (item) => {
      const product = await prisma.product.findFirst({
        where: { itemName: item.itemName, deletedAt: null },
      });
      if (!product) throw new Error(`Product not found for past order seed: ${item.itemName}`);
      return {
        product,
        quantity: item.quantity,
        unitPrice: item.unitPrice ?? Number(product.unitPrice || 0),
      };
    })
  );

  const totals = computeOrderTotals(products);

  return prisma.clientOrder.create({
    data: {
      orderNumber,
      clientId,
      projectId,
      subtotal: totals.subtotal,
      vat: totals.vat,
      total: totals.total,
      status,
      paymentStatus,
      chequeVerification: poMatchStatus,
      orderDate: orderDate || createdAt,
      createdAt,
      updatedAt,
      createdBy,
      specialInstructions,
      items: {
        create: products.map(({ product, quantity, unitPrice }) => ({
          productId: product.productId,
          quantity,
          unitPrice,
        })),
      },
    },
    include: { items: true },
  });
}

async function ensureDelivery({
  drNumber,
  clientOrderId,
  assignedDriverId,
  status = 'DELIVERED',
  eta,
  createdAt,
  receivedAt,
  receivedBy,
  proofOfDeliveryUrl,
  notes,
  itemsCount,
}) {
  const existing = await prisma.delivery.findUnique({
    where: { drNumber },
  });
  if (existing) return existing;

  const data = {
    drNumber,
    status,
    eta,
    createdAt,
    receivedAt,
    receivedBy,
    proofOfDeliveryUrl,
    notes,
    itemsCount,
  };

  if (clientOrderId) {
    data.clientOrder = {
      connect: { clientOrderId },
    };
  }

  if (assignedDriverId) {
    data.assignedDeliveryGuy = {
      connect: { userId: assignedDriverId },
    };
  }

  return prisma.delivery.create({
    data,
  });
}

async function main() {
  // === Roles (add missing only) ===
  const roleNames = [
    'PRESIDENT',
    'ADMIN',
    'PROJECT_MANAGER',
    'SALES_AGENT',
    'ENGINEER',
    'PAINT_CHEMIST',
    'WAREHOUSE_STAFF',
    'DELIVERY_GUY',
    'CLIENT',
  ];

  for (const roleName of roleNames) {
    await ensureRole(roleName);
  }

  // === Users ===
  const defaultPasswordHash = await bcrypt.hash('password123', 10);
  const users = [
    { fullName: 'Emman Uy', email: 'emman.uy@impex.com', roleName: 'PRESIDENT' },
    { fullName: 'Lita de Leon', email: 'lita.deleon@impex.com', roleName: 'SALES_AGENT' },
    { fullName: 'Josephine Padilla', email: 'josephine.padilla@impex.com', roleName: 'ADMIN' },
    { fullName: 'Demo Viewer', email: 'demo.viewer@impex.com', roleName: 'ADMIN' },
    { fullName: 'Princess Espino', email: 'princess.espino@impex.com', roleName: 'PROJECT_MANAGER' },
    { fullName: 'Paula Caraig', email: 'paula.caraig@impex.com', roleName: 'PROJECT_MANAGER' },
    { fullName: 'Abdul Usop', email: 'abdul.usop@impex.com', roleName: 'PROJECT_MANAGER' },
    { fullName: 'Jason Mendizabal', email: 'jason.mendizabal@impex.com', roleName: 'ENGINEER' },
    { fullName: 'Myra Flores', email: 'myra.flores@impex.com', roleName: 'SALES_AGENT' },
    { fullName: 'Letty Cervantes', email: 'letty.cervantes@impex.com', roleName: 'SALES_AGENT' },
    { fullName: 'Connie Celestial', email: 'connie.celestial@impex.com', roleName: 'SALES_AGENT' },
    { fullName: 'Charlene Biza', email: 'charlene.biza@impex.com', roleName: 'SALES_AGENT' },
    { fullName: 'Enar Valencia', email: 'enar.valencia@impex.com', roleName: 'SALES_AGENT' },
    { fullName: 'Kat Cacabilos', email: 'kat.cacabilos@impex.com', roleName: 'PAINT_CHEMIST' },
    { fullName: 'Danilo Benosa', email: 'danilo.benosa@impex.com', roleName: 'WAREHOUSE_STAFF' },
    { fullName: 'Robel Tabora', email: 'robel.tabora@impex.com', roleName: 'WAREHOUSE_STAFF' },
    { fullName: 'Carlos Martinez', email: 'carlos.martinez@impex.com', roleName: 'DELIVERY_GUY' },
    { fullName: 'Ateneo CTC Procurement', email: 'procurement@ateneoctc.com', roleName: 'CLIENT' },
    { fullName: 'Robinsons Land Procurement', email: 'procurement@robinsonsland.com', roleName: 'CLIENT' },
    { fullName: 'Ayala Land Procurement', email: 'procurement@ayalaland.com', roleName: 'CLIENT' },
  ];

  const createdUsers = [];
  for (const user of users) {
    const created = await ensureUser({ ...user, passwordHash: defaultPasswordHash });
    createdUsers.push(created);
    await ensureUserRole(created.userId, user.roleName);
  }

  const lita = createdUsers.find((u) => u.email === 'lita.deleon@impex.com');
  if (lita) {
    const salesAgentRole = await ensureRole('SALES_AGENT');
    await prisma.user.update({
      where: { userId: lita.userId },
      data: { roleId: salesAgentRole.roleId },
    });
    await prisma.userRole.deleteMany({
      where: {
        userId: lita.userId,
        roleId: { not: salesAgentRole.roleId },
      },
    });
    await ensureUserRole(lita.userId, 'SALES_AGENT');
  }

  const josephine = createdUsers.find((u) => u.email === 'josephine.padilla@impex.com');
  if (josephine) {
    const adminRole = await ensureRole('ADMIN');
    await prisma.user.update({
      where: { userId: josephine.userId },
      data: { roleId: adminRole.roleId },
    });
    await prisma.userRole.deleteMany({
      where: {
        userId: josephine.userId,
        roleId: { not: adminRole.roleId },
      },
    });
    await ensureUserRole(josephine.userId, 'ADMIN');
  }

  // Jason Mendizabal should have both ENGINEER and PROJECT_MANAGER roles
  const jason = createdUsers.find((u) => u.email === 'jason.mendizabal@impex.com');
  if (jason) {
    await ensureUserRole(jason.userId, 'PROJECT_MANAGER');
  }

  // Assign PMs to existing projects by client name (safe, no-op if none)
  const pmPrincess = createdUsers.find((u) => u.email === 'princess.espino@impex.com');
  const pmPaula = createdUsers.find((u) => u.email === 'paula.caraig@impex.com');
  const pmAbdul = createdUsers.find((u) => u.email === 'abdul.usop@impex.com');
  if (pmPrincess) {
    await prisma.project.updateMany({
      where: { client: { clientName: { contains: 'Ateneo', mode: 'insensitive' } } },
      data: { assignedPmId: pmPrincess.userId },
    });
  }
  if (pmPaula) {
    await prisma.project.updateMany({
      where: { client: { clientName: { contains: 'Robinson', mode: 'insensitive' } } },
      data: { assignedPmId: pmPaula.userId },
    });
  }
  if (pmAbdul) {
    await prisma.project.updateMany({
      where: { client: { clientName: { contains: 'Robinson', mode: 'insensitive' } } },
      data: { assignedPmId: pmAbdul.userId },
    });
  }

  // === Suppliers ===
  const suppliers = [
    'Paco Asia Hardware',
    'Jhelet General Merchandise',
    'Rockwell Lumbr',
    'Valqua Industrial',
    'JP Camaro Hardware',
    'Knack Commercial',
    'LYS Marketing',
    'Davies Marketing',
  ];

  for (const supplierName of suppliers) {
    await ensureSupplier(supplierName);
  }

  // === Categories ===
  const categories = ['Paint & Consumables', 'Construction Chemicals', 'Machinery'];
  for (const categoryName of categories) {
    await ensureCategory(categoryName);
  }

  // === Inventory (add missing only) ===
  const inventory = [
    // Paint & Consumables
    { itemName: 'Paint brush', unit: 'pcs', unitPrice: 120, categoryName: 'Paint & Consumables', qtyOnHand: 150, lowStockThreshold: 30, shelfLifeDays: 365 },
    { itemName: 'Paint brush 1"', unit: 'pcs', unitPrice: 130, categoryName: 'Paint & Consumables', qtyOnHand: 200, lowStockThreshold: 30, shelfLifeDays: 365 },
    { itemName: 'Paint brush 1-1/2"', unit: 'pcs', unitPrice: 150, categoryName: 'Paint & Consumables', qtyOnHand: 180, lowStockThreshold: 30, shelfLifeDays: 365 },
    { itemName: 'Paint brush 2"', unit: 'pcs', unitPrice: 170, categoryName: 'Paint & Consumables', qtyOnHand: 140, lowStockThreshold: 30, shelfLifeDays: 365 },
    { itemName: 'Paint brush 3"', unit: 'pcs', unitPrice: 190, categoryName: 'Paint & Consumables', qtyOnHand: 90, lowStockThreshold: 30, shelfLifeDays: 365 },
    { itemName: 'Paint roller 7" w/ handle', unit: 'pcs', unitPrice: 220, categoryName: 'Paint & Consumables', qtyOnHand: 120, lowStockThreshold: 25, shelfLifeDays: 365 },
    { itemName: 'Paint roller 7" w/ handle (yellow)', unit: 'pcs', unitPrice: 230, categoryName: 'Paint & Consumables', qtyOnHand: 80, lowStockThreshold: 25, shelfLifeDays: 365 },
    { itemName: 'Baby roller cotton (yellow)', unit: 'pcs', unitPrice: 140, categoryName: 'Paint & Consumables', qtyOnHand: 200, lowStockThreshold: 40, shelfLifeDays: 365 },
    { itemName: 'Baby roller cotton 4" w/ handle (white)', unit: 'pcs', unitPrice: 150, categoryName: 'Paint & Consumables', qtyOnHand: 150, lowStockThreshold: 40, shelfLifeDays: 365 },
    { itemName: 'Acrylon Paint roller 4" filler (white)', unit: 'pcs', unitPrice: 160, categoryName: 'Paint & Consumables', qtyOnHand: 100, lowStockThreshold: 30, shelfLifeDays: 365 },
    { itemName: 'Acrylon Paint roller 7" w/ handle (White)', unit: 'pcs', unitPrice: 210, categoryName: 'Paint & Consumables', qtyOnHand: 90, lowStockThreshold: 30, shelfLifeDays: 365 },
    { itemName: 'Sand paper #100', unit: 'sheets', unitPrice: 8, categoryName: 'Paint & Consumables', qtyOnHand: 500, lowStockThreshold: 100, shelfLifeDays: 365 },
    { itemName: 'Sand Paper #120', unit: 'sheets', unitPrice: 9, categoryName: 'Paint & Consumables', qtyOnHand: 450, lowStockThreshold: 100, shelfLifeDays: 365 },
    { itemName: 'Sand Paper #150', unit: 'sheets', unitPrice: 10, categoryName: 'Paint & Consumables', qtyOnHand: 400, lowStockThreshold: 100, shelfLifeDays: 365 },
    { itemName: 'Sand paper #180', unit: 'sheets', unitPrice: 10, categoryName: 'Paint & Consumables', qtyOnHand: 350, lowStockThreshold: 100, shelfLifeDays: 365 },
    { itemName: 'Paint thinner', unit: 'liters', unitPrice: 120, categoryName: 'Paint & Consumables', qtyOnHand: 300, lowStockThreshold: 40, shelfLifeDays: 365 },
    { itemName: 'Lacquer Thinner', unit: 'liters', unitPrice: 130, categoryName: 'Paint & Consumables', qtyOnHand: 250, lowStockThreshold: 40, shelfLifeDays: 365 },
    { itemName: 'Paint Thinner', unit: 'liters', unitPrice: 125, categoryName: 'Paint & Consumables', qtyOnHand: 280, lowStockThreshold: 40, shelfLifeDays: 365 },
    { itemName: 'Spatula 2"', unit: 'pcs', unitPrice: 90, categoryName: 'Paint & Consumables', qtyOnHand: 120, lowStockThreshold: 25, shelfLifeDays: 365 },
    { itemName: 'Spatula 4"', unit: 'pcs', unitPrice: 110, categoryName: 'Paint & Consumables', qtyOnHand: 100, lowStockThreshold: 25, shelfLifeDays: 365 },
    { itemName: 'Spatula 6"', unit: 'pcs', unitPrice: 130, categoryName: 'Paint & Consumables', qtyOnHand: 80, lowStockThreshold: 25, shelfLifeDays: 365 },
    { itemName: 'Palette (pair) 4"', unit: 'pairs', unitPrice: 160, categoryName: 'Paint & Consumables', qtyOnHand: 60, lowStockThreshold: 20, shelfLifeDays: 365 },
    { itemName: 'Palette (pair) 6"', unit: 'pairs', unitPrice: 180, categoryName: 'Paint & Consumables', qtyOnHand: 50, lowStockThreshold: 20, shelfLifeDays: 365 },
    { itemName: 'Steel brush', unit: 'pcs', unitPrice: 95, categoryName: 'Paint & Consumables', qtyOnHand: 200, lowStockThreshold: 40, shelfLifeDays: 365 },
    { itemName: 'Cotton rags', unit: 'kg', unitPrice: 70, categoryName: 'Paint & Consumables', qtyOnHand: 500, lowStockThreshold: 80, shelfLifeDays: 365 },
    { itemName: 'Empty sacks', unit: 'pcs', unitPrice: 15, categoryName: 'Paint & Consumables', qtyOnHand: 1000, lowStockThreshold: 150, shelfLifeDays: 365 },

    // Construction Chemicals
    { itemName: 'Metal-tech EG (2 kgs)', unit: 'packs', unitPrice: 320, categoryName: 'Construction Chemicals', qtyOnHand: 150, lowStockThreshold: 25, shelfLifeDays: 365 },
    { itemName: 'Cerami-tech EG (1 kg)', unit: 'packs', unitPrice: 260, categoryName: 'Construction Chemicals', qtyOnHand: 200, lowStockThreshold: 25, shelfLifeDays: 365 },
    { itemName: 'Cerami-tech FG (1 kg)', unit: 'packs', unitPrice: 270, categoryName: 'Construction Chemicals', qtyOnHand: 180, lowStockThreshold: 25, shelfLifeDays: 365 },
    { itemName: 'Seal-tech AW (5 ltrs)', unit: 'cans', unitPrice: 450, categoryName: 'Construction Chemicals', qtyOnHand: 120, lowStockThreshold: 20, shelfLifeDays: 365 },
    { itemName: 'Seal-tech AW (20 ltrs)', unit: 'drums', unitPrice: 1400, categoryName: 'Construction Chemicals', qtyOnHand: 80, lowStockThreshold: 10, shelfLifeDays: 365 },
    { itemName: 'Poly-tech CSM', unit: 'rolls', unitPrice: 520, categoryName: 'Construction Chemicals', qtyOnHand: 100, lowStockThreshold: 15, shelfLifeDays: 365 },
    { itemName: 'Epoxy Injection', unit: 'kits', unitPrice: 950, categoryName: 'Construction Chemicals', qtyOnHand: 90, lowStockThreshold: 15, shelfLifeDays: 365 },
    { itemName: 'Chopped Strand Matt 230', unit: 'rolls', unitPrice: 680, categoryName: 'Construction Chemicals', qtyOnHand: 70, lowStockThreshold: 10, shelfLifeDays: 365 },

    // Machinery
    { itemName: 'Portable Grinder', unit: 'units', unitPrice: 3800, categoryName: 'Machinery', qtyOnHand: 15, lowStockThreshold: 5, shelfLifeDays: 730 },
    { itemName: 'Hand drill', unit: 'units', unitPrice: 3200, categoryName: 'Machinery', qtyOnHand: 20, lowStockThreshold: 5, shelfLifeDays: 730 },
    { itemName: 'Injection machine', unit: 'units', unitPrice: 25000, categoryName: 'Machinery', qtyOnHand: 8, lowStockThreshold: 2, shelfLifeDays: 730 },
    { itemName: 'Chipping gun', unit: 'units', unitPrice: 5600, categoryName: 'Machinery', qtyOnHand: 12, lowStockThreshold: 3, shelfLifeDays: 730 },
    { itemName: 'Welding machine', unit: 'units', unitPrice: 18000, categoryName: 'Machinery', qtyOnHand: 10, lowStockThreshold: 2, shelfLifeDays: 730 },
  ];

  for (const item of inventory) {
    await ensureProduct(item);
  }

  // === Demo clients, projects, and past orders (safe, backend-friendly preview data) ===
  const princess = createdUsers.find((u) => u.email === 'princess.espino@impex.com');
  const paula = createdUsers.find((u) => u.email === 'paula.caraig@impex.com');
  const jasonPm = createdUsers.find((u) => u.email === 'jason.mendizabal@impex.com');
  const myra = createdUsers.find((u) => u.email === 'myra.flores@impex.com');
  const charlene = createdUsers.find((u) => u.email === 'charlene.biza@impex.com');
  const enar = createdUsers.find((u) => u.email === 'enar.valencia@impex.com');
  const carlos = createdUsers.find((u) => u.email === 'carlos.martinez@impex.com');
  const ateneoClientUser = createdUsers.find((u) => u.email === 'procurement@ateneoctc.com');
  const robinsonsClientUser = createdUsers.find((u) => u.email === 'procurement@robinsonsland.com');
  const ayalaClientUser = createdUsers.find((u) => u.email === 'procurement@ayalaland.com');

  const ateneoClient = await ensureClient({
    clientName: 'Ateneo CTC',
    email: 'procurement@ateneoctc.com',
    address: 'Ateneo de Manila Campus, Katipunan Avenue, Quezon City',
    contactPerson: 'Ateneo Procurement',
    phone: '+63 917 800 1108',
    tin: '000-108-202-000',
  });

  const robinsonsClient = await ensureClient({
    clientName: 'Robinsons Land',
    email: 'procurement@robinsonsland.com',
    address: 'Robinsons Galleria, Ortigas Avenue, Quezon City',
    contactPerson: 'Robinsons Procurement',
    phone: '+63 917 800 0972',
    tin: '000-972-404-000',
  });

  const ayalaClient = await ensureClient({
    clientName: 'Ayala Land',
    email: 'procurement@ayalaland.com',
    address: 'Ayala Avenue, Makati City',
    contactPerson: 'Ayala Procurement',
    phone: '+63 917 800 0915',
    tin: '000-915-330-000',
  });

  const ateneoProject = await ensureProject({
    projectName: 'Ateneo CTC Building Renovation',
    clientId: ateneoClient.clientId,
    assignedPmId: princess?.userId || null,
    location: 'Quezon City',
    status: 'ACTIVE',
    startDate: new Date('2026-01-15'),
    totalValue: 0,
  });

  const robinsonsProject = await ensureProject({
    projectName: 'Robinsons Galleria Expansion',
    clientId: robinsonsClient.clientId,
    assignedPmId: paula?.userId || null,
    location: 'Quezon City',
    status: 'ACTIVE',
    startDate: new Date('2026-02-01'),
    totalValue: 0,
  });

  const ayalaProject = await ensureProject({
    projectName: 'Ayala Mall Fit-out',
    clientId: ayalaClient.clientId,
    assignedPmId: jasonPm?.userId || null,
    location: 'Makati City',
    status: 'ACTIVE',
    startDate: new Date('2026-01-28'),
    totalValue: 0,
  });

  const seededPastOrders = [
    {
      orderNumber: 'ORD-2026-1008',
      drNumber: 'DR-2026-1008',
      client: ateneoClient,
      project: ateneoProject,
      createdBy: myra?.userId || null,
      assignedDriverId: carlos?.userId || null,
      createdAt: new Date('2026-03-28T09:15:00.000Z'),
      updatedAt: new Date('2026-04-01T14:00:00.000Z'),
      eta: new Date('2026-04-01'),
      receivedAt: new Date('2026-04-01T14:00:00.000Z'),
      receivedBy: 'Ateneo Site Office',
      proofOfDeliveryUrl: '/uploads/pod/mock-ord-2026-1008.pdf',
      notes: 'Seeded delivered order for Past Orders preview.',
      specialInstructions: 'Repeat paint and consumables package for the Ateneo renovation phase.',
      itemSpecs: [
        { itemName: 'Paint brush 1"', quantity: 50 },
        { itemName: 'Steel brush', quantity: 12 },
        { itemName: 'Cotton rags', quantity: 25 },
      ],
    },
    {
      orderNumber: 'ORD-2026-0972',
      drNumber: 'DR-2026-0972',
      client: robinsonsClient,
      project: robinsonsProject,
      createdBy: charlene?.userId || null,
      assignedDriverId: carlos?.userId || null,
      createdAt: new Date('2026-03-14T07:45:00.000Z'),
      updatedAt: new Date('2026-03-18T16:30:00.000Z'),
      eta: new Date('2026-03-18'),
      receivedAt: new Date('2026-03-18T16:30:00.000Z'),
      receivedBy: 'Robinsons Engineering Team',
      proofOfDeliveryUrl: '/uploads/pod/mock-ord-2026-0972.pdf',
      notes: 'Seeded delivered order for Robinsons reorder preview.',
      specialInstructions: 'Waterproofing and patching materials for mall expansion turnover.',
      itemSpecs: [
        { itemName: 'Seal-tech AW (5 ltrs)', quantity: 6 },
        { itemName: 'Spatula 2"', quantity: 20 },
      ],
    },
    {
      orderNumber: 'ORD-2026-0915',
      drNumber: 'DR-2026-0915',
      client: ayalaClient,
      project: ayalaProject,
      createdBy: enar?.userId || null,
      assignedDriverId: carlos?.userId || null,
      createdAt: new Date('2026-02-25T11:20:00.000Z'),
      updatedAt: new Date('2026-02-27T13:10:00.000Z'),
      eta: new Date('2026-02-27'),
      receivedAt: new Date('2026-02-27T13:10:00.000Z'),
      receivedBy: 'Ayala Fit-out Team',
      proofOfDeliveryUrl: '/uploads/pod/mock-ord-2026-0915.pdf',
      notes: 'Seeded delivered order for Ayala reorder preview.',
      specialInstructions: 'Starter finishing kit for fit-out paint works.',
      itemSpecs: [
        { itemName: 'Paint brush', quantity: 40 },
        { itemName: 'Paint roller 7" w/ handle', quantity: 18 },
        { itemName: 'Palette (pair) 4"', quantity: 10 },
      ],
    },
  ];

  for (const seededOrder of seededPastOrders) {
    const order = await ensureClientOrder({
      orderNumber: seededOrder.orderNumber,
      clientId: seededOrder.client.clientId,
      projectId: seededOrder.project.projectId,
      createdBy: seededOrder.createdBy,
      createdAt: seededOrder.createdAt,
      updatedAt: seededOrder.updatedAt,
      orderDate: seededOrder.createdAt,
      specialInstructions: seededOrder.specialInstructions,
      poMatchStatus: 'genuine',
      itemSpecs: seededOrder.itemSpecs,
    });

    await ensureDelivery({
      drNumber: seededOrder.drNumber,
      clientOrderId: order.clientOrderId,
      assignedDriverId: seededOrder.assignedDriverId,
      status: 'DELIVERED',
      eta: seededOrder.eta,
      createdAt: seededOrder.createdAt,
      receivedAt: seededOrder.receivedAt,
      receivedBy: seededOrder.receivedBy,
      proofOfDeliveryUrl: seededOrder.proofOfDeliveryUrl,
      notes: seededOrder.notes,
      itemsCount: seededOrder.itemSpecs.reduce((sum, item) => sum + item.quantity, 0),
    });
  }

  const seededTestingOrders = [
    {
      orderNumber: 'ORD-2026-1101',
      client: ateneoClient,
      project: ateneoProject,
      createdBy: ateneoClientUser?.userId || myra?.userId || null,
      status: 'PENDING',
      paymentStatus: 'PENDING',
      createdAt: new Date('2026-04-05T08:40:00.000Z'),
      updatedAt: new Date('2026-04-05T08:40:00.000Z'),
      specialInstructions: 'Initial request for primer and basic paint tools.',
      itemSpecs: [
        { itemName: 'Paint brush 2"', quantity: 24 },
        { itemName: 'Paint roller 7" w/ handle', quantity: 8 },
      ],
    },
    {
      orderNumber: 'ORD-2026-1102',
      client: ateneoClient,
      project: ateneoProject,
      createdBy: myra?.userId || ateneoClientUser?.userId || null,
      status: 'PROCESSING',
      paymentStatus: 'VERIFIED',
      createdAt: new Date('2026-04-06T09:20:00.000Z'),
      updatedAt: new Date('2026-04-07T10:15:00.000Z'),
      specialInstructions: 'Second batch for renovation touch-ups.',
      itemSpecs: [
        { itemName: 'Acrylon Paint roller 4" filler (white)', quantity: 12 },
        { itemName: 'Baby roller cotton 4" w/ handle (white)', quantity: 12 },
      ],
      delivery: {
        drNumber: 'DR-2026-1102',
        assignedDriverId: carlos?.userId || null,
        status: 'PENDING',
        eta: new Date('2026-04-10'),
        createdAt: new Date('2026-04-07T11:00:00.000Z'),
        notes: 'Queued for dispatch.',
      },
    },
    {
      orderNumber: 'ORD-2026-1103',
      client: robinsonsClient,
      project: robinsonsProject,
      createdBy: robinsonsClientUser?.userId || charlene?.userId || null,
      status: 'SHIPPED',
      paymentStatus: 'PAID',
      createdAt: new Date('2026-04-04T07:10:00.000Z'),
      updatedAt: new Date('2026-04-08T06:55:00.000Z'),
      specialInstructions: 'Deliver to mall expansion service entrance.',
      itemSpecs: [
        { itemName: 'Seal-tech AW (5 ltrs)', quantity: 10 },
        { itemName: 'Spatula 4"', quantity: 18 },
        { itemName: 'Sand paper #100', quantity: 30 },
      ],
      delivery: {
        drNumber: 'DR-2026-1103',
        assignedDriverId: carlos?.userId || null,
        status: 'IN_TRANSIT',
        eta: new Date('2026-04-10'),
        createdAt: new Date('2026-04-08T07:00:00.000Z'),
        notes: 'Truck left warehouse; expected same-day arrival.',
      },
    },
    {
      orderNumber: 'ORD-2026-1104',
      client: ayalaClient,
      project: ayalaProject,
      createdBy: ayalaClientUser?.userId || enar?.userId || null,
      status: 'CANCELLED',
      paymentStatus: 'FAILED',
      createdAt: new Date('2026-04-02T13:30:00.000Z'),
      updatedAt: new Date('2026-04-03T16:45:00.000Z'),
      specialInstructions: 'Cancelled due to revised fit-out scope.',
      itemSpecs: [
        { itemName: 'Paint brush 3"', quantity: 14 },
        { itemName: 'Palette (pair) 4"', quantity: 10 },
      ],
    },
  ];

  for (const seededOrder of seededTestingOrders) {
    const order = await ensureClientOrder({
      orderNumber: seededOrder.orderNumber,
      clientId: seededOrder.client.clientId,
      projectId: seededOrder.project.projectId,
      createdBy: seededOrder.createdBy,
      status: seededOrder.status,
      paymentStatus: seededOrder.paymentStatus,
      createdAt: seededOrder.createdAt,
      updatedAt: seededOrder.updatedAt,
      orderDate: seededOrder.createdAt,
      specialInstructions: seededOrder.specialInstructions,
      poMatchStatus: seededOrder.paymentStatus === 'FAILED' ? 'mismatch' : 'genuine',
      itemSpecs: seededOrder.itemSpecs,
    });

    if (seededOrder.delivery) {
      await ensureDelivery({
        drNumber: seededOrder.delivery.drNumber,
        clientOrderId: order.clientOrderId,
        assignedDriverId: seededOrder.delivery.assignedDriverId,
        status: seededOrder.delivery.status,
        eta: seededOrder.delivery.eta,
        createdAt: seededOrder.delivery.createdAt,
        notes: seededOrder.delivery.notes,
        itemsCount: seededOrder.itemSpecs.reduce((sum, item) => sum + item.quantity, 0),
      });
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
