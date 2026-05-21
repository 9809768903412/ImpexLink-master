import { useEffect, useState } from 'react';
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Search, Eye, FileText, Check, Trash2, AlertTriangle, PackageCheck } from 'lucide-react';
import type { PurchaseOrder, POStatus, OrderItem, Supplier, InventoryItem, Order } from '@/types';
import { toast } from '@/hooks/use-toast';
import { printHtml } from '@/utils/print';
import { useResource } from '@/hooks/use-resource';
import { apiClient } from '@/api/client';
import { getCache, setCache } from '@/hooks/cache';
import { Skeleton } from '@/components/ui/skeleton';
import { calcLineAmounts, calcTotalsFromItems, VAT_RATE } from '@/lib/vat';
import { formatPesoAmount } from '@/lib/currency';
import PaginationNav from '@/components/PaginationNav';
import { ScrollArea } from '@/components/ui/scroll-area';
import StatusFilterSelect from '@/components/StatusFilterSelect';
import { statusBadgeClass } from '@/lib/statusStyles';

const statusColors: Record<POStatus, string> = {
  draft: 'bg-gray-100 text-gray-800',
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-blue-100 text-blue-800',
  ordered: 'bg-purple-100 text-purple-800',
  received: 'bg-green-100 text-green-800',
  paid: 'bg-emerald-100 text-emerald-800',
};

