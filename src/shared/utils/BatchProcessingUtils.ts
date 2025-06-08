/**
 * BatchProcessingUtils.ts
 * Phase 4.2: Advanced batch processing utilities for improved resource management
 * 
 * Provides comprehensive batch processing functionality including:
 * - Adaptive batch sizing based on system resources
 * - Batch error recovery and retry mechanisms
 * - Batch progress tracking and resumption
 * - Memory-aware batch optimization
 */

import { CrawlingUtils } from './CrawlingUtils.js';
import { TimeUtils } from './TimeUtils.js';

export interface BatchConfiguration {
  /** Base batch size (default: 30) */
  batchSize: number;
  /** Delay between batches in milliseconds (default: 2000) */
  batchDelayMs: number;
  /** Whether to enable batch processing (default: true) */
  enableBatchProcessing: boolean;
  /** Maximum batch size allowed (default: 100) */
  maxBatchSize?: number;
  /** Minimum batch size allowed (default: 5) */
  minBatchSize?: number;
  /** Memory threshold for adaptive sizing in MB (default: 512) */
  memoryThresholdMB?: number;
}

export interface BatchRetryConfiguration {
  /** Number of times to retry a failed batch (default: 3) */
  batchRetryCount: number;
  /** Delay before retrying a failed batch in milliseconds (default: 5000) */
  batchRetryDelayMs: number;
  /** Whether to continue with remaining batches if a batch permanently fails (default: true) */
  continueOnBatchFailure: boolean;
  /** Exponential backoff multiplier for retry delays (default: 1.5) */
  retryBackoffMultiplier?: number;
}

export interface BatchProgress {
  /** Unique session identifier */
  sessionId: string;
  /** Timestamp when progress was saved */
  timestamp: number;
  /** Batches that have been completed */
  completedBatches: CompletedBatch[];
  /** Batches that are still pending */
  pendingBatches: PendingBatch[];
  /** Total number of items collected so far */
  totalCollected: number;
  /** Configuration used for this batch session */
  config: any;
}

export interface CompletedBatch {
  batchNumber: number;
  range: { startPage: number; endPage: number };
  itemsCollected: number;
  timestamp: number;
  duration: number;
  retryCount?: number;
}

export interface PendingBatch {
  batchNumber: number;
  range: { startPage: number; endPage: number };
  estimatedItems: number;
}

export interface BatchMetrics {
  /** Current batch being processed */
  currentBatch: number;
  /** Total number of batches */
  totalBatches: number;
  /** Items processed in current batch */
  currentBatchItems: number;
  /** Total items processed across all batches */
  totalItemsProcessed: number;
  /** Estimated total items to process */
  estimatedTotalItems: number;
  /** Average items per batch */
  averageItemsPerBatch: number;
  /** Average time per batch in milliseconds */
  averageTimePerBatch: number;
  /** Estimated remaining time in milliseconds */
  estimatedRemainingTime?: number;
}

export interface AdaptiveBatchOptions {
  /** Enable adaptive batch sizing based on system resources */
  enableAdaptiveSizing: boolean;
  /** Target memory usage percentage (0-1, default: 0.7) */
  targetMemoryUsage?: number;
  /** How often to check memory usage (in batches, default: 5) */
  memoryCheckInterval?: number;
  /** Performance sampling window size (default: 10) */
  performanceSampleSize?: number;
}

export class BatchProcessingUtils {

  // === Core Batch Division Utilities ===

  /**
   * Create optimized batches from a range with intelligent sizing
   * Extends CrawlingUtils.chunkArray with additional batch optimization
   * 
   * @param totalItems Total number of items to process
   * @param config Batch configuration
   * @returns Array of batch ranges
   */
  static createOptimizedBatches(
    totalItems: number,
    config: BatchConfiguration
  ): Array<{ batchNumber: number; startIndex: number; endIndex: number; size: number }> {
    if (!config.enableBatchProcessing || totalItems <= config.batchSize) {
      return [{
        batchNumber: 1,
        startIndex: 0,
        endIndex: totalItems - 1,
        size: totalItems
      }];
    }

    const batches = [];
    const batchSize = Math.min(config.batchSize, config.maxBatchSize || 100);
    let currentIndex = 0;
    let batchNumber = 1;

    while (currentIndex < totalItems) {
      const remainingItems = totalItems - currentIndex;
      const currentBatchSize = Math.min(batchSize, remainingItems);
      
      batches.push({
        batchNumber: batchNumber++,
        startIndex: currentIndex,
        endIndex: currentIndex + currentBatchSize - 1,
        size: currentBatchSize
      });

      currentIndex += currentBatchSize;
    }

    return batches;
  }

