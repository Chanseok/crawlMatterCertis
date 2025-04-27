/**
 * Development Database Service
 * 
 * This service provides access to the SQLite database in development mode.
 * It's used to test SQLite integration without relying on mock data.
 */

import { MatterProduct, DatabaseSummary } from "../types";

// This interface would be implemented by the actual Electron backend
export interface DatabaseService {
  // Basic CRUD operations
  getProducts(page?: number, limit?: number): Promise<{ products: MatterProduct[], total: number }>;
  getProductById(id: string): Promise<MatterProduct | null>;
  searchProducts(query: string, page?: number, limit?: number): Promise<{ products: MatterProduct[], total: number }>;
  getDatabaseSummary(): Promise<DatabaseSummary>;
  
  // Update after crawling
  markLastUpdated(count: number): Promise<void>;
}

// This will be used in development mode. In production mode, we'll use IPC to call Electron's main process
export const createDevDatabaseService = (): DatabaseService => {
  // In a real implementation, this would interact directly with SQLite
  // For now, we'll simulate async DB calls using the mock data
  
  return {
    async getProducts(page = 1, limit = 20) {
      console.log('[Dev DB Service] Getting products', { page, limit });
      
      try {
        // In development mode, we'll make an API call to our local server
        // You can change this URL to match your development server setup
        const url = new URL('/api/products', window.location.origin);
        url.searchParams.append('page', page.toString());
        url.searchParams.append('limit', limit.toString());
        
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to fetch products: ${response.statusText}`);
        }
        
        const data = await response.json();
        return {
          products: data.products,
          total: data.total
        };
      } catch (error) {
        console.error('[Dev DB Service] Error fetching products:', error);
        throw error;
      }
    },
    
    async getProductById(id: string) {
      console.log('[Dev DB Service] Getting product by ID', id);
      
      try {
        const url = new URL(`/api/products/${id}`, window.location.origin);
        const response = await fetch(url);
        
        if (!response.ok) {
          if (response.status === 404) {
            return null;
          }
          throw new Error(`Failed to fetch product: ${response.statusText}`);
        }
        
        return await response.json();
      } catch (error) {
        console.error('[Dev DB Service] Error fetching product by ID:', error);
        throw error;
      }
    },
    
    async searchProducts(query: string, page = 1, limit = 20) {
      console.log('[Dev DB Service] Searching products', { query, page, limit });
      
      try {
        const url = new URL('/api/products/search', window.location.origin);
        url.searchParams.append('query', query);
        url.searchParams.append('page', page.toString());
        url.searchParams.append('limit', limit.toString());
        
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to search products: ${response.statusText}`);
        }
        
        const data = await response.json();
        return {
          products: data.products,
          total: data.total
        };
      } catch (error) {
        console.error('[Dev DB Service] Error searching products:', error);
        throw error;
      }
    },
    
    async getDatabaseSummary() {
      console.log('[Dev DB Service] Getting database summary');
      
      try {
        const response = await fetch('/api/database/summary');
        if (!response.ok) {
          throw new Error(`Failed to fetch database summary: ${response.statusText}`);
        }
        
        return await response.json();
      } catch (error) {
        console.error('[Dev DB Service] Error fetching database summary:', error);
        throw error;
      }
    },
    
    async markLastUpdated(count: number) {
      console.log('[Dev DB Service] Marking last updated', { count });
      
      try {
        const response = await fetch('/api/database/update-summary', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ newlyAddedCount: count }),
        });
        
        if (!response.ok) {
          throw new Error(`Failed to update database summary: ${response.statusText}`);
        }
      } catch (error) {
        console.error('[Dev DB Service] Error updating database summary:', error);
        throw error;
      }
    },
  };
};

// Export singleton instance
export const devDatabaseService = createDevDatabaseService();