import { escapePrintHtml } from './tableExport';

export type ProjectReportSection = { title: string; records: Record<string, unknown>[]; unavailable?: boolean };
export const projectFieldLabel = (key: string) => key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());

// Keep nested items, forms and GPS details readable rather than printing [object Object].
export function projectValueHtml(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.length ? value.map((entry, index) => `<h3>Item ${index + 1}</h3>${projectValueHtml(entry)}`).join('') : 'None recorded';
  if (typeof value === 'object') return `<table><tbody>${Object.entries(value).map(([key, entry]) => `<tr><th style="width:28%">${escapePrintHtml(projectFieldLabel(key))}</th><td style="overflow-wrap:anywhere">${projectValueHtml(entry)}</td></tr>`).join('')}</tbody></table>`;
  return escapePrintHtml(String(value));
}

export function buildProjectReportHtml(name: string, sections: ProjectReportSection[]) {
  return `<h1>Project report: ${escapePrintHtml(name)}</h1><p class="meta">Complete project record · All dates · Not limited by table filters or pagination. Only records accessible to the signed-in user are included.</p>${sections.map(section => `<section><h2>${escapePrintHtml(section.title)} (${section.records.length})</h2>${section.unavailable ? '<p>Not accessible to your role.</p>' : section.records.length ? section.records.map((record, index) => `<h3>Record ${index + 1}</h3>${projectValueHtml(record)}`).join('') : '<p>None recorded.</p>'}</section>`).join('')}`;
}
