/**
 * DatabaseStore.ts
 * Simplified Domain Store for Database Operations
 */

import { atom } from 'nanostores';
import type { DatabaseSummary, MatterProduct } from '../../../../types';
import { getPlatformApi } from '../../platform/api';

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
      const summary = await this.api.invokeMethod('getDatabaseSummary');
      if (summary) {
        this.summary.set(summary);
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
      const result = await this.api.invokeMethod('searchProducts', { query: query || '', page, limit });
      if (result) {
        this.products.set(result.products || []);
        this.totalPages.set(Math.ceil((result.total || 0) / limit));
        this.currentPage.set(page);
        if (query !== undefined) {
          this.searchQuery.set(query);
        }
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
      await this.api.invokeMethod('saveProductsToDB', products);
    } catch (error) {
      console.error('Failed to save products:', error);
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
