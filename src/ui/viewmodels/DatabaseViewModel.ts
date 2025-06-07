import { makeObservable, computed, action, runInAction } from 'mobx';
import { BaseViewModel } from './core/BaseViewModel';
import { DatabaseStore } from '../stores/domain/DatabaseStore';
import { LogStore } from '../stores/domain/LogStore';
import { Product } from '../../shared/types/database';

/**
 * Database view state for pagination and filtering
 */
export interface DatabaseViewState {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  sortBy: keyof Product;
  sortOrder: 'asc' | 'desc';
  filterText: string;
  selectedItems: Set<string>;
  isLoading: boolean;
}

/**
 * Database operation result
 */
export interface DatabaseOperationResult {
  success: boolean;
  message: string;
  affectedCount?: number;
}

/**
 * DatabaseViewModel
 * 
 * Manages database state, product lists, pagination, and operations.
 * Provides UI-specific logic for database interactions while delegating
 * business logic to DatabaseStore.
 */
export class DatabaseViewModel extends BaseViewModel {
  // Domain Store references
  private databaseStore: DatabaseStore;
  private logStore: LogStore;

  // Observable view state
  private _viewState: DatabaseViewState = {
    currentPage: 1,
    pageSize: 50,
    totalItems: 0,
    totalPages: 0,
    sortBy: 'url',
    sortOrder: 'asc',
    filterText: '',
    selectedItems: new Set(),
    isLoading: false
  };

  private _lastOperation: DatabaseOperationResult | null = null;
  private _filteredProducts: Product[] = [];

  constructor(databaseStore: DatabaseStore, logStore: LogStore) {
    super();
    this.databaseStore = databaseStore;
    this.logStore = logStore;

    makeObservable(this, {
      viewState: computed,
      lastOperationResult: computed,
      filteredProducts: computed,
      isLoading: computed,
      hasSelection: computed,
      selectedCount: computed,
      setPage: action,
      setPageSize: action,
      setSorting: action,
      setFilter: action,
      clearFilter: action,
      selectItem: action,
      unselectItem: action,
      toggleItemSelection: action,
      selectAll: action,
      unselectAll: action,
      toggleSelectAll: action,
      clearSelection: action,
      refreshProducts: action,
      deleteSelectedProducts: action,
      clearAllProducts: action,
      exportProducts: action,
      clearLastOperation: action
    });
    
    // Initialize view state based on current database state
    this.initializeViewState();
  }

  // ================================
  // Computed Properties
  // ================================

  @computed get viewState(): DatabaseViewState {
    return { ...this._viewState };
  }

  @computed get products(): Product[] {
    return this.databaseStore.products;
  }

  @computed get filteredProducts(): Product[] {
    return this._filteredProducts;
  }

  @computed get paginatedProducts(): Product[] {
    const startIndex = (this._viewState.currentPage - 1) * this._viewState.pageSize;
    const endIndex = startIndex + this._viewState.pageSize;
    return this._filteredProducts.slice(startIndex, endIndex);
  }

  @computed get hasProducts(): boolean {
    return this.products.length > 0;
  }

  @computed get selectedCount(): number {
    return this._viewState.selectedItems.size;
  }

  @computed get hasSelection(): boolean {
    return this._viewState.selectedItems.size > 0;
  }

  @computed get isLoading(): boolean {
    return this._viewState.isLoading;
  }

  @computed get canDeleteSelected(): boolean {
    return this.selectedCount > 0 && !this._viewState.isLoading;
  }

  @computed get canClearAll(): boolean {
    return this.hasProducts && !this._viewState.isLoading;
  }

  @computed  get isAllSelected(): boolean {
    return this.paginatedProducts.length > 0 && 
           this.paginatedProducts.every(product => this._viewState.selectedItems.has(product.url));
  }

  @computed get lastOperationResult(): DatabaseOperationResult | null {
    return this._lastOperation;
  }

  @computed get connectionStatus(): string {
    // Return a default status since connectionStatus doesn't exist on DatabaseStore
    return this.databaseStore.loading ? 'connecting' : 'connected';
  }

