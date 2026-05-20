import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  ClipboardList,
  FileText,
  FolderKanban,
  Package,
  Paintbrush2,
  Shield,
  ShoppingCart,
  Truck,
  Warehouse,
  Wrench,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/contexts/AuthContext';
import { useResource } from '@/hooks/use-resource';
import { apiClient } from '@/api/client';
import type {
  Delivery,
  InventoryItem,
  MaterialRequest,
  Order,
  Project,
  QuoteRequest,
  StockTransaction,
  UserRole,
} from '@/types';

type DashboardStats = {
  pendingRequests: number;
  pendingRequestsDelta: number;
  pendingRequestsPercent: number | null;
  rangeDays: number;
};

const rolePriority: UserRole[] = [
  'president',
  'admin',
  'project_manager',
  'sales_agent',
  'engineer',
  'paint_chemist',
  'warehouse_staff',
  'delivery_guy',
];

function formatPeso(value: number) {
  return `₱${value.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function getRoleLabel(role: UserRole) {
  switch (role) {
    case 'president':
      return 'Executive Overview';
    case 'admin':
      return 'Operational Control';
    case 'project_manager':
      return 'Project Focus';
    case 'sales_agent':
      return 'Sales & Client Focus';
    case 'engineer':
      return 'Technical Requests';
    case 'paint_chemist':
      return 'Paint-Specific View';
    case 'warehouse_staff':
      return 'Warehouse Operations';
    case 'delivery_guy':
      return 'Logistics View';
    default:
      return 'Operations';
  }
}

function getRequestStatusLabel(status: MaterialRequest['status']) {
  switch (status) {
    case 'pending':
      return 'PM Review';
    case 'pm_approved':
      return 'President Approval';
    case 'approved':
      return 'Procurement';
    case 'fulfilled':
      return 'Fulfilled';
    case 'rejected':
      return 'Rejected';
    default:
      return status;
  }
}

function QuickLinkCard({
  title,
  description,
  icon: Icon,
  onClick,
}: {
  title: string;
  description: string;
  icon: typeof ClipboardList;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="imx-surface imx-surface-hover min-h-[136px] w-full rounded-[22px] px-5 py-5 text-left"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="w-fit rounded-2xl bg-muted/80 p-3">
            <Icon size={20} />
          </div>
          <div>
            <p className="font-semibold">{title}</p>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        <ArrowRight size={16} className="mt-1 text-muted-foreground" />
      </div>
    </button>
  );
}

export default function StaffDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const roleList = useMemo<UserRole[]>(
    () => (user?.roles?.length ? user.roles : user?.role ? [user.role] : []),
    [user?.role, user?.roles]
  );
  const effectiveRole = rolePriority.find((role) => roleList.includes(role)) || 'admin';
  const needsStats = ['president', 'admin'].includes(effectiveRole);
  const needsRequests = ['admin', 'project_manager', 'engineer', 'paint_chemist', 'warehouse_staff', 'president'].includes(effectiveRole);
  const needsInventory = ['admin', 'warehouse_staff'].includes(effectiveRole);
  const needsProjects = ['president', 'project_manager', 'engineer'].includes(effectiveRole);
  const needsOrders = ['president', 'admin', 'project_manager', 'sales_agent', 'engineer', 'warehouse_staff'].includes(effectiveRole);
  const needsDeliveries = ['president', 'delivery_guy'].includes(effectiveRole);
  const needsTransactions = ['warehouse_staff'].includes(effectiveRole);
  const needsQuotes = ['admin', 'sales_agent'].includes(effectiveRole);

  const { data: stats } = useResource<DashboardStats>(needsStats ? '/dashboard/stats' : '', {
    pendingRequests: 0,
    pendingRequestsDelta: 0,
    pendingRequestsPercent: 0,
    rangeDays: 30,
  });
  const { data: requests } = useResource<MaterialRequest[]>(needsRequests ? '/material-requests' : '', []);
  const { data: inventory } = useResource<InventoryItem[]>(needsInventory ? '/inventory' : '', []);
  const { data: projects } = useResource<Project[]>(needsProjects ? '/projects' : '', []);
  const { data: orders } = useResource<Order[]>(needsOrders ? '/orders' : '', []);
  const { data: deliveries } = useResource<Delivery[]>(needsDeliveries ? '/deliveries' : '', []);
  const { data: transactions } = useResource<StockTransaction[]>(needsTransactions ? '/transactions' : '', []);
  const [quotes, setQuotes] = useState<QuoteRequest[]>([]);

  useEffect(() => {
    if (!needsQuotes) {
      setQuotes([]);
      return;
    }
    apiClient
      .get('/quote-requests')
      .then((res) => setQuotes(res.data?.data || res.data || []))
      .catch(() => setQuotes([]));
  }, [effectiveRole, needsQuotes]);

  const reviewStatuses =
    effectiveRole === 'president'
      ? ['pm_approved']
      : effectiveRole === 'admin' || effectiveRole === 'warehouse_staff'
        ? ['approved']
        : ['pending'];
  const pendingRequests = requests
    .filter((request) => reviewStatuses.includes(request.status))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const lowStockItems = inventory
    .filter((item) => item.status === 'low-stock' || item.status === 'out-of-stock')
    .sort((a, b) => a.qtyOnHand - b.qtyOnHand);

  const recentActivity = [...requests]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);

  const myOrders = orders.filter((order) => order.assignedSalesAgentId === user?.id);
  const myRequests = requests.filter((request) => request.requestedById === user?.id);
  const engineerVisibleRequests = requests;
  const myOrderPipeline = myOrders.filter((order) => ['pending', 'approved', 'processing', 'ready-for-delivery'].includes(order.status));
  const warehouseOrders = orders
    .filter((order) => ['approved', 'processing', 'ready-for-delivery'].includes(order.status))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const scopedProjectIds = new Set(projects.map((project) => project.id));
  const pmRequests = requests.filter((request) => scopedProjectIds.has(request.projectId));
  const projectCostOverview = projects.slice(0, 5).map((project) => ({
    id: project.id,
    name: project.name,
    totalCost: orders
      .filter((order) => order.projectId === project.id)
      .reduce((sum, order) => sum + order.total, 0),
  }));
  const engineerProjects = projects;
  const paintInventory = inventory.filter((item) => item.category === 'Paint & Consumables');
  const paintRequestIds = new Set(
    requests
      .filter((request) =>
        request.items.length > 0 &&
        request.items.every((item) =>
          inventory.find((inventoryItem) => inventoryItem.id === item.itemId)?.category === 'Paint & Consumables'
        )
      )
      .map((request) => request.id)
  );
  const paintRequests = requests.filter((request) => paintRequestIds.has(request.id));
  const activeDeliveries = deliveries.filter((delivery) =>
    ['pending', 'in-transit'].includes(delivery.status)
  );
  const presidentApprovalRequests = requests
    .filter((request) => request.status === 'pm_approved')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const procurementReadyRequests = requests.filter((request) => request.status === 'approved');

  const renderPresidentDashboard = () => (
    <div className="space-y-6">
      <Card className="rounded-2xl border shadow-sm">
        <CardContent className="flex flex-col gap-5 p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-blue-100 p-3">
              <ClipboardList className="h-6 w-6 text-blue-700" />
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Final Approval Queue</p>
              <h2 className="text-3xl font-bold">{presidentApprovalRequests.length}</h2>
              <p className="text-sm text-muted-foreground">
                Material requests already cleared by Project Managers.
              </p>
            </div>
          </div>
          <Button onClick={() => navigate('/admin/requests')} className="bg-[#C0392B] text-white hover:bg-[#A93226]">
            Open Final Approvals
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>All Projects Summary</CardTitle>
            <CardDescription>High-level view of project status across the company</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              { label: 'Pending', value: projects.filter((project) => project.status === 'pending').length },
              { label: 'Active', value: projects.filter((project) => project.status === 'active').length },
              { label: 'On Hold', value: projects.filter((project) => project.status === 'on-hold').length },
              { label: 'Completed', value: projects.filter((project) => project.status === 'completed').length },
              { label: 'For Procurement', value: procurementReadyRequests.length },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border p-4">
                <p className="text-sm text-muted-foreground">{item.label}</p>
                <p className="mt-2 text-2xl font-bold">{item.value}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <QuickLinkCard
            title="Reports"
            description="Open company reporting and summary views."
            icon={BarChart3}
            onClick={() => navigate('/admin/reports')}
          />
          <QuickLinkCard
            title="AI Insights"
            description="Review AI recommendations and operational signals."
            icon={Shield}
            onClick={() => navigate('/admin/ai-insights')}
          />
          <QuickLinkCard
            title="Audit Logs"
            description="Inspect system-wide audit trails and accountability records."
            icon={FileText}
            onClick={() => navigate('/admin/audit-logs')}
          />
        </div>
      </div>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>President Approval</CardTitle>
          <CardDescription>Latest PM-approved requests waiting for final decision</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Request ID</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Requested By</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {presidentApprovalRequests.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    No requests are waiting for final approval.
                  </TableCell>
                </TableRow>
              ) : (
                presidentApprovalRequests.slice(0, 8).map((request) => (
                  <TableRow key={request.id} className="cursor-pointer" onClick={() => navigate('/admin/requests')}>
                    <TableCell className="font-medium">{request.requestNumber}</TableCell>
                    <TableCell>{request.projectName}</TableCell>
                    <TableCell>{request.requestedBy}</TableCell>
                    <TableCell>{new Date(request.date).toLocaleDateString('en-PH')}</TableCell>
                    <TableCell>
                      <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">President Approval</Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );

  const renderAdminDashboard = () => (
    <div className="space-y-6">
      <Card className="rounded-2xl border shadow-sm">
        <CardContent className="flex flex-col gap-5 p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-amber-100 p-3">
              <ClipboardList className="h-6 w-6 text-amber-700" />
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Pending Requests</p>
              <h2 className="text-3xl font-bold">{stats.pendingRequests || pendingRequests.length}</h2>
              <p className="text-sm text-muted-foreground">
                Priority approvals waiting for operational review.
              </p>
            </div>
          </div>
          <div className="flex flex-col items-start gap-3 lg:items-end">
            {stats.pendingRequestsPercent !== null && stats.pendingRequestsPercent !== 0 && (
              <Badge variant="outline" className="text-xs">
                {stats.pendingRequestsDelta >= 0 ? '+' : ''}
                {stats.pendingRequestsPercent}% vs last {stats.rangeDays} days
              </Badge>
            )}
            <Button onClick={() => navigate('/admin/requests')} className="bg-[#C0392B] text-white hover:bg-[#A93226]">
              Review Material Requests
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Pending Request Queue</CardTitle>
            <CardDescription>Latest material requests waiting for action</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Request ID</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Requested By</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingRequests.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      No pending requests right now.
                    </TableCell>
                  </TableRow>
                ) : (
                  pendingRequests.slice(0, 8).map((request) => (
                    <TableRow key={request.id} className="cursor-pointer" onClick={() => navigate('/admin/requests')}>
                      <TableCell className="font-medium">{request.requestNumber}</TableCell>
                      <TableCell>{request.projectName}</TableCell>
                      <TableCell>{request.requestedBy}</TableCell>
                      <TableCell>{new Date(request.date).toLocaleDateString('en-PH')}</TableCell>
                      <TableCell>
                        <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100">
                          {getRequestStatusLabel(request.status)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle>Inventory Overview</CardTitle>
              <CardDescription>Quick operational stock summary</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border p-4">
                  <p className="text-sm text-muted-foreground">Low Stock</p>
                  <p className="mt-1 text-2xl font-bold">{lowStockItems.length}</p>
                </div>
                <div className="rounded-xl border p-4">
                  <p className="text-sm text-muted-foreground">Inventory Value</p>
                  <p className="mt-1 text-2xl font-bold">
                    {formatPeso(inventory.reduce((sum, item) => sum + item.qtyOnHand * item.unitPrice, 0))}
                  </p>
                </div>
              </div>
              <Button variant="ghost" className="w-full" onClick={() => navigate('/admin/inventory')}>
                Open Inventory
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Latest request activity across the team</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentActivity.slice(0, 4).map((request) => (
                <div key={request.id} className="rounded-xl border px-4 py-3">
                  <p className="font-medium">{request.requestNumber}</p>
                  <p className="text-sm text-muted-foreground">{request.projectName}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );

  const renderProjectManagerDashboard = () => (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>My Projects</CardTitle>
            <CardDescription>Projects currently assigned to you</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {projects.length === 0 ? (
              <p className="text-sm text-muted-foreground">No projects assigned right now.</p>
            ) : (
              projects.map((project) => (
                <div key={project.id} className="flex items-center justify-between rounded-xl border px-4 py-3">
                  <div>
                    <p className="font-medium">{project.name}</p>
                    <p className="text-sm text-muted-foreground">{project.clientName}</p>
                  </div>
                  <Badge className="capitalize bg-slate-100 text-slate-700 hover:bg-slate-100">
                    {project.status}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle>My Material Requests</CardTitle>
              <CardDescription>Requests tied to your scoped projects</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {pmRequests.slice(0, 4).map((request) => (
                <div key={request.id} className="rounded-xl border px-4 py-3">
                  <p className="font-medium">{request.requestNumber}</p>
                  <p className="text-sm text-muted-foreground">{request.projectName}</p>
                </div>
              ))}
              <Button variant="ghost" className="w-full" onClick={() => navigate('/admin/requests')}>
                Open Material Requests
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle>Project Cost Overview</CardTitle>
              <CardDescription>Estimated value of project-linked orders</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {projectCostOverview.slice(0, 4).map((project) => (
                <div key={project.id} className="flex items-center justify-between rounded-xl border px-4 py-3">
                  <span className="font-medium">{project.name}</span>
                  <span className="text-sm font-semibold">{formatPeso(project.totalCost)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );

  const renderSalesAgentDashboard = () => (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>My Client Orders</CardTitle>
            <CardDescription>Orders manually assigned to you</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {myOrders.length === 0 ? (
              <p className="text-sm text-muted-foreground">No client orders assigned to you yet.</p>
            ) : (
              myOrders.slice(0, 6).map((order) => (
                <div key={order.id} className="flex items-center justify-between rounded-xl border px-4 py-3">
                  <div>
                    <p className="font-medium">{order.orderNumber}</p>
                    <p className="text-sm text-muted-foreground">{order.clientName}</p>
                  </div>
                  <Badge className="capitalize bg-slate-100 text-slate-700 hover:bg-slate-100">
                    {order.status}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle>Assigned Order Queue</CardTitle>
              <CardDescription>Orders currently waiting on your sales follow-through</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {myOrderPipeline.length === 0 ? (
                <p className="text-sm text-muted-foreground">No assigned orders in the active queue right now.</p>
              ) : (
                myOrderPipeline.slice(0, 4).map((order) => (
                  <div key={order.id} className="rounded-xl border px-4 py-3">
                    <p className="font-medium">{order.orderNumber}</p>
                    <p className="text-sm text-muted-foreground">{order.clientName} • {order.status.replace(/-/g, ' ')}</p>
                  </div>
                ))
              )}
              <Button variant="ghost" className="w-full" onClick={() => navigate('/admin/orders')}>
                Open Orders
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle>Client Activity</CardTitle>
              <CardDescription>Recent movement from your assigned accounts</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {myOrders.length === 0 ? (
                <p className="text-sm text-muted-foreground">No assigned client activity yet.</p>
              ) : (
                myOrders.slice(0, 4).map((order) => (
                  <div key={order.id} className="rounded-xl border px-4 py-3">
                    <p className="font-medium">{order.clientName}</p>
                    <p className="text-sm text-muted-foreground">
                      {order.projectName || 'No project'} • {formatPeso(order.total)}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );

  const renderEngineerDashboard = () => (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Inventory Overview</CardTitle>
            <CardDescription>Current material visibility for engineering requests</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {inventory.slice(0, 6).map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-xl border px-4 py-3">
                <div>
                  <p className="font-medium">{item.name}</p>
                  <p className="text-sm text-muted-foreground">{item.category}</p>
                </div>
                <span className="text-sm font-semibold">{item.qtyOnHand} {item.unit}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle>Project Material Requests</CardTitle>
              <CardDescription>Requests across active engineering work</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {engineerVisibleRequests.length === 0 ? (
                <p className="text-sm text-muted-foreground">No material requests available right now.</p>
              ) : (
              engineerVisibleRequests.slice(0, 4).map((request) => (
                <div key={request.id} className="rounded-xl border px-4 py-3">
                  <p className="font-medium">{request.requestNumber}</p>
                  <p className="text-sm text-muted-foreground">{request.projectName}</p>
                </div>
              )))}
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle>Engineering Projects</CardTitle>
              <CardDescription>Projects currently visible for engineering work</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {engineerProjects.length === 0 ? (
                <p className="text-sm text-muted-foreground">No projects available right now.</p>
              ) : (
              engineerProjects.slice(0, 4).map((project) => (
                <div key={project.id} className="rounded-xl border px-4 py-3">
                  <p className="font-medium">{project.name}</p>
                  <p className="text-sm text-muted-foreground">{project.clientName}</p>
                </div>
              )))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );

  const renderPaintChemistDashboard = () => (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Paint & Consumables Inventory</CardTitle>
            <CardDescription>Items relevant to paint and coating work</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {paintInventory.slice(0, 8).map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-xl border px-4 py-3">
                <div>
                  <p className="font-medium">{item.name}</p>
                  <p className="text-sm text-muted-foreground">{formatPeso(item.unitPrice)} / {item.unit}</p>
                </div>
                <span className="text-sm font-semibold">{item.qtyOnHand}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Paint-related Requests</CardTitle>
            <CardDescription>Material requests limited to paint category items</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {paintRequests.slice(0, 5).map((request) => (
              <div key={request.id} className="rounded-xl border px-4 py-3">
                <p className="font-medium">{request.requestNumber}</p>
                <p className="text-sm text-muted-foreground">{request.projectName}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );

  const renderWarehouseDashboard = () => (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Low Stock Items</CardTitle>
            <CardDescription>Items needing warehouse attention first</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {lowStockItems.slice(0, 8).map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-xl border px-4 py-3">
                <div>
                  <p className="font-medium">{item.name}</p>
                  <p className="text-sm text-muted-foreground">{item.category}</p>
                </div>
                <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
                  {item.qtyOnHand} {item.unit}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle>Order Processing Queue</CardTitle>
              <CardDescription>Orders currently waiting on warehouse handling</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {warehouseOrders.length === 0 ? (
                <p className="text-sm text-muted-foreground">No orders are waiting on warehouse processing right now.</p>
              ) : (
                warehouseOrders.slice(0, 5).map((order) => (
                  <div key={order.id} className="rounded-xl border px-4 py-3">
                    <p className="font-medium">{order.orderNumber}</p>
                    <p className="text-sm text-muted-foreground">{order.clientName} • {order.status.replace(/-/g, ' ')}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle>Stock Movement</CardTitle>
              <CardDescription>Latest stock transactions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {transactions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No stock movement recorded yet.</p>
              ) : (
                transactions.slice(0, 5).map((transaction) => (
                  <div key={transaction.id} className="rounded-xl border px-4 py-3">
                    <p className="font-medium capitalize">{transaction.type}</p>
                    <p className="text-sm text-muted-foreground">
                      {transaction.date} • Balance {transaction.newBalance}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );

  const renderDeliveryDashboard = () => (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Delivery Queue</CardTitle>
            <CardDescription>Current logistics queue for dispatch and transit updates</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {activeDeliveries.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active deliveries right now.</p>
            ) : (
              activeDeliveries.slice(0, 8).map((delivery) => (
                <div key={delivery.id} className="flex items-center justify-between rounded-xl border px-4 py-3">
                  <div>
                    <p className="font-medium">{delivery.drNumber}</p>
                    <p className="text-sm text-muted-foreground">{delivery.clientName}</p>
                  </div>
                  <Badge className="capitalize bg-sky-100 text-sky-800 hover:bg-sky-100">
                    {delivery.status.replace(/-/g, ' ')}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Quick Status Update</CardTitle>
            <CardDescription>Jump straight to logistics actions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button className="w-full bg-[#C0392B] text-white hover:bg-[#A93226]" onClick={() => navigate('/logistics')}>
              Open Logistics Workspace
            </Button>
            <p className="text-sm text-muted-foreground">
              Update delivery progress, confirm status changes, and upload proof of delivery.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  const renderDashboard = () => {
    switch (effectiveRole) {
      case 'president':
        return renderPresidentDashboard();
      case 'admin':
        return renderAdminDashboard();
      case 'project_manager':
        return renderProjectManagerDashboard();
      case 'sales_agent':
        return renderSalesAgentDashboard();
      case 'engineer':
        return renderEngineerDashboard();
      case 'paint_chemist':
        return renderPaintChemistDashboard();
      case 'warehouse_staff':
        return renderWarehouseDashboard();
      case 'delivery_guy':
        return renderDeliveryDashboard();
      default:
        return renderAdminDashboard();
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">{getRoleLabel(effectiveRole)}</p>
        </div>
        <Badge variant="outline" className="w-fit capitalize">
          {effectiveRole.replace(/_/g, ' ')}
        </Badge>
      </div>

      {renderDashboard()}
    </div>
  );
}
