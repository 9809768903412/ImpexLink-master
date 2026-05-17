import { useEffect, useState } from 'react';
import { Search, Filter, Plus, Download } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
 
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import type { InventoryItem, StockTransaction } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { useResource } from '@/hooks/use-resource';
import { apiClient } from '@/api/client';
import { getCache, setCache } from '@/hooks/cache';
import { Skeleton } from '@/components/ui/skeleton';
import { downloadCsv } from '@/utils/csv';
import { useAuth } from '@/contexts/AuthContext';
import { canManageInventory } from '@/lib/roles';
import PaginationNav from '@/components/PaginationNav';

const INVENTORY_REASON_OPTIONS = [
  'Stock Adjustment',
  'Damage/Loss',
  'Return',
  'New Arrival',
  'Correction',
  'Theft',
  'Expiration',
  'Others',
];

const STOCK_ACTION_REASON_OPTIONS: Record<'restock' | 'issue' | 'adjust', string[]> = {
  restock: ['Supplier Delivery', 'Returned Stock', 'Replacement Stock', 'Emergency Refill', 'Initial Stock', 'Other'],
  issue: ['Client Order Fulfillment', 'Project Use', 'Material Request', 'Warehouse Transfer', 'Sample Issue', 'Other'],
  adjust: ['Cycle Count Correction', 'Damage/Loss', 'Expired Items', 'System Correction', 'Theft/Incident', 'Other'],
};

const UNIT_OPTIONS = ['Pieces', 'Gallons', 'Kilograms', 'Liters', 'Bundles', 'Kits', 'Sacks', 'Pairs', 'Rolls', 'Boxes', 'Sets'];

