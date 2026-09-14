import { useEffect, useMemo, useState } from 'react';
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
import { Search, Truck, Package, CheckCircle, RotateCcw, Upload, FileText, Clock, Navigation, Send, Undo2, Loader2 } from 'lucide-react';
import type { Delivery, DeliveryStatus, Order } from '@/types';
import { toast } from '@/hooks/use-toast';
import { useResource } from '@/hooks/use-resource';
import { printHtml } from '@/utils/print';
import { apiClient } from '@/api/client';
import { getCache, setCache } from '@/hooks/cache';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { RecentActivityPanel } from '@/components/RecentActivityPanel';
import PaginationNav from '@/components/PaginationNav';
import LiveTrackingDialog from '@/components/LiveTrackingDialog';
import StatusFilterSelect from '@/components/StatusFilterSelect';
import { statusBadgeClass } from '@/lib/statusStyles';

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
const RECEIVER_OPTIONS = ['Sir Jason', 'Project In-charge', 'Safety Officer', 'Site Engineer'];
type DeliveryDelayType = NonNullable<Delivery['delayType']>;

function getApiErrorMessage(error: unknown, fallback: string) {
  const apiError = error as { response?: { data?: { error?: string } } };
  return apiError.response?.data?.error || fallback;
}

function getDeliveryTimeline(delivery: Delivery) {
  return [
    {
      label: 'Pending',
      detail: 'Ready in Logistics',
      active: ['pending', 'in-transit', 'delayed', 'delivered', 'return-pending', 'returned', 'return-rejected'].includes(delivery.status),
    },
    {
      label: 'In Transit',
      detail: 'Delivery has begun',
      active: ['in-transit', 'delayed', 'delivered', 'return-pending', 'returned', 'return-rejected'].includes(delivery.status),
    },
    {
      label: 'Delivered',
      detail: 'Received on site',
      active: ['delivered', 'return-pending', 'returned', 'return-rejected'].includes(delivery.status),
    },
  ];
}

