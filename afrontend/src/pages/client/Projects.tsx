import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { ArrowLeft, Eye, FolderKanban, Search, MapPin, CalendarDays, Building2, PackageSearch } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useResource } from '@/hooks/use-resource';
import { apiClient } from '@/api/client';
import type { Project, Client, Order } from '@/types';
import PaginationNav from '@/components/PaginationNav';
import { ProjectStatusDots } from '@/components/ProjectStatusDots';

const orderStatusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-blue-100 text-blue-800',
  processing: 'bg-indigo-100 text-indigo-800',
  'ready-for-delivery': 'bg-cyan-100 text-cyan-800',
  shipped: 'bg-purple-100 text-purple-800',
  delivered: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
};

const paymentStatusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  verified: 'bg-blue-100 text-blue-800',
  paid: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
};

const formatPeso = (value: number) =>
  `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ClientProjectsPage() {
  const { user } = useAuth();
  const { data: projects, reload: reloadProjects } = useResource<Project[]>('/projects', []);
  const { data: clients } = useResource<Client[]>('/clients', []);
  const { data: orders } = useResource<Order[]>('/orders', []);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedLinkedOrder, setSelectedLinkedOrder] = useState<Order | null>(null);
  const [showProjectItemsDialog, setShowProjectItemsDialog] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 6;
  const [materialsPage, setMaterialsPage] = useState(1);
  const materialsPageSize = 5;
  const [linkedOrdersPage, setLinkedOrdersPage] = useState(1);
  const linkedOrdersPageSize = 5;
  const [resubmitOpen, setResubmitOpen] = useState(false);
  const [resubmitProject, setResubmitProject] = useState<Project | null>(null);
  const [resubmitName, setResubmitName] = useState('');
  const [resubmitError, setResubmitError] = useState('');

  const clientProjects = useMemo(() => {
    return projects.filter((project) => {
      const matchesSearch =
        project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        project.clientName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || project.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [projects, searchTerm, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(clientProjects.length / pageSize));
  const pagedProjects = clientProjects.slice((page - 1) * pageSize, page * pageSize);
  const selectedProjectItems = selectedProject
    ? orders.filter((o) => o.projectId === selectedProject.id).flatMap((o) => o.items)
    : [];
  const selectedProjectOrders = selectedProject
    ? orders.filter((order) => order.projectId === selectedProject.id)
    : [];
  const sortedSelectedProjectOrders = selectedProjectOrders
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const totalLinkedOrdersPages = Math.max(1, Math.ceil(sortedSelectedProjectOrders.length / linkedOrdersPageSize));
  const paginatedLinkedOrders = sortedSelectedProjectOrders.slice(
    (linkedOrdersPage - 1) * linkedOrdersPageSize,
    linkedOrdersPage * linkedOrdersPageSize
  );
  const totalMaterialsPages = Math.max(1, Math.ceil(selectedProjectItems.length / materialsPageSize));
  const pagedProjectItems = selectedProjectItems.slice(
    (materialsPage - 1) * materialsPageSize,
    materialsPage * materialsPageSize
  );
  const projectMaterialsTotal = selectedProjectItems.reduce(
    (sum, item) =>
      sum + (typeof item.amount === 'number' && item.amount > 0 ? item.amount : item.quantity * item.unitPrice),
    0
  );
  const projectMaterialsVat = Number((projectMaterialsTotal * 0.12).toFixed(2));
  const projectMaterialsGrandTotal = projectMaterialsTotal + projectMaterialsVat;

  useEffect(() => {
    setLinkedOrdersPage(1);
    setMaterialsPage(1);
  }, [selectedProject?.id]);

  useEffect(() => {
    if (linkedOrdersPage > totalLinkedOrdersPages) setLinkedOrdersPage(totalLinkedOrdersPages);
  }, [linkedOrdersPage, totalLinkedOrdersPages]);

  const getProjectLocation = (project: Project) => {
    if (project.location?.trim()) return project.location.trim();
    const client = clients.find((c) => c.id === project.clientId);
    const address = client?.address || '';
    const parts = address.split(',');
    return parts.length > 1 ? parts[parts.length - 1].trim() : address || '—';
  };

  const getOrderDeliveryStatus = (order: Order) => {
    if (order.status === 'delivered') return 'Delivered';
    if (order.status === 'shipped') return 'In Transit';
    if (order.status === 'ready-for-delivery') return 'Pending Dispatch';
    if (order.status === 'processing' || order.status === 'approved') return 'Preparing';
    return 'Not scheduled';
  };

  const orderHasDeliveryActivity = (order: Order) =>
    ['approved', 'processing', 'ready-for-delivery', 'shipped', 'delivered'].includes(order.status);

  const getProjectStats = (projectId: string) => {
    const projectOrders = orders.filter((o) => o.projectId === projectId);
    const projectDeliveries = projectOrders.filter(orderHasDeliveryActivity);
    const totalValue = projectOrders.reduce((sum, o) => sum + o.total, 0);
    return { orderCount: projectOrders.length, deliveryCount: projectDeliveries.length, totalValue };
  };

  const buildProjectTimeline = (project: Project) => {
    const projectOrders = orders.filter((o) => o.projectId === project.id);
    const hasApproved = ['active', 'on-hold', 'completed'].includes(project.status);
    const hasStarted = ['active', 'completed'].includes(project.status) || projectOrders.length > 0;
    const hasDelivery = projectOrders.some(orderHasDeliveryActivity);
    const hasCompleted = project.status === 'completed';

    return [
      {
        label: 'Requested',
        description: 'Project request submitted to Impex',
        done: true,
      },
      {
        label: 'Approved',
        description: hasApproved ? 'Approved and prepared for execution' : 'Waiting for approval',
        done: hasApproved,
      },
      {
        label: 'In Progress',
        description: hasStarted ? 'Project work and ordering are underway' : 'Not started yet',
        done: hasStarted,
      },
      {
        label: 'Delivery / Fulfillment',
        description: hasDelivery ? 'Orders have active or completed deliveries' : 'No delivery activity yet',
        done: hasDelivery,
      },
      {
        label: 'Completed',
        description: hasCompleted ? 'Project marked complete' : 'Completion still pending',
        done: hasCompleted,
      },
    ];
  };

  const openResubmit = (project: Project) => {
    setResubmitProject(project);
    setResubmitName(project.name);
    setResubmitError('');
    setResubmitOpen(true);
  };

  const handleResubmit = async () => {
    if (!resubmitProject) return;
    if (!resubmitName.trim()) {
      setResubmitError('Project name is required.');
      return;
    }
    try {
      await apiClient.post(`/projects/${resubmitProject.id}/resubmit`, {
        name: resubmitName.trim(),
      });
      setResubmitOpen(false);
      setResubmitProject(null);
      setResubmitName('');
      setResubmitError('');
      reloadProjects();
    } catch (err) {
      setResubmitError('Unable to resubmit. Please try again.');
    }
  };

  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value);
    setPage(1);
  };

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setPage(1);
  };

  const openProject = (project: Project) => {
    setSelectedProject(project);
    setMaterialsPage(1);
    setSelectedLinkedOrder(null);
    setShowProjectItemsDialog(false);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FolderKanban className="text-muted-foreground" />
            Projects
          </h1>
          <p className="text-muted-foreground">Track project approvals, orders, and deliveries</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
              <Input
                placeholder="Search projects..."
                value={searchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
              <SelectTrigger className="w-full sm:w-[180px]">
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
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {pagedProjects.map((project) => {
          const stats = getProjectStats(project.id);
          const statusMeta = {
            active: { label: 'Active', dot: 'bg-emerald-600', text: 'text-emerald-700' },
            'on-hold': { label: 'On Hold', dot: 'bg-orange-500', text: 'text-orange-600' },
            completed: { label: 'Completed', dot: 'bg-blue-600', text: 'text-blue-700' },
            pending: { label: 'Pending', dot: 'bg-amber-500', text: 'text-amber-700' },
            rejected: { label: 'Rejected', dot: 'bg-red-600', text: 'text-red-600' },
          }[project.status];
          return (
            <Card
              key={project.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => openProject(project)}
            >
              <CardContent className="p-4 space-y-3">
                <div>
                  <p className="font-semibold">{project.name}</p>
                  <div className={`mt-1 inline-flex items-center gap-2 text-xs ${statusMeta?.text || ''}`}>
                    <span className={`h-2 w-2 rounded-full ${statusMeta?.dot || 'bg-muted'}`} />
                    {statusMeta?.label || project.status}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Building2 size={16} />
                  <span>{project.clientName}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Assigned PM:{' '}
                  <span className="font-medium text-foreground">
                    {project.assignedPmName || 'Unassigned'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin size={16} />
                  <span>{getProjectLocation(project)}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CalendarDays size={16} />
                  <span>
                    {project.startDate ? format(new Date(project.startDate), 'MMM dd, yyyy') : '—'}
                  </span>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Project Status</p>
                  <ProjectStatusDots status={project.status} />
                </div>
                <div className="text-xs text-muted-foreground">
                  {stats.orderCount} orders • {stats.deliveryCount} deliveries
                </div>
                {project.status === 'rejected' && (
                  <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); openResubmit(project); }}>
                    Resubmit
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {clientProjects.length === 0 && (
        <div className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          No projects found for your current filters.
        </div>
      )}

      {clientProjects.length > pageSize && (
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm text-muted-foreground">
            Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, clientProjects.length)} of {clientProjects.length} projects
          </p>
          <PaginationNav page={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      )}

      <Dialog
        open={!!selectedProject}
        onOpenChange={() => {
          setSelectedProject(null);
          setSelectedLinkedOrder(null);
          setShowProjectItemsDialog(false);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedProject?.name}</DialogTitle>
            <DialogDescription>{selectedProject?.clientName}</DialogDescription>
          </DialogHeader>
          {selectedProject && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Badge className="capitalize">{selectedProject.status}</Badge>
                <span className="text-sm text-muted-foreground">
                  Start: {selectedProject.startDate ? format(new Date(selectedProject.startDate), 'MMM dd, yyyy') : '—'}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                Assigned PM:{' '}
                <span className="font-medium text-foreground">
                  {selectedProject.assignedPmName || 'Unassigned'}
                </span>
              </p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Status Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <p>Client: <span className="font-medium">{selectedProject.clientName}</span></p>
                    <p>Assigned PM: <span className="font-medium">{selectedProject.assignedPmName || 'Unassigned'}</span></p>
                    <p>Location: <span className="font-medium">{getProjectLocation(selectedProject)}</span></p>
                    <p>Orders: <span className="font-medium">{getProjectStats(selectedProject.id).orderCount}</span></p>
                    <p>Deliveries: <span className="font-medium">{getProjectStats(selectedProject.id).deliveryCount}</span></p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Overview</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="space-y-2">
                      <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Status Flow</p>
                      <ProjectStatusDots status={selectedProject.status} />
                    </div>
                    <p className="text-muted-foreground">
                      This view shows your project status, timeline, and delivery progress without the internal item list.
                    </p>
                  </CardContent>
                </Card>
              </div>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Linked Orders</CardTitle>
                  <CardDescription>Orders placed under this project.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {selectedProjectOrders.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No orders have been placed for this project yet.</p>
                  ) : (
                    paginatedLinkedOrders.map((order) => {
                        const linkedDeliveryStatus = getOrderDeliveryStatus(order);
                        return (
                          <button
                            key={order.id}
                            type="button"
                            onClick={() => setSelectedLinkedOrder(order)}
                            className="w-full rounded-2xl border px-4 py-3 text-left transition hover:border-primary/50 hover:bg-muted/30"
                          >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div className="min-w-0 space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-semibold">{order.orderNumber}</p>
                                  <Badge className={`capitalize ${orderStatusColors[order.status] || 'bg-slate-100 text-slate-800'}`}>
                                    {order.status.replace(/-/g, ' ')}
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
                              <span className="inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-medium">
                                <Eye size={14} className="mr-2" />
                                View Order
                              </span>
                            </div>

                            {false ? (
                              <div className="mt-4 space-y-4 border-t pt-4">
                                <div className="grid gap-3 md:grid-cols-3 text-sm">
                                  <div className="rounded-xl bg-muted/30 p-3">
                                    <p className="text-muted-foreground">Date Ordered</p>
                                    <p className="font-medium">
                                      {new Date(order.createdAt).toLocaleDateString('en-PH')}
                                    </p>
                                  </div>
                                  <div className="rounded-xl bg-muted/30 p-3">
                                    <p className="text-muted-foreground">Payment Status</p>
                                    <p className="font-medium capitalize">{order.paymentStatus}</p>
                                  </div>
                                  <div className="rounded-xl bg-muted/30 p-3">
                                    <p className="text-muted-foreground">Delivery Status</p>
                                    <p className="font-medium capitalize">
                                      {linkedDeliveryStatus}
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
                                            ₱{item.unitPrice.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                          </p>
                                          <p className="font-medium md:text-right">
                                            ₱{lineAmount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                          </p>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>
                            ) : null}
                          </button>
                        );
                      })
                  )}
                  {selectedProjectOrders.length > linkedOrdersPageSize && (
                    <PaginationNav page={linkedOrdersPage} totalPages={totalLinkedOrdersPages} onPageChange={setLinkedOrdersPage} maxPages={5} />
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Materials & Prices</CardTitle>
                  <CardDescription>Reference view of the items, quantities, and estimated cost tied to this project.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {selectedProjectItems.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No materials linked yet for this project.</p>
                  ) : (
                    <>
                      <div className="flex flex-col gap-3 rounded-md border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-medium">{selectedProjectItems.length} linked materials</p>
                          <p className="text-sm text-muted-foreground">
                            Materials subtotal {formatPeso(projectMaterialsTotal)} plus VAT {formatPeso(projectMaterialsVat)}.
                          </p>
                        </div>
                        <Button variant="outline" onClick={() => setShowProjectItemsDialog(true)}>
                          <PackageSearch size={16} className="mr-2" />
                          View Linked Items
                        </Button>
                      </div>
                      <div className="hidden rounded-md border bg-muted/30 px-3 py-2 text-[11px] font-medium text-muted-foreground md:grid md:grid-cols-[minmax(0,2fr)_90px_120px_130px]">
                        <span>Material</span>
                        <span className="text-right">Qty</span>
                        <span className="text-right">Unit Price</span>
                        <span className="text-right">Estimated Cost</span>
                      </div>
                      <div className="space-y-2">
                        {pagedProjectItems.map((item, idx) => {
                          const lineAmount =
                            typeof item.amount === 'number' && item.amount > 0
                              ? item.amount
                              : item.quantity * item.unitPrice;

                          return (
                            <div
                              key={`${item.itemId}-${materialsPage}-${idx}`}
                              className="rounded-md border px-3 py-2 md:grid md:grid-cols-[minmax(0,2fr)_90px_120px_130px] md:items-center"
                            >
                              <div className="min-w-0">
                                <p className="font-medium leading-6">{item.itemName}</p>
                                <p className="text-xs text-muted-foreground">{item.unit}</p>
                              </div>
                              <div className="mt-1 text-sm md:mt-0 md:text-right">
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
                      {selectedProjectItems.length > materialsPageSize && (
                        <div className="flex flex-col items-center gap-3 border-t pt-3">
                          <p className="text-sm text-muted-foreground">
                            Showing {(materialsPage - 1) * materialsPageSize + 1}-{Math.min(materialsPage * materialsPageSize, selectedProjectItems.length)} of {selectedProjectItems.length} materials
                          </p>
                          <PaginationNav page={materialsPage} totalPages={totalMaterialsPages} onPageChange={setMaterialsPage} maxPages={5} />
                        </div>
                      )}
                      <div className="flex justify-end border-t pt-3">
                        <div className="w-full max-w-xs rounded-md bg-muted/30 p-4 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Estimated Materials Cost</span>
                            <span className="font-semibold">
                              ₱{projectMaterialsTotal.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Timeline</CardTitle>
                  <CardDescription>Simple status view for your project progress</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {buildProjectTimeline(selectedProject).map((step) => (
                    <div key={step.label} className="flex items-start gap-3">
                      <span className={`mt-1 h-2.5 w-2.5 rounded-full ${step.done ? 'bg-emerald-600' : 'bg-muted'}`} />
                      <div>
                        <p className={step.done ? 'text-foreground font-medium' : 'text-muted-foreground font-medium'}>
                          {step.label}
                        </p>
                        <p className="text-xs text-muted-foreground">{step.description}</p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedProject(null);
                    setSelectedLinkedOrder(null);
                    setShowProjectItemsDialog(false);
                  }}
                >
                  Close
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedLinkedOrder} onOpenChange={(open) => !open && setSelectedLinkedOrder(null)}>
        {selectedLinkedOrder && (
          <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-4xl">
            <DialogHeader>
              <Button variant="ghost" className="mb-2 w-fit px-2" onClick={() => setSelectedLinkedOrder(null)}>
                <ArrowLeft size={16} className="mr-2" />
                Back to Project
              </Button>
              <DialogTitle>{selectedLinkedOrder.orderNumber}</DialogTitle>
              <DialogDescription>Linked order details, items, VAT, and delivery status.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-4 text-sm">
                <div className="rounded-xl bg-muted/30 p-3">
                  <p className="text-muted-foreground">Date Ordered</p>
                  <p className="font-medium">{new Date(selectedLinkedOrder.createdAt).toLocaleDateString('en-PH')}</p>
                </div>
                <div className="rounded-xl bg-muted/30 p-3">
                  <p className="text-muted-foreground">Order Status</p>
                  <Badge className={`mt-1 capitalize ${orderStatusColors[selectedLinkedOrder.status] || 'bg-slate-100 text-slate-800'}`}>
                    {selectedLinkedOrder.status.replace(/-/g, ' ')}
                  </Badge>
                </div>
                <div className="rounded-xl bg-muted/30 p-3">
                  <p className="text-muted-foreground">Payment</p>
                  <Badge className={`mt-1 capitalize ${paymentStatusColors[selectedLinkedOrder.paymentStatus] || 'bg-slate-100 text-slate-800'}`}>
                    {selectedLinkedOrder.paymentStatus}
                  </Badge>
                </div>
                <div className="rounded-xl bg-muted/30 p-3">
                  <p className="text-muted-foreground">Delivery</p>
                  <p className="font-medium capitalize">
                    {getOrderDeliveryStatus(selectedLinkedOrder)}
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                {selectedLinkedOrder.items.map((item, index) => {
                  const lineAmount =
                    typeof item.amount === 'number' && item.amount > 0
                      ? item.amount
                      : item.quantity * item.unitPrice;
                  return (
                    <div
                      key={`${selectedLinkedOrder.id}-${item.itemId}-${index}`}
                      className="grid gap-2 rounded-xl border px-3 py-3 text-sm md:grid-cols-[minmax(0,2fr)_100px_130px_130px]"
                    >
                      <div className="min-w-0">
                        <p className="font-medium">{item.itemName}</p>
                        <p className="text-xs text-muted-foreground">{item.unit}</p>
                      </div>
                      <p className="md:text-right">{item.quantity}</p>
                      <p className="md:text-right">{formatPeso(item.unitPrice)}</p>
                      <p className="font-medium md:text-right">{formatPeso(lineAmount)}</p>
                    </div>
                  );
                })}
              </div>
              <div className="ml-auto w-full max-w-xs space-y-2 rounded-md bg-muted/30 p-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-semibold">{formatPeso(selectedLinkedOrder.subtotal)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">VAT (12%)</span>
                  <span className="font-semibold">{formatPeso(selectedLinkedOrder.vat)}</span>
                </div>
                <div className="flex items-center justify-between border-t pt-2">
                  <span className="text-muted-foreground">Total</span>
                  <span className="font-semibold">{formatPeso(selectedLinkedOrder.total)}</span>
                </div>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={showProjectItemsDialog} onOpenChange={setShowProjectItemsDialog}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <Button variant="ghost" className="mb-2 w-fit px-2" onClick={() => setShowProjectItemsDialog(false)}>
              <ArrowLeft size={16} className="mr-2" />
              Back to Project
            </Button>
            <DialogTitle>Linked Items</DialogTitle>
            <DialogDescription>{selectedProject?.name || 'Project'} materials with estimated VAT.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {pagedProjectItems.map((item, idx) => {
              const lineAmount =
                typeof item.amount === 'number' && item.amount > 0
                  ? item.amount
                  : item.quantity * item.unitPrice;
              return (
                <div
                  key={`client-project-items-modal-${item.itemId}-${materialsPage}-${idx}`}
                  className="rounded-md border px-4 py-3 md:grid md:grid-cols-[minmax(0,2fr)_110px_140px_140px] md:items-center"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{item.itemName}</p>
                    <p className="text-xs text-muted-foreground">{item.unit}</p>
                  </div>
                  <div className="mt-2 text-sm md:mt-0 md:text-right">{item.quantity}</div>
                  <div className="mt-1 text-sm md:mt-0 md:text-right">{formatPeso(item.unitPrice)}</div>
                  <div className="mt-1 text-sm font-semibold md:mt-0 md:text-right">{formatPeso(lineAmount)}</div>
                </div>
              );
            })}
            <PaginationNav page={materialsPage} totalPages={totalMaterialsPages} onPageChange={setMaterialsPage} maxPages={5} />
            <div className="ml-auto w-full max-w-xs space-y-2 rounded-md bg-muted/30 p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Materials Subtotal</span>
                <span className="font-semibold">{formatPeso(projectMaterialsTotal)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">VAT (12%)</span>
                <span className="font-semibold">{formatPeso(projectMaterialsVat)}</span>
              </div>
              <div className="flex items-center justify-between border-t pt-2">
                <span className="text-muted-foreground">Estimated Total</span>
                <span className="font-semibold">{formatPeso(projectMaterialsGrandTotal)}</span>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={resubmitOpen} onOpenChange={setResubmitOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Resubmit Project</DialogTitle>
            <DialogDescription>Update the project name if needed and resubmit for approval.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Project Name</Label>
            <Input
              value={resubmitName}
              onChange={(e) => {
                setResubmitName(e.target.value);
                if (resubmitError) setResubmitError('');
              }}
            />
            {resubmitError && <p className="text-xs text-destructive">{resubmitError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResubmitOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleResubmit}>Resubmit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
