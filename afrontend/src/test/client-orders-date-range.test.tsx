import { afterEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ClientOrdersPage from '@/pages/admin/ClientOrders';
import { apiClient } from '@/api/client';

vi.mock('@/api/client', () => ({ apiClient: { get: vi.fn() } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: '1', role: 'admin', roles: ['admin'] } }) }));
vi.mock('@/hooks/use-resource', () => ({ useResource: () => ({ data: [], setData: vi.fn() }) }));
vi.mock('@/hooks/cache', () => ({ getCache: () => undefined, setCache: vi.fn() }));
vi.mock('@/components/TableExportMenu', () => ({ default: ({ filters, allRows }: { filters: unknown; allRows: unknown[] }) => <span data-testid="orders-export">{JSON.stringify({ filters, count: allRows.length })}</span> }));
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

it('requests a whole calendar month and preserves it in the order export', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 5));
  vi.mocked(apiClient.get).mockResolvedValue({ data: [] } as never);
  render(<MemoryRouter><ClientOrdersPage /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('Order date from'), { target: { value: '2026-09-01' } });
  fireEvent.change(screen.getByLabelText('Order date to'), { target: { value: '2026-09-30' } });
  await waitFor(() => {
    const call = vi.mocked(apiClient.get).mock.calls.find((entry) => entry[0] === '/orders' && entry[1]?.params.dateFrom && entry[1]?.params.dateTo);
    expect(call?.[1]?.params.dateFrom).toBe(new Date(2026, 8, 1).toISOString());
    expect(call?.[1]?.params.dateTo).toBe(new Date(2026, 8, 30, 23, 59, 59, 999).toISOString());
    expect(call?.[1]?.params.pageSize).toBeUndefined();
  });
  expect(screen.getByTestId('orders-export')).toHaveTextContent('2026-09-01');
  expect(screen.getByTestId('orders-export')).toHaveTextContent('2026-09-30');
});
