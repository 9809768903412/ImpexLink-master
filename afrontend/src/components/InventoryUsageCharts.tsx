import { useMemo, useState } from 'react';
import { Area, AreaChart, Line, LineChart, Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

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
  const [view, setView] = useState('bars');
  const peak = months.reduce<Month | undefined>((best, month) => !best || Number(month.totalUsage) > Number(best.totalUsage) ? month : best, undefined);
  const total = months.reduce((sum, month) => sum + Number(month.totalUsage || 0), 0);
  const maxCell = Math.max(1, ...months.flatMap((month) => products.map((product) => Number(month[product.name] || 0))));
  const Chart = view === 'area' ? AreaChart : view === 'line' ? LineChart : BarChart;
  return (
    <div className="grid min-w-0 gap-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Packages issued</p><p className="text-xl font-semibold">{total.toLocaleString()}</p></div>
        <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Busiest month</p><p className="font-semibold">{total > 0 ? `${peak?.month} · ${Number(peak?.totalUsage).toLocaleString()} packages` : 'No recorded usage'}</p></div>
        <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Most-used product</p><p className="font-semibold">{totals[0]?.total > 0 ? totals[0].label : 'No recorded usage'}</p></div>
      </div>
      <section className="min-w-0 rounded-lg border p-3 sm:p-4" aria-label="Monthly usage chart">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Monthly Usage</h3><label className="flex items-center gap-2 text-xs">Display<select aria-label="Usage chart display" className="h-9 rounded-md border bg-background px-2 text-sm" value={view} onChange={(event) => setView(event.target.value)}><option value="bars">Bars</option><option value="line">Line</option><option value="area">Area</option><option value="heatmap">Product heatmap</option></select></label></div>
        <p className="mb-4 text-xs text-muted-foreground">Recorded packages issued in the selected period. Display changes never alter quantities.</p>
        {view === 'heatmap' ? <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr><th className="sticky left-0 bg-background p-2 text-left">Product</th>{months.map((month, index) => <th className="min-w-12 p-2" key={index}>{month.month}</th>)}</tr></thead><tbody>{products.map((product) => <tr key={product.key}><th className="sticky left-0 whitespace-nowrap bg-background p-2 text-left font-normal">{product.name.replace(/^Thortex\s+/i, '')}</th>{months.map((month, index) => { const value = Number(month[product.name] || 0); return <td key={index} className="p-1"><div className="rounded p-2 text-center" style={{ backgroundColor: `rgba(201,133,67,${value ? 0.12 + 0.68 * value / maxCell : 0.04})` }} title={`${product.name} · ${month.month}: ${value} packages`}>{value}</div></td>; })}</tr>)}</tbody></table><p className="mt-2 text-muted-foreground">Darker cells = more packages issued. Zero means no recorded usage.</p></div> : <>
        <div className="overflow-x-auto" tabIndex={0} aria-label="Scroll monthly usage chart horizontally">
          <div style={{ minWidth: Math.max(460, months.length * 38) }}>
            <ResponsiveContainer width="100%" height={360}>
              <Chart data={months} margin={{ top: 18, right: 16, left: 0, bottom: 18 }} accessibilityLayer>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" interval={0} angle={-45} textAnchor="end" height={65} tick={{ fontSize: 11 }} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={42} />
                <Tooltip formatter={(value) => [`${Number(value).toLocaleString()} packages`, 'Total issued']} cursor={{ fill: 'rgba(148,163,184,0.12)' }} />
                {view === 'area' ? <Area type="linear" dataKey="totalUsage" stroke="#c98543" fill="#c98543" fillOpacity={0.18} strokeWidth={2} isAnimationActive={false} /> : view === 'line' ? <Line type="linear" dataKey="totalUsage" stroke="#c98543" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} /> : <Bar dataKey="totalUsage" name="Total issued" fill="#c98543" radius={[4, 4, 0, 0]} maxBarSize={30} isAnimationActive={false} />}
              </Chart>
            </ResponsiveContainer>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Packages issued · Scroll to view the full date range.</p>
        </>}
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
