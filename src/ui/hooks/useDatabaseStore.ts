/**
 * useDatabaseStore.ts
 * React hook for accessing the DatabaseStore domain store
 * 
 * Provides access to database operations and state with proper React integration
 * Uses same patterns as useDatabaseViewModel for consistency
 */

import { useStore } from '@nanostores/react';
import { useEffect } from 'react';

import type { MatterProduct } from '../../../types';
import { databaseStore } from '../stores/domain/DatabaseStore';


/**
 * Database operations hook using Domain Store pattern
 * Provides database state and actions with proper error handling
 */
export function useDatabaseStore() {
  // Core database state
  const summary = useStore(databaseStore.summary);
  const products = useStore(databaseStore.products);
  
  // Operation status
  const loading = useStore(databaseStore.loading);
  const saving = useStore(databaseStore.saving);
  const lastSaveResult = useStore(databaseStore.lastSaveResult);
  
  // Pagination and search
  const searchQuery = useStore(databaseStore.searchQuery);
  const currentPage = useStore(databaseStore.currentPage);
  const totalPages = useStore(databaseStore.totalPages);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Optional: Clean up if component is unmounted
      // databaseStore.cleanup();
    };
  }, []);

  return {
    // Database access state
    products,
    summary,
    
    // Operation status (matches DatabaseViewModel properties)
    isSaving: saving,
    saveResult: lastSaveResult,
    isLoading: loading,
    
    // Pagination and search state
    searchQuery,
    currentPage,
    totalPages,

    // Core database actions
    saveProducts: (products: MatterProduct[]) => databaseStore.saveProducts(products),
    loadSummary: () => databaseStore.loadSummary(),
    loadProducts: (options: { page?: number; limit?: number }) => databaseStore.loadProducts(undefined, options.page, options.limit),
    
    // Export functionality
    exportToExcel: (path?: string) => databaseStore.exportToExcel(path),
    
    // Delete functionality
    deleteRecordsByPageRange: (startPageId: number, endPageId: number) => 
      databaseStore.deleteRecordsByPageRange(startPageId, endPageId),
    
    // Search and pagination
    searchProducts: (query: string, options?: { page?: number; limit?: number }) => 
      databaseStore.searchProducts(query, options),
    resetSearch: () => databaseStore.resetSearch(),
      
    // UI state management
    clearSaveResult: () => databaseStore.clearSaveResult(),
  };
}
