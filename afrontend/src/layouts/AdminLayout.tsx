import { ReactNode, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  LayoutDashboard,
  Package,
  FolderKanban,
  ClipboardList,
  ShoppingCart,
  FileText,
  Truck,
  BarChart3,
  Brain,
  History,
  Files,
  Bell,
  Settings,
  LogOut,
  ChevronRight,
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useResource } from '@/hooks/use-resource';
import type { Notification } from '@/types';
import {
  ADMIN_AREA_ROLES,
  ROLE_LABELS,
  canViewInventory,
  canViewProjects,
  canViewMaterialRequests,
  canViewClientOrders,
  canViewPurchaseOrders,
  canViewLogistics,
  canViewReports,
  canViewAIInsights,
  canViewAuditLogs,
  canViewProofCenter,
  canViewNotifications,
  canManageUsers,
  canAccessSettings,
} from '@/lib/roles';

interface AdminLayoutProps {
  children: ReactNode;
}

const dashboardRoles = ADMIN_AREA_ROLES.filter((role) => role !== 'delivery_guy');
const navItems = [
  { path: '/admin', icon: LayoutDashboard, label: 'Dashboard', exact: true, roles: dashboardRoles },
  { path: '/admin/inventory', icon: Package, label: 'Inventory', roles: ADMIN_AREA_ROLES.filter(canViewInventory) },
  { path: '/admin/projects', icon: FolderKanban, label: 'Projects', roles: ADMIN_AREA_ROLES.filter(canViewProjects) },
  { path: '/admin/requests', icon: ClipboardList, label: 'Material Requests', roles: ADMIN_AREA_ROLES.filter(canViewMaterialRequests) },
  { path: '/admin/orders', icon: ShoppingCart, label: 'Client Orders', roles: ADMIN_AREA_ROLES.filter(canViewClientOrders) },
  { path: '/admin/purchase-orders', icon: FileText, label: 'Purchase Orders', roles: ADMIN_AREA_ROLES.filter(canViewPurchaseOrders) },
  { path: '/admin/logistics', icon: Truck, label: 'Logistics', roles: ADMIN_AREA_ROLES.filter(canViewLogistics) },
  { path: '/admin/reports', icon: BarChart3, label: 'Reports', roles: ADMIN_AREA_ROLES.filter(canViewReports) },
  { path: '/admin/ai-insights', icon: Brain, label: 'AI Insights', roles: ADMIN_AREA_ROLES.filter(canViewAIInsights) },
  { path: '/admin/audit-logs', icon: History, label: 'Audit Logs', roles: ADMIN_AREA_ROLES.filter(canViewAuditLogs) },
  { path: '/admin/proofs', icon: Files, label: 'Proof Center', roles: ADMIN_AREA_ROLES.filter(canViewProofCenter) },
  { path: '/admin/notifications', icon: Bell, label: 'Notifications', roles: ADMIN_AREA_ROLES.filter(canViewNotifications) },
  { path: '/admin/settings', icon: Settings, label: 'Settings', roles: ADMIN_AREA_ROLES.filter(canAccessSettings) },
];

