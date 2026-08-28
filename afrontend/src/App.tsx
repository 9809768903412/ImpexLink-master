import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense, lazy } from "react";
import { HashRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";

import Login from "@/pages/Login";
import Register from "@/pages/Register";
const AdminLayout = lazy(() => import("@/layouts/AdminLayout"));
const ClientLayout = lazy(() => import("@/layouts/ClientLayout"));
const AdminDashboard = lazy(() => import("@/pages/admin/Dashboard"));
const InventoryPage = lazy(() => import("@/pages/admin/Inventory"));
const MaterialRequestsPage = lazy(() => import("@/pages/admin/MaterialRequests"));
const ProjectsPage = lazy(() => import("@/pages/admin/Projects"));
const ClientOrdersPage = lazy(() => import("@/pages/admin/ClientOrders"));
const PurchaseOrdersPage = lazy(() => import("@/pages/admin/PurchaseOrders"));
const CompaniesPage = lazy(() => import("@/pages/admin/Companies"));
const SuppliersPage = lazy(() => import("@/pages/admin/Suppliers"));
const LogisticsPage = lazy(() => import("@/pages/admin/Logistics"));
const ReportsPage = lazy(() => import("@/pages/admin/Reports"));
const PaymentsPage = lazy(() => import("@/pages/admin/Payments"));
const AIInsightsPage = lazy(() => import("@/pages/admin/AIInsights"));
const AuditLogsPage = lazy(() => import("@/pages/admin/AuditLogs"));
const ProofCenterPage = lazy(() => import("@/pages/admin/ProofCenter"));
const AdminNotificationsPage = lazy(() => import("@/pages/admin/Notifications"));
const AdminMessagesPage = lazy(() => import("@/pages/admin/Messages"));
const SettingsPage = lazy(() => import("@/pages/admin/Settings"));
const ClientDashboard = lazy(() => import("@/pages/client/Dashboard"));
const PlaceOrderPage = lazy(() => import("@/pages/client/PlaceOrder"));
const MyOrdersPage = lazy(() => import("@/pages/client/MyOrders"));
const ClientNotificationsPage = lazy(() => import("@/pages/client/Notifications"));
const ClientProfilePage = lazy(() => import("@/pages/client/Profile"));
const ClientProjectsPage = lazy(() => import("@/pages/client/Projects"));
const ClientInvoicesPage = lazy(() => import("@/pages/client/Invoices"));
const ClientPaymentHistoryPage = lazy(() => import("@/pages/client/PaymentHistory"));
const ClientMessagesPage = lazy(() => import("@/pages/client/Messages"));
const NotFound = lazy(() => import("@/pages/NotFound"));
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
  canViewPayments,
  canViewAIInsights,
  canViewAuditLogs,
  canViewProofCenter,
  canViewNotifications,
  canViewMessages,
  canAccessSettings,
} from "@/lib/roles";

const queryClient = new QueryClient();
const ADMIN_NON_DRIVER_ROLES = ADMIN_AREA_ROLES.filter((role) => !['driver'].includes(role));
const ADMIN_DASHBOARD_ROLES = ADMIN_AREA_ROLES.filter((role) => !['warehouse_staff', 'delivery_guy', 'driver', 'receiver'].includes(role));

function defaultPathForRoles(roleList: string[]) {
  roleList = roleList.map((role) => String(role).toLowerCase());
  if (roleList.includes('client')) return '/client';
  if (roleList.includes('driver') || roleList.includes('delivery_guy')) return '/logistics';
  if (roleList.includes('warehouse_staff')) return '/admin/inventory';
  if (roleList.includes('paint_chemist')) return '/admin/inventory';
  return '/admin';
}

