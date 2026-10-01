import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AuditLogsPage from '@/pages/admin/AuditLogs';
import { apiClient } from '@/api/client';

vi.mock('@/api/client', () => ({ apiClient: { get: vi.fn() } }));
vi.mock('@/hooks/use-resource', () => ({ useResource: () => ({ data: [] }) }));
vi.mock('@/hooks/cache', () => ({ getCache: () => undefined, setCache: vi.fn() }));
vi.mock('@/components/TableExportMenu', () => ({ default: ({ filters }: { filters: unknown }) => <span data-testid="audit-export">{JSON.stringify(filters)}</span> }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it('filters all audit pages by the selected month and keeps the month in exports', async () => {
  vi.mocked(apiClient.get).mockResolvedValue({ data: { data: [], total: 0 } } as never);
  render(<AuditLogsPage />);
  fireEvent.change(screen.getByLabelText('Audit month'), { target: { value: '2024-02' } });
  await waitFor(() => {
    const call = vi.mocked(apiClient.get).mock.calls.find((entry) => entry[1]?.params.dateFrom);
    expect(call).toBeDefined();
    const params = call![1]!.params;
    expect(params.page).toBe(1);
    expect(params.dateFrom).toBe(new Date(2024, 1, 1).toISOString());
    expect(params.dateTo).toBe(new Date(2024, 2, 1, 0, 0, 0, -1).toISOString());
  });
  expect(screen.getByTestId('audit-export')).toHaveTextContent('2024-02');
  fireEvent.click(screen.getByRole('button', { name: 'Clear Filters' }));
  expect(screen.getByLabelText('Audit month')).toHaveValue('');
  await waitFor(() => expect(vi.mocked(apiClient.get).mock.lastCall?.[1]?.params.dateFrom).toBeUndefined());
});
