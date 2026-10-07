import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ReportCriterion } from '@/utils/reportFilters';

export default function ReportColumnFilters({ headers, criteria, onChange }: { headers: string[]; criteria: ReportCriterion[]; onChange: (criteria: ReportCriterion[]) => void }) {
  return <details className="w-full rounded-md border p-2 text-xs">
    <summary className="cursor-pointer font-medium">Filter columns{criteria.some((criterion) => criterion.value.trim()) ? ' · active' : ''}</summary>
    <div className="mt-2 space-y-2">
      {criteria.map((criterion, index) => <div key={index} className="flex flex-wrap items-center gap-2">
        <select aria-label={`Report filter column ${index + 1}`} className="h-9 rounded-md border bg-background px-2" value={criterion.column} onChange={(event) => onChange(criteria.map((item, i) => i === index ? { ...item, column: Number(event.target.value) } : item))}>{headers.map((header, i) => <option key={i} value={i}>{header}</option>)}</select>
        <select aria-label={`Report filter operator ${index + 1}`} className="h-9 rounded-md border bg-background px-2" value={criterion.operator} onChange={(event) => onChange(criteria.map((item, i) => i === index ? { ...item, operator: event.target.value as ReportCriterion['operator'] } : item))}><option value="contains">Contains</option><option value="equals">Equals</option><option value="gte">At least (number)</option><option value="lte">At most (number)</option></select>
        <Input className="h-9 w-36" aria-label={`Report filter value ${index + 1}`} placeholder="Filter value" value={criterion.value} onChange={(event) => onChange(criteria.map((item, i) => i === index ? { ...item, value: event.target.value } : item))} />
        <Button variant="ghost" size="sm" onClick={() => onChange(criteria.filter((_, i) => i !== index))}>Remove</Button>
      </div>)}
      <Button variant="outline" size="sm" onClick={() => onChange([...criteria, { column: 0, operator: 'contains', value: '' }])}>Add column filter</Button>
      {criteria.length > 0 && <Button variant="ghost" size="sm" onClick={() => onChange([])}>Clear column filters</Button>}
    </div>
  </details>;
}
