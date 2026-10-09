import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { loadTableRows } from '@/utils/loadTableRows';
import { buildProjectReportHtml, type ProjectReportSection, type ProjectReportOptions } from '@/utils/projectReport';
import { printHtml } from '@/utils/print';
import type { Project } from '@/types';

type RecordRow = Record<string, unknown>;
const sameId = (left: unknown, right: unknown) => left != null && right != null && String(left) === String(right);

export default function ProjectExportButton({ project }: { project: Project }) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ProjectReportOptions['mode']>('summary');
  const tableNames = ['Orders and materials', 'Purchase orders and items', 'Deliveries and GPS', 'Payments', 'Material requests', 'Project forms'];
  const [tables, setTables] = useState(tableNames);
  const [pageSize, setPageSize] = useState(10);
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
      printHtml(`Project: ${project.name}`, buildProjectReportHtml(project.name, sections, { mode, tables, pageSize }));
      setOpen(false);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Project export failed', description: 'Could not load the complete project report. Please retry; no incomplete report was printed.' });
    } finally { setBusy(false); }
  };
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button variant="outline">Export / Print</Button></DialogTrigger>
    <DialogContent><DialogHeader><DialogTitle>Export project</DialogTitle><DialogDescription>Choose the amount of detail to print. All dates are included.</DialogDescription></DialogHeader>
    <label className="grid gap-2 text-sm">Report content
      <select aria-label="Report content" className="h-10 rounded-md border bg-background px-3" value={mode} onChange={e => setMode(e.target.value as ProjectReportOptions['mode'])}>
        <option value="summary">Project summary only</option><option value="tables">Selected tables — all rows</option><option value="first-page">Selected tables — first page only</option><option value="full">Full report — every detail</option>
      </select>
    </label>
    {(mode === 'tables' || mode === 'first-page') && <fieldset className="grid gap-2 text-sm"><legend className="mb-2 font-medium">Tables to include</legend>{tableNames.map(title => <label key={title} className="flex items-center gap-2"><input type="checkbox" checked={tables.includes(title)} onChange={e => setTables(current => e.target.checked ? [...current, title] : current.filter(value => value !== title))} />{title}</label>)}<p className="text-xs text-muted-foreground">Project and client details are included. Tables contain key columns, not full record details.</p></fieldset>}
    {mode === 'first-page' && <label className="grid gap-2 text-sm">Rows per table page<select aria-label="Rows per table page" className="h-10 rounded-md border bg-background px-3" value={pageSize} onChange={e => setPageSize(Number(e.target.value))}>{[5, 10, 20].map(size => <option key={size} value={size}>{size} rows</option>)}</select><span className="text-xs text-muted-foreground">First data page of each selected table, not a guarantee of one printed sheet. Omitted rows are labeled.</span></label>}
    <Button disabled={busy || ((mode === 'tables' || mode === 'first-page') && !tables.length)} onClick={exportProject}>
    {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
    {busy ? 'Preparing report…' : 'Open print view'}
  </Button></DialogContent></Dialog>;
}
