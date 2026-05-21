const STATUS_BADGE_CLASSES: Record<string, string> = {
  pending: 'border-amber-200 bg-amber-50 text-amber-800',
  unpaid: 'border-amber-200 bg-amber-50 text-amber-800',
  draft: 'border-slate-200 bg-slate-50 text-slate-700',
  approved: 'border-blue-200 bg-blue-50 text-blue-800',
  verified: 'border-blue-200 bg-blue-50 text-blue-800',
  received: 'border-blue-200 bg-blue-50 text-blue-800',
  'in-transit': 'border-blue-200 bg-blue-50 text-blue-800',
  processing: 'border-indigo-200 bg-indigo-50 text-indigo-800',
  ordered: 'border-indigo-200 bg-indigo-50 text-indigo-800',
  'ready-for-delivery': 'border-cyan-200 bg-cyan-50 text-cyan-800',
  active: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  completed: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  delivered: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  paid: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  fulfilled: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  'in-stock': 'border-emerald-200 bg-emerald-50 text-emerald-800',
  delayed: 'border-orange-200 bg-orange-50 text-orange-800',
  'on-hold': 'border-orange-200 bg-orange-50 text-orange-800',
  'return-pending': 'border-orange-200 bg-orange-50 text-orange-800',
  'low-stock': 'border-orange-200 bg-orange-50 text-orange-800',
  rejected: 'border-red-200 bg-red-50 text-red-800',
  cancelled: 'border-red-200 bg-red-50 text-red-800',
  failed: 'border-red-200 bg-red-50 text-red-800',
  'out-of-stock': 'border-red-200 bg-red-50 text-red-800',
  returned: 'border-red-200 bg-red-50 text-red-800',
  'return-rejected': 'border-slate-200 bg-slate-50 text-slate-700',
};

export function normalizeStatusKey(status?: string | null) {
  return String(status || '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(/\s+/g, '-');
}

export function statusBadgeClass(status?: string | null) {
  return STATUS_BADGE_CLASSES[normalizeStatusKey(status)] || 'border-slate-200 bg-slate-50 text-slate-700';
}