// TODO: Replace with real data 
export default function LogisticsPage() {
  const { user } = useAuth();
  const roleInput = user?.roles?.length ? user.roles : user?.role;
  const roleList = (Array.isArray(roleInput) ? roleInput : roleInput ? [roleInput] : []).map((role) => String(role).toLowerCase());
  const isAdmin = roleList.includes('admin');
  const isWarehouseStaff = roleList.includes('warehouse_staff');
  const isDeliveryGuy = roleList.includes('delivery_guy') || roleList.includes('driver');
  const canExecuteDelivery = isDeliveryGuy;
  const canConfirmLoading = isWarehouseStaff || isDeliveryGuy;
  const canCreateDeliveryRequest = isAdmin || isWarehouseStaff;
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
  const [showTruckLoad, setShowTruckLoad] = useState(false);
  const [isStartingTruckTrip, setIsStartingTruckTrip] = useState(false);
  const [showDRPreview, setShowDRPreview] = useState(false);
  const [receivedBy, setReceivedBy] = useState('');
  const [receiverAddress, setReceiverAddress] = useState('');
  const [receiverContactNumber, setReceiverContactNumber] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [deliveryEta, setDeliveryEta] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState('TRUCK');
  const [delayCase, setDelayCase] = useState<DeliveryDelayType>('traffic');
  const [isReturnOpen, setIsReturnOpen] = useState(false);
  const [isRejectReturnOpen, setIsRejectReturnOpen] = useState(false);
  const [returnRejectReason, setReturnRejectReason] = useState('');
  const [isLalamoveOpen, setIsLalamoveOpen] = useState(false);
  const [lalamoveForm, setLalamoveForm] = useState({
    clientOrderId: '',
    deliveryMethod: 'LALAMOVE',
    provider: 'Lalamove',
    reference: '',
    loadKg: '',
    notes: '',
  });
  const thirdPartyProviders = ['Lalamove', 'Transportify', 'Grab Express', 'Toktok', 'Other third-party courier'];
  const [deliveryLogs, setDeliveryLogs] = useState<{ id: string; timestamp: string; action: string; details: string }[]>([]);
  const { data: orders } = useResource<Order[]>(canCreateDeliveryRequest ? '/orders' : '', [], [canCreateDeliveryRequest]);
  const { data: company } = useResource('/company', {
    name: 'Impex Engineering and Industrial Supply',
    address: '6959 Washington St., Pio Del Pilar, Makati City',
    tin: '100-191-563-000',
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
  const loadedTruckDeliveries = useMemo(
    () =>
      deliveries.filter(
        (delivery) =>
          delivery.status === 'pending' &&
          Boolean(delivery.loadedAt) &&
          (delivery.deliveryMethod || 'TRUCK') === 'TRUCK',
      ),
    [deliveries],
  );
  const activeTruckDeliveries = useMemo(
    () =>
      deliveries.filter(
        (delivery) =>
          ['in-transit', 'delayed'].includes(delivery.status) &&
          (delivery.deliveryMethod || 'TRUCK') === 'TRUCK',
      ),
    [deliveries],
  );
  const loadedTruckKg = useMemo(
    () =>
      Math.round(
        loadedTruckDeliveries.reduce(
          (total, delivery) => total + Number(delivery.loadKg || 0),
          0,
        ) * 10,
      ) / 10,
    [loadedTruckDeliveries],
  );
  const receivedByOptions = useMemo(() => {
    return RECEIVER_OPTIONS;
  }, [selectedDelivery]);

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
    meta?: { receivedBy?: string; notes?: string; eta?: string }
  ) => {
    const previousDeliveries = deliveries;
    const receivedByValue = meta?.receivedBy ?? receivedBy;
    const notesValue = meta?.notes ?? deliveryNotes;
    const etaValue = meta?.eta ?? deliveryEta;
    const currentDelivery = deliveries.find((delivery) => delivery.id === delId);
    const isResumingDelivery =
      newStatus === 'in-transit' && currentDelivery?.status === 'delayed';
    if (newStatus === 'delivered' && !receivedByValue.trim()) {
      toast({
        title: 'Missing receiver',
        description: 'Please enter who received the delivery.',
        variant: 'destructive',
      });
      return;
    }
    if (newStatus === 'delivered' && !currentDelivery?.proofOfDelivery) {
      toast({
        title: 'Proof required',
        description: 'Upload proof of delivery before confirming completion.',
        variant: 'destructive',
      });
      return;
    }
    if (newStatus === 'in-transit' && !isResumingDelivery) {
      if (!receivedByValue.trim()) {
        toast({
          title: 'Select receiver',
          description: 'Choose who is expected to receive the delivery before beginning the trip.',
          variant: 'destructive',
        });
        return;
      }
      if (!receiverAddress.trim() || !receiverContactNumber.trim()) {
        toast({
          title: 'Receiver details required',
          description: 'Enter the receiver address and contact number before beginning delivery.',
          variant: 'destructive',
        });
        return;
      }
      if (!etaValue) {
        toast({
          title: 'Planned ETA required',
          description: 'Enter the planned ETA before beginning delivery.',
          variant: 'destructive',
        });
        return;
      }
    }
    if ((newStatus === 'return-pending' || newStatus === 'delayed') && !notesValue.trim()) {
      toast({
        title: 'Missing notes',
        description: 'Please provide delivery notes before continuing.',
        variant: 'destructive',
      });
      return;
    }
    if (newStatus === 'delayed' && !etaValue) {
      toast({
        title: 'Missing updated ETA',
        description: 'Please enter the new expected delivery time before reporting a delay.',
        variant: 'destructive',
      });
      return;
    }
    if (newStatus === 'delayed' && new Date(etaValue).getTime() <= Date.now()) {
      toast({
        title: 'Invalid updated ETA',
        description: 'The new expected delivery time must be later than the current time.',
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
        if (newStatus === 'in-transit') {
          updates.receiverName = receivedByValue;
          updates.receiverAddress = receiverAddress;
          updates.receiverContactNumber = receiverContactNumber;
          if (etaValue) updates.eta = new Date(etaValue).toISOString();
          updates.notes = notesValue;
          updates.deliveryMethod = deliveryMethod;
        }
        if (newStatus === 'delivered') {
          updates.receivedBy = receivedByValue || RECEIVER_OPTIONS[0];
          updates.receiverName = receivedByValue || RECEIVER_OPTIONS[0];
          updates.receiverAddress = receiverAddress;
          updates.receiverContactNumber = receiverContactNumber;
          updates.receivedAt = new Date().toISOString();
          updates.notes = notesValue;
        }
        if (newStatus === 'return-pending') {
          updates.notes = notesValue;
        }
        if (newStatus === 'delayed') {
          updates.notes = notesValue;
          updates.eta = new Date(etaValue).toISOString();
          updates.deliveryMethod = deliveryMethod;
          updates.delayType = delayCase;
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
      const payload: Partial<Delivery> & { returnRejectionReason?: string } = {
        status: newStatus,
        receivedBy: updatedDelivery.receivedBy,
        receiverName: updatedDelivery.receiverName,
        receiverAddress: updatedDelivery.receiverAddress,
        receiverContactNumber: updatedDelivery.receiverContactNumber,
        receivedAt: updatedDelivery.receivedAt,
        notes: updatedDelivery.notes,
        eta: updatedDelivery.eta,
        proofOfDelivery: updatedDelivery.proofOfDelivery,
        deliveryMethod: updatedDelivery.deliveryMethod,
        loadKg: updatedDelivery.loadKg,
        thirdPartyProvider: updatedDelivery.thirdPartyProvider,
        thirdPartyReference: updatedDelivery.thirdPartyReference,
        delayType: updatedDelivery.delayType,
      };
      if (newStatus === 'return-rejected') {
        payload.returnRejectionReason = returnRejectReason;
      }
      try {
        const cleanPayload = Object.fromEntries(
          Object.entries(payload).filter(([, value]) => value !== undefined && value !== null && value !== '')
        );
        const response = await apiClient.put<Delivery>(`/deliveries/${delId}`, cleanPayload);
        const savedDelivery = response.data as Delivery;
        setDeliveries((current) => current.map((delivery) => (delivery.id === delId ? savedDelivery : delivery)));
        syncSelectedDelivery(savedDelivery);
      } catch (err: any) {
        setDeliveries(previousDeliveries);
        const restoredDelivery = previousDeliveries.find((delivery) => delivery.id === delId);
        if (restoredDelivery) syncSelectedDelivery(restoredDelivery);
        toast({
          title: 'Status not updated',
          description: err?.response?.data?.error || 'The delivery status could not be saved. Please refresh and try again.',
          variant: 'destructive',
        });
        return;
      }
    }
    toast({
      title: 'Delivery Updated',
      description: `Status changed to ${newStatus}`,
    });
    setSelectedDelivery(null);
    setReceivedBy('');
    setReceiverAddress('');
    setReceiverContactNumber('');
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

  const handleResetTrip = async (delivery: Delivery) => {
    const reason = window.prompt(
      `Why should ${delivery.drNumber} be reset? This releases the truck and returns the delivery to Pending.`,
      'Stuck test delivery',
    );
    if (reason === null) return;
    if (reason.trim().length < 5) {
      toast({
        title: 'Reset reason required',
        description: 'Enter at least 5 characters so the recovery is recorded in the audit log.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const response = await apiClient.post<Delivery>(`/deliveries/${delivery.id}/reset-trip`, {
        reason: reason.trim(),
      });
      const resetDelivery = response.data;
      setDeliveries((current) =>
        current.map((item) => (item.id === delivery.id ? resetDelivery : item)),
      );
      syncSelectedDelivery(resetDelivery);
      toast({
        title: 'Truck released',
        description: `${delivery.drNumber} is Pending and must be loaded again before departure.`,
      });
    } catch (err: any) {
      toast({
        title: 'Unable to reset trip',
        description: err?.response?.data?.error || 'The delivery could not be reset.',
        variant: 'destructive',
      });
    }
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
        <div class=\"meta\">Receiver Name: ${delivery.receiverName || delivery.receivedBy || '—'}</div>
        <div class=\"meta\">Receiver Address: ${delivery.receiverAddress || '—'}</div>
        <div class=\"meta\">Receiver Contact: ${delivery.receiverContactNumber || '—'}</div>
        <div class=\"meta\">Status: ${delivery.status}</div>
        <div class=\"meta\">Delivery Fee: Office account</div>
      </div>
      <table>
        <thead><tr><th>Item</th><th>Unit</th><th>Qty</th></tr></thead>
        <tbody>${itemsHtml}</tbody>
      </table>
      <div class=\"meta-grid\">
        <div class=\"meta\">Issued By: ${delivery.issuedBy}</div>
        <div class=\"meta\">Received By: ${delivery.receiverName || delivery.receivedBy || '—'}</div>
      </div>`
    );
  };

  const handleCreateLalamove = async () => {
    if (!lalamoveForm.clientOrderId) {
      toast({ title: 'Missing order', description: 'Select a client order for this Lalamove request.', variant: 'destructive' });
      return;
    }
    const delivery = deliveries.find(
      (item) => item.orderId === lalamoveForm.clientOrderId && item.status === 'pending'
    );
    if (!delivery) {
      toast({
        title: 'Delivery not ready',
        description: 'Warehouse must mark the order ready before its delivery method can be scheduled.',
        variant: 'destructive',
      });
      return;
    }
    try {
      const response = await apiClient.put<Delivery>(`/deliveries/${delivery.id}`, {
        deliveryMethod: lalamoveForm.deliveryMethod,
        thirdPartyProvider: lalamoveForm.deliveryMethod === 'LALAMOVE' ? lalamoveForm.provider || 'Lalamove' : null,
        thirdPartyReference: lalamoveForm.deliveryMethod === 'LALAMOVE' ? lalamoveForm.reference || null : null,
        loadKg: lalamoveForm.loadKg ? Number(lalamoveForm.loadKg) : null,
        notes: lalamoveForm.notes || 'Third-party delivery request',
      });
      setDeliveries((current) => current.map((item) => (item.id === delivery.id ? response.data : item)));
      setIsLalamoveOpen(false);
      setLalamoveForm({ clientOrderId: '', deliveryMethod: 'LALAMOVE', provider: 'Lalamove', reference: '', loadKg: '', notes: '' });
      toast({ title: 'Delivery method updated', description: `${response.data.drNumber} is ready for dispatch.` });
    } catch (err: any) {
      toast({
        title: 'Unable to create request',
        description: err?.response?.data?.error || 'Please check the delivery details and try again.',
        variant: 'destructive',
      });
    }
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
    setDeliveryEta(delivery.eta ? new Date(delivery.eta).toISOString().slice(0, 16) : '');
    setIsReturnOpen(true);
  };

  const openDeliveryDetails = (delivery: Delivery) => {
    setSelectedDelivery(delivery);
    setReceivedBy(delivery.status === 'pending' ? delivery.receiverName || '' : delivery.receivedBy || '');
    setReceiverAddress(delivery.receiverAddress || '');
    setReceiverContactNumber(delivery.receiverContactNumber || '');
    setDeliveryNotes(delivery.notes || '');
    setDeliveryEta(delivery.eta ? new Date(delivery.eta).toISOString().slice(0, 16) : '');
    setDeliveryMethod(delivery.deliveryMethod || 'TRUCK');
    setDelayCase(delivery.delayType || 'traffic');
  };

  const handleConfirmLoading = async (delivery: Delivery) => {
    try {
      const response = await apiClient.post<Delivery>(`/deliveries/${delivery.id}/load`);
      setDeliveries((current) => current.map((item) => (item.id === delivery.id ? response.data : item)));
      syncSelectedDelivery(response.data);
      toast({ title: 'Vehicle loaded', description: `${delivery.drNumber} can now begin delivery.` });
    } catch (error: any) {
      toast({
        title: 'Unable to confirm loading',
        description: error?.response?.data?.error || 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleRemoveFromTruck = async (delivery: Delivery) => {
    try {
      const response = await apiClient.post<Delivery>(`/deliveries/${delivery.id}/unload`);
      setDeliveries((current) =>
        current.map((item) => (item.id === delivery.id ? response.data : item)),
      );
      syncSelectedDelivery(response.data);
      toast({
        title: 'Removed from truck',
        description: `${delivery.drNumber} can be loaded again before departure.`,
      });
    } catch (error: unknown) {
      toast({
        title: 'Unable to remove delivery',
        description: getApiErrorMessage(error, 'Please refresh and try again.'),
        variant: 'destructive',
      });
    }
  };

  const handleBeginLoadedTrip = async () => {
    if (loadedTruckDeliveries.length === 0 || activeTruckDeliveries.length > 0) return;
    setIsStartingTruckTrip(true);
    try {
      const response = await apiClient.post<{
        deliveries: Delivery[];
        totalKg: number;
        capacityKg: number;
      }>('/deliveries/truck-load/start');
      const startedById = new Map(
        response.data.deliveries.map((delivery) => [delivery.id, delivery]),
      );
      setDeliveries((current) =>
        current.map((delivery) => startedById.get(delivery.id) || delivery),
      );
      setSelectedDelivery(null);
      setShowTruckLoad(true);
      toast({
        title: 'Loaded trip started',
        description: `${response.data.deliveries.length} ${response.data.deliveries.length === 1 ? 'order is' : 'orders are'} now in transit (${response.data.totalKg}/${response.data.capacityKg} kg).`,
      });
    } catch (error: unknown) {
      toast({
        title: 'Unable to begin loaded trip',
        description: getApiErrorMessage(error, 'Please refresh and try again.'),
        variant: 'destructive',
      });
    } finally {
      setIsStartingTruckTrip(false);
    }
  };

  const getDelayRecommendation = (delivery: Delivery | null) => {
    if (!delivery) return { method: 'TRUCK', note: '', action: '' };
    const loadKg = Number(delivery.loadKg || 0);
    if (delayCase === 'receiver-unavailable') {
      return {
        method: delivery.deliveryMethod || 'TRUCK',
        note: 'Receiver unavailable at site. Contact client for alternate receiver, contact number, and new receiving window.',
        action: 'Coordinate receiver details and reschedule the same delivery.',
      };
    }
    if (delayCase === 'missing-item') {
      return {
        method: loadKg > 300 ? 'TRUCK' : 'LALAMOVE',
        note: 'Missing batch/item. Split available items into first batch and schedule balance after warehouse confirmation.',
        action: 'Split delivery into batches and notify client of remaining items.',
      };
    }
    if (delayCase === 'vehicle-issue') {
      return {
        method: loadKg > 250 ? 'TRUCK' : 'LALAMOVE',
        note: 'Vehicle issue. Reassign delivery method and provide updated ETA.',
        action: loadKg > 250 ? 'Switch to backup truck or reschedule truck route.' : 'Switch to Lalamove/third-party courier.',
      };
    }
    if (loadKg > 1000) {
      return {
        method: 'TRUCK',
        note: 'Load exceeds L300 one-ton limit. Split into batches before dispatch.',
        action: 'Use truck delivery with batch planning.',
      };
    }
    if (loadKg > 250) {
      return {
        method: 'TRUCK',
        note: 'Heavy/bulky load. Truck delivery is recommended.',
        action: 'Keep or switch to truck.',
      };
    }
    return {
      method: 'LALAMOVE',
      note: 'Delay reported. Third-party courier is suitable for a light delivery if timing is urgent.',
      action: 'Use Lalamove/third-party courier if client needs faster redelivery.',
    };
  };

  const applyDelayRecommendation = () => {
    const recommendation = getDelayRecommendation(selectedDelivery);
    setDeliveryMethod(recommendation.method);
    setDeliveryNotes((current) => (current.trim() ? current : recommendation.note));
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
          <p className="text-muted-foreground">Delivery records available for driver updates are shown here.</p>
        )}
      </div>
      {canCreateDeliveryRequest && (
        <div className="flex justify-end">
          <Button onClick={() => setIsLalamoveOpen(true)} className="gap-2">
            <Send size={16} />
            Schedule Delivery Method
          </Button>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-lg border bg-muted/30 p-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Package size={16} />
            Item Batch Limit
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Max 30 pcs per item per delivery; excess creates another batch.</p>
        </div>
        <div className="rounded-lg border bg-muted/30 p-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Package size={16} />
            Paint Load
          </div>
          <p className="mt-1 text-xs text-muted-foreground">1 gallon = 4 liters; 1 pail/can = 16kg for delivery planning.</p>
        </div>
        <div className="rounded-lg border bg-muted/30 p-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Truck size={16} />
            Truck Capacity
          </div>
          <p className="mt-1 text-xs text-muted-foreground">L300 truck limit is 1 ton, with a 20-paint-can cap.</p>
        </div>
        <div className="rounded-lg border bg-muted/30 p-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Send size={16} />
            Third-party
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Oversized/heavy loads are tagged for Lalamove or other providers.</p>
        </div>
      </div>

      {(isAdmin || isWarehouseStaff || isDeliveryGuy) && (
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2 font-semibold">
                  <Truck size={18} />
                  Current Truck Load
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {activeTruckDeliveries.length > 0
                    ? `${activeTruckDeliveries.length} ${activeTruckDeliveries.length === 1 ? 'order is' : 'orders are'} currently on the active trip.`
                    : `${loadedTruckDeliveries.length} ${loadedTruckDeliveries.length === 1 ? 'order' : 'orders'} loaded • ${loadedTruckKg}/1000 kg estimated`}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowTruckLoad((current) => !current)}
                >
                  {showTruckLoad ? 'Hide Truck Load' : 'View Truck Load'}
                </Button>
                {isDeliveryGuy && (
                  <Button
                    type="button"
                    className="bg-blue-600 text-white hover:bg-blue-700"
                    onClick={handleBeginLoadedTrip}
                    disabled={
                      loadedTruckDeliveries.length === 0 ||
                      activeTruckDeliveries.length > 0 ||
                      loadedTruckKg > 1000 ||
                      isStartingTruckTrip
                    }
                  >
                    {isStartingTruckTrip ? (
                      <Loader2 size={16} className="mr-1 animate-spin" />
                    ) : (
                      <Navigation size={16} className="mr-1" />
                    )}
                    Begin Loaded Trip ({loadedTruckDeliveries.length} {loadedTruckDeliveries.length === 1 ? 'order' : 'orders'} • {loadedTruckKg}kg)
                  </Button>
                )}
              </div>
            </div>

            {showTruckLoad && (
              <div className="mt-4 space-y-2 border-t pt-4">
                {activeTruckDeliveries.length > 0 ? (
                  activeTruckDeliveries.map((delivery) => (
                    <div key={delivery.id} className="flex items-center justify-between rounded-md border bg-blue-50 p-3">
                      <div>
                        <p className="font-medium">{delivery.drNumber}</p>
                        <p className="text-sm text-muted-foreground">
                          {delivery.orderNumber} • {delivery.clientName} • {Number(delivery.loadKg || 0)}kg
                        </p>
                      </div>
                      <Badge variant="outline" className={statusBadgeClass(delivery.status)}>
                        {delivery.status}
                      </Badge>
                    </div>
                  ))
                ) : loadedTruckDeliveries.length > 0 ? (
                  loadedTruckDeliveries.map((delivery) => (
                    <div key={delivery.id} className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-medium">{delivery.drNumber}</p>
                        <p className="text-sm text-muted-foreground">
                          {delivery.orderNumber} • {delivery.clientName} • {Number(delivery.loadKg || 0)}kg
                        </p>
                      </div>
                      {canConfirmLoading && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleRemoveFromTruck(delivery)}
                        >
                          Remove from Load
                        </Button>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    The truck is empty. Open a pending delivery and click Confirm Vehicle Loaded.
                  </p>
                )}
                {activeTruckDeliveries.length === 0 && loadedTruckDeliveries.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Remaining estimated capacity: {Math.max(0, 1000 - loadedTruckKg)} kg. Additional ready orders may be loaded before departure.
                  </p>
                )}
                {isWarehouseStaff && !isDeliveryGuy && loadedTruckDeliveries.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Loading is ready. The delivery rider must click Begin Loaded Trip.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
                <StatusFilterSelect
                  value={statusFilter}
                  onValueChange={(value) => {
                    setStatusFilter(value);
                    setDeliveriesPage(1);
                  }}
                  placeholder="All Status"
                >
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in-transit">In Transit</SelectItem>
                  <SelectItem value="delayed">Delayed</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="return-pending">Return Pending</SelectItem>
                  <SelectItem value="return-rejected">Return Rejected</SelectItem>
                  <SelectItem value="returned">Returned</SelectItem>
                </StatusFilterSelect>
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
                    <TableHead className="text-right">GPS</TableHead>
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
                    <TableRow
                      key={delivery.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => openDeliveryDetails(delivery)}
                      title="Open delivery details and receipt"
                    >
                      <TableCell className="py-4">
                        <div className="min-w-[140px]">
                          <p className="font-medium text-foreground">{delivery.drNumber}</p>
                          <p className="text-sm text-muted-foreground">{delivery.orderNumber}</p>
                          {(delivery.deliveryMethod === 'LALAMOVE' || delivery.thirdPartyProvider) && (
                            <Badge className="mt-1 bg-violet-100 text-violet-800">Third-party</Badge>
                          )}
                          {delivery.batchCount && delivery.batchCount > 1 && (
                            <Badge variant="outline" className="mt-1 ml-1">
                              Batch {delivery.batchNumber}/{delivery.batchCount}
                            </Badge>
                          )}
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
                          {delivery.loadKg ? ` • ${delivery.loadKg}kg` : ''}
                        </div>
                      </TableCell>
                      <TableCell>
                        {isDelayed(delivery) ? (
                          <Badge variant="outline" className={`${statusBadgeClass('delayed')} flex items-center gap-1 w-fit`}>
                            <Clock size={16} />
                            ETA overdue
                          </Badge>
                        ) : (
                          <Badge variant="outline" className={`${statusBadgeClass(delivery.status)} flex items-center gap-1 w-fit`}>
                            {statusIcons[delivery.status]}
                            {delivery.status}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            className="whitespace-nowrap"
                            onClick={(event) => {
                              event.stopPropagation();
                              setTrackingDelivery(delivery);
                            }}
                          >
                            <Navigation size={16} className="mr-1" />
                            {['in-transit', 'delayed'].includes(delivery.status)
                              ? 'Live GPS'
                              : 'Trip History'}
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
      <Dialog
        open={!!selectedDelivery}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedDelivery(null);
            setReceivedBy('');
            setReceiverAddress('');
            setReceiverContactNumber('');
            setDeliveryNotes('');
          }
        }}
      >
        <DialogContent className="max-w-3xl w-full max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedDelivery?.drNumber}</DialogTitle>
            <DialogDescription>
              {selectedDelivery?.clientName} • {selectedDelivery?.projectName}
            </DialogDescription>
          </DialogHeader>
          {selectedDelivery && (
            <div className="space-y-4">
              {selectedDelivery.status === 'pending' ? (
                <div className="rounded-lg border bg-muted/40 p-4">
                  <p className="font-medium">Delivery Receipt is not available yet.</p>
                  <p className="mt-1 text-sm text-muted-foreground">Complete the pre-delivery details and click Begin Delivery before viewing or downloading the receipt.</p>
                </div>
              ) : (
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
                      <p><span className="font-medium">Receiver:</span> {selectedDelivery.receiverName || selectedDelivery.receivedBy || 'Pending'}</p>
                      <p><span className="font-medium">Address:</span> {selectedDelivery.receiverAddress || 'Pending'}</p>
                      <p><span className="font-medium">Contact:</span> {selectedDelivery.receiverContactNumber || 'Pending'}</p>
                    </div>
                    <div className="text-right">
                      <p><span className="font-medium">Date:</span> {format(new Date(selectedDelivery.issuedAt), 'MMM dd, yyyy')}</p>
                      <p><span className="font-medium">ETA:</span> {format(new Date(selectedDelivery.eta), 'MMM dd, yyyy')}</p>
                      <p><span className="font-medium">Method:</span> {selectedDelivery.deliveryMethod || 'TRUCK'}</p>
                      <p><span className="font-medium">Delivery Fee:</span> Office account</p>
                      {selectedDelivery.thirdPartyProvider && (
                        <p><span className="font-medium">Third-party:</span> {selectedDelivery.thirdPartyProvider} {selectedDelivery.thirdPartyReference || ''}</p>
                      )}
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
                      <p>{selectedDelivery.receiverName || selectedDelivery.receivedBy || '_______________'}</p>
                      <p className="text-xs text-muted-foreground">{selectedDelivery.receiverAddress || 'Receiver address'}</p>
                      <p className="text-xs text-muted-foreground">{selectedDelivery.receiverContactNumber || 'Receiver contact number'}</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="rounded-lg border p-4">
                <h4 className="font-semibold mb-3">Delivery Timeline</h4>
                <div className="grid gap-3 sm:grid-cols-3">
                  {getDeliveryTimeline(selectedDelivery).map((step) => (
                    <div key={step.label} className="flex items-start gap-3">
                      <span className={`mt-1 h-3 w-3 rounded-full ${step.active ? 'bg-primary' : 'bg-muted'}`} />
                      <div>
                        <p className={step.active ? 'font-medium text-foreground' : 'font-medium text-muted-foreground'}>{step.label}</p>
                        <p className="text-xs text-muted-foreground">{step.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {isAdmin && <RecentActivityPanel logs={deliveryLogs} />}

              {/* Status Actions */}
              {canExecuteDelivery && selectedDelivery.status === 'pending' && (selectedDelivery.deliveryMethod || 'TRUCK') !== 'TRUCK' && (
                <div className="space-y-3 p-4 bg-muted rounded-lg">
                  <div>
                    <p className="font-medium">Before Delivery Starts</p>
                    <p className="text-sm text-muted-foreground">Confirm the expected receiving role, site details, delivery method, and planned ETA before beginning the trip.</p>
                  </div>
                  <Select value={receivedBy} onValueChange={setReceivedBy}>
                    <SelectTrigger>
                      <SelectValue placeholder="Expected receiver" />
                    </SelectTrigger>
                    <SelectContent>
                      {receivedByOptions.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label>Receiver Address</Label>
                      <Input
                        value={receiverAddress}
                        onChange={(e) => setReceiverAddress(e.target.value)}
                        placeholder="Receiver address or site location"
                      />
                    </div>
                    <div>
                      <Label>Receiver Contact Number</Label>
                      <Input
                        value={receiverContactNumber}
                        onChange={(e) => setReceiverContactNumber(e.target.value)}
                        placeholder="Contact number"
                      />
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label>Delivery Method</Label>
                      <Select value={deliveryMethod} onValueChange={setDeliveryMethod}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="TRUCK">Truck</SelectItem>
                          <SelectItem value="LALAMOVE">Third Party (Lalamove)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Planned ETA</Label>
                      <Input
                        type="datetime-local"
                        value={deliveryEta}
                        onChange={(e) => setDeliveryEta(e.target.value)}
                      />
                    </div>
                  </div>
                  <Textarea
                    placeholder="Pre-delivery notes, gate instructions, parking/loading reminders..."
                    value={deliveryNotes}
                    onChange={(e) => setDeliveryNotes(e.target.value)}
                  />
                </div>
              )}

              {canExecuteDelivery && (selectedDelivery.status === 'in-transit' || selectedDelivery.status === 'delayed') && (
                <div className="space-y-3 p-4 bg-muted rounded-lg">
                  <div>
                    <p className="font-medium">Delay / Exception Handling</p>
                    <p className="text-sm text-muted-foreground">Use this only when the active delivery has a problem that needs a reason, plan, and updated ETA.</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label>Delay / Exception Type</Label>
                      <Select
                        value={delayCase}
                        onValueChange={(value) =>
                          setDelayCase(value as DeliveryDelayType)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="traffic">Traffic / route delay</SelectItem>
                          <SelectItem value="vehicle-issue">Vehicle issue</SelectItem>
                          <SelectItem value="receiver-unavailable">Receiver unavailable</SelectItem>
                          <SelectItem value="weather">Weather delay</SelectItem>
                          <SelectItem value="third-party">Third-party rider issue</SelectItem>
                          <SelectItem value="missing-item">Missing batch/item</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Recommended Method</Label>
                      <Select value={deliveryMethod} onValueChange={setDeliveryMethod}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="TRUCK">Truck</SelectItem>
                          <SelectItem value="LALAMOVE">Third Party (Lalamove)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="rounded-md border bg-muted/30 p-3 text-sm">
                    <p className="font-medium">{getDelayRecommendation(selectedDelivery).action}</p>
                    <p className="mt-1 text-muted-foreground">{getDelayRecommendation(selectedDelivery).note}</p>
                    <Button type="button" variant="outline" size="sm" className="mt-3" onClick={applyDelayRecommendation}>
                      Apply Recommendation
                    </Button>
                  </div>
                  <Textarea
                    placeholder="Delivery notes..."
                    value={deliveryNotes}
                    onChange={(e) => setDeliveryNotes(e.target.value)}
                  />
                  <div>
                    <Label>Updated ETA</Label>
                    <Input
                      type="datetime-local"
                      value={deliveryEta}
                      onChange={(e) => setDeliveryEta(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {canExecuteDelivery &&
                (selectedDelivery.status === 'in-transit' ||
                  selectedDelivery.status === 'delayed') && (
                <div className="space-y-3 p-4 bg-muted rounded-lg">
                  <div>
                    <p className="font-medium">After Delivery / Proof of Delivery</p>
                    <p className="text-sm text-muted-foreground">Record the actual receiver and upload proof after the items are handed over.</p>
                  </div>
                  <div>
                    <Label>Actual Receiver</Label>
                    <Input
                      value={receivedBy}
                      onChange={(event) => setReceivedBy(event.target.value)}
                      placeholder="Full name of person who accepted the delivery"
                    />
                  </div>
                  <Textarea
                    placeholder="POD remarks, handover notes, missing/damaged item notes..."
                    value={deliveryNotes}
                    onChange={(e) => setDeliveryNotes(e.target.value)}
                  />
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <label htmlFor="detail-pod-upload" className="cursor-pointer">
                      <Upload size={14} className="mr-1" />
                      Upload Proof
                      </label>
                    </Button>
                    <Input
                      id="detail-pod-upload"
                      type="file"
                      accept="image/png,image/jpeg,application/pdf,image/heic,.heic"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file && selectedDelivery) {
                          handleUploadProof(selectedDelivery.id, file);
                        }
                        e.target.value = '';
                      }}
                    />
                    <span className="text-sm text-muted-foreground">JPG, PNG, PDF, or HEIC</span>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2 justify-end">
                <Button variant="outline" onClick={() => setSelectedDelivery(null)}>
                  Close
                </Button>
                {isAdmin &&
                  (selectedDelivery.status === 'in-transit' ||
                    selectedDelivery.status === 'delayed' ||
                    (selectedDelivery.status === 'pending' && selectedDelivery.loadedAt)) && (
                    <Button variant="destructive" onClick={() => handleResetTrip(selectedDelivery)}>
                      <Undo2 size={16} className="mr-1" />
                      Release Truck / Reset Trip
                    </Button>
                  )}
                {selectedDelivery.status !== 'pending' && (
                  <Button variant="outline" onClick={() => handlePrintDelivery(selectedDelivery)}>
                    <FileText size={16} className="mr-1" />
                    Download PDF
                  </Button>
                )}
                {canConfirmLoading && selectedDelivery.status === 'pending' && !selectedDelivery.loadedAt && (
                  <Button variant="outline" onClick={() => handleConfirmLoading(selectedDelivery)}>
                    <Package size={16} className="mr-1" />
                    Confirm Vehicle Loaded
                  </Button>
                )}
                {canExecuteDelivery && selectedDelivery.status === 'pending' && (selectedDelivery.deliveryMethod || 'TRUCK') !== 'TRUCK' && (
                  <Button
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={() => handleUpdateStatus(selectedDelivery.id, 'in-transit')}
                    disabled={!selectedDelivery.loadedAt}
                  >
                    <Navigation size={16} className="mr-1" />
                    Begin Delivery
                  </Button>
                )}
                {canExecuteDelivery &&
                  selectedDelivery.status === 'pending' &&
                  (selectedDelivery.deliveryMethod || 'TRUCK') === 'TRUCK' &&
                  selectedDelivery.loadedAt && (
                    <Button
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                      onClick={handleBeginLoadedTrip}
                      disabled={activeTruckDeliveries.length > 0 || isStartingTruckTrip}
                    >
                      {isStartingTruckTrip ? (
                        <Loader2 size={16} className="mr-1 animate-spin" />
                      ) : (
                        <Navigation size={16} className="mr-1" />
                      )}
                      Begin Loaded Trip
                    </Button>
                  )}
                {canExecuteDelivery &&
                  (selectedDelivery.status === 'in-transit' ||
                    selectedDelivery.status === 'delayed') && (
                  <Button
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={() => handleUpdateStatus(selectedDelivery.id, 'delivered')}
                    disabled={!selectedDelivery.proofOfDelivery}
                  >
                    <CheckCircle size={16} className="mr-1" />
                    Confirm Delivery
                  </Button>
                )}
                {canExecuteDelivery && selectedDelivery.status === 'delayed' && (
                  <Button
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={() => handleUpdateStatus(selectedDelivery.id, 'in-transit')}
                  >
                    <Navigation size={16} className="mr-1" />
                    Resume Delivery
                  </Button>
                )}
                {canExecuteDelivery &&
                  (selectedDelivery.status === 'in-transit' ||
                    selectedDelivery.status === 'delayed') && (
                  <Button
                    className="bg-orange-600 hover:bg-orange-700 text-white"
                    onClick={() => handleUpdateStatus(selectedDelivery.id, 'delayed')}
                  >
                    {selectedDelivery.status === 'delayed'
                      ? 'Update Delay'
                      : 'Report Delay'}
                  </Button>
                )}
                {isAdmin && selectedDelivery.status === 'return-pending' && (
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
        readOnly={!canExecuteDelivery}
        onStatusUpdate={canExecuteDelivery ? handleUpdateStatus : undefined}
        onUploadProof={canExecuteDelivery ? handleUploadProof : undefined}
      />

      <Dialog open={isLalamoveOpen} onOpenChange={setIsLalamoveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule Delivery Method</DialogTitle>
            <DialogDescription>Update the method for a system-created delivery that is ready for dispatch.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Client Order</Label>
              <Select value={lalamoveForm.clientOrderId} onValueChange={(value) => setLalamoveForm((prev) => ({ ...prev, clientOrderId: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select order" />
                </SelectTrigger>
                <SelectContent>
                  {orders.filter((order) => order.status === 'ready-for-delivery').map((order) => (
                    <SelectItem key={order.id} value={order.id}>
                      {order.orderNumber} - {order.clientName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Delivery Type</Label>
                <Select value={lalamoveForm.deliveryMethod} onValueChange={(value) => setLalamoveForm((prev) => ({ ...prev, deliveryMethod: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select delivery type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TRUCK">Truck</SelectItem>
                    <SelectItem value="LALAMOVE">Third Party (Lalamove)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Provider</Label>
                <Select
                  value={lalamoveForm.provider}
                  onValueChange={(value) => setLalamoveForm((prev) => ({ ...prev, provider: value }))}
                  disabled={lalamoveForm.deliveryMethod !== 'LALAMOVE'}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {thirdPartyProviders.map((provider) => (
                      <SelectItem key={provider} value={provider}>
                        {provider}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Booking / Reference</Label>
                <Input value={lalamoveForm.reference} onChange={(e) => setLalamoveForm((prev) => ({ ...prev, reference: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Estimated Load (kg)</Label>
              <Input value={lalamoveForm.loadKg} inputMode="decimal" onChange={(e) => setLalamoveForm((prev) => ({ ...prev, loadKg: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Pickup / Delivery Notes</Label>
              <Textarea value={lalamoveForm.notes} onChange={(e) => setLalamoveForm((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Pickup instructions, oversized item notes, rider/driver details..." />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsLalamoveOpen(false)}>Cancel</Button>
              <Button onClick={handleCreateLalamove}>Save Method</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
