import { useState } from 'react';
import { format } from 'date-fns';
import type { DateRange, DropdownProps } from 'react-day-picker';
import { CalendarIcon, X } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { getAuditCalendarRange } from '@/utils/auditDateRange';

function Dropdown({ name, value, onChange, children, 'aria-label': label }: DropdownProps) {
  return <select name={name} value={value} onChange={onChange} aria-label={label} className="h-8 rounded-md border bg-background px-2 text-sm">{children}</select>;
}

export function useTableDateRange() {
  const [range, setRange] = useState<DateRange | undefined>();
  const bounds = getAuditCalendarRange(range?.from, range?.to);
  const matches = (value?: string | null) => {
    if (!bounds.dateFrom) return true;
    const time = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`).getTime() : new Date(value || '').getTime();
    return Number.isFinite(time) && time >= Date.parse(bounds.dateFrom) && time <= Date.parse(bounds.dateTo!);
  };
  const filters = range?.from ? [
    { label: 'From date', value: format(range.from, 'yyyy-MM-dd') },
    { label: 'To date', value: format(range.to || range.from, 'yyyy-MM-dd') },
  ] : [];
  return { range, setRange, matches, filters, ...bounds };
}

export default function TableDateRangeFilter({ range, onChange, label = 'Record date' }: { range?: DateRange; onChange: (range?: DateRange) => void; label?: string }) {
  return <div className="flex items-center gap-1">
    <Popover>
      <PopoverTrigger asChild><Button variant="outline" aria-label={`Filter ${label.toLowerCase()} range`}><CalendarIcon className="mr-2 h-4 w-4" />{range?.from ? `${format(range.from, 'MMM d, yyyy')} – ${format(range.to || range.from, 'MMM d, yyyy')}` : `${label} range`}</Button></PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] max-w-[calc(100vw-2rem)] p-0">
        <div className="grid grid-cols-3 gap-2 border-b p-3">
          {['This month', 'Last month', 'Last 30 days'].map((preset) => <Button key={preset} variant="outline" size="sm" className="px-1 text-xs" onClick={() => {
            const today = new Date();
            const from = new Date(today.getFullYear(), today.getMonth(), today.getDate());
            let to = today;
            if (preset === 'This month') from.setDate(1);
            else if (preset === 'Last month') { from.setDate(1); from.setMonth(from.getMonth() - 1); to = new Date(today.getFullYear(), today.getMonth(), 0); }
            else from.setDate(from.getDate() - 29);
            onChange({ from, to });
          }}>{preset}</Button>)}
        </div>
        <p className="px-3 pt-3 text-xs text-muted-foreground">Choose a start date, then an end date.</p>
        <Calendar className="flex justify-center p-3" mode="range" captionLayout="dropdown-buttons" components={{ Dropdown }} classNames={{ caption: 'relative flex h-9 items-center justify-center px-9', caption_label: 'sr-only', caption_dropdowns: 'flex items-center justify-center gap-2', vhidden: 'sr-only' }} selected={range} fromDate={new Date(2020, 0, 1)} toDate={new Date()} onSelect={onChange} />
      </PopoverContent>
    </Popover>
    {range && <Button variant="ghost" size="icon" aria-label={`Clear ${label.toLowerCase()} range`} onClick={() => onChange(undefined)}><X className="h-4 w-4" /></Button>}
  </div>;
}
