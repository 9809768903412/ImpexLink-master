import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

import { Button } from '@/components/ui/button';

type ActivityLog = {
  id: number | string;
  timestamp: string | Date;
  action: string;
  details?: string | null;
};

type RecentActivityPanelProps = {
  logs: ActivityLog[];
  emptyText?: string;
  initialCount?: number;
};

export function RecentActivityPanel({
  logs,
  emptyText = 'No recent activity.',
  initialCount = 5,
}: RecentActivityPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const canExpand = logs.length > initialCount;
  const visibleLogs = expanded ? logs : logs.slice(0, initialCount);

  return (
    <div className="mt-4 rounded-lg border p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-sm font-medium">Recent Activity</p>
        {logs.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {logs.length} {logs.length === 1 ? 'entry' : 'entries'}
          </span>
        )}
      </div>

      {logs.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyText}</p>
      ) : (
        <>
          <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {visibleLogs.map((log) => (
              <div key={log.id} className="text-xs leading-relaxed text-muted-foreground">
                {new Date(log.timestamp).toLocaleString('en-PH')} / {log.action}
                {log.details ? ` / ${log.details}` : ''}
              </div>
            ))}
          </div>
          {canExpand && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-2 h-8 px-2 text-xs"
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? (
                <>
                  Show less <ChevronUp className="ml-1 h-3.5 w-3.5" />
                </>
              ) : (
                <>
                  Show all activity <ChevronDown className="ml-1 h-3.5 w-3.5" />
                </>
              )}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
