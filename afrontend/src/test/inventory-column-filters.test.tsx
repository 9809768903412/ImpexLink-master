import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import InventoryPage from '@/pages/admin/Inventory';
import { apiClient } from '@/api/client';

vi.mock('@/api/client', () => ({ apiClient: { get: vi.fn() } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: '1', role: 'admin', roles: ['admin'] } }) }));
vi.mock('@/hooks/use-resource', () => ({ useResource: () => ({ data: [], reload: vi.fn() }) }));
vi.mock('@/hooks/cache', () => ({ getCache: () => undefined, setCache: vi.fn() }));
vi.mock('@/components/TableExportMenu', () => ({ default: ({ title, allRows, filters }: { title: string; allRows: unknown; filters: unknown }) => <output data-testid={`export-${title}`}>{JSON.stringify({ allRows, filters })}</output> }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it('filters quantity, stock alert and date added before paging and exporting', async () => {
  const rows = Array.from({ length: 12 }, (_, index) => ({ id: String(index + 1), name: `Item ${index + 1}`, category: 'Tools', unit: 'Pieces', unitPrice: 100, qtyOnHand: index === 11 ? 35 : 5, minStock: 10, status: 'AVAILABLE', createdAt: index === 11 ? '2026-05-20T00:00:00Z' : '2024-01-01T00:00:00Z' }));
  vi.mocked(apiClient.get).mockResolvedValue({ data: rows } as never);
  render(<InventoryPage />);
  await waitFor(() => expect(screen.getByText('Item 1')).toBeInTheDocument());
  expect(screen.queryByText('Item 12')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Filter Quantity' }));
  fireEvent.change(screen.getByLabelText('Quantity minimum'), { target: { value: '30' } });
  fireEvent.change(screen.getByLabelText('Quantity maximum'), { target: { value: '40' } });
  expect(screen.getByText('Item 12')).toBeInTheDocument();
  expect(screen.queryByText('Item 1')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Filter Stock Alert' }));
  fireEvent.change(screen.getByLabelText('Stock Alert value'), { target: { value: 'Healthy' } });
  fireEvent.click(screen.getByRole('button', { name: 'Filter Date Added' }));
  fireEvent.change(screen.getByLabelText('Date Added minimum'), { target: { value: '2026-05-01' } });
  fireEvent.change(screen.getByLabelText('Date Added maximum'), { target: { value: '2026-05-31' } });
  expect(screen.getByTestId('export-Inventory')).toHaveTextContent('Item 12');
  expect(screen.getByTestId('export-Inventory')).toHaveTextContent('Quantity (between)');
  expect(screen.getByTestId('export-Inventory')).toHaveTextContent('Stock Alert (equals)');
  expect(screen.getByTestId('export-Inventory')).toHaveTextContent('Date Added (between)');
  expect(screen.queryByText('Filter columns')).not.toBeInTheDocument();
});
