import type {
  User,
  InventoryItem,
  StockTransaction,
  Client,
  Project,
  Order,
  MaterialRequest,
  PurchaseOrder,
  Supplier,
  Delivery,
  QuoteRequest,
  Notification,
  AuditLog,
  Activity,
  WarehouseRisk,
  ReorderSuggestion,
  FraudAlert,
} from '@/types';

// ===== USERS =====
export const mockUsers: User[] = [
  {
    id: 'user-1',
    name: 'Emman Uy',
    email: 'emman.uy@impex.com',
    role: 'president',
    avatar: 'EU',
  },
  {
    id: 'user-2',
    name: 'Lita de Leon',
    email: 'lita.deleon@impex.com',
    role: 'admin',
    avatar: 'LD',
  },
  {
    id: 'user-3',
    name: 'Josephine Padilla',
    email: 'josephine.padilla@impex.com',
    role: 'admin',
    avatar: 'JP',
  },
  {
    id: 'user-4',
    name: 'Princess Espino',
    email: 'princess.espino@impex.com',
    role: 'project_manager',
    avatar: 'PE',
  },
  {
    id: 'user-5',
    name: 'Paula Caraig',
    email: 'paula.caraig@impex.com',
    role: 'project_manager',
    avatar: 'PC',
  },
  {
    id: 'user-6',
    name: 'Abdul Usop',
    email: 'abdul.usop@impex.com',
    role: 'project_manager',
    avatar: 'AU',
  },
  {
    id: 'user-7',
    name: 'Jason Mendizabal',
    email: 'jason.mendizabal@impex.com',
    role: 'engineer',
    avatar: 'JM',
  },
  {
    id: 'user-8',
    name: 'Myra Flores',
    email: 'myra.flores@impex.com',
    role: 'sales_agent',
    avatar: 'MF',
  },
  {
    id: 'user-9',
    name: 'Letty Cervantes',
    email: 'letty.cervantes@impex.com',
    role: 'sales_agent',
    avatar: 'LC',
  },
  {
    id: 'user-10',
    name: 'Connie Celestial',
    email: 'connie.celestial@impex.com',
    role: 'sales_agent',
    avatar: 'CC',
  },
  {
    id: 'user-11',
    name: 'Charlene Biza',
    email: 'charlene.biza@impex.com',
    role: 'sales_agent',
    avatar: 'CB',
  },
  {
    id: 'user-12',
    name: 'Enar Valencia',
    email: 'enar.valencia@impex.com',
    role: 'sales_agent',
    avatar: 'EV',
  },
  {
    id: 'user-13',
    name: 'Kat Cacabilos',
    email: 'kat.cacabilos@impex.com',
    role: 'paint_chemist',
    avatar: 'KC',
  },
  {
    id: 'user-14',
    name: 'Danilo Benosa',
    email: 'danilo.benosa@impex.com',
    role: 'warehouse_staff',
    avatar: 'DB',
  },
  {
    id: 'user-15',
    name: 'Robel Tabora',
    email: 'robel.tabora@impex.com',
    role: 'warehouse_staff',
    avatar: 'RT',
  },
  {
    id: 'user-16',
    name: 'Carlos Martinez',
    email: 'carlos.martinez@impex.com',
    role: 'delivery_guy',
    avatar: 'CM',
  },
];

// ===== CLIENTS =====
export const mockClients: Client[] = [
  {
    id: 'client-1',
    name: 'Ateneo CTC',
    contactPerson: 'Mark Villanueva',
    email: 'mark@ateneo.edu',
    phone: '+63 917 123 4567',
    address: 'Katipunan Ave, Quezon City',
    tin: '123-456-789-00000',
  },
  {
    id: 'client-2',
    name: 'Robinsons Land',
    contactPerson: 'Sarah Chen',
    email: 'sarah@robinsonsland.com',
    phone: '+63 917 234 5678',
    address: 'Ortigas Center, Pasig City',
    tin: '234-567-890-00000',
  },
  {
    id: 'client-3',
    name: 'TikTok Philippines',
    contactPerson: 'James Tan',
    email: 'james@tiktok.com',
    phone: '+63 917 345 6789',
    address: 'BGC, Taguig City',
    tin: '345-678-901-00000',
  },
  {
    id: 'client-4',
    name: 'De La Salle University',
    contactPerson: 'Maria Garcia',
    email: 'maria@dlsu.edu.ph',
    phone: '+63 917 456 7890',
    address: 'Taft Ave, Manila',
    tin: '456-789-012-00000',
  },
];

