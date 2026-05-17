import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Files, Search, ExternalLink, FileCheck, Download } from 'lucide-react';
import { apiClient } from '@/api/client';
import PaginationNav from '@/components/PaginationNav';
import { Skeleton } from '@/components/ui/skeleton';
import { downloadCsv } from '@/utils/csv';
import { toPublicFileUrl } from '@/lib/files';

type ProofType = 'registration' | 'payment' | 'delivery';

type ProofRecord = {
  id: string;
  type: ProofType;
  status: string;
  ownerName: string;
  ownerEmail?: string | null;
  reference: string;
  projectName?: string | null;
  fileUrl: string;
  fileName: string;
  uploadedAt: string;
  source: string;
  handledBy?: string | null;
};

type PaginatedProofResponse = {
  data: ProofRecord[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

const typeBadgeClasses: Record<ProofType, string> = {
  registration: 'bg-blue-100 text-blue-800 hover:bg-blue-100',
  payment: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
  delivery: 'bg-green-100 text-green-800 hover:bg-green-100',
};

function statusClass(status: string) {
  const normalized = String(status || '').toLowerCase();
  if (['verified', 'paid', 'active', 'delivered'].includes(normalized)) {
    return 'bg-green-100 text-green-800 hover:bg-green-100';
  }
  if (normalized.includes('pending')) {
    return 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100';
  }
  if (['inactive', 'failed', 'rejected', 'return-rejected'].includes(normalized)) {
    return 'bg-red-100 text-red-800 hover:bg-red-100';
  }
  return 'bg-slate-100 text-slate-800 hover:bg-slate-100';
}

export default function ProofCenterPage() {
  const [proofs, setProofs] = useState<ProofRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(12);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [statusTab, setStatusTab] = useState('all');

  useEffect(() => {
    const fetchProofs = async () => {
      setIsLoading(true);
      try {
        const response = await apiClient.get<PaginatedProofResponse>('/proofs', {
          params: {
            q: searchTerm || undefined,
            type: typeFilter !== 'all' ? typeFilter : undefined,
            status: statusFilter !== 'all' ? statusFilter : undefined,
            from: fromDate || undefined,
            to: toDate || undefined,
            page,
            pageSize,
          },
        });
        const payload = response.data;
        setProofs(payload.data || []);
        setTotal(payload.total || 0);
        setTotalPages(payload.totalPages || 0);
      } catch (_err) {
        setProofs([]);
        setTotal(0);
        setTotalPages(0);
      } finally {
        setIsLoading(false);
      }
    };
    fetchProofs();
  }, [fromDate, page, pageSize, searchTerm, statusFilter, toDate, typeFilter]);

  const exportCsv = () => {
    const rows = [
      ['Uploaded', 'Type', 'Status', 'Owner', 'Owner Email', 'Reference', 'Project', 'File URL'],
      ...proofs.map((row) => [
        format(new Date(row.uploadedAt), 'yyyy-MM-dd HH:mm'),
        row.type,
        row.status,
        row.ownerName,
        row.ownerEmail || '',
        row.reference,
        row.projectName || '',
        toPublicFileUrl(row.fileUrl),
      ]),
    ];
    downloadCsv(`attachments-${format(new Date(), 'yyyy-MM-dd')}.csv`, rows);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <Files className="text-muted-foreground" />
            Attachments
          </h2>
          <p className="text-muted-foreground">
            Centralized attachments for registration, payment, and delivery operations.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileCheck className="h-4 w-4" />
          {total} matching records
        </div>
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-col gap-3 xl:flex-row">
            <div className="relative min-w-[260px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-10"
                placeholder="Search owner, email, order/DR, file..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPage(1);
                }}
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:w-[520px]">
              <Select
                value={typeFilter}
                onValueChange={(value) => {
                  setTypeFilter(value);
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="registration">Registration</SelectItem>
                  <SelectItem value="payment">Payment</SelectItem>
                  <SelectItem value="delivery">Delivery</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={statusFilter}
                onValueChange={(value) => {
                  setStatusFilter(value);
                  setStatusTab(
                    ['all', 'pending', 'pending-verification', 'verified', 'active', 'delivered', 'inactive'].includes(
                      value
                    )
                      ? value
                      : 'all'
                  );
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="pending-verification">Pending Verification</SelectItem>
                  <SelectItem value="verified">Verified</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <Tabs
              value={statusTab}
              onValueChange={(value) => {
                setStatusTab(value);
                setStatusFilter(value);
                setPage(1);
              }}
            >
              <TabsList className="h-auto w-max min-w-full flex-nowrap justify-start gap-1 bg-transparent p-0">
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="pending">Pending</TabsTrigger>
                <TabsTrigger value="pending-verification">Pending Verification</TabsTrigger>
                <TabsTrigger value="verified">Verified</TabsTrigger>
                <TabsTrigger value="active">Active</TabsTrigger>
                <TabsTrigger value="delivered">Delivered</TabsTrigger>
                <TabsTrigger value="inactive">Inactive</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                type="date"
                autoComplete="off"
                value={fromDate}
                onChange={(e) => {
                  setFromDate(e.target.value);
                  setPage(1);
                }}
              />
              <Input
                type="date"
                autoComplete="off"
                value={toDate}
                onChange={(e) => {
                  setToDate(e.target.value);
                  setPage(1);
                }}
              />
              <Button
                variant="ghost"
                onClick={() => {
                  setSearchTerm('');
                  setTypeFilter('all');
                  setStatusFilter('all');
                  setStatusTab('all');
                  setFromDate('');
                  setToDate('');
                  setPage(1);
                }}
              >
                Clear
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Documents</CardTitle>
              <CardDescription>Open the stored proof files directly from secure record entries.</CardDescription>
            </div>
            <Button variant="outline" onClick={exportCsv} disabled={proofs.length === 0 || isLoading}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Uploaded</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>File</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, idx) => (
                    <TableRow key={`loading-${idx}`}>
                      <TableCell colSpan={6}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : proofs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      No proofs matched your filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  proofs.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{format(new Date(row.uploadedAt), 'yyyy-MM-dd HH:mm')}</TableCell>
                      <TableCell>
                        <Badge className={typeBadgeClasses[row.type]}>{row.type}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={statusClass(row.status)}>{row.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="max-w-[220px]">
                          <p className="font-medium">{row.ownerName}</p>
                          {row.ownerEmail && <p className="truncate text-xs text-muted-foreground">{row.ownerEmail}</p>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="max-w-[220px]">
                          <p className="font-medium">{row.reference}</p>
                          {row.projectName && <p className="truncate text-xs text-muted-foreground">{row.projectName}</p>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button asChild size="sm" variant="outline">
                          <a href={toPublicFileUrl(row.fileUrl)} target="_blank" rel="noreferrer">
                            Open
                            <ExternalLink className="ml-2 h-3.5 w-3.5" />
                          </a>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <PaginationNav
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            disabled={isLoading}
          />
        </CardContent>
      </Card>
    </div>
  );
}
