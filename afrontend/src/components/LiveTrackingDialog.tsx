import { useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Polyline,
  Popup,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Truck,
  Clock3,
  Upload,
  Route,
  Package,
  UserRound,
  Satellite,
  Gauge,
  Navigation,
} from "lucide-react";
import type { Delivery, DeliveryGpsLocation, DeliveryStatus } from "@/types";
import { toPublicFileUrl } from "@/lib/files";
import { apiClient } from "@/api/client";

const STATUS_STYLES: Record<DeliveryStatus, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  "in-transit": "bg-blue-100 text-blue-800",
  delivered: "bg-green-100 text-green-800",
  delayed: "bg-orange-100 text-orange-800",
  "return-pending": "bg-orange-100 text-orange-800",
  "return-rejected": "bg-slate-100 text-slate-700",
  returned: "bg-red-100 text-red-800",
};

const BASE_ROUTE: [number, number][] = [
  [14.5547, 121.0244],
  [14.5562, 121.0308],
  [14.5595, 121.0385],
  [14.5638, 121.0482],
];
function getMockRoute(delivery: Delivery): [number, number][] {
  const hash = Number(delivery.id || 0) % 7;
  return BASE_ROUTE.map(([lat, lng], index) => [
    lat + hash * 0.0012 + index * 0.0006,
    lng + hash * 0.001 + index * 0.0009,
  ]);
}

