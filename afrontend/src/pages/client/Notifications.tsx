import { useState } from 'react';
import { format } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Bell,
  Package,
  ShoppingCart,
  Truck,
  CreditCard,
  AlertTriangle,
  FolderKanban,
  Check,
  CheckCheck,
  Trash2,
} from 'lucide-react';
import type { Notification, NotificationType } from '@/types';
import { toast } from '@/hooks/use-toast';
import { useResource } from '@/hooks/use-resource';
import { Skeleton } from '@/components/ui/skeleton';
import { apiClient } from '@/api/client';
import { useAuth } from '@/contexts/AuthContext';

const typeIcons: Record<NotificationType, React.ReactNode> = {
  'low-stock': <Package className="text-yellow-600" size={20} />,
  'order-approval': <ShoppingCart className="text-blue-600" size={20} />,
  'delivery-update': <Truck className="text-cyan-600" size={20} />,
  'payment-verified': <CreditCard className="text-green-600" size={20} />,
  'request-approval': <AlertTriangle className="text-orange-600" size={20} />,
  'quote-response': <ShoppingCart className="text-purple-600" size={20} />,
  'project-update': <FolderKanban className="text-emerald-600" size={20} />,
  'ai-alert': <AlertTriangle className="text-primary" size={20} />,
};

// Client-relevant notification types
const clientNotificationTypes: NotificationType[] = [
  'order-approval',
  'delivery-update',
  'payment-verified',
  'quote-response',
  'project-update',
  'low-stock',
];

// TODO: Replace with real data
export default function ClientNotificationsPage() {
  const { user } = useAuth();
  // Filter notifications relevant to clients
  const { data: allNotificationsRaw, setData: setAllNotifications, loading } = useResource<any>(
    '/notifications',
    [],
    [user?.id],
    15_000,
    { viewer: user?.id ?? 'anonymous' }
  );
  const allNotifications: Notification[] = Array.isArray(allNotificationsRaw)
    ? allNotificationsRaw
    : Array.isArray(allNotificationsRaw?.data)
      ? allNotificationsRaw.data
      : [];
  const notifications = allNotifications.filter((n) => clientNotificationTypes.includes(n.type));
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const unreadCount = notifications.filter((n) => !n.read).length;

  const filteredNotifications = notifications.filter((n) =>
    filter === 'all' ? true : !n.read
  );

  const handleMarkAsRead = (id: string) => {
    setAllNotifications(
      allNotifications.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    apiClient.put<Notification>(`/notifications/${id}`, { read: true }).catch(() => {
      // keep optimistic update
    });
  };

  const handleMarkAllAsRead = () => {
    setAllNotifications(allNotifications.map((n) => ({ ...n, read: true })));
    apiClient.post('/notifications/mark-all-read').catch(() => {
      // keep optimistic update
    });
    toast({
      title: 'All Caught Up!',
      description: 'All notifications marked as read',
    });
  };

  const handleDelete = (id: string) => {
    setAllNotifications(allNotifications.filter((n) => n.id !== id));
    apiClient.delete(`/notifications/${id}`).catch(() => {
      // keep optimistic update
    });
  };

  const getNotificationMessage = (notification: Notification) => {
    // Customize messages for client context
    switch (notification.type) {
      case 'delivery-update':
        return notification.message;
      case 'payment-verified':
        return notification.message;
      case 'low-stock':
        return `${notification.message} - Consider reordering soon!`;
      default:
        return notification.message;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Bell className="text-muted-foreground" />
            Notifications
            {unreadCount > 0 && (
              <Badge className="ml-2 bg-primary">{unreadCount} new</Badge>
            )}
          </h2>
          <p className="text-muted-foreground">
            Stay updated on your orders, deliveries, and more
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" onClick={handleMarkAllAsRead}>
            <CheckCheck size={16} className="mr-2" />
            Mark All Read
          </Button>
        )}
      </div>

      <Tabs defaultValue="all" className="space-y-4">
        <TabsList>
          <TabsTrigger value="all" onClick={() => setFilter('all')}>
            All ({notifications.length})
          </TabsTrigger>
          <TabsTrigger value="unread" onClick={() => setFilter('unread')}>
            Unread ({unreadCount})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={filter} className="space-y-4">
          {loading && filteredNotifications.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <div className="space-y-3">
                  <Skeleton className="h-4 w-1/3 mx-auto" />
                  <Skeleton className="h-4 w-1/2 mx-auto" />
                </div>
              </CardContent>
            </Card>
          ) : filteredNotifications.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Bell size={48} className="mx-auto text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium">No Notifications</h3>
                <p className="text-muted-foreground">
                  {filter === 'unread'
                    ? "You're all caught up!"
                    : 'No notifications yet. Place an order to get started!'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredNotifications.map((notification) => (
                <Card
                  key={notification.id}
                  className={`transition-colors ${
                    !notification.read ? 'bg-primary/5 border-primary/20' : ''
                  }`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <div className="p-2 bg-muted rounded-full">
                        {typeIcons[notification.type]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium">{notification.title}</h4>
                              {!notification.read && (
                                <span className="h-2 w-2 bg-primary rounded-full" />
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                              {getNotificationMessage(notification)}
                            </p>
                            <p className="text-xs text-muted-foreground mt-2">
                              {format(new Date(notification.createdAt), 'MMM dd, yyyy • h:mm a')}
                            </p>
                          </div>
                          <div className="flex gap-1">
                            {!notification.read && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleMarkAsRead(notification.id)}
                                title="Mark as read"
                              >
                                <Check size={16} />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive"
                              onClick={() => handleDelete(notification.id)}
                              title="Delete"
                            >
                              <Trash2 size={16} />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 bg-blue-100 rounded-full">
              <ShoppingCart className="text-blue-600" size={24} />
            </div>
            <div>
              <p className="font-medium">Order Updates</p>
              <p className="text-sm text-muted-foreground">
                Get notified when orders are approved
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 bg-cyan-100 rounded-full">
              <Truck className="text-cyan-600" size={24} />
            </div>
            <div>
              <p className="font-medium">Delivery Alerts</p>
              <p className="text-sm text-muted-foreground">
                Track your shipments in real-time
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 bg-yellow-100 rounded-full">
              <Package className="text-yellow-600" size={24} />
            </div>
            <div>
              <p className="font-medium">Stock Alerts</p>
              <p className="text-sm text-muted-foreground">
                Know when your favorites are low
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
