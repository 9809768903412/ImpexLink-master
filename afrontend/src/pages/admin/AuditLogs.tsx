import { useTableColumnFilters } from '@/components/TableColumnFilters';
import { loadTableRows } from '@/utils/loadTableRows';
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
import { Search, History } from 'lucide-react';
import type { AuditLog, User } from '@/types';
import { cn } from '@/lib/utils';
import { useResource } from '@/hooks/use-resource';
import { apiClient } from '@/api/client';
import { getCache, setCache } from '@/hooks/cache';
import { Skeleton } from '@/components/ui/skeleton';
import PaginationNav from '@/components/PaginationNav';
import TableExportMenu from '@/components/TableExportMenu';
import TableDateRangeFilter, { useTableDateRange } from '@/components/TableDateRangeFilter';

const actionColors: Record<string, string> = {
  CREATE: 'bg-green-100 text-green-800',
  ORDERED: 'bg-green-100 text-green-800',
  UPDATE: 'bg-blue-100 text-blue-800',
  DELETE: 'bg-red-100 text-red-800',
  APPROVE: 'bg-purple-100 text-purple-800',
  REJECT: 'bg-orange-100 text-orange-800',
  CONFIRM: 'bg-cyan-100 text-cyan-800',
};

const actionOptions = ['ORDERED', 'CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT', 'CONFIRM', 'VERIFY', 'NOTIFY', 'LOGIN', 'LOGIN_FAILED', 'VIEW', 'TEST'];

function getActionLabel(log: AuditLog) {
  const target = `${log.target} ${log.details}`.toLowerCase();
  if (log.action === 'CREATE' && /(order|clientorder|purchase|po)/i.test(target)) {
    return 'ORDERED';
  }
  return log.action;
}

