/**
 * Development Database Service
 * 
 * This service provides access to the SQLite database in development mode
 * by communicating with the Electron main process via IPC.
 */

import { MatterProduct, DatabaseSummary } from "../types";
import type { MethodReturnMapping } from "../platform/api";

// This interface defines the contract for database operations
export interface DatabaseService {
  getProducts(page?: number, limit?: number): Promise<{ products: MatterProduct[], total: number }>;
  getProductById(id: string): Promise<MatterProduct | null>;
  searchProducts(query: string, page?: number, limit?: number): Promise<{ products: MatterProduct[], total: number }>;
  getDatabaseSummary(): Promise<DatabaseSummary>;
  markLastUpdated(count: number): Promise<void>;
}

// This implementation uses the Electron IPC API exposed via preload script
export const createDevDatabaseService = (): DatabaseService => {
  if (!window.electron) {
    console.error("[Dev DB Service] Electron API not found. This is likely because you're running the app in a browser, not in Electron.");
    // Provide a fallback implementation that returns empty data
    return {
      async getProducts() { return { products: [], total: 0 }; },
      async getProductById() { return null; },
      async searchProducts() { return { products: [], total: 0 }; },
      async getDatabaseSummary() { return { totalProducts: 0, lastUpdated: null, newlyAddedCount: 0 }; },
      async markLastUpdated() {},
    };
  }

  return {
    async getProducts(page = 1, limit = 20) {
      console.log('[Dev DB Service] Getting products via Electron IPC', { page, limit });
      
      try {
        // 명시적으로 반환 타입을 지정하여 타입 안전성 보장
        const result = await window.electron.invokeMethod('getProducts', { page, limit }) as MethodReturnMapping['getProducts'];
        console.log('[Dev DB Service] Products received:', result);
        
        // Convert date strings to Date objects if needed
        if (result.products) {
          result.products.forEach((p: any) => {
            if (p.certificationDate && typeof p.certificationDate === 'string') {
              p.certificationDate = new Date(p.certificationDate);
            }
          });
        }
        
        return result;
      } catch (error) {
        console.error('[Dev DB Service] Error fetching products via IPC:', error);
        throw error;
      }
    },
    
    async getProductById(id: string) {
      console.log('[Dev DB Service] Getting product by ID via Electron IPC', id);
      
      try {
        // TypeScript 타입 문제를 우회하기 위해 any 타입으로 일시적 캐스팅 후 올바른 타입으로 재캐스팅
        const product = await (window.electron.invokeMethod as any)('getProductById', id) as MatterProduct | null;
        
        // Convert date strings to Date objects if needed
        if (product && product.certificationDate && typeof product.certificationDate === 'string') {
          product.certificationDate = new Date(product.certificationDate);
        }
        
        return product;
      } catch (error) {
        console.error('[Dev DB Service] Error fetching product by ID via IPC:', error);
        throw error;
      }
    },
    
    async searchProducts(query: string, page = 1, limit = 20) {
      console.log('[Dev DB Service] Searching products via Electron IPC', { query, page, limit });
      
      try {
        // TypeScript 타입 문제를 우회하기 위해 any 타입으로 일시적 캐스팅 후 올바른 타입으로 재캐스팅
        const result = await (window.electron.invokeMethod as any)('searchProducts', { query, page, limit }) as { products: MatterProduct[]; total: number };
        
        // Convert date strings to Date objects if needed
        if (result.products) {
          result.products.forEach((p: any) => {
            if (p.certificationDate && typeof p.certificationDate === 'string') {
              p.certificationDate = new Date(p.certificationDate);
            }
          });
        }
        
        return result;
      } catch (error) {
        console.error('[Dev DB Service] Error searching products via IPC:', error);
        throw error;
      }
    },
    
    async getDatabaseSummary() {
      console.log('[Dev DB Service] Getting database summary via Electron IPC');
      
      try {
        // 명시적으로 반환 타입을 지정하여 타입 안전성 보장
        const summary = await window.electron.invokeMethod('getDatabaseSummary') as MethodReturnMapping['getDatabaseSummary'];
        console.log('[Dev DB Service] Database summary received:', summary);
        
        // Convert lastUpdated string to Date object if needed
        if (summary && summary.lastUpdated && typeof summary.lastUpdated === 'string') {
          summary.lastUpdated = new Date(summary.lastUpdated);
        }
        
        return summary;
      } catch (error) {
        console.error('[Dev DB Service] Error fetching database summary via IPC:', error);
        throw error;
      }
    },
    
    async markLastUpdated(count: number) {
      console.log('[Dev DB Service] Marking last updated via Electron IPC', { count });
      
      try {
        // TypeScript 타입 문제를 우회하기 위해 any 타입으로 일시적 캐스팅
        await (window.electron.invokeMethod as any)('markLastUpdated', count);
        return;
      } catch (error) {
        console.error('[Dev DB Service] Error marking last updated via IPC:', error);
        throw error;
      }
    },
  };
};

// Export singleton instance
export const devDatabaseService = createDevDatabaseService();