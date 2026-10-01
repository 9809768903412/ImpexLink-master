import { describe, expect, it } from 'vitest';
import { buildProductUsageTotals } from '@/components/InventoryUsageCharts';

describe('recorded product usage comparison', () => {
  it('ranks by exact recorded totals without smoothing spikes or modifying inputs', () => {
    const products = [{ key: 'a', name: 'Thortex Epoxy PIE (3 kgs)', color: '#00f' }, { key: 'b', name: 'Thortex Cerami-Tech EG (1kg)', color: '#a60' }];
    const months = [{ month: 'Apr 26', totalUsage: 10, [products[0].name]: 5, [products[1].name]: 5 }, { month: 'May 26', totalUsage: 95, [products[0].name]: 5, [products[1].name]: 90 }];
    const result = buildProductUsageTotals(months, products);
    expect(result.map((item) => [item.key, item.total])).toEqual([['b', 95], ['a', 10]]);
    expect(result[0].name).toBe(products[1].name);
    expect(result[0].label).toBe('Cerami-Tech EG (1kg)');
    expect(months[1].totalUsage).toBe(95);
    expect(products[0].key).toBe('a');
  });
  it('includes products with no recorded issues as zero', () => {
    expect(buildProductUsageTotals([], [{ key: 'a', name: 'Thortex Epoxy PIE (3 kgs)', color: '#00f' }])[0].total).toBe(0);
  });
});
