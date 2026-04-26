import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
import { Textarea } from '@/components/ui/textarea';
import { Search, Eye, Truck, Package, CheckCircle, RotateCcw, Upload, FileText, Clock, Navigation } from 'lucide-react';
import type { Delivery, DeliveryStatus } from '@/types';
import { toast } from '@/hooks/use-toast';
import { useResource } from '@/hooks/use-resource';
import { printHtml } from '@/utils/print';
import { apiClient } from '@/api/client';
import { getCache, setCache } from '@/hooks/cache';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { canManageLogistics } from '@/lib/roles';
import PaginationNav from '@/components/PaginationNav';
import LiveTrackingDialog from '@/components/LiveTrackingDialog';

const statusColors: Record<DeliveryStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  'in-transit': 'bg-blue-100 text-blue-800',
  delivered: 'bg-green-100 text-green-800',
  delayed: 'bg-orange-100 text-orange-800',
  'return-pending': 'bg-orange-100 text-orange-800',
  'return-rejected': 'bg-slate-100 text-slate-700',
  returned: 'bg-red-100 text-red-800',
};

const delayedBadge = 'bg-orange-100 text-orange-800';

const statusIcons: Record<DeliveryStatus, React.ReactNode> = {
  pending: <Package size={16} />,
  'in-transit': <Truck size={16} />,
  delivered: <CheckCircle size={16} />,
  delayed: <Clock size={16} />,
  'return-pending': <RotateCcw size={16} />,
  'return-rejected': <RotateCcw size={16} />,
  returned: <RotateCcw size={16} />,
};

