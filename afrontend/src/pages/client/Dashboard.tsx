import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Disc3,
  Shield,
  ScissorsLineDashed,
  Sparkles,
  FlaskConical,
  HardHat,
  MessageSquareMore,
  Package,
  Paintbrush,
  RotateCcw,
  ShoppingCart,
  Truck,
  Wrench,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/api/client';
import { useResource } from '@/hooks/use-resource';
import type { Delivery, Order, Project } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { statusBadgeClass } from '@/lib/statusStyles';

type ActivityItem = {
  id: string;
  type: 'order' | 'delivery';
  title: string;
  subtitle: string;
  status: string;
  createdAt: string;
};

const deliveryBadgeClasses: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  'in-transit': 'bg-blue-100 text-blue-800',
  delayed: 'bg-orange-100 text-orange-800',
  delivered: 'bg-emerald-100 text-emerald-800',
  'return-pending': 'bg-orange-100 text-orange-800',
  'return-rejected': 'bg-slate-100 text-slate-700',
  returned: 'bg-red-100 text-red-800',
};

const orderBadgeClasses: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-blue-100 text-blue-800',
  processing: 'bg-indigo-100 text-indigo-800',
  'ready-for-delivery': 'bg-sky-100 text-sky-800',
  delivered: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-red-100 text-red-800',
};

const faqs = [
  {
    id: 'quote-time',
    question: 'How long does quotation processing usually take?',
    answer: 'Most quotation requests are reviewed within 24 hours during business days.',
  },
  {
    id: 'upload-file',
    question: 'Can I upload my own project or purchase order file?',
    answer: 'Yes. Use Request Quotation and attach your project brief, bill of materials, or purchase order file.',
  },
  {
    id: 'track-order',
    question: 'Where can I track my orders and deliveries?',
    answer: 'Open Orders & Deliveries to see order details, delivery ETA, and the live tracking view in one place.',
  },
];

