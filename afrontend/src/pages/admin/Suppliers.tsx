import { useEffect, useMemo, useState } from 'react';
import { Download, Edit, Plus, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { apiClient } from '@/api/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import type { Supplier } from '@/types';
import PaginationNav from '@/components/PaginationNav';
import { downloadCsv } from '@/utils/csv';

type SupplierForm = {
  supplierName: string;
  email: string;
  phone: string;
  address: string;
  country: string;
  tin: string;
};

const emptyForm: SupplierForm = {
  supplierName: '',
  email: '',
  phone: '',
  address: '',
  country: '',
  tin: '',
};

const toForm = (supplier: Supplier): SupplierForm => ({
  supplierName: supplier.name || '',
  email: supplier.email || '',
  phone: supplier.phone || '',
  address: supplier.address || '',
  country: supplier.country || '',
  tin: supplier.tin || '',
});

export default function SuppliersPage() {
  const { user } = useAuth();
  const canManage = user?.roles?.includes('admin') || user?.role === 'admin';
  const { toast } = useToast();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [form, setForm] = useState<SupplierForm>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  const reloadSuppliers = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/suppliers', {
        params: {
          q: searchQuery || undefined,
          page,
          pageSize,
          sortBy: 'supplierName',
          sortDir: 'asc',
        },
      });
      const payload = response.data;
      const rows = payload?.data || payload || [];
      setSuppliers(rows);
      setTotalItems(payload?.total || rows.length);
    } catch {
      setSuppliers([]);
      setTotalItems(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reloadSuppliers();
  }, [page, pageSize, searchQuery]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery]);

  const visibleRange = useMemo(() => {
    if (totalItems === 0) return '0';
    const start = (page - 1) * pageSize + 1;
    const end = Math.min(page * pageSize, totalItems);
    return `${start}-${end}`;
  }, [page, pageSize, totalItems]);

  const openCreate = () => {
    setEditingSupplier(null);
    setForm(emptyForm);
    setErrors({});
    setDialogOpen(true);
  };

  const openEdit = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setForm(toForm(supplier));
    setErrors({});
    setDialogOpen(true);
  };

  const validate = () => {
    const next: Record<string, string> = {};
    if (!form.supplierName.trim()) next.supplierName = 'Supplier name is required.';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) next.email = 'Enter a valid email.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    try {
      const payload = {
        supplierName: form.supplierName.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        country: form.country.trim() || null,
        tin: form.tin.trim() || null,
      };
      if (editingSupplier) {
        await apiClient.put(`/suppliers/${editingSupplier.id}`, payload);
        toast({ title: 'Supplier updated', description: `${payload.supplierName} was saved.` });
      } else {
        await apiClient.post('/suppliers', payload);
        toast({ title: 'Supplier added', description: `${payload.supplierName} is now available for purchase orders.` });
      }
      setDialogOpen(false);
      await reloadSuppliers();
    } catch {
      toast({ title: 'Supplier save failed', description: 'Please review the details and try again.', variant: 'destructive' });
    }
  };

  const handleDelete = async (supplier: Supplier) => {
    if (!canManage) return;
    const confirmed = window.confirm(`Archive ${supplier.name}?`);
    if (!confirmed) return;
    try {
      await apiClient.delete(`/suppliers/${supplier.id}`);
      toast({ title: 'Supplier archived', description: `${supplier.name} was removed from active lists.` });
      await reloadSuppliers();
    } catch {
      toast({ title: 'Archive failed', description: 'Please try again.', variant: 'destructive' });
    }
  };

  const exportSuppliers = async () => {
    try {
      const response = await apiClient.get('/suppliers', { params: { page: 1, pageSize: 10000 } });
      const payload = response.data;
      const rows: Supplier[] = payload?.data || payload || suppliers;
      downloadCsv(`suppliers-${new Date().toISOString().slice(0, 10)}.csv`, [
        ['Supplier', 'Email', 'Phone', 'Address', 'Country', 'TIN'],
        ...rows.map((supplier) => [
          supplier.name,
          supplier.email || '',
          supplier.phone || '',
          supplier.address || '',
          supplier.country || '',
          supplier.tin || '',
        ]),
      ]);
    } catch {
      toast({ title: 'Export failed', description: 'Unable to prepare supplier CSV.', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Suppliers</h1>
          <p className="text-muted-foreground">Manage vendor records used by purchase orders and stock-in history</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={exportSuppliers}>
            <Download size={16} className="mr-2" />
            Export CSV
          </Button>
          {canManage && (
            <Button onClick={openCreate}>
              <Plus size={16} className="mr-2" />
              Add Supplier
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Supplier Directory</CardTitle>
          <CardDescription>
            Showing {visibleRange} of {totalItems} active suppliers
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search supplier, email, or country"
              className="pl-9"
            />
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>TIN</TableHead>
                  {canManage && <TableHead className="w-[120px] text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppliers.map((supplier) => (
                  <TableRow key={supplier.id}>
                    <TableCell>
                      <p className="font-medium">{supplier.name}</p>
                      {supplier.country && <p className="text-xs text-muted-foreground">{supplier.country}</p>}
                    </TableCell>
                    <TableCell>
                      <p className="text-sm">{supplier.email || '-'}</p>
                      <p className="text-xs text-muted-foreground">{supplier.phone || '-'}</p>
                    </TableCell>
                    <TableCell className="max-w-[320px] truncate">{supplier.address || '-'}</TableCell>
                    <TableCell>{supplier.tin || '-'}</TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(supplier)}>
                            <Edit size={16} />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(supplier)}>
                            <Trash2 size={16} className="text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {!loading && suppliers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={canManage ? 5 : 4} className="py-8 text-center text-muted-foreground">
                      No suppliers found.
                    </TableCell>
                  </TableRow>
                )}
                {loading && (
                  <TableRow>
                    <TableCell colSpan={canManage ? 5 : 4} className="py-8 text-center text-muted-foreground">
                      Loading suppliers...
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <PaginationNav page={page} totalPages={totalPages} onPageChange={setPage} disabled={loading} />
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingSupplier ? 'Edit Supplier' : 'Add Supplier'}</DialogTitle>
            <DialogDescription>Keep vendor details complete for purchase order and stock reference records.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="supplierName">Supplier Name</Label>
              <Input
                id="supplierName"
                value={form.supplierName}
                onChange={(event) => setForm((prev) => ({ ...prev, supplierName: event.target.value }))}
              />
              {errors.supplierName && <p className="mt-1 text-xs text-destructive">{errors.supplierName}</p>}
            </div>
            <div>
              <Label htmlFor="supplierEmail">Email</Label>
              <Input
                id="supplierEmail"
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
              />
              {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email}</p>}
            </div>
            <div>
              <Label htmlFor="supplierPhone">Phone</Label>
              <Input
                id="supplierPhone"
                value={form.phone}
                onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="supplierTin">TIN</Label>
              <Input
                id="supplierTin"
                value={form.tin}
                onChange={(event) => setForm((prev) => ({ ...prev, tin: event.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="supplierCountry">Country</Label>
              <Input
                id="supplierCountry"
                value={form.country}
                onChange={(event) => setForm((prev) => ({ ...prev, country: event.target.value }))}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="supplierAddress">Address</Label>
              <Input
                id="supplierAddress"
                value={form.address}
                onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>{editingSupplier ? 'Save Changes' : 'Create Supplier'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
