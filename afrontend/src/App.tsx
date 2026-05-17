import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";

import Login from "@/pages/Login";
import Register from "@/pages/Register";
import AdminLayout from "@/layouts/AdminLayout";
import ClientLayout from "@/layouts/ClientLayout";
import AdminDashboard from "@/pages/admin/Dashboard";
import InventoryPage from "@/pages/admin/Inventory";
import MaterialRequestsPage from "@/pages/admin/MaterialRequests";
import ProjectsPage from "@/pages/admin/Projects";
import ClientOrdersPage from "@/pages/admin/ClientOrders";
import PurchaseOrdersPage from "@/pages/admin/PurchaseOrders";
import SuppliersPage from "@/pages/admin/Suppliers";
import LogisticsPage from "@/pages/admin/Logistics";
import ReportsPage from "@/pages/admin/Reports";
import AIInsightsPage from "@/pages/admin/AIInsights";
import AuditLogsPage from "@/pages/admin/AuditLogs";
import ProofCenterPage from "@/pages/admin/ProofCenter";
import AdminNotificationsPage from "@/pages/admin/Notifications";
import SettingsPage from "@/pages/admin/Settings";
import ClientDashboard from "@/pages/client/Dashboard";
import PlaceOrderPage from "@/pages/client/PlaceOrder";
import MyOrdersPage from "@/pages/client/MyOrders";
import ClientNotificationsPage from "@/pages/client/Notifications";
import ClientProfilePage from "@/pages/client/Profile";
import ClientProjectsPage from "@/pages/client/Projects";
import ClientInvoicesPage from "@/pages/client/Invoices";
import ClientPaymentHistoryPage from "@/pages/client/PaymentHistory";
import NotFound from "@/pages/NotFound";
import {
  ADMIN_AREA_ROLES,
  canViewInventory,
  canViewProjects,
  canViewMaterialRequests,
  canViewClientOrders,
  canViewPurchaseOrders,
  canViewSuppliers,
  canViewLogistics,
  canViewReports,
  canViewAIInsights,
  canViewAuditLogs,
  canViewProofCenter,
  canViewNotifications,
  canAccessSettings,
} from "@/lib/roles";

const queryClient = new QueryClient();
const ADMIN_NON_DELIVERY_ROLES = ADMIN_AREA_ROLES.filter((role) => role !== 'delivery_guy');

