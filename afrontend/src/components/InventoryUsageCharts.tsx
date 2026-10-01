import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type Product = { key: string; name: string; color: string };
type Month = Record<string, string | number>;

export function buildProductUsageTotals(months: Month[], products: Product[]) {
  return products.map((item) => ({
    ...item,
    label: item.name.replace(/^Thortex\s+/i, ''),
    total: months.reduce((sum, month) => sum + Number(month[item.name] || 0), 0),
  })).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

export default function InventoryUsageCharts({ months, products }: { months: Month[]; products: Product[] }) {
  const totals = useMemo(() => buildProductUsageTotals(months, products), [months, products]);
  return (
    <div className="grid min-w-0 gap-6">
      <section className="min-w-0 rounded-lg border p-3 sm:p-4" aria-label="Monthly usage chart">
        <h3 className="font-semibold">Monthly Usage</h3>
        <p className="mb-4 text-xs text-muted-foreground">Total packages issued across the nine products each month.</p>
        <div className="overflow-x-auto" tabIndex={0} aria-label="Scroll monthly usage chart horizontally">
          <div style={{ minWidth: Math.max(460, months.length * 38) }}>
            <ResponsiveContainer width="100%" height={360}>
              <BarChart data={months} margin={{ top: 18, right: 16, left: 0, bottom: 18 }} accessibilityLayer>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" interval={0} angle={-45} textAnchor="end" height={65} tick={{ fontSize: 11 }} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={42} />
                <Tooltip formatter={(value) => [`${Number(value).toLocaleString()} packages`, 'Total issued']} cursor={{ fill: 'rgba(148,163,184,0.12)' }} />
                <Bar dataKey="totalUsage" name="Total issued" fill="#c98543" radius={[4, 4, 0, 0]} maxBarSize={30} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Packages issued · Scroll to view the full date range.</p>
      </section>
      <section className="min-w-0 rounded-lg border p-3 sm:p-4" aria-label="Product usage comparison chart">
        <h3 className="font-semibold">Usage by Product</h3>
        <p className="mb-4 text-xs text-muted-foreground">Ranked by total packages issued in the selected date range.</p>
        <div className="overflow-x-auto" tabIndex={0} aria-label="Scroll product usage chart horizontally">
          <div className="min-w-[440px]">
            <ResponsiveContainer width="100%" height={Math.max(240, totals.length * 38 + 40)}>
              <BarChart data={totals} layout="vertical" margin={{ top: 8, right: 42, left: 0, bottom: 8 }} accessibilityLayer>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis dataKey="label" type="category" width={172} interval={0} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip labelFormatter={(_label, payload) => payload[0]?.payload?.name || _label} formatter={(value) => [`${Number(value).toLocaleString()} packages`, 'Issued']} cursor={{ fill: 'rgba(148,163,184,0.12)' }} />
                <Bar dataKey="total" name="Packages issued" radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false}>
                  {totals.map((item) => <Cell key={item.key} fill={item.color} />)}
                  <LabelList dataKey="total" position="right" fontSize={11} formatter={(value: number) => Number(value).toLocaleString()} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Package counts compare activity, not kilograms, litres or revenue.</p>
      </section>
    </div>
  );
}
