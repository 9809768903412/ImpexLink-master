import { escapePrintHtml } from './tableExport';

export type ProjectReportSection = { title: string; records: Record<string, unknown>[]; unavailable?: boolean };
export const projectFieldLabel = (key: string) => key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());

function formattedValue(value: unknown, key: string) {
  if (typeof value === 'number') {
    const money = /price|amount|cost|subtotal|total|vat|value/i.test(key) && !/quantity|count|days|rate/i.test(key);
    return money ? `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : value.toLocaleString('en-PH', { maximumFractionDigits: 6 });
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(T|$)/.test(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toLocaleString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: '2-digit', ...(value.includes('T') ? { hour: '2-digit', minute: '2-digit' } : {}) });
  }
  return String(value);
}

// Scalar fields share a compact grid; nested line items become one row per item.
export function projectValueHtml(value: unknown, key = ''): string {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) {
    if (!value.length) return 'None recorded';
    if (value.every(entry => entry && typeof entry === 'object' && !Array.isArray(entry))) {
      const keys = [...new Set(value.flatMap(entry => Object.keys(entry)))];
      return `<table class="project-lines"><thead><tr>${keys.map(field => `<th>${escapePrintHtml(projectFieldLabel(field))}</th>`).join('')}</tr></thead><tbody>${value.map(entry => `<tr>${keys.map(field => `<td>${projectValueHtml(entry[field], field)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    }
    return value.map(entry => projectValueHtml(entry, key)).join(', ');
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value);
    const scalar = entries.filter(([, entry]) => entry === null || typeof entry !== 'object');
    const nested = entries.filter(([, entry]) => entry !== null && typeof entry === 'object');
    return `<div class="project-fields">${scalar.map(([field, entry]) => `<div class="project-field"><strong>${escapePrintHtml(projectFieldLabel(field))}:</strong> ${projectValueHtml(entry, field)}</div>`).join('')}</div>${nested.map(([field, entry]) => `<div class="project-nested"><h3>${escapePrintHtml(projectFieldLabel(field))}</h3>${projectValueHtml(entry, field)}</div>`).join('')}`;
  }
  return escapePrintHtml(formattedValue(value, key));
}

export function buildProjectReportHtml(name: string, sections: ProjectReportSection[]) {
  return `<style>
    @page { size: A4; margin: 10mm; }
    body { font-size: 9pt; }
    .header { padding-bottom: 6px; margin-bottom: 8px; gap: 8px; }
    .company { font-size: 8pt; line-height: 1.15; }
    .company-name { font-size: 9pt; }
    .company-meta { margin-top: 1px; }
    .brand-logo.impex { width: 60px; height: 38px; padding: 2px; }
    .brand-logo.thortex { width: 90px; height: 38px; padding: 2px; }
    h1 { font-size: 15pt; margin: 4px 0; }
    h2 { font-size: 11pt; margin: 10px 0 4px; border-bottom: 1px solid #aaa; padding-bottom: 3px; break-after: avoid; }
    h3 { font-size: 9pt; margin: 4px 0; break-after: avoid; }
    .meta { font-size: 8pt; margin: 3px 0; }
    .project-fields { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 3px 12px; }
    .project-field { line-height: 1.3; overflow-wrap: anywhere; break-inside: avoid; }
    .project-record { margin: 5px 0; padding-bottom: 5px; border-bottom: 1px solid #ddd; }
    .project-record:last-child { border-bottom: 0; }
    .project-lines { font-size: 8pt; margin-top: 3px; table-layout: fixed; }
    .project-lines th, .project-lines td { padding: 3px 4px; overflow-wrap: anywhere; vertical-align: top; }
    .project-nested { margin: 4px 0; }
    section, .project-record, .project-nested { break-inside: auto; }
    .footer { font-size: 8pt; margin-top: 6px; padding-top: 4px; }
  </style><h1>Project report: ${escapePrintHtml(name)}</h1><p class="meta">All dates · Complete accessible project records · Generated times shown in Philippine time</p>${sections.map(section => `<section><h2>${escapePrintHtml(section.title)}${section.unavailable ? '' : ` (${section.records.length})`}</h2>${section.unavailable ? '<p class="meta">Not accessible to your role.</p>' : section.records.length ? section.records.map((record, index) => `<div class="project-record">${section.records.length > 1 ? `<h3>${escapePrintHtml(String(record.orderNumber || record.poNumber || record.drNumber || record.requestNumber || record.referenceNumber || `Record ${index + 1}`))}</h3>` : ''}${projectValueHtml(record)}</div>`).join('') : '<p class="meta">None recorded.</p>'}</section>`).join('')}`;
}
