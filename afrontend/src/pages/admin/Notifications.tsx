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
  Brain,
  Check,
  CheckCheck,
  Trash2,
} from 'lucide-react';
import type { Notification, NotificationType } from '@/types';
import { toast } from '@/hooks/use-toast';
import { useResource } from '@/hooks/use-resource';
import { Skeleton } from '@/components/ui/skeleton';
import { apiClient } from '@/api/client';

const typeIcons: Record<NotificationType, React.ReactNode> = {
  'low-stock': <Package className="text-yellow-600" size={20} />,
  'order-approval': <ShoppingCart className="text-blue-600" size={20} />,
  'delivery-update': <Truck className="text-cyan-600" size={20} />,
  'payment-verified': <CreditCard className="text-green-600" size={20} />,
  'request-approval': <AlertTriangle className="text-orange-600" size={20} />,
  'quote-response': <ShoppingCart className="text-purple-600" size={20} />,
  'ai-alert': <Brain className="text-primary" size={20} />,
};

const typeLabels: Record<NotificationType, string> = {
  'low-stock': 'Stock Alert',
  'order-approval': 'Order',
  'delivery-update': 'Delivery',
  'payment-verified': 'Payment',
  'request-approval': 'Request',
  'quote-response': 'Quote',
  'ai-alert': 'AI Alert',
};

// TODO: Replace with real data
export default function NotificationsPage() {
  const { data: notifications, setData: setNotifications, loading } = useResource<Notification[]>(
    '/notifications',
    []
  );
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const unreadCount = notifications.filter((n) => !n.read).length;

  const filteredNotifications = notifications.filter((n) =>
    filter === 'all' ? true : !n.read
  );

  const handleMarkAsRead = (id: string) => {
    setNotifications(
      notifications.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    apiClient.put<Notification>(`/notifications/${id}`, { read: true }).catch(() => {
      // keep optimistic update
    });
  };

  const handleMarkAllAsRead = () => {
    setNotifications(notifications.map((n) => ({ ...n, read: true })));
    apiClient.post('/notifications/mark-all-read').catch(() => {
      // keep optimistic update
    });
    toast({
      title: 'All Caught Up!',
      description: 'All notifications marked as read',
    });
  };

  const handleDelete = (id: string) => {
    setNotifications(notifications.filter((n) => n.id !== id));
    apiClient.delete(`/notifications/${id}`).catch(() => {
      // keep optimistic update
    });
    toast({
      title: 'Notification Deleted',
      description: 'The notification has been removed',
    });
  };

  const handleClearAll = () => {
    setNotifications([]);
    apiClient.delete('/notifications').catch(() => {
      // keep optimistic update
    });
    toast({
      title: 'Notifications Cleared',
      description: 'All notifications have been removed',
    });
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
          <p className="text-muted-foreground">Stay updated on important activities</p>
        </div>
        <div className="flex gap-2">
          {unreadCount > 0 && (
            <Button variant="outline" onClick={handleMarkAllAsRead}>
              <CheckCheck size={16} className="mr-2" />
              Mark All Read
            </Button>
          )}
          {notifications.length > 0 && (
            <Button variant="outline" onClick={handleClearAll}>
              <Trash2 size={16} className="mr-2" />
              Clear All
            </Button>
          )}
        </div>
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
                    : 'No notifications yet'}
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
                              <Badge variant="outline" className="text-xs">
                                {typeLabels[notification.type]}
                              </Badge>
                              {!notification.read && (
                                <span className="h-2 w-2 bg-primary rounded-full" />
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                              {notification.message}
                            </p>
                            <p className="text-xs text-muted-foreground mt-2">
                              {format(new Date(notification.createdAt), 'MMM dd, yyyy • HH:mm')}
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

      {/* Notification Categories Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Notification Summary</CardTitle>
          <CardDescription>Breakdown by category</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {Object.entries(
              notifications.reduce((acc, n) => {
                acc[n.type] = (acc[n.type] || 0) + 1;
                return acc;
              }, {} as Record<string, number>)
            ).map(([type, count]) => (
              <div
                key={type}
                className="flex items-center gap-3 p-3 bg-muted rounded-lg"
              >
                {typeIcons[type as NotificationType]}
                <div>
                  <p className="font-medium">{count}</p>
                  <p className="text-xs text-muted-foreground">
                    {typeLabels[type as NotificationType]}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <p className="text-center text-sm text-muted-foreground">
        * Notifications are stored locally in this demo.
      </p>
    </div>
  );
}
