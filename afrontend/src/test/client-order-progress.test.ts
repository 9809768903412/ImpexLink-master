import { describe, expect, it } from 'vitest';
import {
  canOpenClientDeliveryMap,
  getClientOrderProgressStage,
  hasDeliveryDeparted,
} from '@/lib/clientOrderProgress';

describe('Client order delivery progress', () => {
  it('does not treat a ready order with a pending delivery as in transit', () => {
    expect(getClientOrderProgressStage('ready-for-delivery', 'pending')).toBe(3);
    expect(hasDeliveryDeparted('pending')).toBe(false);
  });

  it('uses the delivery record as the authority for transit state', () => {
    expect(getClientOrderProgressStage('ready-for-delivery', 'in-transit')).toBe(4);
    expect(getClientOrderProgressStage('ready-for-delivery', 'delayed')).toBe(4);
    expect(getClientOrderProgressStage('delivered', 'delivered')).toBe(5);
  });

  it('hides the map action until the delivery has left pending dispatch', () => {
    expect(canOpenClientDeliveryMap('pending')).toBe(false);
    expect(canOpenClientDeliveryMap('in-transit')).toBe(true);
    expect(canOpenClientDeliveryMap('delivered')).toBe(true);
  });
});
