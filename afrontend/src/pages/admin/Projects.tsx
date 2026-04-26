import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Plus, Search, FolderKanban, MapPin, CalendarDays, Building2, FileText, Download } from 'lucide-react';
import type { Project, Client, Order, Delivery, User as UserType, ProjectForm, MaterialRequest } from '@/types';
import { toast } from '@/hooks/use-toast';
import { useResource } from '@/hooks/use-resource';
import { apiClient } from '@/api/client';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { useLocation } from 'react-router-dom';
import { VAT_RATE } from '@/lib/vat';
import { formatCurrency, formatNumber } from '@/lib/utils';
import PaginationNav from '@/components/PaginationNav';

const statusColors = {
  pending: 'bg-yellow-100 text-yellow-800',
  rejected: 'bg-red-100 text-red-800',
  active: 'bg-green-100 text-green-800',
  completed: 'bg-blue-100 text-blue-800',
  'on-hold': 'bg-yellow-100 text-yellow-800',
};

type ProjectFormSectionKey = 'thortexProducts' | 'consumableMaterials' | 'toolsEquipmentOthers';
type ProjectFormDraftLine = { qty: number; unit: string; description: string; productId?: string };
type ProjectFormDraft = {
  projectId: string;
  projectName: string;
  company: string;
  address: string;
  oRefNumber: string;
  poNumber: string;
  area: string;
  thortexProducts: ProjectFormDraftLine[];
  consumableMaterials: ProjectFormDraftLine[];
  toolsEquipmentOthers: ProjectFormDraftLine[];
  requestedBy: string;
  checkedBy: string;
};

const emptyProjectFormLine = (): ProjectFormDraftLine => ({ qty: 0, unit: '', description: '', productId: undefined });

const createEmptyProjectForm = (): ProjectFormDraft => ({
  projectId: '',
  projectName: '',
  company: '',
  address: '',
  oRefNumber: '',
  poNumber: '',
  area: '',
  thortexProducts: [emptyProjectFormLine()],
  consumableMaterials: [emptyProjectFormLine()],
  toolsEquipmentOthers: [emptyProjectFormLine()],
  requestedBy: '',
  checkedBy: '',
});

const mapProject = (project: any): Project => ({
  id: project.id?.toString?.() || project.projectId?.toString?.() || '',
  name: project.name || project.projectName || '',
  clientId: project.clientId?.toString?.() || null,
  clientName: project.clientName || project.client?.clientName || 'Unassigned',
  assignedPmId: project.assignedPmId?.toString?.() || null,
  assignedPmName: project.assignedPmName || project.assignedPm?.fullName || null,
  location: project.location || null,
  status: String(project.status || 'active').toLowerCase() as Project['status'],
  rejectionReason: project.rejectionReason || null,
  startDate: project.startDate
    ? typeof project.startDate === 'string'
      ? project.startDate
      : new Date(project.startDate).toISOString().split('T')[0]
    : '',
  endDate: project.endDate || undefined,
});

