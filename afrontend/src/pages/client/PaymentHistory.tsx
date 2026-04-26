import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Search } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/api/client';
import type { Order } from '@/types';
import { calcTotalsFromItems, VAT_RATE } from '@/lib/vat';

export default function ClientPaymentHistoryPage() {
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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Payment History</h2>
        <p className="text-muted-foreground">Track payment status of your orders</p>
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
    </div>
  );
}
