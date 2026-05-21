import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Check, ChevronLeft, ChevronRight, CreditCard, Plus, Search, X } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { apiClient } from '@/api/client';
import { toast } from '@/hooks/use-toast';
import type { Order, PaymentTransaction, PurchaseOrder, Supplier } from '@/types';
import { formatPesoAmount } from '@/lib/currency';
import PaginationNav from '@/components/PaginationNav';
import { toPublicFileUrl } from '@/lib/files';
import StatusFilterSelect from '@/components/StatusFilterSelect';
import { statusBadgeClass } from '@/lib/statusStyles';
import { useAuth } from '@/contexts/AuthContext';

const selectorPageSize = 8;

function creditDaysForMethod(method: string) {
  if (method === 'NET_15') return '15';
  if (method === 'NET_30') return '30';
  if (method === 'NET_60') return '60';
  return '0';
}

function methodLabel(value: string) {
  return value.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function PaymentsPage() {
  const { user } = useAuth();
  const roleList = (user?.roles?.length ? user.roles : user?.role ? [user.role] : []).map((role) => String(role).toLowerCase());
  const isSalesAgent = roleList.includes('sales_agent');
  const canRecordPayments = roleList.some((role) => ['admin', 'president', 'sales_agent'].includes(role));
  const canManageSupplierPayments = roleList.some((role) => ['admin', 'president'].includes(role));
  const [payments, setPayments] = useState<PaymentTransaction[]>([]);
  const [summary, setSummary] = useState({ clientReceivables: 0, supplierPayables: 0, overdue: 0, cleared: 0 });
  const [orders, setOrders] = useState<Order[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [orderPickerPage, setOrderPickerPage] = useState(1);
  const [poPickerPage, setPoPickerPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<PaymentTransaction | null>(null);
  const [form, setForm] = useState({
    direction: 'CLIENT_TO_OFFICE',
    method: 'CHEQUE',
    status: 'PENDING',
    amount: '',
    creditDays: '30',
    clientOrderId: '',
    supplierOrderId: '',
    supplierId: '',
    referenceNumber: '',
    notes: '',
  });

  const fetchPayments = async () => {
    const response = await apiClient.get('/payments', {
      params: {
        q: search || undefined,
        status: status !== 'all' ? status : undefined,
        page: 1,
        pageSize: 500,
      },
    });
    setPayments(response.data?.data || response.data || []);
  };

  useEffect(() => {
    fetchPayments().catch(() => setPayments([]));
    if (canRecordPayments) {
      apiClient.get('/payments/summary').then((res) => setSummary(res.data)).catch(() => undefined);
    }
  }, [search, status, canRecordPayments]);

  useEffect(() => {
    if (canRecordPayments) {
      apiClient.get('/orders', { params: { page: 1, pageSize: 500 } }).then((res) => setOrders(res.data?.data || res.data || [])).catch(() => undefined);
      if (canManageSupplierPayments) {
        apiClient.get('/purchase-orders', { params: { page: 1, pageSize: 500 } }).then((res) => setPurchaseOrders(res.data?.data || res.data || [])).catch(() => undefined);
        apiClient.get('/suppliers').then((res) => setSuppliers(res.data?.data || res.data || [])).catch(() => undefined);
      }
    }
  }, [canRecordPayments, canManageSupplierPayments]);

  useEffect(() => setPage(1), [search, status]);

  const paged = useMemo(() => payments.slice((page - 1) * pageSize, page * pageSize), [payments, page, pageSize]);
  const orderPickerTotalPages = Math.max(Math.ceil(orders.length / selectorPageSize), 1);
  const poPickerTotalPages = Math.max(Math.ceil(purchaseOrders.length / selectorPageSize), 1);
  const visibleOrders = useMemo(
    () => orders.slice((orderPickerPage - 1) * selectorPageSize, orderPickerPage * selectorPageSize),
    [orders, orderPickerPage]
  );
  const visiblePurchaseOrders = useMemo(
    () => purchaseOrders.slice((poPickerPage - 1) * selectorPageSize, poPickerPage * selectorPageSize),
    [purchaseOrders, poPickerPage]
  );

  const savePayment = async () => {
    if (!form.amount || Number(form.amount) <= 0) {
      toast({ title: 'Amount required', description: 'Enter a payment amount.', variant: 'destructive' });
      return;
    }
    try {
      await apiClient.post('/payments', {
        ...form,
        clientOrderId: form.direction === 'CLIENT_TO_OFFICE' ? form.clientOrderId || undefined : undefined,
        supplierOrderId: form.direction === 'OFFICE_TO_SUPPLIER' ? form.supplierOrderId || undefined : undefined,
        supplierId: form.direction === 'OFFICE_TO_SUPPLIER' ? form.supplierId || undefined : undefined,
        amount: Number(form.amount),
        creditDays: Number(form.creditDays || 30),
      });
      toast({ title: 'Payment recorded', description: 'The payment flow was added.' });
      setOpen(false);
      setForm({
        direction: 'CLIENT_TO_OFFICE',
        method: 'CHEQUE',
        status: 'PENDING',
        amount: '',
        creditDays: '30',
        clientOrderId: '',
        supplierOrderId: '',
        supplierId: '',
        referenceNumber: '',
        notes: '',
      });
      setOrderPickerPage(1);
      setPoPickerPage(1);
      fetchPayments();
    } catch (error: any) {
      toast({
        title: 'Unable to save payment',
        description: error?.response?.data?.error || 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const updateStatus = async (payment: PaymentTransaction, nextStatus: string) => {
    const previousPayments = payments;
    const previousSelectedPayment = selectedPayment;
    setPayments((prev) => prev.map((entry) => (entry.id === payment.id ? { ...entry, status: nextStatus } : entry)));
    setSelectedPayment((current) => (current?.id === payment.id ? { ...current, status: nextStatus } : current));
    try {
      const response = await apiClient.put(`/payments/${payment.id}`, { status: nextStatus.toUpperCase() });
      const updatedPayment = response.data;
      setPayments((prev) => prev.map((entry) => (entry.id === payment.id ? updatedPayment : entry)));
      setSelectedPayment((current) => (current?.id === payment.id ? updatedPayment : current));
      toast({
        title: 'Payment updated',
        description: `Payment marked as ${nextStatus}.`,
      });
    } catch (error: any) {
      setPayments(previousPayments);
      setSelectedPayment(previousSelectedPayment);
      toast({
        title: 'Unable to update payment',
        description: error?.response?.data?.error || 'Please try again.',
        variant: 'destructive',
      });
      fetchPayments();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <CreditCard className="h-6 w-6 text-primary" />
            Payment Process
          </h2>
          <p className="text-muted-foreground">
            {isSalesAgent ? 'Monitor payments for client orders assigned to you.' : 'Track Client to Office and Office to Supplier payments.'}
          </p>
        </div>
        {canRecordPayments ? (
          <Button onClick={() => setOpen(true)} className="gap-2">
            <Plus size={16} />
            Record Payment
          </Button>
        ) : null}
      </div>

      {canRecordPayments ? (
        <div className={`grid gap-4 ${canManageSupplierPayments ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
          <Card><CardHeader><CardDescription>Client receivables</CardDescription><CardTitle>PHP {formatPesoAmount(summary.clientReceivables)}</CardTitle></CardHeader></Card>
          {canManageSupplierPayments ? <Card><CardHeader><CardDescription>Supplier payables</CardDescription><CardTitle>PHP {formatPesoAmount(summary.supplierPayables)}</CardTitle></CardHeader></Card> : null}
          <Card><CardHeader><CardDescription>Cleared</CardDescription><CardTitle>PHP {formatPesoAmount(summary.cleared)}</CardTitle></CardHeader></Card>
          <Card><CardHeader><CardDescription>Overdue</CardDescription><CardTitle>PHP {formatPesoAmount(summary.overdue)}</CardTitle></CardHeader></Card>
        </div>
      ) : null}

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search reference, order, client, supplier..." className="pl-9" />
            </div>
            <StatusFilterSelect value={status} onValueChange={setStatus} placeholder="Status">
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="received">Received</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
            </StatusFilterSelect>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Flow</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                {isSalesAgent ? <TableHead className="text-right">Quick Update</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.length === 0 ? (
                <TableRow><TableCell colSpan={isSalesAgent ? 6 : 5} className="py-8 text-center text-muted-foreground">No payment records yet.</TableCell></TableRow>
              ) : paged.map((payment) => (
                <TableRow
                  key={payment.id}
                  className="cursor-pointer transition-colors hover:bg-muted/50"
                  onClick={() => setSelectedPayment(payment)}
                >
                  <TableCell>
                    <p className="font-medium">{payment.direction === 'client-to-office' ? 'Client to Office' : 'Office to Supplier'}</p>
                    <p className="text-xs text-muted-foreground">{payment.clientName || payment.supplierName || 'Unlinked'}</p>
                  </TableCell>
                  <TableCell>{payment.referenceNumber || payment.clientOrderNumber || payment.supplierPoNumber || '-'}</TableCell>
                  <TableCell>{payment.dueDate ? format(new Date(payment.dueDate), 'MMM dd, yyyy') : '-'}</TableCell>
                  <TableCell><Badge variant="outline" className={`capitalize ${statusBadgeClass(payment.status)}`}>{payment.status}</Badge></TableCell>
                  <TableCell className="text-right">PHP {formatPesoAmount(payment.amount)}</TableCell>
                  {isSalesAgent ? (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="icon"
                          className="h-8 w-8"
                          title="Confirm received"
                          onClick={(event) => {
                            event.stopPropagation();
                            updateStatus(payment, 'received');
                          }}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-8 w-8 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          title="Reject or cancel"
                          onClick={(event) => {
                            event.stopPropagation();
                            updateStatus(payment, 'cancelled');
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <PaginationNav page={page} totalPages={Math.max(Math.ceil(payments.length / pageSize), 1)} onPageChange={setPage} />

      <Dialog open={!!selectedPayment} onOpenChange={(nextOpen) => !nextOpen && setSelectedPayment(null)}>
        {selectedPayment && (
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Payment details</DialogTitle>
              <DialogDescription>Review proof, references, notes, and update the payment state.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Flow</p>
                  <p className="font-medium">{selectedPayment.direction === 'client-to-office' ? 'Client to Office' : 'Office to Supplier'}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge variant="outline" className={`mt-1 capitalize ${statusBadgeClass(selectedPayment.status)}`}>{selectedPayment.status}</Badge>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Reference</p>
                  <p className="font-medium">{selectedPayment.referenceNumber || selectedPayment.clientOrderNumber || selectedPayment.supplierPoNumber || '-'}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Method</p>
                  <p className="font-medium">{methodLabel(selectedPayment.method)}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Due</p>
                  <p className="font-medium">{selectedPayment.dueDate ? format(new Date(selectedPayment.dueDate), 'MMM dd, yyyy') : '-'}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Amount</p>
                  <p className="font-medium">PHP {formatPesoAmount(selectedPayment.amount)}</p>
                </div>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Proof</p>
                {selectedPayment.proofUrl ? (
                  <a className="mt-1 inline-flex text-sm font-medium text-primary hover:underline" href={toPublicFileUrl(selectedPayment.proofUrl)} target="_blank" rel="noreferrer">
                    View uploaded proof
                  </a>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">No proof uploaded.</p>
                )}
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Notes</p>
                <p className="mt-1 text-sm">{selectedPayment.notes || 'No notes recorded.'}</p>
              </div>
              <div>
                <Label>Status action</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {['pending', 'received', 'paid', 'overdue', 'cancelled'].map((nextStatus) => {
                    const icon = nextStatus === 'received' ? <Check className="h-4 w-4" /> : nextStatus === 'cancelled' ? <X className="h-4 w-4" /> : null;
                    return (
                      <Button
                        key={nextStatus}
                        variant={selectedPayment.status === nextStatus ? 'default' : 'outline'}
                        size="sm"
                        className="gap-2"
                        onClick={() => updateStatus(selectedPayment, nextStatus)}
                      >
                        {icon}
                        {nextStatus === 'cancelled' ? 'Rejected' : nextStatus.replace(/\b\w/g, (letter) => letter.toUpperCase())}
                      </Button>
                    );
                  })}
                </div>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Record payment</DialogTitle>
            <DialogDescription>{isSalesAgent ? 'Record payment updates for client orders assigned to you.' : 'Client payments are Cheque or Auto Deposit. Supplier payments include Cash, GCash, Cheque, and Net terms.'}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Flow</Label>
              <Select value={form.direction} onValueChange={(value) => setForm((prev) => {
                const nextMethod = value === 'CLIENT_TO_OFFICE' ? 'CHEQUE' : 'NET_30';
                return {
                  ...prev,
                  direction: value,
                  method: nextMethod,
                  creditDays: value === 'CLIENT_TO_OFFICE' ? '0' : creditDaysForMethod(nextMethod),
                  clientOrderId: '',
                  supplierOrderId: '',
                  supplierId: '',
                };
              })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CLIENT_TO_OFFICE">Client to Office</SelectItem>
                  {canManageSupplierPayments ? <SelectItem value="OFFICE_TO_SUPPLIER">Office to Supplier</SelectItem> : null}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Method</Label>
              <Select value={form.method} onValueChange={(value) => setForm((prev) => ({ ...prev, method: value, creditDays: prev.direction === 'OFFICE_TO_SUPPLIER' ? creditDaysForMethod(value) : '0' }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {form.direction === 'CLIENT_TO_OFFICE' ? (
                    <>
                      <SelectItem value="CHEQUE">Cheque</SelectItem>
                      <SelectItem value="AUTO_DEPOSIT">Auto Deposit</SelectItem>
                    </>
                  ) : (
                    <>
                      <SelectItem value="CASH">Cash</SelectItem>
                      <SelectItem value="GCASH">GCash</SelectItem>
                      <SelectItem value="CHEQUE">Cheque</SelectItem>
                      <SelectItem value="NET_15">Net 15</SelectItem>
                      <SelectItem value="NET_30">Net 30</SelectItem>
                      <SelectItem value="NET_60">Net 60</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
              {form.direction === 'OFFICE_TO_SUPPLIER' ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Net 15, Net 30, and Net 60 set the supplier payable due date automatically.
                </p>
              ) : null}
            </div>
            {form.direction === 'CLIENT_TO_OFFICE' ? (
              <div className="sm:col-span-2">
                <Label>Client Order</Label>
                <Select value={form.clientOrderId} onValueChange={(value) => {
                  const order = orders.find((entry) => entry.id === value);
                  setForm((prev) => ({ ...prev, clientOrderId: value, amount: order ? String(order.total) : prev.amount }));
                }}>
                  <SelectTrigger><SelectValue placeholder="Optional order link" /></SelectTrigger>
                  <SelectContent>
                    {visibleOrders.map((order) => <SelectItem key={order.id} value={order.id}>{order.orderNumber} - {order.clientName}</SelectItem>)}
                    {orders.length > selectorPageSize && (
                      <div className="flex items-center justify-between border-t px-2 py-1.5 text-xs text-muted-foreground">
                        <span>Page {orderPickerPage} of {orderPickerTotalPages}</span>
                        <div className="flex gap-1">
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={orderPickerPage <= 1} onClick={(event) => { event.preventDefault(); setOrderPickerPage((current) => Math.max(current - 1, 1)); }}>
                            <ChevronLeft size={14} />
                          </Button>
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={orderPickerPage >= orderPickerTotalPages} onClick={(event) => { event.preventDefault(); setOrderPickerPage((current) => Math.min(current + 1, orderPickerTotalPages)); }}>
                            <ChevronRight size={14} />
                          </Button>
                        </div>
                      </div>
                    )}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <>
                <div>
                  <Label>Supplier</Label>
                  <Select value={form.supplierId} onValueChange={(value) => setForm((prev) => ({ ...prev, supplierId: value }))}>
                    <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                    <SelectContent>{suppliers.map((supplier) => <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Purchase Order</Label>
                  <Select value={form.supplierOrderId} onValueChange={(value) => {
                    const po = purchaseOrders.find((entry) => entry.id === value);
                    setForm((prev) => ({ ...prev, supplierOrderId: value, amount: po ? String(po.total) : prev.amount }));
                  }}>
                    <SelectTrigger><SelectValue placeholder="Optional PO link" /></SelectTrigger>
                    <SelectContent>
                      {visiblePurchaseOrders.map((po) => <SelectItem key={po.id} value={po.id}>{po.poNumber} - {po.supplierName}</SelectItem>)}
                      {purchaseOrders.length > selectorPageSize && (
                        <div className="flex items-center justify-between border-t px-2 py-1.5 text-xs text-muted-foreground">
                          <span>Page {poPickerPage} of {poPickerTotalPages}</span>
                          <div className="flex gap-1">
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={poPickerPage <= 1} onClick={(event) => { event.preventDefault(); setPoPickerPage((current) => Math.max(current - 1, 1)); }}>
                              <ChevronLeft size={14} />
                            </Button>
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={poPickerPage >= poPickerTotalPages} onClick={(event) => { event.preventDefault(); setPoPickerPage((current) => Math.min(current + 1, poPickerTotalPages)); }}>
                              <ChevronRight size={14} />
                            </Button>
                          </div>
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            <div>
              <Label>Amount</Label>
              <Input type="number" min="0" value={form.amount} onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))} />
            </div>
            <div>
              <Label>{form.direction === 'OFFICE_TO_SUPPLIER' ? 'Supplier Terms / Credit Days' : 'Credit Days'}</Label>
              <Input type="number" min="0" value={form.creditDays} onChange={(event) => setForm((prev) => ({ ...prev, creditDays: event.target.value }))} />
            </div>
            <div>
              <Label>Reference</Label>
              <Input value={form.referenceNumber} onChange={(event) => setForm((prev) => ({ ...prev, referenceNumber: event.target.value }))} placeholder="Cheque no., deposit ref., OR..." />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(value) => setForm((prev) => ({ ...prev, status: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="RECEIVED">Received</SelectItem>
                  <SelectItem value="PAID">Paid</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={savePayment}>Save Payment</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
