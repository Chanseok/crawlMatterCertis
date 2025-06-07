# Batch Error Recovery and Resume Implementation

This document outlines the implementation of improved error handling and resume capability for the batch processing system.

## 1. Error Recovery for Individual Batch Failures

### Current Implementation

Currently, the batch processing system reports failures but doesn't have a dedicated mechanism to recover from batch-specific failures. If a batch fails, the system continues to the next batch but doesn't retry the failed batch.

### Proposed Implementation

We will enhance error recovery by:

1. **Isolating batch failures**: When a batch fails, the system will isolate the failure to that batch without affecting other batches.
2. **Implementing batch-specific retry logic**: Failed batches will be retried a configurable number of times before being marked as permanently failed.
3. **Adding detailed failure reporting**: The system will maintain detailed records of failures including the cause and the retry attempts.

### Implementation Details

#### 1. Add Batch Configuration Options

Add the following configuration options to `CrawlerConfig`:

```typescript
interface CrawlerConfig {
  // ... existing options
  
  // Batch error recovery options
  batchRetryCount?: number;      // Number of times to retry a failed batch (default: 3)
  batchRetryDelayMs?: number;    // Delay before retrying a failed batch (default: 5000)
  continueOnBatchFailure?: boolean; // Whether to continue with remaining batches if a batch permanently fails (default: true)
}
```

#### 2. Implement Batch Retry Logic in CrawlerEngine

In the `startCrawling` method, replace the current batch processing loop with enhanced error handling:

```typescript
for (let batch = 0; batch < totalBatches; batch++) {
  if (this.abortController.signal.aborted) {
    console.log('[CrawlerEngine] Crawling aborted during batch processing.');
    break;
  }
  
  batchNumber = batch + 1;
  console.log(`[CrawlerEngine] Processing batch ${batchNumber}/${totalBatches}`);
  
  // Calculate batch range
  const batchEndPage = Math.max(endPage, currentPage - batchSize + 1);
  const batchRange = {
    startPage: currentPage,
    endPage: batchEndPage
  };
  
  // Track retry attempts for this batch
  let retryCount = 0;
  let batchSuccess = false;
  let lastError = null;
  
  // Try processing this batch with retries
  while (!batchSuccess && retryCount <= batchRetryCount && !this.abortController.signal.aborted) {
    if (retryCount > 0) {
      console.log(`[CrawlerEngine] Retrying batch ${batchNumber} (attempt ${retryCount}/${batchRetryCount})`);
      
      // Add delay before retry
      await new Promise(resolve => setTimeout(resolve, batchRetryDelayMs));
    }
    
    try {
      // Create new collector for this attempt
      const batchCollector = new ProductListCollector(
        this.state,
        this.abortController,
        currentConfig,
        this.browserManager!
      );
      
      batchCollector.setProgressCallback(enhancedProgressUpdater);
      
      // Process the batch
      console.log(`[CrawlerEngine] Collecting batch ${batchNumber} range: ${batchRange.startPage} to ${batchRange.endPage}`);
      const batchProducts = await batchCollector.collectPageRange(batchRange);
      
      // Batch successful
      allCollectedProducts = allCollectedProducts.concat(batchProducts);
      batchSuccess = true;
      
      // Clean up resources
      await batchCollector.cleanupResources();
    } catch (error) {
      lastError = error;
      console.error(`[CrawlerEngine] Error processing batch ${batchNumber}:`, error);
      retryCount++;
    }
  }
  
  // Check if batch permanently failed
  if (!batchSuccess) {
    console.error(`[CrawlerEngine] Batch ${batchNumber} failed after ${retryCount} retries`);
    
    // Report batch failure
    this.state.reportBatchFailure(batchNumber, batchRange, lastError);
    
    // Check if we should continue with other batches
    if (!continueOnBatchFailure) {
      console.log('[CrawlerEngine] Stopping batch processing due to permanent batch failure');
      break;
    }
  }
  
  // Prepare for next batch
  currentPage = batchEndPage - 1;
  
  // Add delay between batches
  if (batch < totalBatches - 1 && batchSuccess) {
    console.log(`[CrawlerEngine] Waiting ${batchDelayMs}ms before next batch...`);
    await new Promise(resolve => setTimeout(resolve, batchDelayMs));
  }
}
```

