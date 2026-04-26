import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Download, Search } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/api/client';
import type { Order } from '@/types';
import { printHtml } from '@/utils/print';
import { calcTotalsFromItems, VAT_RATE } from '@/lib/vat';

export default function ClientInvoicesPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!user?.id) return;
    apiClient
      .get('/orders')
      .then((res) => {
        const payload = res.data?.data || res.data || [];
        setOrders(payload);
      })
      .catch(() => setOrders([]));
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

  const handleDownloadInvoice = (order: Order) => {
    const itemsHtml = order.items
      .map(
        (item) =>
          `<tr><td>${item.itemName}</td><td>${item.unit}</td><td>${item.quantity}</td><td>₱${item.unitPrice.toFixed(2)}</td><td>₱${item.amount.toFixed(2)}</td></tr>`
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
      <div class=\"total\">VATable Sales: ₱${totalsByOrder.get(order.id)?.net.toFixed(2)}</div>
      <div class=\"total\">VAT (${vatLabel}%): ₱${totalsByOrder.get(order.id)?.vat.toFixed(2)}</div>
      <div class=\"total\">Total Amount Due: ₱${totalsByOrder.get(order.id)?.total.toFixed(2)}</div>`
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Invoices</h2>
        <p className="text-muted-foreground">All invoices for your orders</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search invoices..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invoice List</CardTitle>
          <CardDescription>Download official invoices</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>VATable Sales</TableHead>
                <TableHead>VAT ({vatLabel}%)</TableHead>
                <TableHead>Total</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No invoices found
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
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" onClick={() => handleDownloadInvoice(order)}>
                        <Download size={14} className="mr-1" />
                        Download
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
