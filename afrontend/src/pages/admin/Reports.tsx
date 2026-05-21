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
import { Input } from '@/components/ui/input';
import { Download, TrendingUp, TrendingDown, Package, Truck, AlertTriangle } from 'lucide-react';
import { apiClient } from '@/api/client';
import type { InventoryItem, Order, Delivery, Project, StockTransaction } from '@/types';
import { printHtml } from '@/utils/print';
import { calcTotalsFromItems, VAT_RATE } from '@/lib/vat';
import { formatPesoAmount } from '@/lib/currency';
import { downloadCsv } from '@/utils/csv';
import PaginationNav from '@/components/PaginationNav';
import StatusFilterSelect from '@/components/StatusFilterSelect';

const REPORT_PAGE_SIZE = 10;

const paginate = <T,>(rows: T[], page: number) =>
  rows.slice((page - 1) * REPORT_PAGE_SIZE, page * REPORT_PAGE_SIZE);

const pageCount = (rows: unknown[]) => Math.max(1, Math.ceil(rows.length / REPORT_PAGE_SIZE));
const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
const endOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
const toDateInputValue = (date: Date) => format(date, 'yyyy-MM-dd');
const parseDateInput = (value: string, boundary: 'start' | 'end') => {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return boundary === 'start' ? startOfDay(date) : endOfDay(date);
};