// TODO: Replace with real data
export default function ProjectsPage() {
  const { user } = useAuth();
  const location = useLocation();
  const roleInput = user?.roles?.length ? user.roles : user?.role;
  const isPresident = Array.isArray(roleInput) ? roleInput.includes('president') : roleInput === 'president';
  const isProjectManager = Array.isArray(roleInput) ? roleInput.includes('project_manager') : roleInput === 'project_manager';
  const isAdmin = Array.isArray(roleInput) ? roleInput.includes('admin') : roleInput === 'admin';
  const canCreateProject = isAdmin;
  const canCreateProjectForm =
    Array.isArray(roleInput)
      ? roleInput.some((r) => ['admin', 'project_manager', 'engineer'].includes(r))
      : ['admin', 'project_manager', 'engineer'].includes(roleInput || '');
  const canEditStatus =
    !isPresident &&
    (Array.isArray(roleInput)
      ? roleInput.some((r) => ['admin', 'project_manager'].includes(r))
      : ['admin', 'project_manager'].includes(roleInput || ''));
  const [sortKey, setSortKey] = useState<'projectName' | 'status' | 'startDate'>('projectName');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'all' | 'pending'>('all');
  const { data: projects, setData: setProjects, loading: projectsLoading } = useResource<Project[]>(
    '/projects',
    [],
    [sortKey, sortDir, searchTerm, statusFilter],
    15_000,
    {
      q: searchTerm || undefined,
      status: statusFilter !== 'all' ? statusFilter : undefined,
      sortBy: sortKey,
      sortDir,
    }
  );
  const { data: clients } = useResource<Client[]>('/clients', []);
  const { data: orders } = useResource<Order[]>('/orders', []);
  const { data: deliveries } = useResource<Delivery[]>('/deliveries', []);
  const { data: inventory } = useResource<any[]>('/inventory', []);
  const { data: materialRequests } = useResource<MaterialRequest[]>('/material-requests', []);
  const { data: users, reload: reloadUsers } = useResource<UserType[]>('/users', []);
  const { data: availableProjects } = useResource<Project[]>('/projects', [], [user?.id], 15_000, { picker: true });
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const { data: projectForms, setData: setProjectForms } = useResource<ProjectForm[]>(
    '/project-forms',
    [],
    [selectedProject?.id],
    15_000,
    { projectId: selectedProject?.id || undefined }
  );
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showProjectFormDialog, setShowProjectFormDialog] = useState(false);
  const [newProject, setNewProject] = useState({
    name: '',
    clientId: '',
    location: '',
    status: 'active' as const,
  });
  const [projectErrors, setProjectErrors] = useState<Record<string, string>>({});
  const [editProject, setEditProject] = useState({
    id: '',
    status: 'active' as Project['status'],
    startDate: '',
    location: '',
    rejectionReason: '',
    assignedPmId: 'unassigned',
  });
  const [editProjectErrors, setEditProjectErrors] = useState<Record<string, string>>({});
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Project | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState('');
  const [projectFormErrors, setProjectFormErrors] = useState<Record<string, string>>({});
  const [projectFormData, setProjectFormData] = useState(createEmptyProjectForm());
  const [projectFormDraftAvailable, setProjectFormDraftAvailable] = useState(false);
  const [projectItemsPage, setProjectItemsPage] = useState(1);
  const projectItemsPageSize = 5;
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const projectFormDraftKey = `project-form-draft:${user?.id || 'anon'}`;

  const scopedProjects = projects;

  const filteredProjects = scopedProjects.filter((project) => {
    const matchesSearch =
      project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      project.clientName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || project.status === statusFilter;
    return matchesSearch && matchesStatus;
  });
  const pendingProjects = filteredProjects.filter((project) => project.status === 'pending');
  const visibleProjects = activeTab === 'pending' ? pendingProjects : filteredProjects;
  const selectedProjectItems = selectedProject
    ? orders.filter((o) => o.projectId === selectedProject.id).flatMap((o) => o.items)
    : [];
  const selectedProjectOrders = selectedProject
    ? orders.filter((order) => order.projectId === selectedProject.id)
    : [];
  const totalProjectItemsPages = Math.max(1, Math.ceil(selectedProjectItems.length / projectItemsPageSize));
  const paginatedProjectItems = selectedProjectItems.slice(
    (projectItemsPage - 1) * projectItemsPageSize,
    projectItemsPage * projectItemsPageSize
  );
  const projectItemsStart = selectedProjectItems.length === 0 ? 0 : (projectItemsPage - 1) * projectItemsPageSize + 1;
  const projectItemsEnd = Math.min(projectItemsPage * projectItemsPageSize, selectedProjectItems.length);
  const projectItemsTotalCost = selectedProjectItems.reduce(
    (sum, item) =>
      sum +
      (typeof item.amount === 'number' && item.amount > 0 ? item.amount : item.quantity * item.unitPrice),
    0
  );

  const getProjectStats = (projectId: string) => {
    const projectOrders = orders.filter((o) => o.projectId === projectId);
    const projectDeliveries = deliveries.filter((d) =>
      projectOrders.some((o) => o.id === d.orderId)
    );
    const totalValue = projectOrders.reduce((sum, o) => sum + o.total, 0);
    return { orderCount: projectOrders.length, deliveryCount: projectDeliveries.length, totalValue };
  };

  const getProjectLocation = (project: Project) => {
    if (project.location?.trim()) return project.location.trim();
    const client = clients.find((c) => c.id === project.clientId);
    const address = client?.address || '';
    const parts = address.split(',');
    return parts.length > 1 ? parts[parts.length - 1].trim() : address || '—';
  };

  const getProgressPercent = (status: Project['status']) => {
    switch (status) {
      case 'completed':
        return 100;
      case 'on-hold':
        return 45;
      case 'active':
        return 65;
      case 'pending':
        return 20;
      case 'rejected':
      default:
        return 0;
    }
  };

  const normalizeLineItems = (lines: ProjectFormDraftLine[]) =>
    lines.filter((line) => line.qty > 0 || line.unit.trim() || line.description.trim());

  const getLineEstimatedAmount = (line: ProjectFormDraftLine) => {
    const matched = line.productId
      ? inventory.find((item) => String(item.id) === String(line.productId))
      : inventory.find((item) => item.name?.toLowerCase() === line.description.trim().toLowerCase());
    return (matched?.unitPrice || 0) * Number(line.qty || 0);
  };

  const getInventoryItemById = (productId?: string) =>
    productId ? inventory.find((item) => String(item.id) === String(productId)) : null;

  const getDefaultCheckedBy = (project?: Project | null) => {
    if (project?.assignedPmName?.trim()) return project.assignedPmName;
    if (project?.assignedPmId) {
      const assigned = users.find((entry) => entry.id === project.assignedPmId);
      if (assigned?.name?.trim()) return assigned.name;
    }
    return '';
  };

  const projectFormStaffOptions = useMemo(() => {
    const names = new Set<string>();
    const addName = (value?: string | null) => {
      const trimmed = String(value || '').trim();
      if (trimmed) names.add(trimmed);
    };

    users.forEach((entry) => {
      const roleList = entry.roles?.length ? entry.roles : entry.role ? [entry.role] : [];
      if (roleList.some((role) => role !== 'client')) {
        addName(entry.name);
      }
    });

    addName(user?.name);
    addName(selectedProject?.assignedPmName);
    addName(projectFormData.requestedBy);
    addName(projectFormData.checkedBy);

    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [
    users,
    user?.name,
    selectedProject?.assignedPmName,
    projectFormData.requestedBy,
    projectFormData.checkedBy,
  ]);

  const buildProjectFormSeed = (project?: Project | null, current?: Partial<ProjectFormDraft>): ProjectFormDraft => {
    const client = project ? clients.find((entry) => entry.id === project.clientId) : null;
    return {
      ...createEmptyProjectForm(),
      ...current,
      projectId: project?.id || current?.projectId || '',
      projectName: project?.name || current?.projectName || '',
      company: project?.clientName || current?.company || '',
      address: project?.location || client?.address || current?.address || '',
      requestedBy: current?.requestedBy || user?.name || '',
      checkedBy: current?.checkedBy || getDefaultCheckedBy(project),
    };
  };

  const saveProjectFormDraft = (data: ProjectFormDraft) => {
    try {
      localStorage.setItem(projectFormDraftKey, JSON.stringify(data));
      setProjectFormDraftAvailable(true);
    } catch {
      // ignore draft persistence issues
    }
  };

  const clearProjectFormDraft = () => {
    try {
      localStorage.removeItem(projectFormDraftKey);
    } catch {
      // ignore
    }
    setProjectFormDraftAvailable(false);
  };

  const restoreProjectFormDraft = () => {
    try {
      const raw = localStorage.getItem(projectFormDraftKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      setProjectFormData({
        ...createEmptyProjectForm(),
        ...parsed,
        thortexProducts: Array.isArray(parsed.thortexProducts) && parsed.thortexProducts.length ? parsed.thortexProducts : [emptyProjectFormLine()],
        consumableMaterials: Array.isArray(parsed.consumableMaterials) && parsed.consumableMaterials.length ? parsed.consumableMaterials : [emptyProjectFormLine()],
        toolsEquipmentOthers: Array.isArray(parsed.toolsEquipmentOthers) && parsed.toolsEquipmentOthers.length ? parsed.toolsEquipmentOthers : [emptyProjectFormLine()],
      });
      toast({
        title: 'Draft restored',
        description: 'Your last project form draft has been loaded.',
      });
    } catch {
      toast({
        title: 'Unable to restore draft',
        description: 'The saved draft could not be loaded.',
        variant: 'destructive',
      });
    }
  };

  const mergeImportedLines = (section: ProjectFormSectionKey, lines: ProjectFormDraftLine[]) => {
    if (lines.length === 0) return;
    setProjectFormData((prev) => ({
      ...prev,
      [section]:
        prev[section].length === 1 && !prev[section][0].description && !prev[section][0].unit && !prev[section][0].qty
          ? lines
          : [...prev[section], ...lines],
    }));
  };

  const importOrderLinesToForm = () => {
    const sourceOrders = orders.filter((order) => order.projectId === projectFormData.projectId);
    if (sourceOrders.length === 0) {
      toast({
        title: 'No project orders found',
        description: 'There are no linked orders to import from yet.',
        variant: 'destructive',
      });
      return;
    }
    const imported = sourceOrders.flatMap((order) =>
      order.items.map((item) => ({
        qty: item.quantity,
        unit: item.unit,
        description: item.itemName,
        productId: item.itemId,
      }))
    );
    mergeImportedLines('consumableMaterials', imported);
    toast({
      title: 'Imported from orders',
      description: `${imported.length} line item${imported.length === 1 ? '' : 's'} added to the form.`,
    });
  };

  const importRequestLinesToForm = () => {
    const sourceRequests = materialRequests.filter((request) => request.projectId === projectFormData.projectId);
    if (sourceRequests.length === 0) {
      toast({
        title: 'No material requests found',
        description: 'There are no linked requests to import from yet.',
        variant: 'destructive',
      });
      return;
    }
    const imported = sourceRequests.flatMap((request) =>
      request.items.map((item) => ({
        qty: item.quantity,
        unit: item.unit,
        description: item.itemName,
        productId: item.itemId,
      }))
    );
    mergeImportedLines('consumableMaterials', imported);
    toast({
      title: 'Imported from material requests',
      description: `${imported.length} line item${imported.length === 1 ? '' : 's'} added to the form.`,
    });
  };

  const getProjectFormTotals = (form = projectFormData) => {
    const allLines = [
      ...normalizeLineItems(form.thortexProducts),
      ...normalizeLineItems(form.consumableMaterials),
      ...normalizeLineItems(form.toolsEquipmentOthers),
    ];
    const subtotal = allLines.reduce((sum, line) => sum + getLineEstimatedAmount(line), 0);
    const vat = subtotal * VAT_RATE;
    const total = subtotal + vat;
    return { subtotal, vat, total };
  };

  const updateProjectFormSection = (
    section: ProjectFormSectionKey,
    index: number,
    field: 'qty' | 'unit' | 'description' | 'productId',
    value: string
  ) => {
    setProjectFormData((prev) => ({
      ...prev,
      [section]: prev[section].map((line, lineIndex) =>
        lineIndex === index
          ? {
              ...line,
              [field]: field === 'qty' ? Number(value || 0) : value,
            }
          : line
      ),
    }));
  };

  const selectProjectFormProduct = (section: ProjectFormSectionKey, index: number, productId: string) => {
    const product = getInventoryItemById(productId);
    if (!product) return;
    setProjectFormData((prev) => ({
      ...prev,
      [section]: prev[section].map((line, lineIndex) =>
        lineIndex === index
          ? {
              ...line,
              productId,
              description: product.name || '',
              unit: product.unit || '',
            }
          : line
      ),
    }));
  };

  const addProjectFormLine = (section: ProjectFormSectionKey) => {
    setProjectFormData((prev) => ({
      ...prev,
      [section]: [...prev[section], emptyProjectFormLine()],
    }));
  };

  const removeProjectFormLine = (
    section: ProjectFormSectionKey,
    index: number
  ) => {
    setProjectFormData((prev) => ({
      ...prev,
      [section]:
        prev[section].length === 1
          ? [emptyProjectFormLine()]
          : prev[section].filter((_, lineIndex) => lineIndex !== index),
    }));
  };

  const openProjectFormDialog = (project?: Project | null) => {
    const targetProject = project || selectedProject;
    setProjectFormData(buildProjectFormSeed(targetProject));
    setProjectFormErrors({});
    setShowProjectFormDialog(true);
  };

  const handleSaveProjectForm = async () => {
    const errors: Record<string, string> = {};
    if (!projectFormData.projectId) errors.projectId = 'Project is required.';
    if (!projectFormData.projectName.trim()) errors.projectName = 'Project name is required.';
    if (!projectFormData.company.trim()) errors.company = 'Company is required.';
    setProjectFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const totals = getProjectFormTotals(projectFormData);
    try {
      const response = await apiClient.post<ProjectForm>('/project-forms', {
        ...projectFormData,
        thortexProducts: normalizeLineItems(projectFormData.thortexProducts),
        consumableMaterials: normalizeLineItems(projectFormData.consumableMaterials),
        toolsEquipmentOthers: normalizeLineItems(projectFormData.toolsEquipmentOthers),
        subtotal: totals.subtotal,
        vat: totals.vat,
        totalCost: totals.total,
      });
      setProjectForms((prev) => [response.data, ...prev]);
      setShowProjectFormDialog(false);
      clearProjectFormDraft();
      toast({
        title: 'Project form saved',
        description: 'The project form was linked to the selected project.',
      });
    } catch {
      toast({
        title: 'Unable to save form',
        description: 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleDownloadProjectForm = (form: ProjectForm) => {
    const renderRows = (rows: ProjectForm['thortexProducts']) =>
      rows.length
        ? rows
            .map(
              (row) => `
                <tr>
                  <td>${row.qty || ''}</td>
                  <td>${row.unit || ''}</td>
                  <td>${row.description || ''}</td>
                </tr>
              `
            )
            .join('')
        : '<tr><td></td><td></td><td></td></tr>';
    const html = `
      <html>
        <head>
          <title>${form.projectName} Project Form</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #222; }
            h1,h2,h3,p { margin: 0; }
            .header { text-align: center; margin-bottom: 16px; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin-bottom: 16px; font-size: 12px; }
            .box { border: 1px solid #111; padding: 10px; margin-bottom: 16px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
            th, td { border: 1px solid #111; padding: 6px; text-align: left; }
            .totals { margin-top: 16px; margin-left: auto; width: 280px; font-size: 12px; }
            .totals div { display: flex; justify-content: space-between; padding: 4px 0; }
            .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 24px; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h2>IMPEX ENGINEERING & INDUSTRIAL SUPPLY</h2>
            <h3>PROJECT FORM</h3>
          </div>
          <div class="grid">
            <div><strong>Project Name:</strong> ${form.projectName}</div>
            <div><strong>Company:</strong> ${form.company}</div>
            <div><strong>Address:</strong> ${form.address}</div>
            <div><strong>O/Ref#:</strong> ${form.oRefNumber}</div>
            <div><strong>PO No.:</strong> ${form.poNumber}</div>
            <div><strong>Area:</strong> ${form.area}</div>
          </div>
          <div class="box">
            <strong>Thortex Products</strong>
            <table><thead><tr><th>Qty</th><th>Unit</th><th>Description</th></tr></thead><tbody>${renderRows(form.thortexProducts)}</tbody></table>
          </div>
          <div class="box">
            <strong>Consumable Materials</strong>
            <table><thead><tr><th>Qty</th><th>Unit</th><th>Description</th></tr></thead><tbody>${renderRows(form.consumableMaterials)}</tbody></table>
          </div>
          <div class="box">
            <strong>Tools / Equipment / Others</strong>
            <table><thead><tr><th>Qty</th><th>Unit</th><th>Description</th></tr></thead><tbody>${renderRows(form.toolsEquipmentOthers)}</tbody></table>
          </div>
          <div class="totals">
            <div><span>Subtotal</span><strong>${formatCurrency(form.subtotal)}</strong></div>
            <div><span>VAT (${Math.round(VAT_RATE * 100)}%)</span><strong>${formatCurrency(form.vat)}</strong></div>
            <div><span>Total Project Cost</span><strong>${formatCurrency(form.totalCost)}</strong></div>
          </div>
          <div class="sign">
            <div><strong>Requested By:</strong> ${form.requestedBy}</div>
            <div><strong>Checked By:</strong> ${form.checkedBy}</div>
          </div>
        </body>
      </html>
    `;
    const printWindow = window.open('', '_blank', 'width=960,height=720');
    if (!printWindow) return;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const handleCreateProject = () => {
    if (isPresident) return;
    const errors: Record<string, string> = {};
    if (!newProject.name.trim()) errors.name = 'Project name is required.';
    if (!newProject.clientId) errors.clientId = 'Client is required.';
    setProjectErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast({
        title: 'Error',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }

    const client = clients.find((c) => c.id === newProject.clientId);
    const project: Project = {
      id: `proj-${Date.now()}`,
      name: newProject.name,
      clientId: newProject.clientId,
      clientName: client?.name || '',
      location: newProject.location || null,
      status: newProject.status,
      startDate: new Date().toISOString().split('T')[0],
    };

    apiClient
      .post('/projects', {
        name: newProject.name,
        clientId: newProject.clientId,
        location: newProject.location || null,
        status: newProject.status,
      })
      .then((response) => setProjects([mapProject(response.data), ...projects]))
      .catch(() => setProjects([project, ...projects]));
    toast({
      title: 'Project Created',
      description: `${project.name} has been added`,
    });
    setShowCreateDialog(false);
    setNewProject({ name: '', clientId: '', location: '', status: 'active' });
    setProjectErrors({});
  };

  const handleOpenProject = (project: Project) => {
    if (isProjectManager && !scopedProjects.some((p) => p.id === project.id)) {
      toast({
        title: 'Access restricted',
        description: 'You can only view projects assigned to your account.',
        variant: 'destructive',
      });
      return;
    }
    setSelectedProject(project);
    setEditProject({
      id: project.id,
      status: project.status,
      startDate: project.startDate || '',
      location: project.location || '',
      rejectionReason: project.rejectionReason || '',
      assignedPmId: project.assignedPmId || 'unassigned',
    });
  };

  const handleSaveProject = () => {
    if (!canEditStatus) return;
    if (!editProject.id) return;
    if (editProject.status === 'rejected' && !editProject.rejectionReason.trim()) {
      setEditProjectErrors({ rejectionReason: 'Rejection reason is required.' });
      toast({
        title: 'Missing reason',
        description: 'Please provide a rejection reason.',
        variant: 'destructive',
      });
      return;
    }
    const needsStartDate = ['active', 'on-hold', 'completed'].includes(editProject.status);
    if (needsStartDate && !editProject.startDate) {
      setEditProjectErrors({ startDate: 'Start date is required.' });
      toast({
        title: 'Missing date',
        description: 'Please select a start date.',
        variant: 'destructive',
      });
      return;
    }
    if (editProject.startDate && Number.isNaN(Date.parse(editProject.startDate))) {
      setEditProjectErrors({ startDate: 'Invalid start date.' });
      toast({
        title: 'Invalid date',
        description: 'Please select a valid start date.',
        variant: 'destructive',
      });
      return;
    }
    setEditProjectErrors({});
    apiClient
      .put<Project>(`/projects/${editProject.id}`, {
        status: editProject.status,
        startDate: editProject.startDate || undefined,
        location: editProject.location || null,
        rejectionReason: editProject.status === 'rejected' ? editProject.rejectionReason : undefined,
        ...(isAdmin
          ? { assignedPmId: editProject.assignedPmId === 'unassigned' ? null : editProject.assignedPmId }
          : {}),
      })
      .then((res) => {
        const updated = mapProject(res.data);
        setProjects((prev) =>
          prev.map((p) =>
            p.id === editProject.id
              ? { ...p, ...updated }
              : p
          )
        );
        setSelectedProject((prev) => (prev && prev.id === editProject.id ? { ...prev, ...updated } : prev));
        toast({
          title: 'Project Updated',
          description: 'Project details saved successfully.',
        });
      })
      .catch(() => {
        toast({
          title: 'Failed to update project',
          description: 'Please try again.',
          variant: 'destructive',
        });
      });
  };

  const handleTabChange = (value: string) => {
    const next = value === 'pending' ? 'pending' : 'all';
    setActiveTab(next);
    setStatusFilter(next === 'pending' ? 'pending' : 'all');
  };

  const handleProjectDecision = async (project: Project, status: Project['status'], reason?: string) => {
    if (!canEditStatus) return;
    setActionLoadingId(project.id);
    try {
      const payload = {
        status,
        startDate: project.startDate || new Date().toISOString().slice(0, 10),
        ...(status === 'rejected' ? { rejectionReason: reason } : {}),
      };
      const res = await apiClient.put<Project>(`/projects/${project.id}`, payload);
      const updated = mapProject(res.data);
      setProjects((prev) =>
        prev.map((p) => (p.id === project.id ? { ...p, ...updated } : p))
      );
      toast({
        title: status === 'active' ? 'Project approved' : 'Project updated',
        description: `${project.name} set to ${status}.`,
      });
    } catch {
      toast({
        title: 'Update failed',
        description: 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  const openRejectModal = (project: Project) => {
    setRejectTarget(project);
    setRejectReason('');
    setRejectError('');
  };

  const confirmReject = async () => {
    if (!canEditStatus) return;
    if (!rejectTarget) return;
    if (!rejectReason.trim()) {
      setRejectError('Rejection reason is required.');
      return;
    }
    await handleProjectDecision(rejectTarget, 'rejected', rejectReason.trim());
    setRejectTarget(null);
    setRejectReason('');
    setRejectError('');
  };

  useEffect(() => {
    if (location.pathname.startsWith('/admin/projects')) {
      reloadUsers();
    }
  }, [location.pathname, reloadUsers]);

  useEffect(() => {
    setProjectItemsPage(1);
  }, [selectedProject?.id]);

  useEffect(() => {
    setExpandedOrderId(null);
  }, [selectedProject?.id]);

  useEffect(() => {
    try {
      setProjectFormDraftAvailable(Boolean(localStorage.getItem(projectFormDraftKey)));
    } catch {
      setProjectFormDraftAvailable(false);
    }
  }, [projectFormDraftKey]);

  useEffect(() => {
    if (!showProjectFormDialog) return;
    saveProjectFormDraft(projectFormData);
  }, [projectFormData, showProjectFormDialog]);

  const AdminAssigneeSelect = ({
    value,
    onChange,
    users,
  }: {
    value: string;
    onChange: (value: string) => void;
    users: UserType[];
  }) => {
    const assignableUsers = users.filter((u) => {
      const roleList = u.roles?.length ? u.roles : u.role ? [u.role] : [];
      return roleList.includes('project_manager');
    });
    const sortedUsers = [...assignableUsers].sort((a, b) => a.name.localeCompare(b.name));
    return (
      <div>
        <Label>Assigned PM</Label>
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger className="mt-1">
            <SelectValue placeholder="Select PM" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {sortedUsers.map((pm) => (
              <SelectItem key={pm.id} value={pm.id}>
                {pm.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FolderKanban className="text-muted-foreground" />
            Projects
          </h2>
          <p className="text-muted-foreground">Manage client projects and track consumption</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canCreateProjectForm && (
            <Button variant="outline" onClick={() => openProjectFormDialog()}>
              <FileText size={16} className="mr-2" />
              New Project Form
            </Button>
          )}
          {canCreateProject && (
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus size={16} className="mr-2" />
              New Project
            </Button>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="all">All Projects</TabsTrigger>
          <TabsTrigger value="pending">Pending Requests</TabsTrigger>
        </TabsList>

        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col lg:flex-row lg:items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search projects..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full lg:w-[180px]">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="on-hold">On Hold</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sortKey} onValueChange={(value) => setSortKey(value as typeof sortKey)}>
                <SelectTrigger className="w-full lg:w-[180px]">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="projectName">Sort: Name</SelectItem>
                  <SelectItem value="status">Sort: Status</SelectItem>
                  <SelectItem value="startDate">Sort: Start Date</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sortDir} onValueChange={(value) => setSortDir(value as typeof sortDir)}>
                <SelectTrigger className="w-full lg:w-[140px]">
                  <SelectValue placeholder="Direction" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asc">Asc</SelectItem>
                  <SelectItem value="desc">Desc</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <TabsContent value="pending" />
      </Tabs>

      {/* Projects Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {projectsLoading && visibleProjects.length === 0 ? (
          Array.from({ length: 6 }).map((_, idx) => (
            <Card key={`sk-${idx}`} className="p-4">
              <Skeleton className="h-4 w-2/3 mb-3" />
              <Skeleton className="h-3 w-1/2 mb-2" />
              <Skeleton className="h-2 w-full" />
            </Card>
          ))
        ) : (
          visibleProjects.map((project) => {
            const stats = getProjectStats(project.id);
            const progress = getProgressPercent(project.status);
            const statusMeta = {
              active: { label: 'Active', dot: 'bg-green-600', text: 'text-green-700' },
              'on-hold': { label: 'On Hold', dot: 'bg-orange-500', text: 'text-orange-600' },
              completed: { label: 'Completed', dot: 'bg-emerald-600', text: 'text-emerald-700' },
              pending: { label: 'Pending', dot: 'bg-amber-500', text: 'text-amber-700' },
              rejected: { label: 'Rejected', dot: 'bg-red-600', text: 'text-red-600' },
            }[project.status];
            return (
              <Card
                key={project.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => handleOpenProject(project)}
              >
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold">{project.name}</p>
                      <div className={`mt-1 inline-flex items-center gap-2 text-xs ${statusMeta?.text || ''}`}>
                        <span className={`h-2 w-2 rounded-full ${statusMeta?.dot || 'bg-muted'}`} />
                        {statusMeta?.label || project.status}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Building2 size={16} />
                    <span>{project.clientName}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Assigned PM:{' '}
                    <span className="font-medium text-foreground">
                      {project.assignedPmName || (project.assignedPmId === user?.id ? 'You' : 'Unassigned')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin size={16} />
                    <span>{getProjectLocation(project)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CalendarDays size={16} />
                    <span>
                      {project.startDate
                        ? format(new Date(project.startDate), 'MMM dd, yyyy')
                        : '—'}
                    </span>
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                      <span>Progress</span>
                      <span>{progress}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-[#C0392B]"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatNumber(stats.orderCount)} orders • {formatCurrency(stats.totalValue, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Project Detail Dialog */}
      <Dialog open={!!selectedProject} onOpenChange={() => setSelectedProject(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedProject?.name}</DialogTitle>
            <DialogDescription>{selectedProject?.clientName}</DialogDescription>
          </DialogHeader>
          {selectedProject && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Badge className={statusColors[selectedProject.status]}>{selectedProject.status}</Badge>
                <span className="text-sm text-muted-foreground">
                  Start: {selectedProject.startDate ? format(new Date(selectedProject.startDate), 'MMM dd, yyyy') : '—'}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Timeline</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {[
                      { label: 'Requested', done: true },
                      { label: 'Approved', done: ['active', 'on-hold', 'completed'].includes(selectedProject.status) },
                      { label: 'In Progress', done: ['active', 'completed'].includes(selectedProject.status) },
                      { label: 'Completed', done: selectedProject.status === 'completed' },
                    ].map((step) => (
                      <div key={step.label} className="flex items-center gap-2 text-sm">
                        <span className={`h-2 w-2 rounded-full ${step.done ? 'bg-emerald-600' : 'bg-muted'}`} />
                        <span className={step.done ? 'text-foreground' : 'text-muted-foreground'}>{step.label}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Status Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <p>Client: <span className="font-medium">{selectedProject.clientName}</span></p>
                    <p>
                      Assigned PM:{' '}
                      <span className="font-medium">
                        {selectedProject.assignedPmName ||
                          (selectedProject.assignedPmId === user?.id ? 'You' : 'Unassigned')}
                      </span>
                    </p>
                    <p>Location: <span className="font-medium">{getProjectLocation(selectedProject)}</span></p>
                    <p>Orders: <span className="font-medium">{formatNumber(getProjectStats(selectedProject.id).orderCount)}</span></p>
                    <p>Total Value: <span className="font-medium">{formatCurrency(getProjectStats(selectedProject.id).totalValue, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span></p>
                  </CardContent>
                </Card>
              </div>

              {canEditStatus && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Update Status</CardTitle>
                    <CardDescription>Move projects out of on-hold or update status.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label>Status</Label>
                      <Select
                        value={editProject.status}
                        onValueChange={(value) => setEditProject((prev) => ({ ...prev, status: value as Project['status'] }))}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="on-hold">On Hold</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="rejected">Rejected</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {isAdmin && (
                      <AdminAssigneeSelect
                        value={editProject.assignedPmId}
                        onChange={(value) => setEditProject((prev) => ({ ...prev, assignedPmId: value }))}
                        users={users}
                      />
                    )}
                    <div>
                      <Label>Start Date</Label>
                      <Input
                        type="date"
                        value={editProject.startDate || ''}
                        onChange={(e) => setEditProject((prev) => ({ ...prev, startDate: e.target.value }))}
                        className="mt-1"
                      />
                      {editProjectErrors.startDate && (
                        <p className="text-xs text-destructive mt-1">{editProjectErrors.startDate}</p>
                      )}
                    </div>
                    <div>
                      <Label>Location / Address</Label>
                      <Input
                        placeholder="e.g., Quezon City or full site address"
                        value={editProject.location || ''}
                        onChange={(e) => setEditProject((prev) => ({ ...prev, location: e.target.value }))}
                        className="mt-1"
                      />
                    </div>
                    {editProject.status === 'rejected' && (
                      <div>
                        <Label>Rejection Reason</Label>
                        <Input
                          value={editProject.rejectionReason}
                          onChange={(e) =>
                            setEditProject((prev) => ({ ...prev, rejectionReason: e.target.value }))
                          }
                          className="mt-1"
                        />
                        {editProjectErrors.rejectionReason && (
                          <p className="text-xs text-destructive mt-1">{editProjectErrors.rejectionReason}</p>
                        )}
                      </div>
                    )}
                    <div className="flex justify-end">
                      <Button onClick={handleSaveProject}>Save Changes</Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Linked Orders</CardTitle>
                  <CardDescription>Orders created under this project.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {selectedProjectOrders.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No orders linked to this project yet.</p>
                  ) : (
                    selectedProjectOrders
                      .slice()
                      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                      .map((order) => {
                        const linkedDelivery = deliveries.find((delivery) => delivery.orderId === order.id);
                        const isExpanded = expandedOrderId === order.id;
                        return (
                          <div key={order.id} className="rounded-2xl border px-4 py-3">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div className="min-w-0 space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-semibold">{order.orderNumber}</p>
                                  <Badge className="capitalize">{order.status.replace(/-/g, ' ')}</Badge>
                                  <Badge variant="outline" className="capitalize">
                                    {order.paymentStatus}
                                  </Badge>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  {new Date(order.createdAt).toLocaleDateString('en-PH')} • {order.items.length} items • ₱
                                  {order.total.toLocaleString('en-PH', {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}
                                </p>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                              >
                                {isExpanded ? 'Hide Details' : 'View Order'}
                              </Button>
                            </div>

                            {isExpanded ? (
                              <div className="mt-4 space-y-4 border-t pt-4">
                                <div className="grid gap-3 md:grid-cols-4 text-sm">
                                  <div className="rounded-xl bg-muted/30 p-3">
                                    <p className="text-muted-foreground">Date Ordered</p>
                                    <p className="font-medium">
                                      {new Date(order.createdAt).toLocaleDateString('en-PH')}
                                    </p>
                                  </div>
                                  <div className="rounded-xl bg-muted/30 p-3">
                                    <p className="text-muted-foreground">Project</p>
                                    <p className="font-medium">{order.projectName || '—'}</p>
                                  </div>
                                  <div className="rounded-xl bg-muted/30 p-3">
                                    <p className="text-muted-foreground">Payment Status</p>
                                    <p className="font-medium capitalize">{order.paymentStatus}</p>
                                  </div>
                                  <div className="rounded-xl bg-muted/30 p-3">
                                    <p className="text-muted-foreground">Delivery Status</p>
                                    <p className="font-medium capitalize">
                                      {linkedDelivery ? linkedDelivery.status.replace(/-/g, ' ') : 'Not scheduled'}
                                    </p>
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  <p className="text-sm font-semibold">Order Items</p>
                                  <div className="space-y-2">
                                    {order.items.map((item, index) => {
                                      const lineAmount =
                                        typeof item.amount === 'number' && item.amount > 0
                                          ? item.amount
                                          : item.quantity * item.unitPrice;
                                      return (
                                        <div
                                          key={`${order.id}-${item.itemId}-${index}`}
                                          className="grid gap-2 rounded-xl border px-3 py-3 text-sm md:grid-cols-[minmax(0,2fr)_100px_130px_130px]"
                                        >
                                          <div className="min-w-0">
                                            <p className="font-medium">{item.itemName}</p>
                                            <p className="text-xs text-muted-foreground">{item.unit}</p>
                                          </div>
                                          <p className="md:text-right">{item.quantity}</p>
                                          <p className="md:text-right">
                                            ₱{item.unitPrice.toLocaleString('en-PH', {
                                              minimumFractionDigits: 2,
                                              maximumFractionDigits: 2,
                                            })}
                                          </p>
                                          <p className="font-medium md:text-right">
                                            ₱{lineAmount.toLocaleString('en-PH', {
                                              minimumFractionDigits: 2,
                                              maximumFractionDigits: 2,
                                            })}
                                          </p>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        );
                      })
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Items</CardTitle>
                  <CardDescription>Items requested or ordered for this project, with estimated cost visibility</CardDescription>
                </CardHeader>
                <CardContent>
                  {selectedProjectItems.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No items linked yet</p>
                  ) : (
                    <div className="space-y-4">
                      <div className="hidden rounded-md border bg-muted/30 px-4 py-3 text-xs font-medium text-muted-foreground md:grid md:grid-cols-[minmax(0,2fr)_110px_140px_140px]">
                        <span>Item</span>
                        <span className="text-right">Qty</span>
                        <span className="text-right">Unit Price</span>
                        <span className="text-right">Estimated Cost</span>
                      </div>
                      <div className="space-y-2">
                        {paginatedProjectItems.map((item, idx) => {
                            const lineAmount =
                              typeof item.amount === 'number' && item.amount > 0
                                ? item.amount
                                : item.quantity * item.unitPrice;

                            return (
                              <div
                                key={`${item.itemId}-${projectItemsPage}-${idx}`}
                                className="rounded-md border px-4 py-3 md:grid md:grid-cols-[minmax(0,2fr)_110px_140px_140px] md:items-center"
                              >
                                <div className="min-w-0">
                                  <p className="font-medium">{item.itemName}</p>
                                  <p className="text-xs text-muted-foreground">{item.unit}</p>
                                </div>
                                <div className="mt-2 text-sm md:mt-0 md:text-right">
                                  <span className="md:hidden text-muted-foreground">Qty: </span>
                                  <span className="font-medium">{item.quantity}</span>
                                </div>
                                <div className="mt-1 text-sm md:mt-0 md:text-right">
                                  <span className="md:hidden text-muted-foreground">Unit Price: </span>
                                  ₱{item.unitPrice.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                                <div className="mt-1 text-sm font-semibold md:mt-0 md:text-right">
                                  <span className="md:hidden text-muted-foreground">Estimated Cost: </span>
                                  ₱{lineAmount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                              </div>
                            );
                          })}
                      </div>
                      <div className="flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm text-muted-foreground">
                          Showing {projectItemsStart}-{projectItemsEnd} of {selectedProjectItems.length} items
                        </p>
                        <PaginationNav
                          page={projectItemsPage}
                          totalPages={totalProjectItemsPages}
                          onPageChange={setProjectItemsPage}
                          maxPages={5}
                        />
                      </div>
                      <div className="flex justify-end border-t pt-3">
                        <div className="w-full max-w-xs space-y-2 rounded-md bg-muted/30 p-4 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Estimated Materials Cost</span>
                            <span className="font-semibold">
                              ₱
                              {projectItemsTotalCost.toLocaleString('en-PH', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Project Forms</CardTitle>
                    <CardDescription>Linked digital project forms and printable copies</CardDescription>
                  </div>
                  {canCreateProjectForm && (
                    <Button variant="outline" onClick={() => openProjectFormDialog(selectedProject)}>
                      <Plus size={16} className="mr-2" />
                      New Project Form
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  {projectForms.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No project forms linked yet.</p>
                  ) : (
                    projectForms.map((form) => (
                      <div key={form.id} className="rounded-md border p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="space-y-1 text-sm">
                            <p className="font-medium">{form.projectName}</p>
                            <p className="text-muted-foreground">PO No.: {form.poNumber || '—'} • O/Ref#: {form.oRefNumber || '—'}</p>
                            <p className="text-muted-foreground">Requested By: {form.requestedBy || '—'} • Checked By: {form.checkedBy || '—'}</p>
                          </div>
                          <div className="text-sm text-right">
                            <p className="font-medium">PHP {form.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                            <p className="text-muted-foreground">{new Date(form.createdAt).toLocaleDateString('en-PH')}</p>
                          </div>
                        </div>
                        <div className="mt-3 grid gap-3 md:grid-cols-3">
                          <div>
                            <p className="text-xs font-medium uppercase text-muted-foreground">Thortex Products</p>
                            <ul className="mt-1 space-y-1 text-sm">
                              {form.thortexProducts.length === 0 ? <li className="text-muted-foreground">None</li> : form.thortexProducts.map((line, index) => <li key={`${form.id}-t-${index}`}>{line.qty} {line.unit} {line.description}</li>)}
                            </ul>
                          </div>
                          <div>
                            <p className="text-xs font-medium uppercase text-muted-foreground">Consumables</p>
                            <ul className="mt-1 space-y-1 text-sm">
                              {form.consumableMaterials.length === 0 ? <li className="text-muted-foreground">None</li> : form.consumableMaterials.map((line, index) => <li key={`${form.id}-c-${index}`}>{line.qty} {line.unit} {line.description}</li>)}
                            </ul>
                          </div>
                          <div>
                            <p className="text-xs font-medium uppercase text-muted-foreground">Tools / Others</p>
                            <ul className="mt-1 space-y-1 text-sm">
                              {form.toolsEquipmentOthers.length === 0 ? <li className="text-muted-foreground">None</li> : form.toolsEquipmentOthers.map((line, index) => <li key={`${form.id}-o-${index}`}>{line.qty} {line.unit} {line.description}</li>)}
                            </ul>
                          </div>
                        </div>
                        <div className="mt-4 flex justify-end">
                          <Button variant="outline" onClick={() => handleDownloadProjectForm(form)}>
                            <Download size={16} className="mr-2" />
                            Download PDF
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setSelectedProject(null)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showProjectFormDialog} onOpenChange={setShowProjectFormDialog}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>IMPEX ENGINEERING & INDUSTRIAL SUPPLY PROJECT FORM</DialogTitle>
            <DialogDescription>Create and link a digital project form to a project with autofill, imports, and draft support.</DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            <div className="flex flex-wrap gap-2 rounded-2xl border border-dashed bg-muted/20 p-3">
              <Button
                variant="outline"
                onClick={() =>
                  setProjectFormData(
                    buildProjectFormSeed(
                      projects.find((entry) => entry.id === projectFormData.projectId) || selectedProject
                    )
                  )
                }
              >
                Autofill Project Details
              </Button>
              <Button variant="outline" onClick={importOrderLinesToForm} disabled={!projectFormData.projectId}>
                Import from Orders
              </Button>
              <Button variant="outline" onClick={importRequestLinesToForm} disabled={!projectFormData.projectId}>
                Import from Material Requests
              </Button>
              {projectFormDraftAvailable ? (
                <Button variant="outline" onClick={restoreProjectFormDraft}>
                  Restore Draft
                </Button>
              ) : null}
              <Button variant="outline" onClick={clearProjectFormDraft}>
                Clear Draft
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Project</Label>
                <Select
                  value={projectFormData.projectId}
                  onValueChange={(value) => {
                    const project = availableProjects.find((entry) => entry.id === value);
                    setProjectFormData((prev) => buildProjectFormSeed(project, prev));
                    if (projectFormErrors.projectId) {
                      setProjectFormErrors((prev) => ({ ...prev, projectId: '' }));
                    }
                  }}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableProjects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {projectFormErrors.projectId && <p className="mt-1 text-xs text-destructive">{projectFormErrors.projectId}</p>}
              </div>
              <div>
                <Label>Project Name</Label>
                <Input
                  className="mt-1"
                  value={projectFormData.projectName}
                  onChange={(e) => setProjectFormData((prev) => ({ ...prev, projectName: e.target.value }))}
                />
                {projectFormErrors.projectName && <p className="mt-1 text-xs text-destructive">{projectFormErrors.projectName}</p>}
              </div>
              <div>
                <Label>Company</Label>
                <Input
                  className="mt-1"
                  value={projectFormData.company}
                  onChange={(e) => setProjectFormData((prev) => ({ ...prev, company: e.target.value }))}
                />
                {projectFormErrors.company && <p className="mt-1 text-xs text-destructive">{projectFormErrors.company}</p>}
              </div>
              <div>
                <Label>Address</Label>
                <Input
                  className="mt-1"
                  value={projectFormData.address}
                  onChange={(e) => setProjectFormData((prev) => ({ ...prev, address: e.target.value }))}
                />
              </div>
              <div>
                <Label>O/Ref#</Label>
                <Input
                  className="mt-1"
                  value={projectFormData.oRefNumber}
                  onChange={(e) => setProjectFormData((prev) => ({ ...prev, oRefNumber: e.target.value }))}
                />
              </div>
              <div>
                <Label>PO No.</Label>
                <Input
                  className="mt-1"
                  value={projectFormData.poNumber}
                  onChange={(e) => setProjectFormData((prev) => ({ ...prev, poNumber: e.target.value }))}
                />
              </div>
              <div>
                <Label>Area</Label>
                <Input
                  className="mt-1"
                  value={projectFormData.area}
                  onChange={(e) => setProjectFormData((prev) => ({ ...prev, area: e.target.value }))}
                />
              </div>
            </div>

            {([
              ['thortexProducts', 'Thortex Products'],
              ['consumableMaterials', 'Consumable Materials'],
              ['toolsEquipmentOthers', 'Tools/Equipment/Others'],
            ] as const).map(([sectionKey, sectionLabel]) => (
              <Card key={sectionKey}>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-base">{sectionLabel}</CardTitle>
                    <CardDescription>Pick products where possible, then only adjust quantity or notes when needed.</CardDescription>
                  </div>
                  <Button variant="outline" onClick={() => addProjectFormLine(sectionKey)}>
                    <Plus size={16} className="mr-2" />
                    Add Row
                  </Button>
                </CardHeader>
                <CardContent className="space-y-3">
                  {projectFormData[sectionKey].map((line, index) => (
                    <div key={`${sectionKey}-${index}`} className="grid gap-3 rounded-md border p-3 md:grid-cols-[1.25fr_100px_110px_1fr_150px_96px]">
                      <div>
                        <Label>Product</Label>
                        <Select
                          value={line.productId || '__custom__'}
                          onValueChange={(value) => {
                            if (value === '__custom__') {
                              updateProjectFormSection(sectionKey, index, 'productId', '');
                              return;
                            }
                            selectProjectFormProduct(sectionKey, index, value);
                          }}
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue placeholder="Select inventory item" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__custom__">Custom line</SelectItem>
                            {inventory.map((item) => (
                              <SelectItem key={`${sectionKey}-${index}-${item.id}`} value={String(item.id)}>
                                {item.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Qty</Label>
                        <Input
                          className="mt-1"
                          type="number"
                          min="0"
                          value={line.qty || ''}
                          onChange={(e) => updateProjectFormSection(sectionKey, index, 'qty', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>Unit</Label>
                        <Input
                          className="mt-1"
                          value={line.unit}
                          onChange={(e) => updateProjectFormSection(sectionKey, index, 'unit', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>Description</Label>
                        <Input
                          className="mt-1"
                          value={line.description}
                          onChange={(e) => updateProjectFormSection(sectionKey, index, 'description', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>Estimated Cost</Label>
                        <div className="mt-3 text-sm font-medium">
                          PHP {getLineEstimatedAmount(line).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </div>
                      </div>
                      <div className="flex items-end">
                        <Button variant="outline" className="w-full" onClick={() => removeProjectFormLine(sectionKey, index)}>
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Requested By</Label>
                <Input
                  className="mt-1"
                  value={projectFormData.requestedBy}
                  onChange={(e) => setProjectFormData((prev) => ({ ...prev, requestedBy: e.target.value }))}
                />
              </div>
              <div>
                <Label>Checked By</Label>
                <Input
                  className="mt-1"
                  value={projectFormData.checkedBy}
                  onChange={(e) => setProjectFormData((prev) => ({ ...prev, checkedBy: e.target.value }))}
                />
              </div>
            </div>

            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="grid gap-2 p-4 text-sm md:grid-cols-3">
                <div className="flex items-center justify-between md:block">
                  <span className="text-muted-foreground">Subtotal</span>
                  <p className="font-semibold">PHP {getProjectFormTotals().subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="flex items-center justify-between md:block">
                  <span className="text-muted-foreground">VAT ({Math.round(VAT_RATE * 100)}%)</span>
                  <p className="font-semibold">PHP {getProjectFormTotals().vat.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="flex items-center justify-between md:block">
                  <span className="text-muted-foreground">Total Project Cost</span>
                  <p className="text-lg font-bold text-primary">PHP {getProjectFormTotals().total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowProjectFormDialog(false)}>Cancel</Button>
              <Button variant="outline" onClick={() => saveProjectFormDraft(projectFormData)}>Save Draft</Button>
              <Button onClick={handleSaveProjectForm}>Save Project Form</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {!isPresident && (
        <>
          {/* Reject Project Dialog */}
          <Dialog open={!!rejectTarget} onOpenChange={() => setRejectTarget(null)}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Reject Project</DialogTitle>
                <DialogDescription>
                  Provide a reason for rejection. The client will be notified.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="rejectReason">Reason</Label>
                <Input
                  id="rejectReason"
                  value={rejectReason}
                  onChange={(e) => {
                    setRejectReason(e.target.value);
                    if (rejectError) setRejectError('');
                  }}
                  placeholder="e.g., Please provide a valid scope and timeline."
                />
                {rejectError && <p className="text-xs text-destructive">{rejectError}</p>}
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button
                  className="bg-red-600 hover:bg-red-700 text-white"
                  onClick={() => setRejectTarget(null)}
                >
                  Cancel
                </Button>
                <Button
                  className="bg-red-600 hover:bg-red-700 text-white"
                  onClick={confirmReject}
                >
                  Reject
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Create Project Dialog */}
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Project</DialogTitle>
                <DialogDescription>Add a new project for a client</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Project Name</Label>
                  <Input
                    placeholder="e.g., Office Building Renovation"
                    value={newProject.name}
                    onChange={(e) => {
                      const next = { ...newProject, name: e.target.value };
                      setNewProject(next);
                      if (projectErrors.name) {
                        setProjectErrors((prev) => ({ ...prev, name: '' }));
                      }
                    }}
                    className="mt-1"
                  />
                  {projectErrors.name && <p className="text-xs text-destructive mt-1">{projectErrors.name}</p>}
                </div>
                <div>
                  <Label>Client</Label>
                  <Select
                    value={newProject.clientId}
                    onValueChange={(v) => {
                      setNewProject({ ...newProject, clientId: v });
                      if (projectErrors.clientId) {
                        setProjectErrors((prev) => ({ ...prev, clientId: '' }));
                      }
                    }}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select client" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((client) => (
                        <SelectItem key={client.id} value={client.id}>
                          {client.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {projectErrors.clientId && <p className="text-xs text-destructive mt-1">{projectErrors.clientId}</p>}
                </div>
                <div>
                  <Label>Status</Label>
                  <Select
                    value={newProject.status}
                    onValueChange={(v: any) => setNewProject({ ...newProject, status: v })}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="on-hold">On Hold</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Location / Address</Label>
                  <Input
                    placeholder="e.g., Quezon City or full site address"
                    value={newProject.location}
                    onChange={(e) => setNewProject({ ...newProject, location: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    className="bg-red-600 hover:bg-red-700 text-white"
                    onClick={() => setShowCreateDialog(false)}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleCreateProject}>Create Project</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
