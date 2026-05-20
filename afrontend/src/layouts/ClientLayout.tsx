import { ReactNode, useEffect, useMemo, useState } from 'react';
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
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Truck,
  FolderKanban,
  Bell,
  Phone,
  Mail,
  MessageSquare,
  CreditCard,
  ChevronUp,
  ChevronDown,
  User,
  LogOut,
  Menu,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useResource } from '@/hooks/use-resource';
import type { ChatThread, Client, Notification } from '@/types';

interface ClientLayoutProps {
  children: ReactNode;
}

const navItems = [
  { path: '/client', icon: LayoutDashboard, label: 'Home', exact: true },
  { path: '/client/order', icon: ShoppingCart, label: 'Catalog' },
  { path: '/client/orders', icon: Package, label: 'Orders & Deliveries' },
  { path: '/client/payments', icon: CreditCard, label: 'Payments' },
  { path: '/client/projects', icon: FolderKanban, label: 'Projects' },
  { path: '/client/messages', icon: MessageSquare, label: 'Messages' },
  { path: '/client/notifications', icon: Bell, label: 'Notifications' },
];

export default function ClientLayout({ children }: ClientLayoutProps) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [supportOpen, setSupportOpen] = useState(false);
  const notificationParams = useMemo(() => ({ viewer: user?.id ?? 'anonymous' }), [user?.id]);
  const threadParams = useMemo(() => ({ page: 1, pageSize: 50, viewer: user?.id ?? 'anonymous' }), [user?.id]);

  const { data: notificationsRaw, reload: reloadNotifications } = useResource<any>(
    '/notifications',
    [],
    [user?.id],
    15_000,
    notificationParams
  );
  const { data: threadsRaw, reload: reloadThreads } = useResource<any>(
    '/messages/threads',
    [],
    [user?.id],
    5_000,
    threadParams
  );
  const notifications: Notification[] = Array.isArray(notificationsRaw)
    ? notificationsRaw
    : Array.isArray(notificationsRaw?.data)
      ? notificationsRaw.data
      : [];
  const threads: ChatThread[] = Array.isArray(threadsRaw)
    ? threadsRaw
    : Array.isArray(threadsRaw?.data)
      ? threadsRaw.data
      : [];
  const { data: clients } = useResource<Client[]>('/clients', [], [user?.id], 15_000);
  const { data: companyInfo } = useResource('/company', {
    name: 'Impex Engineering and Industrial Supply',
    address: '6959 Washington St., Pio Del Pilar, Makati City',
    tin: '100-191-563-000',
    phone: '+63 2 8123 4567',
    email: 'sales@impex.ph',
    website: 'www.impex.ph',
  });
  const unreadNotifications = notifications.filter((n) => !n.read).length;
  const unreadMessages = threads.reduce((total, thread) => total + Number(thread.unreadCount || 0), 0);
  const displayCompanyName =
    clients.find((client) => client.id === user?.clientId)?.name ||
    clients[0]?.name ||
    user?.companyName;

  useEffect(() => {
    const refreshBadges = () => {
      reloadNotifications();
      reloadThreads();
    };
    const interval = window.setInterval(refreshBadges, 5_000);
    window.addEventListener('focus', refreshBadges);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshBadges);
    };
  }, [reloadNotifications, reloadThreads]);

  useEffect(() => {
    if (!companyInfo) return;
    try {
      localStorage.setItem('company_info', JSON.stringify(companyInfo));
    } catch {
      // ignore
    }
  }, [companyInfo]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top Navigation */}
      <header className="h-14 bg-card border-b border-border sticky top-0 z-50">
        <div className="container mx-auto h-full flex items-center justify-between px-4">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <Logo size="md" />
            <div className="hidden h-10 w-24 items-center justify-center overflow-hidden rounded-md bg-white px-3 py-1.5 md:flex">
              <img src="/brand/thortex-logo.jpeg" alt="Thortex Philippines" className="h-full w-full object-contain object-center" />
            </div>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden xl:flex items-center gap-1.5 flex-wrap">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.exact}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-foreground/80 hover:bg-muted hover:text-foreground'
                  )
                }
              >
                <item.icon size={16} />
                <span>{item.label}</span>
                {item.label === 'Notifications' && unreadNotifications > 0 && (
                  <Badge className="ml-1 bg-secondary text-secondary-foreground text-xs px-1.5 py-0">
                    {unreadNotifications}
                  </Badge>
                )}
                {item.label === 'Messages' && unreadMessages > 0 && (
                  <Badge className="ml-1 bg-secondary text-secondary-foreground text-xs px-1.5 py-0">
                    {unreadMessages}
                  </Badge>
                )}
              </NavLink>
            ))}
          </nav>

          {/* Right side - User & Mobile menu */}
          <div className="flex items-center gap-2">
            {/* User dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2 px-2">
                  <Avatar className="h-7 w-7">
                    {user?.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name || 'User'} />}
                    <AvatarFallback className="bg-primary/10 text-primary text-xs">
                      {user?.avatar || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="hidden sm:block text-left">
                    <p className="text-[13px] font-medium leading-tight">{user?.name}</p>
                    <p className="text-xs text-muted-foreground">{displayCompanyName}</p>
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div>
                    <p className="font-medium">{user?.name}</p>
                    <p className="text-xs text-muted-foreground">{displayCompanyName}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <NavLink to="/client/profile">
                    <User size={16} className="mr-2" />
                    Profile
                  </NavLink>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} className="text-destructive">
                  <LogOut size={16} className="mr-2" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Mobile menu */}
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="xl:hidden h-9 w-9">
                  <Menu size={18} />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-64">
                <div className="flex flex-col gap-4 mt-8">
                  {navItems.map((item) => (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      end={item.exact}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-3 px-4 py-3 rounded-md text-sm font-medium transition-colors',
                          isActive
                            ? 'bg-primary text-primary-foreground'
                            : 'text-foreground/80 hover:bg-muted'
                        )
                      }
                    >
                      <item.icon size={20} />
                      <span>{item.label}</span>
                      {item.label === 'Notifications' && unreadNotifications > 0 && (
                        <Badge className="ml-auto">{unreadNotifications}</Badge>
                      )}
                      {item.label === 'Messages' && unreadMessages > 0 && (
                        <Badge className="ml-auto">{unreadMessages}</Badge>
                      )}
                    </NavLink>
                  ))}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1">
        <div className="container mx-auto p-4 pb-28 lg:p-6 lg:pb-32">
          {children}
        </div>
      </main>

      <div className="fixed bottom-4 right-4 z-40 w-[260px] rounded-2xl border bg-card/95 shadow-lg backdrop-blur sm:bottom-6 sm:right-6">
        <button
          type="button"
          onClick={() => setSupportOpen((prev) => !prev)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <span className="text-sm font-semibold">Need help?</span>
          {supportOpen ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>
        {supportOpen ? (
          <div className="space-y-2 border-t px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Phone size={14} className="shrink-0" />
              <span>{companyInfo.phone}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Mail size={14} className="shrink-0" />
              <span>{companyInfo.email}</span>
            </div>
          </div>
        ) : null}
      </div>

      {/* Footer */}
      <footer className="bg-card border-t border-border py-4">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>© 2025 Impex Engineering and Industrial Supply. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
