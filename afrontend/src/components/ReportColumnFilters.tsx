import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Filter } from 'lucide-react';
import type { ReportCriterion } from '@/utils/reportFilters';

export default function ReportColumnFilters({ header, column, criteria, values, onChange }: { header: string; column: number; criteria: ReportCriterion[]; values: string[]; onChange: (criteria: ReportCriterion[]) => void }) {
  const kind = /^(ETA|Last Order)$/.test(header) ? 'date' : /^(Qty|Min|Value|Suggested PO|Items|Orders|Total|Revenue|Days Late|VAT)/.test(header) ? 'number' : 'text';
  const defaultOperator = kind === 'text' ? 'contains' : 'between';
  const criterion = criteria.find((item) => item.column === column);
  const active = Boolean(criterion?.value.trim() || criterion?.upper?.trim());
  const update = (change: Partial<ReportCriterion>) => onChange([...criteria.filter((item) => item.column !== column), { column, operator: defaultOperator, value: '', ...criterion, ...change, kind }]);
  return <Popover>
    <PopoverTrigger asChild>
      <button type="button" aria-label={`Filter ${header}`} className={`inline-flex items-center gap-1.5 whitespace-nowrap hover:text-foreground ${active ? 'text-primary' : ''}`}>
        {header}<Filter className="h-3.5 w-3.5" fill={active ? 'currentColor' : 'none'} />
      </button>
    </PopoverTrigger>
    <PopoverContent align="start" className="w-64 space-y-3">
      <p className="text-sm font-medium">Filter {header}</p>
      <select aria-label={`${header} filter operator`} className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={criterion?.operator || defaultOperator} onChange={(event) => update({ operator: event.target.value as ReportCriterion['operator'], upper: '' })}>
        {kind === 'text' ? <><option value="contains">Contains</option><option value="equals">Equals</option></> : <><option value="between">Range</option><option value="equals">Exactly</option><option value="gte">{kind === 'date' ? 'On or after' : 'At least'}</option><option value="lte">{kind === 'date' ? 'On or before' : 'At most'}</option></>}
      </select>
      <Input aria-label={`${header} filter value`} type={kind === 'date' ? 'date' : kind === 'number' ? 'number' : 'text'} placeholder={kind === 'text' ? 'Type a value' : 'Minimum'} value={criterion?.value || ''} onChange={(event) => update({ value: event.target.value })} />
      {(criterion?.operator || defaultOperator) === 'between' && <Input aria-label={`${header} filter maximum`} type={kind === 'date' ? 'date' : 'number'} placeholder="Maximum" value={criterion?.upper || ''} onChange={(event) => update({ upper: event.target.value })} />}
      {kind === 'text' && values.length > 0 && values.length <= 20 && <select aria-label={`Choose ${header}`} className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={criterion?.operator === 'equals' ? criterion.value : ''} onChange={(event) => update({ operator: 'equals', value: event.target.value })}>
        <option value="">Choose a value…</option>{values.map((value) => <option key={value} value={value}>{value}</option>)}
      </select>}
      <Button variant="ghost" size="sm" onClick={() => onChange(criteria.filter((item) => item.column !== column))}>Clear filter</Button>
    </PopoverContent>
  </Popover>;
}