// TODO: Replace with real data
export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>(() => getCache<AuditLog[]>('audit-logs') || []);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsPage, setLogsPage] = useState(1);
  const [logsPageSize] = useState(10);
  const [logsLoading, setLogsLoading] = useState(false);
  const { data: users } = useResource<User[]>('/users', []);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [userFilter, setUserFilter] = useState<string>('all');
  const { range: dateFilter, setRange: setDateFilter, dateFrom, dateTo, filters: dateExportFilters } = useTableDateRange();

  useEffect(() => {
    const controller = new AbortController();
    const fetchLogs = async () => {
      setLogsLoading(true);
      try {
        const response = { data: await loadTableRows<AuditLog>('/audit-logs', {
            q: searchTerm || undefined,
            action: actionFilter !== 'all' ? actionFilter : undefined,
            userId: userFilter !== 'all' ? userFilter : undefined,
            page: logsPage,
            pageSize: logsPageSize,
            dateFrom,
            dateTo,
          }, controller.signal) };
        const payload = response.data;
        if (controller.signal.aborted) return;
        setLogs(payload.data);
        setLogsTotal(payload.total);
        setCache('audit-logs', payload.data);
      } catch (err) {
        if (controller.signal.aborted) return;
        setLogs([]);
        setLogsTotal(0);
      } finally {
        if (!controller.signal.aborted) setLogsLoading(false);
      }
    };
    fetchLogs();
    return () => controller.abort();
  }, [actionFilter, dateFrom, dateTo, searchTerm, userFilter]);

  const tableColumns = useTableColumnFilters<typeof logs[number]>([
    { label: "Timestamp", kind: 'date', value: row => row.timestamp },
    { label: "User", kind: 'select', value: row => row.userName },
    { label: "Action", kind: 'select', value: row => getActionLabel(row) },
    { label: "Target", kind: 'text', value: row => row.target },
    { label: "Details", kind: 'text', value: row => row.details },
  ], () => setLogsPage(1));
  const matchingLogs = logs.filter(tableColumns.matches);
  const filteredLogs = matchingLogs.slice((logsPage - 1) * logsPageSize, logsPage * logsPageSize);

  const totalPages = Math.max(Math.ceil(matchingLogs.length / logsPageSize), 1);
  const exportColumns = [
    { header: 'Timestamp', value: (log: AuditLog) => format(new Date(log.timestamp), 'yyyy-MM-dd HH:mm:ss') },
    { header: 'User', value: (log: AuditLog) => log.userName },
    { header: 'Action', value: (log: AuditLog) => getActionLabel(log) },
    { header: 'Target', value: (log: AuditLog) => log.target },
    { header: 'Details', value: (log: AuditLog) => log.details },
  ];

  const loadExportLogs = async (fromPage: number, toPage: number) => {
    const responses = await Promise.all(
      Array.from({ length: toPage - fromPage + 1 }, (_, index) => fromPage + index).map((exportPage) =>
        apiClient.get('/audit-logs', {
          params: {
            q: searchTerm || undefined,
            action: actionFilter !== 'all' ? actionFilter : undefined,
            userId: userFilter !== 'all' ? userFilter : undefined,
            page: exportPage,
            pageSize: logsPageSize,
            dateFrom,
            dateTo,
          },
        }),
      ),
    );
    return responses.flatMap((response) => response.data?.data || response.data || []);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <History className="text-muted-foreground" />
            Audit Logs
          </h2>
          <p className="text-muted-foreground">Track all system activities and changes</p>
        </div>
        <TableExportMenu
          title="Audit Logs"
          filename="audit-logs"
          columns={exportColumns}
          currentRows={filteredLogs}
          allRows={matchingLogs}
          page={logsPage}
          pageSize={logsPageSize}
          totalPages={totalPages}
          totalItems={matchingLogs.length}
          filters={[
            { label: 'Search', value: searchTerm },
            { label: 'Action', value: actionFilter !== 'all' ? actionFilter : '' },
            { label: 'User', value: userFilter !== 'all' ? users.find((user) => user.id === userFilter)?.name || userFilter : '' },
            ...dateExportFilters, ...tableColumns.filters,
          ]}
          disabled={logsLoading}
        />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search logs..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setLogsPage(1);
                }}
                className="pl-10"
              />
            </div>
            <Select
              value={actionFilter}
              onValueChange={(value) => {
                setActionFilter(value);
                setLogsPage(1);
              }}
            >
              <SelectTrigger className="w-full lg:w-[150px]">
                <SelectValue placeholder="Action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                {actionOptions.map((action) => (
                  <SelectItem key={action} value={action}>
                    {action === 'ORDERED' ? 'ORDERED' : action}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={userFilter}
              onValueChange={(value) => {
                setUserFilter(value);
                setLogsPage(1);
              }}
            >
              <SelectTrigger className="w-full lg:w-[180px]">
                <SelectValue placeholder="User" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Users</SelectItem>
                {users.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <TableDateRangeFilter label="Audit date" range={dateFilter} onChange={(range) => { setDateFilter(range); setLogsPage(1); }} />
            {(actionFilter !== 'all' || userFilter !== 'all' || dateFilter || tableColumns.filters.length > 0) && (
              <Button
                variant="ghost"
                onClick={() => {
                  setActionFilter('all');
                  setUserFilter('all');
                  setDateFilter(undefined);
                  tableColumns.clear();
                  setLogsPage(1);
                }}
              >
                Clear Filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle>Activity Log</CardTitle>
          <CardDescription>
            Showing {filteredLogs.length} of {logsTotal || logs.length} entries
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
<TableHeader>
              <TableRow>
                <TableHead className="w-[180px]">{tableColumns.heading("Timestamp", logs)}</TableHead>
                <TableHead>{tableColumns.heading("User", logs)}</TableHead>
                <TableHead>{tableColumns.heading("Action", logs)}</TableHead>
                <TableHead>{tableColumns.heading("Target", logs)}</TableHead>
                <TableHead>{tableColumns.heading("Details", logs)}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logsLoading && filteredLogs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-1/2 mx-auto" />
                      <Skeleton className="h-4 w-1/3 mx-auto" />
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredLogs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No logs match your filters
                  </TableCell>
                </TableRow>
              ) : (
                filteredLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-sm">
                      <div>
                        <p>{format(new Date(log.timestamp), 'MMM dd, yyyy')}</p>
                        <p className="text-muted-foreground">
                          {format(new Date(log.timestamp), 'HH:mm:ss')}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{log.userName}</p>
                    </TableCell>
                    <TableCell>
                      <Badge className={actionColors[log.action] || 'bg-gray-100 text-gray-800'}>
                        {getActionLabel(log)}
                      </Badge>
                    </TableCell>
                    <TableCell>{log.target}</TableCell>
                    <TableCell className="max-w-[300px]">
                      <p className="whitespace-normal break-words">{log.details}</p>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

        <div className="flex items-center justify-center">
          <PaginationNav
            page={logsPage}
            totalPages={totalPages}
            onPageChange={setLogsPage}
            disabled={logsLoading}
          />
        </div>

      <p className="text-center text-sm text-muted-foreground">
        * Audit logs are stored for compliance and can be exported for external review.
      </p>
    </div>
  );
}
