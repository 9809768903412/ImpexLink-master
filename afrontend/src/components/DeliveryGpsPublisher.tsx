import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Navigation, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/api/client';
import { toast } from '@/hooks/use-toast';

export default function DeliveryGpsPublisher() {
  const watchId = useRef<number | null>(null);
  const posting = useRef(false);
  const [isTracking, setIsTracking] = useState(false);

  const stopTracking = () => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    setIsTracking(false);
  };

  useEffect(() => stopTracking, []);

  const publishPosition = async (position: GeolocationPosition) => {
    if (posting.current) return;
    posting.current = true;
    try {
      await apiClient.post('/deliveries/active/location/driver', {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        speedKmph:
          Number.isFinite(position.coords.speed) && position.coords.speed !== null
            ? position.coords.speed * 3.6
            : null,
        heading:
          Number.isFinite(position.coords.heading) && position.coords.heading !== null
            ? position.coords.heading
            : null,
        recordedAt: new Date(position.timestamp).toISOString(),
      });
    } catch (error: unknown) {
      stopTracking();
      toast({
        title: 'GPS update stopped',
        description:
          (axios.isAxiosError<{ error?: string }>(error) && error.response?.data?.error) ||
          'Your location could not be saved.',
        variant: 'destructive',
      });
    } finally {
      posting.current = false;
    }
  };

  const startTracking = () => {
    if (!window.isSecureContext || !navigator.geolocation) {
      toast({
        title: 'GPS is unavailable',
        description: 'Use HTTPS in a browser that allows location access.',
        variant: 'destructive',
      });
      return;
    }

    const options: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 15_000,
      maximumAge: 10_000,
    };
    const onError = (error: GeolocationPositionError) => {
      stopTracking();
      toast({
        title: 'GPS permission is required',
        description: error.message || 'Allow location access to publish delivery tracking.',
        variant: 'destructive',
      });
    };

    setIsTracking(true);
    navigator.geolocation.getCurrentPosition(publishPosition, onError, options);
    watchId.current = navigator.geolocation.watchPosition(
      publishPosition,
      onError,
      options,
    );
  };

  return isTracking ? (
    <Button type="button" variant="outline" onClick={stopTracking}>
      <Square size={16} className="mr-1" />
      Stop GPS
    </Button>
  ) : (
    <Button type="button" variant="outline" onClick={startTracking}>
      <Navigation size={16} className="mr-1" />
      Start GPS
    </Button>
  );
}
