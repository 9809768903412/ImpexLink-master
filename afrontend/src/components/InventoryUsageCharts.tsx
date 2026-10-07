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
  const [view, setView] = useState('line');
  const [selectedKeys, setSelectedKeys] = useState<string[] | null>(null);
  const visibleProducts = products.filter((product, index) => selectedKeys === null ? index < 4 : selectedKeys.includes(product.key));
  const totals = useMemo(() => buildProductUsageTotals(months, visibleProducts), [months, visibleProducts]);
  const chartMonths = months.map((month) => ({ ...month, selectedUsage: visibleProducts.reduce((sum, product) => sum + Number(month[product.name] || 0), 0) }));
  const peak = chartMonths.reduce<typeof chartMonths[number] | undefined>((best, month) => !best || month.selectedUsage > best.selectedUsage ? month : best, undefined);
  const total = chartMonths.reduce((sum, month) => sum + month.selectedUsage, 0);
  const maxCell = Math.max(1, ...months.flatMap((month) => visibleProducts.map((product) => Number(month[product.name] || 0))));
  const dashPatterns = ['', '8 4', '2 4', '10 3 2 3', '14 5', '4 2', '8 3 2 3 2 3', '1 3', '12 3 4 3'];
  const Chart = view === 'area' ? AreaChart : view === 'line' ? LineChart : BarChart;
  return (
    <div className="grid min-w-0 gap-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">Packages issued · selected items</p><p className="mt-2 text-2xl font-semibold tabular-nums">{total.toLocaleString()}</p></div>
        <div className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">Busiest month</p><p className="mt-2 font-semibold">{total > 0 ? `${peak?.month} · ${Number(peak?.selectedUsage).toLocaleString()} packages` : 'No recorded usage'}</p></div>
        <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Most-used product</p><p className="font-semibold">{totals[0]?.total > 0 ? totals[0].label : 'No recorded usage'}</p></div>
      </div>
      <section className="min-w-0 rounded-lg border p-3 sm:p-4" aria-label="Monthly usage chart">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Monthly Usage per Item</h3><label className="flex items-center gap-2 text-xs">Display<select aria-label="Usage chart display" className="h-9 rounded-md border bg-background px-2 text-sm" value={view} onChange={(event) => setView(event.target.value)}><option value="bars">Bars</option><option value="line">Line</option><option value="area">Area</option><option value="heatmap">Product heatmap</option></select></label></div>
        <details className="mb-4 rounded-lg border bg-muted/20 p-3">
          <summary className="cursor-pointer text-sm font-medium">Items · {visibleProducts.length} of {products.length} selected</summary>
          <div className="my-3 flex gap-3 text-xs"><button type="button" className="underline" onClick={() => setSelectedKeys(products.map((product) => product.key))}>Select all</button><button type="button" className="underline" onClick={() => setSelectedKeys([])}>Clear selection</button></div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{products.map((product) => <label key={product.key} className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 accent-primary" aria-label={`Show ${product.name}`} checked={visibleProducts.some((item) => item.key === product.key)} onChange={(event) => setSelectedKeys(event.target.checked ? [...visibleProducts.map((item) => item.key), product.key] : visibleProducts.filter((item) => item.key !== product.key).map((item) => item.key))} />{product.name.replace(/^Thortex\s+/i, '')}</label>)}</div>
        </details>
        <p className="mb-4 text-xs text-muted-foreground">Monthly stock-out transactions · Each series represents one item. Quantities count packages.</p>
        <div className="mb-4 flex flex-wrap gap-x-5 gap-y-2" aria-label="Chart legend">{visibleProducts.map((product, index) => <span key={product.key} className="flex items-center gap-2 text-xs"><svg width="28" height="8" aria-hidden="true"><line x1="0" x2="28" y1="4" y2="4" stroke={product.color} strokeWidth="2" strokeDasharray={dashPatterns[index % dashPatterns.length]} /></svg>{product.name.replace(/^Thortex\s+/i, '')}</span>)}</div>
        {visibleProducts.length === 0 && <p role="status" className="py-8 text-center text-sm text-muted-foreground">Select at least one item to display its recorded usage.</p>}
        {view === 'heatmap' ? <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-xs"><thead className="bg-muted/30"><tr><th className="sticky left-0 z-10 bg-background p-3 text-left">Product</th>{months.map((month, index) => <th className="min-w-16 p-3 font-medium" key={index}>{month.month}</th>)}</tr></thead>
            <tbody>{visibleProducts.map((product) => <tr key={product.key} className="border-t"><th className="sticky left-0 z-10 whitespace-nowrap bg-background p-3 text-left font-medium">{product.name.replace(/^Thortex\s+/i, '')}</th>{months.map((month, index) => { const value = Number(month[product.name] || 0); return <td key={index} className="p-1.5"><div className="rounded-md p-2.5 text-center tabular-nums" style={{ backgroundColor: `rgba(201,133,67,${value ? 0.12 + 0.68 * value / maxCell : 0.04})` }} title={`${product.name} · ${month.month}: ${value} packages`}>{value}</div></td>; })}</tr>)}</tbody>
          </table><p className="border-t p-3 text-muted-foreground">Darker cells = more packages issued. Zero means no recorded usage.</p>
        </div> : <>
        <div className="overflow-x-auto" tabIndex={0} aria-label="Scroll monthly usage chart horizontally">
          <div style={{ minWidth: Math.max(460, months.length * (view === 'bars' ? Math.max(38, visibleProducts.length * 14) : 38)) }}>
            <ResponsiveContainer width="100%" height={360}>
              <Chart data={months} margin={{ top: 24, right: 28, left: 8, bottom: 18 }} accessibilityLayer>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" interval={months.length > 12 ? 2 : 0} height={50} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} label={{ value: 'Month', position: 'insideBottom', offset: 0, fontSize: 11 }} />
                <YAxis allowDecimals={false} domain={[0, 'auto']} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={64} label={{ value: 'Packages issued', angle: -90, position: 'insideLeft', fontSize: 11 }} />
                <Tooltip formatter={(value, name) => [`${Number(value).toLocaleString()} packages`, String(name).replace(/^Thortex\s+/i, '')]} contentStyle={{ borderRadius: 12, padding: 12, boxShadow: '0 8px 24px rgba(0,0,0,.08)' }} cursor={{ stroke: '#94a3b8', strokeDasharray: '3 3', fill: 'rgba(148,163,184,0.08)' }} />
                {visibleProducts.map((product, index) => view === 'area' ? <Area key={product.key} type="linear" dataKey={product.name} name={product.name} stroke={product.color} fill={product.color} fillOpacity={0.08} strokeWidth={2} strokeDasharray={dashPatterns[index % dashPatterns.length]} isAnimationActive={false} /> : view === 'line' ? <Line key={product.key} type="linear" dataKey={product.name} name={product.name} stroke={product.color} strokeWidth={2} strokeDasharray={dashPatterns[index % dashPatterns.length]} dot={false} activeDot={{ r: 5, strokeWidth: 2 }} isAnimationActive={false} /> : <Bar key={product.key} dataKey={product.name} name={product.name} fill={product.color} radius={[3, 3, 0, 0]} maxBarSize={24} isAnimationActive={false} />)}
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