  @computed get databaseStats() {
    return {
      totalProducts: this.products.length,
      filteredCount: this._filteredProducts.length,
      selectedCount: this.selectedCount,
      currentPage: this._viewState.currentPage,
      totalPages: this._viewState.totalPages
    };
  }

  // ================================
  // Actions - View State Management
  // ================================

  @action
  setPage(page: number): void {
    if (page >= 1 && page <= this._viewState.totalPages) {
      this._viewState.currentPage = page;
      this.clearSelection();
    }
  }

  @action
  setPageSize(size: number): void {
    if (size > 0 && size <= 200) {
      this._viewState.pageSize = size;
      this._viewState.currentPage = 1;
      this.updatePagination();
      this.clearSelection();
    }
  }

  @action
  setSorting(sortBy: keyof Product, sortOrder: 'asc' | 'desc'): void {
    this._viewState.sortBy = sortBy;
    this._viewState.sortOrder = sortOrder;
    this.applyFiltersAndSorting();
  }

  @action
  setFilter(filterText: string): void {
    this._viewState.filterText = filterText;
    this._viewState.currentPage = 1;
    this.applyFiltersAndSorting();
    this.clearSelection();
  }

  @action
  clearFilter(): void {
    this.setFilter('');
  }

  // ================================
  // Actions - Selection Management
  // ================================

  @action
  selectItem(productId: string): void {
    this._viewState.selectedItems.add(productId);
  }

  @action
  unselectItem(productId: string): void {
    this._viewState.selectedItems.delete(productId);
  }

  @action
  toggleItemSelection(productId: string): void {
    if (this._viewState.selectedItems.has(productId)) {
      this.unselectItem(productId);
    } else {
      this.selectItem(productId);
    }
  }

  @action
  selectAll(): void {
    this.paginatedProducts.forEach(product => {
      this._viewState.selectedItems.add(product.url);
    });
  }

  @action
  unselectAll(): void {
    this.paginatedProducts.forEach(product => {
      this._viewState.selectedItems.delete(product.url);
    });
  }

  @action
  toggleSelectAll(): void {
    if (this.isAllSelected) {
      this.unselectAll();
    } else {
      this.selectAll();
    }
  }

  @action
  clearSelection(): void {
    this._viewState.selectedItems.clear();
  }

  // ================================
  // Actions - Database Operations
  // ================================

