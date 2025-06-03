/**
 * UI-specific type extensions for the Matter Certis Crawler
 * 
 * This file extends the core domain types with UI-specific requirements
 * while maintaining type safety and separation of concerns.
 * 
 * Design principles:
 * 1. Core domain types remain readonly for safety
 * 2. UI operations require mutable versions for state management
 * 3. Type extensions provide proper compatibility layers
 */

// Re-export core types for UI consumption
export * from '../../../types';

// UI-specific utility types
export type Mutable<T> = {
  -readonly [P in keyof T]: T[P] extends readonly (infer U)[] 
    ? U[] 
    : T[P] extends readonly unknown[]
    ? T[P][number][]
    : Mutable<T[P]>
};

export type DeepMutable<T> = {
  -readonly [P in keyof T]: T[P] extends readonly (infer U)[]
    ? DeepMutable<U>[]
    : T[P] extends readonly unknown[]
    ? DeepMutable<T[P][number]>[]
    : T[P] extends object
    ? DeepMutable<T[P]>
    : T[P]
};

// UI-specific extensions of core types
export interface UIMatterProduct extends Omit<MatterProduct, 'applicationCategories'> {
  applicationCategories?: string[];
}

export interface UICrawlingSession extends DeepMutable<CrawlingSession> {}

export interface UICrawlingStage extends DeepMutable<CrawlingStage> {}

export interface UICrawlerConfig extends DeepMutable<CrawlerConfig> {}

export interface UIDatabaseSummary extends DeepMutable<DatabaseSummary> {}

export interface UICrawlingSessionProgress extends DeepMutable<CrawlingSessionProgress> {}

// Extended CrawlingProgress with UI-specific properties
export interface UICrawlingProgress extends CrawlingProgress {
  progress?: number;
}

// UI-specific service interfaces
export interface UIDatabaseService {
  getProducts(page?: number, limit?: number): Promise<{
    products: UIMatterProduct[];
    total: number;
  }>;
  
  saveProducts(params: {
    products: UIMatterProduct[];
    crawlingSessionId?: string;
  }): Promise<void>;
  
  getSummary(): Promise<UIDatabaseSummary>;
  getRecentProducts(limit?: number): Promise<UIMatterProduct[]>;
  getProductById(id: string): Promise<UIMatterProduct | null>;
  searchProducts(query: string, limit?: number): Promise<UIMatterProduct[]>;
  deleteProduct(id: string): Promise<void>;
  updateProduct(id: string, updates: Partial<UIMatterProduct>): Promise<void>;
  clearAllProducts(): Promise<void>;
  getProductsByPage(pageId: number): Promise<UIMatterProduct[]>;
}

// UI-specific return types for database operations
export interface UIProductsResult {
  readonly products: readonly UIMatterProduct[];
  readonly total: number;
  readonly maxPageId?: number;
}

// Helper types for state management
export type UIStateUpdate<T> = {
  [K in keyof T]?: T[K] extends readonly (infer U)[]
    ? U[]
    : T[K] extends object
    ? Partial<T[K]>
    : T[K]
};

// Type guards for UI operations
export function isUIMatterProduct(product: unknown): product is UIMatterProduct {
  return typeof product === 'object' && product !== null && 'id' in product;
}

export function toUIMatterProduct(product: MatterProduct): UIMatterProduct {
  return {
    ...product,
    applicationCategories: product.applicationCategories ? [...product.applicationCategories] : undefined
  } as UIMatterProduct;
}

export function toUIMatterProducts(products: readonly MatterProduct[]): UIMatterProduct[] {
  return products.map(toUIMatterProduct);
}

export function toCrawlingSession(uiSession: UICrawlingSession): CrawlingSession {
  return uiSession as CrawlingSession;
}

export function toUICrawlingSession(session: CrawlingSessionProgress): UICrawlingSessionProgress {
  return JSON.parse(JSON.stringify(session)) as UICrawlingSessionProgress;
}
