import { describe, expect, it } from 'vitest';
import {
  buildTableExportRows,
  filterExportRows,
  getSourcePageLabel,
  selectLocalExportRows,
} from '@/utils/tableExport';

describe('table export helpers', () => {
  it('combines exact content criteria without including similar statuses or excluded projects', () => {
    const data = [
      { status: 'delivered', project: 'A' },
      { status: 'delivered', project: 'B' },
      { status: 'not delivered', project: 'A' },
    ];
    const columns = [
      { header: 'Status', value: (row: typeof data[number]) => row.status },
      { header: 'Project', value: (row: typeof data[number]) => row.project },
    ];
    expect(filterExportRows(data, columns, [{ column: 'Status', value: ' Delivered ' }])).toEqual(data.slice(0, 2));
    expect(filterExportRows(data, columns, [{ column: 'Status', value: 'delivered' }, { column: 'Project', value: 'A' }])).toEqual([data[0]]);
    expect(filterExportRows(data, columns, [{ column: '', value: '' }])).toEqual(data);
    expect(filterExportRows(data, columns, [{ column: 'Status', value: 'pending' }])).toEqual([]);
  });
  const rows = Array.from({ length: 25 }, (_, index) => ({ id: index + 1, name: `Row ${index + 1}` }));

  it('selects the current page without changing its rows', () => {
    const currentRows = rows.slice(10, 20);
    expect(selectLocalExportRows({
      currentRows,
      allRows: rows,
      scope: 'current',
      page: 2,
      pageSize: 10,
      fromPage: 1,
      toPage: 3,
    })).toEqual(currentRows);
  });

  it('selects an inclusive page range', () => {
    expect(selectLocalExportRows({
      currentRows: rows.slice(0, 10),
      allRows: rows,
      scope: 'range',
      page: 1,
      pageSize: 10,
      fromPage: 2,
      toPage: 3,
    }).map((row) => row.id)).toEqual(Array.from({ length: 15 }, (_, index) => index + 11));
  });

  it('exports all matching records and labels the source pages', () => {
    expect(selectLocalExportRows({
      currentRows: rows.slice(0, 10),
      allRows: rows,
      scope: 'all',
      page: 1,
      pageSize: 10,
      fromPage: 1,
      toPage: 3,
    })).toHaveLength(25);
    expect(getSourcePageLabel({ scope: 'all', page: 1, totalPages: 3, fromPage: 1, toPage: 3 }))
      .toBe('All matching records (pages 1-3)');
  });

  it('includes scope, filters, headers, and values in CSV rows', () => {
    const exported = buildTableExportRows({
      title: 'Example',
      sourcePages: 'Pages 1-2 of 3',
      totalRecords: 2,
      filters: [{ label: 'Status', value: 'approved' }],
      columns: [
        { header: 'ID', value: (row: { id: number; name: string }) => row.id },
        { header: 'Name', value: (row: { id: number; name: string }) => row.name },
      ],
      rows: rows.slice(0, 2),
      generatedAt: new Date('2026-09-26T00:00:00Z'),
    });

    expect(exported).toContainEqual(['Source records', 'Pages 1-2 of 3']);
    expect(exported).toContainEqual(['Filter - Status', 'approved']);
    expect(exported).toContainEqual(['ID', 'Name']);
    expect(exported).toContainEqual(['1', 'Row 1']);
  });
});
