// Common types used across demo components

export interface Product {
  id?: string;
  model?: string;
  manufacturer?: string;
  url?: string;
}

export interface SaveResult {
  success: boolean;
  message?: string;
}

export interface LogEntry {
  message: string;
  type: 'info' | 'error' | 'warning' | 'success';
  timestamp: Date;
}

export interface CrawlingProgress {
  percentage: number;
  currentPage: number;
  totalPages: number;
  message?: string;
  // Add missing properties to match the main CrawlingProgress interface
  currentStep?: string;
  processedItems?: number;
  newItems?: number;
  updatedItems?: number;
  elapsedTime?: number;
}

export interface TaskStatistics {
  success: number;
  error: number;
  successRate: number;
}

export type CrawlingStatus = 'idle' | 'running' | 'paused' | 'completed' | 'error';