export default function AdminLayout({ children }: AdminLayoutProps) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const { data: notifications } = useResource<Notification[]>('/notifications', []);
  const { data: companyInfo } = useResource('/company', {
    name: 'Impex Engineering and Industrial Supply',
    address: '6959 Washington St., Pio Del Pilar, Makati City',
    tin: '100-191-563-000',
    phone: '+63 2 8123 4567',
    email: 'sales@impex.ph',
    website: 'www.impex.ph',
  });
  const unreadNotifications = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    if (!companyInfo) return;
    try {
      localStorage.setItem('company_info', JSON.stringify(companyInfo));
    } catch {
      // ignore
    }
  }, [companyInfo]);

  const getPageTitle = () => {
    const current = navItems.find((item) =>
      item.exact ? location.pathname === item.path : location.pathname.startsWith(item.path)
    );
    return current?.label || 'Dashboard';
  };

  const roleList = user?.roles?.length ? user.roles : user?.role ? [user.role] : ['project_manager'];
  const visibleNavItems = navItems.filter((item) => roleList.some((r) => item.roles.includes(r)));

  return (
    <div className="min-h-screen flex bg-background">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed lg:sticky lg:top-0 lg:h-screen inset-y-0 left-0 z-50 bg-sidebar transform transition-[width,transform] duration-200 ease-in-out lg:translate-x-0',
          sidebarCollapsed ? 'lg:w-[88px]' : 'w-64',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div
            className={cn(
              'h-16 flex items-center border-b border-sidebar-border',
              sidebarCollapsed ? 'justify-center px-2 lg:px-3' : 'justify-between px-4'
            )}
          >
            {sidebarCollapsed ? (
              <div className="hidden lg:flex">
                <Logo size="md" showText={false} className="[&_div]:bg-white" />
              </div>
            ) : null}
            <div className={cn('min-w-0', sidebarCollapsed && 'lg:hidden')}>
              <div className="flex items-center gap-3">
                <Logo size="md" className="text-white [&_span]:text-white" />
                <div className="hidden h-10 w-24 items-center justify-center overflow-hidden rounded-md bg-white px-3 py-1.5 xl:flex">
                  <img src="/brand/thortex-logo.jpeg" alt="Thortex Philippines" className="h-full w-full object-contain object-center" />
                </div>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden text-sidebar-foreground hover:bg-sidebar-accent"
              onClick={() => setSidebarOpen(false)}
            >
              <X size={20} />
            </Button>
          </div>

          {/* Navigation */}
          <ScrollArea className="flex-1 py-4">
            <nav className="px-3 space-y-1">
              {visibleNavItems.map((item) => {
                const isActive = item.exact
                  ? location.pathname === item.path
                  : location.pathname.startsWith(item.path) && location.pathname !== '/admin';

                const isExactDashboard = item.path === '/admin' && location.pathname === '/admin';
                const finalActive = item.exact ? isExactDashboard : isActive;

                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={() => setSidebarOpen(false)}
                    className={cn(
                      'relative flex items-center px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
                      sidebarCollapsed ? 'justify-center gap-0' : 'gap-3',
                      finalActive
                        ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                        : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                    )}
                    title={sidebarCollapsed ? item.label : undefined}
                  >
                    <item.icon size={20} />
                    {!sidebarCollapsed && <span>{item.label}</span>}
                    {!sidebarCollapsed && item.label === 'Notifications' && unreadNotifications > 0 && (
                      <Badge className="ml-auto bg-primary text-primary-foreground text-xs px-1.5 py-0.5">
                        {unreadNotifications}
                      </Badge>
                    )}
                    {sidebarCollapsed && item.label === 'Notifications' && unreadNotifications > 0 && (
                      <span className="absolute top-2 right-2 h-2 w-2 bg-primary rounded-full" />
                    )}
                  </NavLink>
                );
              })}
            </nav>
          </ScrollArea>

          <div className="p-3 border-t border-sidebar-border hidden lg:block">
            <Button
              variant="ghost"
              className={cn(
                'w-full text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground',
                sidebarCollapsed ? 'justify-center px-0' : 'justify-start gap-3'
              )}
              onClick={() => setSidebarCollapsed((current) => !current)}
            >
              {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
              {!sidebarCollapsed && <span>{sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}</span>}
            </Button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-16 bg-card border-b border-border flex items-center justify-between px-4 lg:px-6 sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={20} />
            </Button>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-foreground">{getPageTitle()}</h1>
              <ChevronRight size={16} className="text-muted-foreground hidden sm:block" />
              <span className="text-sm text-muted-foreground hidden sm:block">
                {ROLE_LABELS[roleList[0] || 'project_manager'] || 'User'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Notifications */}
            {canViewNotifications(roleList) && (
              <Button variant="ghost" size="icon" className="relative" asChild>
                <NavLink to="/admin/notifications">
                  <Bell size={20} />
                  {unreadNotifications > 0 && (
                    <span className="absolute top-1 right-1 h-2 w-2 bg-primary rounded-full" />
                  )}
                </NavLink>
              </Button>
            )}

            {/* User dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2">
                  <Avatar className="h-8 w-8">
                    {user?.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name || 'User'} />}
                    <AvatarFallback className="bg-primary/10 text-primary text-sm">
                      {user?.avatar || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden sm:block text-sm font-medium">{user?.name}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {canManageUsers(user?.role) && (
                  <>
                    <DropdownMenuItem asChild>
                      <NavLink to="/admin/settings">
                        <Settings size={16} className="mr-2" />
                        Settings
                      </NavLink>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem onClick={logout} className="text-destructive">
                  <LogOut size={16} className="mr-2" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
