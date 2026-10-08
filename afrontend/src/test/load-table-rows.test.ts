import { afterEach, expect, it, vi } from 'vitest';
import { apiClient } from '@/api/client';
import { loadTableRows } from '@/utils/loadTableRows';

vi.mock('@/api/client', () => ({ apiClient: { get: vi.fn() } }));
afterEach(() => vi.clearAllMocks());

it('loads every server page while preserving the existing query scope', async () => {
  vi.mocked(apiClient.get).mockResolvedValueOnce({ data: { data: [{ id: 1 }, { id: 2 }], total: 3 } } as never).mockResolvedValueOnce({ data: { data: [{ id: 3 }], total: 3 } } as never);
  const result = await loadTableRows('/orders', { q: 'project', status: 'DELIVERED', page: 9 });
  expect(result).toEqual({ data: [{ id: 1 }, { id: 2 }, { id: 3 }], total: 3 });
  expect(apiClient.get).toHaveBeenNthCalledWith(1, '/orders', { params: { q: 'project', status: 'DELIVERED', page: 1, pageSize: 100 } });
  expect(apiClient.get).toHaveBeenNthCalledWith(2, '/orders', { params: { q: 'project', status: 'DELIVERED', page: 2, pageSize: 100 } });
});

it('refuses incomplete results instead of silently exporting a partial dataset', async () => {
  vi.mocked(apiClient.get).mockResolvedValue({ data: { data: [], total: 3 } } as never);
  await expect(loadTableRows('/audit-logs')).rejects.toThrow('complete table');
});
