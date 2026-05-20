// User & Authentication Types
export type UserRole =
  | 'president'
  | 'admin'
  | 'project_manager'
  | 'sales_agent'
  | 'engineer'
  | 'paint_chemist'
  | 'warehouse_staff'
  | 'delivery_guy'
  | 'driver'
  | 'receiver'
  | 'project_in_charge'
  | 'client';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  roles?: UserRole[];
  companyName?: string;
  clientId?: string;
  clientVisibilityScope?: 'company' | 'user';
  avatar?: string;
  avatarUrl?: string;
  phone?: string;
  status?: string;
  proofDocUrl?: string | null;
  emailVerified?: boolean;
}

// Inventory Types
export type ItemStatus = 'in-stock' | 'low-stock' | 'out-of-stock';

export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  unit: string;
  qtyOnHand: number;
  unitPrice: number;
  status: ItemStatus;
  minStock: number;
  shelfLifeDays?: number;
  description?: string;
}

export interface StockTransaction {
  id: string;
  itemId: string;
  date: string;
  type: 'purchase' | 'issue' | 'return' | 'adjustment';
  project?: string;
  supplierId?: string | null;
  supplierName?: string | null;
  projectName?: string | null;
  qtyChange: number;
  newBalance: number;
  userId: string;
  userName: string;
  notes?: string;
}

// Client & Project Types
export interface Client {
  id: string;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  tin?: string;
  visibilityScope?: 'company' | 'user';
}

export interface Project {
  id: string;
  name: string;
  clientId: string;
  clientName: string;
  assignedPmId?: string | null;
  assignedPmName?: string | null;
  location?: string | null;
  status: 'pending' | 'rejected' | 'active' | 'completed' | 'on-hold';
  startDate: string;
  endDate?: string;
  rejectionReason?: string | null;
}

// Order Types
export type OrderStatus =
  | 'pending'
  | 'approved'
  | 'processing'
  | 'ready-for-delivery'
  | 'delivered'
  | 'cancelled';
export type PaymentStatus = 'pending' | 'verified' | 'paid' | 'failed';

export interface OrderItem {
  itemId: string;
  itemName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  notes?: string | null;
}

export interface Order {
  id: string;
  orderNumber: string;
  clientId: string;
  clientName: string;
  projectId?: string;
  projectName?: string;
  assignedSalesAgentId?: string | null;
  assignedSalesAgentName?: string | null;
  items: OrderItem[];
  subtotal: number;
  vat: number;
  total: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  specialInstructions?: string;
  cancelReason?: string | null;
  chequeImage?: string;
  chequeVerification?: 'pending' | 'genuine' | 'fraud';
  poDocumentUrl?: string;
  poMatchStatus?: 'pending' | 'genuine' | 'fraud';
}

// Material Request Types
export type RequestStatus = 'pending' | 'pm_approved' | 'approved' | 'rejected' | 'fulfilled';
export type UrgencyLevel = 'low' | 'normal' | 'high' | 'critical';

export interface MaterialRequest {
  id: string;
  requestNumber: string;
  projectId: string;
  projectName: string;
  requestedBy: string;
  requestedById: string;
  assignedProjectManagerId?: string | null;
  assignedProjectManagerName?: string | null;
  date: string;
  items: OrderItem[];
  purpose: string;
  urgency: UrgencyLevel;
  status: RequestStatus;
  estimatedCost: number;
  approvedBy?: string;
  approvedById?: string | null;
  approvedAt?: string;
  remarks?: string;
}

// Purchase Order Types
export type POStatus = 'draft' | 'pending' | 'approved' | 'ordered' | 'received' | 'paid';

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  date: string;
  terms: string;
  items: OrderItem[];
  subtotal: number;
  vat: number;
  total: number;
  status: POStatus;
  approvedBy?: string;
  approvedById?: string;
  remarks?: string;
}

export interface Supplier {
  id: string;
  name: string;
  contactPerson: string;
  email?: string;
  phone: string;
  address: string;
  tin?: string;
  country: string;
}

// Delivery Types
export type DeliveryStatus =
  | 'pending'
  | 'in-transit'
  | 'delivered'
  | 'delayed'
  | 'return-pending'
  | 'return-rejected'
  | 'returned';

export interface Delivery {
  id: string;
  drNumber: string;
  orderId: string;
  orderNumber: string;
  clientId: string;
  clientName: string;
  clientContactPerson?: string | null;
  projectName?: string;
  items: OrderItem[];
  status: DeliveryStatus;
  eta: string;
  issuedBy: string;
  issuedAt: string;
  receivedBy?: string;
  receiverName?: string | null;
  receiverAddress?: string | null;
  receiverContactNumber?: string | null;
  receivedAt?: string;
  proofOfDelivery?: string;
  notes?: string;
  returnRejectionReason?: string | null;
  assignedDeliveryGuyId?: string | null;
  deliveryGuyName?: string | null;
  deliveryMethod?: 'TRUCK' | 'MOTORCYCLE' | 'LALAMOVE' | 'THIRD_PARTY' | string;
  batchNumber?: number;
  batchCount?: number;
  loadKg?: number | null;
  thirdPartyProvider?: string | null;
  thirdPartyReference?: string | null;
}