// ===== SUPPLIERS =====
export const mockSuppliers: Supplier[] = [
  {
    id: 'supplier-1',
    name: 'Paco-Asia Industrial Supply',
    contactPerson: 'Antonio Cruz',
    email: 'sales@pacoasia.com',
    phone: '+63 2 8123 4567',
    address: '123 Industrial Ave, Makati City',
    tin: '100-191-563-00000',
  },
  {
    id: 'supplier-2',
    name: 'Metro Hardware & Tools',
    contactPerson: 'Roberto Santos',
    email: 'orders@metrohardware.ph',
    phone: '+63 2 8234 5678',
    address: '456 Hardware St, Manila',
    tin: '200-292-674-00000',
  },
  {
    id: 'supplier-3',
    name: 'National Paint Corporation',
    contactPerson: 'Elena Gonzales',
    email: 'supply@nationalpaint.ph',
    phone: '+63 2 8345 6789',
    address: '789 Paint Lane, Quezon City',
    tin: '300-393-785-00000',
  },
];

// ===== INVENTORY ITEMS =====
export const mockInventory: InventoryItem[] = [
  { id: 'item-1', name: 'Paint Brush 1"', category: 'Paint Supplies', unit: 'pc', qtyOnHand: 245, unitPrice: 180, status: 'in-stock', minStock: 50 },
  { id: 'item-2', name: 'Paint Brush 2"', category: 'Paint Supplies', unit: 'pc', qtyOnHand: 189, unitPrice: 220, status: 'in-stock', minStock: 50 },
  { id: 'item-3', name: 'Paint Brush 3"', category: 'Paint Supplies', unit: 'pc', qtyOnHand: 12, unitPrice: 280, status: 'low-stock', minStock: 30 },
  { id: 'item-4', name: 'Sandpaper #100', category: 'Abrasives', unit: 'sheet', qtyOnHand: 523, unitPrice: 18, status: 'in-stock', minStock: 100 },
  { id: 'item-5', name: 'Sandpaper #150', category: 'Abrasives', unit: 'sheet', qtyOnHand: 412, unitPrice: 18, status: 'in-stock', minStock: 100 },
  { id: 'item-6', name: 'Sandpaper #220', category: 'Abrasives', unit: 'sheet', qtyOnHand: 8, unitPrice: 20, status: 'low-stock', minStock: 100 },
  { id: 'item-7', name: 'Plastic Cover', category: 'Protective', unit: 'roll', qtyOnHand: 79, unitPrice: 79, status: 'in-stock', minStock: 20 },
  { id: 'item-8', name: 'Furniture Cover', category: 'Protective', unit: 'pc', qtyOnHand: 156, unitPrice: 79, status: 'in-stock', minStock: 30 },
  { id: 'item-9', name: 'Sticky Mates', category: 'Adhesives', unit: 'pc', qtyOnHand: 234, unitPrice: 229.05, status: 'in-stock', minStock: 50 },
  { id: 'item-10', name: 'Masking Tape 1"', category: 'Tapes', unit: 'roll', qtyOnHand: 0, unitPrice: 45, status: 'out-of-stock', minStock: 100 },
  { id: 'item-11', name: 'Masking Tape 2"', category: 'Tapes', unit: 'roll', qtyOnHand: 345, unitPrice: 85, status: 'in-stock', minStock: 100 },
  { id: 'item-12', name: 'Roller Brush 4"', category: 'Paint Supplies', unit: 'pc', qtyOnHand: 67, unitPrice: 150, status: 'in-stock', minStock: 30 },
  { id: 'item-13', name: 'Roller Brush 7"', category: 'Paint Supplies', unit: 'pc', qtyOnHand: 45, unitPrice: 220, status: 'in-stock', minStock: 30 },
  { id: 'item-14', name: 'Paint Thinner', category: 'Chemicals', unit: 'liter', qtyOnHand: 3, unitPrice: 180, status: 'low-stock', minStock: 20 },
  { id: 'item-15', name: 'Wood Filler', category: 'Fillers', unit: 'kg', qtyOnHand: 89, unitPrice: 350, status: 'in-stock', minStock: 20 },
  { id: 'item-16', name: 'Putty Knife 2"', category: 'Tools', unit: 'pc', qtyOnHand: 123, unitPrice: 95, status: 'in-stock', minStock: 30 },
  { id: 'item-17', name: 'Putty Knife 4"', category: 'Tools', unit: 'pc', qtyOnHand: 5, unitPrice: 125, status: 'low-stock', minStock: 30 },
  { id: 'item-18', name: 'Drop Cloth', category: 'Protective', unit: 'pc', qtyOnHand: 234, unitPrice: 250, status: 'in-stock', minStock: 50 },
  { id: 'item-19', name: 'Primer (White)', category: 'Paint', unit: 'gallon', qtyOnHand: 56, unitPrice: 850, status: 'in-stock', minStock: 20 },
  { id: 'item-20', name: 'Enamel Paint (White)', category: 'Paint', unit: 'gallon', qtyOnHand: 78, unitPrice: 1200, status: 'in-stock', minStock: 20 },
  { id: 'item-21', name: 'Latex Paint (White)', category: 'Paint', unit: 'gallon', qtyOnHand: 145, unitPrice: 950, status: 'in-stock', minStock: 30 },
  { id: 'item-22', name: 'Steel Wool', category: 'Abrasives', unit: 'pack', qtyOnHand: 67, unitPrice: 45, status: 'in-stock', minStock: 30 },
  { id: 'item-23', name: 'Wire Brush', category: 'Tools', unit: 'pc', qtyOnHand: 89, unitPrice: 75, status: 'in-stock', minStock: 30 },
];

