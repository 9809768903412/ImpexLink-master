import { useEffect, useMemo, useState } from 'react';
import { Download, Loader2, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { downloadCsv } from '@/utils/csv';
import { printTableReport } from '@/utils/print';
import {
  buildTableExportRows,
  filterExportRows,
  ExportColumn,
  ExportFilter,
  ExportScope,
  getSourcePageLabel,
  selectLocalExportRows,
  stringifyExportValue,
} from '@/utils/tableExport';

type ExportFormat = 'csv' | 'print';

type TableExportMenuProps<T> = {
  title: string;
  filename: string;
  columns: ExportColumn<T>[];
  currentRows: T[];
  allRows?: T[];
  loadRows?: (fromPage: number, toPage: number) => Promise<T[]>;
  page?: number;
  pageSize?: number;
  totalPages?: number;
  totalItems?: number;
  filters?: ExportFilter[];
  disabled?: boolean;
  className?: string;
};

export default function TableExportMenu<T>({
  title,
  filename,
  columns,
  currentRows,
  allRows,
  loadRows,
  page = 1,
  pageSize = Math.max(currentRows.length, 1),
  totalPages = 1,
  totalItems,
  filters = [],
  disabled = false,
  className,
}: TableExportMenuProps<T>) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [scope, setScope] = useState<ExportScope>('current');
  const [fromPage, setFromPage] = useState(1);
  const [toPage, setToPage] = useState(totalPages);
  const [exporting, setExporting] = useState(false);
  const [excludedColumns, setExcludedColumns] = useState<string[]>([]);
  const [criteria, setCriteria] = useState<Array<{ column: string; value: string }>>([]);
  const selectedColumns = columns.filter(({ header }) => !excludedColumns.includes(header));
  const activeFilters = filters.filter(({ value }) => value !== null && value !== undefined && String(value).trim() !== '');
  const canLoadBeyondCurrent = Boolean(allRows || loadRows);

  useEffect(() => {
    setFromPage(1);
    setToPage(Math.max(totalPages, 1));
  }, [totalPages]);

  const validationError = useMemo(() => {
    if (scope !== 'range') return '';
    if (!Number.isInteger(fromPage) || !Number.isInteger(toPage)) return 'Enter whole page numbers.';
    if (fromPage < 1 || toPage > totalPages) return `Choose pages from 1 to ${totalPages}.`;
    if (fromPage > toPage) return 'The first page must be before the last page.';
    return '';
  }, [fromPage, scope, toPage, totalPages]);

  const getRows = async () => {
    if (allRows) {
      return selectLocalExportRows({ currentRows, allRows, scope, page, pageSize, fromPage, toPage });
    }
    if (scope === 'current') return currentRows;
    if (!loadRows) return currentRows;
    return loadRows(scope === 'all' ? 1 : fromPage, scope === 'all' ? totalPages : toPage);
  };

  const handleExport = async () => {
    if (validationError || selectedColumns.length === 0) return;
    setExporting(true);
    try {
      const sourceRows = await getRows();
      const appliedCriteria = criteria.filter((criterion) => criterion.column && criterion.value.trim());
      const rows = filterExportRows(sourceRows, columns, appliedCriteria);
      const exportFilters = [...filters, ...appliedCriteria.map(({ column, value }) => ({ label: `${column} (equals)`, value }))];
      const sourcePages = getSourcePageLabel({ scope, page, totalPages, fromPage, toPage });
      if (format === 'csv') {
        downloadCsv(
          `${filename}-${new Date().toISOString().slice(0, 10)}.csv`,
          buildTableExportRows({ title, sourcePages, totalRecords: rows.length, filters: exportFilters, columns: selectedColumns, rows }),
        );
      } else {
        printTableReport({
          title,
          sourcePages,
          filters: exportFilters,
          rowsPerPage: pageSize,
          sourceStartPage: scope === 'current' ? page : scope === 'range' ? fromPage : 1,
          sourceTotalPages: totalPages,
          headers: selectedColumns.map(({ header }) => header),
          rows: rows.map((row) => selectedColumns.map(({ value }) => stringifyExportValue(value(row)))),
        });
      }
      setOpen(false);
      toast({ title: format === 'csv' ? 'CSV exported' : 'Print view opened', description: `${rows.length} row${rows.length === 1 ? '' : 's'} from ${sourcePages.toLowerCase()}.` });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Export failed',
        description: error instanceof Error ? error.message : 'Unable to prepare this table export.',
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className={className} disabled={disabled || currentRows.length === 0}>
          <Download className="mr-2 h-4 w-4" />
          Export / Print
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export {title}</DialogTitle>
          <DialogDescription>
            Export the visible page, a page range, or every record matching the current filters.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="rounded-md border p-3 text-sm" aria-label="Export filters">
            <p className="font-medium">Data to export</p>
            {activeFilters.length ? (
              <ul className="mt-2 space-y-1">
                {activeFilters.map(({ label, value }, index) => <li key={`${label}-${index}`}>{label}: {String(value)}</li>)}
              </ul>
            ) : <p className="mt-1 text-muted-foreground">All records matching the table view.</p>}
            <p className="mt-2 text-xs text-muted-foreground">Change the table filters before exporting to choose which records to include.</p>
          </div>
          <div className="grid gap-2">
            <Label>Format</Label>
            <Select value={format} onValueChange={(value) => setFormat(value as ExportFormat)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="csv">CSV spreadsheet</SelectItem>
                <SelectItem value="print">Print / Save as PDF</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Narrow exported records</legend>
            <p className="text-xs text-muted-foreground">Optional exact matches, combined with the table filters. Choose all matching records to include every page.</p>
            {criteria.map((criterion, index) => (
              <div key={index} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
                <select aria-label={`Filter field ${index + 1}`} className="h-10 min-w-0 rounded-md border bg-background px-2 text-sm" value={criterion.column} onChange={(event) => setCriteria((current) => current.map((entry, entryIndex) => entryIndex === index ? { column: event.target.value, value: '' } : entry))}>
                  <option value="">Choose field</option>
                  {columns.map(({ header }) => <option key={header} value={header}>{header}</option>)}
                </select>
                <Input aria-label={`Filter value ${index + 1}`} list={`${filename}-filter-values-${index}`} placeholder="Equals…" value={criterion.value} onChange={(event) => setCriteria((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, value: event.target.value } : entry))} />
                <datalist id={`${filename}-filter-values-${index}`}>
                  {[...new Set((allRows || currentRows).map((row) => {
                    const column = columns.find(({ header }) => header === criterion.column);
                    return column ? stringifyExportValue(column.value(row)) : '';
                  }))].filter(Boolean).sort().map((value) => <option key={value} value={value} />)}
                </datalist>
                <Button variant="ghost" size="sm" aria-label={`Remove filter ${index + 1}`} onClick={() => setCriteria((current) => current.filter((_, entryIndex) => entryIndex !== index))}>×</Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setCriteria((current) => [...current, { column: '', value: '' }])}>Add filter</Button>
          </fieldset>

          <div className="grid gap-2">
            <Label>Records</Label>
            <Select value={scope} onValueChange={(value) => setScope(value as ExportScope)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="current">Current page ({page} of {totalPages})</SelectItem>
                <SelectItem value="range" disabled={!canLoadBeyondCurrent || totalPages <= 1}>Selected page range</SelectItem>
                <SelectItem value="all" disabled={!canLoadBeyondCurrent}>All matching records{totalItems !== undefined ? ` (${totalItems})` : ''}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {scope === 'range' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor={`${filename}-from-page`}>From page</Label>
                <Input id={`${filename}-from-page`} type="number" min={1} max={totalPages} value={fromPage} onChange={(event) => setFromPage(Number(event.target.value))} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`${filename}-to-page`}>To page</Label>
                <Input id={`${filename}-to-page`} type="number" min={1} max={totalPages} value={toPage} onChange={(event) => setToPage(Number(event.target.value))} />
              </div>
            </div>
          )}
          {validationError && <p className="text-sm text-destructive">{validationError}</p>}
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Columns to include</legend>
            <div className="flex gap-3">
              <Button type="button" variant="ghost" size="sm" onClick={() => setExcludedColumns([])}>Select all</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setExcludedColumns(columns.map(({ header }) => header))}>Clear selection</Button>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {columns.map(({ header }) => (
                <label key={header} className="flex min-w-0 items-center gap-2 text-sm">
                  <input type="checkbox" className="h-4 w-4 shrink-0 accent-primary" checked={!excludedColumns.includes(header)} onChange={(event) => setExcludedColumns((current) => event.target.checked ? current.filter((value) => value !== header) : [...current, header])} />
                  {header}
                </label>
              ))}
            </div>
            {selectedColumns.length === 0 && <p role="alert" className="text-sm text-destructive">Select at least one column.</p>}
          </fieldset>
          <p className="text-xs text-muted-foreground">
            Active search and filters are preserved. Each table page starts on a separate printed sheet with its source page number.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={exporting}>Cancel</Button>
          <Button onClick={handleExport} disabled={exporting || Boolean(validationError) || selectedColumns.length === 0}>
            {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : format === 'print' ? <Printer className="mr-2 h-4 w-4" /> : <Download className="mr-2 h-4 w-4" />}
            {format === 'print' ? 'Open print view' : 'Export CSV'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
