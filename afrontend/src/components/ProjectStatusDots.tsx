import { cn } from '@/lib/utils';

type ProjectStatus = 'pending' | 'active' | 'on-hold' | 'completed' | 'rejected';

interface ProjectStatusDotsProps {
  status: ProjectStatus | string;
  className?: string;
}

const STATUS_STEPS = [
  { key: 'pending', label: 'Pending' },
  { key: 'active', label: 'In Progress' },
  { key: 'completed', label: 'Completed' },
];

const STATUS_INDEX: Record<string, number> = {
  pending: 0,
  active: 1,
  completed: 2,
};

export function ProjectStatusDots({ status, className }: ProjectStatusDotsProps) {
  if (status === 'rejected') {
    return (
      <div className={cn('rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700', className)}>
        Rejected
      </div>
    );
  }

  if (status === 'on-hold') {
    return (
      <div className={cn('rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700', className)}>
        On Hold
      </div>
    );
  }

  const activeIndex = STATUS_INDEX[status] ?? 0;

  return (
    <div className={cn('flex flex-wrap items-center gap-2 sm:gap-3', className)}>
      {STATUS_STEPS.map((step, index) => {
        const isActive = activeIndex >= index;
        const isCurrent = activeIndex === index;
        return (
          <div key={step.key} className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-full border border-border/60 bg-background px-2.5 py-1">
              <span
                className={cn(
                  'h-2.5 w-2.5 rounded-full transition-colors',
                  isActive ? 'bg-[#C0392B]' : 'bg-muted-foreground/25'
                )}
              />
              <span
                className={cn(
                  'text-xs sm:text-sm',
                  isCurrent ? 'font-semibold text-foreground' : 'text-muted-foreground'
                )}
              >
                {step.label}
              </span>
            </div>
            {index < STATUS_STEPS.length - 1 ? (
              <span className={cn('hidden h-px w-4 sm:block', activeIndex > index ? 'bg-[#C0392B]/60' : 'bg-border')} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
