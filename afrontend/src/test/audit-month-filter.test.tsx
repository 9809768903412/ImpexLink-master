import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AuditLogsPage from '@/pages/admin/AuditLogs';
import { apiClient } from '@/api/client';

vi.mock('@/api/client', () => ({ apiClient: { get: vi.fn() } }));
vi.mock('@/hooks/use-resource', () => ({ useResource: () => ({ data: [] }) }));
vi.mock('@/hooks/cache', () => ({ getCache: () => undefined, setCache: vi.fn() }));
vi.mock('@/components/TableExportMenu', () => ({ default: ({ filters }: { filters: unknown }) => <span data-testid="audit-export">{JSON.stringify(filters)}</span> }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it('filters audit pages by explicit From/To dates and keeps the range in exports', async () => {
  vi.mocked(apiClient.get).mockResolvedValue({ data: { data: [], total: 0 } } as never);
  render(<AuditLogsPage />);
  expect(screen.queryByLabelText('Audit month')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Audit date from'), { target: { value: '2026-09-01' } });
  fireEvent.change(screen.getByLabelText('Audit date to'), { target: { value: '2026-09-30' } });
  const from = new Date(2026, 8, 1);
  const to = new Date(2026, 8, 30, 23, 59, 59, 999);
  await waitFor(() => {
    const call = vi.mocked(apiClient.get).mock.calls.find((entry) => entry[1]?.params.dateFrom && entry[1]?.params.dateTo);
    expect(call).toBeDefined();
    const params = call![1]!.params;
    expect(params.page).toBe(1);
    expect(params.dateFrom).toBe(from.toISOString());
    expect(params.dateTo).toBe(to.toISOString());
  });
  expect(screen.getByTestId('audit-export')).toHaveTextContent('From date');
  fireEvent.click(screen.getByRole('button', { name: 'Clear Filters' }));
  await waitFor(() => expect(vi.mocked(apiClient.get).mock.lastCall?.[1]?.params.dateFrom).toBeUndefined());
});
