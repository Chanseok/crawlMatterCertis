/**
 * Common utility functions for type-safe operations
 */

// CSS class name utility function (commonly used with Tailwind CSS)
export const cn = (...classes: (string | undefined | null | false)[]): string => {
  return classes.filter(Boolean).join(' ');
};

// Type guard functions
export const isValidProduct = (obj: any): obj is { id?: string; model?: string; manufacturer?: string; url?: string } => {
  return typeof obj === 'object' && obj !== null;
};

export const isError = (obj: any): obj is Error => {
  return obj instanceof Error || (typeof obj === 'object' && obj !== null && 'message' in obj);
};

// Array utilities with type safety
export const ensureArray = <T>(value: T | T[] | null | undefined): T[] => {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  return [value];
};

export const filterDefined = <T>(array: (T | null | undefined)[]): T[] => {
  return array.filter((item): item is T => item !== null && item !== undefined);
};

// Safe property access
export const safeGet = <T, K extends keyof T>(obj: T | null | undefined, key: K): T[K] | undefined => {
  return obj?.[key];
};

// Debounce utility for performance optimization
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void => {
  let timeout: number;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait) as unknown as number;
  };
};

// Throttle utility for performance optimization
export const throttle = <T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void => {
  let inThrottle: boolean;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
};

// Format utilities
export const formatPercentage = (value: number): string => {
  return `${Math.round(value)}%`;
};

export const formatTimestamp = (date: Date): string => {
  return date.toLocaleTimeString();
};

export const formatFileSize = (bytes: number): string => {
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  if (bytes === 0) return '0 Bytes';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
};
