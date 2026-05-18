const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const prisma = require('../src/utils/prisma');
const { resolveShelfLifeDays } = require('../src/utils/shelfLife');

let deliveryColumnSupport = null;

async function getDeliveryColumnSupport() {
  if (deliveryColumnSupport) return deliveryColumnSupport;
  const optionalColumns = [
    'delivery_method',
    'batch_number',
    'batch_count',
    'load_kg',
    'third_party_provider',
    'third_party_reference',
  ];

  try {
    const rows = await prisma.$queryRaw`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'deliveries'
        AND column_name IN ('delivery_method', 'batch_number', 'batch_count', 'load_kg', 'third_party_provider', 'third_party_reference')
    `;
    const found = new Set(rows.map((row) => row.column_name));
    deliveryColumnSupport = {
      batches: optionalColumns.every((column) => found.has(column)),
    };
  } catch (error) {
    console.error('Seed delivery column check failed:', error.message || error);
    deliveryColumnSupport = { batches: false };
  }

  return deliveryColumnSupport;
}

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

async function ensureSupplier({ supplierName, address = null, tin = null, contactPerson = null, phone = null, country = 'Philippines' }) {
  const existing = await prisma.supplier.findFirst({ where: { supplierName } });
  if (existing) {
    return prisma.supplier.update({
      where: { supplierId: existing.supplierId },
      data: {
        address,
        tin,
        contactPerson,
        phone,
        country,
        email: null,
        deletedAt: null,
      },
    });
  }
  return prisma.supplier.create({
    data: {
      supplierName,
      address,
      tin,
      contactPerson,
      phone,
      country,
      email: null,
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
  if (existing) {
    if (existing.fullName !== fullName || existing.roleId !== role.roleId) {
      return prisma.user.update({
        where: { email },
        data: { fullName, roleId: role.roleId },
      });
    }
    return existing;
  }

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

  const names = [item.itemName, ...(item.aliases || [])].filter(Boolean);
  const existing = await prisma.product.findFirst({
    where: { itemName: { in: names } },
    orderBy: { productId: 'asc' },
  });
  if (existing) {
    const updated = await prisma.product.update({
      where: { productId: existing.productId },
      data: {
        itemName: item.itemName,
        unit: item.unit,
        unitPrice: item.unitPrice,
        categoryId: category.categoryId,
        lowStockThreshold: item.lowStockThreshold,
        shelfLifeDays: resolveShelfLifeDays({ ...item, shelfLifeDays: undefined }),
        status: toStatus(existing.qtyOnHand, item.lowStockThreshold),
        deletedAt: null,
      },
    });

    if (item.aliases?.length) {
      await prisma.product.updateMany({
        where: {
          productId: { not: updated.productId },
          itemName: { in: item.aliases },
          deletedAt: null,
        },
        data: { deletedAt: new Date() },
      });
    }

    return updated;
  }

  return prisma.product.create({
    data: {
      itemName: item.itemName,
      unit: item.unit,
      unitPrice: item.unitPrice,
      categoryId: category.categoryId,
      qtyOnHand: item.qtyOnHand,
      lowStockThreshold: item.lowStockThreshold,
      shelfLifeDays: resolveShelfLifeDays({ ...item, shelfLifeDays: undefined }),
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
  paymentProofUrl,
  itemSpecs,
}) {
  const existing = await prisma.clientOrder.findUnique({
    where: { orderNumber },
  });
  if (existing) {
    if (paymentProofUrl && existing.paymentProofUrl !== paymentProofUrl) {
      return prisma.clientOrder.update({
        where: { clientOrderId: existing.clientOrderId },
        data: { paymentProofUrl },
        include: { items: true },
      });
    }
    return existing;
  }

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
      paymentProofUrl,
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
  deliveryMethod,
  batchNumber,
  batchCount,
  loadKg,
  thirdPartyProvider,
  thirdPartyReference,
}) {
  const support = await getDeliveryColumnSupport();
  const existing = await prisma.delivery.findFirst({
    where: { drNumber },
    select: {
      deliveryId: true,
      drNumber: true,
      proofOfDeliveryUrl: true,
    },
  });
  if (existing) {
    if (proofOfDeliveryUrl && existing.proofOfDeliveryUrl !== proofOfDeliveryUrl) {
      return prisma.delivery.update({
        where: { deliveryId: existing.deliveryId },
        data: { proofOfDeliveryUrl },
      });
    }
    return existing;
  }

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

  if (support.batches) {
    data.deliveryMethod = deliveryMethod;
    data.batchNumber = batchNumber;
    data.batchCount = batchCount;
    data.loadKg = loadKg;
    data.thirdPartyProvider = thirdPartyProvider;
    data.thirdPartyReference = thirdPartyReference;
  }

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

function ensureDemoFiles() {
  const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 76 >>
stream
BT /F1 18 Tf 72 720 Td (Impex Engineering Demo Proof Document) Tj ET
endstream
endobj
xref
0 5
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000204 00000 n
trailer
<< /Root 1 0 R /Size 5 >>
startxref
330
%%EOF
`;
  const files = [
    'uploads/pod/mock-ord-2026-1008.pdf',
    'uploads/pod/mock-ord-2026-0972.pdf',
    'uploads/pod/mock-ord-2026-0915.pdf',
    'uploads/payments/demo-ord-2026-1102.pdf',
    'uploads/payments/demo-ord-2026-1103.pdf',
    'uploads/payments/demo-ord-2026-1105.pdf',
    'uploads/proofs/demo-client-proof.pdf',
  ];
  for (const relative of files) {
    const absolute = path.join(__dirname, '..', relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    if (!fs.existsSync(absolute)) {
      fs.writeFileSync(absolute, pdf);
    }
  }
}

async function ensureAuditLog({ userId, action, target, details, timestamp }) {
  const existing = await prisma.auditLog.findFirst({ where: { action, target, details } });
  if (existing) return existing;
  return prisma.auditLog.create({
    data: { userId, action, target, details, timestamp },
  });
}

async function ensureNotification({ userId, type, title, message, link, createdAt }) {
  const existing = await prisma.notification.findFirst({ where: { userId, title, message } });
  if (existing) return existing;
  return prisma.notification.create({
    data: { userId, type, title, message, link, createdAt },
  });
}

async function ensureStockTransaction({ productId, type, qtyChange, newBalance, userId, notes, date }) {
  const existing = await prisma.stockTransaction.findFirst({ where: { notes } });
  if (existing) return existing;
  return prisma.stockTransaction.create({
    data: {
      productId,
      type,
      qtyChange,
      newBalance,
      userId,
      notes,
      date,
    },
  });
}

async function main() {
  ensureDemoFiles();

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
    { fullName: 'Manny Dela Cruz', email: 'carlos.martinez@impex.com', roleName: 'DELIVERY_GUY' },
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
    {
      supplierName: 'JHELET GENERAL MERCHANDISING',
      address: 'Lot 17 & 18 Martinez St., Brgy Rizal Makati City',
      tin: '191-017-762-00000',
      contactPerson: 'Mam Vangie',
      phone: '09228629686',
    },
    {
      supplierName: 'PACO ASIA PLUMBING SUPPLY AND HARDWARE',
      address: '1475 Gen. Luna St., Barangay 676 Zone 73, Dist V 1007, Paco, City of Manila',
      tin: '140-467-869-0000',
      contactPerson: 'Mam Susan',
      phone: '09101937600',
    },
    {
      supplierName: 'Elite Hardware, Electrical & Industrial Supply Co (Davies)',
      address: '238 15th Avenue, corner Aurora Boulevard, Cubao, Quezon City, 1109 Philippines',
      tin: '000-389-799-00000',
      contactPerson: 'Mam Tess',
      phone: '09178779302',
    },
    {
      supplierName: 'GAZPAC ENTERPRISES CORPORATION',
      address: '1463 Doroteo Jose St., Barangay 314 Zone 031 1003 Santa Cruz NCR City of Manila',
      tin: '644-777-972-00000',
      contactPerson: 'Mam Tery',
      phone: '09228099952',
    },
    {
      supplierName: 'Polymer Products (Phil) Inc',
      address: '11 Joe Borris St Bagong Ilog, 1604 City of Pasig NCR',
      tin: '000-281-511-00000',
      contactPerson: 'Mam Sheng',
      phone: '09454274426',
    },
    {
      supplierName: 'JP Camaro Construction Supply',
      address: '4983 Arnaiz Ave cor. Mayor St., Brgy. Pio Del Pilar Makati City',
      tin: '605-521-666-00000',
      contactPerson: 'Mam Liza',
      phone: '09267527299',
    },
    {
      supplierName: 'Knack Commercial (Kelyn Commercial Corp)',
      address: '4996 A. Arnaiz Ave., Brgy. Pio Del Pilar Makati City',
      tin: null,
      contactPerson: null,
      phone: '09435814433',
    },
    {
      supplierName: 'LYS Marketing Corporation',
      address: '187 Roosevelt Ave., Brgy Del Monte 1 Quezon City',
      tin: '000-365-807-00000',
      contactPerson: 'Mam Sol',
      phone: '09171870151',
    },
    {
      supplierName: 'Rockwell Lumber and Hardware Inc',
      address: '1159 JP Rizal St. Guadalupe Viejo 1211 City of Makati',
      tin: '000-167-700-00000',
      contactPerson: 'Sir Edgar',
      phone: '09277843280',
    },
    {
      supplierName: 'Valqua Industrial Corporation',
      address: '1007 Tomas Mapua St Brgy 329 Zone 33 Dist III Sta Cruz Manila',
      tin: '004-827-090-000',
      contactPerson: 'Mam Kristine',
      phone: '8-7115103',
    },
  ];

  for (const supplier of suppliers) {
    await ensureSupplier(supplier);
  }

  // === Categories ===
  const categories = ['Paint & Consumables', 'Construction Chemicals', 'Machinery'];
  for (const categoryName of categories) {
    await ensureCategory(categoryName);
  }

  // === Inventory (add missing only) ===
  const inventory = [
    // Paint & Consumables
    { itemName: 'Paint brush 1"', unit: 'pcs', unitPrice: 25, categoryName: 'Paint & Consumables', qtyOnHand: 200, lowStockThreshold: 30, shelfLifeDays: 365, aliases: ['Paint brush'] },
    { itemName: 'Paint brush 1-1/2"', unit: 'pcs', unitPrice: 40, categoryName: 'Paint & Consumables', qtyOnHand: 180, lowStockThreshold: 30, shelfLifeDays: 365 },
    { itemName: 'Paint brush 2"', unit: 'pcs', unitPrice: 45, categoryName: 'Paint & Consumables', qtyOnHand: 140, lowStockThreshold: 30, shelfLifeDays: 365 },
    { itemName: 'Paint brush 3"', unit: 'pcs', unitPrice: 65, categoryName: 'Paint & Consumables', qtyOnHand: 90, lowStockThreshold: 30, shelfLifeDays: 365 },
    { itemName: 'Paint roller 7" w/ handle', unit: 'pcs', unitPrice: 100, categoryName: 'Paint & Consumables', qtyOnHand: 120, lowStockThreshold: 25, shelfLifeDays: 365 },
    { itemName: 'Paint roller 7" w/ handle yellow', unit: 'pcs', unitPrice: 65, categoryName: 'Paint & Consumables', qtyOnHand: 80, lowStockThreshold: 25, shelfLifeDays: 365, aliases: ['Paint roller 7" w/ handle (yellow)'] },
    { itemName: 'Baby roller cotton (white)', unit: 'pcs', unitPrice: 35, categoryName: 'Paint & Consumables', qtyOnHand: 200, lowStockThreshold: 40, shelfLifeDays: 365, aliases: ['Baby roller cotton (yellow)', 'Acrylon Paint roller 4" filler (white)'] },
    { itemName: 'Baby roller cotton 4" w/ handle white', unit: 'pcs', unitPrice: 45, categoryName: 'Paint & Consumables', qtyOnHand: 150, lowStockThreshold: 40, shelfLifeDays: 365, aliases: ['Baby roller cotton 4" w/ handle (white)'] },
    { itemName: 'Acrylon Paint roller 7" w/ handle (White)', unit: 'pcs', unitPrice: 100, categoryName: 'Paint & Consumables', qtyOnHand: 90, lowStockThreshold: 30, shelfLifeDays: 365 },
    { itemName: 'Sand paper #100', unit: 'sheet', unitPrice: 20, categoryName: 'Paint & Consumables', qtyOnHand: 500, lowStockThreshold: 100, shelfLifeDays: 365 },
    { itemName: 'Sand paper #120', unit: 'sheet', unitPrice: 20, categoryName: 'Paint & Consumables', qtyOnHand: 450, lowStockThreshold: 100, shelfLifeDays: 365, aliases: ['Sand Paper #120'] },
    { itemName: 'Sand paper #150', unit: 'sheet', unitPrice: 20, categoryName: 'Paint & Consumables', qtyOnHand: 400, lowStockThreshold: 100, shelfLifeDays: 365, aliases: ['Sand Paper #150'] },
    { itemName: 'Sand paper #180', unit: 'sheet', unitPrice: 20, categoryName: 'Paint & Consumables', qtyOnHand: 350, lowStockThreshold: 100, shelfLifeDays: 365 },
    { itemName: 'Paint thinner', unit: 'gallon', unitPrice: 320, categoryName: 'Paint & Consumables', qtyOnHand: 300, lowStockThreshold: 40, shelfLifeDays: 365, aliases: ['Paint Thinner'] },
    { itemName: 'Lacquer thinner', unit: 'gallon', unitPrice: 290, categoryName: 'Paint & Consumables', qtyOnHand: 250, lowStockThreshold: 40, shelfLifeDays: 365, aliases: ['Lacquer Thinner'] },
    { itemName: 'Spatula 2"', unit: 'pcs', unitPrice: 25, categoryName: 'Paint & Consumables', qtyOnHand: 120, lowStockThreshold: 25, shelfLifeDays: 365 },
    { itemName: 'Spatula 4"', unit: 'pcs', unitPrice: 35, categoryName: 'Paint & Consumables', qtyOnHand: 100, lowStockThreshold: 25, shelfLifeDays: 365 },
    { itemName: 'Spatula 6"', unit: 'pcs', unitPrice: 45, categoryName: 'Paint & Consumables', qtyOnHand: 80, lowStockThreshold: 25, shelfLifeDays: 365 },
    { itemName: 'Palette pair 4"', unit: 'pair', unitPrice: 50, categoryName: 'Paint & Consumables', qtyOnHand: 60, lowStockThreshold: 20, shelfLifeDays: 365, aliases: ['Palette (pair) 4"'] },
    { itemName: 'Palette pair 6"', unit: 'pair', unitPrice: 60, categoryName: 'Paint & Consumables', qtyOnHand: 50, lowStockThreshold: 20, shelfLifeDays: 365, aliases: ['Palette (pair) 6"'] },
    { itemName: 'Steel brush', unit: 'pcs', unitPrice: 50, categoryName: 'Paint & Consumables', qtyOnHand: 200, lowStockThreshold: 40, shelfLifeDays: 365 },
    { itemName: 'Cotton rags', unit: 'bundle', unitPrice: 60, categoryName: 'Paint & Consumables', qtyOnHand: 500, lowStockThreshold: 80, shelfLifeDays: 365 },
    { itemName: 'Empty sacks', unit: 'pcs', unitPrice: 5, categoryName: 'Paint & Consumables', qtyOnHand: 1000, lowStockThreshold: 150, shelfLifeDays: 365 },

    // Construction Chemicals
    { itemName: 'Metal Tech EG', unit: 'kit', unitPrice: 16500, categoryName: 'Construction Chemicals', qtyOnHand: 150, lowStockThreshold: 25, shelfLifeDays: 365, aliases: ['Metal-tech EG (2 kgs)'] },
    { itemName: 'Ceramic Tech EG', unit: 'kg', unitPrice: 16500, categoryName: 'Construction Chemicals', qtyOnHand: 200, lowStockThreshold: 25, shelfLifeDays: 365, aliases: ['Cerami-tech EG (1 kg)'] },
    { itemName: 'Ceramic Tech FG', unit: 'kg', unitPrice: 16500, categoryName: 'Construction Chemicals', qtyOnHand: 180, lowStockThreshold: 25, shelfLifeDays: 365, aliases: ['Cerami-tech FG (1 kg)'] },
    { itemName: 'Seal Tech AW 5 ltrs', unit: 'pail', unitPrice: 13550, categoryName: 'Construction Chemicals', qtyOnHand: 120, lowStockThreshold: 20, shelfLifeDays: 365, aliases: ['Seal-tech AW (5 ltrs)'] },
    { itemName: 'Seal Tech AW 20 ltrs', unit: 'pail', unitPrice: 48500, categoryName: 'Construction Chemicals', qtyOnHand: 80, lowStockThreshold: 10, shelfLifeDays: 365, aliases: ['Seal-tech AW (20 ltrs)'] },
    { itemName: 'Poly Tech CSM', unit: 'roll', unitPrice: 42800, categoryName: 'Construction Chemicals', qtyOnHand: 100, lowStockThreshold: 15, shelfLifeDays: 365, aliases: ['Poly-tech CSM'] },
    { itemName: 'Epoxy injection', unit: 'kit', unitPrice: 10000, categoryName: 'Construction Chemicals', qtyOnHand: 90, lowStockThreshold: 15, shelfLifeDays: 365, aliases: ['Epoxy Injection'] },
    { itemName: 'Chopped strand matt 230', unit: 'roll', unitPrice: 6500, categoryName: 'Construction Chemicals', qtyOnHand: 70, lowStockThreshold: 10, shelfLifeDays: 365, aliases: ['Chopped Strand Matt 230'] },

    // Machinery
    { itemName: 'Portable grinder', unit: 'unit', unitPrice: 4500, categoryName: 'Machinery', qtyOnHand: 15, lowStockThreshold: 5, shelfLifeDays: 730, aliases: ['Portable Grinder'] },
    { itemName: 'Hand drill', unit: 'unit', unitPrice: 6500, categoryName: 'Machinery', qtyOnHand: 20, lowStockThreshold: 5, shelfLifeDays: 730 },
    { itemName: 'Injection machine', unit: 'unit', unitPrice: 30000, categoryName: 'Machinery', qtyOnHand: 8, lowStockThreshold: 2, shelfLifeDays: 730 },
    { itemName: 'Chipping gun', unit: 'unit', unitPrice: 7500, categoryName: 'Machinery', qtyOnHand: 12, lowStockThreshold: 3, shelfLifeDays: 730 },
    { itemName: 'Welding machine', unit: 'unit', unitPrice: 65000, categoryName: 'Machinery', qtyOnHand: 10, lowStockThreshold: 2, shelfLifeDays: 730 },
  ];

  for (const item of inventory) {
    await ensureProduct(item);
  }

  await prisma.product.updateMany({
    where: { itemName: 'Acrylon Paint roller 4" filler (white)', deletedAt: null },
    data: { deletedAt: new Date() },
  });

  const aiDemoStock = [
    { itemName: 'Welding machine', qtyOnHand: 0, lowStockThreshold: 2 },
    { itemName: 'Ceramic Tech EG', qtyOnHand: 4, lowStockThreshold: 25 },
    { itemName: 'Seal Tech AW 20 ltrs', qtyOnHand: 6, lowStockThreshold: 20 },
    { itemName: 'Baby roller cotton (white)', qtyOnHand: 18, lowStockThreshold: 40 },
    { itemName: 'Paint thinner', qtyOnHand: 22, lowStockThreshold: 40 },
  ];

  for (const item of aiDemoStock) {
    await prisma.product.updateMany({
      where: { itemName: item.itemName, deletedAt: null },
      data: {
        qtyOnHand: item.qtyOnHand,
        lowStockThreshold: item.lowStockThreshold,
        status: toStatus(item.qtyOnHand, item.lowStockThreshold),
      },
    });
  }

  const historyProducts = await prisma.product.findMany({
    where: {
      itemName: {
        in: [
          'Paint thinner',
          'Ceramic Tech EG',
          'Seal Tech AW 20 ltrs',
          'Baby roller cotton (white)',
          'Welding machine',
          'Cotton rags',
        ],
      },
      deletedAt: null,
    },
    orderBy: { itemName: 'asc' },
  });
  const productByName = new Map(historyProducts.map((product) => [product.itemName, product]));
  const historyUser =
    createdUsers.find((u) => u.email === 'danilo.benosa@impex.com') ||
    josephine ||
    createdUsers[0] ||
    null;
  const historyUserId = historyUser?.userId || null;
  const stockHistoryMonths = Array.from({ length: 24 }).map((_, idx) => {
    const date = new Date(Date.UTC(2024, 4 + idx, 15, 8, 0, 0));
    return {
      label: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`,
      date,
      idx,
    };
  });
  const stockHistoryPlan = [
    { itemName: 'Paint thinner', base: 180, purchase: 42, issue: 29 },
    { itemName: 'Ceramic Tech EG', base: 96, purchase: 24, issue: 31 },
    { itemName: 'Seal Tech AW 20 ltrs', base: 44, purchase: 12, issue: 14 },
    { itemName: 'Baby roller cotton (white)', base: 210, purchase: 55, issue: 47 },
    { itemName: 'Welding machine', base: 9, purchase: 2, issue: 1 },
    { itemName: 'Cotton rags', base: 360, purchase: 85, issue: 72 },
  ];

  for (const plan of stockHistoryPlan) {
    const product = productByName.get(plan.itemName);
    if (!product) continue;
    let balance = plan.base;
    for (const month of stockHistoryMonths) {
      const purchaseQty = plan.purchase + ((month.idx + product.productId) % 5);
      balance += purchaseQty;
      await ensureStockTransaction({
        productId: product.productId,
        type: 'PURCHASE',
        qtyChange: purchaseQty,
        newBalance: balance,
        userId: historyUserId,
        notes: `Demo ${month.label} supplier stock-in for ${plan.itemName}`,
        date: new Date(month.date),
      });

      const issueQty = Math.min(balance, plan.issue + ((month.idx * 2 + product.productId) % 7));
      balance -= issueQty;
      await ensureStockTransaction({
        productId: product.productId,
        type: 'ISSUE',
        qtyChange: -issueQty,
        newBalance: balance,
        userId: historyUserId,
        notes: `Demo ${month.label} project issue for ${plan.itemName}`,
        date: new Date(Date.UTC(month.date.getUTCFullYear(), month.date.getUTCMonth(), 25, 9, 30, 0)),
      });
    }
  }

  // === Demo clients, projects, and past orders (safe, backend-friendly preview data) ===
  const princess = createdUsers.find((u) => u.email === 'princess.espino@impex.com');
  const paula = createdUsers.find((u) => u.email === 'paula.caraig@impex.com');
  const jasonPm = createdUsers.find((u) => u.email === 'jason.mendizabal@impex.com');
  const myra = createdUsers.find((u) => u.email === 'myra.flores@impex.com');
  const charlene = createdUsers.find((u) => u.email === 'charlene.biza@impex.com');
  const enar = createdUsers.find((u) => u.email === 'enar.valencia@impex.com');
  const driver = createdUsers.find((u) => u.email === 'carlos.martinez@impex.com');
  const admin = josephine || createdUsers.find((u) => u.email === 'demo.viewer@impex.com');
  const warehouse = createdUsers.find((u) => u.email === 'danilo.benosa@impex.com');
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
      assignedDriverId: driver?.userId || null,
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
      assignedDriverId: driver?.userId || null,
      createdAt: new Date('2026-03-14T07:45:00.000Z'),
      updatedAt: new Date('2026-03-18T16:30:00.000Z'),
      eta: new Date('2026-03-18'),
      receivedAt: new Date('2026-03-18T16:30:00.000Z'),
      receivedBy: 'Robinsons Engineering Team',
      proofOfDeliveryUrl: '/uploads/pod/mock-ord-2026-0972.pdf',
      notes: 'Seeded delivered order for Robinsons reorder preview.',
      specialInstructions: 'Waterproofing and patching materials for mall expansion turnover.',
      itemSpecs: [
        { itemName: 'Seal Tech AW 5 ltrs', quantity: 6 },
        { itemName: 'Spatula 2"', quantity: 20 },
      ],
    },
    {
      orderNumber: 'ORD-2026-0915',
      drNumber: 'DR-2026-0915',
      client: ayalaClient,
      project: ayalaProject,
      createdBy: enar?.userId || null,
      assignedDriverId: driver?.userId || null,
      createdAt: new Date('2026-02-25T11:20:00.000Z'),
      updatedAt: new Date('2026-02-27T13:10:00.000Z'),
      eta: new Date('2026-02-27'),
      receivedAt: new Date('2026-02-27T13:10:00.000Z'),
      receivedBy: 'Ayala Fit-out Team',
      proofOfDeliveryUrl: '/uploads/pod/mock-ord-2026-0915.pdf',
      notes: 'Seeded delivered order for Ayala reorder preview.',
      specialInstructions: 'Starter finishing kit for fit-out paint works.',
      itemSpecs: [
        { itemName: 'Paint brush 1"', quantity: 40 },
        { itemName: 'Paint roller 7" w/ handle', quantity: 18 },
        { itemName: 'Palette pair 4"', quantity: 10 },
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
      paymentProofUrl: '/uploads/payments/demo-ord-2026-1102.pdf',
      createdAt: new Date('2026-04-06T09:20:00.000Z'),
      updatedAt: new Date('2026-04-07T10:15:00.000Z'),
      specialInstructions: 'Second batch for renovation touch-ups.',
      itemSpecs: [
        { itemName: 'Baby roller cotton (white)', quantity: 12 },
        { itemName: 'Baby roller cotton 4" w/ handle white', quantity: 12 },
      ],
      delivery: {
        drNumber: 'DR-2026-1102',
        assignedDriverId: driver?.userId || null,
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
      paymentProofUrl: '/uploads/payments/demo-ord-2026-1103.pdf',
      createdAt: new Date('2026-04-04T07:10:00.000Z'),
      updatedAt: new Date('2026-04-08T06:55:00.000Z'),
      specialInstructions: 'Deliver to mall expansion service entrance.',
      itemSpecs: [
        { itemName: 'Seal Tech AW 5 ltrs', quantity: 10 },
        { itemName: 'Spatula 4"', quantity: 18 },
        { itemName: 'Sand paper #100', quantity: 30 },
      ],
      delivery: {
        drNumber: 'DR-2026-1103',
        assignedDriverId: driver?.userId || null,
        status: 'IN_TRANSIT',
        eta: new Date('2026-04-10'),
        createdAt: new Date('2026-04-08T07:00:00.000Z'),
        notes: 'Truck left warehouse; expected same-day arrival.',
      },
    },
    {
      orderNumber: 'ORD-2026-1105',
      client: robinsonsClient,
      project: robinsonsProject,
      createdBy: robinsonsClientUser?.userId || charlene?.userId || null,
      status: 'SHIPPED',
      paymentStatus: 'VERIFIED',
      paymentProofUrl: '/uploads/payments/demo-ord-2026-1105.pdf',
      createdAt: new Date('2026-04-09T08:30:00.000Z'),
      updatedAt: new Date('2026-04-09T11:45:00.000Z'),
      specialInstructions: 'Demo oversized delivery for batching and third-party logistics.',
      itemSpecs: [
        { itemName: 'Paint thinner', quantity: 24 },
        { itemName: 'Acrylon Paint roller 7" w/ handle (White)', quantity: 36 },
      ],
      delivery: {
        drNumber: 'DR-2026-1105-B1',
        assignedDriverId: driver?.userId || null,
        status: 'IN_TRANSIT',
        eta: new Date('2026-04-11'),
        createdAt: new Date('2026-04-09T12:00:00.000Z'),
        notes: 'Demo: oversized load split into batches and tagged for third-party delivery.',
        deliveryMethod: 'LALAMOVE',
        batchNumber: 1,
        batchCount: 2,
        loadKg: 192,
        thirdPartyProvider: 'Lalamove',
        thirdPartyReference: 'LALA-DEMO-1105',
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
        { itemName: 'Palette pair 4"', quantity: 10 },
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
      paymentProofUrl: seededOrder.paymentProofUrl,
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
        deliveryMethod: seededOrder.delivery.deliveryMethod,
        batchNumber: seededOrder.delivery.batchNumber,
        batchCount: seededOrder.delivery.batchCount,
        loadKg: seededOrder.delivery.loadKg,
        thirdPartyProvider: seededOrder.delivery.thirdPartyProvider,
        thirdPartyReference: seededOrder.delivery.thirdPartyReference,
      });
    }
  }

  const seededOcrPoOrders = [
    {
      orderNumber: '25-0178',
      client: ateneoClient,
      project: ateneoProject,
      createdBy: ateneoClientUser?.userId || myra?.userId || null,
      status: 'PROCESSING',
      paymentStatus: 'VERIFIED',
      paymentProofUrl: '/uploads/payments/po-25-0178-real.pdf',
      createdAt: new Date('2026-05-04T14:34:00.000Z'),
      updatedAt: new Date('2026-05-04T14:45:00.000Z'),
      specialInstructions: 'OCR demo order using the real purchase order paper. Expected match: PO 25-0178.',
      itemSpecs: [
        { itemName: 'Epoxy injection', quantity: 10 },
      ],
      delivery: {
        drNumber: 'DR-OCR-25-0178',
        assignedDriverId: driver?.userId || null,
        status: 'PENDING',
        eta: new Date('2026-05-05'),
        createdAt: new Date('2026-05-04T15:00:00.000Z'),
        notes: 'Demo dispatch created from real PO OCR order 25-0178.',
      },
    },
    {
      orderNumber: '25-0497',
      client: robinsonsClient,
      project: robinsonsProject,
      createdBy: robinsonsClientUser?.userId || charlene?.userId || null,
      status: 'PROCESSING',
      paymentStatus: 'VERIFIED',
      paymentProofUrl: '/uploads/payments/po-25-0497-real.pdf',
      createdAt: new Date('2026-05-04T14:53:00.000Z'),
      updatedAt: new Date('2026-05-04T15:06:00.000Z'),
      specialInstructions: 'OCR demo order using the real purchase order paper. Expected match: PO 25-0497.',
      itemSpecs: [
        { itemName: 'Paint brush 1-1/2"', quantity: 2 },
        { itemName: 'Paint brush 2"', quantity: 5 },
        { itemName: 'Paint brush 1"', quantity: 4 },
        { itemName: 'Sand paper #100', quantity: 30 },
        { itemName: 'Sand paper #150', quantity: 30 },
        { itemName: 'Acrylon Paint roller 7" w/ handle (White)', quantity: 30 },
        { itemName: 'Lacquer thinner', quantity: 10 },
        { itemName: 'Paint thinner', quantity: 5 },
      ],
      delivery: {
        drNumber: 'DR-OCR-25-0497',
        assignedDriverId: driver?.userId || null,
        status: 'IN_TRANSIT',
        eta: new Date('2026-05-05'),
        createdAt: new Date('2026-05-04T15:20:00.000Z'),
        notes: 'Demo in-transit route created from real PO OCR order 25-0497.',
        deliveryMethod: 'LALAMOVE',
        batchNumber: 1,
        batchCount: 1,
        loadKg: 58,
        thirdPartyProvider: 'Lalamove',
        thirdPartyReference: 'LALA-OCR-0497',
      },
    },
  ];

  for (const seededOrder of seededOcrPoOrders) {
    const order = await ensureClientOrder({
      orderNumber: seededOrder.orderNumber,
      clientId: seededOrder.client.clientId,
      projectId: seededOrder.project.projectId,
      createdBy: seededOrder.createdBy,
      status: seededOrder.status,
      paymentStatus: seededOrder.paymentStatus,
      paymentProofUrl: seededOrder.paymentProofUrl,
      createdAt: seededOrder.createdAt,
      updatedAt: seededOrder.updatedAt,
      orderDate: seededOrder.createdAt,
      specialInstructions: seededOrder.specialInstructions,
      poMatchStatus: 'ocr-match',
      itemSpecs: seededOrder.itemSpecs,
    });

    await ensureAuditLog({
      userId: seededOrder.createdBy,
      action: 'VERIFY',
      target: 'ClientOrder',
      details: `Demo OCR matched uploaded purchase order ${seededOrder.orderNumber} from real PO paper.`,
      timestamp: seededOrder.updatedAt,
    });

    await ensureNotification({
      userId: admin?.userId || null,
      type: 'PAYMENT_VERIFIED',
      title: 'OCR demo PO matched',
      message: `Real PO paper matched client order ${order.orderNumber}.`,
      link: `/admin/orders?orderId=${order.clientOrderId}`,
      createdAt: seededOrder.updatedAt,
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
        deliveryMethod: seededOrder.delivery.deliveryMethod,
        batchNumber: seededOrder.delivery.batchNumber,
        batchCount: seededOrder.delivery.batchCount,
        loadKg: seededOrder.delivery.loadKg,
        thirdPartyProvider: seededOrder.delivery.thirdPartyProvider,
        thirdPartyReference: seededOrder.delivery.thirdPartyReference,
      });
    }
  }

  const proofUser = ateneoClientUser || robinsonsClientUser || ayalaClientUser;
  if (proofUser) {
    await prisma.user.update({
      where: { userId: proofUser.userId },
      data: { proofDocUrl: '/uploads/proofs/demo-client-proof.pdf' },
    });
  }

  await ensureAuditLog({
    userId: admin?.userId || null,
    action: 'CREATE',
    target: 'ClientOrder',
    details: 'Created demo client order ORD-2026-1101 for presentation flow',
    timestamp: new Date('2026-04-05T08:41:00.000Z'),
  });
  await ensureAuditLog({
    userId: admin?.userId || null,
    action: 'CREATE',
    target: 'PurchaseOrder',
    details: 'Created supplier PO PO-DEMO-2026-004 for demo replenishment',
    timestamp: new Date('2026-04-05T10:30:00.000Z'),
  });
  await ensureAuditLog({
    userId: warehouse?.userId || admin?.userId || null,
    action: 'UPDATE',
    target: 'Stock',
    details: 'Adjusted demo inventory after supplier price increase memo-free update',
    timestamp: new Date('2026-04-06T09:05:00.000Z'),
  });
  await ensureAuditLog({
    userId: driver?.userId || admin?.userId || null,
    action: 'CONFIRM',
    target: 'Delivery',
    details: 'Confirmed delivered demo batch DR-2026-1008',
    timestamp: new Date('2026-04-01T14:05:00.000Z'),
  });

  await ensureNotification({
    userId: admin?.userId || null,
    type: 'AI_ALERT',
    title: 'AI reorder risk ready for demo',
    message: 'Low-stock consumables and Lalamove batch delivery are ready to review in AI Insights.',
    link: '/admin/ai-insights',
    createdAt: new Date('2026-04-09T13:00:00.000Z'),
  });
  await ensureNotification({
    userId: paula?.userId || null,
    type: 'PROJECT_UPDATE',
    title: 'Project assigned to you',
    message: 'You were assigned to project "Robinsons Galleria Expansion".',
    link: `/admin/projects?projectId=${robinsonsProject.projectId}`,
    createdAt: new Date('2026-04-09T13:05:00.000Z'),
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