export default function InventoryPage() {
  const { user } = useAuth();
  const roleInput = user?.roles?.length ? user.roles : user?.role;
  const canEditInventory = canManageInventory(roleInput);
  const canEditItemInfo = roleInput ? (Array.isArray(roleInput) ? roleInput.includes('admin') : roleInput === 'admin') : false;
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const getDisplayId = (item: InventoryItem) =>
    `INV${String(Number.parseInt(String(item.id), 10) || 0).padStart(3, '0')}`;
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [stockAction, setStockAction] = useState<{
    open: boolean;
    type: 'restock' | 'issue' | 'adjust';
    item: InventoryItem | null;
    qty: string;
    notes: string;
    direction: 'add' | 'deduct';
  }>({
    open: false,
    type: 'restock',
    item: null,
    qty: '',
    notes: '',
    direction: 'add',
  });
  const [sortKey] = useState<'name' | 'qty' | 'price'>('name');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [totalItems, setTotalItems] = useState(0);
  const [inventory, setInventory] = useState<InventoryItem[]>(
    () => getCache<InventoryItem[]>('inventory') || []
  );
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [newItem, setNewItem] = useState({
    name: '',
    category: '',
    unit: '',
    unitPrice: 0,
    qtyOnHand: 0,
    minStock: 20,
  });
  const [newItemErrors, setNewItemErrors] = useState<Record<string, string>>({});
  const [editItem, setEditItem] = useState({
    id: '',
    name: '',
    category: '',
    unit: '',
    unitPrice: 0,
    minStock: 20,
    originalUnitPrice: 0,
    priceUpdateNote: '',
  });
  const [editItemErrors, setEditItemErrors] = useState<Record<string, string>>({});
  const { toast } = useToast();
  const { data: transactions, reload: reloadTransactions } = useResource<StockTransaction[]>('/transactions', []);
  const { data: categories } = useResource<{ categoryName: string }[]>('/categories', []);
  const categoryList = categories.map((cat) => cat.categoryName);

  const reloadInventory = async () => {
    setLoadingInventory(true);
    try {
      const response = await apiClient.get('/inventory', {
        params: {
          q: searchQuery || undefined,
          category: categoryFilter !== 'all' ? categoryFilter : undefined,
          status: statusFilter !== 'all' ? statusFilter : undefined,
          page: 1,
          pageSize: 1000,
          sortBy: sortKey === 'qty' ? 'qtyOnHand' : sortKey === 'price' ? 'unitPrice' : 'itemName',
          sortDir: 'desc',
        },
      });
      const payload = response.data;
      const normalizeStatus = (value: string) => {
        const normalized = value.replace(/[\s_]/g, '-').toLowerCase();
        if (normalized.includes('available') || normalized === 'in-stock') return 'in-stock';
        if (normalized.includes('low')) return 'low-stock';
        if (normalized.includes('out')) return 'out-of-stock';
        return 'in-stock';
      };
      const normalizeItems = (items: any[]) =>
        items.map((item) => ({
          ...item,
          status: normalizeStatus(String(item.status || 'in-stock')),
        }));
      if (payload?.data) {
        const normalized = normalizeItems(payload.data);
        setInventory(normalized);
        setTotalItems(normalized.length);
        setCache('inventory', normalized);
        setLastUpdated(Date.now());
      } else {
        const normalized = Array.isArray(payload) ? normalizeItems(payload) : [];
        setInventory(normalized);
        setTotalItems(normalized.length || 0);
        setCache('inventory', normalized);
        setLastUpdated(Date.now());
      }
    } catch (err) {
      setInventory([]);
      setTotalItems(0);
    } finally {
      setLoadingInventory(false);
    }
  };

  useEffect(() => {
    reloadInventory();
  }, [categoryFilter, statusFilter, page, pageSize, searchQuery]);

  useEffect(() => {
    if (!newItem.category && categoryList.length > 0) {
      setNewItem((prev) => ({ ...prev, category: categoryList[0] }));
    }
  }, [categoryList, newItem.category]);

  useEffect(() => {
    if (!selectedItem) return;
    const updated = inventory.find((item) => item.id === selectedItem.id);
    if (updated) {
      setSelectedItem(updated);
    }
  }, [inventory, selectedItem?.id]);

  useEffect(() => {
    setPage(1);
  }, [categoryFilter, statusFilter, searchQuery]);

  const validateItem = (item: typeof newItem) => {
    const errors: Record<string, string> = {};
    if (!item.name.trim()) errors.name = 'Item name is required.';
    if (!item.category) errors.category = 'Category is required.';
    if (item.unitPrice < 0) errors.unitPrice = 'Unit price must be 0 or greater.';
    if (item.qtyOnHand < 0) errors.qtyOnHand = 'Quantity must be 0 or greater.';
    if (item.minStock < 0) errors.minStock = 'Low stock threshold must be 0 or greater.';
    return errors;
  };
  const validateEditItem = (item: typeof editItem) => {
    const errors: Record<string, string> = {};
    if (!item.name.trim()) errors.name = 'Item name is required.';
    if (!item.category) errors.category = 'Category is required.';
    if (item.unitPrice < 0) errors.unitPrice = 'Unit price must be 0 or greater.';
    if (item.unitPrice !== item.originalUnitPrice && !item.priceUpdateNote.trim()) {
      errors.priceUpdateNote = 'Add a note for supplier price changes.';
    }
    if (item.minStock < 0) errors.minStock = 'Low stock threshold must be 0 or greater.';
    return errors;
  };

  // Filter inventory
  const scopedInventory =
    roleInput && (Array.isArray(roleInput) ? roleInput.includes('paint_chemist') : roleInput === 'paint_chemist')
      ? inventory.filter((item) => item.category === 'Paint & Consumables')
      : inventory;
  const filteredInventory =
    statusFilter === 'all'
      ? scopedInventory
      : scopedInventory.filter((item) => item.status === statusFilter);
  const sortedInventory = filteredInventory;
  const pageStart = (page - 1) * pageSize;
  const pageEnd = pageStart + pageSize;
  const pagedInventory = sortedInventory.slice(pageStart, pageEnd);
  const totalFilteredItems = sortedInventory.length;
  const tableColSpan = 5;

  // Get transactions for selected item
  const itemTransactions = selectedItem
    ? transactions.filter((t) => t.itemId === selectedItem.id)
    : [];
  const selectedItemDisplayId = selectedItem ? getDisplayId(selectedItem) : '';
  const lastUpdatedTxn = itemTransactions.sort((a, b) => Date.parse(b.date) - Date.parse(a.date))[0];
  const lastRestockTxn = itemTransactions.find((t) => t.type === 'purchase');
  const monthlyUsage = itemTransactions
    .filter((t) => t.type === 'issue' && Date.now() - Date.parse(t.date) <= 1000 * 60 * 60 * 24 * 30)
    .reduce((sum, t) => sum + Math.abs(t.qtyChange), 0);

  const handleItemClick = (item: InventoryItem) => {
    setSelectedItem(item);
    setIsDetailOpen(true);
    reloadTransactions();
  };

  const handleAddItem = () => {
    setIsAddOpen(true);
  };

  const handleCreateItem = async () => {
    const errors = validateItem(newItem);
    setNewItemErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast({ title: 'Fix validation errors', description: 'Please review the highlighted fields.', variant: 'destructive' });
      return;
    }
    try {
      await apiClient.post('/inventory', {
        itemName: newItem.name,
        categoryName: newItem.category,
        unit: newItem.unit,
        unitPrice: newItem.unitPrice,
        qtyOnHand: newItem.qtyOnHand,
        lowStockThreshold: newItem.minStock,
      });
      await reloadInventory();
      await reloadTransactions();
      toast({ title: 'Item added', description: `${newItem.name} was added to inventory.` });
      setIsAddOpen(false);
      setNewItem({
        name: '',
        category: '',
        unit: '',
        unitPrice: 0,
        qtyOnHand: 0,
        minStock: 20,
      });
      setNewItemErrors({});
    } catch (err) {
      toast({ title: 'Failed to add item', description: 'Please try again.', variant: 'destructive' });
    }
  };

  // Adjust stock removed per request

  const handleOpenEdit = (item: InventoryItem) => {
    if (!canEditItemInfo) return;
    setEditItem({
      id: item.id,
      name: item.name,
      category: item.category,
      unit: item.unit,
      unitPrice: item.unitPrice,
      minStock: item.minStock,
      originalUnitPrice: item.unitPrice,
      priceUpdateNote: '',
    });
    setEditItemErrors({});
    setIsEditOpen(true);
  };

  const handleSaveEdit = async () => {
    const errors = validateEditItem(editItem);
    setEditItemErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast({ title: 'Fix validation errors', description: 'Please review the highlighted fields.', variant: 'destructive' });
      return;
    }
    try {
      await apiClient.put(`/inventory/${editItem.id}`, {
        itemName: editItem.name,
        categoryName: editItem.category,
        unit: editItem.unit,
        unitPrice: editItem.unitPrice,
        lowStockThreshold: editItem.minStock,
        priceUpdateNote: editItem.priceUpdateNote.trim() || undefined,
      });
      await reloadInventory();
      await reloadTransactions();
      toast({ title: 'Item updated', description: `${editItem.name} was updated.` });
      setIsEditOpen(false);
    } catch (err) {
      toast({ title: 'Failed to update item', description: 'Please try again.', variant: 'destructive' });
    }
  };

  const [editAdjustQty, setEditAdjustQty] = useState('');
  const [editAdjustNotes, setEditAdjustNotes] = useState('');

  const handleAdjustmentFromEdit = async () => {
    if (!canEditItemInfo) return;
    const qtyValue = Number(editAdjustQty);
    if (!Number.isFinite(qtyValue) || qtyValue < 0) {
      toast({ title: 'Invalid quantity', description: 'Stock on hand must be 0 or greater.', variant: 'destructive' });
      return;
    }
    if (!editAdjustNotes.trim()) {
      toast({ title: 'Missing reference', description: 'Reason/notes are required.', variant: 'destructive' });
      return;
    }
    try {
      await apiClient.put(`/inventory/${editItem.id}/stock`, {
        newBalance: qtyValue,
        type: 'ADJUSTMENT',
        notes: editAdjustNotes.trim(),
      });
      await reloadInventory();
      await reloadTransactions();
      toast({ title: 'Stock adjusted', description: `${editItem.name} updated.` });
      setEditAdjustQty('');
      setEditAdjustNotes('');
    } catch (err) {
      toast({ title: 'Adjustment failed', description: 'Please try again.', variant: 'destructive' });
    }
  };

  const getStatusBadge = (status: InventoryItem['status']) => {
    switch (status) {
      case 'in-stock':
        return <Badge className="bg-success text-success-foreground">In Stock</Badge>;
      case 'low-stock':
        return <Badge className="bg-warning text-warning-foreground">Low Stock</Badge>;
      case 'out-of-stock':
        return <Badge className="bg-destructive text-destructive-foreground">Out of Stock</Badge>;
    }
  };

  const openStockAction = (type: 'restock' | 'issue' | 'adjust', item: InventoryItem) => {
    setStockAction({
      open: true,
      type,
      item,
      qty: '',
      notes: '',
      direction: 'add',
    });
  };

  const handleStockAction = async () => {
    if (!stockAction.item) return;
    const qtyValue = Number(stockAction.qty);
    if (!Number.isFinite(qtyValue) || qtyValue <= 0) {
      toast({ title: 'Invalid quantity', description: 'Quantity must be greater than 0.', variant: 'destructive' });
      return;
    }
    if ((stockAction.type === 'issue' || stockAction.type === 'adjust') && !stockAction.notes.trim()) {
      toast({ title: 'Missing reference', description: 'Reference/notes are required.', variant: 'destructive' });
      return;
    }
    const qtyChange =
      stockAction.type === 'issue'
        ? -qtyValue
        : stockAction.type === 'adjust'
          ? (stockAction.direction === 'deduct' ? -qtyValue : qtyValue)
          : qtyValue;
    const type =
      stockAction.type === 'restock'
        ? 'PURCHASE'
        : stockAction.type === 'issue'
          ? 'ISSUE'
          : 'ADJUSTMENT';
    try {
      await apiClient.put(`/inventory/${stockAction.item.id}/stock`, {
        qtyChange,
        type,
        notes: stockAction.notes.trim() || null,
      });
      await reloadInventory();
      await reloadTransactions();
      toast({
        title: 'Stock updated',
        description: `${stockAction.item.name} updated successfully.`,
      });
      setStockAction((prev) => ({ ...prev, open: false }));
    } catch (err) {
      toast({ title: 'Update failed', description: 'Please try again.', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Inventory Management</h1>
          <p className="text-muted-foreground">Manage stock levels and track item movements</p>
        </div>
        {lastUpdated && (
          <p className="text-xs text-muted-foreground">
            Last updated {new Date(lastUpdated).toLocaleTimeString()}
          </p>
        )}
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              const rows = [
                ['Item Name', 'Category', 'Unit', 'Qty On Hand', 'Unit Price', 'Status'],
                ...scopedInventory.map((item) => [
                  item.name,
                  item.category,
                  item.unit,
                  String(item.qtyOnHand),
                  String(item.unitPrice),
                  item.status,
                ]),
              ];
              downloadCsv(`inventory-${new Date().toISOString().slice(0, 10)}.csv`, rows);
            }}
          >
            <Download size={16} className="mr-2" />
            Export CSV
          </Button>
          {canEditItemInfo && (
            <Button onClick={handleAddItem} className="gap-2">
              <Plus size={18} />
              Add Item
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
              <Input
                placeholder="Search items..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                className="pl-10"
              />
            </div>
            <Select
              value={categoryFilter}
              onValueChange={(value) => {
                setCategoryFilter(value);
                setPage(1);
              }}
            >
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
            <Select
              value={statusFilter}
              onValueChange={(value) => {
                setStatusFilter(value);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="in-stock">In Stock</SelectItem>
                <SelectItem value="low-stock">Low Stock</SelectItem>
                <SelectItem value="out-of-stock">Out of Stock</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Inventory Display */}
      <Card>
        <CardContent className="p-0">
          <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item ID</TableHead>
                  <TableHead>Item Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingInventory && sortedInventory.length === 0 ? (
                  Array.from({ length: 6 }).map((_, idx) => (
                    <TableRow key={`sk-${idx}`}>
                      <TableCell colSpan={tableColSpan}>
                        <Skeleton className="h-6 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : pagedInventory.length > 0 ? (
                  pagedInventory.map((item, index) => (
                  <TableRow
                    key={item.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleItemClick(item)}
                  >
                    <TableCell className="font-medium">
                      {getDisplayId(item)}
                    </TableCell>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell>{item.category}</TableCell>
                    <TableCell className="text-right">
                      {item.qtyOnHand.toLocaleString()} {item.unit}
                    </TableCell>
                    <TableCell>{getStatusBadge(item.status)}</TableCell>
                  </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={tableColSpan} className="text-center text-muted-foreground py-8">
                      <div className="space-y-3">
                        <p>No inventory items found</p>
                        {canEditItemInfo && (
                          <Button variant="outline" size="sm" onClick={handleAddItem}>
                            Add Item
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Results count */}
      <div className="text-sm text-muted-foreground">
        Showing {pagedInventory.length} of {totalFilteredItems} items
      </div>

      <div className="flex items-center justify-center">
        <PaginationNav
          page={page}
          totalPages={Math.max(Math.ceil(totalFilteredItems / pageSize), 1)}
          onPageChange={setPage}
          disabled={loadingInventory}
        />
      </div>

      {/* Item Detail Modal */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Item Details</DialogTitle>
            <DialogDescription>
              {selectedItem?.name}
            </DialogDescription>
          </DialogHeader>

          {selectedItem && (
            <div className="space-y-6">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold">Item Details</h3>
                  <p className="text-sm text-muted-foreground">{selectedItem.name}</p>
                </div>
                {getStatusBadge(selectedItem.status)}
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Item ID</p>
                  <p className="font-medium">{selectedItemDisplayId || selectedItem.id}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Item Name</p>
                  <p className="font-medium">{selectedItem.name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Category</p>
                  <p className="font-medium">{selectedItem.category}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Quantity</p>
                  <p className="font-medium">
                    {selectedItem.qtyOnHand} {selectedItem.unit}
                  </p>
                </div>
              </div>

              <div className="rounded-lg border p-4 space-y-2">
                <p className="font-semibold">Stock History</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Last Updated</p>
                    <p className="font-medium">
                      {lastUpdatedTxn ? new Date(lastUpdatedTxn.date).toLocaleDateString('en-PH') : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Last Restock</p>
                    <p className="font-medium">
                      {lastRestockTxn ? new Date(lastRestockTxn.date).toLocaleDateString('en-PH') : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Monthly Usage</p>
                    <p className="font-medium">{monthlyUsage} units</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 justify-end">
                <Button variant="outline" onClick={() => setIsDetailOpen(false)}>
                  Close
                </Button>
                {canEditInventory && (
                  <Button
                    variant="outline"
                    onClick={() => selectedItem && openStockAction('restock', selectedItem)}
                  >
                    Stock In
                  </Button>
                )}
                {canEditInventory && (
                  <Button
                    variant="outline"
                    onClick={() => selectedItem && openStockAction('issue', selectedItem)}
                  >
                    Stock Out
                  </Button>
                )}
                {canEditItemInfo && (
                  <Button onClick={() => selectedItem && handleOpenEdit(selectedItem)}>
                    Edit / Adjust
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Stock Action Modal */}
      <Dialog open={stockAction.open} onOpenChange={(open) => setStockAction((prev) => ({ ...prev, open }))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {stockAction.type === 'restock'
                ? 'Stock In'
                : stockAction.type === 'issue'
                ? 'Stock Out'
                : 'Adjustment'}
            </DialogTitle>
            <DialogDescription>
              {stockAction.item?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium mb-1">Quantity</p>
              <Input
                type="number"
                min={1}
                step="1"
                value={stockAction.qty}
                onChange={(e) => setStockAction((prev) => ({ ...prev, qty: e.target.value }))}
              />
            </div>
            {stockAction.type === 'adjust' && (
              <div>
                <p className="text-sm font-medium mb-1">Direction</p>
                <Select
                  value={stockAction.direction}
                  onValueChange={(value) =>
                    setStockAction((prev) => ({ ...prev, direction: value as 'add' | 'deduct' }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="add">Increase</SelectItem>
                    <SelectItem value="deduct">Decrease</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <p className="text-sm font-medium mb-1">
                {stockAction.type === 'restock' ? 'Reference / Notes (optional)' : 'Reference / Notes'}
              </p>
              <Select
                value={stockAction.notes}
                onValueChange={(value) => setStockAction((prev) => ({ ...prev, notes: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={stockAction.type === 'issue' ? 'Select issue reason' : 'Select reason'} />
                </SelectTrigger>
                <SelectContent>
                  {STOCK_ACTION_REASON_OPTIONS[stockAction.type].map((reason) => (
                    <SelectItem key={reason} value={reason}>
                      {reason}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setStockAction((prev) => ({ ...prev, open: false }))}>
              Cancel
            </Button>
            <Button onClick={handleStockAction}>
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Item Modal */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="max-w-lg w-[calc(100vw-1rem)] sm:w-full">
          <DialogHeader>
            <DialogTitle>Add Inventory Item</DialogTitle>
            <DialogDescription>Fill out the details below to create a new item.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-1">Item Name</p>
              <Input
                value={newItem.name}
                onChange={(e) => {
                  const next = { ...newItem, name: e.target.value };
                  setNewItem(next);
                  setNewItemErrors(validateItem(next));
                }}
              />
              {newItemErrors.name && <p className="text-xs text-destructive mt-1">{newItemErrors.name}</p>}
            </div>
            <div>
              <p className="text-sm font-medium mb-1">Category</p>
              <Select
                value={newItem.category}
                onValueChange={(value) => {
                  const next = { ...newItem, category: value };
                  setNewItem(next);
                  setNewItemErrors(validateItem(next));
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categoryList.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {newItemErrors.category && <p className="text-xs text-destructive mt-1">{newItemErrors.category}</p>}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="text-sm font-medium mb-1">Unit</p>
                <Select
                  value={newItem.unit}
                  onValueChange={(value) => {
                    const next = { ...newItem, unit: value };
                    setNewItem(next);
                    setNewItemErrors(validateItem(next));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select unit" />
                  </SelectTrigger>
                  <SelectContent>
                    {UNIT_OPTIONS.map((unit) => (
                      <SelectItem key={unit} value={unit}>
                        {unit}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <p className="text-sm font-medium mb-1">Unit Price</p>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={newItem.unitPrice}
                  onChange={(e) => {
                    const next = { ...newItem, unitPrice: Number(e.target.value) };
                    setNewItem(next);
                    setNewItemErrors(validateItem(next));
                  }}
                />
                {newItemErrors.unitPrice && <p className="text-xs text-destructive mt-1">{newItemErrors.unitPrice}</p>}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="text-sm font-medium mb-1">Qty On Hand</p>
                <Input
                  type="number"
                  min={0}
                  step="1"
                  value={newItem.qtyOnHand}
                  onChange={(e) => {
                    const next = { ...newItem, qtyOnHand: Number(e.target.value) };
                    setNewItem(next);
                    setNewItemErrors(validateItem(next));
                  }}
                />
                {newItemErrors.qtyOnHand && <p className="text-xs text-destructive mt-1">{newItemErrors.qtyOnHand}</p>}
              </div>
              <div>
                <p className="text-sm font-medium mb-1">Low Stock Threshold</p>
                <Input
                  type="number"
                  min={0}
                  step="1"
                  value={newItem.minStock}
                  onChange={(e) => {
                    const next = { ...newItem, minStock: Number(e.target.value) };
                    setNewItem(next);
                    setNewItemErrors(validateItem(next));
                  }}
                />
                {newItemErrors.minStock && <p className="text-xs text-destructive mt-1">{newItemErrors.minStock}</p>}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateItem}>Create Item</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Item Modal */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-lg w-[calc(100vw-1rem)] sm:w-full">
          <DialogHeader>
            <DialogTitle>Edit Inventory Item</DialogTitle>
            <DialogDescription>Update item details or apply a stock adjustment.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-1">Item Name</p>
              <Input
                value={editItem.name}
                onChange={(e) => {
                  const next = { ...editItem, name: e.target.value };
                  setEditItem(next);
                  setEditItemErrors(validateEditItem(next));
                }}
              />
              {editItemErrors.name && <p className="text-xs text-destructive mt-1">{editItemErrors.name}</p>}
            </div>
            <div>
              <p className="text-sm font-medium mb-1">Category</p>
              <Select
                value={editItem.category}
                onValueChange={(value) => {
                  const next = { ...editItem, category: value };
                  setEditItem(next);
                  setEditItemErrors(validateEditItem(next));
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categoryList.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {editItemErrors.category && <p className="text-xs text-destructive mt-1">{editItemErrors.category}</p>}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="text-sm font-medium mb-1">Unit</p>
              <Select
                value={editItem.unit}
                onValueChange={(value) => {
                  const next = { ...editItem, unit: value };
                  setEditItem(next);
                  setEditItemErrors(validateEditItem(next));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select unit" />
                </SelectTrigger>
                <SelectContent>
                  {UNIT_OPTIONS.map((unit) => (
                    <SelectItem key={unit} value={unit}>
                      {unit}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              </div>
              <div>
                <p className="text-sm font-medium mb-1">Unit Price</p>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={editItem.unitPrice}
                onChange={(e) => {
                  const next = { ...editItem, unitPrice: Number(e.target.value) };
                  setEditItem(next);
                  setEditItemErrors(validateEditItem(next));
                }}
              />
                {editItemErrors.unitPrice && <p className="text-xs text-destructive mt-1">{editItemErrors.unitPrice}</p>}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium mb-1">Low Stock Threshold</p>
              <Input
                type="number"
                min={0}
                step="1"
                value={editItem.minStock}
                onChange={(e) => {
                  const next = { ...editItem, minStock: Number(e.target.value) };
                  setEditItem(next);
                  setEditItemErrors(validateEditItem(next));
                }}
              />
              {editItemErrors.minStock && <p className="text-xs text-destructive mt-1">{editItemErrors.minStock}</p>}
            </div>
            <div>
              <p className="text-sm font-medium mb-1">Supplier Price Update Note</p>
              <Textarea
                value={editItem.priceUpdateNote}
                onChange={(e) => {
                  const next = { ...editItem, priceUpdateNote: e.target.value };
                  setEditItem(next);
                  setEditItemErrors(validateEditItem(next));
                }}
                placeholder="Example: Supplier increased price without memo; approved for manual update."
                rows={3}
              />
              {editItem.unitPrice !== editItem.originalUnitPrice && (
                <p className="text-xs text-muted-foreground mt-1">
                  Required when the unit price changes so the update is logged clearly.
                </p>
              )}
              {editItemErrors.priceUpdateNote && <p className="text-xs text-destructive mt-1">{editItemErrors.priceUpdateNote}</p>}
            </div>
            <div className="border-t pt-4 space-y-3">
              <p className="text-sm font-semibold">Set Stock On Hand (Admin only)</p>
              <div>
                <p className="text-sm font-medium mb-1">Final Stock Count</p>
                <Input
                  type="number"
                  min={0}
                  step="1"
                  value={editAdjustQty}
                  onChange={(e) => setEditAdjustQty(e.target.value)}
                  disabled={!canEditItemInfo}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  This replaces the current stock count instead of adding to it.
                </p>
              </div>
              <div>
                <p className="text-sm font-medium mb-1">Reason</p>
                <Select
                  value={editAdjustNotes}
                  onValueChange={setEditAdjustNotes}
                  disabled={!canEditItemInfo}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select adjustment reason" />
                  </SelectTrigger>
                  <SelectContent>
                    {INVENTORY_REASON_OPTIONS.map((reason) => (
                      <SelectItem key={reason} value={reason}>
                        {reason}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end">
                <Button variant="outline" onClick={handleAdjustmentFromEdit} disabled={!canEditItemInfo}>
                  Apply Adjustment
                </Button>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={!canEditItemInfo}>Save Changes</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