// TODO: Replace with real data from Lovable Cloud database
export default function ReportsPage() {
  const defaultFrom = startOfDay(new Date(2025, 0, 1));
  const defaultTo = endOfDay(new Date());
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: defaultFrom,
    to: defaultTo,
  });
  const [dateFromInput, setDateFromInput] = useState(toDateInputValue(defaultFrom));
  const [dateToInput, setDateToInput] = useState(toDateInputValue(defaultTo));
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [projectStatusFilter, setProjectStatusFilter] = useState<string>('all');
  const [deliveryStatusFilter, setDeliveryStatusFilter] = useState<string>('all');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>('all');
  const [activeReport, setActiveReport] = useState<string>('inventory');
  const [exportScope, setExportScope] = useState<string>('inventory');
  const [lowStockPage, setLowStockPage] = useState(1);
  const [topValuePage, setTopValuePage] = useState(1);
  const [categoryPage, setCategoryPage] = useState(1);
  const [projectPage, setProjectPage] = useState(1);
  const [projectNoOrderPage, setProjectNoOrderPage] = useState(1);
  const [overduePage, setOverduePage] = useState(1);
  const [upcomingPage, setUpcomingPage] = useState(1);
  const [deliveryPage, setDeliveryPage] = useState(1);
  const [openBalancePage, setOpenBalancePage] = useState(1);
  const [vatPage, setVatPage] = useState(1);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [transactions, setTransactions] = useState<StockTransaction[]>([]);

  useEffect(() => {
    let mounted = true;
    const fetchAll = async () => {
      try {
        const [inventoryRes, ordersRes, deliveriesRes, projectsRes, transactionsRes] = await Promise.all([
          apiClient.get('/inventory', { params: { page: 1, pageSize: 10000 } }),
          apiClient.get('/orders', { params: { page: 1, pageSize: 10000 } }),
          apiClient.get('/deliveries', { params: { page: 1, pageSize: 10000 } }),
          apiClient.get('/projects', { params: { page: 1, pageSize: 10000 } }),
          apiClient.get('/transactions', { params: { page: 1, pageSize: 10000 } }),
        ]);
        if (!mounted) return;
        const invPayload = inventoryRes.data;
        const ordersPayload = ordersRes.data;
        const deliveriesPayload = deliveriesRes.data;
        const projectsPayload = projectsRes.data;
        const transactionsPayload = transactionsRes.data;
        setInventory(invPayload?.data || invPayload || []);
        setOrders(ordersPayload?.data || ordersPayload || []);
        setDeliveries(deliveriesPayload?.data || deliveriesPayload || []);
        setProjects(projectsPayload?.data || projectsPayload || []);
        setTransactions(transactionsPayload?.data || transactionsPayload || []);
      } catch {
        if (!mounted) return;
        setInventory([]);
        setOrders([]);
        setDeliveries([]);
        setProjects([]);
        setTransactions([]);
      }
    };
    fetchAll();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    setLowStockPage(1);
    setTopValuePage(1);
    setCategoryPage(1);
    setProjectPage(1);
    setProjectNoOrderPage(1);
    setOverduePage(1);
    setUpcomingPage(1);
    setDeliveryPage(1);
    setOpenBalancePage(1);
    setVatPage(1);
  }, [dateRange, projectFilter, projectStatusFilter, deliveryStatusFilter, paymentStatusFilter]);

  const parsedFromInput = parseDateInput(dateFromInput, 'start');
  const parsedToInput = parseDateInput(dateToInput, 'end');
  const dateRangeError =
    parsedFromInput && parsedToInput && parsedFromInput > parsedToInput
      ? 'From date cannot be after To date.'
      : '';

  useEffect(() => {
    const from = parseDateInput(dateFromInput, 'start');
    const to = parseDateInput(dateToInput, 'end');
    if (!from || !to || from > to) return;
    setDateRange((current) =>
      current.from.getTime() === from.getTime() && current.to.getTime() === to.getTime()
        ? current
        : { from, to }
    );
  }, [dateFromInput, dateToInput]);

  const ordersInRange = orders.filter((o) => {
    const created = new Date(o.createdAt);
    return created >= dateRange.from && created <= dateRange.to;
  });

  const deliveriesInRange = deliveries.filter((d) => {
    const date = d.issuedAt ? new Date(d.issuedAt) : d.eta ? new Date(d.eta) : null;
    if (!date) return true;
    return date >= dateRange.from && date <= dateRange.to;
  });

  const transactionsInRange = transactions.filter((transaction) => {
    const date = new Date(transaction.date);
    return date >= dateRange.from && date <= dateRange.to;
  });
  const inventoryItemIdsInRange = new Set(transactionsInRange.map((transaction) => String(transaction.itemId)));
  const inventoryInRange = inventory.filter((item) => inventoryItemIdsInRange.has(String(item.id)));

  // Inventory Report Data
  const totalSku = inventoryInRange.length;
  const totalOnHand = inventoryInRange.reduce((sum, item) => sum + item.qtyOnHand, 0);
  const lowStockItems = inventoryInRange
    .filter((item) => item.qtyOnHand <= item.minStock)
    .sort((a, b) => (a.minStock ? a.qtyOnHand / a.minStock : 1) - (b.minStock ? b.qtyOnHand / b.minStock : 1));
  const outOfStockItems = inventoryInRange.filter((item) => item.qtyOnHand === 0);

  const inventoryByCategory = Object.values(
    inventoryInRange.reduce<Record<string, { name: string; count: number; value: number }>>(
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

  const topValueItems = [...inventoryInRange]
    .sort((a, b) => b.qtyOnHand * b.unitPrice - a.qtyOnHand * a.unitPrice)
    .slice(0, 10);

  const suggestedPoQty = (item: InventoryItem) => {
    const min = item.minStock || 0;
    if (!min) return 0;
    const target = Math.max(min * 2, min + 10);
    return Math.max(target - item.qtyOnHand, 0);
  };

  const filteredInventoryByCategory = inventoryByCategory;

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
    const reportEnd = dateRange.to;
    const date = new Date(reportEnd.getFullYear(), reportEnd.getMonth() - (4 - idx), 1);
    const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
    const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 1);
    const effectiveStart = monthStart < dateRange.from ? dateRange.from : monthStart;
    const effectiveEnd = monthEnd > dateRange.to ? dateRange.to : monthEnd;
    const monthOrders = orders.filter(
      (o) => new Date(o.createdAt) >= effectiveStart && new Date(o.createdAt) < effectiveEnd
    );
    const revenue = monthOrders.reduce((sum, o) => sum + getOrderTotals(o).total, 0);
    return { month: format(date, 'MMM'), revenue, orders: monthOrders.length };
  });

  const openBalances = ordersInRange
    .filter((o) => o.paymentStatus === 'pending' || o.paymentStatus === 'verified')
    .sort((a, b) => getOrderTotals(b).total - getOrderTotals(a).total);
  const vatLabel = Math.round(VAT_RATE * 100);
  const exportDateLabel = `${format(dateRange.from, 'MMM dd, yyyy')} - ${format(dateRange.to, 'MMM dd, yyyy')}`;
  const exportDateSlug = `${format(dateRange.from, 'yyyy-MM-dd')}_to_${format(dateRange.to, 'yyyy-MM-dd')}`;

  const handleExport = (type: string) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const inventoryCsvRows = [
      ['Export Period', exportDateLabel, ''],
      [],
      ['Category', 'Items On Hand', 'Total Value'],
      ...filteredInventoryByCategory.map((cat) => [cat.name, String(cat.count), formatPesoAmount(cat.value)]),
      ['Low Stock Items', String(lowStockItems.length), ''],
      ['Out of Stock Items', String(outOfStockItems.length), ''],
    ];
    const projectCsvRows = [
      ['Export Period', exportDateLabel, '', '', '', ''],
      [],
      ['Project', 'Client', 'Status', 'Orders', 'Total Value', 'Last Order'],
      ...filteredProjects.map((proj) => {
        const projectOrders = ordersInRange.filter((o) => o.projectId === proj.id);
        const value = projectOrders.reduce((sum, o) => sum + o.total, 0);
        const lastOrder = projectLastOrderMap[String(proj.id)];
        return [
          proj.name,
          proj.clientName,
          proj.status,
          String(projectOrders.length),
          formatPesoAmount(value),
          lastOrder ? format(lastOrder, 'yyyy-MM-dd') : '',
        ];
      }),
    ];
    const deliveryCsvRows = [
      ['Export Period', exportDateLabel, '', '', '', ''],
      [],
      ['DR Number', 'Client', 'Project', 'Status', 'ETA', 'Delivered At'],
      ...filteredDeliveries.map((delivery) => [
        delivery.drNumber,
        delivery.clientName,
        delivery.projectName || '',
        delivery.status,
        delivery.eta ? format(new Date(delivery.eta), 'yyyy-MM-dd') : '',
        delivery.receivedAt ? format(new Date(delivery.receivedAt), 'yyyy-MM-dd') : '',
      ]),
    ];
    const financialCsvRows = [
      ['Export Period', exportDateLabel, '', '', '', ''],
      [],
      ['Order Number', 'Client', 'Payment Status', 'VATable Sales', `VAT (${vatLabel}%)`, 'Total'],
      ...filteredOrdersForVat.map((order) => {
        const totals = getOrderTotals(order);
        return [
          order.orderNumber,
          order.clientName,
          order.paymentStatus,
          formatPesoAmount(totals.net),
          formatPesoAmount(totals.vat),
          formatPesoAmount(totals.total),
        ];
      }),
    ];
    const exportByScope = (formatType: 'csv' | 'pdf') => {
      if (exportScope === 'all') {
        return handleExport(`all-${formatType}`);
      }
      return handleExport(`${exportScope}${formatType === 'csv' ? '-csv' : exportScope === 'financial' ? '-pdf' : ''}`);
    };
    if (type === 'scope-csv') {
      exportByScope('csv');
      return;
    }
    if (type === 'scope-pdf') {
      exportByScope('pdf');
      return;
    }
    if (type === 'all-csv') {
      downloadCsv(`all-reports-${exportDateSlug}.csv`, [
        ['Inventory Report'],
        ...inventoryCsvRows,
        [],
        ['Project Report'],
        ...projectCsvRows,
        [],
        ['Delivery Report'],
        ...deliveryCsvRows,
        [],
        ['Financial Report'],
        ...financialCsvRows,
      ]);
      return;
    }
    if (type === 'all-pdf') {
      const table = (title: string, rows: string[][]) => {
        const tableRows = rows.filter((row) => row.length > 0 && row[0] !== 'Export Period');
        return `
          <h2>${escapeHtml(title)}</h2>
          <table>
            <thead><tr>${tableRows[0].map((cell) => `<th>${escapeHtml(cell)}</th>`).join('')}</tr></thead>
            <tbody>${tableRows.slice(1).map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody>
          </table>`;
      };
      printHtml(
        'All Reports',
        `<h1>All Reports</h1>
        <div class="meta">Export period: ${escapeHtml(exportDateLabel)}</div>
        <div class="meta">Generated: ${today}</div>
        ${table('Inventory Report', inventoryCsvRows)}
        ${table('Project Report', projectCsvRows)}
        ${table('Delivery Report', deliveryCsvRows)}
        ${table('Financial Report', financialCsvRows)}`
      );
      return;
    }
    if (type === 'inventory') {
      const rows = filteredInventoryByCategory
        .map((cat) => `<tr><td>${cat.name}</td><td>${cat.count}</td><td>₱${formatPesoAmount(cat.value)}</td></tr>`)
        .join('');
      printHtml(
        'Inventory Report',
        `<h1>Inventory Report</h1>
        <div class="meta">Export period: ${escapeHtml(exportDateLabel)}</div>
        <div class="meta">Generated: ${today}</div>
        <table><thead><tr><th>Category</th><th>Items</th><th>Total Value</th></tr></thead><tbody>${rows}</tbody></table>`
      );
      return;
    }
    if (type === 'inventory-csv') {
      downloadCsv(`inventory-report-${exportDateSlug}.csv`, inventoryCsvRows);
      return;
    }
    if (type === 'projects') {
      const rows = projectConsumption
        .map((proj) => `<tr><td>${proj.name}</td><td>${proj.orders}</td><td>₱${formatPesoAmount(proj.value)}</td></tr>`)
        .join('');
      printHtml(
        'Project Report',
        `<h1>Project Consumption</h1>
        <div class="meta">Export period: ${escapeHtml(exportDateLabel)}</div>
        <div class="meta">Generated: ${today}</div>
        <table><thead><tr><th>Project</th><th>Orders</th><th>Total Value</th></tr></thead><tbody>${rows}</tbody></table>`
      );
      return;
    }
    if (type === 'projects-csv') {
      downloadCsv(`project-report-${exportDateSlug}.csv`, projectCsvRows);
      return;
    }
    if (type === 'delivery') {
      const rows = filteredDeliveries
        .map((d) => `<tr><td>${d.drNumber}</td><td>${d.clientName}</td><td>${d.status}</td><td>${format(new Date(d.eta), 'MMM dd')}</td></tr>`)
        .join('');
      printHtml(
        'Delivery Report',
        `<h1>Delivery Report</h1>
        <div class="meta">Export period: ${escapeHtml(exportDateLabel)}</div>
        <div class="meta">Generated: ${today}</div>
        <table><thead><tr><th>DR #</th><th>Client</th><th>Status</th><th>ETA</th></tr></thead><tbody>${rows}</tbody></table>`
      );
      return;
    }
    if (type === 'delivery-csv') {
      downloadCsv(`delivery-report-${exportDateSlug}.csv`, deliveryCsvRows);
      return;
    }
    if (type === 'financial-csv') {
      downloadCsv(`financial-report-${exportDateSlug}.csv`, financialCsvRows);
      return;
    }
    if (type.startsWith('financial')) {
      const rows = filteredOrdersForVat
        .map((o) => {
          const totals = getOrderTotals(o);
          return `<tr><td>${o.orderNumber}</td><td>${o.clientName}</td><td>₱${formatPesoAmount(totals.net)}</td><td>₱${formatPesoAmount(totals.vat)}</td><td>₱${formatPesoAmount(totals.total)}</td></tr>`;
        })
        .join('');
      printHtml(
        'Financial Report',
        `<h1>Financial Report</h1>
        <div class="meta">Export period: ${escapeHtml(exportDateLabel)}</div>
        <div class="meta">Generated: ${today}</div>
        <table><thead><tr><th>Order #</th><th>Client</th><th>VATable Sales</th><th>VAT</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table>
        <div class="total">Total Revenue: ₱${formatPesoAmount(filteredOrdersForVat.reduce((sum, o) => sum + getOrderTotals(o).total, 0))}</div>`
      );
      return;
    }
  };

  const exportTableCsv = (fileBase: string, headers: string[], rows: Array<Array<string | number>>) => {
    downloadCsv(`${fileBase}-${exportDateSlug}.csv`, [
      ['Export Period', exportDateLabel],
      [],
      headers,
      ...rows.map((row) => row.map((cell) => String(cell ?? ''))),
    ]);
  };

  const exportTablePdf = (title: string, headers: string[], rows: Array<Array<string | number>>) => {
    const headerHtml = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('');
    const rowsHtml = rows
      .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
      .join('');
    printHtml(
      title,
      `<h1>${escapeHtml(title)}</h1>
      <div class="meta">Export period: ${escapeHtml(exportDateLabel)}</div>
      <div class="meta">Generated: ${format(new Date(), 'yyyy-MM-dd')}</div>
      <table><thead><tr>${headerHtml}</tr></thead><tbody>${rowsHtml}</tbody></table>`
    );
  };

  const tableExportButtons = (
    fileBase: string,
    title: string,
    headers: string[],
    rows: Array<Array<string | number>>
  ) => (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        size="icon"
        variant="ghost"
        title={`Export ${title} CSV`}
        aria-label={`Export ${title} CSV`}
        onClick={() => exportTableCsv(fileBase, headers, rows)}
      >
        <Download size={16} />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        title={`Export ${title} PDF`}
        aria-label={`Export ${title} PDF`}
        onClick={() => exportTablePdf(title, headers, rows)}
      >
        <Download size={16} />
      </Button>
    </div>
  );

  const lowStockRows = lowStockItems.map((item) => [
    item.name,
    item.qtyOnHand,
    item.minStock,
    formatPesoAmount(item.qtyOnHand * item.unitPrice),
    suggestedPoQty(item),
  ]);
  const topValueRows = topValueItems.map((item) => [
    item.name,
    item.qtyOnHand,
    formatPesoAmount(item.qtyOnHand * item.unitPrice),
  ]);
  const inventoryCategoryRows = [
    ...filteredInventoryByCategory.map((cat) => [cat.name, cat.count, formatPesoAmount(cat.value)]),
    [
      'TOTAL',
      filteredInventoryByCategory.reduce((sum, c) => sum + c.count, 0),
      formatPesoAmount(filteredInventoryByCategory.reduce((sum, c) => sum + c.value, 0)),
    ],
  ];
  const projectDetailRows = filteredProjects.map((proj) => {
    const projectOrders = ordersInRange.filter((o) => o.projectId === proj.id);
    const value = projectOrders.reduce((sum, o) => sum + o.total, 0);
    const lastOrder = projectLastOrderMap[String(proj.id)];
    return [
      proj.name,
      proj.clientName,
      proj.status,
      projectOrders.length,
      formatPesoAmount(value),
      lastOrder ? format(lastOrder, 'yyyy-MM-dd') : '',
    ];
  });
  const projectsNoOrdersRows = projectsNoOrders.map((proj) => [proj.name, proj.clientName, proj.status]);
  const overdueDeliveryRows = overdueDeliveries.map((delivery) => [
    delivery.drNumber,
    delivery.clientName,
    Math.ceil((new Date().getTime() - delivery.etaDate.getTime()) / (1000 * 60 * 60 * 24)),
    format(delivery.etaDate, 'yyyy-MM-dd'),
  ]);
  const upcomingDeliveryRows = upcomingDeliveries.map((delivery) => [
    delivery.drNumber,
    delivery.clientName,
    delivery.projectName || '',
    delivery.eta ? format(new Date(delivery.eta), 'yyyy-MM-dd') : '',
  ]);
  const recentDeliveryRows = filteredDeliveries.map((delivery) => [
    delivery.drNumber,
    delivery.clientName,
    delivery.projectName || '',
    delivery.status,
    delivery.eta ? format(new Date(delivery.eta), 'yyyy-MM-dd') : '',
    delivery.receivedAt ? format(new Date(delivery.receivedAt), 'yyyy-MM-dd') : '',
  ]);
  const revenueTrendRows = monthlyTrend.map((row) => [row.month, row.orders, formatPesoAmount(row.revenue)]);
  const openBalanceRows = openBalances.map((order) => [
    order.orderNumber,
    order.clientName,
    formatPesoAmount(getOrderTotals(order).total),
    order.paymentStatus,
  ]);
  const vatRows = [
    ...filteredOrdersForVat.map((order) => {
      const totals = getOrderTotals(order);
      return [
        order.orderNumber,
        order.clientName,
        formatPesoAmount(totals.net),
        formatPesoAmount(totals.vat),
        formatPesoAmount(totals.total),
        order.paymentStatus,
      ];
    }),
    [
      'TOTAL',
      '',
      formatPesoAmount(filteredOrdersForVat.reduce((s, o) => s + getOrderTotals(o).net, 0)),
      formatPesoAmount(filteredOrdersForVat.reduce((s, o) => s + getOrderTotals(o).vat, 0)),
      formatPesoAmount(filteredOrdersForVat.reduce((s, o) => s + getOrderTotals(o).total, 0)),
      '',
    ],
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Reports</h2>
          <p className="text-muted-foreground">Business analytics and export tools</p>
        </div>
        <div className="grid w-full gap-2 sm:grid-cols-2 xl:w-[420px]">
          <div className="space-y-1">
            <label htmlFor="report-date-from" className="text-xs font-medium text-muted-foreground">
              From
            </label>
            <Input
              id="report-date-from"
              type="date"
              value={dateFromInput}
              max={dateToInput || undefined}
              onChange={(event) => setDateFromInput(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="report-date-to" className="text-xs font-medium text-muted-foreground">
              To
            </label>
            <Input
              id="report-date-to"
              type="date"
              value={dateToInput}
              min={dateFromInput || undefined}
              onChange={(event) => setDateToInput(event.target.value)}
            />
          </div>
          {dateRangeError ? (
            <p className="sm:col-span-2 text-xs text-destructive">{dateRangeError}</p>
          ) : (
            <p className="sm:col-span-2 text-xs text-muted-foreground">Export Period: {exportDateLabel}</p>
          )}
        </div>
      </div>

      <Tabs
        value={activeReport}
        onValueChange={(value) => {
          setActiveReport(value);
          setExportScope(value);
        }}
        className="space-y-4"
      >
        <TabsList className="grid grid-cols-4 w-full max-w-md">
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="projects">Projects</TabsTrigger>
          <TabsTrigger value="delivery">Delivery</TabsTrigger>
          <TabsTrigger value="financial">Financial</TabsTrigger>
        </TabsList>

        {/* Inventory Report */}
        <TabsContent value="inventory" className="space-y-4">
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
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle>Low Stock Action List</CardTitle>
                <CardDescription>Items below minimum stock level</CardDescription>
              </div>
              {tableExportButtons('low-stock-action-list', 'Low Stock Action List', ['Item', 'Qty', 'Min', 'Value', 'Suggested PO'], lowStockRows)}
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
                  {paginate(lowStockItems, lowStockPage).map((item) => (
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
              <PaginationNav
                page={lowStockPage}
                totalPages={pageCount(lowStockItems)}
                onPageChange={setLowStockPage}
              />
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div>
                  <CardTitle>Top Inventory Value</CardTitle>
                  <CardDescription>Highest value items on hand</CardDescription>
                </div>
                {tableExportButtons('top-inventory-value', 'Top Inventory Value', ['Item', 'Qty', 'Total Value'], topValueRows)}
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
                    {paginate(topValueItems, topValuePage).map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell className="text-center">{item.qtyOnHand}</TableCell>
                        <TableCell className="text-right">₱{(item.qtyOnHand * item.unitPrice).toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <PaginationNav
                  page={topValuePage}
                  totalPages={pageCount(topValueItems)}
                  onPageChange={setTopValuePage}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <CardTitle>Inventory Value by Category</CardTitle>
                {tableExportButtons('inventory-value-by-category', 'Inventory Value by Category', ['Category', 'Items', 'Total Value'], inventoryCategoryRows)}
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
                    {paginate(filteredInventoryByCategory, categoryPage).map((cat) => (
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
                <PaginationNav
                  page={categoryPage}
                  totalPages={pageCount(filteredInventoryByCategory)}
                  onPageChange={setCategoryPage}
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Project Consumption Report */}
        <TabsContent value="projects" className="space-y-4">
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
            <StatusFilterSelect value={projectStatusFilter} onValueChange={setProjectStatusFilter} placeholder="All Status">
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="on-hold">On Hold</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </StatusFilterSelect>
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
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <CardTitle>Project Details</CardTitle>
              {tableExportButtons('project-details', 'Project Details', ['Project', 'Client', 'Status', 'Orders', 'Total Value', 'Last Order'], projectDetailRows)}
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
                  {paginate(filteredProjects, projectPage).map((proj) => {
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
          <PaginationNav
            page={projectPage}
            totalPages={pageCount(filteredProjects)}
            onPageChange={setProjectPage}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <CardTitle>Projects With No Orders</CardTitle>
          {tableExportButtons('projects-with-no-orders', 'Projects With No Orders', ['Project', 'Client', 'Status'], projectsNoOrdersRows)}
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
              {paginate(projectsNoOrders, projectNoOrderPage).map((proj) => (
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
          <PaginationNav
            page={projectNoOrderPage}
            totalPages={pageCount(projectsNoOrders)}
            onPageChange={setProjectNoOrderPage}
          />
        </CardContent>
      </Card>
        </TabsContent>

        {/* Delivery Report */}
        <TabsContent value="delivery" className="space-y-4">
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
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle>Overdue Deliveries</CardTitle>
                <CardDescription>Deliveries past ETA</CardDescription>
              </div>
              {tableExportButtons('overdue-deliveries', 'Overdue Deliveries', ['DR #', 'Client', 'Days Late', 'ETA'], overdueDeliveryRows)}
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
                  {paginate(overdueDeliveries, overduePage).map((d) => (
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
              <PaginationNav
                page={overduePage}
                totalPages={pageCount(overdueDeliveries)}
                onPageChange={setOverduePage}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <CardTitle>ETA Today + Tomorrow</CardTitle>
              {tableExportButtons('eta-today-tomorrow', 'ETA Today + Tomorrow', ['DR #', 'Client', 'Project', 'ETA'], upcomingDeliveryRows)}
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
                  {paginate(upcomingDeliveries, upcomingPage).map((d) => (
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
              <PaginationNav
                page={upcomingPage}
                totalPages={pageCount(upcomingDeliveries)}
                onPageChange={setUpcomingPage}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <CardTitle>Recent Deliveries</CardTitle>
              {tableExportButtons('recent-deliveries', 'Recent Deliveries', ['DR #', 'Client', 'Project', 'Status', 'ETA', 'Delivered'], recentDeliveryRows)}
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row justify-between gap-3 mb-4">
                <StatusFilterSelect value={deliveryStatusFilter} onValueChange={setDeliveryStatusFilter} placeholder="All Status">
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in-transit">In Transit</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="returned">Returned</SelectItem>
                </StatusFilterSelect>
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
                  {paginate(filteredDeliveries, deliveryPage).map((del) => (
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
              <PaginationNav
                page={deliveryPage}
                totalPages={pageCount(filteredDeliveries)}
                onPageChange={setDeliveryPage}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Financial Report */}
        <TabsContent value="financial" className="space-y-4">
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
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <CardTitle>Revenue Trend</CardTitle>
              {tableExportButtons('revenue-trend', 'Revenue Trend', ['Month', 'Orders', 'Revenue'], revenueTrendRows)}
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
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle>Open Balances</CardTitle>
                <CardDescription>Pending and verified payments</CardDescription>
              </div>
              {tableExportButtons('open-balances', 'Open Balances', ['Order #', 'Client', 'Total', 'Status'], openBalanceRows)}
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
                  {paginate(openBalances, openBalancePage).map((order) => (
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
              <PaginationNav
                page={openBalancePage}
                totalPages={pageCount(openBalances)}
                onPageChange={setOpenBalancePage}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle>VAT Summary</CardTitle>
                <CardDescription>Philippine {vatLabel}% VAT breakdown</CardDescription>
              </div>
              {tableExportButtons('vat-summary', 'VAT Summary', ['Order #', 'Client', 'VATable Sales', `VAT (${vatLabel}%)`, 'Total', 'Status'], vatRows)}
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
                  {paginate(filteredOrdersForVat, vatPage).map((order) => (
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
              <PaginationNav
                page={vatPage}
                totalPages={pageCount(filteredOrdersForVat)}
                onPageChange={setVatPage}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