// ===== PROJECTS =====
export const mockProjects: Project[] = [
  { id: 'proj-1', name: 'Ateneo CTC Building Renovation', clientId: 'client-1', clientName: 'Ateneo CTC', status: 'active', startDate: '2025-01-15' },
  { id: 'proj-2', name: 'Robinsons Galleria Expansion', clientId: 'client-2', clientName: 'Robinsons Land', status: 'active', startDate: '2025-01-20' },
  { id: 'proj-3', name: 'TikTok Office Fitout', clientId: 'client-3', clientName: 'TikTok Philippines', status: 'active', startDate: '2025-02-01' },
  { id: 'proj-4', name: 'DLSU Library Restoration', clientId: 'client-4', clientName: 'De La Salle University', status: 'active', startDate: '2024-12-01' },
  { id: 'proj-5', name: 'Ateneo UD Sports Complex', clientId: 'client-1', clientName: 'Ateneo CTC', status: 'on-hold', startDate: '2024-11-15' },
];

// ===== STOCK TRANSACTIONS =====
export const mockTransactions: StockTransaction[] = [
  { id: 'txn-1', itemId: 'item-1', date: '2025-02-01', type: 'purchase', qtyChange: 100, newBalance: 245, userId: 'user-1', userName: 'Josephine Santos', notes: 'PO-2025-0045' },
  { id: 'txn-2', itemId: 'item-1', date: '2025-01-28', type: 'issue', project: 'Ateneo CTC Building Renovation', qtyChange: -25, newBalance: 145, userId: 'user-3', userName: 'Phine Reyes' },
  { id: 'txn-3', itemId: 'item-1', date: '2025-01-25', type: 'issue', project: 'TikTok Office Fitout', qtyChange: -30, newBalance: 170, userId: 'user-3', userName: 'Phine Reyes' },
  { id: 'txn-4', itemId: 'item-1', date: '2025-01-20', type: 'purchase', qtyChange: 50, newBalance: 200, userId: 'user-1', userName: 'Josephine Santos', notes: 'PO-2025-0032' },
  { id: 'txn-5', itemId: 'item-9', date: '2025-02-02', type: 'issue', project: 'Robinsons Galleria Expansion', qtyChange: -15, newBalance: 234, userId: 'user-3', userName: 'Phine Reyes' },
];

