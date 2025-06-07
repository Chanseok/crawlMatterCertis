/**
 * gap-batch-processor.ts
 * Gap Detection batch processing system using CrawlerEngine Stage 1-2-3 workflow
 */

import { GapDetector, type GapDetectionResult, type CrawlingPageRange } from "./gap-detector.js";
import { CrawlerEngine } from "./core/CrawlerEngine.js";
import { crawlerEvents, CRAWLING_STAGE } from "./utils/progress.js";
import { logger } from "../../shared/utils/Logger.js";
import type { CrawlerConfig } from "../../../types.js";

/**
 * Gap Collection result
 */
export interface GapCollectionResult {
  collected: number;
  failed: number;
  skipped: number;
  collectedPages: number[];
  failedPages: number[];
  errors: string[];
}

/**
 * Gap Collection batch information
 */
export interface GapBatchInfo {
  batchNumber: number;
  totalBatches: number;
  crawlingRange: { startPage: number; endPage: number };
  estimatedProductCount: number;
  description: string;
}

/**
 * Gap Collection progress information
 */
export interface GapCollectionProgress {
  currentBatch: number;
  totalBatches: number;
  currentStage: 'detection' | 'collection';
  message: string;
  collectedProducts: number;
  totalMissingProducts: number;
  completionPercentage: number;
}

/**
 * Gap Detection batch processor using CrawlerEngine workflow
 */
class GapBatchProcessor {
  private crawlerEngine: CrawlerEngine;
  private abortController: AbortController | null = null;
  private isProcessing: boolean = false;

  constructor() {
    this.crawlerEngine = new CrawlerEngine();
  }