#### 3. Add Batch Failure Reporting in CrawlerState

Extend the CrawlerState class with batch failure tracking:

```typescript
// Add to CrawlerState.ts
interface BatchFailure {
  batchNumber: number;
  range: { startPage: number; endPage: number };
  error: any;
  timestamp: number;
}

// Inside CrawlerState class
private batchFailures: BatchFailure[] = [];

public reportBatchFailure(batchNumber: number, range: { startPage: number; endPage: number }, error: any): void {
  this.batchFailures.push({
    batchNumber,
    range,
    error,
    timestamp: Date.now()
  });
  
  // Emit event for UI feedback
  crawlerEvents.emit('batchFailure', {
    batchNumber,
    range,
    error: error instanceof Error ? error.message : String(error)
  });
}

public getBatchFailures(): BatchFailure[] {
  return [...this.batchFailures];
}
```

## 2. Batch Resume Capability

### Current Implementation

The current implementation doesn't support resuming a crawling session if it's interrupted. The entire process must be restarted.

### Proposed Implementation

We will implement a batch resume capability that:

1. **Saves crawling progress**: Periodically saves the progress of the crawling session, including completed batches.
2. **Provides resume functionality**: Allows resuming from the last successful batch if the crawling is interrupted.
3. **Optimizes efficiency**: Avoids redundant work by skipping already completed batches.

### Implementation Details

#### 1. Add Resume Configuration Options

Add the following configuration options to `CrawlerConfig`:

```typescript
interface CrawlerConfig {
  // ... existing options
  
  // Batch resume options
  enableBatchResume?: boolean;    // Whether to enable batch resume (default: true)
  batchProgressSaveIntervalMs?: number; // How often to save progress (default: 30000)
}
```

#### 2. Add Progress Storage Mechanism

Create a new file `batch-progress-store.ts` to handle saving and loading progress:

```typescript
/**
 * Batch progress storage mechanism
 */
import fs from 'fs/promises';
import path from 'path';
import { electronResourcePaths } from '../../../resourceManager.js';

export interface BatchProgress {
  sessionId: string;
  timestamp: number;
  completedBatches: {
    batchNumber: number;
    range: { startPage: number; endPage: number };
    productsCollected: number;
    timestamp: number;
  }[];
  pendingBatches: {
    batchNumber: number;
    range: { startPage: number; endPage: number };
  }[];
  config: any;
}

export class BatchProgressStore {
  private progressFilePath: string;
  
  constructor() {
    this.progressFilePath = path.join(electronResourcePaths.dataPath, 'batch-progress.json');
  }
  
  /**
   * Save batch progress
   */
  async saveProgress(progress: BatchProgress): Promise<void> {
    try {
      await fs.writeFile(this.progressFilePath, JSON.stringify(progress, null, 2));
    } catch (error) {
      console.error('[BatchProgressStore] Error saving progress:', error);
      // Don't throw - this is a non-critical operation
    }
  }
  
  /**
   * Load saved batch progress
   */
  async loadProgress(): Promise<BatchProgress | null> {
    try {
      const exists = await fs.access(this.progressFilePath)
        .then(() => true)
        .catch(() => false);
      
      if (!exists) {
        return null;
      }
      
      const data = await fs.readFile(this.progressFilePath, 'utf-8');
      return JSON.parse(data) as BatchProgress;
    } catch (error) {
      console.error('[BatchProgressStore] Error loading progress:', error);
      return null;
    }
  }
  
  /**
   * Clear saved progress (after successful completion)
   */
  async clearProgress(): Promise<void> {
    try {
      const exists = await fs.access(this.progressFilePath)
        .then(() => true)
        .catch(() => false);
      
      if (exists) {
        await fs.unlink(this.progressFilePath);
      }
    } catch (error) {
      console.error('[BatchProgressStore] Error clearing progress:', error);
      // Don't throw - this is a non-critical operation
    }
  }
}

// Singleton instance
export const batchProgressStore = new BatchProgressStore();
```

#### 3. Implement Resume Logic in CrawlerEngine

Modify the `startCrawling` method to support resuming from saved progress:

