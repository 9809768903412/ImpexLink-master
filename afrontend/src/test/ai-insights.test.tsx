import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import AIInsightsPage from '@/pages/admin/AIInsights';
import { apiClient } from '@/api/client';

vi.mock('@/api/client', () => ({ apiClient: { get: vi.fn(), post: vi.fn() } }));
vi.mock('@/components/TableExportMenu', () => ({ default: ({ filters }: { filters: unknown }) => <span data-testid="export-filters">{JSON.stringify(filters)}</span> }));
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  LineChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AreaChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Line: () => null, Area: () => null,
  Bar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Cell: () => null, LabelList: () => null,
  CartesianGrid: () => null, XAxis: () => null, YAxis: () => null, Tooltip: () => null,
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const queryClient = () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
const mount = () => render(<QueryClientProvider client={queryClient()}><MemoryRouter><AIInsightsPage /></MemoryRouter></QueryClientProvider>);

describe('database-backed AI Insights', () => {
  it('renders API usage and coverage; changing dates requests a new selection', async () => {
    vi.mocked(apiClient.get).mockImplementation(async (_path, config) => ({ data: {
      enabled: false, provider: 'local-rules', model: 'test', summary: 'Database summary', recommendations: [], warehouseRisks: [], reorderSuggestions: [],
      logisticsSnapshot: { activeRoutes: 0, stopsToday: 0, onTimeRate: null, dispatches: [], recommendation: 'Review' },
      patternItems: [{ key: 'epoxy-pie-3', name: 'Thortex Epoxy PIE (3 kgs)', color: '#2563eb' }], productOptions: [],
      usageTrends: [{ month: 'Jan 26', totalUsage: 7, 'Thortex Epoxy PIE (3 kgs)': 7 }],
      dataCoverage: { ...config?.params, issueCount: 1, activeMonths: 1, simulatedIssueCount: 0, firstIssue: '2026-01-03', lastIssue: '2026-01-03', existingMeans: 'Existing records may include earlier tests.' },
    } }) as never);
    mount();
    await screen.findByText('Database summary');
    expect(screen.getByRole('region', { name: 'Monthly usage chart' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Product usage comparison chart' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Data source')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Thortex product')).not.toBeInTheDocument();
    expect(screen.queryByText(/recorded stock issues ·/)).not.toBeInTheDocument();
    expect(screen.getAllByText('Thortex Epoxy PIE (3 kgs)').length).toBeGreaterThan(0);
    expect(screen.queryByText(/24-Month Usage Pattern/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2026-01-01' } });
    await waitFor(() => expect(vi.mocked(apiClient.get).mock.calls.some((call) => call[1]?.params.from === '2026-01-01')).toBe(true));
    await waitFor(() => {
      for (const menu of screen.getAllByTestId('export-filters')) {
        expect(menu.textContent).toContain('2026-01-01');
        expect(menu.textContent).toContain('"label":"To"');
        expect(menu.textContent).not.toContain('Data source');
      }
    });
  });
  it('shows a failed database read instead of healthy mock widgets', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('Database unavailable'));
    mount();
    expect(await screen.findByRole('alert')).toHaveTextContent('Database unavailable');
    expect(screen.queryByText('Logistics Snapshot')).not.toBeInTheDocument();
    expect(screen.queryByText('Inventory stable')).not.toBeInTheDocument();
  });
});
