import type { ReactNode } from 'react';

// Compact desktop controls; wrapping remains available before anything overflows.
export default function TableFilterToolbar({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end [&>div.relative]:w-full sm:[&>div.relative]:w-64 sm:[&>div.relative]:flex-none [&>button]:shrink-0">{children}</div>;
}
