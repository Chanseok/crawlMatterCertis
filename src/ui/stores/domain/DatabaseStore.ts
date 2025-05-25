/**
 * DatabaseStore.ts
 * Simplified Domain Store for Database Operations
 */

import { atom } from 'nanostores';
import type { DatabaseSummary, MatterProduct } from '../../../../types';
import { getPlatformApi } from '../../platform/api';
import { DatabaseService } from '../../services/domain/DatabaseService';

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

  // Search and pagination state
  public readonly searchQuery = atom<string>('');
  public readonly currentPage = atom<number>(1);
  public readonly totalPages = atom<number>(0);

  // Unsubscribe functions
  private unsubscribeFunctions: (() => void)[] = [];
  private api = getPlatformApi();
  private databaseService = DatabaseService.getInstance();

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
        this.products.set(result.data.products || []);
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
}

// Singleton instance and exports
export const databaseStore = new DatabaseStore();
