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
    if (validationError) return;
    setExporting(true);
    try {
      const rows = await getRows();
      const sourcePages = getSourcePageLabel({ scope, page, totalPages, fromPage, toPage });
      if (format === 'csv') {
        downloadCsv(
          `${filename}-${new Date().toISOString().slice(0, 10)}.csv`,
          buildTableExportRows({ title, sourcePages, totalRecords: rows.length, filters, columns, rows }),
        );
      } else {
        printTableReport({
          title,
          sourcePages,
          filters,
          rowsPerPage: pageSize,
          sourceStartPage: scope === 'current' ? page : scope === 'range' ? fromPage : 1,
          sourceTotalPages: totalPages,
          headers: columns.map(({ header }) => header),
          rows: rows.map((row) => columns.map(({ value }) => stringifyExportValue(value(row)))),
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export {title}</DialogTitle>
          <DialogDescription>
            Export the visible page, a page range, or every record matching the current filters.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
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
          <p className="text-xs text-muted-foreground">
            Active search and filters are preserved. Each table page starts on a separate printed sheet with its source page number.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={exporting}>Cancel</Button>
          <Button onClick={handleExport} disabled={exporting || Boolean(validationError)}>
            {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : format === 'print' ? <Printer className="mr-2 h-4 w-4" /> : <Download className="mr-2 h-4 w-4" />}
            {format === 'print' ? 'Open print view' : 'Export CSV'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