function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles?: string[] }) {
  const { isAuthenticated, user, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  const roleList = user?.roles?.length ? user.roles : user?.role ? [user.role] : [];
  if (roleList.includes('delivery_guy') && location.pathname.startsWith('/admin') && location.pathname !== '/admin/settings') {
    return <Navigate to="/logistics" replace />;
  }
  if (allowedRoles && user) {
    const allowed = roleList.some((r) => allowedRoles.includes(r));
    if (!allowed) {
      if (roleList.includes('delivery_guy')) return <Navigate to="/logistics" replace />;
      return <Navigate to={roleList.includes('client') ? '/client' : '/admin'} replace />;
    }
  }
  return <>{children}</>;
}

function RoleBasedRedirect() {
  const { isAuthenticated, user, isLoading } = useAuth();
  if (isLoading) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  const roleList = user?.roles?.length ? user.roles : user?.role ? [user.role] : [];
  if (roleList.includes('delivery_guy')) return <Navigate to="/logistics" replace />;
  return <Navigate to={roleList.includes('client') ? '/client' : '/admin'} replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/" element={<RoleBasedRedirect />} />
      
      {/* Admin Routes */}
      <Route path="/admin" element={<ProtectedRoute allowedRoles={ADMIN_NON_DELIVERY_ROLES}><AdminLayout><AdminDashboard /></AdminLayout></ProtectedRoute>} />
      <Route path="/admin/inventory" element={<ProtectedRoute allowedRoles={ADMIN_NON_DELIVERY_ROLES.filter(canViewInventory)}><AdminLayout><InventoryPage /></AdminLayout></ProtectedRoute>} />
      <Route path="/admin/projects" element={<ProtectedRoute allowedRoles={ADMIN_NON_DELIVERY_ROLES.filter(canViewProjects)}><AdminLayout><ProjectsPage /></AdminLayout></ProtectedRoute>} />
      <Route path="/admin/requests" element={<ProtectedRoute allowedRoles={ADMIN_NON_DELIVERY_ROLES.filter(canViewMaterialRequests)}><AdminLayout><MaterialRequestsPage /></AdminLayout></ProtectedRoute>} />
      <Route path="/admin/orders" element={<ProtectedRoute allowedRoles={ADMIN_NON_DELIVERY_ROLES.filter(canViewClientOrders)}><AdminLayout><ClientOrdersPage /></AdminLayout></ProtectedRoute>} />
      <Route path="/admin/purchase-orders" element={<ProtectedRoute allowedRoles={ADMIN_NON_DELIVERY_ROLES.filter(canViewPurchaseOrders)}><AdminLayout><PurchaseOrdersPage /></AdminLayout></ProtectedRoute>} />
      <Route path="/admin/suppliers" element={<ProtectedRoute allowedRoles={ADMIN_NON_DELIVERY_ROLES.filter(canViewSuppliers)}><AdminLayout><SuppliersPage /></AdminLayout></ProtectedRoute>} />
      <Route path="/admin/logistics" element={<ProtectedRoute allowedRoles={ADMIN_NON_DELIVERY_ROLES.filter(canViewLogistics)}><AdminLayout><LogisticsPage /></AdminLayout></ProtectedRoute>} />
      <Route path="/admin/reports" element={<ProtectedRoute allowedRoles={ADMIN_NON_DELIVERY_ROLES.filter(canViewReports)}><AdminLayout><ReportsPage /></AdminLayout></ProtectedRoute>} />
      <Route path="/admin/ai-insights" element={<ProtectedRoute allowedRoles={ADMIN_NON_DELIVERY_ROLES.filter(canViewAIInsights)}><AdminLayout><AIInsightsPage /></AdminLayout></ProtectedRoute>} />
      <Route path="/admin/audit-logs" element={<ProtectedRoute allowedRoles={ADMIN_NON_DELIVERY_ROLES.filter(canViewAuditLogs)}><AdminLayout><AuditLogsPage /></AdminLayout></ProtectedRoute>} />
      <Route path="/admin/proofs" element={<ProtectedRoute allowedRoles={ADMIN_NON_DELIVERY_ROLES.filter(canViewProofCenter)}><AdminLayout><ProofCenterPage /></AdminLayout></ProtectedRoute>} />
      <Route path="/admin/notifications" element={<ProtectedRoute allowedRoles={ADMIN_NON_DELIVERY_ROLES.filter(canViewNotifications)}><AdminLayout><AdminNotificationsPage /></AdminLayout></ProtectedRoute>} />
      <Route path="/admin/settings" element={<ProtectedRoute allowedRoles={ADMIN_AREA_ROLES.filter(canAccessSettings)}><AdminLayout><SettingsPage /></AdminLayout></ProtectedRoute>} />

      {/* Delivery Guy Route */}
      <Route path="/logistics" element={<ProtectedRoute allowedRoles={['delivery_guy']}><AdminLayout><LogisticsPage /></AdminLayout></ProtectedRoute>} />
      
      {/* Client Routes */}
      <Route path="/client" element={<ProtectedRoute allowedRoles={['client']}><ClientLayout><ClientDashboard /></ClientLayout></ProtectedRoute>} />
      <Route path="/client/order" element={<ProtectedRoute allowedRoles={['client']}><ClientLayout><PlaceOrderPage /></ClientLayout></ProtectedRoute>} />
      <Route path="/client/orders" element={<ProtectedRoute allowedRoles={['client']}><ClientLayout><MyOrdersPage /></ClientLayout></ProtectedRoute>} />
      <Route path="/client/orders/:orderId" element={<ProtectedRoute allowedRoles={['client']}><ClientLayout><MyOrdersPage /></ClientLayout></ProtectedRoute>} />
      <Route path="/client/deliveries" element={<ProtectedRoute allowedRoles={['client']}><Navigate to="/client/orders?tab=my-deliveries" replace /></ProtectedRoute>} />
      <Route path="/client/projects" element={<ProtectedRoute allowedRoles={['client']}><ClientLayout><ClientProjectsPage /></ClientLayout></ProtectedRoute>} />
      <Route path="/client/notifications" element={<ProtectedRoute allowedRoles={['client']}><ClientLayout><ClientNotificationsPage /></ClientLayout></ProtectedRoute>} />
      <Route path="/client/profile" element={<ProtectedRoute allowedRoles={['client']}><ClientLayout><ClientProfilePage /></ClientLayout></ProtectedRoute>} />
      <Route path="/client/invoices" element={<ProtectedRoute allowedRoles={['client']}><ClientLayout><ClientInvoicesPage /></ClientLayout></ProtectedRoute>} />
      <Route path="/client/payments" element={<ProtectedRoute allowedRoles={['client']}><ClientLayout><ClientPaymentHistoryPage /></ClientLayout></ProtectedRoute>} />
      
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <HashRouter>
          <AppRoutes />
        </HashRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
