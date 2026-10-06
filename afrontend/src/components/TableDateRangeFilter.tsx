import { useId, useState } from 'react';
import { format } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import { X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function useTableDateRange() {
  const [range, setRange] = useState<DateRange | undefined>();
  const bounds = {
    dateFrom: range?.from ? new Date(range.from.getFullYear(), range.from.getMonth(), range.from.getDate()).toISOString() : undefined,
    dateTo: range?.to ? new Date(range.to.getFullYear(), range.to.getMonth(), range.to.getDate(), 23, 59, 59, 999).toISOString() : undefined,
  };
  const matches = (value?: string | null) => {
    if (!bounds.dateFrom && !bounds.dateTo) return true;
    const time = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`).getTime() : new Date(value || '').getTime();
    return Number.isFinite(time) && (!bounds.dateFrom || time >= Date.parse(bounds.dateFrom)) && (!bounds.dateTo || time <= Date.parse(bounds.dateTo));
  };
  const filters = [
    { label: 'From date', value: range?.from ? format(range.from, 'yyyy-MM-dd') : '' },
    { label: 'To date', value: range?.to ? format(range.to, 'yyyy-MM-dd') : '' },
  ].filter((filter) => filter.value);
  return { range, setRange, matches, filters, ...bounds };
}

export default function TableDateRangeFilter({ range, onChange, label = 'Record date' }: { range?: DateRange; onChange: (range?: DateRange) => void; label?: string }) {
  const id = useId();
  const from = range?.from ? format(range.from, 'yyyy-MM-dd') : '';
  const to = range?.to ? format(range.to, 'yyyy-MM-dd') : '';
  const change = (field: 'from' | 'to', value: string) => {
    const date = value ? new Date(`${value}T00:00:00`) : undefined;
    if (date && (!Number.isFinite(date.getTime()) || format(date, 'yyyy-MM-dd') !== value)) return;
    const next = { from: range?.from, to: range?.to, [field]: date };
    if (next.from && next.to && next.from > next.to) return;
    onChange(next.from || next.to ? next : undefined);
  };
  return <div className="min-w-0 w-full space-y-1 sm:w-auto" role="group" aria-label={`${label} range`}>
    <div className="grid min-w-0 grid-cols-1 items-end gap-2 sm:grid-cols-[minmax(0,150px)_minmax(0,150px)_auto]">
      <div className="min-w-0"><label className="text-xs text-muted-foreground" htmlFor={`${id}-from`}>From</label><Input id={`${id}-from`} aria-label={`${label} from`} className="h-9 w-full sm:w-[150px]" type="date" value={from} max={to || undefined} onChange={(event) => change('from', event.target.value)} /></div>
      <div className="min-w-0"><label className="text-xs text-muted-foreground" htmlFor={`${id}-to`}>To</label><Input id={`${id}-to`} aria-label={`${label} to`} className="h-9 w-full sm:w-[150px]" type="date" value={to} min={from || undefined} onChange={(event) => change('to', event.target.value)} /></div>
      {range && <Button variant="ghost" size="icon" className="h-9 w-8" aria-label={`Clear ${label.toLowerCase()} range`} onClick={() => onChange(undefined)}><X className="h-4 w-4" /></Button>}
    </div>
    {range && <p className="text-xs text-muted-foreground">Export period: {range.from ? format(range.from, 'MMM dd, yyyy') : 'Beginning'} – {range.to ? format(range.to, 'MMM dd, yyyy') : 'Latest'}</p>}
  </div>;
}
