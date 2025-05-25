// test-domain-store-validation.js - Run with npx vitest run
import { describe, it, expect, beforeEach } from 'vitest';
import { CrawlingStore } from './src/ui/stores/domain/CrawlingStore.js';

// Mock IPCService for testing
const mockIPCService = {
  subscribeCrawlingProgress: () => () => {},
  subscribeCrawlingComplete: () => () => {},
  subscribeCrawlingError: () => () => {},
  startCrawling: async () => ({ success: true }),
  stopCrawling: async () => ({ success: true }),
  checkCrawlingStatus: async () => ({ success: true, status: 'idle' })
};

describe('Domain Store Pattern Validation', () => {
  let crawlingStore;
  
  beforeEach(() => {
    // Create store with mocked IPC service
    crawlingStore = new CrawlingStore();
    // Replace the real IPC service with mock for testing
    crawlingStore.api = mockIPCService;
  });
  
  it('should initialize with correct default state', () => {
    const status = crawlingStore.status.get();
    const progress = crawlingStore.progress.get();
    const error = crawlingStore.error.get();
    
    expect(status).toBe('idle');
    expect(progress).toBe(0);
    expect(error).toBeNull();
  });
  
  it('should handle status updates correctly', () => {
    crawlingStore.status.set('running');
    expect(crawlingStore.status.get()).toBe('running');
    
    crawlingStore.status.set('completed');
    expect(crawlingStore.status.get()).toBe('completed');
  });
  
  it('should handle progress updates correctly', () => {
    crawlingStore.progress.set(50);
    expect(crawlingStore.progress.get()).toBe(50);
    
    crawlingStore.progress.set(100);
    expect(crawlingStore.progress.get()).toBe(100);
  });
  
  it('should handle error states correctly', () => {
    const testError = 'Test error message';
    crawlingStore.error.set(testError);
    expect(crawlingStore.error.get()).toBe(testError);
    
    crawlingStore.error.set(null);
    expect(crawlingStore.error.get()).toBeNull();
  });
  
  it('should handle status summary updates', () => {
    const testSummary = {
      stage: 'productList',
      status: 'running',
      progress: 50,
      currentStep: 'Collecting products',
      totalItems: 100,
      processedItems: 50
    };
    
    crawlingStore.statusSummary.set(testSummary);
    const result = crawlingStore.statusSummary.get();
    
    expect(result.stage).toBe('productList');
    expect(result.status).toBe('running');
    expect(result.progress).toBe(50);
  });
});
