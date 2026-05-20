import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Package, FileText, Download, RotateCcw, Upload, Clock, CheckCircle, Truck, CreditCard } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { Delivery, Order, OrderStatus, Project } from '@/types';
import { cn } from '@/lib/utils';
import { calcLineAmounts, calcTotalsFromItems, VAT_RATE } from '@/lib/vat';
import { useToast } from '@/hooks/use-toast';
import { apiClient } from '@/api/client';
import { getCache, setCache } from '@/hooks/cache';
import { Skeleton } from '@/components/ui/skeleton';
import { printHtml } from '@/utils/print';
import { useResource } from '@/hooks/use-resource';
import PaginationNav from '@/components/PaginationNav';
import LiveTrackingDialog from '@/components/LiveTrackingDialog';
import { ProductImage } from '@/components/ProductImage';
import { formatPesoAmount } from '@/lib/currency';

export default function MyOrdersPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const { orderId } = useParams();
  const [orders, setOrders] = useState<Order[]>(() => getCache<Order[]>('client-orders') || []);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersPageSize] = useState(10);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'my-orders' | 'my-deliveries'>(
    searchParams.get('tab') === 'my-deliveries' ? 'my-deliveries' : 'my-orders'
  );
  const [orderSearchTerm, setOrderSearchTerm] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>(
    searchParams.get('tab') === 'past-orders' ? 'delivered' : 'all'
  );
  const [deliverySearchTerm, setDeliverySearchTerm] = useState('');
  const [deliveryStatusFilter, setDeliveryStatusFilter] = useState<string>('all');
  const { data: projects } = useResource<Project[]>('/projects', []);
  const { data: deliveries, reload: reloadDeliveries } = useResource<Delivery[]>('/deliveries', []);

  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [trackingDelivery, setTrackingDelivery] = useState<Delivery | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<'genuine' | 'fraud' | null>(null);
  const [poMatchSource, setPoMatchSource] = useState<'ocr' | 'typed-code' | 'test' | 'none' | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string>('');
  const [poCodeInput, setPoCodeInput] = useState('');
  const [useTestVerification, setUseTestVerification] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filter orders for current client's company
  const clientOrders = orders;
  const myDeliveries = deliveries
    .sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime());
  const filteredDeliveries = useMemo(() => {
    const query = deliverySearchTerm.trim().toLowerCase();
    return myDeliveries.filter((delivery) => {
      const matchesSearch =
        !query ||
        delivery.drNumber.toLowerCase().includes(query) ||
        delivery.orderNumber.toLowerCase().includes(query) ||
        (delivery.projectName || '').toLowerCase().includes(query) ||
        delivery.items.some((item) => item.itemName.toLowerCase().includes(query));
      const matchesStatus = deliveryStatusFilter === 'all' || delivery.status === deliveryStatusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [deliverySearchTerm, deliveryStatusFilter, myDeliveries]);
  const projectStatusById = projects.reduce<Record<string, Project['status']>>((acc, project) => {
    acc[project.id] = project.status;
    return acc;
  }, {});
  const selectedDelivery = selectedOrder
    ? myDeliveries.find((delivery) => delivery.orderId === selectedOrder.id) || null
    : null;
  const selectedTotals = selectedOrder
    ? calcTotalsFromItems(
        selectedOrder.items.map((item) => ({
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        }))
      )
    : null;
  const vatLabel = Math.round(VAT_RATE * 100);

  const getDeliveryBadge = (status: Delivery['status']) => {
    switch (status) {
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800">Pending Dispatch</Badge>;
      case 'in-transit':
        return <Badge className="bg-blue-100 text-blue-800 gap-1"><Truck size={12} />In Transit</Badge>;
      case 'delivered':
        return <Badge className="bg-green-100 text-green-800 gap-1"><CheckCircle size={12} />Delivered</Badge>;
      case 'delayed':
        return <Badge className="bg-orange-100 text-orange-800 gap-1"><Clock size={12} />Delayed</Badge>;
      case 'return-pending':
        return <Badge className="bg-orange-100 text-orange-800">Return Pending</Badge>;
      case 'return-rejected':
        return <Badge className="bg-slate-100 text-slate-700">Return Rejected</Badge>;
      case 'returned':
        return <Badge className="bg-red-100 text-red-800">Returned</Badge>;
    }
  };

  const buildOrderTimeline = (order: Order, delivery: Delivery | null) => [
    {
      label: 'Ordered',
      date: order.createdAt,
      active: true,
      tone: 'bg-green-600',
    },
    {
      label: 'Approved',
      date: ['approved', 'processing', 'ready-for-delivery', 'delivered'].includes(order.status) ? order.updatedAt : null,
      active: ['approved', 'processing', 'ready-for-delivery', 'delivered'].includes(order.status),
      tone: 'bg-green-600',
    },
    {
      label: 'Processing',
      date: ['processing', 'ready-for-delivery', 'delivered'].includes(order.status) ? order.updatedAt : null,
      active: ['processing', 'ready-for-delivery', 'delivered'].includes(order.status),
      tone: 'bg-blue-600',
    },
    {
      label: 'Shipped',
      date: ['ready-for-delivery', 'delivered'].includes(order.status) ? order.updatedAt : null,
      active: ['ready-for-delivery', 'delivered'].includes(order.status),
      tone: 'bg-blue-600',
    },
    {
      label: 'In Transit',
      date: delivery?.status === 'in-transit' || delivery?.status === 'delivered' ? delivery?.issuedAt || null : null,
      active: delivery?.status === 'in-transit' || delivery?.status === 'delivered',
      tone: 'bg-sky-600',
    },
    {
      label: 'Delivered',
      date: delivery?.receivedAt || null,
      active: delivery?.status === 'delivered' || order.status === 'delivered',
      tone: 'bg-green-600',
    },
  ];

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case 'pending':
        return <Badge className="bg-warning text-warning-foreground gap-1"><Clock size={12} />Pending</Badge>;
      case 'approved':
        return <Badge className="bg-info text-info-foreground gap-1"><CheckCircle size={12} />Approved</Badge>;
      case 'processing':
        return <Badge className="bg-info text-info-foreground gap-1"><Package size={12} />Processing</Badge>;
      case 'ready-for-delivery':
        return <Badge className="bg-secondary gap-1"><Truck size={12} />Ready for Delivery</Badge>;
      case 'delivered':
        return <Badge className="bg-success text-success-foreground gap-1"><CheckCircle size={12} />Delivered</Badge>;
      case 'cancelled':
        return <Badge className="bg-destructive text-destructive-foreground">Cancelled</Badge>;
    }
  };

  const getStatusExplanation = (status: OrderStatus) => {
    switch (status) {
      case 'pending':
        return 'Waiting for admin approval.';
      case 'approved':
        return 'Approved and ready for warehouse processing.';
      case 'processing':
        return 'Warehouse is preparing your items.';
      case 'ready-for-delivery':
        return 'Packed and waiting for dispatch.';
      case 'delivered':
        return 'Completed and received.';
      case 'cancelled':
        return 'This order was cancelled.';
    }
  };

  const getPaymentBadge = (status: Order['paymentStatus']) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="border-warning text-warning">Unpaid</Badge>;
      case 'verified':
        return <Badge className="bg-success/10 text-success border-success/20" variant="outline">Verified</Badge>;
      case 'paid':
        return <Badge className="bg-success text-success-foreground gap-1"><CreditCard size={12} />Paid</Badge>;
      case 'failed':
        return <Badge className="bg-destructive text-destructive-foreground">Failed</Badge>;
    }
  };

  const handleRowClick = (order: Order) => {
    setSelectedOrder(order);
    setIsDetailOpen(true);
  };

  const handleReorder = (order: Order) => {
    toast({
      title: 'Items added to cart',
      description: 'Items added to cart. You can now review and place the order.',
    });
    localStorage.setItem('reorder_cart', JSON.stringify(order.items));
    navigate('/client/order');
  };

  const handleUploadPayment = () => {
    setPoCodeInput(selectedOrder?.orderNumber || '');
    setSelectedFileName('');
    setUploadError('');
    setVerificationResult(null);
    setPoMatchSource(null);
    setIsUploadOpen(true);
  };

  const simulateAIVerification = async (file?: File) => {
    if (!selectedOrder) return;
    setIsVerifying(true);
    setVerificationResult(null);
    setUploadError('');

    try {
      if (!poCodeInput.trim()) {
        setUploadError('Please enter the purchase order code.');
        toast({
          title: 'PO code required',
          description: 'Enter the purchase order code so we can match it to your order.',
          variant: 'destructive',
        });
        return;
      }
      if (!file && !useTestVerification) {
        setUploadError('Please choose a purchase order file.');
        toast({
          title: 'No file selected',
          description: 'Please choose a purchase order file.',
          variant: 'destructive',
        });
        return;
      }
      const formData = new FormData();
      if (file) {
        formData.append('proof', file);
      }
      formData.append('poCode', poCodeInput.trim());
      const res = await apiClient.post(`/orders/${selectedOrder.id}/payment-proof`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          ...(useTestVerification ? { 'X-Test-Verification': 'true' } : {}),
        },
      });
      const paymentStatus = (res.data?.paymentStatus || selectedOrder.paymentStatus || '').toLowerCase();
      const poMatchStatus = (
        res.data?.poMatchStatus ||
        res.data?.chequeVerification ||
        selectedOrder.poMatchStatus ||
        selectedOrder.chequeVerification ||
        ''
      ).toLowerCase();
      const updatedOrder = {
        ...selectedOrder,
        paymentStatus: paymentStatus || selectedOrder.paymentStatus,
        chequeVerification: poMatchStatus || selectedOrder.chequeVerification,
        poMatchStatus: poMatchStatus || selectedOrder.poMatchStatus,
        chequeImage: res.data?.paymentProofUrl || selectedOrder.chequeImage,
        poDocumentUrl: res.data?.poDocumentUrl || res.data?.paymentProofUrl || selectedOrder.poDocumentUrl,
      } as Order;
      setVerificationResult(poMatchStatus === 'genuine' ? 'genuine' : 'fraud');
      const matchSource = res.data?.poMatch?.matchSource;
      setPoMatchSource(matchSource || (poMatchStatus === 'genuine' ? 'typed-code' : 'none'));
      setSelectedOrder(updatedOrder);
      setOrders((prev) => prev.map((o) => (o.id === selectedOrder.id ? updatedOrder : o)));
      setCache(
        'client-orders',
        (getCache<Order[]>('client-orders') || []).map((o) =>
          o.id === selectedOrder.id ? updatedOrder : o
        )
      );
      toast({
        title: poMatchStatus === 'genuine' ? 'Purchase Order Matched' : 'Purchase Order Mismatch',
        description:
          poMatchStatus === 'genuine'
            ? matchSource === 'ocr'
              ? 'OCR found this order code. Admin approval is still required.'
              : 'Your purchase order matches this order and is waiting for admin approval.'
            : 'The uploaded purchase order code does not match this order yet.',
      });
      refreshOrders();
    } catch (err) {
      setVerificationResult(null);
      const message =
        (err as any)?.response?.data?.error || 'Please try again or contact support.';
      toast({
        title: 'PO Matching Failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleDownloadInvoice = (order: Order) => {
    const totals = calcTotalsFromItems(
      order.items.map((item) => ({ quantity: item.quantity, unitPrice: item.unitPrice }))
    );
    const vatLabel = Math.round(VAT_RATE * 100);
    const itemsHtml = order.items
      .map(
        (item) => {
          const line = calcLineAmounts(item.quantity, item.unitPrice);
          return `<tr><td>${item.itemName}</td><td>${item.unit}</td><td>${item.quantity}</td><td>₱${formatPesoAmount(item.unitPrice)}</td><td>₱${formatPesoAmount(line.net)}</td></tr>`;
        }
      )
      .join('');
    printHtml(
      `Invoice ${order.orderNumber}`,
      `<h1>Client Invoice</h1>
      <div class="meta meta-inline"><span class="doc-label">Invoice #:</span><span class="doc-code">${order.orderNumber}</span></div>
      <div class="meta">Client: ${order.clientName}</div>
      <div class="meta">Status: ${order.status}</div>
      <table>
        <thead><tr><th>Item</th><th>Unit</th><th>Qty</th><th>Unit Price</th><th>Amount</th></tr></thead>
        <tbody>${itemsHtml}</tbody>
      </table>
      <div class="total">VATable Sales: ₱${formatPesoAmount(totals.net)}</div>
      <div class="total">VAT (${vatLabel}%): ₱${formatPesoAmount(totals.vat)}</div>
      <div class="total">Total Amount Due: ₱${formatPesoAmount(totals.total)}</div>`
    );
  };

  const handleDownloadDR = (order: Order) => {
    const itemsHtml = order.items
      .map(
        (item) =>
          `<tr><td>${item.itemName}</td><td>${item.unit}</td><td>${item.quantity}</td></tr>`
      )
      .join('');
    printHtml(
      `Delivery Receipt ${order.orderNumber}`,
      `<h1>Delivery Receipt</h1>
      <div class="meta meta-inline"><span class="doc-label">DR #:</span><span class="doc-code">${order.orderNumber}</span></div>
      <div class="meta">Client: ${order.clientName}</div>
      <table>
        <thead><tr><th>Item</th><th>Unit</th><th>Qty</th></tr></thead>
        <tbody>${itemsHtml}</tbody>
      </table>`
    );
  };

  const refreshOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const statusParam =
        orderStatusFilter === 'all'
          ? undefined
          : orderStatusFilter === 'ready-for-delivery'
            ? 'SHIPPED'
            : orderStatusFilter.toUpperCase();
      const params: Record<string, string | number | undefined> = {
        page: ordersPage,
        pageSize: ordersPageSize,
        q: orderSearchTerm.trim() || undefined,
        status: statusParam,
      };
      const response = await apiClient.get('/orders', { params });
      const payload = response.data;
      if (payload?.data) {
        setOrders(payload.data);
        setOrdersTotal(payload.total || payload.data.length);
        setCache('client-orders', payload.data);
      } else {
        setOrders(payload);
        setOrdersTotal(payload.length || 0);
        setCache('client-orders', payload);
      }
    } catch (err) {
      setOrders([]);
      setOrdersTotal(0);
    } finally {
      setOrdersLoading(false);
    }
  }, [orderSearchTerm, orderStatusFilter, ordersPage, ordersPageSize]);

  useEffect(() => {
    refreshOrders();
  }, [refreshOrders]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      refreshOrders();
      reloadDeliveries();
    }, 5000);
    return () => window.clearInterval(interval);
  }, [refreshOrders, reloadDeliveries]);

  useEffect(() => {
    const requestedTab =
      searchParams.get('tab') === 'my-deliveries'
        ? 'my-deliveries'
        : 'my-orders';
    if (requestedTab !== activeTab) {
      setActiveTab(requestedTab);
    }
  }, [activeTab, searchParams]);

  useEffect(() => {
    setOrdersPage(1);
  }, [orderSearchTerm, orderStatusFilter]);

  useEffect(() => {
    if (!orderId || orders.length === 0) return;
    const found = orders.find((o) => o.id === orderId);
    if (found) {
      setSelectedOrder(found);
      setIsDetailOpen(true);
    }
  }, [orderId, orders]);

  const OrderTable = ({ data }: { data: Order[] }) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Order #</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Project</TableHead>
          <TableHead className="text-center">Items</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Payment</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {ordersLoading && data.length === 0 ? (
          <TableRow>
            <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
              <div className="space-y-2">
                <Skeleton className="h-4 w-1/2 mx-auto" />
                <Skeleton className="h-4 w-1/3 mx-auto" />
              </div>
            </TableCell>
          </TableRow>
        ) : data.length > 0 ? (
          data.map((order) => (
            <TableRow
              key={order.id}
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => handleRowClick(order)}
            >
              <TableCell className="font-medium">
                <div className="flex items-center gap-3">
                  <ProductImage name={order.items[0]?.itemName} className="h-10 w-10 shrink-0 rounded-md p-1" iconSize={18} />
                  <span>{order.orderNumber}</span>
                </div>
              </TableCell>
              <TableCell>{new Date(order.createdAt).toLocaleDateString('en-PH')}</TableCell>
              <TableCell className="max-w-[180px]">
                <div className="flex items-center gap-2">
                  <span className="truncate">{order.projectName || '-'}</span>
                  {order.projectId && projectStatusById[order.projectId] && (
                    <Badge className="bg-muted text-foreground capitalize">
                      {projectStatusById[order.projectId]}
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-center">{order.items.length}</TableCell>
              <TableCell className="text-right font-medium">
                ₱{order.total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </TableCell>
              <TableCell>
                {getStatusBadge(order.status)}
              </TableCell>
              <TableCell>{getPaymentBadge(order.paymentStatus)}</TableCell>
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
              No orders found
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );

  const DeliveryTable = ({ data }: { data: Delivery[] }) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>DR #</TableHead>
          <TableHead>Order #</TableHead>
          <TableHead>Project</TableHead>
          <TableHead>ETA</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Flow</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.length > 0 ? (
          data.map((delivery) => (
            <TableRow
              key={delivery.id}
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => setTrackingDelivery(delivery)}
            >
              <TableCell className="font-medium">{delivery.drNumber}</TableCell>
              <TableCell>{delivery.orderNumber}</TableCell>
              <TableCell>{delivery.projectName || '-'}</TableCell>
              <TableCell>{delivery.eta ? new Date(delivery.eta).toLocaleDateString('en-PH') : '—'}</TableCell>
              <TableCell>{getDeliveryBadge(delivery.status)}</TableCell>
              <TableCell>
                <p className="text-xs text-muted-foreground">
                  Ordered → Approved → Processing → Shipped → Delivered
                </p>
              </TableCell>
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
              No deliveries found
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Orders & Deliveries</h1>
          <p className="text-muted-foreground">Everything you need in one place: orders, deliveries, and live tracking.</p>
        </div>
        <Button onClick={() => navigate('/client/order')} className="gap-2">
          <Package size={18} />
          Place New Order
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(value) => {
        const nextTab = value as typeof activeTab;
        setActiveTab(nextTab);
        setOrdersPage(1);
        setSearchParams(nextTab === 'my-orders' ? {} : { tab: nextTab });
      }} className="space-y-4">
        <TabsList>
          <TabsTrigger value="my-orders">My Orders</TabsTrigger>
          <TabsTrigger value="my-deliveries">My Deliveries</TabsTrigger>
        </TabsList>

        <TabsContent value="my-orders">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Your Orders</CardTitle>
              <CardDescription>Filter by Delivered to review completed orders and reorder from the details modal.</CardDescription>
            </CardHeader>
            <CardContent className="border-b p-4">
              <div className="grid gap-3 md:grid-cols-[1fr_220px]">
                <Input
                  value={orderSearchTerm}
                  onChange={(event) => setOrderSearchTerm(event.target.value)}
                  placeholder="Search order number, client, or project"
                />
                <Select value={orderStatusFilter} onValueChange={setOrderStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="processing">Processing</SelectItem>
                    <SelectItem value="ready-for-delivery">Ready for Delivery</SelectItem>
                    <SelectItem value="delivered">Delivered</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
            <CardContent className="p-0">
              <OrderTable data={clientOrders} />
            </CardContent>
          </Card>
        <div className="flex items-center justify-center">
          <PaginationNav
            page={ordersPage}
            totalPages={Math.max(Math.ceil(ordersTotal / ordersPageSize), 1)}
            onPageChange={setOrdersPage}
            disabled={ordersLoading}
          />
        </div>
        </TabsContent>

        <TabsContent value="my-deliveries">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">My Deliveries</CardTitle>
              <CardDescription>Deliveries linked to your orders</CardDescription>
            </CardHeader>
            <CardContent className="border-b p-4">
              <div className="grid gap-3 md:grid-cols-[1fr_220px]">
                <Input
                  value={deliverySearchTerm}
                  onChange={(event) => setDeliverySearchTerm(event.target.value)}
                  placeholder="Search DR, order, project, or item"
                />
                <Select value={deliveryStatusFilter} onValueChange={setDeliveryStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Delivery status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="pending">Pending Dispatch</SelectItem>
                    <SelectItem value="in-transit">In Transit</SelectItem>
                    <SelectItem value="delivered">Delivered</SelectItem>
                    <SelectItem value="delayed">Delayed</SelectItem>
                    <SelectItem value="return-pending">Return Pending</SelectItem>
                    <SelectItem value="return-rejected">Return Rejected</SelectItem>
                    <SelectItem value="returned">Returned</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
            <CardContent className="p-0">
              <DeliveryTable data={filteredDeliveries} />
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>

      {/* Order Detail Modal */}
      <Dialog
        open={isDetailOpen}
        onOpenChange={(open) => {
          setIsDetailOpen(open);
          if (!open && orderId) {
            navigate('/client/orders');
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh]">
          <DialogHeader className="pr-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <DialogTitle className="text-2xl">
                {selectedOrder?.orderNumber}
              </DialogTitle>
              {selectedOrder && (
                <div className="text-right space-y-1">
                  {getStatusBadge(selectedOrder.status)}
                  <p className="text-xs text-muted-foreground">{getStatusExplanation(selectedOrder.status)}</p>
                </div>
              )}
            </div>
            <DialogDescription>
              Placed on {selectedOrder && new Date(selectedOrder.createdAt).toLocaleDateString('en-PH')}
            </DialogDescription>
          </DialogHeader>

          {selectedOrder && (
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-6">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    Project: {selectedOrder.projectName || 'No project assigned'}
                  </span>
                  {selectedOrder.projectId && projectStatusById[selectedOrder.projectId] && (
                    <Badge className="bg-muted text-foreground capitalize">
                      {projectStatusById[selectedOrder.projectId]}
                    </Badge>
                  )}
                </div>
                {/* Status Progress */}
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">Order Progress</span>
                  </div>
                  <div className="relative">
                    <div className="h-2 w-full rounded-full bg-muted" />
                    <div
                      className={cn(
                        'absolute left-0 top-0 h-2 rounded-full transition-all',
                        selectedOrder.status === 'pending' && 'bg-warning w-[25%]',
                        selectedOrder.status === 'approved' && 'bg-info w-[35%]',
                        selectedOrder.status === 'processing' && 'bg-info w-[50%]',
                        selectedOrder.status === 'ready-for-delivery' && 'bg-secondary w-[75%]',
                        selectedOrder.status === 'delivered' && 'bg-success w-full'
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-4 text-xs text-muted-foreground">
                    <span className={selectedOrder.status === 'pending' ? 'font-medium text-foreground' : ''}>Pending</span>
                    <span className={selectedOrder.status === 'processing' ? 'font-medium text-foreground' : ''}>Processing</span>
                    <span className={selectedOrder.status === 'ready-for-delivery' ? 'font-medium text-foreground' : ''}>Ready</span>
                    <span className={selectedOrder.status === 'delivered' ? 'font-medium text-foreground' : ''}>Delivered</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {getStatusExplanation(selectedOrder.status)}
                  </p>
                </div>

                <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h4 className="font-semibold">Delivery Status</h4>
                      <p className="text-sm text-muted-foreground">
                        {selectedDelivery
                          ? 'Order and delivery updates are shown together here.'
                          : 'This order has not been dispatched yet.'}
                      </p>
                    </div>
                    {selectedDelivery ? (
                      getDeliveryBadge(selectedDelivery.status)
                    ) : (
                      <Badge variant="outline">Waiting for dispatch</Badge>
                    )}
                  </div>
                  {selectedDelivery ? (
                    <div className="grid gap-3 md:grid-cols-3 text-sm">
                      <div className="rounded-md border bg-background p-3">
                        <p className="text-muted-foreground">Delivery Receipt</p>
                        <p className="font-medium">{selectedDelivery.drNumber}</p>
                      </div>
                      <div className="rounded-md border bg-background p-3">
                        <p className="text-muted-foreground">ETA</p>
                        <p className="font-medium">
                          {selectedDelivery.eta
                            ? new Date(selectedDelivery.eta).toLocaleString('en-PH')
                            : 'To be scheduled'}
                        </p>
                      </div>
                      <div className="rounded-md border bg-background p-3">
                        <p className="text-muted-foreground">Received By</p>
                        <p className="font-medium">{selectedDelivery.receivedBy || 'Pending confirmation'}</p>
                      </div>
                    </div>
                  ) : null}
                  {selectedDelivery ? (
                    <div className="flex justify-end">
                      <Button variant="outline" onClick={() => setTrackingDelivery(selectedDelivery)}>
                        Track Delivery
                      </Button>
                    </div>
                  ) : null}
                </div>

                <div className="space-y-3">
                  <h4 className="font-semibold">Timeline</h4>
                  <div className="space-y-3">
                    {buildOrderTimeline(selectedOrder, selectedDelivery).map((step) => (
                      <div key={step.label} className="flex items-start gap-3">
                        <div className={cn('mt-1 h-3 w-3 rounded-full', step.active ? step.tone : 'bg-muted')} />
                        <div>
                          <p className={cn('text-sm font-medium', step.active ? 'text-foreground' : 'text-muted-foreground')}>
                            {step.label}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {step.date ? new Date(step.date).toLocaleString('en-PH') : 'Waiting'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Order Items */}
                <div>
                  <h4 className="font-semibold mb-3">Order Items</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Unit Price</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedOrder.items.map((item, idx) => {
                        const line = calcLineAmounts(item.quantity, item.unitPrice);
                        return (
                          <TableRow key={idx}>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <ProductImage name={item.itemName} className="h-10 w-10 shrink-0 rounded-md p-1" iconSize={18} />
                                <span>{item.itemName}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">{item.quantity} {item.unit}</TableCell>
                            <TableCell className="text-right">
                              ₱{item.unitPrice.toLocaleString('en-PH')}
                            </TableCell>
                            <TableCell className="text-right">
                              ₱{line.net.toLocaleString('en-PH')}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Totals */}
                <div className="space-y-2 text-sm">
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">VATable Sales</span>
                    <span>₱{selectedTotals?.net.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">VAT ({vatLabel}%)</span>
                    <span>₱{selectedTotals?.vat.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between text-lg font-bold">
                    <span>Total Amount Due</span>
                    <span>₱{selectedTotals?.total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
                {selectedOrder.status === 'cancelled' && (
                  <div className="p-3 bg-destructive/10 rounded-lg text-sm text-destructive">
                    Cancelled: {selectedOrder.cancelReason || 'No reason provided'}
                  </div>
                )}

                {/* Payment Section */}
                <div className="p-4 bg-muted/50 rounded-lg space-y-3">
                  {(selectedOrder.paymentStatus === 'verified' || selectedOrder.paymentStatus === 'paid') ? (
                    <div className="text-sm text-muted-foreground">
                      Payment completed.
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="font-medium">Payment Status</span>
                        {getPaymentBadge(selectedOrder.paymentStatus)}
                      </div>
                      {selectedOrder.paymentStatus === 'pending' && selectedOrder.status !== 'cancelled' && (
                        <Button onClick={handleUploadPayment} className="w-full gap-2">
                          <Upload size={18} />
                          Upload Purchase Order
                        </Button>
                      )}
                    </>
                  )}
                  {(selectedOrder.poMatchStatus || selectedOrder.chequeVerification) === 'genuine' && (
                    <div className="p-3 bg-success/10 rounded-lg text-sm text-success">
                      Purchase order matched successfully
                    </div>
                  )}
                  {(selectedOrder.poMatchStatus || selectedOrder.chequeVerification) === 'fraud' && (
                    <div className="p-3 bg-destructive/10 rounded-lg text-sm text-destructive">
                      Purchase order code mismatch detected
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2">
            {selectedOrder?.status === 'delivered' ? (
              <Button onClick={() => handleReorder(selectedOrder)} className="gap-2">
                <RotateCcw size={16} />
                Reorder This Batch
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => handleDownloadInvoice(selectedOrder!)} className="gap-2">
              <Download size={16} />
              Download Invoice
            </Button>
            <Button variant="outline" onClick={() => handleDownloadDR(selectedOrder!)} className="gap-2">
              <FileText size={16} />
              Download DR
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LiveTrackingDialog
        delivery={trackingDelivery}
        open={!!trackingDelivery}
        onOpenChange={(open) => {
          if (!open) setTrackingDelivery(null);
        }}
        readOnly
      />

      {/* Payment Upload Modal */}
      <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload size={20} />
              Upload Purchase Order
            </DialogTitle>
            <DialogDescription>
              OCR checks uploaded PO images first; the typed PO code is used as fallback.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {!isVerifying && verificationResult === null && (
              <div className="border-2 border-dashed rounded-lg p-8 text-center">
                <Upload size={40} className="mx-auto mb-4 text-muted-foreground" />
                <div className="mb-4 space-y-3 text-left">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Expected order code</p>
                    <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm font-medium">
                      {selectedOrder?.orderNumber}
                    </p>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      Purchase Order Code
                    </label>
                    <input
                      value={poCodeInput}
                      onChange={(event) => {
                        setPoCodeInput(event.target.value);
                        if (uploadError) setUploadError('');
                      }}
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                      placeholder="Enter the PO code from the uploaded file"
                    />
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Upload a PO image for OCR match. If OCR cannot read it, the typed PO code below is checked instead.
                </p>
                <label className="flex items-center justify-center gap-2 text-xs text-muted-foreground mb-3">
                  <input
                    type="checkbox"
                    checked={useTestVerification}
                    onChange={(e) => {
                      setUseTestVerification(e.target.checked);
                      if (uploadError) setUploadError('');
                    }}
                  />
                  Use test verification (skip upload)
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,application/pdf"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      setSelectedFileName(file.name);
                      if (uploadError) setUploadError('');
                      simulateAIVerification(file);
                    }
                  }}
                />
                <Button onClick={() => (useTestVerification ? simulateAIVerification() : fileInputRef.current?.click())}>
                  Select PO File
                </Button>
                {selectedFileName && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Selected: {selectedFileName}
                  </p>
                )}
                {uploadError && (
                  <p className="mt-2 text-xs text-destructive">{uploadError}</p>
                )}
              </div>
            )}

            {isVerifying && (
              <div className="p-8 text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                <p className="font-medium">Matching Purchase Order...</p>
                <p className="text-sm text-muted-foreground">Checking whether the uploaded PO code matches this order</p>
              </div>
            )}

            {verificationResult && (
              <div
                className={cn(
                  'p-6 rounded-lg text-center',
                  verificationResult === 'genuine' ? 'bg-success/10' : 'bg-destructive/10'
                )}
              >
                <div
                  className={cn(
                    'h-16 w-16 rounded-full mx-auto mb-4 flex items-center justify-center',
                    verificationResult === 'genuine' ? 'bg-success' : 'bg-destructive'
                  )}
                >
                  {verificationResult === 'genuine' ? (
                    <CheckCircle size={32} className="text-white" />
                  ) : (
                    <span className="text-3xl text-white">!</span>
                  )}
                </div>
                <p className={cn('text-lg font-bold', verificationResult === 'genuine' ? 'text-success' : 'text-destructive')}>
                  {verificationResult === 'genuine'
                    ? poMatchSource === 'ocr'
                      ? 'OCR Match'
                      : poMatchSource === 'typed-code'
                      ? 'Typed-Code Match'
                      : 'PO Match'
                    : 'Mismatch'}
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  {verificationResult === 'genuine'
                    ? poMatchSource === 'ocr'
                      ? 'The expected order code was found in the uploaded image.'
                      : 'The typed PO code matched the expected order code.'
                    : 'OCR and typed-code checks did not match this order. Please review the PO file/code.'}
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsUploadOpen(false);
              setVerificationResult(null);
              setPoMatchSource(null);
            }}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
