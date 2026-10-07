import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CreditCard, Search } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/api/client';
import type { Order, PaymentTransaction } from '@/types';
import { calcTotalsFromItems, VAT_RATE } from '@/lib/vat';
import { formatPesoAmount } from '@/lib/currency';
import { toPublicFileUrl } from '@/lib/files';
import PaginationNav from '@/components/PaginationNav';
import { statusBadgeClass } from '@/lib/statusStyles';
import TableExportMenu from '@/components/TableExportMenu';
import TableDateRangeFilter, { useTableDateRange } from '@/components/TableDateRangeFilter';

const paymentStatusColors: Record<string, string> = {
  pending: 'border-amber-200 bg-amber-50 text-amber-800',
  verified: 'border-sky-200 bg-sky-50 text-sky-800',
  received: 'border-sky-200 bg-sky-50 text-sky-800',
  paid: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  failed: 'border-red-200 bg-red-50 text-red-800',
  cancelled: 'border-slate-200 bg-slate-100 text-slate-700',
};

export default function ClientPaymentHistoryPage() {
  const paymentDates = useTableDateRange();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [payments, setPayments] = useState<PaymentTransaction[]>([]);
  const [search, setSearch] = useState('');
  const [orderStatus, setOrderStatus] = useState('all');
  const [recordStatus, setRecordStatus] = useState('all');
  const [paymentMethod, setPaymentMethod] = useState('all');
  const [ordersPage, setOrdersPage] = useState(1);
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [pageSize] = useState(10);

  useEffect(() => {
    if (!user?.id) return;
    apiClient
      .get('/orders')
      .then((res) => {
        const payload = res.data?.data || res.data || [];
        setOrders(payload);
      })
      .catch(() => setOrders([]));
    apiClient
      .get('/payments')
      .then((res) => setPayments(res.data?.data || res.data || []))
      .catch(() => setPayments([]));
  }, [user?.id]);

  const datedPayments = payments.filter((payment) => paymentDates.matches(payment.createdAt)
    && (recordStatus === 'all' || payment.status === recordStatus)
    && (paymentMethod === 'all' || payment.method === paymentMethod)
    && [payment.referenceNumber, payment.clientOrderNumber, payment.method, payment.status].some((value) => String(value || '').toLowerCase().includes(search.trim().toLowerCase())));
  const filtered = orders.filter((order) => paymentDates.matches(order.createdAt) && (orderStatus === 'all' || order.paymentStatus === orderStatus)).filter((o) =>
    [o.orderNumber, o.clientName, o.projectName].some((v) =>
      String(v || '').toLowerCase().includes(search.toLowerCase())
    )
  );
  const orderTotalPages = Math.max(Math.ceil(filtered.length / pageSize), 1);
  const paymentTotalPages = Math.max(Math.ceil(datedPayments.length / pageSize), 1);
  const pagedOrders = useMemo(
    () => filtered.slice((ordersPage - 1) * pageSize, ordersPage * pageSize),
    [filtered, ordersPage, pageSize]
  );
  const pagedPayments = useMemo(
    () => datedPayments.slice((paymentsPage - 1) * pageSize, paymentsPage * pageSize),
    [datedPayments, paymentsPage, pageSize]
  );
  const vatLabel = Math.round(VAT_RATE * 100);
  const totalsByOrder = new Map(
    pagedOrders.map((o) => [
      o.id,
      calcTotalsFromItems(o.items.map((item) => ({ quantity: item.quantity, unitPrice: item.unitPrice }))),
    ])
  );

  useEffect(() => {
    setOrdersPage(1);
    setPaymentsPage(1);
  }, [search, orderStatus, recordStatus, paymentMethod]);

  useEffect(() => {
    if (ordersPage > orderTotalPages) setOrdersPage(orderTotalPages);
  }, [ordersPage, orderTotalPages]);

  useEffect(() => {
    if (paymentsPage > paymentTotalPages) setPaymentsPage(paymentTotalPages);
  }, [paymentsPage, paymentTotalPages]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Payment History</h2>
          <p className="text-muted-foreground">Track payment status and submit Cheque or Auto Deposit references.</p>
        </div>
        <Button onClick={() => navigate('/client/orders')} className="gap-2">
          <CreditCard size={16} />
          Submit from Orders
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search payments..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Payments</CardTitle>
              <CardDescription>Statuses are updated in real time</CardDescription>
            </div>
            <TableDateRangeFilter label="Order / payment date" range={paymentDates.range} onChange={(range) => { paymentDates.setRange(range); setOrdersPage(1); setPaymentsPage(1); }} />
            <select aria-label="Order payment status" className="h-10 rounded-md border bg-background px-3 text-sm" value={orderStatus} onChange={(event) => setOrderStatus(event.target.value)}>
              <option value="all">All payment statuses</option>
              {[...new Set(orders.map((order) => order.paymentStatus))].sort().map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
            <TableExportMenu
              title="Order Payment Status"
              filename="order-payment-status"
              columns={[
                { header: 'Order #', value: (order) => order.orderNumber },
                { header: 'Project', value: (order) => order.projectName || '' },
                { header: 'Status', value: (order) => order.paymentStatus },
                { header: 'VATable Sales', value: (order) => `PHP ${formatPesoAmount(calcTotalsFromItems(order.items.map((item) => ({ quantity: item.quantity, unitPrice: item.unitPrice }))).net)}` },
                { header: `VAT (${vatLabel}%)`, value: (order) => `PHP ${formatPesoAmount(calcTotalsFromItems(order.items.map((item) => ({ quantity: item.quantity, unitPrice: item.unitPrice }))).vat)}` },
                { header: 'Total', value: (order) => `PHP ${formatPesoAmount(calcTotalsFromItems(order.items.map((item) => ({ quantity: item.quantity, unitPrice: item.unitPrice }))).total)}` },
              ]}
              currentRows={pagedOrders}
              allRows={filtered}
              page={ordersPage}
              pageSize={pageSize}
              totalPages={orderTotalPages}
              totalItems={filtered.length}
              filters={[...paymentDates.filters, { label: 'Search', value: search }, { label: 'Payment status', value: orderStatus === 'all' ? '' : orderStatus }]}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order #</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>VATable Sales</TableHead>
                <TableHead>VAT ({vatLabel}%)</TableHead>
                <TableHead>Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No payments found
                  </TableCell>
                </TableRow>
              ) : (
                pagedOrders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">{order.orderNumber}</TableCell>
                    <TableCell>{order.projectName || '-'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`capitalize ${statusBadgeClass(order.paymentStatus)}`}>
                        {order.paymentStatus}
                      </Badge>
                    </TableCell>
                    <TableCell>₱{totalsByOrder.get(order.id)?.net.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell>₱{totalsByOrder.get(order.id)?.vat.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell>₱{totalsByOrder.get(order.id)?.total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
        <div className="border-t px-4 py-3">
          <PaginationNav page={ordersPage} totalPages={orderTotalPages} onPageChange={setOrdersPage} />
        </div>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Submitted Payment Records</CardTitle>
              <CardDescription>Office verifies cheque and auto-deposit payments here.</CardDescription>
            </div>
            <select aria-label="Submitted payment status" className="h-10 rounded-md border bg-background px-3 text-sm" value={recordStatus} onChange={(event) => setRecordStatus(event.target.value)}>
              <option value="all">All statuses</option>
              {[...new Set(payments.map((payment) => payment.status))].sort().map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
            <select aria-label="Payment method" className="h-10 rounded-md border bg-background px-3 text-sm" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
              <option value="all">All methods</option>
              {[...new Set(payments.map((payment) => payment.method))].sort().map((method) => <option key={method} value={method}>{method.replace(/-/g, ' ')}</option>)}
            </select>
            <TableExportMenu
              title="Submitted Payment Records"
              filename="submitted-payments"
              columns={[
                { header: 'Reference', value: (payment) => payment.referenceNumber || payment.clientOrderNumber || '-' },
                { header: 'Method', value: (payment) => payment.method.replace(/-/g, ' ') },
                { header: 'Status', value: (payment) => payment.status },
                { header: 'Proof URL', value: (payment) => payment.proofUrl ? toPublicFileUrl(payment.proofUrl) : '' },
                { header: 'Due', value: (payment) => payment.dueDate || '' },
                { header: 'Amount', value: (payment) => `PHP ${formatPesoAmount(payment.amount)}` },
              ]}
              currentRows={pagedPayments}
              allRows={datedPayments}
              page={paymentsPage}
              pageSize={pageSize}
              totalPages={paymentTotalPages}
              totalItems={datedPayments.length}
              filters={[...paymentDates.filters, { label: 'Search', value: search }, { label: 'Status', value: recordStatus === 'all' ? '' : recordStatus }, { label: 'Method', value: paymentMethod === 'all' ? '' : paymentMethod }]}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Proof</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {datedPayments.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No submitted payment records yet.</TableCell></TableRow>
              ) : pagedPayments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell>{payment.referenceNumber || payment.clientOrderNumber || '-'}</TableCell>
                  <TableCell>{payment.method.replace(/-/g, ' ')}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`capitalize ${statusBadgeClass(payment.status)}`}>
                      {payment.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {payment.proofUrl ? (
                      <a className="text-sm font-medium text-primary hover:underline" href={toPublicFileUrl(payment.proofUrl)} target="_blank" rel="noreferrer">
                        View
                      </a>
                    ) : (
                      <span className="text-sm text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>{payment.dueDate || '-'}</TableCell>
                  <TableCell className="text-right">PHP {formatPesoAmount(payment.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
        <div className="border-t px-4 py-3">
          <PaginationNav page={paymentsPage} totalPages={paymentTotalPages} onPageChange={setPaymentsPage} />
        </div>
      </Card>
    </div>
  );
}
