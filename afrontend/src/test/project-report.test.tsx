import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import ProjectExportButton from '@/components/ProjectExportButton';
import { buildProjectReportHtml } from '@/utils/projectReport';

const mocks = vi.hoisted(() => ({ load: vi.fn(), print: vi.fn(), toast: vi.fn() }));
vi.mock('@/utils/loadTableRows', () => ({ loadTableRows: mocks.load }));
vi.mock('@/utils/print', () => ({ printHtml: mocks.print }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
const project = { id: '1', name: 'Site <A>', clientId: '2', clientName: 'Client', status: 'active' as const, startDate: '2026-01-01', assignedPmName: 'PM' };
beforeEach(() => vi.clearAllMocks());

it('prints all linked records and nested items, excluding unrelated projects', async () => {
  const data: Record<string, unknown[]> = {
    '/clients': [{ id: '2', email: 'client@example.test' }],
    '/orders': [{ id: '3', projectId: '1', orderNumber: 'ORDER-3', items: [{ itemName: 'Epoxy', quantity: 7 }] }, { id: '4', projectId: '99', orderNumber: 'OTHER' }],
    '/purchase-orders': [{ id: '5', projectId: '1', poNumber: 'PO-5' }],
    '/deliveries': [{ id: '6', orderId: '3', drNumber: 'DR-6', latestLocation: { lat: 14.5 } }, { id: '7', orderId: '4', drNumber: 'OTHER-DR' }],
    '/payments': [{ clientOrderId: '3', referenceNumber: 'PAY-3' }, { supplierOrderId: '5', referenceNumber: 'PAY-5' }],
    '/material-requests': [{ projectId: '1', purpose: 'Repairs' }],
    '/project-forms': [{ projectId: '1', thortexProducts: [{ description: 'Coating', qty: 5 }] }],
  };
  mocks.load.mockImplementation(async (url: string) => ({ data: data[url] }));
  render(<ProjectExportButton project={project} />);
  fireEvent.click(screen.getByText('Export / Print'));
  fireEvent.change(screen.getByLabelText('Report content'), { target: { value: 'full' } });
  fireEvent.click(screen.getByText('Open print view'));
  await waitFor(() => expect(mocks.print).toHaveBeenCalledOnce());
  const html = mocks.print.mock.calls[0][1];
  for (const value of ['PM', 'ORDER-3', 'Epoxy', 'DR-6', '14.5', 'PAY-3', 'PAY-5', 'Repairs', 'Coating', 'client@example.test']) expect(html).toContain(value);
  expect(html).not.toContain('OTHER');
  expect(html).toContain('Site &lt;A&gt;');
});

it('does not silently print incomplete reports on a failed request', async () => {
  mocks.load.mockRejectedValue(new Error('Offline'));
  render(<ProjectExportButton project={project} />);
  fireEvent.click(screen.getByText('Export / Print'));
  fireEvent.click(screen.getByText('Open print view'));
  await waitFor(() => expect(mocks.toast).toHaveBeenCalled());
  expect(mocks.print).not.toHaveBeenCalled();
});

it('marks inaccessible sections and escapes nested values', () => {
  const html = buildProjectReportHtml('Project', [{ title: 'Payments', records: [], unavailable: true }, { title: 'Forms', records: [{ notes: '<script>bad</script>' }] }]);
  expect(html).toContain('Not accessible to your role');
  expect(html).not.toContain('<script>');
});

it('uses compact field grids and item rows with formatted money', () => {
  const html = buildProjectReportHtml('Project', [{ title: 'Project details', records: [{ totalOrderValue: 3231681.5999999996, items: [{ itemName: 'Epoxy', quantity: 3, unitPrice: 1200 }, { itemName: 'Paste', quantity: 4, unitPrice: 50 }] }] }]);
  expect(html).toContain('₱3,231,681.60');
  expect(html).toContain('class="project-fields"');
  expect(html).toContain('class="project-lines"');
  expect(html).not.toContain('<h3>Item 1</h3>');
  expect(html).not.toContain('3231681.5999999996');
});

it('limits each selected table to its first data page and labels omissions', () => {
  const sections = [{ title: 'Project details', records: [{ name: 'Site' }] }, { title: 'Client', records: [] }, { title: 'Orders and materials', records: Array.from({ length: 12 }, (_, i) => ({ orderNumber: `ORDER-${i}`, total: 100 })) }, { title: 'Payments', records: [{ referenceNumber: 'PAYMENT-HIDDEN' }] }];
  const html = buildProjectReportHtml('Site', sections, { mode: 'first-page', tables: ['Orders and materials'], pageSize: 5 });
  expect(html).toContain('Showing 5 of 12');
  expect(html).toContain('remaining records omitted');
  expect(html).toContain('ORDER-4');
  expect(html).not.toContain('ORDER-5');
  expect(html).not.toContain('PAYMENT-HIDDEN');
  const summary = buildProjectReportHtml('Site', sections, { mode: 'summary' });
  expect(summary).not.toContain('ORDER-0');
  expect(summary).toContain('Project summary only');
});
