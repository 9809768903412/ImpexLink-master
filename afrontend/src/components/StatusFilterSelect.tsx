import { ReactNode } from 'react';
import {
  Select,
  SelectContent,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

type StatusFilterSelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
  placeholder?: string;
  className?: string;
};

export default function StatusFilterSelect({
  value,
  onValueChange,
  children,
  placeholder = 'Status',
  className,
}: StatusFilterSelectProps) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger
        className={cn(
          'h-10 w-full rounded-md border-border bg-background px-3 text-sm shadow-sm sm:w-[190px]',
          className
        )}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent align="end" className="min-w-[190px]">
        {children}
      </SelectContent>
    </Select>
  );
}
