import { useMemo, useState } from 'react';
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
import { FolderKanban, Search, MapPin, CalendarDays, Building2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useResource } from '@/hooks/use-resource';
import { apiClient } from '@/api/client';
import type { Project, Client, Order, Delivery } from '@/types';
import PaginationNav from '@/components/PaginationNav';

export default function ClientProjectsPage() {
  const { user } = useAuth();
  const { data: projects, reload: reloadProjects } = useResource<Project[]>('/projects', []);
  const { data: clients } = useResource<Client[]>('/clients', []);
  const { data: orders } = useResource<Order[]>('/orders', []);
  const { data: deliveries } = useResource<Delivery[]>('/deliveries', []);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 6;
  const [materialsPage, setMaterialsPage] = useState(1);
  const materialsPageSize = 5;
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

  const getProjectLocation = (project: Project) => {
    if (project.location?.trim()) return project.location.trim();
    const client = clients.find((c) => c.id === project.clientId);
    const address = client?.address || '';
    const parts = address.split(',');
    return parts.length > 1 ? parts[parts.length - 1].trim() : address || '—';
  };

  const getProjectStats = (projectId: string) => {
    const projectOrders = orders.filter((o) => o.projectId === projectId);
    const projectDeliveries = deliveries.filter((d) =>
      projectOrders.some((o) => o.id === d.orderId)
    );
    const totalValue = projectOrders.reduce((sum, o) => sum + o.total, 0);
    return { orderCount: projectOrders.length, deliveryCount: projectDeliveries.length, totalValue };
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

  const buildProjectTimeline = (project: Project) => {
    const projectOrders = orders.filter((o) => o.projectId === project.id);
    const projectDeliveries = deliveries.filter((d) =>
      projectOrders.some((o) => o.id === d.orderId)
    );
    const hasApproved = ['active', 'on-hold', 'completed'].includes(project.status);
    const hasStarted = ['active', 'completed'].includes(project.status) || projectOrders.length > 0;
    const hasDelivery = projectDeliveries.length > 0;
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
    setExpandedOrderId(null);
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
          const progress = getProgressPercent(project.status);
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
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Progress</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted">
                    <div className="h-2 rounded-full bg-[#C0392B]" style={{ width: `${progress}%` }} />
                  </div>
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
          setExpandedOrderId(null);
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
                    <div>
                      <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                        <span>Progress</span>
                        <span>{getProgressPercent(selectedProject.status)}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted">
                        <div
                          className="h-2 rounded-full bg-[#C0392B]"
                          style={{ width: `${getProgressPercent(selectedProject.status)}%` }}
                        />
                      </div>
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
                          </div>
                        );
                      })
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
                    setExpandedOrderId(null);
                  }}
                >
                  Close
                </Button>
              </DialogFooter>
            </div>
          )}
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
