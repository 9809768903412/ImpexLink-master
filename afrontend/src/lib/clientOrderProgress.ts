import type { DeliveryStatus, OrderStatus } from '@/types';

export const CLIENT_ORDER_PROGRESS_LABELS = [
  'Ordered',
  'Approved',
  'Processing',
  'Ready',
  'In Transit',
  'Delivered',
] as const;

export function getClientOrderProgressStage(
  orderStatus: OrderStatus,
  deliveryStatus?: DeliveryStatus | null
) {
  if (orderStatus === 'delivered' || deliveryStatus === 'delivered') return 5;
  if (deliveryStatus === 'in-transit' || deliveryStatus === 'delayed') return 4;
  if (orderStatus === 'ready-for-delivery') return 3;
  if (orderStatus === 'processing') return 2;
  if (orderStatus === 'approved') return 1;
  return 0;
}

export function canOpenClientDeliveryMap(status?: DeliveryStatus | null) {
  return Boolean(status && status !== 'pending');
}