  /**
   * Execute Gap Collection using CrawlerEngine Stage 1-2-3 workflow
   * Process derived crawling ranges in batches
   */
  public async executeGapCollectionInBatches(config: CrawlerConfig): Promise<{
    success: boolean;
    gapResult: GapDetectionResult | null;
    collectionResult: GapCollectionResult | null;
    error?: string;
  }> {
    if (this.isProcessing) {
      return {
        success: false,
        gapResult: null,
        collectionResult: null,
        error: "Gap Collection is already in progress."
      };
    }

    this.isProcessing = true;
    this.abortController = new AbortController();

    try {
      logger.info("[GapBatchProcessor] Starting Gap Collection batch processing", "GapBatchProcessor");

      // Step 1: Execute Gap Detection
      const gapResult = await this.executeGapDetection();
      if (!gapResult) {
        throw new Error("Gap Detection failed");
      }

      // Step 2: Process batches using derived crawling ranges
      const collectionResult = await this.executeGapCollectionWithDerivedRanges(gapResult, config);

      logger.info("[GapBatchProcessor] Gap Collection batch processing completed", "GapBatchProcessor");

      return {
        success: true,
        gapResult,
        collectionResult
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("[GapBatchProcessor] Error during Gap Collection batch processing", "GapBatchProcessor", error instanceof Error ? error : new Error(String(error)));
      
      return {
        success: false,
        gapResult: null,
        collectionResult: null,
        error: errorMessage
      };
    } finally {
      this.isProcessing = false;
      this.abortController = null;
    }
  }

  /**
   * Execute Gap Detection
   */
  private async executeGapDetection(): Promise<GapDetectionResult | null> {
    try {
      // Update UI progress
      this.emitProgress({
        currentBatch: 1,
        totalBatches: 4,
        currentStage: 'detection',
        message: 'Executing Gap Detection...',
        collectedProducts: 0,
        totalMissingProducts: 0,
        completionPercentage: 0
      });

      logger.info("[GapBatchProcessor] Starting Gap Detection", "GapBatchProcessor");

      // Execute Gap Detection
      const gapResult = await GapDetector.detectMissingProducts();

      if (!gapResult || gapResult.totalMissingProducts === 0) {
        logger.info("[GapBatchProcessor] No missing products found", "GapBatchProcessor");
        
        this.emitProgress({
          currentBatch: 1,
          totalBatches: 1,
          currentStage: 'detection',
          message: 'No missing products found',
          collectedProducts: 0,
          totalMissingProducts: 0,
          completionPercentage: 100
        });

        return gapResult;
      }

      logger.info(`[GapBatchProcessor] Gap Detection completed: ${gapResult.totalMissingProducts} missing products`, "GapBatchProcessor");
      
      // Generate derived crawling ranges
      const derivedRanges = this.generateDerivedCrawlingRanges(gapResult);
      gapResult.crawlingRanges = derivedRanges;
      gapResult.batchInfo = this.calculateBatchInfo(derivedRanges);

      return gapResult;

    } catch (error) {
      logger.error("[GapBatchProcessor] Error during Gap Detection", "GapBatchProcessor", error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Execute Gap Collection using derived ranges
   */
  private async executeGapCollectionWithDerivedRanges(
    gapResult: GapDetectionResult, 
    config: CrawlerConfig
  ): Promise<GapCollectionResult> {
    try {
      const derivedRanges = gapResult.crawlingRanges;
      const totalBatches = derivedRanges.length;
      
      logger.info(`[GapBatchProcessor] Starting Gap Collection with ${totalBatches} batches`, "GapBatchProcessor");

      const overallResult: GapCollectionResult = {
        collected: 0,
        failed: 0,
        skipped: 0,
        collectedPages: [],
        failedPages: [],
        errors: []
      };

      // Process each crawling range as a batch
      for (let i = 0; i < derivedRanges.length; i++) {
        if (this.abortController?.signal.aborted) {
          logger.info("[GapBatchProcessor] Gap Collection aborted", "GapBatchProcessor");
          break;
        }

        const range = derivedRanges[i];
        const batchNumber = i + 1;

        // Update UI progress
        this.emitProgress({
          currentBatch: batchNumber + 1,
          totalBatches: totalBatches + 1,
          currentStage: 'collection',
          message: `Batch ${batchNumber}/${totalBatches}: Collecting pages ${range.startPage}-${range.endPage}...`,
          collectedProducts: overallResult.collected,
          totalMissingProducts: gapResult.totalMissingProducts,
          completionPercentage: Math.round((batchNumber / totalBatches) * 100)
        });

        logger.info(`[GapBatchProcessor] Starting batch ${batchNumber}/${totalBatches}: pages ${range.startPage}-${range.endPage}`, "GapBatchProcessor");

        try {
          // Execute crawling batch through CrawlerEngine
          const batchResult = await this.executeCrawlingBatch(range, config);
          
          // Aggregate results
          overallResult.collected += batchResult.collected;
          overallResult.failed += batchResult.failed;
          overallResult.skipped += batchResult.skipped;
          overallResult.collectedPages.push(...batchResult.collectedPages);
          overallResult.failedPages.push(...batchResult.failedPages);
          overallResult.errors.push(...batchResult.errors);

          logger.info(`[GapBatchProcessor] Batch ${batchNumber} completed: collected=${batchResult.collected}, failed=${batchResult.failed}`, "GapBatchProcessor");

          // Delay between batches (except for the last batch)
          if (i < derivedRanges.length - 1) {
            const batchDelay = config.batchDelayMs || 2000;
            logger.info(`[GapBatchProcessor] Waiting ${batchDelay}ms before next batch...`, "GapBatchProcessor");
            await new Promise(resolve => setTimeout(resolve, batchDelay));
          }

        } catch (error) {
          const errorMessage = `Batch ${batchNumber} processing error: ${error instanceof Error ? error.message : String(error)}`;
          logger.error(`[GapBatchProcessor] ${errorMessage}`, "GapBatchProcessor");
          overallResult.errors.push(errorMessage);
          overallResult.failed += range.endPage - range.startPage + 1;
        }
      }

      // Final progress update
      this.emitProgress({
        currentBatch: totalBatches + 1,
        totalBatches: totalBatches + 1,
        currentStage: 'collection',
        message: `Gap Collection completed: ${overallResult.collected} products collected`,
        collectedProducts: overallResult.collected,
        totalMissingProducts: gapResult.totalMissingProducts,
        completionPercentage: 100
      });

      logger.info(`[GapBatchProcessor] Gap Collection completed: collected=${overallResult.collected}, failed=${overallResult.failed}`, "GapBatchProcessor");
      
      return overallResult;

    } catch (error) {
      logger.error("[GapBatchProcessor] Error during Gap Collection", "GapBatchProcessor", error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Execute crawling batch for specific range using CrawlerEngine
   */
  private async executeCrawlingBatch(
    range: { startPage: number; endPage: number }, 
    config: CrawlerConfig
  ): Promise<GapCollectionResult> {
    try {
      // Create batch configuration for this range
      const batchConfig: CrawlerConfig = {
        ...config,
        pageRangeLimit: range.endPage - range.startPage + 1,
        enableBatchProcessing: false,
        // Ensure matterFilterUrl is set
        matterFilterUrl: config.matterFilterUrl || 'https://csa-iot.org/csa-iot_products/?p_keywords=&p_type%5B%5D=14&p_program_type%5B%5D=1049&p_certificate=&p_family=&p_firmware_ver='
      };

      // Execute crawling through CrawlerEngine
      const crawlingSuccess = await this.crawlerEngine.startCrawling(batchConfig);
      
      if (crawlingSuccess) {
        // Success case - generate result (should get more detailed info from CrawlerEngine)
        const pageCount = range.endPage - range.startPage + 1;
        const estimatedProductCount = pageCount * 30;
        
        return {
          collected: estimatedProductCount,
          failed: 0,
          skipped: 0,
          collectedPages: Array.from({ length: pageCount }, (_, i) => range.startPage + i),
          failedPages: [],
          errors: []
        };
      } else {
        // Failure case
        const pageCount = range.endPage - range.startPage + 1;
        return {
          collected: 0,
          failed: pageCount * 30,
          skipped: 0,
          collectedPages: [],
          failedPages: Array.from({ length: pageCount }, (_, i) => range.startPage + i),
          errors: [`Crawling range ${range.startPage}-${range.endPage} processing failed`]
        };
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const pageCount = range.endPage - range.startPage + 1;
      
      return {
        collected: 0,
        failed: pageCount * 30,
        skipped: 0,
        collectedPages: [],
        failedPages: Array.from({ length: pageCount }, (_, i) => range.startPage + i),
        errors: [`Crawling batch execution error: ${errorMessage}`]
      };
    }
  }

  /**
   * Generate derived crawling ranges based on Gap Detection results
   */
  private generateDerivedCrawlingRanges(gapResult: GapDetectionResult): CrawlingPageRange[] {
    const missingPageIds = gapResult.missingPages.map(page => page.pageId);
    
    if (missingPageIds.length === 0) {
      return [];
    }

    // Sort pageIds
    const sortedPageIds = [...missingPageIds].sort((a, b) => a - b);
    
    // Group consecutive pages into CrawlingPageRange
    const ranges: CrawlingPageRange[] = [];
    let currentRangeStart = sortedPageIds[0];
    let currentRangeEnd = sortedPageIds[0];
    let currentMissingPageIds = [sortedPageIds[0]];
    
    for (let i = 1; i < sortedPageIds.length; i++) {
      const currentPageId = sortedPageIds[i];
      const previousPageId = sortedPageIds[i - 1];
      
      // Check if pages are consecutive (difference <= 1)
      if (currentPageId - previousPageId <= 1) {
        currentRangeEnd = currentPageId;
        currentMissingPageIds.push(currentPageId);
      } else {
        // Start new range
        ranges.push({
          startPage: currentRangeStart,
          endPage: currentRangeEnd,
          missingPageIds: currentMissingPageIds,
          reason: `Pages ${currentRangeStart}-${currentRangeEnd} gap collection`,
          priority: 1,
          estimatedProducts: currentMissingPageIds.length * 20
        });
        currentRangeStart = currentPageId;
        currentRangeEnd = currentPageId;
        currentMissingPageIds = [currentPageId];
      }
    }
    
    // Add final range
    ranges.push({
      startPage: currentRangeStart,
      endPage: currentRangeEnd,
      missingPageIds: currentMissingPageIds,
      reason: `Pages ${currentRangeStart}-${currentRangeEnd} gap collection`,
      priority: 1,
      estimatedProducts: currentMissingPageIds.length * 20
    });

    // Split large ranges into smaller batches if needed
    const maxBatchSize = 5;
    const refinedRanges: CrawlingPageRange[] = [];
    
    for (const range of ranges) {
      const rangeSize = range.endPage - range.startPage + 1;
      
      if (rangeSize <= maxBatchSize) {
        refinedRanges.push(range);
      } else {
        // Split large range into multiple batches
        let currentStart = range.startPage;
        const rangeMissingPageIds = range.missingPageIds;
        
        while (currentStart <= range.endPage) {
          const currentEnd = Math.min(range.endPage, currentStart + maxBatchSize - 1);
          const batchMissingPageIds = rangeMissingPageIds.filter(id => id >= currentStart && id <= currentEnd);
          
          refinedRanges.push({
            startPage: currentStart,
            endPage: currentEnd,
            missingPageIds: batchMissingPageIds,
            reason: `Pages ${currentStart}-${currentEnd} gap collection (batch split)`,
            priority: 1,
            estimatedProducts: batchMissingPageIds.length * 20
          });
          
          currentStart = currentEnd + 1;
        }
      }
    }

    logger.info(`[GapBatchProcessor] Generated crawling ranges: ${refinedRanges.map(r => `${r.startPage}-${r.endPage}`).join(', ')}`, "GapBatchProcessor");
    
    return refinedRanges;
  }

  /**
   * Calculate batch information
   */
  private calculateBatchInfo(ranges: CrawlingPageRange[]): {
    totalBatches: number;
    estimatedTime: number;
    recommendedConcurrency: number;
  } {
    const totalBatches = ranges.length;
    const totalPages = ranges.reduce((sum, range) => sum + (range.endPage - range.startPage + 1), 0);
    
    // Estimate 5 seconds per page + delay between batches
    const estimatedTimeMinutes = Math.ceil((totalPages * 5 + (totalBatches - 1) * 2) / 60);
    
    return {
      totalBatches,
      estimatedTime: estimatedTimeMinutes,
      recommendedConcurrency: 1
    };
  }

  /**
   * Emit progress event
   */
  private emitProgress(progress: GapCollectionProgress): void {
    // Emit event compatible with existing crawling UI
    crawlerEvents.emit('crawlingProgress', {
      currentBatch: progress.currentBatch,
      totalBatches: progress.totalBatches,
      currentStage: progress.currentStage === 'detection' ? CRAWLING_STAGE.INIT : CRAWLING_STAGE.PRODUCT_LIST,
      currentStep: progress.currentStage === 'detection' ? 'Gap Detection' : 'Gap Collection',
      message: progress.message,
      status: 'running',
      completionPercentage: progress.completionPercentage,
      // Gap Collection specific information
      gapCollectionInfo: {
        collectedProducts: progress.collectedProducts,
        totalMissingProducts: progress.totalMissingProducts,
        stage: progress.currentStage
      }
    });
  }

  /**
   * Abort Gap Collection
   */
  public abortGapCollection(): void {
    if (this.abortController && !this.abortController.signal.aborted) {
      logger.info("[GapBatchProcessor] Gap Collection abort requested", "GapBatchProcessor");
      this.abortController.abort();
    }
  }

  /**
   * Check if Gap Collection is currently running
   */
  public isGapCollectionRunning(): boolean {
    return this.isProcessing;
  }
}

// Default export
export default GapBatchProcessor;
