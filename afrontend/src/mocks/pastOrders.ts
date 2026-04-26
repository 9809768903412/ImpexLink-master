import type { Order } from '@/types';
import { calcTotalsFromItems } from '@/lib/vat';

type MockPastOrderParams = {
  clientId?: string;
  clientName?: string;
  createdBy?: string;
};

const MOCK_ORDER_BLUEPRINTS = [
  {
    id: 'mock-past-001',
    orderNumber: 'ORD-2026-1008',
    projectName: 'Ateneo CTC Building Renovation',
    createdAt: '2026-03-28T09:15:00.000Z',
    updatedAt: '2026-04-01T14:00:00.000Z',
    items: [
      { itemId: '205', itemName: 'Paint Brush 1"', unit: 'pcs', quantity: 50, unitPrice: 85 },
      { itemId: '214', itemName: 'Steel brush', unit: 'pcs', quantity: 12, unitPrice: 120 },
      { itemId: '216', itemName: 'Cotton rags', unit: 'kg', quantity: 25, unitPrice: 45 },
    ],
  },
  {
    id: 'mock-past-002',
    orderNumber: 'ORD-2026-0972',
    projectName: 'Robinsons Galleria Expansion',
    createdAt: '2026-03-14T07:45:00.000Z',
    updatedAt: '2026-03-18T16:30:00.000Z',
    items: [
      { itemId: '220', itemName: 'Seal-tech AW (5 ltrs)', unit: 'cans', quantity: 6, unitPrice: 620 },
      { itemId: '209', itemName: 'Spatula 2"', unit: 'pcs', quantity: 20, unitPrice: 110 },
    ],
  },
  {
    id: 'mock-past-003',
    orderNumber: 'ORD-2026-0915',
    projectName: 'Ayala Mall Fit-out',
    createdAt: '2026-02-25T11:20:00.000Z',
    updatedAt: '2026-02-27T13:10:00.000Z',
    items: [
      { itemId: '201', itemName: 'Paint brush', unit: 'pcs', quantity: 40, unitPrice: 70 },
      { itemId: '206', itemName: 'Paint roller 7" w/ handle', unit: 'pcs', quantity: 18, unitPrice: 210 },
      { itemId: '212', itemName: 'Palette (pair) 4"', unit: 'pairs', quantity: 10, unitPrice: 160 },
    ],
  },
];

export function buildMockPastOrders({
  clientId = 'mock-client',
  clientName = 'Client Account',
  createdBy = 'mock-user',
}: MockPastOrderParams = {}): Order[] {
  return MOCK_ORDER_BLUEPRINTS.map((blueprint) => {
    const totals = calcTotalsFromItems(
      blueprint.items.map((item) => ({ quantity: item.quantity, unitPrice: item.unitPrice }))
    );

    return {
      id: blueprint.id,
      orderNumber: blueprint.orderNumber,
      clientId,
      clientName,
      projectName: blueprint.projectName,
      items: blueprint.items.map((item) => ({
        ...item,
        amount: item.quantity * item.unitPrice,
      })),
      subtotal: totals.net,
      vat: totals.vat,
      total: totals.total,
      status: 'delivered',
      paymentStatus: 'paid',
      createdAt: blueprint.createdAt,
      updatedAt: blueprint.updatedAt,
      createdBy,
      specialInstructions: 'Mock preview order using the same shape returned by /api/orders.',
      poMatchStatus: 'genuine',
    };
  });
}
