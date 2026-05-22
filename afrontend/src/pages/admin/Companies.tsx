import { useEffect, useMemo, useState } from 'react';
import { Building2, Plus, Search } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PaginationNav from '@/components/PaginationNav';
import { apiClient } from '@/api/client';
import type { Client } from '@/types';
import { useToast } from '@/hooks/use-toast';

type CompanyForm = {
  clientName: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  tin: string;
  visibilityScope: 'company' | 'user';
};

const emptyForm: CompanyForm = {
  clientName: '',
  contactPerson: '',
  email: '',
  phone: '',
  address: '',
  tin: '',
  visibilityScope: 'company',
};

export default function CompaniesPage() {
  const { toast } = useToast();
  const [companies, setCompanies] = useState<Client[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Client | null>(null);
  const [form, setForm] = useState<CompanyForm>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const companyStats = useMemo(() => {
    return {
      total,
      withEmail: companies.filter((company) => Boolean(company.email)).length,
      companyWide: companies.filter((company) => (company.visibilityScope || 'company') === 'company').length,
    };
  }, [companies, total]);

  const loadCompanies = async () => {
    setIsLoading(true);
    try {
      const response = await apiClient.get('/clients', {
        params: {
          q: search || undefined,
          page,
          pageSize,
          sortBy: 'clientName',
          sortDir: 'asc',
        },
      });
      const payload = response.data;
      setCompanies(Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : []);
      setTotal(Number(payload?.total ?? (Array.isArray(payload) ? payload.length : 0)));
    } catch (error: any) {
      toast({
        title: 'Companies not loaded',
        description: error?.response?.data?.error || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCompanies();
  }, [page, pageSize, search]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const validateForm = () => {
    const nextErrors: Record<string, string> = {};
    if (!form.clientName.trim()) nextErrors.clientName = 'Company name is required.';
    if (form.email && !form.email.includes('@')) nextErrors.email = 'Enter a valid email address.';
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const openCreate = () => {
    setEditingCompany(null);
    setForm(emptyForm);
    setErrors({});
    setIsDialogOpen(true);
  };

  const openEdit = (company: Client) => {
    setEditingCompany(company);
    setForm({
      clientName: company.name || '',
      contactPerson: company.contactPerson || '',
      email: company.email || '',
      phone: company.phone || '',
      address: company.address || '',
      tin: company.tin || '',
      visibilityScope: company.visibilityScope || 'company',
    });
    setErrors({});
    setIsDialogOpen(true);
  };

  const saveCompany = async () => {
    if (!validateForm()) return;
    const payload = {
      clientName: form.clientName.trim(),
      contactPerson: form.contactPerson.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
      tin: form.tin.trim() || null,
      visibilityScope: form.visibilityScope,
    };
    try {
      if (editingCompany) {
        await apiClient.put(`/clients/${editingCompany.id}`, payload);
        toast({ title: 'Company updated', description: `${payload.clientName} was updated.` });
      } else {
        await apiClient.post('/clients', payload);
        toast({ title: 'Company added', description: `${payload.clientName} is ready for client accounts and projects.` });
      }
      setIsDialogOpen(false);
      await loadCompanies();
    } catch (error: any) {
      toast({
        title: editingCompany ? 'Update failed' : 'Company not added',
        description: error?.response?.data?.error || 'Please check the company details and try again.',
        variant: 'destructive',
      });
    }
  };

  const deleteCompany = async (company: Client) => {
    if (!window.confirm(`Archive ${company.name}? Existing linked records stay in the system.`)) return;
    try {
      await apiClient.delete(`/clients/${company.id}`);
      toast({ title: 'Company archived', description: `${company.name} was removed from active company lists.` });
      await loadCompanies();
    } catch (error: any) {
      toast({
        title: 'Archive failed',
        description: error?.response?.data?.error || 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Companies</h1>
          <p className="text-muted-foreground">Manage client company records used by registrations, projects, orders, and payments.</p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus size={18} />
          Add Company
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Company Records</p>
            <p className="mt-1 text-2xl font-semibold">{companyStats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">With Billing Email</p>
            <p className="mt-1 text-2xl font-semibold">{companyStats.withEmail}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Company-Wide Visibility</p>
            <p className="mt-1 text-2xl font-semibold">{companyStats.companyWide}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>Client Companies</CardTitle>
              <CardDescription>Use this list before creating client users so they can be linked to the right company.</CardDescription>
            </div>
            <div className="relative w-full lg:max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search company, email, or address"
                className="pl-10"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Visibility</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                    {isLoading ? 'Loading companies...' : 'No companies found.'}
                  </TableCell>
                </TableRow>
              ) : (
                companies.map((company) => (
                  <TableRow key={company.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                          <Building2 size={18} />
                        </div>
                        <div>
                          <p className="font-medium">{company.name}</p>
                          <p className="text-xs text-muted-foreground">{company.address || 'No address recorded'}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p>{company.contactPerson || 'No contact person'}</p>
                      <p className="text-xs text-muted-foreground">{company.phone || 'No contact number'}</p>
                    </TableCell>
                    <TableCell>{company.email || 'No email'}</TableCell>
                    <TableCell className="capitalize">{company.visibilityScope || 'company'}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => openEdit(company)}>Edit</Button>
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteCompany(company)}>Archive</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <div className="border-t p-4">
            <PaginationNav page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingCompany ? 'Edit Company' : 'Add Company'}</DialogTitle>
            <DialogDescription>
              Company records are used to group client users, projects, orders, deliveries, and payments.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Company Name</Label>
              <Input
                className="mt-1"
                value={form.clientName}
                onChange={(event) => setForm((prev) => ({ ...prev, clientName: event.target.value }))}
              />
              {errors.clientName && <p className="mt-1 text-xs text-destructive">{errors.clientName}</p>}
            </div>
            <div>
              <Label>Contact Person</Label>
              <Input
                className="mt-1"
                value={form.contactPerson}
                onChange={(event) => setForm((prev) => ({ ...prev, contactPerson: event.target.value }))}
              />
            </div>
            <div>
              <Label>Contact Number</Label>
              <Input
                className="mt-1"
                value={form.phone}
                onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                className="mt-1"
                type="email"
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
              />
              {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email}</p>}
            </div>
            <div>
              <Label>TIN</Label>
              <Input
                className="mt-1"
                value={form.tin}
                onChange={(event) => setForm((prev) => ({ ...prev, tin: event.target.value }))}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Address</Label>
              <Input
                className="mt-1"
                value={form.address}
                onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Visibility</Label>
              <Select
                value={form.visibilityScope}
                onValueChange={(value) => setForm((prev) => ({ ...prev, visibilityScope: value as 'company' | 'user' }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="company">Company-wide</SelectItem>
                  <SelectItem value="user">Specific user only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveCompany}>{editingCompany ? 'Save Changes' : 'Add Company'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
