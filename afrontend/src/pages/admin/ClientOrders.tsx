import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Search, Eye, CheckCircle, XCircle, FileText, MessageSquare, Download } from 'lucide-react';
import type { Order, OrderStatus, QuoteRequest, User } from '@/types';
import { toast } from '@/hooks/use-toast';
import { useResource } from '@/hooks/use-resource';
import { apiClient } from '@/api/client';
import { getCache, setCache } from '@/hooks/cache';
import { Skeleton } from '@/components/ui/skeleton';
import { printHtml } from '@/utils/print';
import { downloadCsv } from '@/utils/csv';
import { useAuth } from '@/contexts/AuthContext';
import { canManageClientOrders } from '@/lib/roles';
import { calcLineAmounts, calcTotalsFromItems, VAT_RATE } from '@/lib/vat';
import PaginationNav from '@/components/PaginationNav';

const statusColors: Record<OrderStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
  approved: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  processing: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
  'ready-for-delivery': 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-300',
  delivered: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
};

// TODO: Replace with real data
export default function ClientOrdersPage() {
  const { user } = useAuth();
  const roleInput = user?.roles?.length ? user.roles : user?.role;
  const canManageOrders = canManageClientOrders(roleInput);
  const isAdmin = Array.isArray(roleInput) ? roleInput.includes('admin') : roleInput === 'admin';
  const isSalesAgent = Array.isArray(roleInput) ? roleInput.includes('sales_agent') : roleInput === 'sales_agent';
  const isWarehouseStaff = Array.isArray(roleInput) ? roleInput.includes('warehouse_staff') : roleInput === 'warehouse_staff';
  const [orders, setOrders] = useState<Order[]>(() => getCache<Order[]>('admin-orders') || []);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersPageSize] = useState(10);
  const [sortKey, setSortKey] = useState<'createdAt' | 'total' | 'status'>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const { data: quotes, setData: setQuotes } = useResource<QuoteRequest[]>('/quote-requests', []);
  const { data: users } = useResource<User[]>(
    isAdmin ? '/users' : '',
    [],
    [],
    15_000
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [selectedQuote, setSelectedQuote] = useState<QuoteRequest | null>(null);
  const [quoteResponse, setQuoteResponse] = useState('');
  const [quotedAmount, setQuotedAmount] = useState('');
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState<OrderStatus>('approved');
  const [visibleCols, setVisibleCols] = useState({
    project: true,
    payment: true,
    date: true,
  });
  const [orderLogs, setOrderLogs] = useState<{ id: string; timestamp: string; action: string; details: string }[]>([]);
  const [cancelReasonDraft, setCancelReasonDraft] = useState('Cancelled by admin');
  const [orderActionErrors, setOrderActionErrors] = useState<Record<string, string>>({});
  const [assignedSalesAgentDraft, setAssignedSalesAgentDraft] = useState<string>('unassigned');
  const selectedTotals = selectedOrder
    ? calcTotalsFromItems(
        selectedOrder.items.map((item) => ({ quantity: item.quantity, unitPrice: item.unitPrice }))
      )
    : null;
  const vatLabel = Math.round(VAT_RATE * 100);

  const fetchOrders = useCallback(async () => {
      setOrdersLoading(true);
      try {
        const response = await apiClient.get('/orders', {
          params: {
            q: searchTerm || undefined,
            status: statusFilter !== 'all' ? statusFilter : undefined,
            page: 1,
            pageSize: 1000,
            sortBy: sortKey,
            sortDir,
          onlyDeleted: undefined,
          },
        });
        const payload = response.data;
        const normalizeOrders = (items: any[]) =>
          items.map((order) => ({
            ...order,
            status: String(order.status || 'pending').toLowerCase(),
            paymentStatus: String(order.paymentStatus || 'pending').toLowerCase(),
          }));
        if (payload?.data) {
          const normalized = normalizeOrders(payload.data);
          setOrders(normalized);
          setOrdersTotal(normalized.length);
          setCache('admin-orders', normalized);
          setLastUpdated(Date.now());
        } else {
          const normalized = Array.isArray(payload) ? normalizeOrders(payload) : [];
          setOrders(normalized);
          setOrdersTotal(normalized.length || 0);
          setCache('admin-orders', normalized);
          setLastUpdated(Date.now());
        }
      } catch (err) {
        setOrders([]);
        setOrdersTotal(0);
      } finally {
        setOrdersLoading(false);
      }
    }, [ordersPage, ordersPageSize, searchTerm, statusFilter, sortKey, sortDir]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    setOrdersPage(1);
  }, [searchTerm, statusFilter, sortKey, sortDir]);

  useEffect(() => {
    const handleFocus = () => fetchOrders();
    window.addEventListener('focus', handleFocus);
    const interval = window.setInterval(() => fetchOrders(), 30000);
    return () => {
      window.removeEventListener('focus', handleFocus);
      window.clearInterval(interval);
    };
  }, [fetchOrders]);

  const filteredOrders = orders;
  const ordersPageStart = (ordersPage - 1) * ordersPageSize;
  const ordersPageEnd = ordersPageStart + ordersPageSize;
  const pagedOrders = filteredOrders.slice(ordersPageStart, ordersPageEnd);
  const totalFilteredOrders = filteredOrders.length;
  const tableColSpan = 6 + Number(visibleCols.project) + Number(visibleCols.payment) + Number(visibleCols.date);

  const pendingQuotes = quotes.filter((q) => q.status === 'pending');
  const salesAgents = users.filter((entry) => {
    const roles = entry.roles?.length ? entry.roles : [entry.role];
    return roles.includes('sales_agent');
  });

  useEffect(() => {
    if (!selectedOrder || !isAdmin) {
      setOrderLogs([]);
      return;
    }
    apiClient
      .get('/audit-logs', { params: { q: selectedOrder.orderNumber } })
      .then((res) => {
        const payload = res.data?.data || res.data || [];
        setOrderLogs(payload);
      })
      .catch(() => setOrderLogs([]));
  }, [selectedOrder, user?.role]);

  useEffect(() => {
    if (!selectedOrder) return;
    setCancelReasonDraft(selectedOrder.cancelReason || 'Cancelled by admin');
    setAssignedSalesAgentDraft(selectedOrder.assignedSalesAgentId || 'unassigned');
  }, [selectedOrder]);

  const handleSaveSalesAgentAssignment = async () => {
    if (!selectedOrder || !isAdmin) return;
    try {
      const response = await apiClient.put<Order>(`/orders/${selectedOrder.id}/assignment`, {
        assignedSalesAgentId: assignedSalesAgentDraft === 'unassigned' ? 'unassigned' : assignedSalesAgentDraft,
      });
      setOrders((prev) => prev.map((order) => (order.id === selectedOrder.id ? response.data : order)));
      setSelectedOrder(response.data);
      toast({
        title: 'Assignment saved',
        description: response.data.assignedSalesAgentName
          ? `Assigned to ${response.data.assignedSalesAgentName}.`
          : 'Order is now unassigned.',
      });
    } catch (error: any) {
      toast({
        title: 'Unable to save assignment',
        description: error?.response?.data?.error || 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleUpdateOrderStatus = (orderId: string, newStatus: OrderStatus, reason?: string) => {
    if (newStatus === 'cancelled' && (!reason || !reason.trim())) {
      setOrderActionErrors({ cancelReason: 'Cancellation reason is required.' });
      toast({
        title: 'Missing reason',
        description: 'Please provide a cancellation reason.',
        variant: 'destructive',
      });
      return;
    }
    setOrders(orders.map((o) => (o.id === orderId ? { ...o, status: newStatus, cancelReason: reason } : o)));
    apiClient.put<Order>(`/orders/${orderId}`, { status: newStatus, cancelReason: reason }).catch(() => {
      // keep optimistic update
    });
    toast({
      title: 'Order Updated',
      description: `Order status changed to ${newStatus}`,
    });
    setSelectedOrder(null);
    setOrderActionErrors({});
  };

  // Archived/restore removed for orders per latest direction

  const toggleOrderSelect = (id: string) => {
    setSelectedOrderIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  };

  const toggleSelectAllOrders = (items: Order[]) => {
    const allIds = items.map((item) => item.id);
    const allSelected = allIds.every((id) => selectedOrderIds.includes(id));
    setSelectedOrderIds(allSelected ? [] : allIds);
  };

  const applyBulkStatus = () => {
    if (selectedOrderIds.length === 0) return;
    setOrders((prev) =>
      prev.map((o) => (selectedOrderIds.includes(o.id) ? { ...o, status: bulkStatus } : o))
    );
    selectedOrderIds.forEach((id) => {
      apiClient.put(`/orders/${id}`, { status: bulkStatus }).catch(() => {
        // keep optimistic update
      });
    });
    setSelectedOrderIds([]);
  };

  const handleRespondToQuote = () => {
    if (!selectedQuote || !quotedAmount) return;
    setQuotes(
      quotes.map((q) =>
        q.id === selectedQuote.id
          ? {
              ...q,
              status: 'responded' as const,
              respondedAt: new Date().toISOString(),
              quotedAmount: parseFloat(quotedAmount),
            }
          : q
      )
    );
    toast({
      title: 'Quote Sent',
      description: `Quote response sent to ${selectedQuote.clientName}`,
    });
    apiClient
      .put<QuoteRequest>(`/quote-requests/${selectedQuote.id}`, {
        status: 'responded',
        respondedAt: new Date().toISOString(),
        quotedAmount: parseFloat(quotedAmount),
        responseMessage: quoteResponse,
      })
      .catch(() => {
        // keep optimistic update
      });
    setSelectedQuote(null);
    setQuoteResponse('');
    setQuotedAmount('');
  };

  const handlePrintOrder = (order: Order) => {
    const totals = calcTotalsFromItems(
      order.items.map((item) => ({ quantity: item.quantity, unitPrice: item.unitPrice }))
    );
    const vatLabel = Math.round(VAT_RATE * 100);
    const itemsHtml = order.items
      .map(
        (item) => {
          const line = calcLineAmounts(item.quantity, item.unitPrice);
          return `<tr><td>${item.itemName}</td><td>${item.unit}</td><td>${item.quantity}</td><td>₱${item.unitPrice.toFixed(2)}</td><td>₱${line.net.toFixed(2)}</td></tr>`;
        }
      )
      .join('');
    printHtml(
      `Order ${order.orderNumber}`,
      `<h1>Client Order</h1>
      <div class=\"meta meta-inline\"><span class=\"doc-label\">Order #:</span><span class=\"doc-code\">${order.orderNumber}</span></div>
      <div class=\"meta\">Date: ${format(new Date(order.createdAt), 'yyyy-MM-dd')}</div>
      <div class=\"meta\">Client: ${order.clientName}</div>
      <div class=\"meta\">Project: ${order.projectName || 'N/A'}</div>
      <div class=\"meta\">Status: ${order.status}</div>
      <div class=\"meta\">Payment: ${order.paymentStatus}</div>
      <table>
        <thead><tr><th>Item</th><th>Unit</th><th>Qty</th><th>Unit Price</th><th>Amount</th></tr></thead>
        <tbody>${itemsHtml}</tbody>
      </table>
      <div class=\"total\">VATable Sales: ₱${totals.net.toFixed(2)}</div>
      <div class=\"total\">VAT (${vatLabel}%): ₱${totals.vat.toFixed(2)}</div>
      <div class=\"total\">Total Amount Due: ₱${totals.total.toFixed(2)}</div>`
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">
            {isSalesAgent && !isAdmin ? 'My Client Orders & Quotes' : 'Client Orders & Quotes'}
          </h2>
          <p className="text-muted-foreground">
            {isSalesAgent && !isAdmin
              ? 'Orders and quote requests assigned to you'
              : 'Manage client orders and respond to quote requests'}
          </p>
        </div>
        {lastUpdated && (
          <p className="text-xs text-muted-foreground">
            Last updated {new Date(lastUpdated).toLocaleTimeString()}
          </p>
        )}
      </div>

      <div className="space-y-4">
          <Tabs defaultValue="orders" className="space-y-4">
        <TabsList>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="quotes" className="relative">
            Pending Quotes
            {pendingQuotes.length > 0 && (
              <Badge className="ml-2 bg-primary text-primary-foreground text-xs">
                {pendingQuotes.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search orders..."
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setOrdersPage(1);
                    }}
                    className="pl-10"
                  />
                </div>
                <Select
                  value={statusFilter}
                  onValueChange={(value) => {
                    setStatusFilter(value);
                    setOrdersPage(1);
                  }}
                >
                  <SelectTrigger className="w-full lg:w-[180px]">
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="processing">Processing</SelectItem>
                    <SelectItem value="ready-for-delivery">Ready for Delivery</SelectItem>
                    <SelectItem value="delivered">Delivered</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sortKey} onValueChange={(value) => setSortKey(value as typeof sortKey)}>
                  <SelectTrigger className="w-full lg:w-[180px]">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="createdAt">Sort: Date</SelectItem>
                    <SelectItem value="total">Sort: Total</SelectItem>
                    <SelectItem value="status">Sort: Status</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sortDir} onValueChange={(value) => setSortDir(value as typeof sortDir)}>
                  <SelectTrigger className="w-full lg:w-[140px]">
                    <SelectValue placeholder="Direction" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="desc">Desc</SelectItem>
                    <SelectItem value="asc">Asc</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  onClick={() => {
                    const rows = [
                      ['Order #', 'Client', 'Project', 'Status', 'Payment', 'Total', 'Created'],
                      ...orders.map((o) => [
                        o.orderNumber,
                        o.clientName,
                        o.projectName || '',
                        o.status,
                        o.paymentStatus,
                        String(o.total),
                        o.createdAt,
                      ]),
                    ];
                    downloadCsv(`client-orders-${format(new Date(), 'yyyy-MM-dd')}.csv`, rows);
                  }}
                >
                  <Download size={16} className="mr-2" />
                  Export CSV
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline">Columns</Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                <DropdownMenuCheckboxItem
                  checked={visibleCols.project}
                  onCheckedChange={(checked) => setVisibleCols((prev) => ({ ...prev, project: Boolean(checked) }))}
                >
                  Project
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={visibleCols.payment}
                  onCheckedChange={(checked) => setVisibleCols((prev) => ({ ...prev, payment: Boolean(checked) }))}
                >
                  Payment
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={visibleCols.date}
                  onCheckedChange={(checked) => setVisibleCols((prev) => ({ ...prev, date: Boolean(checked) }))}
                >
                  Date
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardContent>
      </Card>

          {selectedOrderIds.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 border rounded-md bg-muted/40">
              <span className="text-sm text-muted-foreground">
                {selectedOrderIds.length} selected
              </span>
              <div className="flex flex-col sm:flex-row gap-2">
                <Select value={bulkStatus} onValueChange={(value) => setBulkStatus(value as OrderStatus)}>
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue placeholder="Set status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="processing">Processing</SelectItem>
                    <SelectItem value="ready-for-delivery">Ready for Delivery</SelectItem>
                    <SelectItem value="delivered">Delivered</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={() => setSelectedOrderIds([])}>
                  Clear
                </Button>
                <Button onClick={applyBulkStatus}>Apply Status</Button>
              </div>
            </div>
          )}

          {/* Orders Table */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">
                      <Checkbox
                        checked={filteredOrders.length > 0 && filteredOrders.every((o) => selectedOrderIds.includes(o.id))}
                        onCheckedChange={() => toggleSelectAllOrders(filteredOrders)}
                      />
                    </TableHead>
                    <TableHead>Order #</TableHead>
                    <TableHead>Client</TableHead>
                    {visibleCols.project && <TableHead>Project</TableHead>}
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Status</TableHead>
                    {visibleCols.payment && <TableHead>Payment</TableHead>}
                    {visibleCols.date && <TableHead>Date</TableHead>}
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ordersLoading && filteredOrders.length === 0 ? (
                    Array.from({ length: 6 }).map((_, idx) => (
                      <TableRow key={`sk-${idx}`}>
                        <TableCell colSpan={tableColSpan}>
                          <Skeleton className="h-6 w-full" />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    pagedOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedOrderIds.includes(order.id)}
                          onCheckedChange={() => toggleOrderSelect(order.id)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{order.orderNumber}</TableCell>
                      <TableCell>{order.clientName}</TableCell>
                      {visibleCols.project && (
                        <TableCell className="max-w-[200px] truncate">
                          {order.projectName || '-'}
                        </TableCell>
                      )}
                      <TableCell className="text-right font-medium">
                        ₱{order.total.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge className={statusColors[order.status]}>{order.status}</Badge>
                      </TableCell>
                      {visibleCols.payment && (
                        <TableCell>
                          <Badge
                            variant={order.paymentStatus === 'paid' ? 'default' : 'outline'}
                            className={
                              order.paymentStatus === 'paid'
                                ? 'bg-green-600'
                                : order.paymentStatus === 'verified'
                                ? 'bg-blue-600 text-white'
                                : ''
                            }
                          >
                            {order.paymentStatus}
                          </Badge>
                        </TableCell>
                      )}
                      {visibleCols.date && (
                        <TableCell>{format(new Date(order.createdAt), 'MMM dd, yyyy')}</TableCell>
                      )}
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => setSelectedOrder(order)}>
                          <Eye size={16} className="mr-1" />
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                    ))
                  )}
                </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="flex items-center justify-center">
          <PaginationNav
            page={ordersPage}
            totalPages={Math.max(Math.ceil(totalFilteredOrders / ordersPageSize), 1)}
            onPageChange={setOrdersPage}
            disabled={ordersLoading}
          />
        </div>
          </TabsContent>

          <TabsContent value="quotes" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Quote Requests</CardTitle>
              <CardDescription>
                Respond to client requests for bulk orders and custom items
              </CardDescription>
            </CardHeader>
            <CardContent>
              {quotes.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No quote requests yet</p>
              ) : (
                <div className="space-y-4">
                  {quotes.map((quote) => (
                    <div
                      key={quote.id}
                      className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium">{quote.clientName}</h4>
                            <Badge
                              variant={quote.status === 'pending' ? 'outline' : 'default'}
                              className={
                                quote.status === 'responded'
                                  ? 'bg-green-600'
                                  : quote.status === 'accepted'
                                  ? 'bg-blue-600'
                                  : ''
                              }
                            >
                              {quote.status}
                            </Badge>
                          </div>
                          {quote.projectName && (
                            <p className="text-sm text-muted-foreground">{quote.projectName}</p>
                          )}
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {format(new Date(quote.createdAt), 'MMM dd, yyyy')}
                        </span>
                      </div>
                      <div className="mt-3">
                        <p className="text-sm font-medium mb-1">Requested Items:</p>
                        <ul className="text-sm text-muted-foreground list-disc list-inside">
                          {quote.items.map((item, idx) => (
                            <li key={idx}>
                              {item.name} x {item.quantity}
                              {item.notes && ` (${item.notes})`}
                            </li>
                          ))}
                        </ul>
                      </div>
                      {quote.customRequirements && (
                        <p className="mt-2 text-sm text-muted-foreground italic">
                          "{quote.customRequirements}"
                        </p>
                      )}
                      {quote.quotedAmount && (
                        <p className="mt-2 text-sm font-medium text-primary">
                          Quoted: ₱{quote.quotedAmount.toLocaleString()}
                        </p>
                      )}
                      {quote.status === 'pending' && (
                        <Button
                          size="sm"
                          className="mt-3"
                          onClick={() => setSelectedQuote(quote)}
                        >
                          <MessageSquare size={14} className="mr-1" />
                          Respond
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
          </Tabs>
      </div>

      {/* Order Detail Dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Order {selectedOrder?.orderNumber}</DialogTitle>
            <DialogDescription>
              {selectedOrder?.clientName} • {selectedOrder?.projectName}
            </DialogDescription>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-center">Qty</TableHead>
                      <TableHead className="text-right">Unit Price</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedOrder.items.map((item) => {
                      const line = calcLineAmounts(item.quantity, item.unitPrice);
                      return (
                        <TableRow key={item.itemId}>
                          <TableCell>{item.itemName}</TableCell>
                          <TableCell className="text-center">
                            {item.quantity} {item.unit}
                          </TableCell>
                          <TableCell className="text-right">₱{item.unitPrice.toFixed(2)}</TableCell>
                          <TableCell className="text-right">₱{line.net.toFixed(2)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <div className="text-right space-y-1">
                <p className="text-sm">
                  VATable Sales: <span className="font-medium">₱{selectedTotals?.net.toFixed(2)}</span>
                </p>
                <p className="text-sm">
                  VAT ({vatLabel}%): <span className="font-medium">₱{selectedTotals?.vat.toFixed(2)}</span>
                </p>
                <p className="text-lg font-bold">
                  Total Amount Due: <span className="text-primary">₱{selectedTotals?.total.toFixed(2)}</span>
                </p>
              </div>
              {isAdmin && (
                <div className="mt-4 rounded-lg border p-3">
                  <p className="text-sm font-medium mb-2">Recent Activity</p>
                  {orderLogs.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No recent activity.</p>
                  ) : (
                    <div className="space-y-2">
                      {orderLogs.slice(0, 5).map((log) => (
                        <div key={log.id} className="text-xs text-muted-foreground">
                          {new Date(log.timestamp).toLocaleString('en-PH')} • {log.action} • {log.details}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {(selectedOrder.poMatchStatus || selectedOrder.chequeVerification) && (
                <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                  {(selectedOrder.poMatchStatus || selectedOrder.chequeVerification) === 'genuine' ? (
                    <>
                      <CheckCircle className="text-green-600" size={20} />
                      <span className="text-green-700 font-medium">Purchase Order Match Confirmed</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="text-red-600" size={20} />
                      <span className="text-red-700 font-medium">Purchase Order Mismatch Detected</span>
                    </>
                  )}
                </div>
              )}
              {(selectedOrder.poDocumentUrl || selectedOrder.chequeImage) && (
                <div className="rounded-lg border p-3 space-y-2">
                  <p className="text-sm font-medium">Uploaded Purchase Order</p>
                  {(selectedOrder.poDocumentUrl || selectedOrder.chequeImage || '').toLowerCase().endsWith('.pdf') ? (
                    <a
                      className="text-sm text-primary underline"
                      href={selectedOrder.poDocumentUrl || selectedOrder.chequeImage}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View uploaded PDF
                    </a>
                  ) : (
                    <img
                      src={selectedOrder.poDocumentUrl || selectedOrder.chequeImage}
                      alt="Uploaded purchase order"
                      className="w-full max-w-md rounded border"
                    />
                  )}
                </div>
              )}
              {selectedOrder.status === 'cancelled' && (
                <div className="p-3 rounded-lg bg-destructive/10 text-sm text-destructive">
                  Cancelled: {selectedOrder.cancelReason || 'No reason provided'}
                </div>
              )}
              {isAdmin && (
                <div className="rounded-lg border p-3 space-y-3">
                  <div>
                    <p className="text-sm font-medium">Assign to Sales Agent</p>
                    <p className="text-xs text-muted-foreground">
                      Only admin can manage manual assignment for order ownership.
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Select value={assignedSalesAgentDraft} onValueChange={setAssignedSalesAgentDraft}>
                      <SelectTrigger className="sm:flex-1">
                        <SelectValue placeholder="Select sales agent" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        {salesAgents.map((agent) => (
                          <SelectItem key={agent.id} value={agent.id}>
                            {agent.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      onClick={handleSaveSalesAgentAssignment}
                      disabled={assignedSalesAgentDraft === (selectedOrder.assignedSalesAgentId || 'unassigned')}
                    >
                      Save
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Current assignment: {selectedOrder.assignedSalesAgentName || 'Unassigned'}
                  </p>
                </div>
              )}
              {canManageOrders && selectedOrder.status === 'pending' && (
                <div className="rounded-lg border p-3 space-y-2">
                  <p className="text-sm font-medium">Cancellation reason</p>
                  <Textarea
                    value={cancelReasonDraft}
                    onChange={(e) => {
                      setCancelReasonDraft(e.target.value);
                      if (orderActionErrors.cancelReason) {
                        setOrderActionErrors((prev) => ({ ...prev, cancelReason: '' }));
                      }
                    }}
                    placeholder="Add a reason for cancellation..."
                    className="min-h-[80px]"
                  />
                  {orderActionErrors.cancelReason && (
                    <p className="text-xs text-destructive">{orderActionErrors.cancelReason}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    This reason will be visible to the client.
                  </p>
                </div>
              )}
              <div className="flex gap-2 justify-end pt-4 border-t">
                <Button variant="outline" onClick={() => setSelectedOrder(null)}>
                  Close
                </Button>
                <Button variant="outline" onClick={() => handlePrintOrder(selectedOrder)}>
                  <FileText size={16} className="mr-1" />
                  Download PDF
                </Button>
                {canManageOrders && selectedOrder.status === 'pending' && (
                  <>
                    <Button
                      className="bg-red-600 hover:bg-red-700 text-white"
                      onClick={() =>
                        handleUpdateOrderStatus(
                          selectedOrder.id,
                          'cancelled',
                          cancelReasonDraft?.trim() || 'Cancelled by admin'
                        )
                      }
                    >
                      Reject
                    </Button>
                  {(isAdmin || isSalesAgent) && (
                    <Button
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={() => handleUpdateOrderStatus(selectedOrder.id, 'approved')}
                    >
                      Approve
                    </Button>
                  )}
                </>
              )}
                {canManageOrders && (isAdmin || isWarehouseStaff) && selectedOrder.status === 'approved' && (
                  <Button
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={() => handleUpdateOrderStatus(selectedOrder.id, 'processing')}
                  >
                    Start Processing
                  </Button>
                )}
                {canManageOrders && (isAdmin || isWarehouseStaff) && selectedOrder.status === 'processing' && (
                  <Button
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={() => handleUpdateOrderStatus(selectedOrder.id, 'ready-for-delivery')}
                  >
                    Mark Ready for Delivery
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Quote Response Dialog */}
      <Dialog open={!!selectedQuote} onOpenChange={() => setSelectedQuote(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Respond to Quote Request</DialogTitle>
            <DialogDescription>
              {selectedQuote?.clientName} • {selectedQuote?.projectName}
            </DialogDescription>
          </DialogHeader>
          {selectedQuote && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium mb-2">Requested Items:</p>
                <ul className="text-sm text-muted-foreground list-disc list-inside">
                  {selectedQuote.items.map((item, idx) => (
                    <li key={idx}>
                      {item.name} x {item.quantity}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <label className="text-sm font-medium">Quoted Amount (₱)</label>
                <Input
                  type="number"
                  placeholder="Enter total quote amount"
                  value={quotedAmount}
                  onChange={(e) => setQuotedAmount(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Response Message</label>
                <Textarea
                  placeholder="Add any notes or details about the quote..."
                  value={quoteResponse}
                  onChange={(e) => setQuoteResponse(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <Button
                  className="bg-red-600 hover:bg-red-700 text-white"
                  onClick={() => setSelectedQuote(null)}
                >
                  Cancel
                </Button>
                <Button onClick={handleRespondToQuote} disabled={!quotedAmount}>
                  Send Quote
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
