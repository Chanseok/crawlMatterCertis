/**
 * useCrawlingStore.ts
 * React hook for accessing the CrawlingStore domain store
 * 
 * Provides access to crawling operations and state with proper React integration
 */

import { useStore } from '@nanostores/react';
import { useEffect } from 'react';
import { crawlingStore } from '../stores/domain/CrawlingStore';
import type { CrawlerConfig } from '../../../types';

/**
 * Crawling operations hook using Domain Store pattern
 * Provides crawling state and actions with proper React integration
 */
export function useCrawlingStore() {
  const status = useStore(crawlingStore.status);
  const progress = useStore(crawlingStore.progress);
  const config = useStore(crawlingStore.config);
  const statusSummary = useStore(crawlingStore.statusSummary);
  const lastStatusSummary = useStore(crawlingStore.lastStatusSummary);
  const error = useStore(crawlingStore.error);
  const onProgressUpdate = useStore(crawlingStore.onProgressUpdate);
  const onStatusChange = useStore(crawlingStore.onStatusChange);
  const onConfigChange = useStore(crawlingStore.onConfigChange);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      crawlingStore.cleanup();
    };
  }, []);

  return {
    // State
    status,
    progress,
    config,
    statusSummary,
    lastStatusSummary,
    error,
    onProgressUpdate,
    onStatusChange,
    onConfigChange,

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