// TODO: Replace with real data
export default function PurchaseOrdersPage() {
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>(
    () => getCache<PurchaseOrder[]>('purchase-orders') || []
  );
  const [poTotal, setPoTotal] = useState(0);
  const [poPage, setPoPage] = useState(1);
  const [poPageSize] = useState(10);
  const [poLoading, setPoLoading] = useState(false);
  const [sortKey, setSortKey] = useState<'orderDate' | 'status' | 'total'>('orderDate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const { data: suppliers } = useResource<Supplier[]>('/suppliers', []);
  const { data: inventory } = useResource<InventoryItem[]>('/inventory', []);
  const { data: clientOrders } = useResource<Order[]>('/orders', []);
  const { data: company } = useResource(
    '/company',
    {
      name: 'Impex Engineering and Industrial Supply',
      address: '6959 Washington St., Pio Del Pilar, Makati City',
      tin: '100-191-563-000',
      phone: '+63 2 8123 4567',
      email: 'sales@impex.ph',
      website: 'www.impex.ph',
    }
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showReceiveDialog, setShowReceiveDialog] = useState(false);
  const [receiveQuantities, setReceiveQuantities] = useState<Record<string, number>>({});
  const [receiveNotes, setReceiveNotes] = useState('');
  const [showDelayDialog, setShowDelayDialog] = useState(false);
  const [delayReason, setDelayReason] = useState('');
  const [delayEta, setDelayEta] = useState('');
  const [delayOrderIds, setDelayOrderIds] = useState<string[]>([]);

  // Form state
  const [formData, setFormData] = useState({
    supplierId: '',
    terms: 'Net 30',
    remarks: '',
  });
  const [formItems, setFormItems] = useState<OrderItem[]>([]);
  const [poErrors, setPoErrors] = useState<Record<string, string>>({});
  const selectedTotals = selectedPO
    ? calcTotalsFromItems(
        selectedPO.items.map((item) => ({ quantity: item.quantity, unitPrice: item.unitPrice }))
      )
    : null;
  const vatLabel = Math.round(VAT_RATE * 100);
  const poPageStart = (poPage - 1) * poPageSize;
  const poPageEnd = poPageStart + poPageSize;
  const pagedPurchaseOrders = purchaseOrders.slice(poPageStart, poPageEnd);
  const totalFilteredPOs = purchaseOrders.length;
  const impactedOrders = selectedPO?.projectId
    ? clientOrders.filter((order) => order.projectId === selectedPO.projectId && !['delivered', 'cancelled'].includes(order.status))
    : clientOrders.filter((order) => !['delivered', 'cancelled'].includes(order.status)).slice(0, 8);

  const fetchPurchaseOrders = async () => {
    setPoLoading(true);
    try {
      const response = await apiClient.get('/purchase-orders', {
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
      const normalizeStatus = (value: string) => {
        const normalized = value.replace(/[\s_]/g, '-').toLowerCase();
        return normalized as POStatus;
      };
      const normalizeOrders = (items: any[]) =>
        items.map((po) => ({
          ...po,
          status: normalizeStatus(String(po.status || 'pending')),
        }));
      if (payload?.data) {
        const normalized = normalizeOrders(payload.data);
        setPurchaseOrders(normalized);
        setPoTotal(normalized.length);
        setCache('purchase-orders', normalized);
      } else {
        const normalized = Array.isArray(payload) ? normalizeOrders(payload) : [];
        setPurchaseOrders(normalized);
        setPoTotal(normalized.length || 0);
        setCache('purchase-orders', normalized);
      }
    } catch (err) {
      setPurchaseOrders([]);
      setPoTotal(0);
    } finally {
      setPoLoading(false);
    }
  };

  useEffect(() => {
    fetchPurchaseOrders();
  }, [searchTerm, statusFilter, poPage, poPageSize, sortKey, sortDir]);

  useEffect(() => {
    setPoPage(1);
  }, [searchTerm, statusFilter, sortKey, sortDir]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('po_suggestions');
      if (!raw) return;
      const suggestions = JSON.parse(raw) as { itemId: string; itemName: string; suggestedQty: number }[];
      if (!Array.isArray(suggestions) || suggestions.length === 0) return;
      const prefilled = suggestions.map((s) => {
        const inv = inventory.find((i) => i.id === s.itemId);
        return {
          itemId: s.itemId,
          itemName: inv?.name || s.itemName || '',
          unit: inv?.unit || '',
          quantity: s.suggestedQty || 0,
          unitPrice: inv?.unitPrice || 0,
          amount: (s.suggestedQty || 0) * (inv?.unitPrice || 0),
        } as OrderItem;
      });
      setFormItems(prefilled);
      setShowCreateForm(true);
      localStorage.removeItem('po_suggestions');
    } catch {
      // ignore
    }
  }, [inventory]);

  const handleAddItem = () => {
    if (poErrors.items) {
      setPoErrors((prev) => {
        const next = { ...prev };
        delete next.items;
        return next;
      });
    }
    setFormItems([
      ...formItems,
      { itemId: '', itemName: '', unit: '', quantity: 0, unitPrice: 0, amount: 0 },
    ]);
  };

  const handleUpdateItem = (index: number, field: string, value: string | number) => {
    const updated = [...formItems];
    if (field === 'itemId') {
      const item = inventory.find((i) => i.id === value);
      if (item) {
        updated[index] = {
          ...updated[index],
          itemId: item.id,
          itemName: item.name,
          unit: item.unit,
          unitPrice: item.unitPrice,
          amount: updated[index].quantity * item.unitPrice,
        };
      }
    } else if (field === 'quantity') {
      updated[index].quantity = Number(value);
      updated[index].amount = Number(value) * updated[index].unitPrice;
    } else {
      (updated[index] as any)[field] = value;
    }
    setFormItems(updated);
    if (field === 'itemId') {
      const key = `item-${index}`;
      if (poErrors[key] || poErrors.items) {
        setPoErrors((prev) => {
          const next = { ...prev };
          delete next[key];
          if (!Object.keys(next).some((k) => k.startsWith('item-') || k.startsWith('qty-') || k.startsWith('price-'))) {
            delete next.items;
          }
          return next;
        });
      }
    }
    if (field === 'quantity') {
      const key = `qty-${index}`;
      if (poErrors[key] || poErrors.items) {
        setPoErrors((prev) => {
          const next = { ...prev };
          delete next[key];
          if (!Object.keys(next).some((k) => k.startsWith('item-') || k.startsWith('qty-') || k.startsWith('price-'))) {
            delete next.items;
          }
          return next;
        });
      }
    }
  };

  const handleRemoveItem = (index: number) => {
    setFormItems(formItems.filter((_, i) => i !== index));
  };

  const formTotals = calcTotalsFromItems(
    formItems.map((item) => ({ quantity: item.quantity, unitPrice: item.unitPrice }))
  );
  const subtotal = formTotals.net;
  const vat = formTotals.vat;
  const total = formTotals.total;

  const handleCreatePO = () => {
    const errors: Record<string, string> = {};
    if (!formData.supplierId) errors.supplierId = 'Supplier is required.';
    if (formItems.length === 0) errors.items = 'Add at least one item.';
    formItems.forEach((item, idx) => {
      if (!item.itemId) {
        errors[`item-${idx}`] = 'Select an item.';
      }
      if (Number(item.quantity) <= 0 || Number.isNaN(Number(item.quantity))) {
        errors[`qty-${idx}`] = 'Qty must be greater than 0.';
      }
      if (Number(item.unitPrice) < 0 || Number.isNaN(Number(item.unitPrice))) {
        errors[`price-${idx}`] = 'Unit price must be 0 or greater.';
      }
    });
    setPoErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast({
        title: 'Fix validation errors',
        description: 'Please review the highlighted fields.',
        variant: 'destructive',
      });
      return;
    }
    if (!formData.supplierId || formItems.length === 0) {
      toast({
        title: 'Error',
        description: 'Please select a supplier and add items',
        variant: 'destructive',
      });
      return;
    }
    if (formItems.some((item) => !item.itemId)) {
      toast({
        title: 'Missing items',
        description: 'Please select a valid item for each row.',
        variant: 'destructive',
      });
      return;
    }
    if (formItems.some((item) => item.quantity <= 0)) {
      toast({
        title: 'Invalid quantity',
        description: 'Quantity must be greater than 0.',
        variant: 'destructive',
      });
      return;
    }
    if (formItems.some((item) => item.unitPrice < 0)) {
      toast({
        title: 'Invalid price',
        description: 'Unit price must be 0 or greater.',
        variant: 'destructive',
      });
      return;
    }

    apiClient
      .post<PurchaseOrder>('/purchase-orders', {
        supplierId: formData.supplierId,
        terms: formData.terms,
        remarks: formData.remarks,
        items: formItems.map((item) => ({
          itemId: item.itemId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
      })
      .then(() => fetchPurchaseOrders())
      .catch(() => {
        // keep optimistic update
      });
    toast({
      title: 'Purchase Order Created',
      description: `Purchase order has been created and is pending approval`,
    });
    setShowCreateForm(false);
    resetForm();
    setPoErrors({});
  };

  const resetForm = () => {
    setFormData({ supplierId: '', terms: 'Net 30', remarks: '' });
    setFormItems([]);
  };

  const handleUpdateStatus = (poId: string, newStatus: POStatus) => {
    setPurchaseOrders(
      purchaseOrders.map((po) => (po.id === poId ? { ...po, status: newStatus } : po))
    );
    apiClient.put<PurchaseOrder>(`/purchase-orders/${poId}`, { status: newStatus }).catch(() => {
      // keep optimistic update
    });
    toast({
      title: 'Status Updated',
      description: `PO status changed to ${newStatus}`,
    });
    fetchPurchaseOrders();
    setSelectedPO(null);
  };

  const openReceiveDialog = (po: PurchaseOrder) => {
    setSelectedPO(po);
    setReceiveNotes('');
    setReceiveQuantities(
      po.items.reduce<Record<string, number>>((acc, item) => {
        acc[item.itemId] = item.remainingQuantity ?? Math.max(item.quantity - (item.receivedQuantity || 0), 0);
        return acc;
      }, {})
    );
    setShowReceiveDialog(true);
  };

  const handleReceivePO = async () => {
    if (!selectedPO) return;
    const items = selectedPO.items
      .map((item) => ({
        itemId: item.itemId,
        quantity: Number(receiveQuantities[item.itemId] || 0),
      }))
      .filter((item) => item.quantity > 0);
    if (items.length === 0) {
      toast({ title: 'No quantities entered', description: 'Enter at least one received quantity.', variant: 'destructive' });
      return;
    }
    try {
      await apiClient.post(`/purchase-orders/${selectedPO.id}/receive`, { items, notes: receiveNotes });
      toast({ title: 'Stock received', description: 'The received quantities were added to inventory.' });
      setShowReceiveDialog(false);
      setShowPreview(false);
      await fetchPurchaseOrders();
    } catch (err: any) {
      toast({
        title: 'Unable to receive PO',
        description: err?.response?.data?.error || 'Please check received quantities and try again.',
        variant: 'destructive',
      });
    }
  };

  const openDelayDialog = (po: PurchaseOrder) => {
    setSelectedPO(po);
    setDelayReason('');
    setDelayEta('');
    const related = po.projectId
      ? clientOrders.filter((order) => order.projectId === po.projectId && !['delivered', 'cancelled'].includes(order.status))
      : [];
    setDelayOrderIds(related.map((order) => order.id));
    setShowDelayDialog(true);
  };

  const handleNotifySupplierDelay = async () => {
    if (!selectedPO) return;
    if (!delayReason.trim()) {
      toast({ title: 'Delay reason required', description: 'Explain what changed before notifying clients.', variant: 'destructive' });
      return;
    }
    try {
      const response = await apiClient.post(`/purchase-orders/${selectedPO.id}/delay-impact`, {
        reason: delayReason.trim(),
        eta: delayEta || undefined,
        clientOrderIds: delayOrderIds,
      });
      toast({
        title: 'Delay recorded',
        description: `${response.data?.notified || 0} client order notification(s) sent.`,
      });
      setShowDelayDialog(false);
      await fetchPurchaseOrders();
    } catch (err: any) {
      toast({
        title: 'Unable to notify delay',
        description: err?.response?.data?.error || 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handlePrintPO = (po: PurchaseOrder) => {
    const totals = calcTotalsFromItems(
      po.items.map((item) => ({ quantity: item.quantity, unitPrice: item.unitPrice }))
    );
    const vatLabel = Math.round(VAT_RATE * 100);
    const itemsHtml = po.items
      .map(
        (item) => {
          const line = calcLineAmounts(item.quantity, item.unitPrice);
          return `<tr><td>${item.itemName}</td><td>${item.unit}</td><td>${item.quantity}</td><td>₱${formatPesoAmount(item.unitPrice)}</td><td>₱${formatPesoAmount(line.net)}</td></tr>`;
        }
      )
      .join('');
    printHtml(
      `Purchase Order ${po.poNumber}`,
      `<h1>Purchase Order</h1>
      <div class="meta meta-inline"><span class="doc-label">PO #:</span><span class="doc-code">${po.poNumber}</span></div>
      <div class="meta">Supplier: ${po.supplierName}</div>
      <div class="meta">Date: ${format(new Date(po.date), 'yyyy-MM-dd')}</div>
      <div class="meta">Status: ${po.status}</div>
      <div class="meta">Terms: ${po.terms}</div>
      <table>
        <thead><tr><th>Item</th><th>Unit</th><th>Qty</th><th>Unit Price</th><th>Amount</th></tr></thead>
        <tbody>${itemsHtml}</tbody>
      </table>
      <div class="total">VATable Sales: ₱${formatPesoAmount(totals.net)}</div>
      <div class="total">VAT (${vatLabel}%): ₱${formatPesoAmount(totals.vat)}</div>
      <div class="total">Total Amount Due: ₱${formatPesoAmount(totals.total)}</div>
      ${po.remarks ? `<div class="meta">Remarks: ${po.remarks}</div>` : ''}`
    );
  };


  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Purchase Orders</h2>
          <p className="text-muted-foreground">Manage supplier purchase orders</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setShowCreateForm(true)}>
            <Plus size={16} className="mr-1" />
            Create PO
          </Button>
        </div>
      </div>

      <Tabs defaultValue="list" className="space-y-4">
        <TabsList>
          <TabsTrigger value="list">All POs</TabsTrigger>
          <TabsTrigger value="pending">Pending Approval</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search POs..."
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setPoPage(1);
                    }}
                    className="pl-10"
                  />
                </div>
                <StatusFilterSelect
                  value={statusFilter}
                  onValueChange={(value) => {
                    setStatusFilter(value);
                    setPoPage(1);
                  }}
                  placeholder="All Status"
                >
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="ordered">Ordered</SelectItem>
                  <SelectItem value="received">Received</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                </StatusFilterSelect>
                <Select value={sortKey} onValueChange={(value) => setSortKey(value as typeof sortKey)}>
                  <SelectTrigger className="w-full lg:w-[180px]">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="orderDate">Sort: Date</SelectItem>
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
              </div>
            </CardContent>
          </Card>

          {/* PO Table */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>PO #</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Terms</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Approved By</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {poLoading && purchaseOrders.length === 0 ? (
                    Array.from({ length: 6 }).map((_, idx) => (
                      <TableRow key={`sk-${idx}`}>
                        <TableCell colSpan={8}>
                          <Skeleton className="h-6 w-full" />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    pagedPurchaseOrders.map((po) => (
                    <TableRow key={po.id} className="relative">
                      <TableCell className="font-medium">{po.poNumber}</TableCell>
                      <TableCell>{po.supplierName}</TableCell>
                      <TableCell>{format(new Date(po.date), 'MMM dd, yyyy')}</TableCell>
                      <TableCell>{po.terms}</TableCell>
                      <TableCell className="text-right font-medium">
                        ₱{po.total.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`capitalize ${statusBadgeClass(po.status)}`}>
                          {po.status === 'paid' ? '✓ PAID' : po.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{po.approvedBy || '-'}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedPO(po);
                            setShowPreview(true);
                          }}
                        >
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
              page={poPage}
              totalPages={Math.max(Math.ceil(totalFilteredPOs / poPageSize), 1)}
              onPageChange={setPoPage}
              disabled={poLoading}
            />
          </div>
        </TabsContent>

        <TabsContent value="pending">
          <Card>
            <CardContent className="pt-6">
              {purchaseOrders.filter((po) => po.status === 'pending').length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No pending POs</p>
              ) : (
                <div className="space-y-4">
                  {purchaseOrders
                    .filter((po) => po.status === 'pending')
                    .map((po) => (
                      <div
                        key={po.id}
                        className="border rounded-lg p-4 flex justify-between items-center"
                      >
                        <div>
                          <p className="font-medium">{po.poNumber}</p>
                          <p className="text-sm text-muted-foreground">{po.supplierName}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">₱{po.total.toLocaleString()}</p>
                          <div className="flex gap-2 mt-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedPO(po);
                                setShowPreview(true);
                              }}
                            >
                              <Eye size={14} className="mr-1" />
                              View
                            </Button>
                            <Button
                              size="sm"
                              className="bg-red-600 hover:bg-red-700 text-white"
                              onClick={() => handleUpdateStatus(po.id, 'draft')}
                            >
                              Reject
                            </Button>
                            <Button
                              size="sm"
                              className="bg-emerald-600 hover:bg-emerald-700 text-white"
                              onClick={() => handleUpdateStatus(po.id, 'approved')}
                            >
                              <Check size={14} className="mr-1" />
                              Approve
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create PO Dialog */}
      <Dialog open={showCreateForm} onOpenChange={setShowCreateForm}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Purchase Order</DialogTitle>
            <DialogDescription>
              Create a new purchase order for supplier items
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Supplier</Label>
                <Select
                  value={formData.supplierId}
                  onValueChange={(v) => {
                    setFormData({ ...formData, supplierId: v });
                    if (poErrors.supplierId) {
                      setPoErrors((prev) => ({ ...prev, supplierId: '' }));
                    }
                  }}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {poErrors.supplierId && <p className="text-xs text-destructive mt-1">{poErrors.supplierId}</p>}
              </div>
              <div>
                <Label>Payment Terms</Label>
                <Select
                  value={formData.terms}
                  onValueChange={(v) => setFormData({ ...formData, terms: v })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="COD">COD</SelectItem>
                    <SelectItem value="Net 15">Net 15</SelectItem>
                    <SelectItem value="Net 30">Net 30</SelectItem>
                    <SelectItem value="Net 60">Net 60</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <Label>Items</Label>
                <Button variant="outline" size="sm" onClick={handleAddItem}>
                  <Plus size={14} className="mr-1" />
                  Add Item
                </Button>
              </div>
              {poErrors.items && <p className="text-xs text-destructive mb-2">{poErrors.items}</p>}
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="w-[100px]">Qty</TableHead>
                      <TableHead className="text-right">Unit Price</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {formItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          No items added
                        </TableCell>
                      </TableRow>
                    ) : (
                      formItems.map((item, idx) => {
                        const line = calcLineAmounts(item.quantity, item.unitPrice);
                        return (
                          <TableRow key={idx}>
                            <TableCell>
                              <Select
                                value={item.itemId}
                                onValueChange={(v) => handleUpdateItem(idx, 'itemId', v)}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select item" />
                                </SelectTrigger>
                                <SelectContent>
                                  {inventory.map((inv) => (
                                    <SelectItem key={inv.id} value={inv.id}>
                                      {inv.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {poErrors[`item-${idx}`] && (
                                <p className="text-xs text-destructive mt-1">{poErrors[`item-${idx}`]}</p>
                              )}
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min="1"
                                value={item.quantity || ''}
                                onChange={(e) => handleUpdateItem(idx, 'quantity', e.target.value)}
                              />
                              {poErrors[`qty-${idx}`] && (
                                <p className="text-xs text-destructive mt-1">{poErrors[`qty-${idx}`]}</p>
                              )}
                            </TableCell>
                            <TableCell className="text-right">₱{formatPesoAmount(item.unitPrice)}</TableCell>
                            <TableCell className="text-right font-medium">
                              ₱{formatPesoAmount(line.net)}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive"
                                onClick={() => handleRemoveItem(idx)}
                              >
                                <Trash2 size={14} />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="text-right space-y-1 pt-2 border-t">
              <p className="text-sm">
                VATable Sales: <span className="font-medium">₱{formatPesoAmount(subtotal)}</span>
              </p>
              <p className="text-sm">
                VAT ({vatLabel}%): <span className="font-medium">₱{formatPesoAmount(vat)}</span>
              </p>
              <p className="text-lg font-bold">
                Total Amount Due: <span className="text-primary">₱{formatPesoAmount(total)}</span>
              </p>
            </div>

            <div>
              <Label>Remarks</Label>
              <Textarea
                value={formData.remarks}
                onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                placeholder="Additional notes..."
                className="mt-1"
              />
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <Button
                className="bg-red-600 hover:bg-red-700 text-white"
                onClick={() => setShowCreateForm(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleCreatePO}>Create Purchase Order</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* PO Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="flex h-[92vh] max-w-5xl flex-col overflow-hidden p-0">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle className="flex items-center gap-3">
              <span>Purchase Order {selectedPO?.poNumber}</span>
              {selectedPO?.status === 'paid' && (
                <span className="text-xs font-semibold bg-emerald-600 text-white px-2 py-1 rounded-full">
                  PAID
                </span>
              )}
            </DialogTitle>
            <DialogDescription>{selectedPO?.supplierName}</DialogDescription>
          </DialogHeader>
          {selectedPO && (
            <>
            <ScrollArea className="flex-1">
            <div className="space-y-4 p-6">
              {/* PO Document Preview */}
              <div className="border rounded-lg p-6 bg-white">
                <div className="mb-4 flex flex-col gap-4 border-b pb-4 md:flex-row md:items-start md:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-md bg-black">
                      <img src="/brand/impex-engineering-logo.jpeg" alt="Impex Engineering" className="h-full w-full object-contain" />
                    </div>
                    <div className="flex h-14 w-36 items-center justify-center overflow-hidden rounded-md border bg-white px-2">
                      <img src="/brand/thortex-logo.jpeg" alt="Thortex Philippines" className="h-full w-full object-contain" />
                    </div>
                  </div>
                  <div className="text-left md:text-right">
                  <h3 className="text-xl font-bold text-sidebar">{company.name}</h3>
                  <p className="text-sm text-muted-foreground">{company.address}</p>
                  <p className="text-sm text-muted-foreground">
                    {company.phone} • {company.email}
                  </p>
                  <p className="text-sm text-muted-foreground">TIN: {company.tin}</p>
                  </div>
                </div>
                <div className="mb-4 grid gap-3 rounded-lg border bg-muted/30 p-3 text-sm md:grid-cols-2">
                  <div>
                    <p className="text-muted-foreground">PO Number</p>
                    <p className="font-semibold">{selectedPO.poNumber}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Document Status</p>
                    <Badge variant="outline">Ready for office review</Badge>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                  <div>
                    <p className="font-medium">Vendor:</p>
                    <p>{selectedPO.supplierName}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">Terms:</p>
                    <p>{selectedPO.terms}</p>
                  </div>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-center">Qty</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Unit Price</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedPO.items.map((item) => {
                      const line = calcLineAmounts(item.quantity, item.unitPrice);
                      return (
                        <TableRow key={item.itemId}>
                          <TableCell className="text-center">
                            <div>{item.quantity}</div>
                            {(item.receivedQuantity || 0) > 0 && (
                              <div className="text-[11px] text-muted-foreground">
                                {item.receivedQuantity} received
                              </div>
                            )}
                          </TableCell>
                          <TableCell>{item.unit}</TableCell>
                          <TableCell>{item.itemName}</TableCell>
                          <TableCell className="text-right">₱{formatPesoAmount(item.unitPrice)}</TableCell>
                          <TableCell className="text-right">₱{formatPesoAmount(line.net)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                <div className="text-right mt-4 space-y-1">
                  <p>VATable Sales: ₱{formatPesoAmount(selectedTotals?.net)}</p>
                  <p>VAT ({vatLabel}%): ₱{formatPesoAmount(selectedTotals?.vat)}</p>
                  <p className="font-bold text-lg">Total Amount Due: ₱{formatPesoAmount(selectedTotals?.total)}</p>
                </div>
                {selectedPO.approvedBy && (
                  <div className="mt-6 pt-4 border-t">
                    <p className="text-sm">
                      <span className="font-medium">Approved by:</span> {selectedPO.approvedBy}
                    </p>
                  </div>
                )}
              </div>

            </div>
            </ScrollArea>

              <div className="flex flex-wrap gap-2 justify-end border-t px-6 py-4">
                <Button
                  className="bg-red-600 hover:bg-red-700 text-white"
                  onClick={() => setShowPreview(false)}
                >
                  Close
                </Button>
                <Button onClick={() => handlePrintPO(selectedPO)}>
                  <FileText size={16} className="mr-1" />
                  Download PDF
                </Button>
                {selectedPO.status === 'approved' && (
                  <Button
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={() => handleUpdateStatus(selectedPO.id, 'ordered')}
                  >
                    Mark as Ordered
                  </Button>
                )}
                {selectedPO.status === 'ordered' && (
                  <Button
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={() => openReceiveDialog(selectedPO)}
                  >
                    <PackageCheck size={16} className="mr-1" />
                    Receive Stock
                  </Button>
                )}
                {['approved', 'ordered'].includes(selectedPO.status) && (
                  <Button
                    variant="outline"
                    onClick={() => openDelayDialog(selectedPO)}
                  >
                    <AlertTriangle size={16} className="mr-1" />
                    Supplier Delay
                  </Button>
                )}
                {selectedPO.status === 'received' && (
                  <Button
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={() => handleUpdateStatus(selectedPO.id, 'paid')}
                  >
                    Mark as Paid
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showReceiveDialog} onOpenChange={setShowReceiveDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Receive Supplier Delivery</DialogTitle>
            <DialogDescription>
              Record the actual quantities received for {selectedPO?.poNumber}. Partial receipts keep the PO open.
            </DialogDescription>
          </DialogHeader>
          {selectedPO && (
            <div className="space-y-4">
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Ordered</TableHead>
                      <TableHead className="text-right">Received</TableHead>
                      <TableHead className="w-[140px] text-right">Receive Now</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedPO.items.map((item) => {
                      const already = item.receivedQuantity || 0;
                      const remaining = item.remainingQuantity ?? Math.max(item.quantity - already, 0);
                      return (
                        <TableRow key={`receive-${item.itemId}`}>
                          <TableCell>
                            <p className="font-medium">{item.itemName}</p>
                            <p className="text-xs text-muted-foreground">{item.unit}</p>
                          </TableCell>
                          <TableCell className="text-right">{item.quantity}</TableCell>
                          <TableCell className="text-right">{already}</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="0"
                              max={remaining}
                              value={receiveQuantities[item.itemId] ?? 0}
                              onChange={(e) =>
                                setReceiveQuantities((prev) => ({
                                  ...prev,
                                  [item.itemId]: Math.min(Number(e.target.value || 0), remaining),
                                }))
                              }
                              className="text-right"
                            />
                            <p className="mt-1 text-right text-[11px] text-muted-foreground">{remaining} remaining</p>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <div>
                <Label>Receiving Notes</Label>
                <Textarea
                  value={receiveNotes}
                  onChange={(e) => setReceiveNotes(e.target.value)}
                  placeholder="Example: Supplier delivered 4 of 10 drums; balance expected Friday."
                  className="mt-1"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowReceiveDialog(false)}>Cancel</Button>
                <Button onClick={handleReceivePO}>Save Receipt</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showDelayDialog} onOpenChange={setShowDelayDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Supplier Delay Impact</DialogTitle>
            <DialogDescription>
              Record the supplier delay and notify client orders that may be affected.
            </DialogDescription>
          </DialogHeader>
          {selectedPO && (
            <div className="space-y-4">
              <div>
                <Label>Delay Reason</Label>
                <Textarea
                  value={delayReason}
                  onChange={(e) => setDelayReason(e.target.value)}
                  placeholder="Example: Supplier confirmed partial stock only; remaining materials arrive next week."
                  className="mt-1"
                />
              </div>
              <div>
                <Label>New Expected Supplier Arrival</Label>
                <Input type="date" value={delayEta} onChange={(e) => setDelayEta(e.target.value)} className="mt-1" />
              </div>
              <div className="rounded-md border p-3">
                <p className="text-sm font-medium">Affected client orders</p>
                <p className="text-xs text-muted-foreground">
                  Orders from the same project are selected automatically when available.
                </p>
                <div className="mt-3 max-h-52 space-y-2 overflow-y-auto">
                  {impactedOrders.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No active client orders found for this PO project.</p>
                  ) : (
                    impactedOrders.map((order) => (
                      <label key={order.id} className="flex items-start gap-2 rounded-md border px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          checked={delayOrderIds.includes(order.id)}
                          onChange={(e) =>
                            setDelayOrderIds((current) =>
                              e.target.checked ? [...current, order.id] : current.filter((id) => id !== order.id)
                            )
                          }
                          className="mt-1"
                        />
                        <span>
                          <span className="font-medium">{order.orderNumber}</span>
                          <span className="block text-xs text-muted-foreground">
                            {order.clientName} • {order.status} • {order.paymentStatus}
                          </span>
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowDelayDialog(false)}>Cancel</Button>
                <Button onClick={handleNotifySupplierDelay}>Record & Notify</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
