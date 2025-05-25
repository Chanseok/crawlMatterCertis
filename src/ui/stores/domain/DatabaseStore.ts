/**
 * DatabaseStore.ts
 * Simplified Domain Store for Database Operations
 */

import { atom } from 'nanostores';
import type { DatabaseSummary, MatterProduct } from '../../../../types';
import { getPlatformApi } from '../../platform/api';
import { DatabaseService } from '../../services/domain/DatabaseService';
import { ExportService } from '../../services/domain/ExportService';

export interface ProductDetail {
  id: string;
  productName: string;
  companyName: string;
  certNumber: string;
  lastUpdated?: string;
  [key: string]: any;
}

/**
 * Database Domain Store
 * Manages all database-related state and operations
 */
export class DatabaseStore {
  // State atoms
  public readonly summary = atom<DatabaseSummary | null>(null);
  public readonly products = atom<MatterProduct[]>([]);
  public readonly loading = atom<boolean>(false);
  public readonly saving = atom<boolean>(false);
  public readonly lastSaveResult = atom<{ success: boolean; message?: string } | null>(null);
  public readonly error = atom<string | null>(null);

  // Search and pagination state
  public readonly searchQuery = atom<string>('');
  public readonly currentPage = atom<number>(1);
  public readonly totalPages = atom<number>(0);
  public readonly pagination = atom<{ page: number; limit: number; total: number }>({ page: 1, limit: 50, total: 0 });

  // Alias for loading state to match hook expectations
  public readonly isLoading = this.loading;

  // Unsubscribe functions
  private unsubscribeFunctions: (() => void)[] = [];
  private api = getPlatformApi();
  private databaseService = DatabaseService.getInstance();
  private exportService = ExportService.getInstance();

  constructor() {
    this.initializeEventSubscriptions();
  }

  /**
   * Initialize IPC event subscriptions for database events
   */
  private initializeEventSubscriptions(): void {
    // Database summary updates
    const unsubSummary = this.api.subscribeToEvent('dbSummaryUpdated' as any, (summary: DatabaseSummary) => {
      this.summary.set(summary);
    });
    this.unsubscribeFunctions.push(unsubSummary);
  }

  /**
   * Load database summary
   */
  async loadSummary(): Promise<void> {
    try {
      const result = await this.databaseService.getDatabaseSummary();
      if (result.success && result.data) {
        this.summary.set(result.data);
      } else {
        console.error('Failed to load database summary:', result.error);
      }
    } catch (error) {
      console.error('Failed to load database summary:', error);
    }
  }

