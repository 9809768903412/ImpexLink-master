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
import { apiClient } from '@/api/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import type { Supplier } from '@/types';
import PaginationNav from '@/components/PaginationNav';
import { downloadCsv } from '@/utils/csv';

type SupplierForm = {
  supplierName: string;
  phone: string;
  address: string;
  contactPerson: string;
  country: string;
  tin: string;
};

const emptyForm: SupplierForm = {
  supplierName: '',
  phone: '',
  address: '',
  contactPerson: '',
  country: 'Philippines',
  tin: '',
};

const toForm = (supplier: Supplier): SupplierForm => ({
  supplierName: supplier.name || '',
  phone: supplier.phone || '',
  address: supplier.address || '',
  contactPerson: supplier.contactPerson || '',
  country: supplier.country || 'Philippines',
  tin: supplier.tin || '',
});

const COMMON_SUPPLIERS = [
  'JHELET GENERAL MERCHANDISING',
  'PACO ASIA PLUMBING SUPPLY AND HARDWARE',
  'Elite Hardware, Electrical & Industrial Supply Co (Davies)',
  'GAZPAC ENTERPRISES CORPORATION',
  'Polymer Products (Phil) Inc',
  'JP Camaro Construction Supply',
  'Knack Commercial (Kelyn Commercial Corp)',
  'LYS Marketing Corporation',
  'Rockwell Lumber and Hardware Inc',
  'Valqua Industrial Corporation',
  'Other',
];

const SUPPLIER_COUNTRIES = [
  'Philippines',
  'Singapore',
  'Malaysia',
  'Thailand',
  'Vietnam',
  'Indonesia',
  'China',
  'Japan',
  'South Korea',
];

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
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    try {
      const payload = {
        supplierName: form.supplierName.trim(),
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        contactPerson: form.contactPerson.trim() || null,
        country: form.country || 'Philippines',
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
        ['Company Name', 'Country', 'TIN', 'Contact Person', 'Contact Number', 'Address'],
        ...rows.map((supplier) => [
          supplier.name,
          supplier.country || 'Philippines',
          supplier.tin || '',
          supplier.contactPerson || '',
          supplier.phone || '',
          supplier.address || '',
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
              placeholder="Search company, contact, phone, or address"
              className="pl-9"
            />
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>TIN</TableHead>
                  <TableHead>Contact Person</TableHead>
                  <TableHead>Contact Number</TableHead>
                  <TableHead>Address</TableHead>
                  {canManage && <TableHead className="w-[120px] text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppliers.map((supplier) => (
                  <TableRow key={supplier.id}>
                    <TableCell>
                      <p className="font-medium">{supplier.name}</p>
                    </TableCell>
                    <TableCell>{supplier.country || 'Philippines'}</TableCell>
                    <TableCell>{supplier.tin || '-'}</TableCell>
                    <TableCell>{supplier.contactPerson || '-'}</TableCell>
                    <TableCell>{supplier.phone || '-'}</TableCell>
                    <TableCell className="max-w-[320px] truncate">{supplier.address || '-'}</TableCell>
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
                    <TableCell colSpan={canManage ? 7 : 6} className="py-8 text-center text-muted-foreground">
                      No suppliers found.
                    </TableCell>
                  </TableRow>
                )}
                {loading && (
                  <TableRow>
                    <TableCell colSpan={canManage ? 7 : 6} className="py-8 text-center text-muted-foreground">
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
              <Label htmlFor="supplierName">Company Name</Label>
              <Select
                value={COMMON_SUPPLIERS.includes(form.supplierName) ? form.supplierName : 'Other'}
                onValueChange={(value) => setForm((prev) => ({ ...prev, supplierName: value === 'Other' ? '' : value }))}
              >
                <SelectTrigger id="supplierName">
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  {COMMON_SUPPLIERS.map((supplier) => (
                    <SelectItem key={supplier} value={supplier}>
                      {supplier}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(!COMMON_SUPPLIERS.includes(form.supplierName) || !form.supplierName) && (
                <Input
                  value={form.supplierName}
                  onChange={(event) => setForm((prev) => ({ ...prev, supplierName: event.target.value }))}
                  placeholder="Enter local supplier name"
                  className="mt-2"
                />
              )}
              {errors.supplierName && <p className="mt-1 text-xs text-destructive">{errors.supplierName}</p>}
            </div>
            <div>
              <Label htmlFor="supplierCountry">Country</Label>
              <Select
                value={form.country}
                onValueChange={(value) => setForm((prev) => ({ ...prev, country: value }))}
              >
                <SelectTrigger id="supplierCountry">
                  <SelectValue placeholder="Select country" />
                </SelectTrigger>
                <SelectContent>
                  {SUPPLIER_COUNTRIES.map((country) => (
                    <SelectItem key={country} value={country}>
                      {country}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="supplierContact">Contact Person</Label>
              <Input
                id="supplierContact"
                value={form.contactPerson}
                onChange={(event) => setForm((prev) => ({ ...prev, contactPerson: event.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="supplierTin">TIN No.</Label>
              <Input
                id="supplierTin"
                value={form.tin}
                onChange={(event) => setForm((prev) => ({ ...prev, tin: event.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="supplierPhone">Contact Number</Label>
              <Input
                id="supplierPhone"
                value={form.phone}
                onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
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
