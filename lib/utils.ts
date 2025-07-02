import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// lib/utils/formatters.ts
export const formatUEN = (value: string): string => {
  return value.toUpperCase().replace(/[^0-9A-Z]/g, '')
}

export const formatGST = (value: string): string => {
  const cleaned = value.toUpperCase().replace(/[^0-9A-Z-]/g, '')
  
  // Auto-prepend GST if user starts typing numbers
  if (cleaned && /^[0-9]/.test(cleaned)) {
    return 'GST' + cleaned
  }
  
  return cleaned
}