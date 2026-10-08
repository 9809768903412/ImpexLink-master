import { useTableColumnFilters } from '@/components/TableColumnFilters';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  MapPin,
  RefreshCw,
  Eye,
  CheckCircle2,
} from 'lucide-react';
import InventoryUsageCharts from '@/components/InventoryUsageCharts';
import { toast } from '@/hooks/use-toast';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import type { AiAnalysis, AiLogisticsSnapshot, AiSummary, ReorderSuggestion, WarehouseRisk } from '@/types';
import PaginationNav from '@/components/PaginationNav';
import TableExportMenu from '@/components/TableExportMenu';

const riskColors = {
  low: 'bg-green-100 text-green-800',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-orange-100 text-orange-800',
  critical: 'bg-red-100 text-red-800',
};

const fallbackLogistics: AiLogisticsSnapshot = {
  activeRoutes: 0,
  stopsToday: 0,
  onTimeRate: null,
  recommendation: 'Decision-support logistics signals will appear after the backend data loads.',
  dispatches: [],
};

export default function AIInsightsPage() {
  const navigate = useNavigate();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filters, setFilters] = useState(() => {
    const now = new Date();
    return {
      from: format(new Date(now.getFullYear(), now.getMonth() - 24, 1), 'yyyy-MM-dd'),
      to: format(now, 'yyyy-MM-dd'),
      source: 'all', product: 'all',
    };
  });
  const filterParams = useMemo(() => ({ ...filters }), [filters]);
  const trendsRef = useRef<HTMLDivElement | null>(null);
  const risksRef = useRef<HTMLDivElement | null>(null);
  const reorderRef = useRef<HTMLDivElement | null>(null);
  const [riskFilter, setRiskFilter] = useState<'alerts' | 'include-low' | 'all'>('alerts');
  const [patternPage, setPatternPage] = useState(1);
  const [riskPage, setRiskPage] = useState(1);
  const [reorderPage, setReorderPage] = useState(1);
  const [dispatchPage, setDispatchPage] = useState(1);
  const patternPageSize = 6;
  const riskPageSize = 5;
  const reorderPageSize = 5;
  const dispatchPageSize = 3;
  const queryClient = useQueryClient();
  const { data: response, error, isPending: loading } = useQuery({
    queryKey: ['ai-analysis', filterParams],
    queryFn: async ({ signal }) => (await apiClient.get<AiAnalysis>('/ai/analysis', { params: filterParams, signal })).data,
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
    retry: false,
  });
  const aiAnalysis = response?.dataCoverage && Object.entries(filters).every(([key, value]) => response.dataCoverage?.[key as keyof typeof response.dataCoverage] === value) ? response : null;
  const aiSummary: AiSummary | null = aiAnalysis
    ? {
        enabled: aiAnalysis.enabled,
        provider: aiAnalysis.provider,
        model: aiAnalysis.model,
        availabilityMessage: aiAnalysis.availabilityMessage,
        generatedAt: aiAnalysis.generatedAt,
        summary: aiAnalysis.summary,
        recommendations: aiAnalysis.recommendations,
      }
    : null;
  const warehouseRisks = aiAnalysis?.warehouseRisks || [];
  const reorderSuggestions = aiAnalysis?.reorderSuggestions || [];
  const logisticsSnapshot = aiAnalysis?.logisticsSnapshot || fallbackLogistics;
  const patternItems = aiAnalysis?.patternItems || [];
  const patternTrends = aiAnalysis?.usageTrends || [];
  const coverage = aiAnalysis?.dataCoverage;
  const exportFilters = [
    { label: 'From', value: filters.from }, { label: 'To', value: filters.to },
  ];
  const patternSummary = useMemo(() => {
    const itemTotals = patternItems.map((item) => ({
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
  }, [patternTrends, patternItems]);

  const usageColumns = useTableColumnFilters<typeof patternTrends[number]>([
    { label: 'Month', kind: 'date', value: row => `${row.key}-01` },
    ...patternItems.map(item => ({ label: item.name, kind: 'number' as const, value: (row: typeof patternTrends[number]) => row[item.name] || 0 })),
    { label: 'Total', kind: 'number', value: row => row.totalUsage || 0 },
  ], () => setPatternPage(1));
  const matchingPatternTrends = patternTrends.filter(usageColumns.matches);
  const patternTotalPages = Math.max(1, Math.ceil(matchingPatternTrends.length / patternPageSize));
  const patternRows = matchingPatternTrends.slice((patternPage - 1) * patternPageSize, patternPage * patternPageSize);
  const summary = useMemo(() => {
    const criticalCount = warehouseRisks.filter((risk) => risk.riskLevel === 'critical').length;
    const highCount = warehouseRisks.filter((risk) => risk.riskLevel === 'high').length;
    const totalLow = warehouseRisks.length;
    const reorderTotal = reorderSuggestions.reduce((sum, item) => sum + item.estimatedCost, 0);
    return {
      criticalCount,
      highCount,
      totalLow,
      reorderTotal,
    };
  }, [warehouseRisks, reorderSuggestions]);

  const riskColumns = useTableColumnFilters<typeof warehouseRisks[number]>([
    { label: 'Item', value: row => `${row.itemName} ${row.reason}` },
    { label: 'Risk', kind: 'select', value: row => row.riskLevel },
    { label: 'Since Receipt / Shelf Life', value: row => `${row.daysInStock ?? 'Unknown'} / ${row.shelfLifeDays ?? 'Unknown'} days` },
    { label: 'Batch Expiry', kind: 'number', value: row => row.daysToExpiry },
    { label: 'Action', value: row => row.recommendedAction },
  ], () => setRiskPage(1));
  const reorderColumns = useTableColumnFilters<typeof reorderSuggestions[number]>([
    { label: 'Item', value: row => row.itemName },
    { label: 'Current', kind: 'number', value: row => row.currentQty },
    { label: 'Suggested', kind: 'number', value: row => row.suggestedQty },
    { label: 'Est. Cost', kind: 'number', value: row => row.estimatedCost },
  ], () => setReorderPage(1));
  const matchingReorders = reorderSuggestions.filter(reorderColumns.matches);
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

    let base = [...warehouseRisks];
    if (riskFilter === 'alerts') {
      base = warehouseRisks.filter(isRisky).filter((r) => r.riskLevel !== 'low');
    } else if (riskFilter === 'include-low') {
      base = warehouseRisks.filter(isRisky);
    }

    return base.filter(riskColumns.matches).sort((a, b) => {
      const riskOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const riskDelta = riskOrder[a.riskLevel] - riskOrder[b.riskLevel];
      if (riskDelta !== 0) return riskDelta;
      const leftA = typeof a.daysToExpiry === 'number' ? a.daysToExpiry : Number.POSITIVE_INFINITY;
      const leftB = typeof b.daysToExpiry === 'number' ? b.daysToExpiry : Number.POSITIVE_INFINITY;
      return leftA - leftB;
    });
  }, [warehouseRisks, riskFilter, riskColumns.matches]);

  useEffect(() => {
    setRiskPage(1);
  }, [riskFilter]);

  const riskTotalPages = Math.max(1, Math.ceil(filteredRisks.length / riskPageSize));
  const riskPageItems = filteredRisks.slice((riskPage - 1) * riskPageSize, riskPage * riskPageSize);
  const reorderTotalPages = Math.max(1, Math.ceil(matchingReorders.length / reorderPageSize));
  const reorderPageItems = matchingReorders.slice((reorderPage - 1) * reorderPageSize, reorderPage * reorderPageSize);
  const dispatchTotalPages = Math.max(1, Math.ceil(logisticsSnapshot.dispatches.length / dispatchPageSize));
  const dispatchPageItems = logisticsSnapshot.dispatches.slice(
    (dispatchPage - 1) * dispatchPageSize,
    dispatchPage * dispatchPageSize
  );

  useEffect(() => {
    setPatternPage(1);
  }, [filters, patternTrends.length]);

  useEffect(() => {
    setReorderPage(1);
  }, [reorderSuggestions.length]);

  useEffect(() => {
    setDispatchPage(1);
  }, [logisticsSnapshot.dispatches.length]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    apiClient
      .post<AiAnalysis>('/ai/refresh', filters)
      .then((response) => {
        queryClient.setQueryData(['ai-analysis', filterParams], response.data);
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
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Brain className="text-primary" />
            AI Insights
          </h2>
          <p className="text-muted-foreground">
            AI-assisted decision support for inventory, PO risk, and dispatch planning
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end xl:shrink-0">
          <div className="grid grid-cols-2 gap-3" aria-label="Insights date range">
            <div className="min-w-0 space-y-1"><Label htmlFor="insights-from">From date</Label><Input className="min-w-0" id="insights-from" type="date" value={filters.from} max={filters.to} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} /></div>
            <div className="min-w-0 space-y-1"><Label htmlFor="insights-to">To date</Label><Input className="min-w-0" id="insights-to" type="date" value={filters.to} min={filters.from} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} /></div>
          </div>
        <Button className="shrink-0" onClick={handleRefresh} disabled={isRefreshing}>
          <RefreshCw size={16} className={`mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh Signals
        </Button>
        </div>
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">Unable to load insights: {error.message}</p> : loading || !coverage ? <p className="text-sm text-muted-foreground">Loading database records…</p> : null}

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

      {aiAnalysis && <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pattern Trending */}
        <Card className="lg:col-span-2" ref={trendsRef}>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="flex items-center gap-2">
                <TrendingUp size={20} />
                Thortex Inventory Usage
              </CardTitle>
              <TableExportMenu
                title="Thortex Inventory Usage"
                filename="inventory-usage-pattern"
                columns={[
                  { header: 'Month', value: (month) => month.month },
                  ...patternItems.map((item) => ({ header: item.name, value: (month: Record<string, string | number>) => month[item.name] || 0 })),
                  { header: 'Total', value: (month) => month.totalUsage || 0 },
                ]}
                currentRows={patternRows}
                allRows={matchingPatternTrends}
                page={patternPage}
                pageSize={patternPageSize}
                totalPages={patternTotalPages}
                totalItems={matchingPatternTrends.length}
                filters={[...exportFilters, ...usageColumns.filters]}
              />
            </div>
            <CardDescription>Recorded stock issues for the selected dates and products. Quantities count packages, not kilograms or litres.</CardDescription>
          </CardHeader>
          <CardContent>
            {patternTrends.some((month) => Number(month.totalUsage || 0) > 0) ? (
              <div className="space-y-4">
                <InventoryUsageCharts months={patternTrends} products={patternItems} />
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="rounded-md border bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">Usage in Selected Period</p>
                    <p className="text-lg font-semibold">
                      {patternSummary.totalUsage.toLocaleString()} packages
                    </p>
                  </div>
                  <div className="rounded-md border bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">Top Usage Item</p>
                    <p className="text-lg font-semibold">
                      {patternSummary.itemTotals[0]?.name || 'No usage yet'}
                    </p>
                  </div>
                  <div className="rounded-md border bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">Peak Usage Month</p>
                    <p className="text-lg font-semibold">
                      {patternSummary.peakMonth.month} ({Number(patternSummary.peakMonth.totalUsage || 0).toLocaleString()} packages)
                    </p>
                  </div>
                </div>
                <div className="overflow-auto rounded-md border">
                  <Table className="min-w-[920px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>{usageColumns.heading('Month', patternTrends)}</TableHead>
                        {patternItems.map((item) => (
                          <TableHead key={item.name} className="text-right">{usageColumns.heading(item.name, patternTrends)}</TableHead>
                        ))}
                        <TableHead className="text-right">{usageColumns.heading('Total', patternTrends)}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {patternRows.map((month) => (
                        <TableRow key={String(month.key)}>
                          <TableCell className="font-medium">{month.month}</TableCell>
                          {patternItems.map((item) => (
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
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle size={20} className="text-yellow-600" />
                Current Stock Alerts
              </CardTitle>
              <TableExportMenu
                title="Expiring and Risky Stock Alerts"
                filename="stock-risk-alerts"
                columns={[
                  { header: 'Item', value: (risk) => risk.itemName },
                  { header: 'Risk', value: (risk) => risk.riskLevel },
                  { header: 'Reason', value: (risk) => risk.reason },
                  { header: 'Days Since Last Receipt', value: (risk) => risk.daysInStock ?? '' },
                  { header: 'Shelf Life Days', value: (risk) => risk.shelfLifeDays ?? '' },
                  { header: 'Days Left', value: (risk) => risk.daysToExpiry ?? '' },
                  { header: 'Recommended Action', value: (risk) => risk.recommendedAction },
                ]}
                currentRows={riskPageItems}
                allRows={filteredRisks}
                page={riskPage}
                pageSize={riskPageSize}
                totalPages={riskTotalPages}
                totalItems={filteredRisks.length}
                filters={[...exportFilters, ...riskColumns.filters, { label: 'Risk view', value: riskFilter }]}
              />
            </div>
            <CardDescription>Decision-support ranking for items requiring immediate attention</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
              <Select value={riskFilter} onValueChange={(value) => setRiskFilter(value as typeof riskFilter)}>
                <SelectTrigger className="w-full sm:w-[220px]">
                  <SelectValue placeholder="Filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alerts">Critical / High / Medium</SelectItem>
                  <SelectItem value="include-low">Include Low-stock Items</SelectItem>
                  <SelectItem value="all">Show All Items</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {filteredRisks.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-4">
                <CheckCircle2 size={18} />
                No stock alerts match this view.
              </div>
            ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{riskColumns.heading('Item', warehouseRisks)}</TableHead>
                  <TableHead>{riskColumns.heading('Risk', warehouseRisks)}</TableHead>
                  <TableHead>{riskColumns.heading('Since Receipt / Shelf Life', warehouseRisks)}</TableHead>
                  <TableHead>{riskColumns.heading('Batch Expiry', warehouseRisks)}</TableHead>
                  <TableHead>{riskColumns.heading('Action', warehouseRisks)}</TableHead>
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
                        : 'Unknown'}
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
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart size={20} className="text-green-600" />
                Smart Reorder Suggestions
              </CardTitle>
              <TableExportMenu
                title="Smart Reorder Suggestions"
                filename="reorder-suggestions"
                columns={[
                  { header: 'Item', value: (item) => item.itemName },
                  { header: 'Current Quantity', value: (item) => item.currentQty },
                  { header: 'Suggested Quantity', value: (item) => item.suggestedQty },
                  { header: 'Estimated Cost', value: (item) => `PHP ${item.estimatedCost.toLocaleString()}` },
                ]}
                currentRows={reorderPageItems}
                allRows={matchingReorders}
                page={reorderPage}
                pageSize={reorderPageSize}
                totalPages={reorderTotalPages}
                totalItems={matchingReorders.length}
                filters={[...exportFilters, ...reorderColumns.filters]}
              />
            </div>
            <CardDescription>Suggested restocking quantities for admin review</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{reorderColumns.heading('Item', reorderSuggestions)}</TableHead>
                  <TableHead className="text-center">{reorderColumns.heading('Current', reorderSuggestions)}</TableHead>
                  <TableHead className="text-center">{reorderColumns.heading('Suggested', reorderSuggestions)}</TableHead>
                  <TableHead className="text-right">{reorderColumns.heading('Est. Cost', reorderSuggestions)}</TableHead>
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
                  <p className="text-xl font-semibold">{logisticsSnapshot.onTimeRate === null ? 'Not enough data' : `${logisticsSnapshot.onTimeRate}%`}</p>
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
              <h4 className="font-medium">Usage History</h4>
              <p className="text-sm text-muted-foreground">
                {Number(patternSummary.peakMonth.totalUsage || 0) > 0
                  ? `${patternSummary.peakMonth.month} shows the strongest usage pattern in the selected period.`
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
              <h4 className="font-medium">Reorder Budget</h4>
              <p className="text-sm text-muted-foreground">
                {summary.reorderTotal
                  ? `Estimated replenishment budget: ₱${summary.reorderTotal.toLocaleString()}. Uses current catalog prices; request supplier quotations for actual cost.`
                  : 'No current replenishment estimate.'}
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
      </>}
    </div>
  );
}
