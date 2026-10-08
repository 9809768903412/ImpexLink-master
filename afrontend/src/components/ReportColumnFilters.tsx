import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Filter } from 'lucide-react';
import type { ReportCriterion } from '@/utils/reportFilters';

export default function ReportColumnFilters({ header, column, criteria, values, onChange }: { header: string; column: number; criteria: ReportCriterion[]; values: string[]; onChange: (criteria: ReportCriterion[]) => void }) {
  const criterion = criteria.find((item) => item.column === column);
  const active = Boolean(criterion?.value.trim());
  const update = (change: Partial<ReportCriterion>) => onChange([...criteria.filter((item) => item.column !== column), { column, operator: 'contains', value: '', ...criterion, ...change }]);
  return <Popover>
    <PopoverTrigger asChild>
      <button type="button" aria-label={`Filter ${header}`} className={`inline-flex items-center gap-1.5 whitespace-nowrap hover:text-foreground ${active ? 'text-primary' : ''}`}>
        {header}<Filter className="h-3.5 w-3.5" fill={active ? 'currentColor' : 'none'} />
      </button>
    </PopoverTrigger>
    <PopoverContent align="start" className="w-64 space-y-3">
      <p className="text-sm font-medium">Filter {header}</p>
      <select aria-label={`${header} filter operator`} className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={criterion?.operator || 'contains'} onChange={(event) => update({ operator: event.target.value as ReportCriterion['operator'] })}>
        <option value="contains">Contains</option><option value="equals">Equals</option><option value="gte">At least (number)</option><option value="lte">At most (number)</option>
      </select>
      <Input aria-label={`${header} filter value`} placeholder="Type a value" value={criterion?.value || ''} onChange={(event) => update({ value: event.target.value })} />
      {values.length > 0 && values.length <= 20 && <select aria-label={`Choose ${header}`} className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={criterion?.operator === 'equals' ? criterion.value : ''} onChange={(event) => update({ operator: 'equals', value: event.target.value })}>
        <option value="">Choose a value…</option>{values.map((value) => <option key={value} value={value}>{value}</option>)}
      </select>}
      <Button variant="ghost" size="sm" onClick={() => onChange(criteria.filter((item) => item.column !== column))}>Clear filter</Button>
    </PopoverContent>
  </Popover>;
}
