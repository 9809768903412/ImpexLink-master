import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import InventoryUsageCharts from '@/components/InventoryUsageCharts';
vi.mock('recharts', async () => {
  const actual = await vi.importActual<object>('recharts');
  return { ...actual, ResponsiveContainer: () => null };
});
it('switches display without inventing or smoothing recorded quantities', () => {
  const products = [{ key: 'a', name: 'Thortex A', color: '#c98543' }];
  const months = [{ month: 'Jan 26', totalUsage: 2, 'Thortex A': 2 }, { month: 'Feb 26', totalUsage: 17, 'Thortex A': 17 }];
  render(<InventoryUsageCharts products={products} months={months} />);
  expect(screen.getByText('19')).toBeInTheDocument();
  const control = screen.getByLabelText('Usage chart display');
  for (const view of ['line', 'area', 'heatmap']) fireEvent.change(control, { target: { value: view } });
  expect(screen.getByTitle('Thortex A · Jan 26: 2 packages')).toHaveTextContent('2');
  expect(screen.getByTitle('Thortex A · Feb 26: 17 packages')).toHaveTextContent('17');
  expect(months[0].totalUsage).toBe(2);
});
