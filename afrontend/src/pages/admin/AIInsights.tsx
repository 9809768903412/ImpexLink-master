import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Brain,
  TrendingUp,
  AlertTriangle,
  ShoppingCart,
  Shield,
  MapPin,
  RefreshCw,
  Eye,
  CheckCircle2,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { toast } from '@/hooks/use-toast';
import { useResource } from '@/hooks/use-resource';
import { apiClient } from '@/api/client';
import type { AiAnalysis, AiLogisticsSnapshot, AiSummary, ReorderSuggestion, StockTransaction, InventoryItem, WarehouseRisk } from '@/types';
import PaginationNav from '@/components/PaginationNav';

const riskColors = {
  low: 'bg-green-100 text-green-800',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-orange-100 text-orange-800',
  critical: 'bg-red-100 text-red-800',
};

const fallbackLogistics: AiLogisticsSnapshot = {
  activeRoutes: 0,
  stopsToday: 0,
  onTimeRate: 100,
  recommendation: 'Decision-support logistics signals will appear after the backend data loads.',
  dispatches: [],
};

const DEMO_PATTERN_ITEMS = [
  { name: 'Paint thinner', baseIssue: 29, color: '#2563eb' },
  { name: 'Ceramic Tech EG', baseIssue: 31, color: '#dc2626' },
  { name: 'Seal Tech AW 20 ltrs', baseIssue: 14, color: '#16a34a' },
  { name: 'Baby roller cotton (white)', baseIssue: 47, color: '#f97316' },
  { name: 'Welding machine', baseIssue: 1, color: '#7c3aed' },
  { name: 'Cotton rags', baseIssue: 72, color: '#0f766e' },
];

