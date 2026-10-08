import { useState } from 'react';
import { Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

type Kind = 'text' | 'number' | 'date' | 'select';
type Column<T> = { label: string; kind?: Kind; value: (row: T) => unknown };
type Criterion = { operator: string; value: string; upper?: string };

export function matchesColumnValue(raw: unknown, criterion: Criterion, kind: Kind = 'text') {
  if (!criterion.value.trim() && !criterion.upper?.trim()) return true;
  if (raw === null || raw === undefined || raw === '') return false;
  const value = kind === 'date' ? String(raw).slice(0, 10) : String(raw).trim().toLowerCase();
  const query = criterion.value.trim().toLowerCase();
  if (criterion.operator === 'contains') return value.includes(query);
  if (criterion.operator === 'equals' && kind !== 'number') return value === query;
  const parse = (v: string) => kind === 'date' ? Date.parse(`${v}T00:00:00Z`) : Number(v.replace(/,/g, '').replace(/^(php|₱)\s*/i, ''));
  const actual = parse(value);
  if (!Number.isFinite(actual)) return false;
  const low = query ? parse(query) : undefined;
  const high = criterion.upper?.trim() ? parse(criterion.upper.trim()) : undefined;
  if ((low !== undefined && !Number.isFinite(low)) || (high !== undefined && !Number.isFinite(high))) return false;
  if (criterion.operator === 'equals') return low !== undefined && actual === low;
  if (criterion.operator === 'gte') return low !== undefined && actual >= low;
  if (criterion.operator === 'lte') return low !== undefined && actual <= low;
  return (low === undefined || actual >= low) && (high === undefined || actual <= high);
}

export function useTableColumnFilters<T>(columns: Column<T>[], onChange?: () => void) {
  const [criteria, setCriteria] = useState<Record<string, Criterion>>({});
  const update = (label: string, next?: Criterion) => {
    setCriteria((current) => { const result = { ...current }; if (next) result[label] = next; else delete result[label]; return result; });
    onChange?.();
  };
  const matches = (row: T) => columns.every((column) => !criteria[column.label] || matchesColumnValue(column.value(row), criteria[column.label], column.kind));
  const filters = columns.flatMap((column) => {
    const rule = criteria[column.label];
    return rule && (rule.value.trim() || rule.upper?.trim()) ? [{ label: `${column.label} (${rule.operator})`, value: rule.operator === 'between' ? `${rule.value || 'Any'} – ${rule.upper || 'Any'}` : rule.value }] : [];
  });
  const heading = (label: string, rows: T[] = []) => {
    const column = columns.find((item) => item.label === label);
    if (!column) return label;
    const kind = column.kind || 'text';
    const rule = criteria[label] || { operator: kind === 'number' || kind === 'date' ? 'between' : kind === 'select' ? 'equals' : 'contains', value: '', upper: '' };
    const values = [...new Set(rows.map((row) => String(column.value(row) ?? '')).filter(Boolean))].sort();
    const active = Boolean(rule.value.trim() || rule.upper?.trim());
    return <Popover key={label}>
      <PopoverTrigger asChild><button type="button" aria-label={`Filter ${label}`} className={`inline-flex items-center gap-1.5 hover:text-foreground ${active ? 'text-primary' : ''}`}>{label}<Filter className="h-3.5 w-3.5 shrink-0" fill={active ? 'currentColor' : 'none'} /></button></PopoverTrigger>
      <PopoverContent align="start" className="w-64 space-y-3">
        <p className="text-sm font-medium">{label}</p>
        {kind !== 'select' && <select aria-label={`${label} comparison`} className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={rule.operator} onChange={(event) => update(label, { ...rule, operator: event.target.value, upper: '' })}>
          {kind === 'text' ? <><option value="contains">Contains</option><option value="equals">Equals</option></> : <><option value="between">Range</option><option value="gte">{kind === 'date' ? 'On or after' : 'At least'}</option><option value="lte">{kind === 'date' ? 'On or before' : 'At most'}</option><option value="equals">Exactly</option></>}
        </select>}
        {kind === 'select' ? <select aria-label={`${label} value`} className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={rule.value} onChange={(event) => update(label, { operator: 'equals', value: event.target.value })}><option value="">All values</option>{values.map((value) => <option key={value} value={value}>{value}</option>)}</select> : <>
          <Input aria-label={`${label} ${rule.operator === 'between' ? 'minimum' : 'value'}`} type={kind === 'date' ? 'date' : kind === 'number' ? 'number' : 'text'} placeholder={rule.operator === 'between' ? 'Minimum' : 'Filter value'} value={rule.value} onChange={(event) => update(label, { ...rule, value: event.target.value })} />
          {rule.operator === 'between' && <Input aria-label={`${label} maximum`} type={kind === 'date' ? 'date' : 'number'} placeholder="Maximum" value={rule.upper || ''} onChange={(event) => update(label, { ...rule, upper: event.target.value })} />}
        </>}
        <Button variant="ghost" size="sm" onClick={() => update(label)}>Clear filter</Button>
      </PopoverContent>
    </Popover>;
  };
  return { matches, filters, heading, clear: () => { setCriteria({}); onChange?.(); } };
}
