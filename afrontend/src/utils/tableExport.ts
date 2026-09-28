export type ExportScope = 'current' | 'range' | 'all';

export type ExportFilter = {
  label: string;
  value: string | number | null | undefined;
};

export type ExportColumn<T> = {
  header: string;
  value: (row: T) => unknown;
};

export const stringifyExportValue = (value: unknown) => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toLocaleString();
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.map(stringifyExportValue).join(', ');
  return String(value);
};

export const getSourcePageLabel = ({
  scope,
  page,
  totalPages,
  fromPage,
  toPage,
}: {
  scope: ExportScope;
  page: number;
  totalPages: number;
  fromPage: number;
  toPage: number;
}) => {
  if (scope === 'current') return `Page ${page} of ${totalPages}`;
  if (scope === 'range') return `Pages ${fromPage}-${toPage} of ${totalPages}`;
  return `All matching records (pages 1-${totalPages})`;
};

export const selectLocalExportRows = <T,>({
  currentRows,
  allRows,
  scope,
  page,
  pageSize,
  fromPage,
  toPage,
}: {
  currentRows: T[];
  allRows: T[];
  scope: ExportScope;
  page: number;
  pageSize: number;
  fromPage: number;
  toPage: number;
}) => {
  if (scope === 'current') return currentRows;
  if (scope === 'all') return allRows;

  const start = (fromPage - 1) * pageSize;
  const end = toPage * pageSize;
  return allRows.slice(start, end);
};

export const buildTableExportRows = <T,>({
  title,
  sourcePages,
  totalRecords,
  filters = [],
  columns,
  rows,
  generatedAt = new Date(),
}: {
  title: string;
  sourcePages: string;
  totalRecords: number;
  filters?: ExportFilter[];
  columns: ExportColumn<T>[];
  rows: T[];
  generatedAt?: Date;
}) => {
  const activeFilters = filters.filter(({ value }) => value !== null && value !== undefined && String(value).trim() !== '');
  return [
    ['Report', title],
    ['Source records', sourcePages],
    ['Rows exported', String(totalRecords)],
    ['Generated', generatedAt.toLocaleString()],
    ...activeFilters.map(({ label, value }) => [`Filter - ${label}`, stringifyExportValue(value)]),
    [],
    columns.map(({ header }) => header),
    ...rows.map((row) => columns.map(({ value }) => stringifyExportValue(value(row)))),
  ];
};

export const escapePrintHtml = (value: unknown) =>
  stringifyExportValue(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