// ===== ORDERS =====
export const mockOrders: Order[] = [
  {
    id: 'order-1',
    orderNumber: 'ORD-2025-0089',
    clientId: 'client-1',
    clientName: 'Ateneo CTC',
    projectId: 'proj-1',
    projectName: 'Ateneo CTC Building Renovation',
    items: [
      { itemId: 'item-1', itemName: 'Paint Brush 1"', unit: 'pc', quantity: 50, unitPrice: 180, amount: 9000 },
      { itemId: 'item-4', itemName: 'Sandpaper #100', unit: 'sheet', quantity: 100, unitPrice: 18, amount: 1800 },
      { itemId: 'item-9', itemName: 'Sticky Mates', unit: 'pc', quantity: 20, unitPrice: 229.05, amount: 4581 },
    ],
    subtotal: 15381,
    vat: 1845.72,
    total: 17226.72,
    status: 'delivered',
    paymentStatus: 'paid',
    createdAt: '2025-01-15T09:00:00Z',
    updatedAt: '2025-01-20T14:00:00Z',
    createdBy: 'user-4',
    chequeVerification: 'genuine',
  },
  {
    id: 'order-2',
    orderNumber: 'ORD-2025-0102',
    clientId: 'client-3',
    clientName: 'TikTok Philippines',
    projectId: 'proj-3',
    projectName: 'TikTok Office Fitout',
    items: [
      { itemId: 'item-7', itemName: 'Plastic Cover', unit: 'roll', quantity: 5, unitPrice: 79, amount: 395 },
      { itemId: 'item-8', itemName: 'Furniture Cover', unit: 'pc', quantity: 3, unitPrice: 79, amount: 237 },
      { itemId: 'item-11', itemName: 'Masking Tape 2"', unit: 'roll', quantity: 10, unitPrice: 85, amount: 850 },
    ],
    subtotal: 1482,
    vat: 177.84,
    total: 1659.84,
    status: 'processing',
    paymentStatus: 'pending',
    createdAt: '2025-02-01T10:30:00Z',
    updatedAt: '2025-02-01T10:30:00Z',
    createdBy: 'user-6',
  },
  {
    id: 'order-3',
    orderNumber: 'ORD-2025-0098',
    clientId: 'client-1',
    clientName: 'Ateneo CTC',
    projectId: 'proj-1',
    projectName: 'Ateneo CTC Building Renovation',
    items: [
      { itemId: 'item-19', itemName: 'Primer (White)', unit: 'gallon', quantity: 10, unitPrice: 850, amount: 8500 },
      { itemId: 'item-21', itemName: 'Latex Paint (White)', unit: 'gallon', quantity: 20, unitPrice: 950, amount: 19000 },
    ],
    subtotal: 27500,
    vat: 3300,
    total: 30800,
    status: 'shipped',
    paymentStatus: 'verified',
    createdAt: '2025-01-28T08:00:00Z',
    updatedAt: '2025-02-02T09:00:00Z',
    createdBy: 'user-4',
    chequeVerification: 'genuine',
  },
  {
    id: 'order-4',
    orderNumber: 'ORD-2025-0115',
    clientId: 'client-2',
    clientName: 'Robinsons Land',
    projectId: 'proj-2',
    projectName: 'Robinsons Galleria Expansion',
    items: [
      { itemId: 'item-12', itemName: 'Roller Brush 4"', unit: 'pc', quantity: 25, unitPrice: 150, amount: 3750 },
      { itemId: 'item-13', itemName: 'Roller Brush 7"', unit: 'pc', quantity: 15, unitPrice: 220, amount: 3300 },
      { itemId: 'item-18', itemName: 'Drop Cloth', unit: 'pc', quantity: 30, unitPrice: 250, amount: 7500 },
    ],
    subtotal: 14550,
    vat: 1746,
    total: 16296,
    status: 'pending',
    paymentStatus: 'pending',
    createdAt: '2025-02-03T07:00:00Z',
    updatedAt: '2025-02-03T07:00:00Z',
    createdBy: 'user-5',
  },
];

