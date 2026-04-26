import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(value: number | string | null | undefined, options?: Intl.NumberFormatOptions) {
  const numeric = typeof value === 'number' ? value : Number(value ?? 0);
  if (!Number.isFinite(numeric)) {
    return new Intl.NumberFormat('en-PH', options).format(0);
  }
  return new Intl.NumberFormat('en-PH', options).format(numeric);
}

export function formatCurrency(value: number | string | null | undefined, options?: Intl.NumberFormatOptions) {
  return `₱${formatNumber(value, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...options,
  })}`;
}