// Quote Request Types
export interface QuoteRequest {
  id: string;
  clientId: string;
  clientName: string;
  projectName?: string;
  items: { name: string; quantity: number; notes?: string }[];
  customRequirements?: string;
  status: 'pending' | 'responded' | 'accepted' | 'declined';
  createdAt: string;
  respondedAt?: string;
  quotedAmount?: number;
}

export interface ProjectFormLine {
  qty: number;
  unit: string;
  description: string;
}

export interface ProjectForm {
  id: string;
  projectId: string;
  projectName: string;
  company: string;
  address: string;
  oRefNumber: string;
  poNumber: string;
  area: string;
  thortexProducts: ProjectFormLine[];
  consumableMaterials: ProjectFormLine[];
  toolsEquipmentOthers: ProjectFormLine[];
  requestedBy: string;
  checkedBy: string;
  subtotal: number;
  vat: number;
  totalCost: number;
  createdBy: string;
  createdAt: string;
}

// Notification Types
export type NotificationType = 
  | 'low-stock' 
  | 'order-approval' 
  | 'delivery-update' 
  | 'payment-verified' 
  | 'request-approval'
  | 'quote-response'
  | 'project-update'
  | 'ai-alert';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  link?: string;
  userId?: string;
}

export interface ChatUser {
  id: string;
  name: string;
  email: string;
  role: UserRole | string;
  roles?: (UserRole | string)[];
}

export interface ChatMessage {
  id: string;
  threadId: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
}

export interface ChatThread {
  id: string;
  title: string;
  type: string;
  participants: ChatUser[];
  otherParticipants: ChatUser[];
  unreadCount: number;
  lastMessage?: ChatMessage | null;
  updatedAt: string;
  createdAt: string;
}

export interface PaymentTransaction {
  id: string;
  direction: 'client-to-office' | 'office-to-supplier' | string;
  method: string;
  status: 'pending' | 'received' | 'paid' | 'overdue' | 'cancelled' | string;
  amount: number;
  creditDays: number;
  dueDate?: string | null;
  paidAt?: string | null;
  referenceNumber?: string | null;
  notes?: string | null;
  clientId?: string | null;
  clientName?: string | null;
  clientOrderId?: string | null;
  clientOrderNumber?: string | null;
  proofUrl?: string | null;
  supplierId?: string | null;
  supplierName?: string | null;
  supplierOrderId?: string | null;
  supplierPoNumber?: string | null;
  createdByName?: string | null;
  createdAt: string;
  updatedAt: string;
}

// Audit Log Types
export interface AuditLog {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  action: string;
  target: string;
  details: string;
}

// Activity Feed Types
export interface Activity {
  id: string;
  type: 'request' | 'order' | 'delivery' | 'inventory' | 'payment' | 'system';
  message: string;
  timestamp: string;
  icon?: string;
}

// AI Insights Types
export interface WarehouseRisk {
  itemId: string;
  itemName: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  reason: string;
  recommendedAction: string;
  shelfLifeDays?: number;
  daysInStock?: number;
  daysToExpiry?: number;
}

export interface ReorderSuggestion {
  itemId: string;
  itemName: string;
  currentQty: number;
  suggestedQty: number;
  estimatedCost: number;
}

export interface FraudAlert {
  id: string;
  orderId: string;
  orderNumber: string;
  severity: 'low' | 'medium' | 'high';
  message: string;
  timestamp: string;
  chequeImage?: string;
  poDocumentUrl?: string;
}

export interface AiRecommendation {
  title: string;
  message: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  action: string;
}

export interface AiSummary {
  enabled: boolean;
  provider: string;
  model: string;
  generatedAt: string;
  availabilityReason?: string;
  availabilityMessage?: string;
  summary: string;
  recommendations: AiRecommendation[];
}

export interface AiLogisticsDispatch {
  route: string;
  status: string;
  note: string;
}

export interface AiLogisticsSnapshot {
  activeRoutes: number;
  stopsToday: number;
  onTimeRate: number;
  recommendation: string;
  dispatches: AiLogisticsDispatch[];
}

export interface AiAnalysis extends AiSummary {
  warehouseRisks: WarehouseRisk[];
  reorderSuggestions: ReorderSuggestion[];
  fraudAlerts: FraudAlert[];
  logisticsSnapshot: AiLogisticsSnapshot;
}