// ===== MATERIAL REQUESTS =====
export const mockMaterialRequests: MaterialRequest[] = [
  {
    id: 'req-1',
    requestNumber: 'REQ-2025-1024',
    projectId: 'proj-1',
    projectName: 'Ateneo CTC Building Renovation',
    requestedBy: 'Phine Reyes',
    requestedById: 'user-3',
    date: '2025-02-02',
    items: [
      { itemId: 'item-3', itemName: 'Paint Brush 3"', unit: 'pc', quantity: 20, unitPrice: 280, amount: 5600 },
      { itemId: 'item-14', itemName: 'Paint Thinner', unit: 'liter', quantity: 10, unitPrice: 180, amount: 1800 },
    ],
    purpose: 'Additional supplies for Phase 2 interior painting',
    urgency: 'high',
    status: 'pending',
    estimatedCost: 7400,
  },
  {
    id: 'req-2',
    requestNumber: 'REQ-2025-1023',
    projectId: 'proj-3',
    projectName: 'TikTok Office Fitout',
    requestedBy: 'Phine Reyes',
    requestedById: 'user-3',
    date: '2025-02-01',
    items: [
      { itemId: 'item-15', itemName: 'Wood Filler', unit: 'kg', quantity: 5, unitPrice: 350, amount: 1750 },
      { itemId: 'item-16', itemName: 'Putty Knife 2"', unit: 'pc', quantity: 10, unitPrice: 95, amount: 950 },
    ],
    purpose: 'Wall preparation and repairs',
    urgency: 'normal',
    status: 'approved',
    estimatedCost: 2700,
    approvedBy: 'Josephine Santos',
    approvedAt: '2025-02-01T14:00:00Z',
  },
  {
    id: 'req-3',
    requestNumber: 'REQ-2025-1022',
    projectId: 'proj-2',
    projectName: 'Robinsons Galleria Expansion',
    requestedBy: 'Phine Reyes',
    requestedById: 'user-3',
    date: '2025-01-30',
    items: [
      { itemId: 'item-10', itemName: 'Masking Tape 1"', unit: 'roll', quantity: 50, unitPrice: 45, amount: 2250 },
    ],
    purpose: 'Detailing and edge work',
    urgency: 'critical',
    status: 'pending',
    estimatedCost: 2250,
    remarks: 'Item currently out of stock - need to order from supplier',
  },
];

// ===== PURCHASE ORDERS =====
export const mockPurchaseOrders: PurchaseOrder[] = [
  {
    id: 'po-1',
    poNumber: 'PO-2025-0045',
    supplierId: 'supplier-1',
    supplierName: 'Paco-Asia Industrial Supply',
    date: '2025-01-28',
    terms: 'Net 30',
    items: [
      { itemId: 'item-1', itemName: 'Paint Brush 1"', unit: 'pc', quantity: 100, unitPrice: 150, amount: 15000 },
      { itemId: 'item-2', itemName: 'Paint Brush 2"', unit: 'pc', quantity: 50, unitPrice: 180, amount: 9000 },
    ],
    subtotal: 24000,
    vat: 2880,
    total: 26880,
    status: 'received',
    approvedBy: 'Lita De Leon',
    approvedById: 'user-2',
  },
  {
    id: 'po-2',
    poNumber: 'PO-2025-0048',
    supplierId: 'supplier-3',
    supplierName: 'National Paint Corporation',
    date: '2025-02-01',
    terms: 'COD',
    items: [
      { itemId: 'item-19', itemName: 'Primer (White)', unit: 'gallon', quantity: 50, unitPrice: 750, amount: 37500 },
      { itemId: 'item-20', itemName: 'Enamel Paint (White)', unit: 'gallon', quantity: 30, unitPrice: 1050, amount: 31500 },
    ],
    subtotal: 69000,
    vat: 8280,
    total: 77280,
    status: 'pending',
    approvedBy: 'Lita De Leon',
    approvedById: 'user-2',
  },
];

