import { useMemo, useState, type ChangeEvent } from 'react';
import { MapContainer, TileLayer, CircleMarker, Polyline, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Truck, Clock3, Upload, Route, Package, UserRound } from 'lucide-react';
import type { Delivery, DeliveryStatus } from '@/types';

const STATUS_STYLES: Record<DeliveryStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  'in-transit': 'bg-blue-100 text-blue-800',
  delivered: 'bg-green-100 text-green-800',
  delayed: 'bg-orange-100 text-orange-800',
  'return-pending': 'bg-orange-100 text-orange-800',
  'return-rejected': 'bg-slate-100 text-slate-700',
  returned: 'bg-red-100 text-red-800',
};

const BASE_ROUTE: [number, number][] = [
  [14.5547, 121.0244],
  [14.5562, 121.0308],
  [14.5595, 121.0385],
  [14.5638, 121.0482],
];

function getMockRoute(delivery: Delivery): [number, number][] {
  const hash = Number(delivery.id || 0) % 7;
  return BASE_ROUTE.map(([lat, lng], index) => [lat + hash * 0.0012 + index * 0.0006, lng + hash * 0.001 + index * 0.0009]);
}

interface LiveTrackingDialogProps {
  delivery: Delivery | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  readOnly?: boolean;
  onStatusUpdate?: (deliveryId: string, status: DeliveryStatus, meta?: { receivedBy?: string; notes?: string }) => Promise<void> | void;
  onUploadProof?: (deliveryId: string, file: File) => Promise<void> | void;
}

export default function LiveTrackingDialog({
  delivery,
  open,
  onOpenChange,
  readOnly = false,
  onStatusUpdate,
  onUploadProof,
}: LiveTrackingDialogProps) {
  const [receivedBy, setReceivedBy] = useState('');
  const [notes, setNotes] = useState('');
  const route = useMemo(() => (delivery ? getMockRoute(delivery) : BASE_ROUTE), [delivery]);
  const marker = route[route.length - 1];

  const handleProofUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !delivery || !onUploadProof) return;
    await onUploadProof(delivery.id, file);
    event.currentTarget.value = '';
  };

  const triggerStatus = async (status: DeliveryStatus) => {
    if (!delivery || !onStatusUpdate) return;
    await onStatusUpdate(delivery.id, status, {
      receivedBy: status === 'delivered' ? receivedBy : undefined,
      notes: notes || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" />
            Live Tracking {delivery?.drNumber ? `• ${delivery.drNumber}` : ''}
          </DialogTitle>
          <DialogDescription>
            Real-time style delivery tracking powered by OpenStreetMap with a mock route preview.
          </DialogDescription>
        </DialogHeader>

        {delivery ? (
          <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[1.4fr_0.9fr]">
              <div className="overflow-hidden rounded-2xl border bg-white">
                <div className="h-[360px] w-full">
                  <MapContainer center={marker} zoom={13} scrollWheelZoom className="h-full w-full z-0">
                    <TileLayer
                      attribution='&copy; OpenStreetMap contributors'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <Polyline positions={route} pathOptions={{ color: '#C0392B', weight: 5 }} />
                    <CircleMarker center={marker} radius={10} pathOptions={{ color: '#991B1B', fillColor: '#DC2626', fillOpacity: 1 }}>
                      <Popup>
                        {delivery.drNumber}<br />{delivery.clientName}
                      </Popup>
                    </CircleMarker>
                  </MapContainer>
                </div>
              </div>

              <div className="space-y-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Tracking Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Status</span>
                      <Badge className={STATUS_STYLES[delivery.status]}>{delivery.status}</Badge>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Driver</span>
                      <span className="font-medium">{delivery.deliveryGuyName || 'Carlos Martinez'}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">ETA</span>
                      <span className="font-medium">{delivery.eta ? new Date(delivery.eta).toLocaleString('en-PH') : 'To be scheduled'}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Order</span>
                      <span className="font-medium">{delivery.orderNumber}</span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Cargo & Driver</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="flex items-start gap-2">
                      <UserRound className="mt-0.5 h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{delivery.deliveryGuyName || 'Carlos Martinez'}</p>
                        <p className="text-muted-foreground">Assigned delivery operator</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Package className="mt-0.5 h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{delivery.items.length} cargo line items</p>
                        <p className="text-muted-foreground">{delivery.items.map((item) => `${item.itemName} (${item.quantity})`).slice(0, 3).join(', ') || 'Cargo manifest pending'}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Route className="mt-0.5 h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium">Mock route preview</p>
                        <p className="text-muted-foreground">Makati dispatch to client delivery point</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Clock3 className="mt-0.5 h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium">Notes</p>
                        <p className="text-muted-foreground">{delivery.notes || 'No delay or POD notes recorded yet.'}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Proof of Delivery</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {delivery.proofOfDelivery ? (
                  <a
                    href={delivery.proofOfDelivery}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 text-primary underline-offset-4 hover:underline"
                  >
                    <Upload className="h-4 w-4" />
                    View uploaded proof of delivery
                  </a>
                ) : (
                  <p className="text-muted-foreground">No proof of delivery uploaded yet.</p>
                )}
                {!readOnly && onUploadProof ? (
                  <div className="space-y-2">
                    <Label htmlFor="pod-upload">Upload Proof of Delivery</Label>
                    <Input id="pod-upload" type="file" accept="image/png,image/jpeg,application/pdf" onChange={handleProofUpload} />
                  </div>
                ) : null}
              </CardContent>
            </Card>

            {!readOnly && onStatusUpdate ? (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Delivery Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Received By</Label>
                      <Input value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} placeholder="Client representative name" />
                    </div>
                    <div className="space-y-2">
                      <Label>Driver / Delivery Notes</Label>
                      <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Delay reason, arrival note, or POD remarks" rows={3} />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 justify-end">
                    <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => triggerStatus('in-transit')}>
                      Mark as In Transit
                    </Button>
                    <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => triggerStatus('delivered')}>
                      Mark as Delivered
                    </Button>
                    <Button className="bg-orange-600 hover:bg-orange-700 text-white" onClick={() => triggerStatus('delayed')}>
                      Report Delay
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
