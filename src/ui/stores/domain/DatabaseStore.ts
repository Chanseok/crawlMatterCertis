/**
 * DatabaseStore.ts
 * Simplified Domain Store for Database Operations
 */

import { makeObservable, observable, action, computed, runInAction } from 'mobx';
import type { DatabaseSummary, MatterProduct } from '../../../../types';
import type { UIMatterProduct } from '../../types/ui-types';
import { toUIMatterProducts } from '../../types/ui-types';
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
  // State properties - all observable
  public summary: DatabaseSummary | null = null;
  public products: UIMatterProduct[] = [];
  public loading: boolean = false;
  public saving: boolean = false;
  public lastSaveResult: { success: boolean; message?: string } | null = null;
  public error: string | null = null;

  // Search and pagination state
  public searchQuery: string = '';
  public currentPage: number = 1;
  public totalPages: number = 0;
  public pagination: { page: number; limit?: number; total: number } = { page: 1, total: 0 };

  // Unsubscribe functions
  private unsubscribeFunctions: (() => void)[] = [];
  private api = getPlatformApi();
  private databaseService = DatabaseService.getInstance();
  private exportService = ExportService.getInstance();

  constructor() {
    makeObservable(this, {
      // Observable state
      summary: observable,
      products: observable,
      loading: observable,
      saving: observable,
      lastSaveResult: observable,
      error: observable,
      searchQuery: observable,
      currentPage: observable,
      totalPages: observable,
      pagination: observable,

      // Actions
      loadSummary: action,
      loadProducts: action,
      saveProducts: action,
      searchProducts: action,
      deleteRecordsByPageRange: action,
      clearDatabase: action,
      exportToExcel: action,
      clearSaveResult: action,
      resetSearch: action,
      clearError: action,
      destroy: action,

      // Computed properties
      isLoading: computed,
    });

    this.initializeEventSubscriptions();
  }

  // Computed property for loading state to match hook expectations
  get isLoading(): boolean {
    return this.loading;
  }

  /**
   * Initialize IPC event subscriptions for database events
   */
  private initializeEventSubscriptions(): void {
    // Database summary updates
    const unsubSummary = this.api.subscribeToEvent('dbSummaryUpdated' as any, (summary: DatabaseSummary) => {
      runInAction(() => {
        this.summary = summary;
      });
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
        runInAction(() => {
          this.summary = result.data || null;
        });
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
  async loadProducts(query?: string, page: number = 1, limit?: number): Promise<void> {
    runInAction(() => {
      this.loading = true;
    });

    try {
      // Use getProducts for loading all products, searchProducts only when there's a query
      const result = query && query.trim() 
        ? await this.databaseService.searchProducts({ query: query.trim(), page, limit })
        : await this.databaseService.getProducts({ page, limit });
      
      if (result.success && result.data) {
        // Convert the products to match the expected type
        const convertedProducts = (result.data.products || []).map(product => ({
          ...product,
          createdAt: product.createdAt instanceof Date ? product.createdAt.toISOString() : product.createdAt,
          updatedAt: product.updatedAt instanceof Date ? product.updatedAt.toISOString() : product.updatedAt
        }));
        
        runInAction(() => {
          this.products = toUIMatterProducts(convertedProducts as MatterProduct[]);
          this.totalPages = result.data?.totalPages || 0;
          this.currentPage = page;
          if (query !== undefined) {
            this.searchQuery = query;
          }
        });
      } else {
        console.error('Failed to load products:', result.error);
        runInAction(() => {
          this.products = [];
          this.totalPages = 0;
        });
      }
    } catch (error) {
      console.error('Failed to load products:', error);
      runInAction(() => {
        this.products = [];
        this.totalPages = 0;
      });
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  /**
   * Save products to database
   */
  async saveProducts(products: UIMatterProduct[]): Promise<void> {
    runInAction(() => {
      this.saving = true;
    });

    try {
      // Transform products to shared type with required database fields
      const dbProducts = products.map(product => ({
        ...product,
        id: product.id || crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        applicationCategories: product.applicationCategories ? [...product.applicationCategories] : undefined
      })) as any; // Type assertion to handle type compatibility
      
      const result = await this.databaseService.saveProducts({
        products: dbProducts,
        autoSave: false
      });
      
      if (result.success) {
        runInAction(() => {
          this.lastSaveResult = { success: true, message: 'Products saved successfully' };
        });
        // Refresh data after successful save
        await this.loadSummary();
        await this.loadProducts(this.searchQuery, this.currentPage);
      } else {
        runInAction(() => {
          this.lastSaveResult = { 
            success: false, 
            message: result.error?.message || 'Failed to save products' 
          };
        });
      }
    } catch (error) {
      console.error('Failed to save products:', error);
      runInAction(() => {
        this.lastSaveResult = { 
          success: false, 
          message: error instanceof Error ? error.message : 'Unknown error occurred' 
        };
      });
    } finally {
      runInAction(() => {
        this.saving = false;
      });
    }
  }

  /**
   * Search products with query
   */
  async searchProducts(query: string = '', page: number = 1, limit?: number): Promise<void> {
    try {
      runInAction(() => {
        this.loading = true;
        this.error = null;
      });

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
        
        runInAction(() => {
          this.products = toUIMatterProducts(convertedProducts as MatterProduct[]);
          this.totalPages = searchResult.totalPages || 0;
          this.currentPage = page;
          if (query !== undefined) {
            this.searchQuery = query;
          }
        });
        
        console.log(`Search completed: ${convertedProducts.length || 0} products found`);
      } else {
        throw new Error(result.error?.message || 'Search operation failed');
      }
    } catch (error) {
      console.error('Failed to search products:', error);
      runInAction(() => {
        this.error = `제품 검색에 실패했습니다: ${error instanceof Error ? error.message : String(error)}`;
        this.products = [];
        this.totalPages = 0;
      });
    } finally {
      runInAction(() => {
        this.loading = false;
      });
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
        await this.loadProducts(this.searchQuery, 1); // Reset to page 1 after deletion, no limit
        runInAction(() => {
          this.currentPage = 1;
        });
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
    runInAction(() => {
      this.lastSaveResult = null;
    });
  }

  /**
   * Reset search
   */
  resetSearch(): void {
    runInAction(() => {
      this.searchQuery = '';
      this.currentPage = 1;
    });
  }

  /**
   * Clear all data from database
   */
  async clearDatabase(): Promise<void> {
    try {
      const result = await this.databaseService.clearDatabase();
      if (result.success) {
        // Refresh data after successful clearing
        await this.loadSummary();
        await this.loadProducts('', 1); // Reset to empty search and page 1, no limit
        runInAction(() => {
          this.currentPage = 1;
          this.searchQuery = '';
        });
      } else {
        throw new Error(result.error?.message || 'Failed to clear database');
      }
    } catch (error) {
      console.error('Failed to clear database:', error);
      throw error;
    }
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
    runInAction(() => {
      this.error = null;
    });
  }

  /**
   * Get debug information
   */
  getDebugInfo(): object {
    return {
      summary: this.summary,
      productsCount: this.products.length,
      searchQuery: this.searchQuery,
      currentPage: this.currentPage,
      totalPages: this.totalPages,
      loading: this.loading,
      saving: this.saving,
      error: this.error,
      lastSaveResult: this.lastSaveResult
    };
  }
}

// Singleton instance and exports
export const databaseStore = new DatabaseStore();