export default function ClientDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const { data: deliveries } = useResource<Delivery[]>('/deliveries', []);
  const { data: projects, reload: reloadProjects } = useResource<Project[]>('/projects', []);
  const { data: categoriesRaw } = useResource<{ categoryName: string }[]>('/categories', []);
  const [showHelp, setShowHelp] = useState(false);
  const [resubmitOpen, setResubmitOpen] = useState(false);
  const [resubmitProject, setResubmitProject] = useState<Project | null>(null);
  const [resubmitName, setResubmitName] = useState('');
  const [resubmitError, setResubmitError] = useState('');

  useEffect(() => {
    if (!user?.id) return;
    apiClient
      .get('/orders')
      .then((res) => {
        const payload = res.data;
        setOrders(payload?.data || payload || []);
      })
      .catch(() => setOrders([]));
  }, [user?.id]);

  const clientOrders = useMemo(() => orders, [orders]);

  const scopedDeliveries = useMemo(
    () => deliveries.filter((delivery) => clientOrders.some((order) => order.id === delivery.orderId)),
    [deliveries, clientOrders]
  );

  const recentOrders = [...clientOrders]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 2);

  const recentDeliveries = [...scopedDeliveries]
    .sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime())
    .slice(0, 2);

  const recentActivity = [
    ...recentOrders.map<ActivityItem>((order) => ({
      id: `order-${order.id}`,
      type: 'order',
      title: order.orderNumber,
      subtitle: order.projectName || 'No project assigned',
      status: order.status,
      createdAt: order.createdAt,
    })),
    ...recentDeliveries.map<ActivityItem>((delivery) => ({
      id: `delivery-${delivery.id}`,
      type: 'delivery',
      title: delivery.drNumber,
      subtitle: delivery.projectName || delivery.orderNumber,
      status: delivery.status,
      createdAt: delivery.issuedAt,
    })),
  ]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 3);

  const rejectedProjects = projects.filter((project) => project.status === 'rejected').slice(0, 2);
  const mostOrderedLabel =
    recentOrders[0]?.items?.[0]?.itemName ||
    recentOrders[0]?.projectName ||
    'your previous materials';
  const activeDeliveryCount = scopedDeliveries.filter((delivery) =>
    ['pending', 'in-transit', 'delayed'].includes(delivery.status)
  ).length;

  const handleQuickReorder = () => {
    if (recentOrders.length === 0) return;
    const lastOrder = recentOrders[0];
    if (lastOrder.status === 'cancelled') return;
    try {
      localStorage.setItem('reorder_cart', JSON.stringify(lastOrder.items));
    } catch {
      // ignore cache issues
    }
    navigate('/client/order');
  };

  const openResubmit = (project: Project) => {
    setResubmitProject(project);
    setResubmitName(project.name);
    setResubmitError('');
    setResubmitOpen(true);
  };

  const handleResubmit = async () => {
    if (!resubmitProject) return;
    if (!resubmitName.trim()) {
      setResubmitError('Project name is required.');
      return;
    }
    try {
      await apiClient.post(`/projects/${resubmitProject.id}/resubmit`, {
        name: resubmitName.trim(),
      });
      setResubmitOpen(false);
      setResubmitProject(null);
      setResubmitName('');
      setResubmitError('');
      reloadProjects();
    } catch {
      setResubmitError('Unable to resubmit. Please try again.');
    }
  };

  const recommendations = [
    {
      title: 'Reorder from Past Orders',
      description: 'Quickly repeat your previous orders',
      icon: RotateCcw,
      iconWrapClass: 'bg-amber-50 text-amber-700 ring-1 ring-amber-100',
      onClick: () => navigate('/client/orders?tab=past-orders'),
    },
    {
      title: 'Place New Order',
      description: 'Browse items and submit a fresh order',
      icon: ShoppingCart,
      iconWrapClass: 'bg-rose-50 text-rose-700 ring-1 ring-rose-100',
      onClick: () => navigate('/client/order'),
    },
    {
      title: 'Track My Deliveries',
      description: activeDeliveryCount > 0 ? `${activeDeliveryCount} active deliveries` : 'Check your latest delivery status',
      icon: Truck,
      iconWrapClass: 'bg-sky-50 text-sky-700 ring-1 ring-sky-100',
      onClick: () => navigate('/client/orders?tab=my-deliveries'),
    },
  ];

  const categoryCards = useMemo(() => {
    const fallback = [
      'Paint & Consumables',
      'Construction Chemicals',
      'Machinery',
    ];
    const categoryNames = (categoriesRaw?.map((entry) => entry.categoryName) || fallback).slice(0, 6);

    const iconMap: Record<string, typeof Paintbrush> = {
      'Paint & Consumables': Paintbrush,
      'Construction Chemicals': FlaskConical,
      Machinery: HardHat,
      'Paint Supplies': Paintbrush,
      Abrasives: Disc3,
      Protective: Shield,
      Adhesives: Sparkles,
      Tapes: ScissorsLineDashed,
      Chemicals: FlaskConical,
      Tools: Wrench,
    };

    return categoryNames.map((categoryName) => ({
      name: categoryName,
      icon: iconMap[categoryName] || Package,
      iconWrapClass:
        categoryName === 'Paint & Consumables' || categoryName === 'Paint Supplies'
          ? 'bg-orange-50 text-orange-700 ring-1 ring-orange-100'
          : categoryName === 'Construction Chemicals' || categoryName === 'Chemicals'
            ? 'bg-cyan-50 text-cyan-700 ring-1 ring-cyan-100'
            : categoryName === 'Machinery'
              ? 'bg-slate-100 text-slate-700 ring-1 ring-slate-200'
              : categoryName === 'Abrasives'
                ? 'bg-violet-50 text-violet-700 ring-1 ring-violet-100'
                : categoryName === 'Protective'
                  ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100'
                  : categoryName === 'Adhesives'
                    ? 'bg-fuchsia-50 text-fuchsia-700 ring-1 ring-fuchsia-100'
                    : categoryName === 'Tapes'
                      ? 'bg-yellow-50 text-yellow-700 ring-1 ring-yellow-100'
                      : 'bg-[#fff1ed] text-[#C0392B] ring-1 ring-[#f4d8cf]',
      description:
        categoryName === 'Paint & Consumables'
          ? 'Brushes, rollers, thinner, and site consumables'
          : categoryName === 'Construction Chemicals'
            ? 'Sealants, epoxy systems, and treatment products'
            : categoryName === 'Machinery'
              ? 'Power tools, machines, and equipment'
              : 'Open catalog',
      onClick: () => navigate(`/client/order?category=${encodeURIComponent(categoryName)}`),
    }));
  }, [categoriesRaw, navigate]);

  return (
    <>
      <div className="space-y-6 animate-fade-in">
        <section className="overflow-hidden rounded-[24px] border border-[#C0392B]/15 bg-gradient-to-r from-[#fff7f4] via-background to-[#fff1ed] p-4 lg:p-5">
          <div className="grid gap-6 lg:grid-cols-[1.45fr_0.95fr] lg:items-center">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg bg-black ring-1 ring-black/10">
                  <img src="/brand/impex-engineering-logo.jpeg" alt="Impex Engineering" className="h-full w-full object-contain" />
                </div>
                <div className="flex h-12 w-32 items-center justify-center overflow-hidden rounded-lg border bg-white px-2">
                  <img src="/brand/thortex-logo.jpeg" alt="Thortex Philippines" className="h-full w-full object-contain" />
                </div>
              </div>
              <div className="space-y-2">
                <h1 className="text-[1.85rem] font-bold tracking-tight lg:text-[3rem]">
                  Welcome back, {user?.companyName || user?.name}
                </h1>
                <p className="max-w-xl text-[13px] text-muted-foreground lg:text-sm">
                  Quotations, orders, deliveries, and projects — all in one place.
                </p>
              </div>
            </div>

            <div className="space-y-3 rounded-[22px] bg-[#C0392B] p-3 text-white shadow-sm">
              <Button
                size="lg"
                className="h-16 w-full justify-between rounded-[18px] bg-white px-4 text-left text-sm font-semibold text-[#C0392B] hover:bg-white/95"
                onClick={() => navigate('/client/order?quote=1')}
              >
                <span className="flex items-center gap-4">
                  <span className="rounded-xl bg-[#C0392B]/10 p-2">
                    <MessageSquareMore size={18} />
                  </span>
                  <span className="text-base">Request Quotation</span>
                </span>
                <ArrowRight size={16} />
              </Button>
            </div>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-3">
          <div className="flex min-h-[30px] items-center">
            <h2 className="text-[1.45rem] font-semibold leading-none">Recommended for You</h2>
          </div>
          <div className="space-y-2.5">
            {recommendations.map((item) => (
              <button
                key={item.title}
                type="button"
                onClick={item.onClick}
                className="imx-surface imx-surface-hover imx-row-card-lg w-full px-4 py-3 text-left"
              >
                <div className="flex h-full items-center gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`rounded-xl p-2.5 ${item.iconWrapClass}`}>
                      <item.icon size={16} />
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-[15px] font-semibold leading-snug">{item.title}</p>
                      <p className="text-xs text-muted-foreground line-clamp-1">{item.description}</p>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
          </div>
          <div className="space-y-3">
            <div className="flex min-h-[30px] items-center justify-between gap-3">
            <h2 className="text-[1.45rem] font-semibold leading-none">Recent Updates</h2>
            <Button
              variant="ghost"
              className="h-7 gap-1.5 px-1.5 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground"
              onClick={() => navigate('/client/orders')}
            >
              View all
              <ArrowRight size={12} />
            </Button>
          </div>
          {recentActivity.length === 0 ? (
            <div className="rounded-3xl border border-dashed px-5 py-10 text-center text-sm text-muted-foreground">
              No activity yet. Start with a quotation request or your first order.
            </div>
          ) : (
            <div className="space-y-2.5">
              {recentActivity.map((activity) => (
                <div
                  key={activity.id}
                  className="imx-surface imx-row-card-lg flex items-center justify-between gap-3 px-3.5 py-2.5"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`rounded-xl p-2.5 ${activity.type === 'order' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>
                      {activity.type === 'order' ? <Package size={14} /> : <Truck size={14} />}
                    </div>
                    <div className="min-w-0 space-y-1">
                      <p className="text-sm font-semibold">{activity.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{activity.subtitle}</p>
                      <p className="text-xs text-muted-foreground">{new Date(activity.createdAt).toLocaleDateString('en-PH')}</p>
                    </div>
                  </div>
                  <Badge
                    className={`w-fit shrink-0 capitalize ${
                      statusBadgeClass(activity.status)
                    }`}
                  >
                    {activity.status.replace(/-/g, ' ')}
                  </Badge>
                </div>
              ))}
            </div>
          )}
          </div>
        </section>

        <section className="space-y-3">
          <div className="space-y-1">
            <h2 className="text-[1.45rem] font-semibold leading-none">Browse by Category</h2>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {categoryCards.map((category) => (
              <button
                key={category.name}
                type="button"
                onClick={category.onClick}
                className="imx-surface imx-surface-hover imx-grid-card flex items-center justify-between px-3.5 py-2.5 text-left"
              >
                <div className="flex items-center gap-3">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${category.iconWrapClass}`}>
                    <category.icon size={18} strokeWidth={2.2} />
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold">{category.name}</p>
                  </div>
                </div>
                <ArrowRight size={16} className="text-[#C0392B]" />
              </button>
            ))}
          </div>
        </section>

        <section>
          <div className="rounded-[28px] border bg-background p-5 lg:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">FAQs</h2>
              </div>
              <Button variant="ghost" className="gap-2" onClick={() => setShowHelp((prev) => !prev)}>
                {showHelp ? 'Hide FAQs' : 'Show FAQs'}
                {showHelp ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </Button>
            </div>
            {showHelp ? (
              <div className="mt-4 space-y-3">
                {faqs.map((faq) => (
                  <details key={faq.id} className="rounded-2xl border px-4 py-3">
                    <summary className="cursor-pointer list-none font-medium">{faq.question}</summary>
                    <p className="mt-2 text-sm text-muted-foreground">{faq.answer}</p>
                  </details>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        {rejectedProjects.length > 0 ? (
          <section className="rounded-[28px] border border-orange-200 bg-orange-50/60 p-5 lg:p-6">
            <div className="flex items-center gap-2 text-sm font-medium text-orange-700">
              <FolderKanban size={16} />
              Project follow-up
            </div>
            <div className="mt-4 space-y-3">
              {rejectedProjects.map((project) => (
                <div key={project.id} className="flex flex-col gap-3 rounded-2xl border bg-background px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold">{project.name}</p>
                    <p className="text-sm text-muted-foreground">Needs resubmission</p>
                  </div>
                  <Button variant="outline" onClick={() => openResubmit(project)}>
                    Resubmit Project
                  </Button>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      <Dialog open={resubmitOpen} onOpenChange={setResubmitOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Resubmit Project</DialogTitle>
            <DialogDescription>Update the project name if needed and resubmit for approval.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Project Name</Label>
            <Input
              value={resubmitName}
              onChange={(e) => {
                setResubmitName(e.target.value);
                if (resubmitError) setResubmitError('');
              }}
            />
            {resubmitError ? <p className="text-xs text-destructive">{resubmitError}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResubmitOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleResubmit}>Resubmit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
