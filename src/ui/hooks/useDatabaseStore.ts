/**
 * useDatabaseStore.ts
 * React hook for accessing the DatabaseStore domain store
 * 
 * Provides access to database operations and state with proper React integration
 * Uses same patterns as useDatabaseViewModel for consistency
 */

import { useStore } from '@nanostores/react';
import { useEffect, useCallback } from 'react';

import type { MatterProduct } from '../../../types';
import { databaseStore } from '../stores/domain/DatabaseStore';


/**
 * Database operations hook using Domain Store pattern
 * Provides database state and actions with proper error handling
 */
export function useDatabaseStore() {
  // Core database state
  const products = useStore(databaseStore.products);
  const summary = useStore(databaseStore.summary);
  const pagination = useStore(databaseStore.pagination);
  
  // Operation status
  const isLoading = useStore(databaseStore.isLoading);
  const saving = useStore(databaseStore.saving);
  const lastSaveResult = useStore(databaseStore.lastSaveResult);
  const error = useStore(databaseStore.error);

  // 메서드들을 useCallback으로 메모이제이션하여 불필요한 리렌더링 방지
  const loadAllProducts = useCallback(async (page: number = 1, limit: number = 100) => {
    await databaseStore.loadProducts(undefined, page, limit);
  }, []);

  const searchProducts = useCallback(async (query: string = '', page: number = 1, limit: number = 100) => {
    if (!query || query.trim() === '') {
      console.log('Empty search query, loading all products instead');
      await databaseStore.loadProducts(undefined, page, limit);
      return;
    }
    await databaseStore.searchProducts(query.trim(), page, limit);
  }, []);

  const loadSummary = useCallback(async () => {
    await databaseStore.loadSummary();
  }, []);

  const exportToExcel = useCallback(async (path?: string) => {
    return await databaseStore.exportToExcel(path);
  }, []);

  const deleteRecordsByPageRange = useCallback(async (startPageId: number, endPageId: number) => {
    return await databaseStore.deleteRecordsByPageRange(startPageId, endPageId);
  }, []);

  const clearError = useCallback(() => {
    databaseStore.clearError();
  }, []);

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
    pagination,
    
    // Operation status (matches DatabaseViewModel properties)
    isSaving: saving,
    saveResult: lastSaveResult,
    isLoading,
    error,
    
    // Core database actions
    saveProducts: (products: MatterProduct[]) => databaseStore.saveProducts(products),
    loadSummary,
    loadAllProducts,
    
    // Export functionality
    exportToExcel,
    
    // Delete functionality
    deleteRecordsByPageRange,
    
    // Search and pagination
    searchProducts,
    resetSearch: () => databaseStore.resetSearch(),
      
    // UI state management
    clearSaveResult: () => databaseStore.clearSaveResult(),
    clearError,
    
    // Utility methods
    getDebugInfo: () => databaseStore.getDebugInfo(),
  };
}
