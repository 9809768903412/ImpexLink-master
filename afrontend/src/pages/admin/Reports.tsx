import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Download, Calendar as CalendarIcon, TrendingUp, TrendingDown, Package, Truck, AlertTriangle } from 'lucide-react';
import { apiClient } from '@/api/client';
import type { InventoryItem, Order, Delivery, Project } from '@/types';
import { printHtml } from '@/utils/print';
import { calcTotalsFromItems, VAT_RATE } from '@/lib/vat';

// TODO: Replace with real data from Lovable Cloud database
export default function ReportsPage() {
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: new Date(2025, 0, 1),
    to: new Date(),
  });
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [projectStatusFilter, setProjectStatusFilter] = useState<string>('all');
  const [inventoryCategoryFilter, setInventoryCategoryFilter] = useState<string>('all');
  const [deliveryStatusFilter, setDeliveryStatusFilter] = useState<string>('all');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>('all');
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    let mounted = true;
    const fetchAll = async () => {
      try {
        const [inventoryRes, ordersRes, deliveriesRes, projectsRes] = await Promise.all([
          apiClient.get('/inventory', { params: { page: 1, pageSize: 10000 } }),
          apiClient.get('/orders', { params: { page: 1, pageSize: 10000 } }),
          apiClient.get('/deliveries', { params: { page: 1, pageSize: 10000 } }),
          apiClient.get('/projects', { params: { page: 1, pageSize: 10000 } }),
        ]);
        if (!mounted) return;
        const invPayload = inventoryRes.data;
        const ordersPayload = ordersRes.data;
        const deliveriesPayload = deliveriesRes.data;
        const projectsPayload = projectsRes.data;
        setInventory(invPayload?.data || invPayload || []);
        setOrders(ordersPayload?.data || ordersPayload || []);
        setDeliveries(deliveriesPayload?.data || deliveriesPayload || []);
        setProjects(projectsPayload?.data || projectsPayload || []);
      } catch {
        if (!mounted) return;
        setInventory([]);
        setOrders([]);
        setDeliveries([]);
        setProjects([]);
      }
    };
    fetchAll();
    return () => {
      mounted = false;
    };
  }, []);

  const ordersInRange = orders.filter((o) => {
    const created = new Date(o.createdAt);
    return created >= dateRange.from && created <= dateRange.to;
  });

  const deliveriesInRange = deliveries.filter((d) => {
    const date = d.issuedAt ? new Date(d.issuedAt) : d.eta ? new Date(d.eta) : null;
    if (!date) return true;
    return date >= dateRange.from && date <= dateRange.to;
  });

  // Inventory Report Data
  const totalSku = inventory.length;
  const totalOnHand = inventory.reduce((sum, item) => sum + item.qtyOnHand, 0);
  const lowStockItems = inventory
    .filter((item) => item.qtyOnHand <= item.minStock)
    .sort((a, b) => (a.minStock ? a.qtyOnHand / a.minStock : 1) - (b.minStock ? b.qtyOnHand / b.minStock : 1));
  const outOfStockItems = inventory.filter((item) => item.qtyOnHand === 0);

  const inventoryByCategory = Object.values(
    inventory.reduce<Record<string, { name: string; count: number; value: number }>>(
      (acc, item) => {
        const key = item.category || 'Uncategorized';
        if (!acc[key]) acc[key] = { name: key, count: 0, value: 0 };
        acc[key].count += item.qtyOnHand;
        acc[key].value += item.qtyOnHand * item.unitPrice;
        return acc;
      },
      {}
    )
  );

  const topValueItems = [...inventory]
    .sort((a, b) => b.qtyOnHand * b.unitPrice - a.qtyOnHand * a.unitPrice)
    .slice(0, 10);

  const suggestedPoQty = (item: InventoryItem) => {
    const min = item.minStock || 0;
    if (!min) return 0;
    const target = Math.max(min * 2, min + 10);
    return Math.max(target - item.qtyOnHand, 0);
  };

  const filteredInventoryByCategory =
    inventoryCategoryFilter === 'all'
      ? inventoryByCategory
      : inventoryByCategory.filter((cat) => cat.name === inventoryCategoryFilter);

  const filteredProjects = projects
    .filter((proj) => (projectFilter === 'all' ? true : String(proj.id) === projectFilter))
    .filter((proj) => (projectStatusFilter === 'all' ? true : proj.status === projectStatusFilter));

  // Project Consumption Data
  const projectConsumption = filteredProjects.map((proj) => ({
    name: proj.name.split(' ').slice(0, 2).join(' '),
    orders: ordersInRange.filter((o) => o.projectId === proj.id).length,
    value: ordersInRange
      .filter((o) => o.projectId === proj.id)
      .reduce((sum, o) => sum + o.total, 0),
  }));

  const projectLastOrderMap = ordersInRange.reduce<Record<string, Date>>((acc, order) => {
    if (!order.projectId) return acc;
    const date = new Date(order.createdAt);
    if (!acc[order.projectId] || acc[order.projectId] < date) {
      acc[order.projectId] = date;
    }
    return acc;
  }, {});

  const projectsNoOrders = filteredProjects.filter((proj) => !ordersInRange.some((o) => o.projectId === proj.id));

  // Delivery Performance Data
  const deliveryStats = {
    delivered: deliveriesInRange.filter((d) => d.status === 'delivered').length,
    inTransit: deliveriesInRange.filter((d) => d.status === 'in-transit').length,
    pending: deliveriesInRange.filter((d) => d.status === 'pending').length,
    overdue: deliveriesInRange
      .filter((d) => (d.status === 'pending' || d.status === 'in-transit') && d.eta)
      .filter((d) => new Date(d.eta) < new Date()).length,
  };
  const overdueDeliveries = deliveriesInRange
    .filter((d) => (d.status === 'pending' || d.status === 'in-transit') && d.eta)
    .map((d) => ({ ...d, etaDate: new Date(d.eta) }))
    .filter((d) => d.etaDate < new Date())
    .sort((a, b) => a.etaDate.getTime() - b.etaDate.getTime());
  const upcomingDeliveries = deliveriesInRange.filter((d) => {
    if (!d.eta) return false;
    const eta = new Date(d.eta);
    const diff = (eta.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 2;
  });

  const filteredDeliveries =
    deliveryStatusFilter === 'all'
      ? deliveriesInRange
      : deliveriesInRange.filter((d) => d.status === deliveryStatusFilter);

  const filteredOrdersForVat =
    paymentStatusFilter === 'all'
      ? ordersInRange
      : ordersInRange.filter((o) => o.paymentStatus === paymentStatusFilter);

  // Financial Summary
  const getOrderTotals = (order: Order) =>
    calcTotalsFromItems(order.items.map((item) => ({ quantity: item.quantity, unitPrice: item.unitPrice })));
  const totalRevenue = ordersInRange.reduce((sum, o) => sum + getOrderTotals(o).total, 0);
  const totalVAT = ordersInRange.reduce((sum, o) => sum + getOrderTotals(o).vat, 0);
  const paidOrders = ordersInRange.filter((o) => o.paymentStatus === 'paid');
  const receivedPayments = paidOrders.reduce((sum, o) => sum + getOrderTotals(o).total, 0);
  const pendingPayments = totalRevenue - receivedPayments;
  const averageOrder = ordersInRange.length ? totalRevenue / ordersInRange.length : 0;

  const now = new Date();
  const startCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const revenueCurrentMonth = orders
    .filter((o) => new Date(o.createdAt) >= startCurrentMonth)
    .reduce((sum, o) => sum + getOrderTotals(o).total, 0);
  const revenuePrevMonth = orders
    .filter((o) => new Date(o.createdAt) >= startPrevMonth && new Date(o.createdAt) < startCurrentMonth)
    .reduce((sum, o) => sum + getOrderTotals(o).total, 0);
  const revenueDelta = revenueCurrentMonth - revenuePrevMonth;
  const revenuePercent =
    revenuePrevMonth === 0 ? null : Math.round((revenueDelta / revenuePrevMonth) * 1000) / 10;

  const monthlyTrend = Array.from({ length: 5 }).map((_, idx) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (4 - idx), 1);
    const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
    const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 1);
    const monthOrders = orders.filter(
      (o) => new Date(o.createdAt) >= monthStart && new Date(o.createdAt) < monthEnd
    );
    const revenue = monthOrders.reduce((sum, o) => sum + getOrderTotals(o).total, 0);
    return { month: format(date, 'MMM'), revenue, orders: monthOrders.length };
  });

  const openBalances = ordersInRange
    .filter((o) => o.paymentStatus === 'pending' || o.paymentStatus === 'verified')
    .sort((a, b) => getOrderTotals(b).total - getOrderTotals(a).total);
  const vatLabel = Math.round(VAT_RATE * 100);

  const handleExport = (type: string) => {
    if (type === 'inventory') {
      const rows = filteredInventoryByCategory
        .map((cat) => `<tr><td>${cat.name}</td><td>${cat.count}</td><td>₱${cat.value.toFixed(2)}</td></tr>`)
        .join('');
      printHtml(
        'Inventory Report',
        `<h1>Inventory Report</h1>
        <div class="meta">Date: ${format(new Date(), 'yyyy-MM-dd')}</div>
        <table><thead><tr><th>Category</th><th>Items</th><th>Total Value</th></tr></thead><tbody>${rows}</tbody></table>`
      );
      return;
    }
    if (type === 'projects') {
      const rows = projectConsumption
        .map((proj) => `<tr><td>${proj.name}</td><td>${proj.orders}</td><td>₱${proj.value.toFixed(2)}</td></tr>`)
        .join('');
      printHtml(
        'Project Report',
        `<h1>Project Consumption</h1>
        <div class="meta">Date: ${format(new Date(), 'yyyy-MM-dd')}</div>
        <table><thead><tr><th>Project</th><th>Orders</th><th>Total Value</th></tr></thead><tbody>${rows}</tbody></table>`
      );
      return;
    }
    if (type === 'delivery') {
      const rows = filteredDeliveries
        .map((d) => `<tr><td>${d.drNumber}</td><td>${d.clientName}</td><td>${d.status}</td><td>${format(new Date(d.eta), 'MMM dd')}</td></tr>`)
        .join('');
      printHtml(
        'Delivery Report',
        `<h1>Delivery Report</h1>
        <div class="meta">Date: ${format(new Date(), 'yyyy-MM-dd')}</div>
        <table><thead><tr><th>DR #</th><th>Client</th><th>Status</th><th>ETA</th></tr></thead><tbody>${rows}</tbody></table>`
      );
      return;
    }
    if (type.startsWith('financial')) {
      const rows = filteredOrdersForVat
        .map((o) => {
          const totals = getOrderTotals(o);
          return `<tr><td>${o.orderNumber}</td><td>${o.clientName}</td><td>₱${totals.net.toFixed(2)}</td><td>₱${totals.vat.toFixed(2)}</td><td>₱${totals.total.toFixed(2)}</td></tr>`;
        })
        .join('');
      printHtml(
        'Financial Report',
        `<h1>Financial Report</h1>
        <div class="meta">Date: ${format(new Date(), 'yyyy-MM-dd')}</div>
        <table><thead><tr><th>Order #</th><th>Client</th><th>VATable Sales</th><th>VAT</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table>
        <div class="total">Total Revenue: ₱${filteredOrdersForVat.reduce((sum, o) => sum + getOrderTotals(o).total, 0).toFixed(2)}</div>`
      );
      return;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Reports</h2>
          <p className="text-muted-foreground">Business analytics and export tools</p>
        </div>
        <div className="flex gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline">
                <CalendarIcon size={16} className="mr-2" />
                {format(dateRange.from, 'MMM dd')} - {format(dateRange.to, 'MMM dd, yyyy')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="range"
                selected={{ from: dateRange.from, to: dateRange.to }}
                onSelect={(range) => {
                  if (range?.from && range?.to) {
                    setDateRange({ from: range.from, to: range.to });
                  }
                }}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <Tabs defaultValue="inventory" className="space-y-4">
        <TabsList className="grid grid-cols-4 w-full max-w-md">
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="projects">Projects</TabsTrigger>
          <TabsTrigger value="delivery">Delivery</TabsTrigger>
          <TabsTrigger value="financial">Financial</TabsTrigger>
        </TabsList>

        {/* Inventory Report */}
        <TabsContent value="inventory" className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between gap-3">
            <Select
              value={inventoryCategoryFilter}
              onValueChange={setInventoryCategoryFilter}
            >
              <SelectTrigger className="w-full sm:w-[220px]">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {inventoryByCategory.map((cat) => (
                  <SelectItem key={cat.name} value={cat.name}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => handleExport('inventory')}>
              <Download size={16} className="mr-2" />
              Export PDF
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground">Total SKUs</p>
                <p className="text-2xl font-semibold">{totalSku}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground">Total On Hand</p>
                <p className="text-2xl font-semibold">{totalOnHand.toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground">Low Stock Items</p>
                <p className="text-2xl font-semibold text-amber-600">{lowStockItems.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground">Out of Stock</p>
                <p className="text-2xl font-semibold text-red-600">{outOfStockItems.length}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Low Stock Action List</CardTitle>
              <CardDescription>Items below minimum stock level</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-center">Qty</TableHead>
                    <TableHead className="text-center">Min</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead className="text-center">Suggested PO</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lowStockItems.slice(0, 15).map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell className="text-center">{item.qtyOnHand}</TableCell>
                      <TableCell className="text-center">{item.minStock}</TableCell>
                      <TableCell className="text-right">₱{(item.qtyOnHand * item.unitPrice).toLocaleString()}</TableCell>
                      <TableCell className="text-center">{suggestedPoQty(item)}</TableCell>
                    </TableRow>
                  ))}
                  {lowStockItems.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No low-stock items in this period.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Top Inventory Value</CardTitle>
                <CardDescription>Highest value items on hand</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-center">Qty</TableHead>
                      <TableHead className="text-right">Total Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topValueItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell className="text-center">{item.qtyOnHand}</TableCell>
                        <TableCell className="text-right">₱{(item.qtyOnHand * item.unitPrice).toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Inventory Value by Category</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-center">Items</TableHead>
                      <TableHead className="text-right">Total Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInventoryByCategory.map((cat) => (
                      <TableRow key={cat.name}>
                        <TableCell className="font-medium">{cat.name}</TableCell>
                        <TableCell className="text-center">{cat.count}</TableCell>
                        <TableCell className="text-right">₱{cat.value.toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/50">
                      <TableCell className="font-bold">Total</TableCell>
                      <TableCell className="text-center font-bold">
                        {filteredInventoryByCategory.reduce((sum, c) => sum + c.count, 0)}
                      </TableCell>
                      <TableCell className="text-right font-bold">
                        ₱{filteredInventoryByCategory.reduce((sum, c) => sum + c.value, 0).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Project Consumption Report */}
        <TabsContent value="projects" className="space-y-4">
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => handleExport('projects')}>
              <Download size={16} className="mr-2" />
              Export PDF
            </Button>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <Select
              value={projectFilter}
              onValueChange={setProjectFilter}
            >
              <SelectTrigger className="w-full sm:w-[220px]">
                <SelectValue placeholder="All Projects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Projects</SelectItem>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={String(project.id)}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={projectStatusFilter}
              onValueChange={setProjectStatusFilter}
            >
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="on-hold">On Hold</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground">Active Projects</p>
                <p className="text-2xl font-semibold">
                  {filteredProjects.filter((p) => p.status === 'active').length}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground">On Hold</p>
                <p className="text-2xl font-semibold text-amber-600">
                  {filteredProjects.filter((p) => p.status === 'on-hold').length}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground">Total Project Value</p>
                <p className="text-2xl font-semibold">₱{projectConsumption.reduce((s, p) => s + p.value, 0).toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground">Projects w/ No Orders</p>
                <p className="text-2xl font-semibold text-red-600">{projectsNoOrders.length}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Project Details</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Project</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-center">Orders</TableHead>
                    <TableHead className="text-right">Total Value</TableHead>
                    <TableHead className="text-right">Last Order</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProjects.map((proj) => {
                      const projectOrders = ordersInRange.filter((o) => o.projectId === proj.id);
                      const value = projectOrders.reduce((sum, o) => sum + o.total, 0);
                      const lastOrder = projectLastOrderMap[String(proj.id)];
                      return (
                  <TableRow key={proj.id}>
                    <TableCell className="font-medium">{proj.name}</TableCell>
                    <TableCell>{proj.clientName}</TableCell>
                    <TableCell className="capitalize">{proj.status}</TableCell>
                    <TableCell className="text-center">{projectOrders.length}</TableCell>
                    <TableCell className="text-right">₱{value.toLocaleString()}</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {lastOrder ? format(lastOrder, 'MMM dd, yyyy') : '-'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Projects With No Orders</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projectsNoOrders.map((proj) => (
                <TableRow key={proj.id}>
                  <TableCell className="font-medium">{proj.name}</TableCell>
                  <TableCell>{proj.clientName}</TableCell>
                  <TableCell className="capitalize">{proj.status}</TableCell>
                </TableRow>
              ))}
              {projectsNoOrders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    All projects have orders in this range.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
        </TabsContent>

        {/* Delivery Report */}
        <TabsContent value="delivery" className="space-y-4">
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => handleExport('delivery')}>
              <Download size={16} className="mr-2" />
              Export PDF
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Delivered</p>
                    <p className="text-3xl font-bold text-green-600">{deliveryStats.delivered}</p>
                  </div>
                  <Truck className="text-green-600" size={32} />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">In Transit</p>
                    <p className="text-3xl font-bold text-blue-600">{deliveryStats.inTransit}</p>
                  </div>
                  <Package className="text-blue-600" size={32} />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Pending</p>
                    <p className="text-3xl font-bold text-yellow-600">{deliveryStats.pending}</p>
                  </div>
                  <Package className="text-yellow-600" size={32} />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Overdue</p>
                    <p className="text-3xl font-bold text-red-600">{deliveryStats.overdue}</p>
                  </div>
                  <AlertTriangle className="text-red-600" size={32} />
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Overdue Deliveries</CardTitle>
              <CardDescription>Deliveries past ETA</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>DR #</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead className="text-right">Days Late</TableHead>
                    <TableHead className="text-right">ETA</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overdueDeliveries.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">{d.drNumber}</TableCell>
                      <TableCell>{d.clientName}</TableCell>
                      <TableCell className="text-right text-red-600 font-semibold">
                        {Math.ceil((new Date().getTime() - d.etaDate.getTime()) / (1000 * 60 * 60 * 24))}
                      </TableCell>
                      <TableCell className="text-right">{format(d.etaDate, 'MMM dd')}</TableCell>
                    </TableRow>
                  ))}
                  {overdueDeliveries.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        No overdue deliveries.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>ETA Today + Tomorrow</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>DR #</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead className="text-right">ETA</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {upcomingDeliveries.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">{d.drNumber}</TableCell>
                      <TableCell>{d.clientName}</TableCell>
                      <TableCell>{d.projectName}</TableCell>
                      <TableCell className="text-right">{format(new Date(d.eta), 'MMM dd')}</TableCell>
                    </TableRow>
                  ))}
                  {upcomingDeliveries.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        No upcoming deliveries.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Deliveries</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row justify-between gap-3 mb-4">
                <Select
                  value={deliveryStatusFilter}
                  onValueChange={setDeliveryStatusFilter}
                >
                  <SelectTrigger className="w-full sm:w-[200px]">
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="in-transit">In Transit</SelectItem>
                    <SelectItem value="delivered">Delivered</SelectItem>
                    <SelectItem value="returned">Returned</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>DR #</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>ETA</TableHead>
                    <TableHead>Delivered</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDeliveries.map((del) => (
                    <TableRow key={del.id}>
                      <TableCell className="font-medium">{del.drNumber}</TableCell>
                      <TableCell>{del.clientName}</TableCell>
                      <TableCell>{del.projectName}</TableCell>
                      <TableCell className="capitalize">{del.status}</TableCell>
                      <TableCell>{format(new Date(del.eta), 'MMM dd')}</TableCell>
                      <TableCell>
                        {del.receivedAt ? format(new Date(del.receivedAt), 'MMM dd') : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Financial Report */}
        <TabsContent value="financial" className="space-y-4">
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => handleExport('financial-csv')}>
              <Download size={16} className="mr-2" />
              Export CSV
            </Button>
            <Button variant="outline" onClick={() => handleExport('financial-pdf')}>
              <Download size={16} className="mr-2" />
              Export PDF
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-6">
                <p className="text-sm text-muted-foreground">Total Revenue</p>
                <p className="text-2xl font-bold">₱{totalRevenue.toLocaleString()}</p>
                <div className="flex items-center gap-1 text-sm mt-1">
                  {revenueDelta >= 0 ? (
                    <TrendingUp size={14} className="text-success" />
                  ) : (
                    <TrendingDown size={14} className="text-destructive" />
                  )}
                  <span className={revenueDelta >= 0 ? 'text-success' : 'text-destructive'}>
                    {revenuePercent === null ? 'new' : `${revenueDelta >= 0 ? '+' : ''}${revenuePercent}%`}
                  </span>
                  <span className="text-muted-foreground">vs last month</span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <p className="text-sm text-muted-foreground">VAT Collected</p>
                <p className="text-2xl font-bold">₱{totalVAT.toLocaleString()}</p>
                <p className="text-sm text-muted-foreground mt-1">{vatLabel}% VAT</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <p className="text-sm text-muted-foreground">Payments Received</p>
                <p className="text-2xl font-bold text-green-600">₱{receivedPayments.toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <p className="text-sm text-muted-foreground">Pending Payments</p>
                <p className="text-2xl font-bold text-yellow-600">₱{pendingPayments.toLocaleString()}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Revenue Trend (Last 5 Months)</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthlyTrend.map((row) => (
                    <TableRow key={row.month}>
                      <TableCell className="font-medium">{row.month}</TableCell>
                      <TableCell className="text-right">{row.orders}</TableCell>
                      <TableCell className="text-right">₱{row.revenue.toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Open Balances</CardTitle>
              <CardDescription>Pending and verified payments</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order #</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {openBalances.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium">{order.orderNumber}</TableCell>
                      <TableCell>{order.clientName}</TableCell>
                      <TableCell className="text-right">₱{getOrderTotals(order).total.toLocaleString()}</TableCell>
                      <TableCell className="capitalize">{order.paymentStatus}</TableCell>
                    </TableRow>
                  ))}
                  {openBalances.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        No open balances in this range.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>VAT Summary</CardTitle>
              <CardDescription>Philippine {vatLabel}% VAT breakdown</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row justify-between gap-3 mb-4">
                <Select
                  value={paymentStatusFilter}
                  onValueChange={setPaymentStatusFilter}
                >
                  <SelectTrigger className="w-full sm:w-[200px]">
                    <SelectValue placeholder="All Payment Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Payment Status</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="verified">Verified</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order #</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead className="text-right">VATable Sales</TableHead>
                    <TableHead className="text-right">VAT ({vatLabel}%)</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrdersForVat.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium">{order.orderNumber}</TableCell>
                      <TableCell>{order.clientName}</TableCell>
                      <TableCell className="text-right">₱{getOrderTotals(order).net.toLocaleString()}</TableCell>
                      <TableCell className="text-right">₱{getOrderTotals(order).vat.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-medium">₱{getOrderTotals(order).total.toLocaleString()}</TableCell>
                      <TableCell className="capitalize">{order.paymentStatus}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/50 font-bold">
                    <TableCell colSpan={2}>TOTAL</TableCell>
                    <TableCell className="text-right">
                      ₱{filteredOrdersForVat.reduce((s, o) => s + getOrderTotals(o).net, 0).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      ₱{filteredOrdersForVat.reduce((s, o) => s + getOrderTotals(o).vat, 0).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      ₱{filteredOrdersForVat.reduce((s, o) => s + getOrderTotals(o).total, 0).toLocaleString()}
                    </TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