  /**
   * Create page-based batches for crawling operations
   * Specialized for page range processing with smart boundary handling
   * 
   * @param startPage Starting page number
   * @param endPage Ending page number
   * @param config Batch configuration
   * @returns Array of page range batches
   */
  static createPageBatches(
    startPage: number,
    endPage: number,
    config: BatchConfiguration
  ): Array<{ batchNumber: number; startPage: number; endPage: number; pageCount: number }> {
    const totalPages = Math.abs(startPage - endPage) + 1;
    
    if (!config.enableBatchProcessing || totalPages <= config.batchSize) {
      return [{
        batchNumber: 1,
        startPage,
        endPage,
        pageCount: totalPages
      }];
    }

    const batches = [];
    const batchSize = Math.min(config.batchSize, config.maxBatchSize || 100);
    const isDescending = startPage > endPage;
    let currentPage = startPage;
    let batchNumber = 1;

    while ((isDescending && currentPage >= endPage) || (!isDescending && currentPage <= endPage)) {
      const remainingPages = isDescending 
        ? currentPage - endPage + 1 
        : endPage - currentPage + 1;
      
      const currentBatchSize = Math.min(batchSize, remainingPages);
      const batchEndPage = isDescending 
        ? currentPage - currentBatchSize + 1 
        : currentPage + currentBatchSize - 1;

      batches.push({
        batchNumber: batchNumber++,
        startPage: currentPage,
        endPage: batchEndPage,
        pageCount: currentBatchSize
      });

      currentPage = isDescending 
        ? batchEndPage - 1 
        : batchEndPage + 1;
    }

    return batches;
  }

  // === Adaptive Batch Sizing ===

  /**
   * Calculate adaptive batch size based on system performance
   * Monitors memory usage and processing speed to optimize batch sizes
   * 
   * @param baseConfig Base batch configuration
   * @param metrics Current batch metrics
   * @param options Adaptive sizing options
   * @returns Optimized batch size
   */
  static calculateAdaptiveBatchSize(
    baseConfig: BatchConfiguration,
    metrics: BatchMetrics,
    options: AdaptiveBatchOptions = { enableAdaptiveSizing: true }
  ): number {
    if (!options.enableAdaptiveSizing) {
      return baseConfig.batchSize;
    }

    const { targetMemoryUsage = 0.7, performanceSampleSize = 10 } = options;
    let adaptedSize = baseConfig.batchSize;

    // Get current memory usage
    const memoryInfo = CrawlingUtils.getMemoryUsage();
    if (memoryInfo) {
      const memoryUsageRatio = memoryInfo.heapUsed / memoryInfo.heapTotal;
      
      if (memoryUsageRatio > targetMemoryUsage) {
        // Reduce batch size if memory usage is high
        adaptedSize = Math.max(
          baseConfig.minBatchSize || 5,
          Math.floor(adaptedSize * 0.8)
        );
      } else if (memoryUsageRatio < targetMemoryUsage * 0.5) {
        // Increase batch size if memory usage is low
        adaptedSize = Math.min(
          baseConfig.maxBatchSize || 100,
          Math.floor(adaptedSize * 1.2)
        );
      }
    }

    // Adjust based on processing performance
    if (metrics.averageTimePerBatch > 0 && metrics.currentBatch >= performanceSampleSize) {
      const targetTimePerBatch = 30000; // 30 seconds target
      
      if (metrics.averageTimePerBatch > targetTimePerBatch * 1.5) {
        // Reduce batch size if processing is too slow
        adaptedSize = Math.max(
          baseConfig.minBatchSize || 5,
          Math.floor(adaptedSize * 0.9)
        );
      } else if (metrics.averageTimePerBatch < targetTimePerBatch * 0.5) {
        // Increase batch size if processing is very fast
        adaptedSize = Math.min(
          baseConfig.maxBatchSize || 100,
          Math.floor(adaptedSize * 1.1)
        );
      }
    }

    return adaptedSize;
  }

