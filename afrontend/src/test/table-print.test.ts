import { afterEach, describe, expect, it, vi } from 'vitest';
import { printTableReport } from '@/utils/print';

describe('paginated table printing', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('keeps three six-row source pages on separate sheets, including a partial last page', () => {
    vi.useFakeTimers();
    vi.spyOn(HTMLIFrameElement.prototype, 'contentWindow', 'get').mockReturnValue({
      document: document.implementation.createHTMLDocument(),
      focus: vi.fn(),
    } as unknown as Window);

    printTableReport({
      title: 'Orders',
      sourcePages: 'Pages 2-4 of 4',
      sourceStartPage: 2,
      sourceTotalPages: 4,
      rowsPerPage: 6,
      headers: ['Order'],
      rows: Array.from({ length: 14 }, (_, index) => [`Order ${index + 7}`]),
    });

    const doc = document.querySelector('iframe')!.contentWindow!.document;
    const sheets = [...doc.querySelectorAll('.print-sheet')];
    expect(sheets.map((sheet) => sheet.querySelectorAll('tbody tr').length)).toEqual([6, 6, 2]);
    expect(sheets.map((sheet) => sheet.querySelector('.print-sheet-footer')!.textContent))
      .toEqual([
        expect.stringContaining('Source page 2 of 4 · Export sheet 1 of 3'),
        expect.stringContaining('Source page 3 of 4 · Export sheet 2 of 3'),
        expect.stringContaining('Source page 4 of 4 · Export sheet 3 of 3'),
      ]);
    expect(sheets[0].querySelector('tbody')!.textContent).not.toContain('Order 13');
    expect(sheets[1].querySelector('tbody')!.textContent).toContain('Order 13');
    expect(doc.querySelector('style')!.textContent).toContain('break-after: page');
  });
});
