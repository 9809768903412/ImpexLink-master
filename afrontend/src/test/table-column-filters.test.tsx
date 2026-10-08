import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { matchesColumnValue, useTableColumnFilters } from '@/components/TableColumnFilters';
import { matchesReportRow } from '@/utils/reportFilters';

afterEach(cleanup);

it('compares quantities, currency, dates and missing values without changing data', () => {
  expect(matchesColumnValue(30, { operator: 'between', value: '20', upper: '40' }, 'number')).toBe(true);
  expect(matchesColumnValue(45, { operator: 'between', value: '20', upper: '40' }, 'number')).toBe(false);
  expect(matchesColumnValue('PHP 1,250.50', { operator: 'gte', value: '1200' }, 'number')).toBe(true);
  expect(matchesColumnValue(10, { operator: 'equals', value: '10.00' }, 'number')).toBe(true);
  expect(matchesColumnValue(0, { operator: 'between', value: '', upper: '0' }, 'number')).toBe(true);
  expect(matchesColumnValue(null, { operator: 'between', value: '0', upper: '30' }, 'number')).toBe(false);
  expect(matchesColumnValue('2026-05-20T12:00:00Z', { operator: 'between', value: '2026-05-01', upper: '2026-05-31' }, 'date')).toBe(true);
  expect(matchesColumnValue('2026-06-01', { operator: 'lte', value: '2026-05-31' }, 'date')).toBe(false);
  expect(matchesColumnValue('2026-05-31', { operator: 'equals', value: '2026-05-31' }, 'date')).toBe(true);
  expect(matchesColumnValue('Healthy', { operator: 'equals', value: 'healthy' }, 'select')).toBe(true);
  expect(matchesColumnValue(3, { operator: 'between', value: 'bad', upper: '8' }, 'number')).toBe(false);
  expect(matchesReportRow(['May 20, 2026', 25], [{ column: 0, kind: 'date', operator: 'between', value: '2026-05-01', upper: '2026-05-31' }, { column: 1, kind: 'number', operator: 'between', value: '20', upper: '30' }])).toBe(true);
});

it('filters the whole dataset before paging and exposes the same criteria for exports', () => {
  const rows = [{ qty: 1, alert: 'Low stock' }, { qty: 30, alert: 'Healthy' }, { qty: 50, alert: 'Healthy' }];
  const reset = vi.fn();
  function Table() {
    const filters = useTableColumnFilters<typeof rows[number]>([
      { label: 'Quantity', kind: 'number', value: row => row.qty },
      { label: 'Stock Alert', kind: 'select', value: row => row.alert },
    ], reset);
    const matching = rows.filter(filters.matches);
    return <><div>{filters.heading('Quantity', rows)}{filters.heading('Stock Alert', rows)}</div><output data-testid="page">{JSON.stringify(matching.slice(0, 1))}</output><output data-testid="all">{JSON.stringify(matching)}</output><output data-testid="filters">{JSON.stringify(filters.filters)}</output></>;
  }
  render(<Table />);
  fireEvent.click(screen.getByRole('button', { name: 'Filter Quantity' }));
  fireEvent.change(screen.getByLabelText('Quantity minimum'), { target: { value: '20' } });
  fireEvent.change(screen.getByLabelText('Quantity maximum'), { target: { value: '40' } });
  expect(screen.getByTestId('page')).toHaveTextContent('30');
  expect(screen.getByTestId('all')).not.toHaveTextContent('50');
  expect(screen.getByTestId('filters')).toHaveTextContent('Quantity (between)');
  expect(screen.getByTestId('filters')).toHaveTextContent('20 – 40');
  expect(reset).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole('button', { name: 'Clear filter' }));
  expect(screen.getByTestId('all')).toHaveTextContent('50');
  expect(screen.getByTestId('filters')).toHaveTextContent('[]');
});
