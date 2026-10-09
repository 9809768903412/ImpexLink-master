import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { loadTableRows } from '@/utils/loadTableRows';
import { buildProjectReportHtml, type ProjectReportSection } from '@/utils/projectReport';
import { printHtml } from '@/utils/print';
import type { Project } from '@/types';

type RecordRow = Record<string, unknown>;
const sameId = (left: unknown, right: unknown) => left != null && right != null && String(left) === String(right);

export default function ProjectExportButton({ project }: { project: Project }) {
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const exportProject = async () => {
    setBusy(true);
    try {
      const sources = [
        ['Client', '/clients'], ['Orders and materials', '/orders'],
        ['Purchase orders and items', '/purchase-orders'], ['Deliveries and GPS', '/deliveries'],
        ['Payments', '/payments'], ['Material requests', '/material-requests'], ['Project forms', '/project-forms'],
      ];
      const loaded = await Promise.all(sources.map(async ([title, url]) => {
        try {
          return { title, records: (await loadTableRows<RecordRow>(url, url === '/project-forms' ? { projectId: project.id } : {})).data };
        } catch (error) {
          if ((error as { response?: { status?: number } }).response?.status === 403) return { title, records: [], unavailable: true };
          throw error;
        }
      }));
      const orderIds = loaded[1].records.filter(row => sameId(row.projectId, project.id)).map(row => row.id);
      const poIds = loaded[2].records.filter(row => sameId(row.projectId, project.id)).map(row => row.id);
      const sections: ProjectReportSection[] = [{ title: 'Project details', records: [project as unknown as RecordRow] }, ...loaded.map((section, index) => ({
        ...section,
        records: section.records.filter(row => index === 0 ? sameId(row.id, project.clientId)
          : index === 3 ? orderIds.some(id => sameId(row.orderId, id))
          : index === 4 ? orderIds.some(id => sameId(row.clientOrderId, id)) || poIds.some(id => sameId(row.supplierOrderId, id))
          : sameId(row.projectId, project.id)),
      }))];
      printHtml(`Project: ${project.name}`, buildProjectReportHtml(project.name, sections));
    } catch (error) {
      toast({ variant: 'destructive', title: 'Project export failed', description: 'Could not load the complete project report. Please retry; no incomplete report was printed.' });
    } finally { setBusy(false); }
  };
  return <Button variant="outline" disabled={busy} onClick={exportProject}>
    {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
    {busy ? 'Preparing complete report…' : 'Export / Print'}
  </Button>;
}