  // === Batch Error Recovery ===

  /**
   * Execute batch operation with comprehensive error recovery
   * Implements retry logic with exponential backoff and failure handling
   * 
   * @param batchOperation Function that processes a single batch
   * @param batchInfo Information about the current batch
   * @param retryConfig Retry configuration
   * @returns Result of batch operation with retry information
   */
  static async executeBatchWithRetry<T>(
    batchOperation: () => Promise<T>,
    batchInfo: { batchNumber: number; size: number },
    retryConfig: BatchRetryConfiguration
  ): Promise<{
    success: boolean;
    result?: T;
    error?: Error;
    retryCount: number;
    totalDuration: number;
  }> {
    const startTime = Date.now();
    let retryCount = 0;
    let lastError: Error | undefined;

    while (retryCount <= retryConfig.batchRetryCount) {
      try {
        const result = await batchOperation();
        const totalDuration = Date.now() - startTime;
        
        return {
          success: true,
          result,
          retryCount,
          totalDuration
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        retryCount++;
        
        console.warn(
          `[BatchProcessing] Batch ${batchInfo.batchNumber} failed (attempt ${retryCount}/${retryConfig.batchRetryCount + 1}):`,
          lastError.message
        );

        // Don't retry if we've reached the limit
        if (retryCount > retryConfig.batchRetryCount) {
          break;
        }

        // Calculate delay with exponential backoff
        const baseDelay = retryConfig.batchRetryDelayMs;
        const backoffMultiplier = retryConfig.retryBackoffMultiplier || 1.5;
        const delay = baseDelay * Math.pow(backoffMultiplier, retryCount - 1);
        
        console.log(`[BatchProcessing] Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    const totalDuration = Date.now() - startTime;
    return {
      success: false,
      error: lastError,
      retryCount,
      totalDuration
    };
  }

  // === Batch Progress Management ===

  /**
   * Create a new batch progress tracker
   * Initializes progress tracking for a batch processing session
   * 
   * @param sessionId Unique identifier for the session
   * @param totalBatches Total number of batches in the session
   * @param config Configuration used for the session
   * @returns Initial batch progress object
   */
  static createBatchProgress(
    sessionId: string,
    totalBatches: number,
    config: any
  ): BatchProgress {
    return {
      sessionId,
      timestamp: Date.now(),
      completedBatches: [],
      pendingBatches: Array.from({ length: totalBatches }, (_, i) => ({
        batchNumber: i + 1,
        range: { startPage: 0, endPage: 0 }, // Will be updated with actual ranges
        estimatedItems: 0
      })),
      totalCollected: 0,
      config: CrawlingUtils.deepClone(config)
    };
  }

  /**
   * Update batch progress with completed batch information
   * Records completion of a batch and updates overall progress
   * 
   * @param progress Current progress object
   * @param completedBatch Information about the completed batch
   * @returns Updated progress object
   */
  static updateBatchProgress(
    progress: BatchProgress,
    completedBatch: CompletedBatch
  ): BatchProgress {
    const updatedProgress = CrawlingUtils.deepClone(progress);
    updatedProgress.timestamp = Date.now();
    updatedProgress.completedBatches.push(completedBatch);
    updatedProgress.totalCollected += completedBatch.itemsCollected;
    
    // Remove from pending batches
    updatedProgress.pendingBatches = updatedProgress.pendingBatches.filter(
      batch => batch.batchNumber !== completedBatch.batchNumber
    );

    return updatedProgress;
  }

  /**
   * Calculate comprehensive batch metrics
   * Provides detailed information about batch processing performance
   * 
   * @param progress Current batch progress
   * @param startTime Session start time
   * @returns Comprehensive batch metrics
   */
  static calculateBatchMetrics(
    progress: BatchProgress,
    startTime: number
  ): BatchMetrics {
    const completedBatches = progress.completedBatches;
    const currentBatch = completedBatches.length + 1;
    const totalBatches = completedBatches.length + progress.pendingBatches.length;
    
    const totalItemsProcessed = progress.totalCollected;
    const averageItemsPerBatch = completedBatches.length > 0 
      ? totalItemsProcessed / completedBatches.length 
      : 0;

    const totalDuration = completedBatches.reduce((sum, batch) => sum + batch.duration, 0);
    const averageTimePerBatch = completedBatches.length > 0 
      ? totalDuration / completedBatches.length 
      : 0;

    const estimatedTotalItems = averageItemsPerBatch > 0 
      ? Math.round(averageItemsPerBatch * totalBatches) 
      : 0;

    const estimatedRemainingTime = averageTimePerBatch > 0 && progress.pendingBatches.length > 0
      ? averageTimePerBatch * progress.pendingBatches.length
      : undefined;

    return {
      currentBatch,
      totalBatches,
      currentBatchItems: 0, // Would need to be updated during active processing
      totalItemsProcessed,
      estimatedTotalItems,
      averageItemsPerBatch,
      averageTimePerBatch,
      estimatedRemainingTime
    };
  }

  // === Batch Resource Management ===

  /**
   * Calculate optimal batch delay based on system load
   * Adjusts delays dynamically based on system performance
   * 
   * @param baseDelayMs Base delay in milliseconds
   * @param metrics Current batch metrics
   * @param systemLoad Optional system load factor (0-1)
   * @returns Optimized delay in milliseconds
   */
  static calculateOptimalBatchDelay(
    baseDelayMs: number,
    metrics: BatchMetrics,
    systemLoad: number = 0.5
  ): number {
    let adjustedDelay = baseDelayMs;

    // Adjust based on system load
    if (systemLoad > 0.8) {
      adjustedDelay = Math.min(baseDelayMs * 2, 10000); // Max 10 seconds
    } else if (systemLoad < 0.3) {
      adjustedDelay = Math.max(baseDelayMs * 0.5, 500); // Min 0.5 seconds
    }

    // Adjust based on processing speed
    if (metrics.averageTimePerBatch > 0) {
      const targetTimePerBatch = 30000; // 30 seconds
      const speedRatio = metrics.averageTimePerBatch / targetTimePerBatch;
      
      if (speedRatio > 2) {
        // Very slow processing, increase delay
        adjustedDelay = Math.min(adjustedDelay * 1.5, 10000);
      } else if (speedRatio < 0.5) {
        // Very fast processing, can reduce delay
        adjustedDelay = Math.max(adjustedDelay * 0.8, 500);
      }
    }

    return Math.round(adjustedDelay);
  }

  /**
   * Generate comprehensive batch processing report
   * Creates detailed analysis of batch processing performance
   * 
   * @param progress Final batch progress
   * @param startTime Session start time
   * @param endTime Session end time
   * @returns Detailed batch processing report
   */
  static generateBatchReport(
    progress: BatchProgress,
    startTime: number,
    endTime: number
  ): {
    summary: {
      totalBatches: number;
      successfulBatches: number;
      failedBatches: number;
      totalItems: number;
      totalDuration: number;
      averageTimePerBatch: number;
      averageItemsPerBatch: number;
      successRate: number;
    };
    performance: {
      fastestBatch: CompletedBatch | null;
      slowestBatch: CompletedBatch | null;
      mostProductiveBatch: CompletedBatch | null;
      leastProductiveBatch: CompletedBatch | null;
    };
    recommendations: string[];
  } {
    const completedBatches = progress.completedBatches;
    const totalDuration = endTime - startTime;
    const batchDurations = completedBatches.map(b => b.duration);
    const batchItems = completedBatches.map(b => b.itemsCollected);

    const summary = {
      totalBatches: completedBatches.length + progress.pendingBatches.length,
      successfulBatches: completedBatches.length,
      failedBatches: progress.pendingBatches.length,
      totalItems: progress.totalCollected,
      totalDuration,
      averageTimePerBatch: batchDurations.length > 0 
        ? batchDurations.reduce((a, b) => a + b, 0) / batchDurations.length 
        : 0,
      averageItemsPerBatch: batchItems.length > 0 
        ? batchItems.reduce((a, b) => a + b, 0) / batchItems.length 
        : 0,
      successRate: completedBatches.length / (completedBatches.length + progress.pendingBatches.length)
    };

    const performance = {
      fastestBatch: batchDurations.length > 0 
        ? completedBatches[batchDurations.indexOf(Math.min(...batchDurations))] 
        : null,
      slowestBatch: batchDurations.length > 0 
        ? completedBatches[batchDurations.indexOf(Math.max(...batchDurations))] 
        : null,
      mostProductiveBatch: batchItems.length > 0 
        ? completedBatches[batchItems.indexOf(Math.max(...batchItems))] 
        : null,
      leastProductiveBatch: batchItems.length > 0 
        ? completedBatches[batchItems.indexOf(Math.min(...batchItems))] 
        : null
    };

    const recommendations: string[] = [];
    
    if (summary.averageTimePerBatch > 60000) { // > 1 minute
      recommendations.push("Consider reducing batch size to improve processing speed");
    }
    
    if (summary.successRate < 0.9) {
      recommendations.push("High failure rate detected - consider improving error handling or reducing batch size");
    }
    
    if (performance.slowestBatch && performance.fastestBatch) {
      const timeDifference = performance.slowestBatch.duration / performance.fastestBatch.duration;
      if (timeDifference > 3) {
        recommendations.push("Large variance in batch processing times - consider adaptive batch sizing");
      }
    }

    return { summary, performance, recommendations };
  }

  // === Utility Methods ===

  /**
   * Validate batch configuration
   * Ensures batch configuration values are within acceptable ranges
   * 
   * @param config Batch configuration to validate
   * @returns Validation result with any adjustments made
   */
  static validateBatchConfiguration(
    config: BatchConfiguration
  ): { isValid: boolean; adjustedConfig: BatchConfiguration; warnings: string[] } {
    const warnings: string[] = [];
    const adjustedConfig = CrawlingUtils.deepClone(config);

    // Validate batch size
    if (adjustedConfig.batchSize <= 0) {
      adjustedConfig.batchSize = 30;
      warnings.push("Batch size must be positive, reset to default (30)");
    }

    if (adjustedConfig.batchSize > 200) {
      adjustedConfig.batchSize = 200;
      warnings.push("Batch size too large, limited to 200");
    }

    // Validate delay
    if (adjustedConfig.batchDelayMs < 0) {
      adjustedConfig.batchDelayMs = 0;
      warnings.push("Batch delay cannot be negative, reset to 0");
    }

    if (adjustedConfig.batchDelayMs > 30000) {
      adjustedConfig.batchDelayMs = 30000;
      warnings.push("Batch delay too long, limited to 30 seconds");
    }

    // Validate min/max batch sizes
    if (adjustedConfig.minBatchSize && adjustedConfig.minBatchSize > adjustedConfig.batchSize) {
      adjustedConfig.minBatchSize = adjustedConfig.batchSize;
      warnings.push("Minimum batch size cannot be larger than batch size");
    }

    if (adjustedConfig.maxBatchSize && adjustedConfig.maxBatchSize < adjustedConfig.batchSize) {
      adjustedConfig.maxBatchSize = adjustedConfig.batchSize;
      warnings.push("Maximum batch size cannot be smaller than batch size");
    }

    return {
      isValid: warnings.length === 0,
      adjustedConfig,
      warnings
    };
  }

  /**
   * Format batch progress for display
   * Creates human-readable progress information
   * 
   * @param metrics Current batch metrics
   * @param includeETA Whether to include estimated time remaining
   * @returns Formatted progress string
   */
  static formatBatchProgress(
    metrics: BatchMetrics,
    includeETA: boolean = true
  ): string {
    const batchText = `배치 ${metrics.currentBatch}/${metrics.totalBatches}`;
    const itemsText = `${metrics.totalItemsProcessed.toLocaleString()} 항목 처리됨`;
    
    let progressText = `${batchText} - ${itemsText}`;
    
    if (includeETA && metrics.estimatedRemainingTime) {
      const etaText = `(예상 남은 시간: ${TimeUtils.formatDuration(metrics.estimatedRemainingTime)})`;
      progressText += ` ${etaText}`;
    }

    return progressText;
  }
}