// ===== DELIVERIES =====
export const mockDeliveries: Delivery[] = [
  {
    id: 'del-1',
    drNumber: 'DR-2025-0234',
    orderId: 'order-1',
    orderNumber: 'ORD-2025-0089',
    clientId: 'client-1',
    clientName: 'Ateneo CTC',
    projectName: 'Ateneo CTC Building Renovation',
    items: [
      { itemId: 'item-1', itemName: 'Paint Brush 1"', unit: 'pc', quantity: 50, unitPrice: 180, amount: 9000 },
      { itemId: 'item-4', itemName: 'Sandpaper #100', unit: 'sheet', quantity: 100, unitPrice: 18, amount: 1800 },
      { itemId: 'item-9', itemName: 'Sticky Mates', unit: 'pc', quantity: 20, unitPrice: 229.05, amount: 4581 },
    ],
    status: 'delivered',
    eta: '2025-01-20',
    issuedBy: 'Josephine Santos',
    issuedAt: '2025-01-18T08:00:00Z',
    receivedBy: 'Mark Villanueva',
    receivedAt: '2025-01-20T14:00:00Z',
  },
  {
    id: 'del-2',
    drNumber: 'DR-2025-0245',
    orderId: 'order-3',
    orderNumber: 'ORD-2025-0098',
    clientId: 'client-1',
    clientName: 'Ateneo CTC',
    projectName: 'Ateneo CTC Building Renovation',
    items: [
      { itemId: 'item-19', itemName: 'Primer (White)', unit: 'gallon', quantity: 10, unitPrice: 850, amount: 8500 },
      { itemId: 'item-21', itemName: 'Latex Paint (White)', unit: 'gallon', quantity: 20, unitPrice: 950, amount: 19000 },
    ],
    status: 'in-transit',
    eta: '2025-02-04',
    issuedBy: 'Josephine Santos',
    issuedAt: '2025-02-02T09:00:00Z',
  },
  {
    id: 'del-3',
    drNumber: 'DR-2025-0248',
    orderId: 'order-2',
    orderNumber: 'ORD-2025-0102',
    clientId: 'client-3',
    clientName: 'TikTok Philippines',
    projectName: 'TikTok Office Fitout',
    items: [
      { itemId: 'item-7', itemName: 'Plastic Cover', unit: 'roll', quantity: 5, unitPrice: 79, amount: 395 },
      { itemId: 'item-8', itemName: 'Furniture Cover', unit: 'pc', quantity: 3, unitPrice: 79, amount: 237 },
      { itemId: 'item-11', itemName: 'Masking Tape 2"', unit: 'roll', quantity: 10, unitPrice: 85, amount: 850 },
    ],
    status: 'pending',
    eta: '2025-02-05',
    issuedBy: 'Josephine Santos',
    issuedAt: '2025-02-03T10:00:00Z',
  },
];

// ===== QUOTE REQUESTS =====
export const mockQuoteRequests: QuoteRequest[] = [
  {
    id: 'quote-1',
    clientId: 'client-2',
    clientName: 'Robinsons Land',
    projectName: 'Robinsons Galleria Expansion',
    items: [
      { name: 'Industrial Paint (Custom Color)', quantity: 100, notes: 'Need Robinsons brand red' },
      { name: 'Heavy Duty Primer', quantity: 50 },
    ],
    customRequirements: 'Need bulk discount for large order. Delivery to multiple sites.',
    status: 'pending',
    createdAt: '2025-02-02T11:00:00Z',
  },
  {
    id: 'quote-2',
    clientId: 'client-4',
    clientName: 'De La Salle University',
    projectName: 'DLSU Library Restoration',
    items: [
      { name: 'Antique Wood Finish', quantity: 20, notes: 'Heritage restoration grade' },
    ],
    customRequirements: 'Special heritage-grade materials required for restoration project.',
    status: 'responded',
    createdAt: '2025-01-28T09:00:00Z',
    respondedAt: '2025-01-29T15:00:00Z',
    quotedAmount: 45000,
  },
];

