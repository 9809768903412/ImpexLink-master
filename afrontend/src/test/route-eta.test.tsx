import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import RouteEtaCard from '@/components/RouteEtaCard';
import type { DeliveryGpsLocation } from '@/types';

afterEach(() => vi.unstubAllGlobals());
const fix = (): DeliveryGpsLocation => ({ id: '1', deliveryId: '1', lat: 14.4, lng: 120.9, recordedAt: new Date().toISOString() });

it('uses the hardware position and selected destination for a road ETA', async () => {
  const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ code: 'Ok', routes: [{ duration: 600, distance: 5000 }] }) });
  vi.stubGlobal('fetch', request);
  render(<RouteEtaCard active location={fix()} />);
  fireEvent.change(screen.getByLabelText('Destination latitude'), { target: { value: '14.5' } });
  fireEvent.change(screen.getByLabelText('Destination longitude'), { target: { value: '121' } });
  fireEvent.click(screen.getByRole('button', { name: 'Calculate route ETA' }));
  await waitFor(() => expect(screen.getByText('10 min remaining · 5.0 km by road')).toBeInTheDocument());
  expect(request.mock.calls[0][0]).toContain('/120.9,14.4;121,14.5?overview=false');
});

it('does not manufacture an estimate from stale GPS', async () => {
  const request = vi.fn();
  vi.stubGlobal('fetch', request);
  render(<RouteEtaCard active location={{ ...fix(), recordedAt: new Date(Date.now() - 300000).toISOString() }} />);
  fireEvent.change(screen.getByLabelText('Destination latitude'), { target: { value: '14.5' } });
  fireEvent.change(screen.getByLabelText('Destination longitude'), { target: { value: '121' } });
  fireEvent.click(screen.getByRole('button', { name: 'Calculate route ETA' }));
  expect(screen.getByText('Waiting for a fresh hardware GPS reading.')).toBeInTheDocument();
  expect(request).not.toHaveBeenCalled();
});
