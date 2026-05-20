import { useState } from 'react';
import { Plus, ClipboardList, CheckCircle, XCircle, Clock, AlertTriangle, FileText, Search } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { MaterialRequest, UrgencyLevel, Project, InventoryItem } from '@/types';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { printHtml } from '@/utils/print';
import { useResource } from '@/hooks/use-resource';
import { Skeleton } from '@/components/ui/skeleton';
import { apiClient } from '@/api/client';
import { useAuth } from '@/contexts/AuthContext';
import { canApproveMaterialRequests, canCreateMaterialRequests, hasRole } from '@/lib/roles';
import { formatPesoAmount } from '@/lib/currency';

const MATERIAL_REQUEST_PURPOSE_OPTIONS = [
  'Routine Maintenance',
  'Project Execution',
  'Emergency Repair',
  'Site Mobilization',
  'Testing and Inspection',
  'Client Delivery Support',
];

export default function MaterialRequestsPage() {
  const { user } = useAuth();
  const roleInput = user?.roles?.length ? user.roles : user?.role;
  const canApprove = canApproveMaterialRequests(roleInput);
  const canCreate = canCreateMaterialRequests(roleInput);
  const isAdmin = hasRole(roleInput, 'admin');
  const isPresident = hasRole(roleInput, 'president');
  const isProcurement = hasRole(roleInput, 'admin') || hasRole(roleInput, 'warehouse_staff');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortKey, setSortKey] = useState<'createdAt' | 'status' | 'urgency'>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [activeTab, setActiveTab] = useState('all');
  const { data: requests, setData: setRequests, loading: requestsLoading, lastUpdated } = useResource<MaterialRequest[]>(
    '/material-requests',
    [],
    [searchTerm, sortKey, sortDir],
    15_000,
    {
      q: searchTerm || undefined,
      sortBy: sortKey,
      sortDir,
    }
  );
  const { data: projects } = useResource<Project[]>('/projects', [], [user?.id], 15_000, { picker: true });
  const { data: inventory } = useResource<InventoryItem[]>('/inventory', []);
  const [selectedRequest, setSelectedRequest] = useState<MaterialRequest | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [approvalRemarks, setApprovalRemarks] = useState('');
  const { toast } = useToast();

  // Form state for creating new request
  const [newRequest, setNewRequest] = useState({
    projectId: '',
    items: [{ itemId: '', quantity: 1, notes: '' }],
    purpose: '',
    urgency: 'normal' as UrgencyLevel,
  });
  const [requestErrors, setRequestErrors] = useState<Record<string, string>>({});

  const normalizedRequests = requests.map((req) => ({
    ...req,
    status: String(req.status || 'pending').toLowerCase() as MaterialRequest['status'],
    urgency: String(req.urgency || 'normal').toLowerCase() as UrgencyLevel,
  }));
  const scopedInventory = inventory;
  const scopedRequests = normalizedRequests;
  const filteredByStatus =
    statusFilter === 'all' ? scopedRequests : scopedRequests.filter((r) => r.status === statusFilter);
  const pendingRequests = filteredByStatus.filter((r) => r.status === 'pending');
  const presidentRequests = filteredByStatus.filter((r) => r.status === 'pm_approved');
  const approvedRequests = filteredByStatus.filter((r) => r.status === 'approved');
  const rejectedRequests = filteredByStatus.filter((r) => r.status === 'rejected');
  const fulfilledRequests = filteredByStatus.filter((r) => r.status === 'fulfilled');
  const canApproveSelected =
    Boolean(selectedRequest) &&
    canApprove &&
    ((selectedRequest?.status === 'pending' && (isAdmin || isPresident)) ||
      (selectedRequest?.status === 'pm_approved' && (isAdmin || isPresident)));

  const getDraftEstimatedCost = () =>
    newRequest.items.reduce((sum, item) => {
      const inv = scopedInventory.find((entry) => entry.id === item.itemId);
      return sum + (inv?.unitPrice || 0) * Number(item.quantity || 0);
    }, 0);

  const getStatusBadge = (status: MaterialRequest['status']) => {
    switch (status) {
      case 'pending':
        return <Badge className="bg-warning text-warning-foreground gap-1"><Clock size={12} />Office Review</Badge>;
      case 'pm_approved':
        return <Badge className="bg-blue-100 text-blue-800 gap-1"><Clock size={12} />President Approval</Badge>;
      case 'approved':
        return <Badge className="bg-success text-success-foreground gap-1"><CheckCircle size={12} />Approved - Procurement</Badge>;
      case 'rejected':
        return <Badge className="bg-destructive text-destructive-foreground gap-1"><XCircle size={12} />Rejected</Badge>;
      case 'fulfilled':
        return <Badge className="bg-info text-info-foreground">Fulfilled</Badge>;
    }
  };

  const getApprovalActionLabel = (request: MaterialRequest) => {
    if (request.status === 'pending') return 'Mark Reviewed';
    if (request.status === 'pm_approved') return 'Final Approve';
    return 'Approve';
  };

  const getStatusDescription = (request: MaterialRequest) => {
    switch (request.status) {
      case 'pending':
        return 'Pending Admin / President review';
      case 'pm_approved':
        return 'Reviewed. Waiting for final approval.';
      case 'approved':
        return 'President approved. Visible to Procurement.';
      case 'rejected':
        return 'Request rejected';
      case 'fulfilled':
        return 'Procurement fulfilled this request';
    }
  };

  const getFlowStepState = (
    request: MaterialRequest,
    step: 'pending' | 'pm_approved' | 'approved' | 'procurement'
  ) => {
    if (request.status === 'rejected') return step === 'pending' ? 'rejected' : 'upcoming';
    if (request.status === 'fulfilled') return 'complete';
    const order: Record<typeof step, number> = {
      pending: 0,
      pm_approved: 1,
      approved: 2,
      procurement: 3,
    };
    const current =
      request.status === 'pending'
        ? 0
        : request.status === 'pm_approved'
          ? 1
          : request.status === 'approved'
            ? 3
            : 0;
    if (order[step] < current) return 'complete';
    if (order[step] === current) return 'current';
    return 'upcoming';
  };

  const handleApprove = (request: MaterialRequest) => {
    const nextStatus: MaterialRequest['status'] = request.status === 'pending' ? 'pm_approved' : 'approved';
    setRequests((prev) =>
      prev.map((r) =>
        r.id === request.id
          ? {
              ...r,
              status: nextStatus,
              approvedBy: nextStatus === 'approved' ? user?.name || 'President' : r.approvedBy,
              approvedAt: nextStatus === 'approved' ? new Date().toISOString() : r.approvedAt,
              remarks: approvalRemarks,
            }
          : r
      )
    );
    toast({
      title: nextStatus === 'approved' ? 'Final Approval Complete' : 'Office Review Complete',
      description:
        nextStatus === 'approved'
          ? `${request.requestNumber} is approved and visible to Procurement.`
          : `${request.requestNumber} is ready for final approval.`,
    });
    apiClient
      .put<MaterialRequest>(`/material-requests/${request.id}`, {
        status: nextStatus,
        remarks: approvalRemarks,
      })
      .then((res) => {
        const updated = res.data;
        setRequests((prev) => prev.map((r) => (r.id === request.id ? updated : r)));
      })
      .catch(() => {
        // keep optimistic state
      });
    setIsDetailOpen(false);
    setApprovalRemarks('');
  };

  const handleReject = (request: MaterialRequest) => {
    setRequests((prev) =>
      prev.map((r) =>
        r.id === request.id
          ? {
              ...r,
              status: 'rejected' as const,
              remarks: approvalRemarks,
            }
          : r
      )
    );
    toast({
      title: 'Request Rejected',
      description: `${request.requestNumber} has been rejected.`,
      variant: 'destructive',
    });
    apiClient
      .put<MaterialRequest>(`/material-requests/${request.id}`, {
        status: 'rejected',
        remarks: approvalRemarks,
      })
      .then((res) => {
        const updated = res.data;
        setRequests((prev) => prev.map((r) => (r.id === request.id ? updated : r)));
      })
      .catch(() => {
        // keep optimistic state
      });
    setIsDetailOpen(false);
    setApprovalRemarks('');
  };


  const handleSubmitNewRequest = () => {
    if (!canCreate) {
      toast({ title: 'Not allowed', description: 'You do not have permission to create requests.', variant: 'destructive' });
      return;
    }
    const errors: Record<string, string> = {};
    if (!newRequest.projectId) errors.projectId = 'Project is required.';
    if (!newRequest.purpose.trim()) errors.purpose = 'Purpose is required.';
    if (!newRequest.items.length) {
      errors.items = 'Add at least one item.';
    } else {
      newRequest.items.forEach((item, idx) => {
        if (!item.itemId) {
          errors[`item-${idx}`] = 'Select an item.';
        }
        if (Number(item.quantity) <= 0 || Number.isNaN(Number(item.quantity))) {
          errors[`qty-${idx}`] = 'Qty must be greater than 0.';
        }
      });
      if (Object.keys(errors).some((k) => k.startsWith('item-') || k.startsWith('qty-'))) {
        errors.items = 'Each item must have a valid selection and quantity.';
      }
    }
    setRequestErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast({ title: 'Fix validation errors', description: 'Please review the highlighted fields.', variant: 'destructive' });
      return;
    }
    if (!newRequest.projectId) {
      toast({ title: 'Missing project', description: 'Select a project first.', variant: 'destructive' });
      return;
    }
    if (!newRequest.items.length || newRequest.items.some((item) => !item.itemId)) {
      toast({ title: 'Missing items', description: 'Add at least one item.', variant: 'destructive' });
      return;
    }
    if (newRequest.items.some((item) => Number(item.quantity) <= 0 || Number.isNaN(Number(item.quantity)))) {
      toast({ title: 'Invalid quantity', description: 'Quantity must be greater than 0.', variant: 'destructive' });
      return;
    }
    const project = projects.find((p) => p.id === newRequest.projectId);
    const tempId = `temp-${Date.now()}`;
    const created: MaterialRequest = {
      id: tempId,
      requestNumber: `REQ-${new Date().getFullYear()}-${Math.floor(Math.random() * 9000 + 1000)}`,
      projectId: newRequest.projectId,
      projectName: project?.name || '',
      requestedBy: user?.name || 'User',
      requestedById: user?.id || 'user-current',
      date: new Date().toISOString(),
      items: newRequest.items.map((item) => {
        const inv = scopedInventory.find((i) => i.id === item.itemId);
        return {
          itemId: item.itemId,
          itemName: inv?.name || '',
          unit: inv?.unit || '',
          quantity: item.quantity,
          unitPrice: inv?.unitPrice || 0,
          amount: (inv?.unitPrice || 0) * item.quantity,
          notes: item.notes || null,
        };
      }),
      purpose: newRequest.purpose,
      urgency: newRequest.urgency,
      status: 'pending',
      estimatedCost: newRequest.items.reduce((sum, item) => {
        const inv = scopedInventory.find((i) => i.id === item.itemId);
        return sum + (inv?.unitPrice || 0) * item.quantity;
      }, 0),
    };
    setRequests((prev) => [created, ...prev]);
    apiClient
      .post<MaterialRequest>('/material-requests', {
        projectId: newRequest.projectId,
        items: newRequest.items,
        purpose: newRequest.purpose,
        urgency: newRequest.urgency,
      })
      .then((res) => {
        setRequests((prev) => [res.data, ...prev.filter((r) => r.id !== tempId)]);
      })
      .catch(() => {
        // keep optimistic state
      });
    toast({
      title: 'Request Submitted',
      description: 'Your material request has been submitted to the Project Manager for review.',
    });
    // Reset form
    setNewRequest({
      projectId: '',
      items: [{ itemId: '', quantity: 1, notes: '' }],
      purpose: '',
      urgency: 'normal',
    });
    setRequestErrors({});
  };

  const handlePrintRequest = (request: MaterialRequest) => {
    const itemsHtml = request.items
      .map(
        (item) =>
          `<tr><td>${item.itemName}</td><td>${item.unit}</td><td>${item.quantity}</td><td>₱${formatPesoAmount(item.unitPrice)}</td><td>₱${formatPesoAmount(item.amount)}</td></tr>`
      )
      .join('');
    printHtml(
      `Material Request ${request.requestNumber}`,
      `<h1>Material Request</h1>
      <div class="meta meta-inline"><span class="doc-label">Request #:</span><span class="doc-code">${request.requestNumber}</span></div>
      <div class="meta-grid">
        <div class="meta">Date: ${new Date(request.date).toLocaleDateString('en-PH')}</div>
        <div class="meta">Project: ${request.projectName}</div>
        <div class="meta">Requested By: ${request.requestedBy}</div>
        <div class="meta">Status: ${request.status}</div>
        <div class="meta">Urgency: ${request.urgency}</div>
      </div>
      <table>
        <thead><tr><th>Item</th><th>Unit</th><th>Qty</th><th>Unit Price</th><th>Amount</th></tr></thead>
        <tbody>${itemsHtml}</tbody>
      </table>
      <div class="total">Estimated Total: ₱${formatPesoAmount(request.estimatedCost)}</div>
      <div class="meta meta-full">Purpose: ${request.purpose}</div>`
    );
  };

  const handleRowClick = (request: MaterialRequest) => {
    setSelectedRequest(request);
    setApprovalRemarks(request.remarks || '');
    setIsDetailOpen(true);
  };

  const RequestTable = ({ data }: { data: MaterialRequest[] }) => (
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
        {requestsLoading && data.length === 0 ? (
          <TableRow>
            <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
              <div className="space-y-2">
                <Skeleton className="h-4 w-1/2 mx-auto" />
                <Skeleton className="h-4 w-1/3 mx-auto" />
              </div>
            </TableCell>
          </TableRow>
        ) : data.length > 0 ? (
          data.map((request) => (
            <TableRow
              key={request.id}
              className="cursor-pointer hover:bg-muted/50"
              role="button"
              tabIndex={0}
              onClick={() => handleRowClick(request)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  handleRowClick(request);
                }
              }}
            >
              <TableCell className="font-medium">{request.requestNumber}</TableCell>
              <TableCell className="max-w-[200px] truncate">{request.projectName}</TableCell>
              <TableCell>{request.requestedBy}</TableCell>
              <TableCell>{new Date(request.date).toLocaleDateString('en-PH')}</TableCell>
              <TableCell>{getStatusBadge(request.status)}</TableCell>
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
              <div className="space-y-3">
                <p>No requests found</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveTab('create')}
                  disabled={!canCreate}
                >
                  Create Request
                </Button>
              </div>
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Material Requests</h1>
          <p className="text-muted-foreground">Manage requisition slips and stock requests</p>
        </div>
        {lastUpdated && (
          <p className="text-xs text-muted-foreground">
            Last updated {new Date(lastUpdated).toLocaleTimeString()}
          </p>
        )}
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
              <Input
                placeholder="Search requests..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value)}>
              <SelectTrigger className="w-full lg:w-[180px]">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Project Manager Review</SelectItem>
                <SelectItem value="pm_approved">President Approval</SelectItem>
                <SelectItem value="approved">Approved - Procurement</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="fulfilled">Fulfilled</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortKey} onValueChange={(value) => setSortKey(value as typeof sortKey)}>
              <SelectTrigger className="w-full lg:w-[180px]">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="createdAt">Sort: Date</SelectItem>
                <SelectItem value="urgency">Sort: Urgency</SelectItem>
                <SelectItem value="status">Sort: Status</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortDir} onValueChange={(value) => setSortDir(value as typeof sortDir)}>
              <SelectTrigger className="w-full lg:w-[140px]">
                <SelectValue placeholder="Direction" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="desc">Desc</SelectItem>
                <SelectItem value="asc">Asc</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="pending" className="gap-2">
            <Clock size={16} />
            PM Review ({pendingRequests.length})
          </TabsTrigger>
          <TabsTrigger value="president" className="gap-2">
            <Clock size={16} />
            President ({presidentRequests.length})
          </TabsTrigger>
          {(isProcurement || approvedRequests.length > 0) && (
            <TabsTrigger value="approved" className="gap-2">
              <CheckCircle size={16} />
              Procurement ({approvedRequests.length})
            </TabsTrigger>
          )}
          {rejectedRequests.length > 0 && (
            <TabsTrigger value="rejected" className="gap-2">
              <XCircle size={16} />
              Rejected ({rejectedRequests.length})
            </TabsTrigger>
          )}
          {fulfilledRequests.length > 0 && (
            <TabsTrigger value="fulfilled" className="gap-2">
              <CheckCircle size={16} />
              Fulfilled ({fulfilledRequests.length})
            </TabsTrigger>
          )}
          <TabsTrigger value="all">
            All Requests
          </TabsTrigger>
          {canCreate && (
            <TabsTrigger value="create" className="gap-2">
              <Plus size={16} />
              Create Request
            </TabsTrigger>
          )}
        </TabsList>

        {activeTab !== 'create' && null}

        <TabsContent value="pending">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Project Manager Review</CardTitle>
              <CardDescription>Requests waiting for the assigned Project Manager</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <RequestTable data={pendingRequests} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="president">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">President Approval</CardTitle>
              <CardDescription>Requests approved by Project Managers and waiting for final approval</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <RequestTable data={presidentRequests} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="approved">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Procurement</CardTitle>
              <CardDescription>Final-approved requests visible to Admin and Warehouse Staff</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <RequestTable data={approvedRequests} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rejected">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Rejected Requests</CardTitle>
              <CardDescription>Requests rejected during PM or President review</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <RequestTable data={rejectedRequests} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fulfilled">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Fulfilled Requests</CardTitle>
              <CardDescription>Requests completed by Procurement</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <RequestTable data={fulfilledRequests} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="create">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ClipboardList size={20} />
                New Material Request
              </CardTitle>
              <CardDescription>Submit a requisition slip for project materials</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="project">Project</Label>
                  <Select
                    value={newRequest.projectId}
                    onValueChange={(v) => {
                      const next = { ...newRequest, projectId: v };
                      setNewRequest(next);
                      if (requestErrors.projectId) {
                        setRequestErrors((prev) => ({ ...prev, projectId: '' }));
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select project" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {requestErrors.projectId && (
                    <p className="text-xs text-destructive">{requestErrors.projectId}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="urgency">Urgency Level</Label>
                  <Select
                    value={newRequest.urgency}
                    onValueChange={(v) =>
                      setNewRequest((prev) => ({ ...prev, urgency: v as UrgencyLevel }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Items Table */}
              <div className="space-y-2">
                <Label>Requested Items</Label>
                {requestErrors.items && (
                  <p className="text-xs text-destructive">{requestErrors.items}</p>
                )}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="w-[140px]">Unit Price</TableHead>
                      <TableHead className="w-[100px]">Quantity</TableHead>
                      <TableHead className="w-[160px]">Estimated Cost</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead className="w-[80px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {newRequest.items.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <Select
                            value={item.itemId}
                            onValueChange={(v) => {
                              const updated = [...newRequest.items];
                              updated[index].itemId = v;
                              setNewRequest((prev) => ({ ...prev, items: updated }));
                              if (requestErrors.items || requestErrors[`item-${index}`]) {
                                setRequestErrors((prev) => {
                                  const next = { ...prev };
                                  delete next.items;
                                  delete next[`item-${index}`];
                                  return next;
                                });
                              }
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select item" />
                            </SelectTrigger>
                            <SelectContent>
                              {scopedInventory.map((inv) => (
                                <SelectItem key={inv.id} value={inv.id}>
                                  {inv.name} ({inv.unit}) • ₱{inv.unitPrice.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {requestErrors[`item-${index}`] && (
                            <p className="text-xs text-destructive mt-1">{requestErrors[`item-${index}`]}</p>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm font-medium">
                            ₱
                            {(scopedInventory.find((i) => i.id === item.itemId)?.unitPrice || 0).toLocaleString('en-PH', {
                              minimumFractionDigits: 2,
                            })}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => {
                              const updated = [...newRequest.items];
                              updated[index].quantity = parseInt(e.target.value) || 1;
                              setNewRequest((prev) => ({ ...prev, items: updated }));
                              if (requestErrors.items || requestErrors[`qty-${index}`]) {
                                setRequestErrors((prev) => {
                                  const next = { ...prev };
                                  delete next.items;
                                  delete next[`qty-${index}`];
                                  return next;
                                });
                              }
                            }}
                          />
                          {requestErrors[`qty-${index}`] && (
                            <p className="text-xs text-destructive mt-1">{requestErrors[`qty-${index}`]}</p>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm font-semibold text-primary">
                            ₱
                            {(
                              (scopedInventory.find((i) => i.id === item.itemId)?.unitPrice || 0) *
                              Number(item.quantity || 0)
                            ).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Input
                            placeholder="Optional notes"
                            value={item.notes}
                            onChange={(e) => {
                              const updated = [...newRequest.items];
                              updated[index].notes = e.target.value;
                              setNewRequest((prev) => ({ ...prev, items: updated }));
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          {newRequest.items.length > 1 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setNewRequest((prev) => ({
                                  ...prev,
                                  items: prev.items.filter((_, i) => i !== index),
                                }));
                              }}
                            >
                              Ã—
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setNewRequest((prev) => ({
                      ...prev,
                      items: [...prev.items, { itemId: '', quantity: 1, notes: '' }],
                    }))
                  }
                >
                  <Plus size={16} className="mr-2" />
                  Add Item
                </Button>
                <div className="flex justify-end">
                  <div className="rounded-md bg-muted px-4 py-3 text-sm">
                    <span className="text-muted-foreground">Estimated Request Total: </span>
                    <span className="font-semibold text-primary">
                      ₱{getDraftEstimatedCost().toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="purpose">Purpose</Label>
                <Select
                  value={newRequest.purpose}
                  onValueChange={(value) => {
                    const next = { ...newRequest, purpose: value };
                    setNewRequest(next);
                    if (requestErrors.purpose) {
                      setRequestErrors((prev) => ({ ...prev, purpose: '' }));
                    }
                  }}
                >
                  <SelectTrigger id="purpose">
                    <SelectValue placeholder="Select request purpose" />
                  </SelectTrigger>
                  <SelectContent>
                    {MATERIAL_REQUEST_PURPOSE_OPTIONS.map((purpose) => (
                      <SelectItem key={purpose} value={purpose}>
                        {purpose}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {requestErrors.purpose && (
                  <p className="text-xs text-destructive">{requestErrors.purpose}</p>
                )}
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSubmitNewRequest} className="gap-2">
                  <ClipboardList size={18} />
                  Submit Request
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="all">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">All Requests</CardTitle>
              <CardDescription>Complete history of material requests</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <RequestTable data={filteredByStatus} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Request Detail Modal */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Request Details</DialogTitle>
            <DialogDescription>
              {selectedRequest?.requestNumber}
            </DialogDescription>
          </DialogHeader>

          {selectedRequest && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Request ID</p>
                  <p className="font-medium">{selectedRequest.requestNumber}</p>
                </div>
                {getStatusBadge(selectedRequest.status)}
              </div>
              <div className="rounded-md border bg-muted/30 p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Approval Flow</p>
                    <p className="text-xs text-muted-foreground">{getStatusDescription(selectedRequest)}</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                  {[
                    { key: 'pending' as const, label: 'Pending', detail: 'Engineer submitted' },
                    { key: 'pm_approved' as const, label: 'Project Manager Review', detail: selectedRequest.assignedProjectManagerName || 'Assigned PM' },
                    { key: 'approved' as const, label: 'President Approval', detail: selectedRequest.approvedBy || 'Final approval' },
                    { key: 'procurement' as const, label: 'Procurement', detail: 'Admin / Warehouse' },
                  ].map((step) => {
                    const state = getFlowStepState(selectedRequest, step.key);
                    return (
                      <div key={step.key} className="flex items-start gap-2">
                        <span
                          className={cn(
                            'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold',
                            state === 'complete' && 'border-emerald-600 bg-emerald-600 text-white',
                            state === 'current' && 'border-blue-600 bg-blue-50 text-blue-700',
                            state === 'rejected' && 'border-red-600 bg-red-50 text-red-700',
                            state === 'upcoming' && 'border-muted-foreground/30 bg-background text-muted-foreground'
                          )}
                        >
                          {state === 'complete' ? <CheckCircle size={13} /> : state === 'rejected' ? <XCircle size={13} /> : null}
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-medium leading-tight">{step.label}</p>
                          <p className="truncate text-[11px] text-muted-foreground">{step.detail}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Project</p>
                  <p className="font-medium">{selectedRequest.projectName}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Requested By</p>
                  <p className="font-medium">{selectedRequest.requestedBy}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Date</p>
                  <p className="font-medium">{new Date(selectedRequest.date).toLocaleDateString('en-PH')}</p>
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-2">Requested Items</p>
                <ul className="space-y-1 text-sm">
                  {selectedRequest.items.map((item, idx) => (
                    <li key={idx} className="flex items-center justify-between border-b pb-1">
                      <span>{item.itemName}</span>
                      <span className="font-medium">{item.quantity}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="space-y-2">
                <Label htmlFor="remarks">Remarks</Label>
                <Textarea
                  id="remarks"
                  placeholder="Review notes..."
                  value={approvalRemarks}
                  onChange={(e) => setApprovalRemarks(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            {selectedRequest && (
              <Button variant="outline" onClick={() => handlePrintRequest(selectedRequest)}>
                <FileText size={16} className="mr-2" />
                Download PDF
              </Button>
            )}
            {selectedRequest && ['pending', 'pm_approved'].includes(selectedRequest.status) ? (
              <>
                <Button
                  className="bg-red-600 hover:bg-red-700 text-white"
                  onClick={() => setIsDetailOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => handleReject(selectedRequest)}
                  className="gap-2 bg-red-600 hover:bg-red-700 text-white"
                  disabled={!canApproveSelected}
                >
                  <XCircle size={16} />
                  Reject
                </Button>
                <Button
                  onClick={() => handleApprove(selectedRequest)}
                  className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                  disabled={!canApproveSelected}
                >
                  <CheckCircle size={16} />
                  {getApprovalActionLabel(selectedRequest)}
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={() => setIsDetailOpen(false)}>
                Close
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