// ===== NOTIFICATIONS =====
export const mockNotifications: Notification[] = [
  { id: 'notif-1', type: 'low-stock', title: 'Low Stock Alert', message: 'Paint Brush 3" is running low (12 pcs remaining)', read: false, createdAt: '2025-02-03T08:00:00Z', link: '/inventory' },
  { id: 'notif-2', type: 'request-approval', title: 'Request Pending', message: 'REQ-2025-1024 awaits your approval', read: false, createdAt: '2025-02-02T14:00:00Z', link: '/requests' },
  { id: 'notif-3', type: 'delivery-update', title: 'Delivery In Transit', message: 'DR-2025-0245 is on the way to Ateneo CTC', read: false, createdAt: '2025-02-02T09:30:00Z', link: '/deliveries' },
  { id: 'notif-4', type: 'payment-verified', title: 'Payment Verified', message: 'Cheque for ORD-2025-0089 verified as genuine', read: true, createdAt: '2025-01-20T15:00:00Z', link: '/orders' },
  { id: 'notif-5', type: 'order-approval', title: 'New Order', message: 'Robinsons Land placed order ORD-2025-0115', read: false, createdAt: '2025-02-03T07:05:00Z', link: '/orders' },
  { id: 'notif-6', type: 'low-stock', title: 'Out of Stock', message: 'Masking Tape 1" is out of stock', read: true, createdAt: '2025-02-01T10:00:00Z', link: '/inventory' },
  { id: 'notif-7', type: 'ai-alert', title: 'Reorder Suggestion', message: 'AI recommends reordering Paint Thinner soon', read: false, createdAt: '2025-02-03T06:00:00Z', link: '/ai-insights' },
];

// ===== AUDIT LOGS =====
export const mockAuditLogs: AuditLog[] = [
  { id: 'log-1', timestamp: '2025-02-03T08:15:00Z', userId: 'user-5', userName: 'Sarah Chen', action: 'CREATE', target: 'Order', details: 'Created order ORD-2025-0115' },
  { id: 'log-2', timestamp: '2025-02-02T14:30:00Z', userId: 'user-3', userName: 'Phine Reyes', action: 'CREATE', target: 'Material Request', details: 'Submitted REQ-2025-1024' },
  { id: 'log-3', timestamp: '2025-02-02T09:00:00Z', userId: 'user-1', userName: 'Josephine Santos', action: 'UPDATE', target: 'Delivery', details: 'Dispatched DR-2025-0245' },
  { id: 'log-4', timestamp: '2025-02-01T15:00:00Z', userId: 'user-1', userName: 'Josephine Santos', action: 'APPROVE', target: 'Material Request', details: 'Approved REQ-2025-1023' },
  { id: 'log-5', timestamp: '2025-02-01T10:45:00Z', userId: 'user-6', userName: 'James Tan', action: 'CREATE', target: 'Order', details: 'Created order ORD-2025-0102' },
  { id: 'log-6', timestamp: '2025-01-28T11:00:00Z', userId: 'user-2', userName: 'Lita De Leon', action: 'APPROVE', target: 'Purchase Order', details: 'Approved PO-2025-0045' },
  { id: 'log-7', timestamp: '2025-01-20T14:00:00Z', userId: 'user-4', userName: 'Mark Villanueva', action: 'CONFIRM', target: 'Delivery', details: 'Confirmed receipt of DR-2025-0234' },
];

