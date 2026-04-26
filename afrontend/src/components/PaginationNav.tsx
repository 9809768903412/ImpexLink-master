import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { cn } from '@/lib/utils';

type PaginationNavProps = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
  maxPages?: number;
};

const buildPages = (current: number, total: number, maxPages: number) => {
  if (total <= maxPages) {
    return Array.from({ length: total }, (_, idx) => idx + 1);
  }
  const half = Math.floor(maxPages / 2);
  let start = Math.max(1, current - half);
  let end = start + maxPages - 1;
  if (end > total) {
    end = total;
    start = Math.max(1, end - maxPages + 1);
  }
  return Array.from({ length: end - start + 1 }, (_, idx) => start + idx);
};

export default function PaginationNav({
  page,
  totalPages,
  onPageChange,
  disabled = false,
  maxPages = 7,
}: PaginationNavProps) {
  if (totalPages <= 1) return null;
  const pages = buildPages(page, totalPages, maxPages);
  const prevDisabled = disabled || page <= 1;
  const nextDisabled = disabled || page >= totalPages;

  return (
    <Pagination>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            onClick={() => {
              if (!prevDisabled) onPageChange(page - 1);
            }}
            className={cn(prevDisabled && 'pointer-events-none opacity-50')}
          />
        </PaginationItem>
        {pages.map((p) => (
          <PaginationItem key={p}>
            <PaginationLink
              isActive={p === page}
              onClick={() => onPageChange(p)}
            >
              {p}
            </PaginationLink>
          </PaginationItem>
        ))}
        <PaginationItem>
          <PaginationNext
            onClick={() => {
              if (!nextDisabled) onPageChange(page + 1);
            }}
            className={cn(nextDisabled && 'pointer-events-none opacity-50')}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
