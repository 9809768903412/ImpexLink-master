import { useEffect, useState } from 'react';
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
import { CreditCard, Search, Upload } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/api/client';
import type { Order, PaymentTransaction } from '@/types';
import { calcTotalsFromItems, VAT_RATE } from '@/lib/vat';
import { toast } from '@/hooks/use-toast';
import { formatPesoAmount } from '@/lib/currency';
import { toPublicFileUrl } from '@/lib/files';

export default function ClientPaymentHistoryPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [payments, setPayments] = useState<PaymentTransaction[]>([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    clientOrderId: '',
    method: 'CHEQUE',
    amount: '',
    referenceNumber: '',
    notes: '',
  });

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

  const filtered = orders.filter((o) =>
    [o.orderNumber, o.clientName, o.projectName].some((v) =>
      String(v || '').toLowerCase().includes(search.toLowerCase())
    )
  );
  const vatLabel = Math.round(VAT_RATE * 100);
  const totalsByOrder = new Map(
    filtered.map((o) => [
      o.id,
      calcTotalsFromItems(o.items.map((item) => ({ quantity: item.quantity, unitPrice: item.unitPrice }))),
    ])
  );

  const submitPayment = async () => {
    if (!form.clientOrderId) {
      toast({ title: 'Order required', description: 'Choose the order this payment belongs to.', variant: 'destructive' });
      return;
    }
    if (!form.amount || Number(form.amount) <= 0) {
      toast({ title: 'Amount required', description: 'Enter the amount you paid.', variant: 'destructive' });
      return;
    }
    if (!proofFile && !form.referenceNumber.trim()) {
      toast({ title: 'Proof or reference required', description: 'Upload a proof file or enter a cheque/deposit reference.', variant: 'destructive' });
      return;
    }
    try {
      const formData = new FormData();
      formData.append('paymentMethod', form.method);
      formData.append('amount', String(Number(form.amount)));
      if (form.referenceNumber.trim()) formData.append('referenceNumber', form.referenceNumber.trim());
      if (form.notes.trim()) formData.append('notes', form.notes.trim());
      if (proofFile) formData.append('proof', proofFile);
      await apiClient.post(`/orders/${form.clientOrderId}/payment-proof`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast({ title: 'Payment submitted', description: 'Office will verify the payment record.' });
      setOpen(false);
      setProofFile(null);
      setForm({ clientOrderId: '', method: 'CHEQUE', amount: '', referenceNumber: '', notes: '' });
      const [paymentResponse, orderResponse] = await Promise.all([
        apiClient.get('/payments'),
        apiClient.get('/orders'),
      ]);
      setPayments(paymentResponse.data?.data || paymentResponse.data || []);
      setOrders(orderResponse.data?.data || orderResponse.data || []);
    } catch (error: any) {
      toast({
        title: 'Unable to submit payment',
        description: error?.response?.data?.error || 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Payment History</h2>
          <p className="text-muted-foreground">Track payment status and submit Cheque or Auto Deposit references.</p>
        </div>
        <Button onClick={() => setOpen(true)} className="gap-2">
          <CreditCard size={16} />
          Submit Payment
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
          <CardTitle>Payments</CardTitle>
          <CardDescription>Statuses are updated in real time</CardDescription>
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
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    No payments found
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">{order.orderNumber}</TableCell>
                    <TableCell>{order.projectName || '-'}</TableCell>
                    <TableCell>
                      <Badge>{order.paymentStatus}</Badge>
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
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Submitted Payment Records</CardTitle>
          <CardDescription>Office verifies cheque and auto-deposit payments here.</CardDescription>
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
              {payments.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No submitted payment records yet.</TableCell></TableRow>
              ) : payments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell>{payment.referenceNumber || payment.clientOrderNumber || '-'}</TableCell>
                  <TableCell>{payment.method.replace(/-/g, ' ')}</TableCell>
                  <TableCell><Badge>{payment.status}</Badge></TableCell>
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
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit payment reference</DialogTitle>
            <DialogDescription>Use Cheque or Auto Deposit direct to the Impex savings account.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Order</Label>
              <Select value={form.clientOrderId} onValueChange={(value) => {
                const order = orders.find((entry) => entry.id === value);
                setForm((prev) => ({ ...prev, clientOrderId: value, amount: order ? String(order.total) : prev.amount }));
              }}>
                <SelectTrigger><SelectValue placeholder="Select order" /></SelectTrigger>
                <SelectContent>{orders.map((order) => <SelectItem key={order.id} value={order.id}>{order.orderNumber} - PHP {formatPesoAmount(order.total)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Payment Method</Label>
              <Select value={form.method} onValueChange={(value) => setForm((prev) => ({ ...prev, method: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CHEQUE">Cheque</SelectItem>
                  <SelectItem value="AUTO_DEPOSIT">Auto Deposit</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Amount</Label>
              <Input type="number" min="0" value={form.amount} onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))} />
            </div>
            <div>
              <Label>Reference Number</Label>
              <Input value={form.referenceNumber} onChange={(event) => setForm((prev) => ({ ...prev, referenceNumber: event.target.value }))} />
            </div>
            <div>
              <Label>Payment Proof</Label>
              <div className="mt-1 rounded-md border border-dashed p-3">
                <label className="flex cursor-pointer items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Upload size={16} />
                  <span>{proofFile ? proofFile.name : 'Upload cheque/deposit proof'}</span>
                  <Input
                    type="file"
                    accept="application/pdf,image/png,image/jpeg"
                    className="hidden"
                    onChange={(event) => setProofFile(event.target.files?.[0] || null)}
                  />
                </label>
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={submitPayment}>Submit</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