// TODO: Replace with real data 
export default function LogisticsPage() {
  const { user } = useAuth();
  const roleInput = user?.roles?.length ? user.roles : user?.role;
  const canManage = canManageLogistics(roleInput);
  const isAdmin = Array.isArray(roleInput) ? roleInput.includes('admin') : roleInput === 'admin';
  const isDeliveryGuy = Array.isArray(roleInput) ? roleInput.includes('delivery_guy') : roleInput === 'delivery_guy';
  const [deliveries, setDeliveries] = useState<Delivery[]>(
    () => getCache<Delivery[]>('deliveries') || []
  );
  const [deliveriesTotal, setDeliveriesTotal] = useState(0);
  const [deliveriesPage, setDeliveriesPage] = useState(1);
  const [deliveriesPageSize] = useState(10);
  const [deliveriesLoading, setDeliveriesLoading] = useState(false);
  const [sortKey, setSortKey] = useState<'createdAt' | 'status' | 'eta'>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedDelivery, setSelectedDelivery] = useState<Delivery | null>(null);
  const [trackingDelivery, setTrackingDelivery] = useState<Delivery | null>(null);
  const [showDRPreview, setShowDRPreview] = useState(false);
  const [receivedBy, setReceivedBy] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [isReturnOpen, setIsReturnOpen] = useState(false);
  const [isRejectReturnOpen, setIsRejectReturnOpen] = useState(false);
  const [returnRejectReason, setReturnRejectReason] = useState('');
  const [deliveryLogs, setDeliveryLogs] = useState<{ id: string; timestamp: string; action: string; details: string }[]>([]);
  const { data: company } = useResource('/company', {
    name: 'Impex Engineering and Industrial Supply',
    address: '6959 Washington St., Pio Del Pilar, Makati City',
    tin: '100-191-563-00000',
    phone: '+63 2 8123 4567',
    email: 'sales@impex.ph',
    website: 'www.impex.ph',
  });
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredDeliveries = deliveries.filter((delivery) => {
    const matchesSearch =
      !normalizedSearch ||
      delivery.drNumber?.toLowerCase().includes(normalizedSearch) ||
      delivery.orderNumber?.toLowerCase().includes(normalizedSearch) ||
      delivery.clientName?.toLowerCase().includes(normalizedSearch) ||
      delivery.projectName?.toLowerCase().includes(normalizedSearch);
    const matchesStatus = statusFilter === 'all' || delivery.status === statusFilter;
    return matchesSearch && matchesStatus;
  });
  const deliveriesPageStart = (deliveriesPage - 1) * deliveriesPageSize;
  const deliveriesPageEnd = deliveriesPageStart + deliveriesPageSize;
  const pagedDeliveries = filteredDeliveries.slice(deliveriesPageStart, deliveriesPageEnd);
  const totalFilteredDeliveries = filteredDeliveries.length;

  const fetchDeliveries = async () => {
    setDeliveriesLoading(true);
    try {
      const response = await apiClient.get('/deliveries', {
        params: {
          q: searchTerm || undefined,
          status: statusFilter !== 'all' ? statusFilter : undefined,
          page: 1,
          pageSize: 1000,
          sortBy: sortKey,
          sortDir,
        },
      });
      const payload = response.data;
      const normalizeDeliveries = (items: any[]) =>
        items.map((delivery) => ({
          ...delivery,
          status: String(delivery.status || 'pending').toLowerCase(),
        }));
      if (payload?.data) {
        const normalized = normalizeDeliveries(payload.data);
        setDeliveries(normalized);
        setDeliveriesTotal(payload.total || normalized.length);
        setCache('deliveries', normalized);
      } else {
        const normalized = Array.isArray(payload) ? normalizeDeliveries(payload) : [];
        setDeliveries(normalized);
        setDeliveriesTotal(normalized.length || 0);
        setCache('deliveries', normalized);
      }
    } catch (err) {
      setDeliveries([]);
      setDeliveriesTotal(0);
    } finally {
      setDeliveriesLoading(false);
    }
  };

  useEffect(() => {
    fetchDeliveries();
  }, [searchTerm, statusFilter, deliveriesPage, deliveriesPageSize, sortKey, sortDir]);

  useEffect(() => {
    setDeliveriesPage(1);
  }, [searchTerm, statusFilter, sortKey, sortDir]);

  const syncSelectedDelivery = (delivery: Delivery) => {
    setSelectedDelivery((current) => (current?.id === delivery.id ? delivery : current));
    setTrackingDelivery((current) => (current?.id === delivery.id ? delivery : current));
  };

  const handleUpdateStatus = async (
    delId: string,
    newStatus: DeliveryStatus,
    meta?: { receivedBy?: string; notes?: string }
  ) => {
    const receivedByValue = meta?.receivedBy ?? receivedBy;
    const notesValue = meta?.notes ?? deliveryNotes;
    if (newStatus === 'delivered' && !receivedByValue.trim()) {
      toast({
        title: 'Missing receiver',
        description: 'Please enter who received the delivery.',
        variant: 'destructive',
      });
      return;
    }
    if ((newStatus === 'return-pending' || newStatus === 'delayed') && !notesValue.trim()) {
      toast({
        title: 'Missing notes',
        description: 'Please provide delivery notes before continuing.',
        variant: 'destructive',
      });
      return;
    }
    if (newStatus === 'return-rejected' && !returnRejectReason.trim()) {
      toast({
        title: 'Missing rejection reason',
        description: 'Please provide a rejection reason.',
        variant: 'destructive',
      });
      return;
    }
    const updatedDeliveries = deliveries.map((d) => {
      if (d.id === delId) {
        const updates: Partial<Delivery> = { status: newStatus };
        if (newStatus === 'delivered') {
          updates.receivedBy = receivedByValue || 'Client Representative';
          updates.receivedAt = new Date().toISOString();
          updates.notes = notesValue;
        }
        if (newStatus === 'return-pending') {
          updates.notes = notesValue;
        }
        if (newStatus === 'delayed') {
          updates.notes = notesValue;
        }
        if (newStatus === 'return-rejected') {
          updates.returnRejectionReason = returnRejectReason;
        }
        return { ...d, ...updates };
      }
      return d;
    });
    setDeliveries(updatedDeliveries);
    const updatedDelivery = updatedDeliveries.find((d) => d.id === delId);
    if (updatedDelivery) {
      syncSelectedDelivery(updatedDelivery);
      const payload: Partial<Delivery> & { returnRejectionReason?: string } = { ...updatedDelivery };
      if (newStatus === 'return-rejected') {
        payload.returnRejectionReason = returnRejectReason;
      }
      try {
        const response = await apiClient.put<Delivery>(`/deliveries/${delId}`, payload);
        const savedDelivery = response.data as Delivery;
        setDeliveries((current) => current.map((delivery) => (delivery.id === delId ? savedDelivery : delivery)));
        syncSelectedDelivery(savedDelivery);
      } catch (_err) {
        // Keep optimistic update on UI if API fails
      }
    }
    toast({
      title: 'Delivery Updated',
      description: `Status changed to ${newStatus}`,
    });
    setSelectedDelivery(null);
    setReceivedBy('');
    setDeliveryNotes('');
    setIsReturnOpen(false);
  };

  const handleUploadProof = async (deliveryId: string, file: File) => {
    const formData = new FormData();
    formData.append('proof', file);
    const response = await apiClient.post(`/deliveries/${deliveryId}/proof`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    const updated = response.data as Delivery;
    setDeliveries((current) => current.map((delivery) => (delivery.id === deliveryId ? updated : delivery)));
    syncSelectedDelivery(updated);
    toast({
      title: 'Proof uploaded',
      description: 'Proof of delivery has been attached successfully.',
    });
  };

  const handlePrintDelivery = (delivery: Delivery) => {
    const itemsHtml = delivery.items
      .map(
        (item) =>
          `<tr><td>${item.itemName}</td><td>${item.unit}</td><td>${item.quantity}</td></tr>`
      )
      .join('');
    printHtml(
      `Delivery ${delivery.drNumber}`,
      `<h1>Delivery Receipt</h1>
      <div class=\"meta meta-inline\"><span class=\"doc-label\">DR #:</span><span class=\"doc-code\">${delivery.drNumber}</span></div>
      <div class=\"meta-grid\">
        <div class=\"meta\">Date Issued: ${delivery.issuedAt ? format(new Date(delivery.issuedAt), 'yyyy-MM-dd') : '—'}</div>
        <div class=\"meta\">ETA: ${delivery.eta ? format(new Date(delivery.eta), 'MMM dd, yyyy') : '—'}</div>
        <div class=\"meta\">Client: ${delivery.clientName}</div>
        <div class=\"meta\">Project: ${delivery.projectName || 'N/A'}</div>
        <div class=\"meta\">Status: ${delivery.status}</div>
      </div>
      <table>
        <thead><tr><th>Item</th><th>Unit</th><th>Qty</th></tr></thead>
        <tbody>${itemsHtml}</tbody>
      </table>
      <div class=\"meta-grid\">
        <div class=\"meta\">Issued By: ${delivery.issuedBy}</div>
        <div class=\"meta\">Received By: ${delivery.receivedBy || '—'}</div>
      </div>`
    );
  };

  const isDelayed = (delivery: Delivery) => {
    if (!delivery.eta) return false;
    const eta = new Date(delivery.eta);
    const now = new Date();
    return (delivery.status === 'pending' || delivery.status === 'in-transit') && eta < now;
  };

  const handleProcessReturn = (delivery: Delivery) => {
    setSelectedDelivery(delivery);
    setDeliveryNotes(delivery.notes || '');
    setIsReturnOpen(true);
  };

  const handleRejectReturn = (delivery: Delivery) => {
    setSelectedDelivery(delivery);
    setReturnRejectReason('');
    setIsRejectReturnOpen(true);
  };

  useEffect(() => {
    if (!selectedDelivery || !isAdmin) {
      setDeliveryLogs([]);
      return;
    }
    apiClient
      .get('/audit-logs', { params: { q: selectedDelivery.drNumber } })
      .then((res) => {
        const payload = res.data?.data || res.data || [];
        setDeliveryLogs(payload);
      })
      .catch(() => setDeliveryLogs([]));
  }, [selectedDelivery, user?.role]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Logistics & Deliveries</h2>
        {isDeliveryGuy && !isAdmin && (
          <p className="text-muted-foreground">Only deliveries assigned to you are shown here.</p>
        )}
      </div>

      <div className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search deliveries..."
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setDeliveriesPage(1);
                    }}
                    className="pl-10"
                  />
                </div>
                <Select
                  value={statusFilter}
                  onValueChange={(value) => {
                    setStatusFilter(value);
                    setDeliveriesPage(1);
                  }}
                >
                  <SelectTrigger className="w-full lg:w-[180px]">
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="in-transit">In Transit</SelectItem>
                    <SelectItem value="delayed">Delayed</SelectItem>
                    <SelectItem value="delivered">Delivered</SelectItem>
                    <SelectItem value="return-pending">Return Pending</SelectItem>
                    <SelectItem value="return-rejected">Return Rejected</SelectItem>
                    <SelectItem value="returned">Returned</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sortKey} onValueChange={(value) => setSortKey(value as typeof sortKey)}>
                  <SelectTrigger className="w-full lg:w-[160px]">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="createdAt">Sort: Date</SelectItem>
                    <SelectItem value="eta">Sort: ETA</SelectItem>
                    <SelectItem value="status">Sort: Status</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sortDir} onValueChange={(value) => setSortDir(value as typeof sortDir)}>
                  <SelectTrigger className="w-full lg:w-[130px]">
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

          {/* Deliveries Table */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Delivery</TableHead>
                    <TableHead>Client / Project</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveriesLoading && deliveries.length === 0 ? (
                    Array.from({ length: 6 }).map((_, idx) => (
                      <TableRow key={`sk-${idx}`}>
                        <TableCell colSpan={5}>
                          <Skeleton className="h-6 w-full" />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    pagedDeliveries.map((delivery) => (
                    <TableRow key={delivery.id}>
                      <TableCell className="py-4">
                        <div className="min-w-[140px]">
                          <p className="font-medium text-foreground">{delivery.drNumber}</p>
                          <p className="text-sm text-muted-foreground">{delivery.orderNumber}</p>
                        </div>
                      </TableCell>
                      <TableCell className="py-4">
                        <div className="min-w-[220px]">
                          <p className="font-medium text-foreground">{delivery.clientName}</p>
                          <p className="text-sm text-muted-foreground truncate">
                            {delivery.projectName || 'No linked project'}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="py-4">
                        <div className="min-w-[130px] text-sm text-muted-foreground">
                          {delivery.items.length} items • {format(new Date(delivery.eta), 'MMM dd')}
                        </div>
                      </TableCell>
                      <TableCell>
                        {isDelayed(delivery) ? (
                          <Badge className={`${delayedBadge} flex items-center gap-1 w-fit`}>
                            <Clock size={16} />
                            delayed
                          </Badge>
                        ) : (
                          <Badge className={`${statusColors[delivery.status]} flex items-center gap-1 w-fit`}>
                            {statusIcons[delivery.status]}
                            {delivery.status}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-primary/20 text-primary"
                            onClick={() => setTrackingDelivery(delivery)}
                          >
                            <Navigation size={16} className="mr-1" />
                            Track
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedDelivery(delivery)}
                          >
                            <Eye size={16} />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <div className="flex items-center justify-center">
            <PaginationNav
              page={deliveriesPage}
              totalPages={Math.max(Math.ceil(totalFilteredDeliveries / deliveriesPageSize), 1)}
              onPageChange={setDeliveriesPage}
              disabled={deliveriesLoading}
            />
          </div>
      </div>

      {/* Delivery Detail Dialog */}
      <Dialog open={!!selectedDelivery} onOpenChange={() => setSelectedDelivery(null)}>
        <DialogContent className="max-w-3xl w-full max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedDelivery?.drNumber}</DialogTitle>
            <DialogDescription>
              {selectedDelivery?.clientName} • {selectedDelivery?.projectName}
            </DialogDescription>
          </DialogHeader>
          {selectedDelivery && (
            <div className="space-y-4">
              {/* DR Preview */}
              <div className="border rounded-lg p-4 sm:p-6 bg-white">
                <div className="text-center border-b pb-4 mb-4">
                  <h3 className="text-xl font-bold text-sidebar">{company.name}</h3>
                  <p className="text-sm text-muted-foreground">{company.address}</p>
                </div>
                <div className="text-center mb-4">
                  <h4 className="text-lg font-bold">DELIVERY RECEIPT</h4>
                  <p className="text-primary font-medium">{selectedDelivery.drNumber}</p>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                  <div>
                    <p><span className="font-medium">Client:</span> {selectedDelivery.clientName}</p>
                    <p><span className="font-medium">Project:</span> {selectedDelivery.projectName || 'N/A'}</p>
                  </div>
                  <div className="text-right">
                    <p><span className="font-medium">Date:</span> {format(new Date(selectedDelivery.issuedAt), 'MMM dd, yyyy')}</p>
                    <p><span className="font-medium">ETA:</span> {format(new Date(selectedDelivery.eta), 'MMM dd, yyyy')}</p>
                  </div>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-center">Qty</TableHead>
                      <TableHead>Unit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedDelivery.items.map((item) => (
                      <TableRow key={item.itemId}>
                        <TableCell>{item.itemName}</TableCell>
                        <TableCell className="text-center">{item.quantity}</TableCell>
                        <TableCell>{item.unit}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              <div className="grid grid-cols-2 gap-4 mt-6 pt-4 border-t text-sm">
                <div>
                  <p className="font-medium">Issued By:</p>
                  <p>{selectedDelivery.issuedBy}</p>
                </div>
                <div>
                  <p className="font-medium">Received By:</p>
                  <p>{selectedDelivery.receivedBy || '_______________'}</p>
                </div>
              </div>
            </div>

              {isAdmin && (
                <div className="mt-4 rounded-lg border p-3">
                  <p className="text-sm font-medium mb-2">Recent Activity</p>
                  {deliveryLogs.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No recent activity.</p>
                  ) : (
                    <div className="space-y-2">
                      {deliveryLogs.slice(0, 5).map((log) => (
                        <div key={log.id} className="text-xs text-muted-foreground">
                          {new Date(log.timestamp).toLocaleString('en-PH')} • {log.action} • {log.details}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Status Actions */}
              {canManage && selectedDelivery.status === 'in-transit' && (
                <div className="space-y-3 p-4 bg-muted rounded-lg">
                  <Label>Confirm Delivery</Label>
                  <Input
                    placeholder="Received by (name)"
                    value={receivedBy}
                    onChange={(e) => setReceivedBy(e.target.value)}
                  />
                  <Textarea
                    placeholder="Delivery notes..."
                    value={deliveryNotes}
                    onChange={(e) => setDeliveryNotes(e.target.value)}
                  />
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm">
                      <Upload size={14} className="mr-1" />
                      Upload Proof
                    </Button>
                    <span className="text-sm text-muted-foreground">Photo proof of delivery</span>
                  </div>
                </div>
              )}

              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setSelectedDelivery(null)}>
                  Close
                </Button>
                <Button variant="outline" onClick={() => handlePrintDelivery(selectedDelivery)}>
                  <FileText size={16} className="mr-1" />
                  Download PDF
                </Button>
                {canManage && selectedDelivery.status === 'pending' && (
                  <Button
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={() => handleUpdateStatus(selectedDelivery.id, 'in-transit')}
                  >
                    <Truck size={16} className="mr-1" />
                    Dispatch
                  </Button>
                )}
                {canManage && selectedDelivery.status === 'in-transit' && (
                  <Button
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={() => handleUpdateStatus(selectedDelivery.id, 'delivered')}
                  >
                    <CheckCircle size={16} className="mr-1" />
                    Confirm Delivery
                  </Button>
                )}
                {canManage && (selectedDelivery.status === 'pending' || selectedDelivery.status === 'in-transit') && (
                  <Button
                    className="bg-orange-600 hover:bg-orange-700 text-white"
                    onClick={() => handleUpdateStatus(selectedDelivery.id, 'delayed')}
                  >
                    Report Delay
                  </Button>
                )}
                {canManage && selectedDelivery.status === 'return-pending' && (
                  <Button
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={() => handleProcessReturn(selectedDelivery)}
                  >
                    Approve Return
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <LiveTrackingDialog
        delivery={trackingDelivery}
        open={!!trackingDelivery}
        onOpenChange={(open) => {
          if (!open) setTrackingDelivery(null);
        }}
        readOnly={!canManage}
        onStatusUpdate={canManage ? handleUpdateStatus : undefined}
        onUploadProof={canManage ? handleUploadProof : undefined}
      />

      <Dialog open={isReturnOpen} onOpenChange={setIsReturnOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Return</DialogTitle>
            <DialogDescription>Confirm return and restock items.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Return Reason</Label>
            <div className="rounded-md border p-3 text-sm text-muted-foreground">
              {deliveryNotes || 'No reason provided'}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => setIsReturnOpen(false)}
            >
              Cancel
            </Button>
            {selectedDelivery && (
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => handleUpdateStatus(selectedDelivery.id, 'returned')}
              >
                Approve Return
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isRejectReturnOpen} onOpenChange={setIsRejectReturnOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Return</DialogTitle>
            <DialogDescription>Provide a reason for rejecting this return.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Rejection Reason</Label>
            <Textarea
              value={returnRejectReason}
              onChange={(e) => setReturnRejectReason(e.target.value)}
              placeholder="Reason for rejection..."
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => setIsRejectReturnOpen(false)}
            >
              Cancel
            </Button>
            {selectedDelivery && (
              <Button
                className="bg-red-600 hover:bg-red-700 text-white"
                onClick={() => handleUpdateStatus(selectedDelivery.id, 'return-rejected')}
              >
                Reject Return
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
