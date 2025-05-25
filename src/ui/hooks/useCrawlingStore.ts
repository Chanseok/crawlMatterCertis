/**
 * useCrawlingStore.ts
 * React hook for accessing the MobX-based CrawlingStore domain store
 * 
 * Provides access to crawling operations and state with proper React integration
 */

import { useEffect } from 'react';
import { crawlingStore } from '../stores/domain/CrawlingStore';
import type { CrawlerConfig } from '../../../types';

/**
 * Crawling operations hook using MobX Domain Store pattern
 * Provides crawling state and actions with proper React integration
 */
export function useCrawlingStore() {
  // MobX observables are accessed directly from the store instance
  // The observer wrapper in components will handle reactivity

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      crawlingStore.cleanup();
    };
  }, []);

  return {
    // State - Direct access to MobX observables
    status: crawlingStore.status,
    progress: crawlingStore.progress,
    config: crawlingStore.config,
    statusSummary: crawlingStore.statusSummary,
    lastStatusSummary: crawlingStore.lastStatusSummary,
    error: crawlingStore.error,
    isCheckingStatus: crawlingStore.isCheckingStatus,

    // Computed properties
    isRunning: crawlingStore.isRunning,
    canStart: crawlingStore.canStart,
    canStop: crawlingStore.canStop,
    canPause: crawlingStore.canPause,

    // Actions
    startCrawling: () => crawlingStore.startCrawling(),
    stopCrawling: () => crawlingStore.stopCrawling(),
    checkStatus: () => crawlingStore.checkStatus(),
    loadConfig: async () => {
      console.log('useCrawlingStore.loadConfig called');
      try {
        // 실제 CrawlingStore의 loadConfig 메서드 호출
        const config = await crawlingStore.loadConfig();
        console.log('useCrawlingStore.loadConfig completed with config:', config);
        return config;
      } catch (error) {
        console.error('useCrawlingStore.loadConfig error:', error);
        throw error;
      }
    },
    updateConfig: async (config: Partial<CrawlerConfig>) => {
      console.log('useCrawlingStore.updateConfig called with:', config);
      try {
        await crawlingStore.updateConfig(config);
        console.log('useCrawlingStore.updateConfig completed successfully');
      } catch (error) {
        console.error('useCrawlingStore.updateConfig error:', error);
        throw error;
      }
    },
    updateProgress: (progressUpdate: Parameters<typeof crawlingStore.updateProgress>[0]) => 
      crawlingStore.updateProgress(progressUpdate),
    clearError: () => crawlingStore.clearError(),
    
    // Utility methods
    getDebugInfo: () => crawlingStore.getDebugInfo(),
    cleanup: () => crawlingStore.cleanup(),
  };
}
