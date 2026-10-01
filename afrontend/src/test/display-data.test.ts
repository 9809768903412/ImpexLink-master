import { describe, expect, it } from 'vitest';
import { cleanDisplayPrefixes } from '@/lib/display-data';

describe('display prefix cleanup', () => {
  it('cleans nested labels without changing original data, IDs, source flags or keys', () => {
    const original = { source: 'simulated', id: 'SIM-H1-202601-1', rows: [{ name: '[SIMULATED] Thortex Epoxy PIE (3 kgs)', details: '[SIMULATED:HISTORY-V1] Warehouse: stock issued', url: '/uploads/simulated-history/proof.txt' }], '[SIMULATED] key': 5 };
    expect(cleanDisplayPrefixes(original)).toEqual({ ...original, rows: [{ name: 'Thortex Epoxy PIE (3 kgs)', details: 'Warehouse: stock issued', url: '/uploads/simulated-history/proof.txt' }] });
    expect(original.rows[0].name).toContain('[SIMULATED]');
  });
  it('leaves ordinary data and binary files untouched', () => {
    const blob = new Blob(['[SIMULATED] document']);
    expect(cleanDisplayPrefixes(blob)).toBe(blob);
    expect(cleanDisplayPrefixes({ amount: 123, name: 'Actual supplier', date: null })).toEqual({ amount: 123, name: 'Actual supplier', date: null });
  });
  it('keeps adjustment operation markers out of displayed audit text', () => {
    expect(cleanDisplayPrefixes('[SIMULATED:HISTORY-V1] [STOCK-ADD:HISTORY-V1:2026-10-02:20] Requested adjustment +20 packages')).toBe('Requested adjustment +20 packages');
  });
});