// ===== ACTIVITY FEED =====
export const mockActivities: Activity[] = [
  { id: 'act-1', type: 'order', message: 'Order ORD-2025-0115 placed by Robinsons Land', timestamp: '2025-02-03T08:15:00Z' },
  { id: 'act-2', type: 'inventory', message: 'Low stock alert: Paint Brush 3" (12 pcs)', timestamp: '2025-02-03T08:00:00Z' },
  { id: 'act-3', type: 'request', message: 'REQ-2025-1024 submitted by Phine Reyes', timestamp: '2025-02-02T14:30:00Z' },
  { id: 'act-4', type: 'delivery', message: 'DR-2025-0245 dispatched to Ateneo CTC', timestamp: '2025-02-02T09:00:00Z' },
  { id: 'act-5', type: 'request', message: 'REQ-2025-1023 approved by Josephine', timestamp: '2025-02-01T15:00:00Z' },
  { id: 'act-6', type: 'payment', message: 'Cheque verified for ORD-2025-0089', timestamp: '2025-01-20T15:00:00Z' },
  { id: 'act-7', type: 'delivery', message: 'DR-2025-0234 delivered to Ateneo CTC', timestamp: '2025-01-20T14:00:00Z' },
];

// ===== AI INSIGHTS =====
export const mockWarehouseRisks: WarehouseRisk[] = [
  { itemId: 'item-10', itemName: 'Masking Tape 1"', riskLevel: 'critical', reason: 'Out of stock with pending requests', recommendedAction: 'Create urgent PO' },
  { itemId: 'item-14', itemName: 'Paint Thinner', riskLevel: 'high', reason: 'Only 3 units, high usage rate', recommendedAction: 'Reorder within 2 days' },
  { itemId: 'item-3', itemName: 'Paint Brush 3"', riskLevel: 'high', reason: 'Below minimum stock level', recommendedAction: 'Reorder soon' },
  { itemId: 'item-6', itemName: 'Sandpaper #220', riskLevel: 'medium', reason: 'Low stock, moderate usage', recommendedAction: 'Monitor closely' },
  { itemId: 'item-17', itemName: 'Putty Knife 4"', riskLevel: 'medium', reason: 'Below minimum threshold', recommendedAction: 'Include in next PO' },
];

export const mockReorderSuggestions: ReorderSuggestion[] = [
  { itemId: 'item-10', itemName: 'Masking Tape 1"', currentQty: 0, suggestedQty: 200, estimatedCost: 9000 },
  { itemId: 'item-14', itemName: 'Paint Thinner', currentQty: 3, suggestedQty: 30, estimatedCost: 5400 },
  { itemId: 'item-3', itemName: 'Paint Brush 3"', currentQty: 12, suggestedQty: 50, estimatedCost: 14000 },
  { itemId: 'item-6', itemName: 'Sandpaper #220', currentQty: 8, suggestedQty: 100, estimatedCost: 2000 },
];

export const mockFraudAlerts: FraudAlert[] = [
  { id: 'fraud-1', orderId: 'order-1', orderNumber: 'ORD-2025-0089', severity: 'low', message: 'Cheque verified - Genuine', timestamp: '2025-01-20T15:00:00Z' },
  { id: 'fraud-2', orderId: 'order-3', orderNumber: 'ORD-2025-0098', severity: 'low', message: 'Cheque verified - Genuine', timestamp: '2025-02-01T11:00:00Z' },
];

// ===== COMPANY INFO =====
export const companyInfo = {
  name: 'Impex Engineering and Industrial Supply',
  address: '6959 Washington St., Pio Del Pilar, Makati City',
  tin: '100-191-563-00000',
  phone: '+63 2 8123 4567',
  email: 'sales@impex.ph',
  website: 'www.impex.ph',
};

// ===== CATEGORIES =====
export const categories = [
  'Paint Supplies',
  'Abrasives',
  'Protective',
  'Adhesives',
  'Tapes',
  'Chemicals',
  'Fillers',
  'Tools',
  'Paint',
];
