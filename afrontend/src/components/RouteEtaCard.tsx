import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { DeliveryGpsLocation } from '@/types';

export default function RouteEtaCard({ location, active }: { location: DeliveryGpsLocation | null; active: boolean }) {
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [destination, setDestination] = useState<{ lat: number; lng: number } | null>(null);
  const [estimate, setEstimate] = useState<{ arrival: number; minutes: number; km: number; gpsAt: string } | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!active || !destination) return;
    const timer = window.setInterval(() => setTick((value) => value + 1), 60000);
    return () => window.clearInterval(timer);
  }, [active, destination]);

  // Refresh once a minute, using the most recent hardware fix at that point.
  useEffect(() => {
    setEstimate(null);
    setLoading(false);
    if (!active || !destination) return;
    if (!location || !Number.isFinite(Date.parse(location.recordedAt)) || Date.now() - Date.parse(location.recordedAt) > 120000) {
      setMessage('Waiting for a fresh hardware GPS reading.');
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      controller.abort();
      setLoading(false);
      setMessage('The route service timed out. Try again.');
    }, 15000);
    setLoading(true);
    setMessage('');
    const endpoint = import.meta.env.VITE_ROUTING_URL || 'https://router.project-osrm.org';
    fetch(`${endpoint.replace(/\/$/, '')}/route/v1/driving/${location.lng},${location.lat};${destination.lng},${destination.lat}?overview=false`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Route service unavailable.');
        const data = await response.json();
        const route = data.routes?.[0];
        if (data.code !== 'Ok' || !Number.isFinite(route?.duration) || route.duration < 0 || !Number.isFinite(route?.distance)) throw new Error('No driving route found for these coordinates.');
        if (!controller.signal.aborted) setEstimate({ arrival: Date.now() + route.duration * 1000, minutes: Math.ceil(route.duration / 60), km: route.distance / 1000, gpsAt: location.recordedAt });
      })
      .catch(() => { if (!controller.signal.aborted) setMessage('Unable to calculate a driving route. Check the destination or try again.'); })
      .finally(() => { window.clearTimeout(timeout); if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); window.clearTimeout(timeout); };
    // GPS itself polls every 10 seconds; routing uses a slower independent cadence.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, destination, tick]);

  const configure = () => {
    const lat = Number(latitude), lng = Number(longitude);
    if (!latitude.trim() || !longitude.trim() || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      setMessage('Enter a valid destination latitude and longitude.');
      return;
    }
    setDestination({ lat, lng });
  };
  const fresh = location && Date.now() - Date.parse(location.recordedAt) <= 120000;
  return <Card>
    <CardHeader className="pb-3"><CardTitle className="text-base">GPS Route ETA</CardTitle></CardHeader>
    <CardContent className="space-y-3 text-sm">
      {!active ? <p className="text-muted-foreground">Route estimates are available while the truck delivery is in transit or delayed.</p> : <>
        <p className="text-muted-foreground">Enter this order’s destination pin coordinates. These apply only to this tracking view.</p>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1">Latitude<Input aria-label="Destination latitude" type="number" step="any" min={-90} max={90} value={latitude} onChange={(event) => { setLatitude(event.target.value); setDestination(null); setEstimate(null); }} /></label>
          <label className="space-y-1">Longitude<Input aria-label="Destination longitude" type="number" step="any" min={-180} max={180} value={longitude} onChange={(event) => { setLongitude(event.target.value); setDestination(null); setEstimate(null); }} /></label>
        </div>
        <Button variant="outline" disabled={loading} onClick={configure}>{loading ? 'Calculating…' : 'Calculate route ETA'}</Button>
        {estimate && fresh && <div className="rounded-md border p-3">
          <p className="font-semibold">Estimated arrival: {new Date(estimate.arrival).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</p>
          <p>{estimate.minutes} min remaining · {estimate.km.toFixed(1)} km by road</p>
          <p className="mt-1 text-xs text-muted-foreground">GPS fix: {new Date(estimate.gpsAt).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila' })}</p>
        </div>}
        {destination && !fresh && <p className="text-muted-foreground">Awaiting fresh GPS signal; route ETA is unavailable.</p>}
        {message && <p role="status" className="text-muted-foreground">{message}</p>}
        <p className="text-xs text-muted-foreground">Driving estimate from OpenStreetMap/OSRM, refreshed every minute. Excludes live traffic, truck restrictions, unloading and other delivery stops. Estimates do not confirm delivery.</p>
      </>}
    </CardContent>
  </Card>;
}