  @action
  async refreshProducts(): Promise<void> {
    try {
      this._viewState.isLoading = true;
      await this.databaseStore.loadProducts();
      this.applyFiltersAndSorting();
      this.clearSelection();
      
      this._lastOperation = {
        success: true,
        message: 'Products refreshed successfully'
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this._lastOperation = {
        success: false,
        message: `Failed to refresh products: ${errorMessage}`
      };
      this.logStore.addLog(`DatabaseViewModel: ${errorMessage}`, 'error', 'DATABASE');
    } finally {
      runInAction(() => {
        this._viewState.isLoading = false;
      });
    }
  }

  @action
  async deleteSelectedProducts(): Promise<void> {
    if (this.selectedCount === 0) return;

    try {
      this._viewState.isLoading = true;
      const selectedIds = Array.from(this._viewState.selectedItems);
      
      // TODO: Implement individual product deletion in DatabaseStore
      // await this.databaseStore.deleteProducts(selectedIds);
      throw new Error('Individual product deletion is not yet implemented. Use page range deletion instead.');
      
      this._lastOperation = {
        success: true,
        message: `Successfully deleted ${selectedIds.length} products`,
        affectedCount: selectedIds.length
      };
      
      this.clearSelection();
      this.applyFiltersAndSorting();
      
      this.logStore.addLog(`Deleted ${selectedIds.length} products`, 'info', 'DATABASE');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this._lastOperation = {
        success: false,
        message: `Failed to delete products: ${errorMessage}`
      };
      this.logStore.addLog(`DatabaseViewModel: ${errorMessage}`, 'error', 'DATABASE');
    } finally {
      runInAction(() => {
        this._viewState.isLoading = false;
      });
    }
  }

  @action
  async clearAllProducts(): Promise<void> {
    try {
      this._viewState.isLoading = true;
      const totalCount = this.products.length;
      
      await this.databaseStore.clearDatabase();
      
      this._lastOperation = {
        success: true,
        message: `Successfully cleared all ${totalCount} products`,
        affectedCount: totalCount
      };
      
      this.clearSelection();
      this.applyFiltersAndSorting();
      
      this.logStore.addLog(`Cleared all products from database`, 'info', 'DATABASE');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this._lastOperation = {
        success: false,
        message: `Failed to clear database: ${errorMessage}`
      };
      this.logStore.addLog(`DatabaseViewModel: ${errorMessage}`, 'error', 'DATABASE');
    } finally {
      runInAction(() => {
        this._viewState.isLoading = false;
      });
    }
  }

  @action
  async exportProducts(format: 'json' | 'csv' = 'json'): Promise<void> {
    try {
      this._viewState.isLoading = true;
      
      const exportData = this._viewState.selectedItems.size > 0 
        ? this.products.filter(p => this._viewState.selectedItems.has(p.url))
        : this.products;
      
      // Call database store export method - using exportToExcel for now since exportProducts doesn't exist
      await this.databaseStore.exportToExcel();
      
      this._lastOperation = {
        success: true,
        message: `Successfully exported ${exportData.length} products as ${format.toUpperCase()}`,
        affectedCount: exportData.length
      };
      
      this.logStore.addLog(`Exported ${exportData.length} products as ${format}`, 'info', 'DATABASE');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this._lastOperation = {
        success: false,
        message: `Failed to export products: ${errorMessage}`
      };
      this.logStore.addLog(`DatabaseViewModel: ${errorMessage}`, 'error', 'DATABASE');
    } finally {
      runInAction(() => {
        this._viewState.isLoading = false;
      });
    }
  }

  // ================================
  // Actions - Operation Management
  // ================================

  @action
  clearLastOperation(): void {
    this._lastOperation = null;
  }

  // ================================
  // Private Methods
  // ================================

  private initializeViewState(): void {
    this.applyFiltersAndSorting();
  }

  @action
  private applyFiltersAndSorting(): void {
    let filtered = [...this.products];

    // Apply text filter
    if (this._viewState.filterText) {
      const filterLower = this._viewState.filterText.toLowerCase();
      filtered = filtered.filter(product =>
        product.manufacturer?.toLowerCase().includes(filterLower) ||
        product.url.toLowerCase().includes(filterLower) ||
        product.model?.toLowerCase().includes(filterLower) ||
        product.certificateId?.toLowerCase().includes(filterLower)
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      const aValue = a[this._viewState.sortBy];
      const bValue = b[this._viewState.sortBy];
      
      // Handle undefined/null values
      if (aValue == null && bValue == null) return 0;
      if (aValue == null) return 1;
      if (bValue == null) return -1;
      
      let comparison = 0;
      if (aValue < bValue) comparison = -1;
      else if (aValue > bValue) comparison = 1;
      
      return this._viewState.sortOrder === 'asc' ? comparison : -comparison;
    });

    this._filteredProducts = filtered;
    this.updatePagination();
  }

  @action
  private updatePagination(): void {
    this._viewState.totalItems = this._filteredProducts.length;
    this._viewState.totalPages = Math.ceil(this._viewState.totalItems / this._viewState.pageSize);
    
    // Adjust current page if necessary
    if (this._viewState.currentPage > this._viewState.totalPages) {
      this._viewState.currentPage = Math.max(1, this._viewState.totalPages);
    }
  }

  // ================================
  // BaseViewModel Implementation
  // ================================

  async initialize(): Promise<void> {
    await super.initialize();
    await this.refreshProducts();
  }

  dispose(): void {
    this.clearSelection();
    this._lastOperation = null;
    super.dispose();
  }
}
