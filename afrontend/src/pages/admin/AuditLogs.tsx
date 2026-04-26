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
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Search, Calendar as CalendarIcon, Filter, Download, History } from 'lucide-react';
import type { AuditLog, User } from '@/types';
import { cn } from '@/lib/utils';
import { useResource } from '@/hooks/use-resource';
import { apiClient } from '@/api/client';
import { getCache, setCache } from '@/hooks/cache';
import { Skeleton } from '@/components/ui/skeleton';
import { printHtml } from '@/utils/print';
import { downloadCsv } from '@/utils/csv';
import PaginationNav from '@/components/PaginationNav';

const actionColors: Record<string, string> = {
  CREATE: 'bg-green-100 text-green-800',
  UPDATE: 'bg-blue-100 text-blue-800',
  DELETE: 'bg-red-100 text-red-800',
  APPROVE: 'bg-purple-100 text-purple-800',
  REJECT: 'bg-orange-100 text-orange-800',
  CONFIRM: 'bg-cyan-100 text-cyan-800',
};

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
  const [dateFilter, setDateFilter] = useState<Date | undefined>();

  useEffect(() => {
    const fetchLogs = async () => {
      setLogsLoading(true);
      try {
        const response = await apiClient.get('/audit-logs', {
          params: {
            q: searchTerm || undefined,
            action: actionFilter !== 'all' ? actionFilter : undefined,
            userId: userFilter !== 'all' ? userFilter : undefined,
            page: logsPage,
            pageSize: logsPageSize,
          },
        });
        const payload = response.data;
        if (payload?.data) {
          setLogs(payload.data);
          setLogsTotal(payload.total || payload.data.length);
          setCache('audit-logs', payload.data);
        } else {
          setLogs(payload);
          setLogsTotal(payload.length || 0);
          setCache('audit-logs', payload);
        }
      } catch (err) {
        setLogs([]);
        setLogsTotal(0);
      } finally {
        setLogsLoading(false);
      }
    };
    fetchLogs();
  }, [actionFilter, logsPage, logsPageSize, searchTerm, userFilter]);

  const filteredLogs = logs.filter((log) => {
    const matchesDate = !dateFilter || format(new Date(log.timestamp), 'yyyy-MM-dd') === format(dateFilter, 'yyyy-MM-dd');
    return matchesDate;
  });

  const uniqueActions = [...new Set(logs.map((l) => l.action))];

  const handleExport = () => {
    const rows = filteredLogs
      .map(
        (log) =>
          `<tr><td>${format(new Date(log.timestamp), 'yyyy-MM-dd HH:mm')}</td><td>${log.userName}</td><td>${log.action}</td><td>${log.target}</td><td>${log.details}</td></tr>`
      )
      .join('');
    printHtml(
      'Audit Logs',
      `<h1>Audit Logs</h1>
      <div class="meta">Date: ${format(new Date(), 'yyyy-MM-dd')}</div>
      <table><thead><tr><th>Timestamp</th><th>User</th><th>Action</th><th>Target</th><th>Details</th></tr></thead><tbody>${rows}</tbody></table>`
    );
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
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              const rows = [
                ['Timestamp', 'User', 'Action', 'Target', 'Details'],
                ...filteredLogs.map((log) => [
                  format(new Date(log.timestamp), 'yyyy-MM-dd HH:mm'),
                  log.userName,
                  log.action,
                  log.target,
                  log.details,
                ]),
              ];
              downloadCsv(`audit-logs-${format(new Date(), 'yyyy-MM-dd')}.csv`, rows);
            }}
          >
            <Download size={16} className="mr-2" />
            Export CSV
          </Button>
          <Button variant="outline" onClick={handleExport}>
            <Download size={16} className="mr-2" />
            Export PDF
          </Button>
        </div>
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
                {uniqueActions.map((action) => (
                  <SelectItem key={action} value={action}>
                    {action}
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
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn('justify-start', !dateFilter && 'text-muted-foreground')}>
                  <CalendarIcon size={16} className="mr-2" />
                  {dateFilter ? format(dateFilter, 'MMM dd, yyyy') : 'Pick date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="single"
                  selected={dateFilter}
                  onSelect={setDateFilter}
                />
              </PopoverContent>
            </Popover>
            {(actionFilter !== 'all' || userFilter !== 'all' || dateFilter) && (
              <Button
                variant="ghost"
                onClick={() => {
                  setActionFilter('all');
                  setUserFilter('all');
                  setDateFilter(undefined);
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
                <TableHead className="w-[180px]">Timestamp</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Details</TableHead>
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
                        {log.action}
                      </Badge>
                    </TableCell>
                    <TableCell>{log.target}</TableCell>
                    <TableCell className="max-w-[300px]">
                      <p className="truncate">{log.details}</p>
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
            totalPages={Math.max(Math.ceil((logsTotal || logs.length) / logsPageSize), 1)}
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