export default function AIInsightsPage() {
  const navigate = useNavigate();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const trendsRef = useRef<HTMLDivElement | null>(null);
  const risksRef = useRef<HTMLDivElement | null>(null);
  const reorderRef = useRef<HTMLDivElement | null>(null);
  const [riskFilter, setRiskFilter] = useState<'alerts' | 'include-low' | 'all'>('alerts');
  const [patternPage, setPatternPage] = useState(1);
  const [riskPage, setRiskPage] = useState(1);
  const [reorderPage, setReorderPage] = useState(1);
  const [fraudPage, setFraudPage] = useState(1);
  const [dispatchPage, setDispatchPage] = useState(1);
  const patternPageSize = 6;
  const riskPageSize = 5;
  const reorderPageSize = 5;
  const fraudPageSize = 4;
  const dispatchPageSize = 3;
  const { data: aiAnalysis, setData: setAiAnalysis } = useResource<AiAnalysis | null>('/ai/analysis', null, [], 10 * 60 * 1000);
  const aiSummary: AiSummary | null = aiAnalysis
    ? {
        enabled: aiAnalysis.enabled,
        provider: aiAnalysis.provider,
        model: aiAnalysis.model,
        generatedAt: aiAnalysis.generatedAt,
        summary: aiAnalysis.summary,
        recommendations: aiAnalysis.recommendations,
      }
    : null;
  const warehouseRisks = aiAnalysis?.warehouseRisks || [];
  const reorderSuggestions = aiAnalysis?.reorderSuggestions || [];
  const fraudAlerts = aiAnalysis?.fraudAlerts || [];
  const logisticsSnapshot = aiAnalysis?.logisticsSnapshot || fallbackLogistics;
  const { data: transactions } = useResource<StockTransaction[]>('/transactions', []);
  const { data: inventory } = useResource<InventoryItem[]>('/inventory', []);
  const patternTrends = useMemo(() => {
    const months = Array.from({ length: 24 }).map((_, idx) => {
      const date = new Date(2024, 4 + idx, 1);
      const row: Record<string, string | number> = {
        key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
        month: format(date, 'MMM yy'),
      };
      DEMO_PATTERN_ITEMS.forEach((item, itemIdx) => {
        const seasonalLift = idx % 6 === 2 || idx % 6 === 3 ? 1.25 : idx % 6 === 4 ? 0.85 : 1;
        const variation = (idx * 2 + itemIdx) % 7;
        const usage = Math.round((item.baseIssue + variation) * seasonalLift);
        row[item.name] = usage;
        row.totalUsage = Number(row.totalUsage || 0) + usage;
      });
      return row;
    });
    const monthMap = new Map(months.map((month) => [String(month.key), month]));
    const nameByItemId = new Map(inventory.map((item) => [item.id, item.name]));
    const demoNames = new Set(DEMO_PATTERN_ITEMS.map((item) => item.name));

    transactions.forEach((txn) => {
      if (txn.qtyChange >= 0) return;
      const txnDate = new Date(`${txn.date}T00:00:00`);
      if (Number.isNaN(txnDate.getTime())) return;
      const key = `${txnDate.getFullYear()}-${String(txnDate.getMonth() + 1).padStart(2, '0')}`;
      const month = monthMap.get(key);
      if (!month) return;
      const noteMatch = String(txn.notes || '').match(/for\s+(.+)$/i);
      const itemName = nameByItemId.get(txn.itemId) || (noteMatch ? noteMatch[1].trim() : '');
      if (!demoNames.has(itemName)) return;
      const usage = Math.abs(txn.qtyChange);
      month[itemName] = Number(month[itemName] || 0) + usage;
      month.totalUsage = Number(month.totalUsage || 0) + usage;
    });

    return months;
  }, [transactions, inventory]);

  const patternSummary = useMemo(() => {
    const itemTotals = DEMO_PATTERN_ITEMS.map((item) => ({
      name: item.name,
      total: patternTrends.reduce((sum, month) => sum + Number(month[item.name] || 0), 0),
    })).sort((a, b) => b.total - a.total);
    const peakMonth = patternTrends.reduce(
      (peak, month) => (Number(month.totalUsage || 0) > Number(peak.totalUsage || 0) ? month : peak),
      patternTrends[0] || { month: 'Top month', totalUsage: 0 }
    );
    return {
      itemTotals,
      peakMonth,
      totalUsage: patternTrends.reduce((sum, month) => sum + Number(month.totalUsage || 0), 0),
    };
  }, [patternTrends]);

  const patternTotalPages = Math.max(1, Math.ceil(patternTrends.length / patternPageSize));
  const patternRows = patternTrends.slice((patternPage - 1) * patternPageSize, patternPage * patternPageSize);
  const summary = useMemo(() => {
    const criticalCount = warehouseRisks.filter((risk) => risk.riskLevel === 'critical').length;
    const highCount = warehouseRisks.filter((risk) => risk.riskLevel === 'high').length;
    const totalLow = warehouseRisks.length;
    const reorderTotal = reorderSuggestions.reduce((sum, item) => sum + item.estimatedCost, 0);
    const savingsEstimate = reorderTotal ? Math.round(reorderTotal * 0.08) : 0;
    return {
      criticalCount,
      highCount,
      totalLow,
      reorderTotal,
      savingsEstimate,
    };
  }, [warehouseRisks, reorderSuggestions]);

  const filteredRisks = useMemo(() => {
    const isRisky = (risk: WarehouseRisk) => {
      const daysLeft = typeof risk.daysToExpiry === 'number' ? risk.daysToExpiry : null;
      const shelfLife = typeof risk.shelfLifeDays === 'number' ? risk.shelfLifeDays : null;
      const daysInStock = typeof risk.daysInStock === 'number' ? risk.daysInStock : null;
      const usedRatio = shelfLife && daysInStock ? daysInStock / shelfLife : null;
      const lowStock = /low stock/i.test(risk.reason);
      return (
        risk.riskLevel === 'critical' ||
        risk.riskLevel === 'high' ||
        risk.riskLevel === 'medium' ||
        lowStock ||
        (daysLeft !== null && daysLeft < 180) ||
        (usedRatio !== null && usedRatio >= 0.5)
      );
    };

    let base = warehouseRisks;
    if (riskFilter === 'alerts') {
      base = warehouseRisks.filter(isRisky).filter((r) => r.riskLevel !== 'low');
    } else if (riskFilter === 'include-low') {
      base = warehouseRisks.filter(isRisky);
    }

    return base.sort((a, b) => {
      const riskOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const riskDelta = riskOrder[a.riskLevel] - riskOrder[b.riskLevel];
      if (riskDelta !== 0) return riskDelta;
      const leftA = typeof a.daysToExpiry === 'number' ? a.daysToExpiry : Number.POSITIVE_INFINITY;
      const leftB = typeof b.daysToExpiry === 'number' ? b.daysToExpiry : Number.POSITIVE_INFINITY;
      return leftA - leftB;
    });
  }, [warehouseRisks, riskFilter]);

  useEffect(() => {
    setRiskPage(1);
  }, [riskFilter]);

  const riskTotalPages = Math.max(1, Math.ceil(filteredRisks.length / riskPageSize));
  const riskPageItems = filteredRisks.slice((riskPage - 1) * riskPageSize, riskPage * riskPageSize);
  const reorderTotalPages = Math.max(1, Math.ceil(reorderSuggestions.length / reorderPageSize));
  const reorderPageItems = reorderSuggestions.slice((reorderPage - 1) * reorderPageSize, reorderPage * reorderPageSize);
  const fraudTotalPages = Math.max(1, Math.ceil(fraudAlerts.length / fraudPageSize));
  const fraudPageItems = fraudAlerts.slice((fraudPage - 1) * fraudPageSize, fraudPage * fraudPageSize);
  const dispatchTotalPages = Math.max(1, Math.ceil(logisticsSnapshot.dispatches.length / dispatchPageSize));
  const dispatchPageItems = logisticsSnapshot.dispatches.slice(
    (dispatchPage - 1) * dispatchPageSize,
    dispatchPage * dispatchPageSize
  );

  useEffect(() => {
    setPatternPage(1);
  }, [patternTrends.length]);

  useEffect(() => {
    setReorderPage(1);
  }, [reorderSuggestions.length]);

  useEffect(() => {
    setFraudPage(1);
  }, [fraudAlerts.length]);

  useEffect(() => {
    setDispatchPage(1);
  }, [logisticsSnapshot.dispatches.length]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    apiClient
      .post<AiAnalysis>('/ai/refresh')
      .then((response) => {
        setAiAnalysis(response.data);
        toast({
          title: 'Decision Support Refreshed',
          description: response.data.enabled
            ? `${response.data.provider} refreshed the advisory signals using ${response.data.model}.`
            : response.data.summary,
        });
      })
      .catch(() => {
        toast({
          title: 'Using Cached Insights',
          description: 'Latest AI refresh is unavailable right now.',
          variant: 'destructive',
        });
      })
      .finally(() => setIsRefreshing(false));
  };

  const handleCreatePO = (items: ReorderSuggestion[]) => {
    try {
      localStorage.setItem('po_suggestions', JSON.stringify(items));
    } catch {
      // ignore
    }
    navigate('/admin/purchase-orders');
    toast({
      title: 'Suggestions Ready',
      description: 'Opened Purchase Orders with suggested items prefilled.',
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Brain className="text-primary" />
            AI Insights
          </h2>
          <p className="text-muted-foreground">
            AI-assisted decision support for inventory, PO risk, and dispatch planning
          </p>
        </div>
        <Button onClick={handleRefresh} disabled={isRefreshing}>
          <RefreshCw size={16} className={`mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh Signals
        </Button>
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4 text-sm">
          <p className="font-medium">Demo data coverage: 24 months</p>
          <p className="text-muted-foreground">
            Seeded stock history runs monthly from May 2024 through April 2026, with supplier stock-ins and project issues for AI trend analysis.
          </p>
        </CardContent>
      </Card>

      {aiSummary && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain size={20} className="text-primary" />
              Operations Decision Support
            </CardTitle>
            <CardDescription>
              {aiSummary.enabled
                ? `Advisory signals from ${aiSummary.provider} / ${aiSummary.model}`
                : `Rule-based fallback signals / ${aiSummary.model}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!aiSummary.enabled && aiSummary.availabilityMessage && (
              <div className="rounded-lg border border-yellow-300 bg-yellow-50 px-3 py-2 text-sm text-yellow-900">
                {aiSummary.availabilityMessage}
              </div>
            )}
            <p className="text-sm text-muted-foreground">{aiSummary.summary}</p>
            {aiSummary.recommendations.length > 0 && (
              <div className="grid gap-3 md:grid-cols-3">
                {aiSummary.recommendations.map((item) => (
                  <div key={item.title} className="rounded-lg border bg-muted/30 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="font-medium">{item.title}</p>
                      <Badge className={riskColors[item.priority]}>{item.priority}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{item.message}</p>
                    <p className="mt-2 text-sm font-medium">{item.action}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pattern Trending */}
        <Card className="lg:col-span-2" ref={trendsRef}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp size={20} />
              24-Month Pattern Trend
            </CardTitle>
            <CardDescription>Monthly consumption patterns from May 2024 through April 2026</CardDescription>
          </CardHeader>
          <CardContent>
            {patternTrends.some((month) => Number(month.totalUsage || 0) > 0) ? (
              <div className="space-y-4">
                <ResponsiveContainer width="100%" height={340}>
                  <BarChart
                    data={patternTrends}
                    margin={{ top: 8, right: 20, left: 0, bottom: 40 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="month"
                      interval={0}
                      angle={-45}
                      textAnchor="end"
                      height={70}
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis allowDecimals={false} />
                    <Tooltip
                      formatter={(value, name) => [
                        `${Number(value).toLocaleString()} units`,
                        String(name),
                      ]}
                    />
                    <Legend />
                    {DEMO_PATTERN_ITEMS.map((item) => (
                      <Bar
                        key={item.name}
                        dataKey={item.name}
                        stackId="usage"
                        fill={item.color}
                        isAnimationActive={false}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="rounded-md border bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">24-Month Usage</p>
                    <p className="text-lg font-semibold">
                      {patternSummary.totalUsage.toLocaleString()} units
                    </p>
                  </div>
                  <div className="rounded-md border bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">Top Usage Item</p>
                    <p className="text-lg font-semibold">
                      {patternSummary.itemTotals[0]?.name || 'No usage yet'}
                    </p>
                  </div>
                  <div className="rounded-md border bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">Peak Pattern Month</p>
                    <p className="text-lg font-semibold">
                      {patternSummary.peakMonth.month} ({Number(patternSummary.peakMonth.totalUsage || 0).toLocaleString()} units)
                    </p>
                  </div>
                </div>
                <div className="overflow-auto rounded-md border">
                  <Table className="min-w-[920px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Month</TableHead>
                        {DEMO_PATTERN_ITEMS.map((item) => (
                          <TableHead key={item.name} className="text-right">{item.name}</TableHead>
                        ))}
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {patternRows.map((month) => (
                        <TableRow key={String(month.key)}>
                          <TableCell className="font-medium">{month.month}</TableCell>
                          {DEMO_PATTERN_ITEMS.map((item) => (
                            <TableCell key={item.name} className="text-right">
                              {Number(month[item.name] || 0).toLocaleString()}
                            </TableCell>
                          ))}
                          <TableCell className="text-right font-medium">
                            {Number(month.totalUsage || 0).toLocaleString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex items-center justify-center">
                  <PaginationNav
                    page={patternPage}
                    totalPages={patternTotalPages}
                    onPageChange={setPatternPage}
                  />
                </div>
              </div>
            ) : (
              <div className="rounded-lg border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                Pattern trend signals will appear after transactions are recorded.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Warehouse Risk Assessment */}
        <Card ref={risksRef}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle size={20} className="text-yellow-600" />
              Expiring / Risky Stock Alerts
            </CardTitle>
            <CardDescription>Decision-support ranking for items requiring immediate attention</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
              <Select value={riskFilter} onValueChange={(value) => setRiskFilter(value as typeof riskFilter)}>
                <SelectTrigger className="w-full sm:w-[220px]">
                  <SelectValue placeholder="Filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alerts">Only Critical/High</SelectItem>
                  <SelectItem value="include-low">Include Medium</SelectItem>
                  <SelectItem value="all">Show All Items</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {filteredRisks.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-4">
                <CheckCircle2 size={18} />
                All stock healthy—no immediate risks.
              </div>
            ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Risk</TableHead>
                  <TableHead>Age / Shelf Life</TableHead>
                  <TableHead>Days Left</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {riskPageItems.map((risk) => (
                  <TableRow key={risk.itemId}>
                    <TableCell>
                      <p className="font-medium">{risk.itemName}</p>
                      <p className="text-xs text-muted-foreground">{risk.reason}</p>
                    </TableCell>
                    <TableCell>
                      <Badge className={riskColors[risk.riskLevel]}>
                        {risk.riskLevel}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {typeof risk.daysInStock === 'number' && typeof risk.shelfLifeDays === 'number'
                        ? `${risk.daysInStock} / ${risk.shelfLifeDays} days`
                        : '—'}
                    </TableCell>
                    <TableCell className="text-sm">
                      {typeof risk.daysToExpiry === 'number'
                        ? `${risk.daysToExpiry} days`
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <p className="text-sm">{risk.recommendedAction}</p>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            )}
            <div className="mt-4 flex items-center justify-center">
              <PaginationNav
                page={riskPage}
                totalPages={riskTotalPages}
                onPageChange={setRiskPage}
              />
            </div>
          </CardContent>
        </Card>

        {/* Smart Reorder Suggestions */}
        <Card ref={reorderRef}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart size={20} className="text-green-600" />
              Smart Reorder Suggestions
            </CardTitle>
            <CardDescription>Suggested restocking quantities for admin review</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-center">Current</TableHead>
                  <TableHead className="text-center">Suggested</TableHead>
                  <TableHead className="text-right">Est. Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reorderPageItems.map((item) => (
                  <TableRow key={item.itemId}>
                    <TableCell className="font-medium">{item.itemName}</TableCell>
                    <TableCell className="text-center">
                      <span className={item.currentQty === 0 ? 'text-red-600 font-bold' : ''}>
                        {item.currentQty}
                      </span>
                    </TableCell>
                    <TableCell className="text-center text-green-600 font-medium">
                      {item.suggestedQty}
                    </TableCell>
                    <TableCell className="text-right">
                      ₱{item.estimatedCost.toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="mt-4 flex items-center justify-center">
              <PaginationNav
                page={reorderPage}
                totalPages={reorderTotalPages}
                onPageChange={setReorderPage}
              />
            </div>
            <div className="mt-4 pt-4 border-t flex justify-between items-center">
              <p className="text-sm text-muted-foreground">
                Total estimated: ₱
                {reorderSuggestions
                  .reduce((s, i) => s + i.estimatedCost, 0)
                  .toLocaleString()}
              </p>
              <Button size="sm" onClick={() => handleCreatePO(reorderSuggestions)}>
                Create PO from Suggestions
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Fraud Detection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield size={20} className="text-blue-600" />
              Purchase Order Match Monitor
            </CardTitle>
            <CardDescription>Advisory review of purchase order and payment signals</CardDescription>
          </CardHeader>
          <CardContent>
            {fraudAlerts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Shield size={48} className="mx-auto mb-2 opacity-50" />
                <p>No purchase order advisory alerts</p>
              </div>
            ) : (
              <div className="space-y-3">
                {fraudPageItems.map((alert) => (
                  <div
                    key={alert.id}
                    className={`p-3 rounded-lg border ${
                      alert.severity === 'low'
                        ? 'bg-green-50 border-green-200'
                        : alert.severity === 'medium'
                        ? 'bg-yellow-50 border-yellow-200'
                        : 'bg-red-50 border-red-200'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium">{alert.orderNumber}</p>
                        <p className="text-sm">{alert.message}</p>
                      </div>
                      <Badge
                        className={
                          alert.severity === 'low'
                            ? 'bg-green-600'
                            : alert.severity === 'medium'
                            ? 'bg-yellow-600'
                            : 'bg-red-600'
                        }
                      >
                        {alert.severity}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {format(new Date(alert.timestamp), 'MMM dd, yyyy HH:mm')}
                    </p>
                  </div>
                ))}
              </div>
            )}
            {fraudAlerts.length > 0 && (
              <div className="mt-4 flex items-center justify-center">
                <PaginationNav
                  page={fraudPage}
                  totalPages={fraudTotalPages}
                  onPageChange={setFraudPage}
                />
              </div>
            )}
            <p className="text-sm text-muted-foreground text-center mt-4">
              * The system reviews order, payment, and purchase-document signals when data is available
            </p>
          </CardContent>
        </Card>

        {/* Logistics Snapshot */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin size={20} className="text-primary" />
              Logistics Snapshot
            </CardTitle>
            <CardDescription>Dispatch and routing signals for logistics review</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border p-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                <div className="p-3 rounded-md border">
                  <p className="text-muted-foreground">Active Routes</p>
                  <p className="text-xl font-semibold">{logisticsSnapshot.activeRoutes}</p>
                </div>
                <div className="p-3 rounded-md border">
                  <p className="text-muted-foreground">Stops Today</p>
                  <p className="text-xl font-semibold">{logisticsSnapshot.stopsToday}</p>
                </div>
                <div className="p-3 rounded-md border">
                  <p className="text-muted-foreground">On-Time Rate</p>
                  <p className="text-xl font-semibold">{logisticsSnapshot.onTimeRate}%</p>
                </div>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-sm font-medium mb-2">Dispatch Watchlist</p>
                <div className="space-y-2 text-sm">
                  {logisticsSnapshot.dispatches.length > 0 ? (
                    dispatchPageItems.map((dispatch) => (
                      <div key={`${dispatch.route}-${dispatch.status}`} className="rounded-md border bg-background p-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{dispatch.route}</span>
                          <Badge className={/watch|delay|risk/i.test(dispatch.status) ? 'bg-yellow-600' : 'bg-green-600'}>
                            {dispatch.status}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{dispatch.note}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No active dispatch watchlist items.</p>
                  )}
                </div>
                {logisticsSnapshot.dispatches.length > 0 && (
                  <div className="mt-3 flex items-center justify-center">
                    <PaginationNav
                      page={dispatchPage}
                      totalPages={dispatchTotalPages}
                      onPageChange={setDispatchPage}
                    />
                  </div>
                )}
              <div className="text-xs text-muted-foreground">
                {logisticsSnapshot.recommendation}
              </div>
            </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Decision Support Summary</CardTitle>
          <CardDescription>
            Advisory signals to help staff decide the next operational action
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-red-50 rounded-lg border border-red-200">
              <AlertTriangle className="text-red-600 mb-2" size={24} />
              <h4 className="font-medium">Critical Stock Alert</h4>
              <p className="text-sm text-muted-foreground">
                {summary.criticalCount || summary.highCount || summary.totalLow
                  ? `${summary.criticalCount} critical, ${summary.highCount} high-risk items below minimum stock.`
                  : 'No critical stock alerts right now.'}
              </p>
              <Button
                variant="link"
                className="px-0 mt-2 text-red-600"
                onClick={() => risksRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              >
                View Items →
              </Button>
            </div>
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <TrendingUp className="text-blue-600 mb-2" size={24} />
              <h4 className="font-medium">Demand Forecast</h4>
              <p className="text-sm text-muted-foreground">
                {Number(patternSummary.peakMonth.totalUsage || 0) > 0
                  ? `${patternSummary.peakMonth.month} shows the strongest usage pattern in the 24-month trend.`
                  : 'Usage pattern trends will update once transactions accumulate.'}
              </p>
              <Button
                variant="link"
                className="px-0 mt-2 text-blue-600"
                onClick={() => trendsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              >
                Prepare Inventory →
              </Button>
            </div>
            <div className="p-4 bg-green-50 rounded-lg border border-green-200">
              <ShoppingCart className="text-green-600 mb-2" size={24} />
              <h4 className="font-medium">Cost Optimization</h4>
              <p className="text-sm text-muted-foreground">
                {summary.reorderTotal
                  ? `Bulk ordering could save ₱${summary.savingsEstimate.toLocaleString()} on current suggestions.`
                  : 'No cost optimization opportunities yet.'}
              </p>
              <Button
                variant="link"
                className="px-0 mt-2 text-green-600"
                onClick={() => {
                  reorderRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  if (reorderSuggestions.length > 0) {
                    handleCreatePO(reorderSuggestions);
                  } else {
                    toast({
                      title: 'No reorder suggestions',
                      description: 'There are no items to create a PO for yet.',
                    });
                  }
                }}
              >
                See Details →
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <p className="text-center text-sm text-muted-foreground">
        * Decision-support signals are advisory, generated by backend rules/AI, and may be cached.
      </p>
    </div>
  );
}
