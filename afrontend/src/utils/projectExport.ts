import type { Project } from '@/types';
import type { ExportColumn } from '@/utils/tableExport';

export const projectExportColumns: ExportColumn<Project>[] = [
  { header: 'Project', value: (project) => project.name },
  { header: 'Client', value: (project) => project.clientName },
  { header: 'Status', value: (project) => project.status },
  { header: 'Location', value: (project) => project.location || '' },
  { header: 'Project manager', value: (project) => project.assignedPmName || '' },
  { header: 'Start date', value: (project) => project.startDate || '' },
  { header: 'End date', value: (project) => project.endDate || '' },
];
