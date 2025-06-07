/**
 * useDatabaseStore.ts
 * React hook for accessing the DatabaseStore domain store
 * 
 * Provides access to database operations and state with proper React integration
 * Uses MobX for reactive state management
 */

import { useEffect, useCallback } from 'react';

import type { MatterProduct } from '../../../types';
import { databaseStore } from '../stores/domain/DatabaseStore';
import { toUIMatterProducts } from '../types/ui-types';


/**
 * Database operations hook using Domain Store pattern
 * Provides database state and actions with proper error handling
 */
export function useDatabaseStore() {
  // MobX store provides direct access to reactive properties
  // No need for useStore() - MobX observer will handle reactivity

  // 🚀 최적화: 전체 조회를 기본으로 하는 메서드들
  const loadAllProducts = useCallback(async (page: number = 1, limit?: number) => {
    // limit이 제공되지 않으면 전체 데이터 로딩
    console.log(`[Database Store] Loading products - page: ${page}, limit: ${limit || 'unlimited'}`);
    await databaseStore.loadProducts(undefined, page, limit);
  }, []);

  const searchProducts = useCallback(async (query: string = '', page: number = 1, limit?: number) => {
    if (!query || query.trim() === '') {
      console.log('Empty search query, loading all products instead');
      await databaseStore.loadProducts(undefined, page, limit);
      return;
    }
    console.log(`[Database Store] Searching products - query: "${query}", limit: ${limit || 'unlimited'}`);
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
    // Database access state - Direct access to MobX store properties
    products: databaseStore.products,
    summary: databaseStore.summary,
    pagination: databaseStore.pagination,
    
    // Operation status (matches Domain Store properties)
    isSaving: databaseStore.saving,
    saveResult: databaseStore.lastSaveResult,
    isLoading: databaseStore.isLoading,
    error: databaseStore.error,
    
    // Core database actions
    saveProducts: (products: MatterProduct[]) => databaseStore.saveProducts(toUIMatterProducts(products)),
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
