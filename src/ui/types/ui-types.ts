// UI Type System Implementation
// This file contains the actual implementations of UI-specific types and helper functions

import type { 
  MatterProduct, 
  CrawlerConfig, 
  DatabaseSummary,
  CrawlingProgress
} from '../../../types.d.ts';

// Utility types for making readonly types mutable
export type Mutable<T> = {
  -readonly [P in keyof T]: T[P];
};

export type DeepMutable<T> = {
  -readonly [P in keyof T]: T[P] extends readonly (infer U)[]
    ? U[]
    : T[P] extends ReadonlyArray<infer U>
    ? Array<U>
    : T[P] extends object
    ? DeepMutable<T[P]>
    : T[P];
};

// UI-specific interfaces that extend core types with mutable properties
export interface UIMatterProduct extends Omit<MatterProduct, 'applicationCategories'> {
  applicationCategories?: string[];
}

export interface UICrawlerConfig extends Omit<DeepMutable<CrawlerConfig>, 'logging'> {
  logging: {
    level: string;
    enableStackTrace: boolean;
    enableTimestamp: boolean;
    components: Record<string, any>;
  };
}

export interface UIDatabaseSummary extends Omit<DatabaseSummary, 'lastUpdated'> {
  lastUpdated: Date;
}

export interface UICrawlingProgress extends CrawlingProgress {
  progress?: number;
  gapCollectionInfo?: {
    collectedProducts: number;
    totalMissingProducts: number;
    stage: 'detection' | 'collection';
  };
}

// UI-specific database service interface
export interface UIDatabaseService {
  getProducts(): Promise<UIMatterProduct[]>;
  getProductById(id: string): Promise<UIMatterProduct | null>;
  searchProducts(query: string): Promise<UIMatterProduct[]>;
  getDatabaseSummary(): Promise<UIDatabaseSummary>;
}

// Helper functions for type conversion
export function toUIMatterProduct(product: MatterProduct): UIMatterProduct {
  return {
    ...product,
    applicationCategories: product.applicationCategories ? [...product.applicationCategories] : undefined
  };
}

export function toUIMatterProducts(products: readonly MatterProduct[]): UIMatterProduct[] {
  return products.map(toUIMatterProduct);
}

export function toUIDatabaseSummary(summary: DatabaseSummary): UIDatabaseSummary {
  return {
    ...summary,
    lastUpdated: summary.lastUpdated ? new Date(summary.lastUpdated) : new Date()
  };
}

// Type guards and validation helpers
export function isUIMatterProduct(obj: any): obj is UIMatterProduct {
  return obj && typeof obj === 'object' && typeof obj.id === 'string';
}

export function isUIMatterProductArray(obj: any): obj is UIMatterProduct[] {
  return Array.isArray(obj) && obj.every(isUIMatterProduct);
}
