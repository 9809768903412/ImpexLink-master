import { useEffect, useState } from 'react';
import { Search, Filter, ShoppingCart, Package, Plus, Minus, X, MessageSquare, FileText, Grid, List } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import PaginationNav from '@/components/PaginationNav';
import { useAuth } from '@/contexts/AuthContext';
import { useLocation, useNavigate } from 'react-router-dom';
import type { InventoryItem, Order, OrderItem, Project } from '@/types';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useResource } from '@/hooks/use-resource';
import { apiClient } from '@/api/client';
import { calcLineAmounts, calcTotalsFromItems, VAT_RATE } from '@/lib/vat';
import { ProductImage } from '@/components/ProductImage';

interface CartItem {
  item: InventoryItem;
  quantity: number;
}

interface QuoteFormState {
  customRequirements: string;
  projectId: string;
  attachmentName: string;
}

export default function PlaceOrderPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [cartHydrated, setCartHydrated] = useState(false);
  const [cartQtyInput, setCartQtyInput] = useState<Record<string, string>>({});
  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false);
  const [orderNumber, setOrderNumber] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [orderErrors, setOrderErrors] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const pageSize = 12;
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const { data: inventory } = useResource<InventoryItem[]>('/inventory', []);
  const { data: categories } = useResource<{ categoryName: string }[]>('/categories', []);
  const { data: projects, reload: reloadProjects } = useResource<Project[]>('/projects', []);
  const activeProjects = projects.filter((project) => project.status === 'active');
  const categoryList = categories.map((cat) => cat.categoryName);

  // Quote request form
  const [quoteForm, setQuoteForm] = useState<QuoteFormState>({
    customRequirements: '',
    projectId: '',
    attachmentName: '',
  });
  const [quoteErrors, setQuoteErrors] = useState<Record<string, string>>({});
  const [quoteAttachment, setQuoteAttachment] = useState<File | null>(null);
  const [isProjectRequestOpen, setIsProjectRequestOpen] = useState(false);
  const [projectRequestName, setProjectRequestName] = useState('');
  const [projectRequestError, setProjectRequestError] = useState('');

  const persistCart = (nextCart: CartItem[]) => {
    const payload = nextCart.map((ci) => ({ itemId: String(ci.item.id), quantity: ci.quantity }));
    localStorage.setItem('cart_items', JSON.stringify(payload));
  };

  useEffect(() => {
    const saved = localStorage.getItem('reorder_cart');
    if (!saved) return;
    const parsed = JSON.parse(saved) as OrderItem[];
    if (!parsed || parsed.length === 0) return;
    setCart(
      parsed
        .map((item) => {
          const inv = inventory.find((i) => String(i.id) === String(item.itemId));
          if (!inv) return null;
          return { item: inv, quantity: item.quantity };
        })
        .filter(Boolean) as CartItem[]
    );
    localStorage.removeItem('reorder_cart');
    setCartHydrated(true);
  }, [inventory]);

  useEffect(() => {
    if (inventory.length === 0) return;
    const saved = localStorage.getItem('cart_items');
    if (!saved) {
      setCartHydrated(true);
      return;
    }
    try {
      const parsed = JSON.parse(saved) as { itemId: string; quantity: number }[];
      if (!Array.isArray(parsed) || parsed.length === 0) return;
      const restored = parsed
        .map((entry) => {
          const inv = inventory.find((i) => String(i.id) === String(entry.itemId));
          if (!inv) return null;
          return { item: inv, quantity: entry.quantity };
        })
        .filter(Boolean) as CartItem[];
      setCart(restored);
      persistCart(restored);
      setCartHydrated(true);
    } catch {
      // ignore
      setCartHydrated(true);
    }
  }, [inventory]);

  useEffect(() => {
    if (!cartHydrated) return;
    persistCart(cart);
  }, [cart, cartHydrated]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('requestProject') === '1') {
      setIsProjectRequestOpen(true);
    }
    if (params.get('quote') === '1') {
      setIsQuoteModalOpen(true);
    }
    const categoryFromUrl = params.get('category');
    if (categoryFromUrl) {
      setCategoryFilter(categoryFromUrl);
    }
  }, [location.search]);

  // Filter inventory
  const filteredInventory = inventory.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });
  const totalPages = Math.max(1, Math.ceil(filteredInventory.length / pageSize));
  const pageStart = (page - 1) * pageSize;
  const pagedInventory = filteredInventory.slice(pageStart, pageStart + pageSize);

  // Cart calculations
  const totals = calcTotalsFromItems(
    cart.map((ci) => ({ quantity: ci.quantity, unitPrice: ci.item.unitPrice }))
  );
  const subtotal = totals.net;
  const vat = totals.vat;
  const total = totals.total;
  const vatLabel = Math.round(VAT_RATE * 100);

  const addToCart = (item: InventoryItem) => {
    if (item.status === 'out-of-stock') {
      toast({
        title: 'Out of Stock',
        description: 'This item is currently unavailable.',
        variant: 'destructive',
      });
      return;
    }

    setCart((prev) => {
      const existing = prev.find((ci) => ci.item.id === item.id);
      const nextQty = (existing?.quantity || 0) + 1;
      if (nextQty > item.qtyOnHand) {
        toast({
          title: 'Stock limit reached',
          description: `Only ${item.qtyOnHand} ${item.unit} of ${item.name} are available.`,
          variant: 'destructive',
        });
        return prev;
      }
      const next = existing
        ? prev.map((ci) =>
          ci.item.id === item.id ? { ...ci, quantity: nextQty } : ci
        )
        : [...prev, { item, quantity: 1 }];
      persistCart(next);
      return next;
    });

    toast({
      title: 'Added to cart',
      description: `${item.name} added to your cart.`,
    });
  };

  const updateCartQuantity = (itemId: string, quantity: number) => {
    setCart((prev) => {
      const current = prev.find((ci) => ci.item.id === itemId);
      if (current && quantity > current.item.qtyOnHand) {
        toast({
          title: 'Not enough stock',
          description: `Only ${current.item.qtyOnHand} ${current.item.unit} of ${current.item.name} are available.`,
          variant: 'destructive',
        });
        setCartQtyValue(itemId, String(current.item.qtyOnHand));
        const next = prev.map((ci) => (ci.item.id === itemId ? { ...ci, quantity: ci.item.qtyOnHand } : ci));
        persistCart(next);
        return next;
      }
      const next =
        quantity <= 0
          ? prev.filter((ci) => ci.item.id !== itemId)
          : prev.map((ci) => (ci.item.id === itemId ? { ...ci, quantity } : ci));
      persistCart(next);
      return next;
    });
  };

  const setCartQtyValue = (itemId: string, value: string) => {
    setCartQtyInput((prev) => ({ ...prev, [itemId]: value }));
  };

  const removeFromCart = (itemId: string) => {
    setCart((prev) => {
      const next = prev.filter((ci) => ci.item.id !== itemId);
      persistCart(next);
      return next;
    });
  };

  const clearCart = () => {
    setCart([]);
    persistCart([]);
    setCartQtyInput({});
    toast({
      title: 'Cart cleared',
      description: 'All items have been removed from your cart.',
    });
  };

  useEffect(() => {
    setPage(1);
  }, [searchQuery, categoryFilter]);

  const handlePlaceOrder = async () => {
    const errors: Record<string, string> = {};
    if (cart.length === 0) {
      toast({
        title: 'Cart is empty',
        description: 'Please add items before placing an order.',
        variant: 'destructive',
      });
      return;
    }
    if (cart.some((ci) => ci.quantity <= 0)) {
      toast({
        title: 'Invalid quantity',
        description: 'Quantities must be greater than 0.',
        variant: 'destructive',
      });
      return;
    }
    const overStock = cart.find((ci) => ci.quantity > ci.item.qtyOnHand);
    if (overStock) {
      toast({
        title: 'Not enough stock',
        description: `Only ${overStock.item.qtyOnHand} ${overStock.item.unit} of ${overStock.item.name} are available.`,
        variant: 'destructive',
      });
      return;
    }
    if (activeProjects.length === 0) {
      errors.projectId = 'Please request a project before placing an order.';
    }
    if (activeProjects.length > 0 && !selectedProjectId) {
      errors.projectId = 'Please select a project.';
    }
    setOrderErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast({
        title: 'Missing information',
        description: 'Please review the highlighted fields.',
        variant: 'destructive',
      });
      return;
    }
    const newOrderNumber = `ORD-2025-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
    const orderItems: OrderItem[] = cart.map((cartItem) => ({
      itemId: cartItem.item.id,
      itemName: cartItem.item.name,
      unit: cartItem.item.unit,
      quantity: cartItem.quantity,
      unitPrice: cartItem.item.unitPrice,
      amount: cartItem.item.unitPrice * cartItem.quantity,
    }));
    try {
      await apiClient.post<Order>('/orders', {
        orderNumber: newOrderNumber,
        clientId: user?.clientId,
        projectId: selectedProjectId || undefined,
        items: orderItems,
        subtotal,
        vat,
        total,
        status: 'pending',
        paymentStatus: 'pending',
        specialInstructions,
      });
    } catch (err: any) {
      toast({
        title: 'Order failed',
        description: err?.response?.data?.error || 'Unable to place order. Please review stock and try again.',
        variant: 'destructive',
      });
      return;
    }
    setCart([]);
    persistCart([]);
    setCartQtyInput({});
    setOrderNumber(newOrderNumber);
    setIsCartOpen(false);
    setIsConfirmationOpen(true);
    toast({
      title: 'Order submitted',
      description: 'Next step: wait for admin approval, then upload your purchase order when it is available.',
    });
  };

  const handleRequestProject = async () => {
    if (!projectRequestName.trim()) {
      setProjectRequestError('Project name is required.');
      return;
    }
    setProjectRequestError('');
    try {
      await apiClient.post('/projects', { name: projectRequestName.trim() });
      toast({
        title: 'Project requested',
        description: 'Your project request was sent for approval.',
      });
      setProjectRequestName('');
      setIsProjectRequestOpen(false);
      reloadProjects();
    } catch (err: any) {
      const message =
        err?.response?.data?.error ||
        err?.message ||
        'Unable to submit project request. Please try again.';
      setProjectRequestError(message);
      toast({
        title: 'Request failed',
        description: message,
        variant: 'destructive',
      });
    }
  };

  const handleNotifyMe = (item: InventoryItem) => {
    apiClient
      .post(`/inventory/${item.id}/watch`)
      .then(() => {
        toast({
          title: 'Notification set',
          description: `We'll notify you when ${item.name} is back in stock.`,
        });
      })
      .catch(() => {
        toast({
          title: 'Unable to watch item',
          description: 'Please try again.',
          variant: 'destructive',
        });
      });
  };

  const handleSubmitQuote = () => {
    const errors: Record<string, string> = {};
    if (!quoteAttachment && !quoteForm.attachmentName.trim()) {
      errors.attachment = 'Please attach your purchase order or project file.';
    }
    setQuoteErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast({
        title: 'Missing information',
        description: 'Please complete the required fields.',
        variant: 'destructive',
      });
      return;
    }
    apiClient.post('/quote-requests', {
      clientId: user?.clientId,
      projectId: quoteForm.projectId || undefined,
      items: [
        {
          name: quoteForm.attachmentName || quoteAttachment?.name || 'Attached quotation request',
          quantity: 1,
          notes: 'Submitted through file attachment flow',
        },
      ],
      customRequirements: [
        quoteForm.customRequirements?.trim(),
        `Attachment: ${quoteForm.attachmentName || quoteAttachment?.name || 'Provided by client'}`,
      ]
        .filter(Boolean)
        .join('\n'),
    }).catch(() => {
      // keep optimistic UI
    });
    toast({
      title: 'Quote Request Sent',
      description: 'Your quote request has been submitted. Expect a response within 24 hours.',
    });
    setIsQuoteModalOpen(false);
    setQuoteAttachment(null);
    setQuoteForm({ customRequirements: '', projectId: '', attachmentName: '' });
  };

  const getStockBadge = (item: InventoryItem) => {
    switch (item.status) {
      case 'in-stock':
        return (
          <Badge className="bg-success/10 text-success border-success/20" variant="outline">
            In Stock: {item.qtyOnHand} {item.unit}
          </Badge>
        );
      case 'low-stock':
        return (
          <Badge className="bg-warning/10 text-warning border-warning/20" variant="outline">
            Low: {item.qtyOnHand} {item.unit}
          </Badge>
        );
      case 'out-of-stock':
        return (
          <Badge className="bg-destructive/10 text-destructive border-destructive/20" variant="outline">
            Out of Stock
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Catalog</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsQuoteModalOpen(true)} className="gap-2">
            <MessageSquare size={18} />
            Request Quotation
          </Button>
          <Dialog open={isCartOpen} onOpenChange={setIsCartOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 relative">
                <ShoppingCart size={18} />
                Cart
                {cart.length > 0 && (
                  <Badge className="absolute -top-2 -right-2 h-5 w-5 rounded-full p-0 flex items-center justify-center bg-secondary">
                    {cart.length}
                  </Badge>
                )}
              </Button>
            </DialogTrigger>
            <DialogContent className="w-full sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ShoppingCart size={20} />
                  Your Cart
                </DialogTitle>
                <DialogDescription>
                  {cart.length === 0
                    ? 'Your cart is empty'
                    : `${cart.length} item${cart.length > 1 ? 's' : ''} in your cart`}
                </DialogDescription>
              </DialogHeader>

              {cart.length > 0 ? (
                <div className="flex justify-end">
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={clearCart}>
                    Clear Cart
                  </Button>
                </div>
              ) : null}

              <ScrollArea className="flex-1 -mx-6 px-6">
                <div className="space-y-4 py-4">
                  {cart.map((cartItem) => {
                    const line = calcLineAmounts(cartItem.quantity, cartItem.item.unitPrice);
                    return (
                    <div key={cartItem.item.id} className="flex gap-3 p-3 bg-muted/50 rounded-lg">
                      <ProductImage name={cartItem.item.name} className="h-12 w-12 shrink-0" iconSize={20} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{cartItem.item.name}</p>
                        <p className="text-sm text-muted-foreground">
                          ₱{cartItem.item.unitPrice.toLocaleString('en-PH')} / {cartItem.item.unit}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Net: ₱{line.net.toLocaleString('en-PH', { minimumFractionDigits: 2 })} • VAT: ₱
                          {line.vat.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                        </p>
                        <p className="text-xs font-medium text-foreground/80">
                          Available stock: {cartItem.item.qtyOnHand.toLocaleString('en-PH')} {cartItem.item.unit}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => updateCartQuantity(cartItem.item.id, cartItem.quantity - 1)}
                        >
                          <Minus size={14} />
                        </Button>
                        <Input
                          className="h-8 w-16 text-center"
                          value={cartQtyInput[cartItem.item.id] ?? String(cartItem.quantity)}
                          inputMode="numeric"
                          onChange={(e) => {
                            const raw = e.target.value.replace(/[^\d]/g, '');
                            setCartQtyValue(cartItem.item.id, raw);
                          }}
                          onBlur={() => {
                            const raw = cartQtyInput[cartItem.item.id];
                            if (!raw) {
                              setCartQtyValue(cartItem.item.id, String(cartItem.quantity));
                              return;
                            }
                            const next = Number(raw);
                            if (!Number.isFinite(next) || next <= 0) {
                              setCartQtyValue(cartItem.item.id, String(cartItem.quantity));
                              return;
                            }
                            updateCartQuantity(cartItem.item.id, next);
                          }}
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => updateCartQuantity(cartItem.item.id, cartItem.quantity + 1)}
                        >
                          <Plus size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => removeFromCart(cartItem.item.id)}
                        >
                          <X size={14} />
                        </Button>
                      </div>
                    </div>
                  )})}
                </div>
              </ScrollArea>

              {cart.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <Label>Project</Label>
                      <Select
                        value={selectedProjectId}
                        onValueChange={(value) => {
                          setSelectedProjectId(value);
                          if (orderErrors.projectId) {
                            setOrderErrors((prev) => ({ ...prev, projectId: '' }));
                          }
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={activeProjects.length > 0 ? 'Select project' : 'No projects available'} />
                        </SelectTrigger>
                        <SelectContent>
                          {activeProjects.map((project) => (
                            <SelectItem key={project.id} value={project.id}>
                              {project.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {activeProjects.length === 0 && (
                        <div className="flex items-center justify-between rounded-md border border-dashed p-3">
                          <span className="text-xs text-muted-foreground">
                            No projects yet. Request one to continue.
                          </span>
                          <Button size="sm" variant="outline" onClick={() => setIsProjectRequestOpen(true)}>
                            Request Project
                          </Button>
                        </div>
                      )}
                      {orderErrors.projectId && (
                        <p className="text-xs text-destructive">{orderErrors.projectId}</p>
                      )}
                    </div>

                    {/* Special Instructions */}
                    <div className="space-y-2">
                      <Label htmlFor="instructions">Special Instructions (optional)</Label>
                      <Textarea
                        id="instructions"
                        placeholder="Any special requirements..."
                        value={specialInstructions}
                        onChange={(e) => setSpecialInstructions(e.target.value)}
                        rows={2}
                      />
                    </div>

                    {/* Totals */}
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">VATable Sales</span>
                        <span>₱{subtotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">VAT ({vatLabel}%)</span>
                        <span>₱{vat.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <Separator />
                      <div className="flex justify-between text-lg font-bold">
                        <span>Total Amount Due</span>
                        <span className="text-primary">
                          ₱{total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </div>
                  <DialogFooter className="pt-4">
                    <Button className="w-full" size="lg" onClick={handlePlaceOrder}>
                      Place Order
                    </Button>
                  </DialogFooter>
                </>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
              <Input
                placeholder="Search products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <Filter size={16} className="mr-2 text-muted-foreground" />
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categoryList.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Button
                variant={viewMode === 'grid' ? 'default' : 'outline'}
                size="icon"
                onClick={() => setViewMode('grid')}
                title="Grid view"
              >
                <Grid size={18} />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'outline'}
                size="icon"
                onClick={() => setViewMode('list')}
                title="List view"
              >
                <List size={18} />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Products */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {pagedInventory.map((item) => {
            const inCart = cart.find((ci) => ci.item.id === item.id);

            return (
              <Card key={item.id} className="relative group h-full hover:shadow-md transition-shadow">
                <CardContent className="flex h-full flex-col p-4">
                  <ProductImage name={item.name} className="mb-3 h-32 w-full rounded-lg p-2" iconSize={32} />

                  <div className="flex flex-1 flex-col">
                    <div className="space-y-2">
                      <div className="min-h-[2rem]">
                        {getStockBadge(item)}
                      </div>
                      <h3 className="min-h-[3.5rem] font-semibold leading-7 line-clamp-2">{item.name}</h3>
                      <p className="min-h-[1.25rem] text-sm text-muted-foreground">{item.category}</p>
                      <p className="text-lg font-bold text-primary">
                        ₱{item.unitPrice.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                        <span className="text-sm font-normal text-muted-foreground"> / {item.unit}</span>
                      </p>
                    </div>

                    <div className="mt-auto flex gap-2 pt-4">
                      {item.status === 'out-of-stock' ? (
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => handleNotifyMe(item)}
                        >
                          Notify Me
                        </Button>
                      ) : (
                        <Button
                          className="w-full gap-2"
                          onClick={() => addToCart(item)}
                          variant={inCart ? 'secondary' : 'default'}
                        >
                          <Plus size={16} />
                          {inCart ? `In Cart (${inCart.quantity})` : 'Add'}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="space-y-3">
          {pagedInventory.map((item) => {
            const inCart = cart.find((ci) => ci.item.id === item.id);
            return (
              <Card key={item.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    <ProductImage name={item.name} className="h-16 w-16 shrink-0 rounded-lg p-1.5" iconSize={28} />
                    <div className="flex-1 min-w-0 space-y-1">
                      <h3 className="font-semibold line-clamp-1">{item.name}</h3>
                      <p className="text-sm text-muted-foreground">{item.category}</p>
                      {getStockBadge(item)}
                    </div>
                    <div className="flex flex-col sm:items-end gap-2">
                      <p className="text-lg font-bold text-primary">
                        ₱{item.unitPrice.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                        <span className="text-sm font-normal text-muted-foreground"> / {item.unit}</span>
                      </p>
                      {item.status === 'out-of-stock' ? (
                        <Button variant="outline" onClick={() => handleNotifyMe(item)}>
                          Notify Me
                        </Button>
                      ) : (
                        <Button
                          className="gap-2"
                          onClick={() => addToCart(item)}
                          variant={inCart ? 'secondary' : 'default'}
                        >
                          <Plus size={16} />
                          {inCart ? `In Cart (${inCart.quantity})` : 'Add'}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Results count */}
      <div className="text-sm text-muted-foreground">
        Showing {pagedInventory.length} of {filteredInventory.length} products
      </div>

      <div className="flex items-center justify-center">
        <PaginationNav
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      </div>

      {/* Quote Request Modal */}
      <Dialog open={isQuoteModalOpen} onOpenChange={setIsQuoteModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare size={20} />
              Request Quotation
            </DialogTitle>
            <DialogDescription>
              Attach your purchase order, bill of materials, or project brief and our team will review it within 24 hours.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Project (optional)</Label>
              <Select
                value={quoteForm.projectId}
                onValueChange={(value) => setQuoteForm((prev) => ({ ...prev, projectId: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={activeProjects.length > 0 ? 'Select project' : 'No projects available'} />
                </SelectTrigger>
                <SelectContent>
                  {activeProjects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="quoteAttachment">Attachment</Label>
              <Input
                id="quoteAttachment"
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  setQuoteAttachment(file);
                  setQuoteForm((prev) => ({
                    ...prev,
                    attachmentName: file?.name || '',
                  }));
                  if (quoteErrors.attachment) {
                    setQuoteErrors((prev) => ({ ...prev, attachment: '' }));
                  }
                }}
              />
              {quoteForm.attachmentName && (
                <p className="text-xs text-muted-foreground">Selected file: {quoteForm.attachmentName}</p>
              )}
              {quoteErrors.attachment && <p className="text-xs text-destructive">{quoteErrors.attachment}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="quoteRequirements">Custom Requirements / Extra Messages</Label>
              <Textarea
                id="quoteRequirements"
                placeholder="Tell us the scope, budget notes, delivery schedule, site condition, or anything else we should know."
                value={quoteForm.customRequirements}
                onChange={(e) => setQuoteForm((prev) => ({ ...prev, customRequirements: e.target.value }))}
                rows={5}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsQuoteModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmitQuote}>Submit Quote Request</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Order Confirmation Modal */}
      <Dialog open={isConfirmationOpen} onOpenChange={setIsConfirmationOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-success">
              <FileText size={24} />
              Order Placed Successfully!
            </DialogTitle>
            <DialogDescription>
              Your order has been submitted and is pending processing.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg text-center">
              <p className="text-sm text-muted-foreground">Order Number</p>
              <p className="text-2xl font-bold">{orderNumber}</p>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Items</span>
                <span>{cart.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Amount</span>
                <span className="font-bold">
                  ₱{total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <div className="p-3 bg-info/10 rounded-lg">
              <p className="text-sm text-info">
                Next step: wait for admin approval. Once your PO is available, upload it from "My Orders" for OCR matching.
              </p>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => navigate('/client/orders')}>
              View My Orders
            </Button>
            <Button
              onClick={() => {
                setCart([]);
                setSpecialInstructions('');
                setIsConfirmationOpen(false);
              }}
            >
              Continue Shopping
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Project Request Modal */}
      <Dialog open={isProjectRequestOpen} onOpenChange={setIsProjectRequestOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Request a Project</DialogTitle>
            <DialogDescription>
              Provide the project name. An admin will review and approve it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="projectName">Project Name</Label>
            <Input
              id="projectName"
              value={projectRequestName}
              onChange={(e) => {
                setProjectRequestName(e.target.value);
                if (projectRequestError) setProjectRequestError('');
              }}
              placeholder="e.g., Office Renovation"
            />
            {projectRequestError && <p className="text-xs text-destructive">{projectRequestError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsProjectRequestOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRequestProject}>Submit Request</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