  /**
   * Load products from database
   */
  async loadProducts(query?: string, page: number = 1, limit: number = 50): Promise<void> {
    this.loading.set(true);
    try {
      const result = await this.databaseService.searchProducts({
        query: query || '',
        page,
        limit
      });
      
      if (result.success && result.data) {
        // Convert the products to match the expected type
        const convertedProducts = (result.data.products || []).map(product => ({
          ...product,
          createdAt: product.createdAt instanceof Date ? product.createdAt.toISOString() : product.createdAt,
          updatedAt: product.updatedAt instanceof Date ? product.updatedAt.toISOString() : product.updatedAt
        }));
        
        this.products.set(convertedProducts as MatterProduct[]);
        this.totalPages.set(result.data.totalPages || 0);
        this.currentPage.set(page);
        if (query !== undefined) {
          this.searchQuery.set(query);
        }
      } else {
        console.error('Failed to load products:', result.error);
        this.products.set([]);
        this.totalPages.set(0);
      }
    } catch (error) {
      console.error('Failed to load products:', error);
      this.products.set([]);
      this.totalPages.set(0);
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Save products to database
   */
  async saveProducts(products: MatterProduct[]): Promise<void> {
    this.saving.set(true);
    try {
      // Transform products to include required database fields
      const dbProducts = products.map(product => ({
        ...product,
        id: product.id || crypto.randomUUID(),
        createdAt: new Date(),
        updatedAt: new Date()
      }));
      
      const result = await this.databaseService.saveProducts({
        products: dbProducts,
        autoSave: false
      });
      
      if (result.success) {
        this.lastSaveResult.set({ success: true, message: 'Products saved successfully' });
        // Refresh data after successful save
        await this.loadSummary();
        await this.loadProducts(this.searchQuery.get(), this.currentPage.get());
      } else {
        this.lastSaveResult.set({ 
          success: false, 
          message: result.error?.message || 'Failed to save products' 
        });
      }
    } catch (error) {
      console.error('Failed to save products:', error);
      this.lastSaveResult.set({ 
        success: false, 
        message: error instanceof Error ? error.message : 'Unknown error occurred' 
      });
    } finally {
      this.saving.set(false);
    }
  }

  /**
   * Search products with query
   */
  async searchProducts(query: string = '', page: number = 1, limit: number = 100): Promise<void> {
    try {
      this.loading.set(true);
      this.error.set(null);

      // 빈 쿼리일 때는 모든 제품 로드
      if (!query || query.trim() === '') {
        console.log('Empty search query detected, loading all products');
        await this.loadProducts(undefined, page, limit);
        return;
      }

      console.log(`Searching products with query: "${query.trim()}"`);
      const result = await this.databaseService.searchProducts({
        query: query.trim(),
        page,
        limit
      });
      
      if (result.success && result.data) {
        const searchResult = result.data;
        // Convert the products to match the expected type
        const convertedProducts = (searchResult.products || []).map(product => ({
          ...product,
          createdAt: product.createdAt instanceof Date ? product.createdAt.toISOString() : product.createdAt,
          updatedAt: product.updatedAt instanceof Date ? product.updatedAt.toISOString() : product.updatedAt
        }));
        
        this.products.set(convertedProducts as MatterProduct[]);
        this.totalPages.set(searchResult.totalPages || 0);
        this.currentPage.set(page);
        if (query !== undefined) {
          this.searchQuery.set(query);
        }
        
        console.log(`Search completed: ${convertedProducts.length || 0} products found`);
      } else {
        throw new Error(result.error?.message || 'Search operation failed');
      }
    } catch (error) {
      console.error('Failed to search products:', error);
      this.error.set(`제품 검색에 실패했습니다: ${error instanceof Error ? error.message : String(error)}`);
      this.products.set([]);
      this.totalPages.set(0);
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Delete records by page range
   */
  async deleteRecordsByPageRange(startPageId: number, endPageId: number): Promise<void> {
    try {
      const result = await this.databaseService.deleteRecordsByPageRange(startPageId, endPageId);
      if (result.success) {
        // Refresh data after successful deletion
        await this.loadSummary();
        await this.loadProducts(this.searchQuery.get(), 1, 50); // Reset to page 1 after deletion
        this.currentPage.set(1);
      } else {
        throw new Error(result.error?.message || 'Failed to delete records');
      }
    } catch (error) {
      console.error('Failed to delete records by page range:', error);
      throw error;
    }
  }

  /**
   * Export data to Excel
   */
  async exportToExcel(path?: string): Promise<void> {
    try {
      // Use the ExportService directly
      const result = await this.exportService.exportToExcel({
        format: 'xlsx' as const,
        path: path,
        includeHeaders: true
      });
      
      if (!result.success) {
        throw new Error(result.error?.message || 'Export failed');
      }
    } catch (error) {
      console.error('Failed to export to Excel:', error);
      throw error;
    }
  }

  /**
   * Clear save result
   */
  clearSaveResult(): void {
    this.lastSaveResult.set(null);
  }

  /**
   * Reset search
   */
  resetSearch(): void {
    this.searchQuery.set('');
    this.currentPage.set(1);
  }

  /**
   * Cleanup subscriptions
   */
  destroy(): void {
    this.unsubscribeFunctions.forEach(unsub => unsub());
    this.unsubscribeFunctions = [];
  }

  /**
   * Clear error state
   */
  clearError(): void {
    this.error.set(null);
  }

  /**
   * Get debug information
   */
  getDebugInfo(): object {
    return {
      summary: this.summary.get(),
      productsCount: this.products.get().length,
      searchQuery: this.searchQuery.get(),
      currentPage: this.currentPage.get(),
      totalPages: this.totalPages.get(),
      loading: this.loading.get(),
      saving: this.saving.get(),
      error: this.error.get(),
      lastSaveResult: this.lastSaveResult.get()
    };
  }
}

// Singleton instance and exports
export const databaseStore = new DatabaseStore();
