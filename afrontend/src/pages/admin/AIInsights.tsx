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
  LineChart,
  Line,
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
import type { WarehouseRisk, ReorderSuggestion, FraudAlert, StockTransaction, InventoryItem } from '@/types';
import PaginationNav from '@/components/PaginationNav';

const riskColors = {
  low: 'bg-green-100 text-green-800',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-orange-100 text-orange-800',
  critical: 'bg-red-100 text-red-800',
};

// TODO: Replace with real AI analysis from Lovable AI
export default function AIInsightsPage() {
  const navigate = useNavigate();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const trendsRef = useRef<HTMLDivElement | null>(null);
  const risksRef = useRef<HTMLDivElement | null>(null);
  const reorderRef = useRef<HTMLDivElement | null>(null);
  const [riskFilter, setRiskFilter] = useState<'alerts' | 'include-low' | 'all'>('alerts');
  const [riskPage, setRiskPage] = useState(1);
  const riskPageSize = 5;
  const { data: warehouseRisks } = useResource<WarehouseRisk[]>('/ai/warehouse-risks', []);
  const { data: reorderSuggestions } = useResource<ReorderSuggestion[]>('/ai/reorder-suggestions', []);
  const { data: fraudAlerts } = useResource<FraudAlert[]>('/ai/fraud-alerts', []);
  const { data: transactions } = useResource<StockTransaction[]>('/transactions', []);
  const { data: inventory } = useResource<InventoryItem[]>('/inventory', []);

  const usageTrends = (() => {
    const now = new Date();
    const weeks = Array.from({ length: 5 }).map((_, idx) => {
      const end = new Date(now);
      end.setDate(now.getDate() - (4 - idx) * 7);
      const start = new Date(end);
      start.setDate(end.getDate() - 6);
      return { label: `W${idx + 1}`, start, end };
    });

    const usageByItem: Record<string, number[]> = {};
    transactions.forEach((txn) => {
      if (!txn.itemId) return;
      const txnDate = new Date(txn.date);
      const weekIndex = weeks.findIndex((w) => txnDate >= w.start && txnDate <= w.end);
      if (weekIndex === -1) return;
      const delta = Math.abs(txn.qtyChange);
      if (!usageByItem[txn.itemId]) {
        usageByItem[txn.itemId] = Array(weeks.length).fill(0);
      }
      usageByItem[txn.itemId][weekIndex] += delta;
    });

    const totals = Object.entries(usageByItem).map(([itemId, counts]) => ({
      itemId,
      total: counts.reduce((sum, val) => sum + val, 0),
      counts,
    }));
    const topItems = totals.sort((a, b) => b.total - a.total).slice(0, 3);
    const nameMap = new Map(inventory.map((item) => [item.id, item.name]));

    return weeks.map((week, idx) => {
      const row: Record<string, string | number> = { week: week.label };
      topItems.forEach((item) => {
        const name = nameMap.get(item.itemId) || `Item ${item.itemId}`;
        row[name] = item.counts[idx] || 0;
      });
      return row;
    });
  })();

  const summary = useMemo(() => {
    const criticalCount = warehouseRisks.filter((risk) => risk.riskLevel === 'critical').length;
    const highCount = warehouseRisks.filter((risk) => risk.riskLevel === 'high').length;
    const totalLow = warehouseRisks.length;
    const reorderTotal = reorderSuggestions.reduce((sum, item) => sum + item.estimatedCost, 0);
    const savingsEstimate = reorderTotal ? Math.round(reorderTotal * 0.08) : 0;
    const trendItem =
      usageTrends.length > 0
        ? Object.keys(usageTrends[0]).find((key) => key !== 'week') || 'Top item'
        : 'Top item';
    return {
      criticalCount,
      highCount,
      totalLow,
      reorderTotal,
      savingsEstimate,
      trendItem,
    };
  }, [warehouseRisks, reorderSuggestions, usageTrends]);

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

  const handleRefresh = () => {
    setIsRefreshing(true);
    apiClient
      .post('/ai/refresh')
      .then(() => {
        toast({
          title: 'AI Analysis Complete',
          description: 'Insights have been updated with latest data',
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
            Intelligent analysis and recommendations powered by AI
          </p>
        </div>
        <Button onClick={handleRefresh} disabled={isRefreshing}>
          <RefreshCw size={16} className={`mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh Analysis
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pattern Trending */}
        <Card className="lg:col-span-2" ref={trendsRef}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp size={20} />
              Usage Pattern Trends
            </CardTitle>
            <CardDescription>Weekly consumption patterns for top items</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={usageTrends}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="week" />
                <YAxis />
                <Tooltip />
                <Legend />
                {usageTrends.length > 0 &&
                  Object.keys(usageTrends[0])
                    .filter((key) => key !== 'week')
                    .map((key, idx) => (
                      <Line
                        key={key}
                        type="monotone"
                        dataKey={key}
                        stroke={['#C0392B', '#D4874A', '#2C3E50'][idx % 3]}
                        strokeWidth={2}
                        isAnimationActive={false}
                      />
                    ))}
              </LineChart>
            </ResponsiveContainer>
            <p className="text-sm text-muted-foreground text-center mt-4">
              * AI-powered pattern analysis helps predict future demand
            </p>
          </CardContent>
        </Card>

        {/* Warehouse Risk Assessment */}
        <Card ref={risksRef}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle size={20} className="text-yellow-600" />
              Expiring / Risky Stock Alerts
            </CardTitle>
            <CardDescription>Items requiring immediate attention</CardDescription>
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
            <CardDescription>AI-recommended restocking quantities</CardDescription>
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
                {reorderSuggestions.map((item) => (
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
            <CardDescription>Purchase order matching alerts and verification history</CardDescription>
          </CardHeader>
          <CardContent>
            {fraudAlerts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Shield size={48} className="mx-auto mb-2 opacity-50" />
                <p>No fraud alerts</p>
              </div>
            ) : (
              <div className="space-y-3">
                {fraudAlerts.map((alert) => (
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
            <p className="text-sm text-muted-foreground text-center mt-4">
              * Mocked PO-code matching against order numbers for now
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
            <CardDescription>Operational view for dispatch and routing</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border p-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                <div className="p-3 rounded-md border">
                  <p className="text-muted-foreground">Active Routes</p>
                  <p className="text-xl font-semibold">3</p>
                </div>
                <div className="p-3 rounded-md border">
                  <p className="text-muted-foreground">Stops Today</p>
                  <p className="text-xl font-semibold">12</p>
                </div>
                <div className="p-3 rounded-md border">
                  <p className="text-muted-foreground">On-Time Rate</p>
                  <p className="text-xl font-semibold">94%</p>
                </div>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-sm font-medium mb-2">Active Dispatches</p>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span>Route A • Makati → Taguig</span>
                    <Badge className="bg-green-600">On Time</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Route B • Pasig → QC</span>
                    <Badge className="bg-yellow-600">Watch</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Route C • Manila → Ortigas</span>
                    <Badge className="bg-green-600">On Time</Badge>
                  </div>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                This snapshot replaces map visuals with operational signals for review.
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>AI Recommendations Summary</CardTitle>
          <CardDescription>
            Actionable insights to improve operations
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
                {usageTrends.length > 0
                  ? `${summary.trendItem} demand is trending upward this week.`
                  : 'Usage trends will update once transactions accumulate.'}
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
        * AI insights are generated by the backend and may be cached.
      </p>
    </div>
  );
}
