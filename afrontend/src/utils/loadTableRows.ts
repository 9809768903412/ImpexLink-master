import { apiClient } from '@/api/client';

// Column filters must run before pagination, not just against the visible page.
export async function loadTableRows<T>(url: string, params: Record<string, unknown> = {}, signal?: AbortSignal) {
  const rows: T[] = [];
  let page = 1;
  for (;;) {
    const response = await apiClient.get(url, { params: { ...params, page, pageSize: 100 }, ...(signal ? { signal } : {}) });
    const payload = response.data;
    const batch: T[] = Array.isArray(payload) ? payload : payload?.data;
    if (!Array.isArray(batch)) throw new Error('Invalid table response');
    rows.push(...batch);
    const total = Number(payload?.total ?? rows.length);
    if (Array.isArray(payload) || rows.length >= total) return { data: rows, total: rows.length };
    if (!batch.length || page >= 1000) throw new Error('Could not load complete table for filtering');
    page++;
  }
}