function formatAge(recordedAt?: string | null) {
  if (!recordedAt) return "No GPS update yet";
  const diffSeconds = Math.max(
    0,
    Math.round((Date.now() - new Date(recordedAt).getTime()) / 1000),
  );
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  const diffMinutes = Math.round(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  return `${Math.round(diffMinutes / 60)}h ago`;
}

function isStale(recordedAt?: string | null) {
  if (!recordedAt) return false;
  return Date.now() - new Date(recordedAt).getTime() > 2 * 60 * 1000;
}

function FollowGpsMarker({ position }: { position: [number, number] }) {
  const map = useMap();

  useEffect(() => {
    map.flyTo(position, map.getZoom(), {
      animate: true,
      duration: 1,
    });
  }, [map, position[0], position[1]]);

  return null;
}

interface LiveTrackingDialogProps {
  delivery: Delivery | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  readOnly?: boolean;
  onStatusUpdate?: (
    deliveryId: string,
    status: DeliveryStatus,
    meta?: { receivedBy?: string; notes?: string; eta?: string },
  ) => Promise<void> | void;
  onUploadProof?: (deliveryId: string, file: File) => Promise<void> | void;
}

export default function LiveTrackingDialog({
  delivery,
  open,
  onOpenChange,
}: LiveTrackingDialogProps) {
  const [latestLocation, setLatestLocation] =
    useState<DeliveryGpsLocation | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !delivery?.id) {
      setLatestLocation(null);
      setLocationError(null);
      return;
    }

    let cancelled = false;
    const loadLatestLocation = async () => {
      setLocationLoading(true);
      try {
        const response = await apiClient.get(
          `/deliveries/${delivery.id}/location/latest`,
        );
        if (!cancelled) {
          setLatestLocation(
            response.data?.location || delivery.latestLocation || null,
          );
          setLocationError(null);
        }
      } catch {
        if (!cancelled) {
          setLatestLocation(delivery.latestLocation || null);
          setLocationError("GPS data is not available right now.");
        }
      } finally {
        if (!cancelled) setLocationLoading(false);
      }
    };

    loadLatestLocation();
    const interval = window.setInterval(loadLatestLocation, 10000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [delivery?.id, delivery?.latestLocation, open]);

  const activeLocation = latestLocation || delivery?.latestLocation || null;
  const hasLiveLocation = Boolean(activeLocation);
  const signalStale = isStale(activeLocation?.recordedAt);
  const mockRoute = useMemo(
    () => (delivery ? getMockRoute(delivery) : BASE_ROUTE),
    [delivery?.id],
  );

  const marker: [number, number] = activeLocation
    ? [Number(activeLocation.lat), Number(activeLocation.lng)]
    : mockRoute[mockRoute.length - 1];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" />
            Live Tracking {delivery?.drNumber ? `• ${delivery.drNumber}` : ""}
          </DialogTitle>
          <DialogDescription>
            Live GPS tracking powered by OpenStreetMap. Mock route preview is
            used until the hardware device sends a location.
          </DialogDescription>
        </DialogHeader>

        {delivery ? (
          <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[1.4fr_0.9fr]">
              <div className="overflow-hidden rounded-2xl border bg-white">
                <div className="h-[360px] w-full">
                  <MapContainer
                    center={marker}
                    zoom={15}
                    scrollWheelZoom
                    className="h-full w-full z-0"
                  >
                    <FollowGpsMarker position={marker} />
                    <TileLayer
                      attribution="&copy; OpenStreetMap contributors"
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    {!hasLiveLocation && (
                      <Polyline
                        positions={mockRoute}
                        pathOptions={{
                          color: "#C0392B",
                          weight: 5,
                          dashArray: "8 8",
                        }}
                      />
                    )}
                    <CircleMarker
                      center={marker}
                      radius={10}
                      pathOptions={{
                        color: signalStale
                          ? "#C2410C"
                          : hasLiveLocation
                            ? "#1D4ED8"
                            : "#991B1B",
                        fillColor: signalStale
                          ? "#F97316"
                          : hasLiveLocation
                            ? "#3B82F6"
                            : "#DC2626",
                        fillOpacity: 1,
                      }}
                    >
                      <Popup>
                        {delivery.drNumber}
                        <br />
                        {delivery.clientName}
                        <br />
                        {hasLiveLocation
                          ? `GPS update: ${formatAge(activeLocation?.recordedAt)}`
                          : "Mock preview"}
                      </Popup>
                    </CircleMarker>
                  </MapContainer>
                </div>
              </div>

              <div className="space-y-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">
                      Tracking Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">GPS</span>
                      {hasLiveLocation ? (
                        <Badge
                          className={
                            signalStale
                              ? "bg-orange-100 text-orange-800"
                              : "bg-blue-100 text-blue-800"
                          }
                        >
                          {signalStale ? "signal stale" : "live active"}
                        </Badge>
                      ) : (
                        <Badge className="bg-slate-100 text-slate-700">
                          {locationLoading ? "checking" : "mock preview"}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Status</span>
                      <Badge className={STATUS_STYLES[delivery.status]}>
                        {delivery.status}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Driver</span>
                      <span className="font-medium">
                        {delivery.deliveryGuyName || "Manny Dela Cruz"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">ETA</span>
                      <span className="font-medium">
                        {delivery.eta
                          ? new Date(delivery.eta).toLocaleString("en-PH")
                          : "To be scheduled"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Order</span>
                      <span className="font-medium">
                        {delivery.orderNumber}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Last Update</span>
                      <span className="font-medium">
                        {formatAge(activeLocation?.recordedAt)}
                      </span>
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
                        <p className="font-medium">
                          {delivery.deliveryGuyName || "Manny Dela Cruz"}
                        </p>
                        <p className="text-muted-foreground">
                          Assigned delivery operator
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Package className="mt-0.5 h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium">
                          {delivery.items.length} cargo line items
                        </p>
                        <p className="text-muted-foreground">
                          {delivery.items
                            .map(
                              (item) => `${item.itemName} (${item.quantity})`,
                            )
                            .slice(0, 3)
                            .join(", ") || "Cargo manifest pending"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Route className="mt-0.5 h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium">
                          {hasLiveLocation
                            ? "Hardware GPS feed"
                            : "Mock route preview"}
                        </p>
                        <p className="text-muted-foreground">
                          {hasLiveLocation
                            ? `Device ${activeLocation?.deviceId || "unassigned"} reporting to this delivery`
                            : "Makati dispatch to client delivery point"}
                        </p>
                      </div>
                    </div>
                    {hasLiveLocation && (
                      <>
                        <div className="flex items-start gap-2">
                          <Navigation className="mt-0.5 h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="font-medium">Coordinates</p>
                            <p className="text-muted-foreground">
                              {Number(activeLocation?.lat).toFixed(6)},{" "}
                              {Number(activeLocation?.lng).toFixed(6)}
                            </p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="flex items-start gap-2">
                            <Gauge className="mt-0.5 h-4 w-4 text-muted-foreground" />
                            <div>
                              <p className="font-medium">Speed</p>
                              <p className="text-muted-foreground">
                                {activeLocation?.speedKmph === null ||
                                activeLocation?.speedKmph === undefined
                                  ? "N/A"
                                  : `${Math.round(activeLocation.speedKmph)} km/h`}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-start gap-2">
                            <Satellite className="mt-0.5 h-4 w-4 text-muted-foreground" />
                            <div>
                              <p className="font-medium">Satellites</p>
                              <p className="text-muted-foreground">
                                {activeLocation?.satellites ?? "N/A"}
                              </p>
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                    {locationError && (
                      <p className="rounded-md bg-orange-50 px-3 py-2 text-xs text-orange-800">
                        {locationError}
                      </p>
                    )}
                    <div className="flex items-start gap-2">
                      <Clock3 className="mt-0.5 h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium">Notes</p>
                        <p className="text-muted-foreground">
                          {delivery.notes ||
                            "No delay or POD notes recorded yet."}
                        </p>
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
                    href={toPublicFileUrl(delivery.proofOfDelivery)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 text-primary underline-offset-4 hover:underline"
                  >
                    <Upload className="h-4 w-4" />
                    View uploaded proof of delivery
                  </a>
                ) : (
                  <p className="text-muted-foreground">
                    No proof of delivery uploaded yet.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