function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles?: string[] }) {
  const { isAuthenticated, user, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  const roleList = (user?.roles?.length ? user.roles : user?.role ? [user.role] : []).map((role) => String(role).toLowerCase());
  const logisticsOnly = roleList.some((role) => ['driver', 'delivery_guy'].includes(role));
  if (
    logisticsOnly &&
    location.pathname.startsWith('/admin') &&
    !['/admin/settings', '/admin/messages'].includes(location.pathname)
  ) {
    return <Navigate to="/logistics" replace />;
  }
  if (allowedRoles && user) {
    const allowed = roleList.some((r) => allowedRoles.includes(r));
    if (!allowed) {
      if (logisticsOnly) return <Navigate to="/logistics" replace />;
      return <Navigate to={defaultPathForRoles(roleList)} replace />;
    }
  }
  return <>{children}</>;
}

function RoleBasedRedirect() {
  const { isAuthenticated, user, isLoading } = useAuth();
  if (isLoading) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  const roleList = (user?.roles?.length ? user.roles : user?.role ? [user.role] : []).map((role) => String(role).toLowerCase());
  if (roleList.some((role) => ['driver', 'delivery_guy'].includes(role))) return <Navigate to="/logistics" replace />;
  return <Navigate to={defaultPathForRoles(roleList)} replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/" element={<RoleBasedRedirect />} />
      
      {/* Admin Routes */}
      <Route path="/admin" element={<ProtectedRoute allowedRoles={ADMIN_DASHBOARD_ROLES}><AdminLayout><AdminDashboard /></AdminLayout></ProtectedRoute>} />
      <Route path="/admin/inventory" element={<ProtectedRoute allowedRoles={ADMIN_NON_DRIVER_ROLES.filter(canViewInventory)}><AdminLayout><InventoryPage /></AdminLayout></ProtectedRoute>} />
      <Route path="/admin/projects" element={<ProtectedRoute allowedRoles={ADMIN_NON_DRIVER_ROLES.filter(canViewProjects)}><AdminLayout><ProjectsPage /></AdminLayout></ProtectedRoute>} />
      <Route path="/admin/requests" element={<ProtectedRoute allowedRoles={ADMIN_NON_DRIVER_ROLES.filter(canViewMaterialRequests)}><AdminLayout><MaterialRequestsPage /></AdminLayout></ProtectedRoute>} />
      <Route path="/admin/orders" element={<ProtectedRoute allowedRoles={ADMIN_NON_DRIVER_ROLES.filter(canViewClientOrders)}><AdminLayout><ClientOrdersPage /></AdminLayout></ProtectedRoute>} />
      <Route path="/admin/purchase-orders" element={<ProtectedRoute allowedRoles={ADMIN_NON_DRIVER_ROLES.filter(canViewPurchaseOrders)}><AdminLayout><PurchaseOrdersPage /></AdminLayout></ProtectedRoute>} />
      <Route path="/admin/companies" element={<ProtectedRoute allowedRoles={['admin']}><AdminLayout><CompaniesPage /></AdminLayout></ProtectedRoute>} />
      <Route path="/admin/suppliers" element={<ProtectedRoute allowedRoles={ADMIN_NON_DRIVER_ROLES.filter(canViewSuppliers)}><AdminLayout><SuppliersPage /></AdminLayout></ProtectedRoute>} />
      <Route path="/admin/logistics" element={<ProtectedRoute allowedRoles={ADMIN_NON_DRIVER_ROLES.filter(canViewLogistics)}><AdminLayout><LogisticsPage /></AdminLayout></ProtectedRoute>} />
      <Route path="/admin/payments" element={<ProtectedRoute allowedRoles={ADMIN_NON_DRIVER_ROLES.filter(canViewPayments)}><AdminLayout><PaymentsPage /></AdminLayout></ProtectedRoute>} />
      <Route path="/admin/reports" element={<ProtectedRoute allowedRoles={ADMIN_NON_DRIVER_ROLES.filter(canViewReports)}><AdminLayout><ReportsPage /></AdminLayout></ProtectedRoute>} />
      <Route path="/admin/ai-insights" element={<ProtectedRoute allowedRoles={ADMIN_NON_DRIVER_ROLES.filter(canViewAIInsights)}><AdminLayout><AIInsightsPage /></AdminLayout></ProtectedRoute>} />
      <Route path="/admin/audit-logs" element={<ProtectedRoute allowedRoles={ADMIN_NON_DRIVER_ROLES.filter(canViewAuditLogs)}><AdminLayout><AuditLogsPage /></AdminLayout></ProtectedRoute>} />
      <Route path="/admin/proofs" element={<ProtectedRoute allowedRoles={ADMIN_NON_DRIVER_ROLES.filter(canViewProofCenter)}><AdminLayout><ProofCenterPage /></AdminLayout></ProtectedRoute>} />
      <Route path="/admin/messages" element={<ProtectedRoute allowedRoles={ADMIN_AREA_ROLES.filter(canViewMessages)}><AdminLayout><AdminMessagesPage /></AdminLayout></ProtectedRoute>} />
      <Route path="/admin/notifications" element={<ProtectedRoute allowedRoles={ADMIN_NON_DRIVER_ROLES.filter(canViewNotifications)}><AdminLayout><AdminNotificationsPage /></AdminLayout></ProtectedRoute>} />
      <Route path="/admin/settings" element={<ProtectedRoute allowedRoles={ADMIN_AREA_ROLES.filter(canAccessSettings)}><AdminLayout><SettingsPage /></AdminLayout></ProtectedRoute>} />

      {/* Delivery Guy Route */}
      <Route path="/logistics" element={<ProtectedRoute allowedRoles={['driver', 'delivery_guy']}><AdminLayout><LogisticsPage /></AdminLayout></ProtectedRoute>} />
      
      {/* Client Routes */}
      <Route path="/client" element={<ProtectedRoute allowedRoles={['client']}><ClientLayout><ClientDashboard /></ClientLayout></ProtectedRoute>} />
      <Route path="/client/order" element={<ProtectedRoute allowedRoles={['client']}><ClientLayout><PlaceOrderPage /></ClientLayout></ProtectedRoute>} />
      <Route path="/client/orders" element={<ProtectedRoute allowedRoles={['client']}><ClientLayout><MyOrdersPage /></ClientLayout></ProtectedRoute>} />
      <Route path="/client/orders/:orderId" element={<ProtectedRoute allowedRoles={['client']}><ClientLayout><MyOrdersPage /></ClientLayout></ProtectedRoute>} />
      <Route path="/client/deliveries" element={<ProtectedRoute allowedRoles={['client']}><Navigate to="/client/orders?tab=my-deliveries" replace /></ProtectedRoute>} />
      <Route path="/client/projects" element={<ProtectedRoute allowedRoles={['client']}><ClientLayout><ClientProjectsPage /></ClientLayout></ProtectedRoute>} />
      <Route path="/client/notifications" element={<ProtectedRoute allowedRoles={['client']}><ClientLayout><ClientNotificationsPage /></ClientLayout></ProtectedRoute>} />
      <Route path="/client/messages" element={<ProtectedRoute allowedRoles={['client']}><ClientLayout><ClientMessagesPage /></ClientLayout></ProtectedRoute>} />
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
          <Suspense fallback={<div className="min-h-screen bg-background" aria-busy="true" />}>
            <AppRoutes />
          </Suspense>
        </HashRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