```typescript
// Add to imports
import { batchProgressStore } from '../utils/batch-progress-store.js';
import { v4 as uuidv4 } from 'uuid'; // You might need to add this dependency

// Inside startCrawling method before batch processing
let sessionId = uuidv4();
let completedBatches = [];
let savedProgress = null;

// Check if resumable batch processing is enabled
if (enableBatchProcessing && enableBatchResume) {
  // Try to load saved progress
  savedProgress = await batchProgressStore.loadProgress();
  
  if (savedProgress) {
    // Validate the saved progress against the current configuration
    const configMatches = this.isConfigCompatible(currentConfig, savedProgress.config);
    const isRecent = Date.now() - savedProgress.timestamp < 24 * 60 * 60 * 1000; // 24 hours
    
    if (configMatches && isRecent) {
      // We can resume from saved progress
      console.log('[CrawlerEngine] Found resumable batch progress. Resuming from previous session.');
      sessionId = savedProgress.sessionId;
      completedBatches = savedProgress.completedBatches;
      
      // Load already collected products
      if (savedProgress.collectedProducts) {
        allCollectedProducts = savedProgress.collectedProducts;
        console.log(`[CrawlerEngine] Loaded ${allCollectedProducts.length} products from previous session.`);
      }
      
      // Update progress display with loaded data
      enhancedProgressUpdater(
        completedBatches.reduce((sum, b) => sum + b.productsCollected, 0),
        totalPagesToCrawl,
        [], // Would need to reconstruct page statuses
        0,  // Reset retry count for new session
        startTime,
        false
      );
    } else {
      // Can't resume, clear saved progress
      console.log('[CrawlerEngine] Found incompatible or outdated progress. Starting fresh crawling session.');
      await batchProgressStore.clearProgress();
    }
  }
}

// Then in the batch processing loop
for (let batch = 0; batch < totalBatches; batch++) {
  batchNumber = batch + 1;
  
  // Skip already completed batches
  if (completedBatches.some(b => b.batchNumber === batchNumber)) {
    console.log(`[CrawlerEngine] Skipping batch ${batchNumber}/${totalBatches} (already completed in previous session)`);
    continue;
  }
  
  // ... rest of batch processing logic
  
  // After successful batch, save progress
  if (batchSuccess && enableBatchProcessing && enableBatchResume) {
    completedBatches.push({
      batchNumber,
      range: batchRange,
      productsCollected: batchProducts.length,
      timestamp: Date.now()
    });
    
    // Calculate pending batches
    const pendingBatches = [];
    for (let i = batch + 1; i < totalBatches; i++) {
      const pendingBatchNumber = i + 1;
      const pendingStart = currentPage;
      const pendingEnd = Math.max(endPage, pendingStart - batchSize + 1);
      
      pendingBatches.push({
        batchNumber: pendingBatchNumber,
        range: {
          startPage: pendingStart,
          endPage: pendingEnd
        }
      });
      
      currentPage = pendingEnd - 1;
    }
    
    // Save progress
    await batchProgressStore.saveProgress({
      sessionId,
      timestamp: Date.now(),
      completedBatches,
      pendingBatches,
      collectedProducts: allCollectedProducts,
      config: currentConfig
    });
  }
}

// After successful completion, clear progress
if (enableBatchProcessing && enableBatchResume) {
  await batchProgressStore.clearProgress();
}

// Helper method to validate config compatibility
private isConfigCompatible(currentConfig, savedConfig) {
  // Check essential properties that would affect crawling
  const essentialProps = [
    'batchSize',
    'pageRangeLimit',
    'crawlerType',
    'baseUrl',
    'matterFilterUrl'
  ];
  
  return essentialProps.every(prop => 
    currentConfig[prop] === savedConfig[prop]);
}
```

## Testing Implementation

To test the enhanced error handling and resume capability:

1. **Unit Tests**: Create unit tests for both the error recovery and resume functionality
2. **Integration Tests**: Test the complete crawling process with forced failures
3. **Real-world Tests**: Test with actual website under different network conditions

## Conclusion

These improvements will significantly enhance the robustness of the batch processing system:

1. **Better Error Handling**: Individual batch failures won't disrupt the entire crawling process
2. **Efficient Resource Usage**: Retries are applied only to failed batches, not to the entire process
3. **Resume Capability**: Long crawling sessions can be resumed if interrupted, saving time and resources

Together, these features will make the crawler more reliable and efficient for large-scale data collection.
