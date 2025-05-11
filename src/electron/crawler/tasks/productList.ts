/**
 * productList.ts
 * 제품 목록 수집을 담당하는 클래스
 */

import { type Page, type BrowserContext } from 'playwright-chromium';
// import { getDatabaseSummaryFromDb } from '../../database.js';

import { CrawlerState } from '../core/CrawlerState.js';
import {
  promisePool, updateTaskStatus, initializeTaskStates,
} from '../utils/concurrency.js';

import type { CrawlResult, CrawlError } from '../utils/types.js';
import type { Product, PageProcessingStatusItem, CrawlingProgress as FullCrawlingProgress, PageProcessingStatusValue } from '../../../../types.js';
import { debugLog } from '../../util.js';
import { type CrawlerConfig } from '../core/config.js';
import { crawlerEvents, updateRetryStatus, logRetryError, CRAWLING_PHASES, CRAWLING_STAGE } from '../utils/progress.js';
import { PageIndexManager } from '../utils/page-index-manager.js';
import { BrowserManager } from '../browser/BrowserManager.js'; // Corrected path
import { delay } from '../utils/delay.js';

// --- 사용자 정의 오류 클래스 --- 
class PageOperationError extends Error {
  constructor(message: string, public pageNumber: number, public attempt?: number) {
    super(message);
    this.name = this.constructor.name;
  }
}
class PageTimeoutError extends PageOperationError { readonly type = 'Timeout'; }
class PageAbortedError extends PageOperationError { readonly type = 'Abort'; }
class PageNavigationError extends PageOperationError { readonly type = 'Navigation'; }
class PageContentExtractionError extends PageOperationError { readonly type = 'Extraction'; }
class PageInitializationError extends PageOperationError { readonly type = 'Initialization'; }
// --- 사용자 정의 오류 클래스 끝 ---

// 캐시
let cachedTotalPages: number | null = null;
let cachedTotalPagesFetchedAt: number | null = null;

// 진행 상황 콜백 타입 정의
export type EnhancedProgressCallback = (
  processedSuccessfully: number, // Successfully completed pages
  totalPagesInStage: number, // Total pages specifically for this stage 1 collection
  stage1PageStatuses: PageProcessingStatusItem[],
  currentOverallRetryCountForStage: number, // Overall retries for stage 1
  stage1StartTime: number, // Start time of the current stage 1 processing
  isStageComplete?: boolean 
) => void;

// page.evaluate가 반환하는 원시 데이터 타입
interface RawProductData {
  url: string;
  manufacturer?: string;
  model?: string;
  certificateId?: string;
  siteIndexInPage: number; // DOM 순서 기반 인덱스
}

export class ProductListCollector {
  private state: CrawlerState;
  private abortController: AbortController;
  private enhancedProgressCallback: EnhancedProgressCallback | null = null;
  private processedPagesSuccessfully: number = 0; 
  private readonly config: CrawlerConfig;
  private readonly browserManager: BrowserManager; 

  private static lastPageProductCount: number | null = null;
  private productCache: Map<number, Product[]>;
  
  // New members for detailed stage 1 progress
  private stage1PageStatuses: PageProcessingStatusItem[] = [];
  private currentStageRetryCount: number = 0; // Tracks the number of retry *cycles* for the stage
  private totalPagesForThisStage1Collection: number = 0; // Number of pages being attempted in current collect() call
  private stage1StartTime: number = 0;

  constructor(state: CrawlerState, abortController: AbortController, config: CrawlerConfig, browserManager: BrowserManager) { 
    this.state = state;
    this.abortController = abortController;
    this.config = config; 
    this.browserManager = browserManager; 
    this.productCache = new Map(); 
  }

  public setProgressCallback(callback: EnhancedProgressCallback): void { 
    this.enhancedProgressCallback = callback;
  }

  private _sendProgressUpdate(isStageComplete: boolean = false): void {
    if (this.enhancedProgressCallback) {
      this.processedPagesSuccessfully = this.stage1PageStatuses.filter(p => p.status === 'success').length;
      this.enhancedProgressCallback(
        this.processedPagesSuccessfully,
        this.totalPagesForThisStage1Collection, // Use the count of pages we are actually trying to process
        [...this.stage1PageStatuses], 
        this.currentStageRetryCount,
        this.stage1StartTime, // Pass the stage1StartTime
        isStageComplete
      );
    }
  }
  
  private _updatePageStatusInternal(pageNumber: number, newStatus: PageProcessingStatusValue, attempt?: number): void {
    const pageStatusItem = this.stage1PageStatuses.find(p => p.pageNumber === pageNumber);
    if (pageStatusItem) {
      pageStatusItem.status = newStatus;
      if (attempt !== undefined) {
        pageStatusItem.attempt = attempt;
      }
    }
  }

  // _emitPageCrawlStatus is kept for potential specific, non-animation task updates via 'crawlingTaskStatus'
  private _emitPageCrawlStatus( 
    pageNumber: number,
    status: 'success' | 'error' | 'running' | 'stopped',
    data: Record<string, any>
  ): void {
    const messagePayload: Record<string, any> = {
      stage: 1,
      type: 'page', 
      pageNumber,
      ...data 
    };
    if (status === 'running') {
      messagePayload.startTime = new Date().toISOString();
      if (data.url) messagePayload.url = data.url;
    } else {
      messagePayload.endTime = new Date().toISOString();
    }
    Object.keys(messagePayload).forEach(key => {
      if (messagePayload[key] === undefined) delete messagePayload[key];
    });
    crawlerEvents.emit('crawlingTaskStatus', {
      taskId: `page-${pageNumber}`,
      status,
      message: JSON.stringify(messagePayload)
    });
  }

  public async collect(userPageLimit: number = 0): Promise<Product[]> {
    this.productCache.clear();
    this.state.setStage('productList:init', '1단계: 제품 목록 페이지 수 파악 중');
    this.processedPagesSuccessfully = 0;
    this.currentStageRetryCount = 0;
    this.stage1PageStatuses = [];
    this.totalPagesForThisStage1Collection = 0;
    this.stage1StartTime = Date.now(); 

    try {
      const prepResult = await this._preparePageRange(userPageLimit);
      if (!prepResult || prepResult.pageNumbersToCrawl.length === 0) {
        this._sendProgressUpdate(true); 
        return []; 
      }
      // siteTotalPages is the total number of pages on the site, used for PageIndexManager
      const { totalPages: siteTotalPages, pageNumbersToCrawl, lastPageProductCount } = prepResult;
      ProductListCollector.lastPageProductCount = lastPageProductCount;
      this.totalPagesForThisStage1Collection = pageNumbersToCrawl.length; 

      this.stage1PageStatuses = pageNumbersToCrawl.map(pn => ({
        pageNumber: pn,
        status: 'waiting',
        attempt: 0
      }));
      this._sendProgressUpdate(); 

      const { incompletePages: incompletePagesAfterInitialCrawl, allPageErrors } = 
        await this._executeInitialCrawl(pageNumbersToCrawl, siteTotalPages);
      
      if (this.abortController.signal.aborted) {
        console.log('[ProductListCollector] Crawling stopped after initial list collection.');
        this._sendProgressUpdate(true); 
        return this.finalizeCollectedProducts(pageNumbersToCrawl);
      }

      if (incompletePagesAfterInitialCrawl.length > 0 && (this.config.productListRetryCount ?? 0) > 0) {
        console.log(`[ProductListCollector] ${incompletePagesAfterInitialCrawl.length} pages incomplete after initial crawl. Retrying...`);
        await this.retryFailedPages(
          incompletePagesAfterInitialCrawl,
          siteTotalPages, 
          allPageErrors
        );
      }
      
      if (this.abortController.signal.aborted) {
        console.log('[ProductListCollector] Crawling stopped during/after retries.');
        this._sendProgressUpdate(true); 
        return this.finalizeCollectedProducts(pageNumbersToCrawl);
      }

      const finalProducts = this.finalizeCollectedProducts(pageNumbersToCrawl);
      this._summarizeCollectionOutcome(pageNumbersToCrawl, siteTotalPages, allPageErrors, finalProducts);
      this._sendProgressUpdate(true); 
      return finalProducts;

    } finally {
      this.cleanupResources();
    }
  }
  
  private async _preparePageRange(userPageLimit: number): Promise<{
    totalPages: number; // Site's total pages
    pageNumbersToCrawl: number[]; // DB pageIds to crawl
    lastPageProductCount: number;
  } | null> {
    try {
      const { totalPages, lastPageProductCount } = await this.fetchTotalPagesCached(false);
      debugLog(`[ProductListCollector] Site total pages: ${totalPages}, Last page product count: ${lastPageProductCount}`);

      const { startPage, endPage } = await PageIndexManager.calculateCrawlingRange(
        totalPages, lastPageProductCount, userPageLimit
      );
      debugLog(`[ProductListCollector] Crawling range (db pageId): ${startPage} to ${endPage}`);

      const pageNumbersToCrawl = Array.from({ length: startPage - endPage + 1 }, (_, i) => endPage + i).reverse();
      debugLog(`[ProductListCollector] DB Page numbers to crawl: ${pageNumbersToCrawl.join(', ')}`);
      
      crawlerEvents.emit('crawlingTaskStatus', {
        taskId: 'list-range',
        status: 'running',
        message: JSON.stringify({
          stage: 1,
          type: 'range',
          siteTotalPages: totalPages, 
          dbCrawlingStartPageId: startPage,
          dbCrawlingEndPageId: endPage,
          pagesToCrawlCount: pageNumbersToCrawl.length,
          estimatedProductCount: pageNumbersToCrawl.length * (this.config.productsPerPage || 12), 
          lastPageProductCount
        })
      });

      if (pageNumbersToCrawl.length === 0) {
        console.log('[ProductListCollector] No new pages to crawl.');
        crawlerEvents.emit('crawlingTaskStatus', {
          taskId: 'list-range',
          status: 'success',
          message: JSON.stringify({
            stage: 1,
            type: 'range',
            message: 'DB 정보가 최신 상태입니다. 새로운 페이지가 없습니다.',
            siteTotalPages: totalPages
          })
        });
        return null;
      }
      return { totalPages, pageNumbersToCrawl, lastPageProductCount }; 
    } catch (error) {
      const crawlError: CrawlError = {
        type: 'Initialization',
        message: error instanceof Error ? error.message : 'Failed to prepare page range',
        originalError: error,
      };
      crawlerEvents.emit('crawlingTaskStatus', {
        taskId: 'list-range',
        status: 'error',
        message: JSON.stringify({ stage: 1, type: 'range', error: crawlError })
      });
      throw new Error(`Initialization failed: ${crawlError.message}`); 
    }
  }

  private async _executeInitialCrawl(pageNumbersToCrawl: number[], siteTotalPages: number): Promise<{
    incompletePages: number[];
    allPageErrors: Record<string, CrawlError[]>;
  }> {
    initializeTaskStates(pageNumbersToCrawl); 

    const incompletePages: number[] = [];
    const allPageErrors: Record<string, CrawlError[]> = {};
    const initialAttemptNumber = 1;

    debugLog(`[ProductListCollector] Starting initial crawl for ${pageNumbersToCrawl.length} pages.`);
    
    pageNumbersToCrawl.forEach(pNum => {
      this._updatePageStatusInternal(pNum, 'attempting', initialAttemptNumber);
    });
    this._sendProgressUpdate();

    const { results } = await this.executeParallelCrawling(
      pageNumbersToCrawl,
      siteTotalPages, 
      this.config.initialConcurrency ?? 5,
      initialAttemptNumber
    );

    this._processBatchResultsAndUpdateStatus(results, incompletePages, allPageErrors, initialAttemptNumber);
    return { incompletePages, allPageErrors };
  }
  
  private _processBatchResultsAndUpdateStatus(
    results: (CrawlResult | null)[],
    incompletePageListToPopulate: number[], 
    errorLog: Record<string, CrawlError[]>,
    attemptNumber: number
  ): void {
    results.forEach(result => {
      if (result) {
        const pageNumStr = result.pageNumber.toString();
        let newStatus: PageProcessingStatusValue = 'failed';

        if (result.error) {
          if (!errorLog[pageNumStr]) errorLog[pageNumStr] = [];
          errorLog[pageNumStr].push(result.error);
          newStatus = 'failed';
        } else if (!result.isComplete) {
          newStatus = 'incomplete';
        } else { 
          newStatus = 'success';
        }
        
        this._updatePageStatusInternal(result.pageNumber, newStatus, attemptNumber);

        if (newStatus === 'incomplete' || newStatus === 'failed') {
          if (!incompletePageListToPopulate.includes(result.pageNumber)) {
            incompletePageListToPopulate.push(result.pageNumber);
          }
        } else if (newStatus === 'success') {
          const index = incompletePageListToPopulate.indexOf(result.pageNumber);
          if (index > -1) incompletePageListToPopulate.splice(index, 1);
        }
      }
    });
    debugLog(`[_processBatchResultsAndUpdateStatus attempt ${attemptNumber}] Processed ${results.length} results. ${incompletePageListToPopulate.length} pages currently marked as incomplete/failed.`);
    this._sendProgressUpdate(); 
  }

  private async processPageCrawl(
    pageNumber: number, 
    siteTotalPages: number, 
    signal: AbortSignal,
    attempt: number = 1
  ): Promise<CrawlResult | null> {
    const url = `${this.config.matterFilterUrl}&paged=${pageNumber}`;
    const sitePageNumberForTargetCount = PageIndexManager.toSitePageNumber(pageNumber, siteTotalPages);
    const actualLastPageProductCount = ProductListCollector.lastPageProductCount ?? 0;
    const targetProductCount = sitePageNumberForTargetCount === 0 ? actualLastPageProductCount : (this.config.productsPerPage || 12);

    let crawlError: CrawlError | undefined;
    
    this._updatePageStatusInternal(pageNumber, 'attempting', attempt);
    this._emitPageCrawlStatus(pageNumber, 'running', { url, attempt }); 
    updateTaskStatus(pageNumber, 'running'); 

    if (signal.aborted) {
      this._updatePageStatusInternal(pageNumber, 'failed', attempt);
      updateTaskStatus(pageNumber, 'stopped');
      crawlError = { type: 'Abort', message: 'Aborted before start', pageNumber, attempt };
      const cachedProducts = this.productCache.get(pageNumber) || [];
      return {
        pageNumber, products: cachedProducts, error: crawlError,
        isComplete: cachedProducts.length >= targetProductCount
      };
    }

    let newlyFetchedProducts: Product[] = [];
    let currentProductsOnPage: Product[] = this.productCache.get(pageNumber) || [];
    let isComplete = currentProductsOnPage.length >= targetProductCount;

    try {
      newlyFetchedProducts = await Promise.race([
        this.crawlPageWithTimeout(pageNumber, siteTotalPages, signal, attempt),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new PageTimeoutError('Timeout', pageNumber, attempt)), this.config.pageTimeoutMs ?? 60000)
        )
      ]);

      const existingProductsFromCache = this.productCache.get(pageNumber) || [];
      const allProductsForPage = ProductListCollector._mergeAndDeduplicateProductLists(
        existingProductsFromCache, newlyFetchedProducts
      );
      this.productCache.set(pageNumber, allProductsForPage);
      currentProductsOnPage = allProductsForPage; 
      isComplete = currentProductsOnPage.length >= targetProductCount;

      this._updatePageStatusInternal(pageNumber, isComplete ? 'success' : 'incomplete', attempt);
      this._emitPageCrawlStatus(pageNumber, 'success', { 
        productsCount: currentProductsOnPage.length,
        newlyFetchedCount: newlyFetchedProducts.length,
        isComplete, targetCount: targetProductCount, attempt 
      });
      updateTaskStatus(pageNumber, 'success');
    } catch (err) {
      this._updatePageStatusInternal(pageNumber, 'failed', attempt);
      const finalStatusForTask = signal.aborted ? 'stopped' : 'error'; 
      if (err instanceof PageTimeoutError) {
        crawlError = { type: 'Timeout', message: err.message, pageNumber, attempt, originalError: err };
      } else if (err instanceof PageAbortedError) {
        crawlError = { type: 'Abort', message: err.message, pageNumber, attempt, originalError: err };
      } else if (err instanceof PageNavigationError) {
        crawlError = { type: 'Navigation', message: err.message, pageNumber, attempt, originalError: err };
      } else if (err instanceof PageContentExtractionError) {
        crawlError = { type: 'Extraction', message: err.message, pageNumber, attempt, originalError: err };
      } else if (err instanceof PageInitializationError) {
        crawlError = { type: 'Initialization', message: err.message, pageNumber, attempt, originalError: err };
      } else {
        crawlError = { type: 'Generic', message: err instanceof Error ? err.message : String(err), pageNumber, attempt, originalError: err };
      }
      this._emitPageCrawlStatus(pageNumber, finalStatusForTask as 'error' | 'stopped', { error: crawlError, attempt });
      updateTaskStatus(pageNumber, finalStatusForTask, crawlError.message);
      isComplete = currentProductsOnPage.length >= targetProductCount; 
    }
    
    return {
      pageNumber, products: currentProductsOnPage, error: crawlError, isComplete
    };
  }

  private async retryFailedPages(
    pagesToRetryInitially: number[],
    siteTotalPages: number, 
    failedPageErrors: Record<string, CrawlError[]>
  ): Promise<void> {
    const productListRetryCount = this.config.productListRetryCount ?? 3;
    const retryConcurrency = this.config.retryConcurrency ?? 1;

    if (productListRetryCount <= 0) {
      pagesToRetryInitially.forEach(pNum => this._updatePageStatusInternal(pNum, 'failed', 1)); 
      this._sendProgressUpdate(); 
      return;
    }

    let currentIncompletePages = [...pagesToRetryInitially]; 
    const firstRetryCycleAttemptNumber = 1; 

    for (let retryCycleIndex = 0; retryCycleIndex < productListRetryCount && currentIncompletePages.length > 0; retryCycleIndex++) {
      this.currentStageRetryCount = firstRetryCycleAttemptNumber + retryCycleIndex; 
      const overallAttemptNumberForPagesInThisCycle = 1 + this.currentStageRetryCount; 
      
      if (this.abortController.signal.aborted) {
        currentIncompletePages.forEach(pNum => this._updatePageStatusInternal(pNum, 'failed', overallAttemptNumberForPagesInThisCycle));
        this._sendProgressUpdate();
        break;
      }

      const pagesForThisRetryCycle = [...currentIncompletePages];
      currentIncompletePages.length = 0;

      pagesForThisRetryCycle.forEach(pNum => {
        this._updatePageStatusInternal(pNum, 'attempting', overallAttemptNumberForPagesInThisCycle);
      });
      this._sendProgressUpdate(); 

      updateRetryStatus('list-retry', {
        stage: 'productList',
        currentAttempt: this.currentStageRetryCount, 
        maxAttempt: productListRetryCount,
        remainingItems: pagesForThisRetryCycle.length,
        totalItems: pagesToRetryInitially.length, 
        startTime: Date.now(),
        itemIds: pagesForThisRetryCycle.map(p => p.toString())
      });
      crawlerEvents.emit('crawlingTaskStatus', {
        taskId: 'list-retry', status: 'running',
        message: `Product list retry cycle ${this.currentStageRetryCount}/${productListRetryCount} (Overall page attempt ${overallAttemptNumberForPagesInThisCycle}): ${pagesForThisRetryCycle.length} pages`
      });
      debugLog(`[RETRY] Product list cycle ${this.currentStageRetryCount}/${productListRetryCount} for pages: ${pagesForThisRetryCycle.join(', ')}`);

      const { results: retryBatchResults } = await this.executeParallelCrawling(
        pagesForThisRetryCycle,
        siteTotalPages, 
        retryConcurrency,
        overallAttemptNumberForPagesInThisCycle 
      );

      this._processBatchResultsAndUpdateStatus(
        retryBatchResults,
        currentIncompletePages, 
        failedPageErrors,       
        overallAttemptNumberForPagesInThisCycle
      );

      pagesForThisRetryCycle.forEach(pageNumberAttempted => {
        // ... (existing detailed logging for each page in retry batch)
      });
      
      updateRetryStatus('list-retry', {
        remainingItems: currentIncompletePages.length,
        itemIds: currentIncompletePages.map(p => p.toString())
      });

      if (currentIncompletePages.length === 0) {
        debugLog(`[RETRY] All product list pages successfully completed after retry cycle ${this.currentStageRetryCount}.`);
        crawlerEvents.emit('crawlingTaskStatus', {
          taskId: 'list-retry', status: 'success',
          message: `Product list retry successful after cycle ${this.currentStageRetryCount}.`
        });
        break; 
      }
    }
    
    if (currentIncompletePages.length > 0) {
       debugLog(`[RETRY] After ${this.currentStageRetryCount} retry cycles, ${currentIncompletePages.length} pages remain incomplete.`);
       crawlerEvents.emit('crawlingTaskStatus', {
        taskId: 'list-retry', status: 'error',
        message: `Product list retry finished: ${currentIncompletePages.length} pages still incomplete after ${this.currentStageRetryCount} cycles.`
      });
    } else {
      if (this.currentStageRetryCount > 0) { 
         debugLog(`[RETRY] All product list pages completed within ${this.currentStageRetryCount} retry cycles.`);
         crawlerEvents.emit('crawlingTaskStatus', {
          taskId: 'list-retry', status: 'success',
          message: 'Product list retry successful: All initially incomplete pages completed within retry cycles.'
        });
      }
    }
    this._sendProgressUpdate(); 
  }

  private _summarizeCollectionOutcome(
    pageNumbersToCrawl: number[],
    totalPages: number, 
    allPageErrors: Record<string, CrawlError[]>,
    collectedProducts: Product[]
  ): void {
    let finalFailedCount = 0;
    finalFailedCount = this.stage1PageStatuses.filter(p => p.status === 'failed' || p.status === 'incomplete').length;
    
    const successPagesCount = this.totalPagesForThisStage1Collection - finalFailedCount;
    const successRate = this.totalPagesForThisStage1Collection > 0 ? (successPagesCount / this.totalPagesForThisStage1Collection) : 1;

    console.log(`[ProductListCollector] Final collection: ${successPagesCount}/${this.totalPagesForThisStage1Collection} pages fully collected. Total products: ${collectedProducts.length}`);

    crawlerEvents.emit('crawlingTaskStatus', {
      taskId: 'list-complete', status: 'success',
      message: JSON.stringify({
        stage: 1, type: 'complete', 
        siteTotalPages: totalPages, 
        pagesAttemptedInStage: this.totalPagesForThisStage1Collection,
        successfullyCollectedPagesInStage: successPagesCount,
        collectedProducts: collectedProducts.length,
        failedOrIncompletePagesInStage: finalFailedCount,
        successRate: parseFloat((successRate * 100).toFixed(1))
      })
    });

    this.state.setStage('productList:processing', '수집된 제품 목록 처리 중');
  }

  private cleanupResources(): void {
    console.log('[ProductListCollector] Cleaning up resources...');
  }

  public async getTotalPagesCached(force = false): Promise<number> {
    const { totalPages } = await this.fetchTotalPagesCached(force);
    return totalPages;
  }

  public async fetchTotalPagesCached(force = false): Promise<{
    totalPages: number; 
    lastPageProductCount: number;
  }> {
    const now = Date.now();
    const cacheTtl = this.config.cacheTtlMs ?? 3600000;

    if (!force &&
      cachedTotalPages && 
      ProductListCollector.lastPageProductCount !== null && 
      cachedTotalPagesFetchedAt && 
      (now - cachedTotalPagesFetchedAt < cacheTtl)) {
      debugLog('[ProductListCollector] Returning cached total pages data.');
      return {
        totalPages: cachedTotalPages,
        lastPageProductCount: ProductListCollector.lastPageProductCount!
      };
    }

    debugLog(`[ProductListCollector] Fetching total pages. Force refresh: ${force}`);
    const result = await this._fetchTotalPages();
    cachedTotalPages = result.totalPages;
    ProductListCollector.lastPageProductCount = result.lastPageProductCount;
    cachedTotalPagesFetchedAt = now;
    debugLog(`[ProductListCollector] Fetched and cached new total pages data: ${result.totalPages} pages, ${result.lastPageProductCount} products on last page.`);

    return result;
  }

  private async _fetchTotalPages(): Promise<{ totalPages: number; lastPageProductCount: number }> {
    let context: BrowserContext | null = null;
    let page: Page | null = null;
    try {
      context = await this.browserManager.createContext();
      page = await this.browserManager.createPageInContext(context);
      if (!page) {
        throw new PageInitializationError('Failed to create page in new context for _fetchTotalPages', 0, 0);
      }

      if (!this.config.matterFilterUrl) {
        throw new Error('Configuration error: matterFilterUrl is not defined.');
      }
      await delay(1000); 
      debugLog(`[ProductListCollector] Navigating to ${this.config.matterFilterUrl} to fetch total pages.`);
      await page.goto(this.config.matterFilterUrl, { waitUntil: 'domcontentloaded', timeout: this.config.pageTimeoutMs ?? 60000 });
      
      const pageElements = await page.locator('div.pagination-wrapper > nav > div > a > span').all();
      let totalPages = 0;
      if (pageElements.length > 0) {
        const pageNumbers = await Promise.all(
          pageElements.map(async (el) => {
            const text = await el.textContent();
            return text ? parseInt(text.trim(), 10) : 0;
          })
        );
        totalPages = Math.max(...pageNumbers.filter(n => !isNaN(n) && n > 0), 0);
      }
      debugLog(`[ProductListCollector] Determined ${totalPages} total pages from pagination elements.`);

      let lastPageProductCount = 0;
      if (totalPages > 0) {
        const lastPageUrl = `${this.config.matterFilterUrl}&paged=${totalPages}`;
        debugLog(`[ProductListCollector] Navigating to last page: ${lastPageUrl}`);
        if (page && lastPageUrl !== page.url()) { 
          await page.goto(lastPageUrl, { waitUntil: 'domcontentloaded', timeout: this.config.pageTimeoutMs ?? 60000 });
        }

        if (page) { 
          try {
            lastPageProductCount = await page.evaluate(() => {
              return document.querySelectorAll('div.post-feed article').length;
            });
          } catch (evalError: any) {
            throw new PageContentExtractionError(`Failed to count products on last page ${totalPages}: ${evalError?.message || String(evalError)}`, totalPages, 0);
          }
          debugLog(`[ProductListCollector] Last page ${totalPages} has ${lastPageProductCount} products.`);
        }
      } else {
        debugLog(`[ProductListCollector] No pagination elements found or totalPages is 0. Checking current page for products.`);
        if (page) { 
          try {
            lastPageProductCount = await page.evaluate(() => {
              return document.querySelectorAll('div.post-feed article').length;
            });
          } catch (evalError: any) {
            throw new PageContentExtractionError(`Failed to count products on initial page (no pagination): ${evalError?.message || String(evalError)}`, 1, 0);
          }

          if (lastPageProductCount > 0) {
            totalPages = 1;
            debugLog(`[ProductListCollector] Found ${lastPageProductCount} products on the first page. Setting totalPages to 1.`);
          } else {
            debugLog(`[ProductListCollector] No products found on the first page. Setting totalPages to 0.`);
          }
        }
      }
      return { totalPages, lastPageProductCount };
    } catch (error: unknown) {
      if (error instanceof PageOperationError) {
        console.error(`[ProductListCollector] Error getting total pages: ${error.message}`, error);
        throw error;
      }
      console.error('[ProductListCollector] Generic error getting total pages:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new PageInitializationError(`Failed to get total pages: ${errorMessage}`, 0, 0);
    } finally {
      if (page) { // page might be null if createContext failed
        try {
          await this.browserManager.closePageAndContext(page); 
        } catch (e) {
          console.error("[ProductListCollector] Error releasing page and context in _fetchTotalPages:", e);
        }
      } else if (context) { // If page creation failed but context was made
         try {
            await context.close(); 
         } catch (e) {
            console.error("[ProductListCollector] Error releasing context in _fetchTotalPages:", e);
         }
      }
    }
  }

  private async executeParallelCrawling(
    pageNumbersToCrawl: number[],
    siteTotalPages: number, 
    concurrency: number,
    currentAttemptNumber: number
  ): Promise<{ results: (CrawlResult | null)[] }> {
    const results: (CrawlResult | null)[] = await promisePool(
      pageNumbersToCrawl,
      async (pageNumber, signalFromPool) => { 
        return this.processPageCrawl(
          pageNumber, siteTotalPages, signalFromPool, currentAttemptNumber
        );
      },
      concurrency,
      this.abortController 
    );
    return { results };
  }
  
  private static _extractProductsFromPageDOM(): RawProductData[] {
    const articles = Array.from(document.querySelectorAll('div.post-feed article'));
    return articles.reverse().map((article, siteIndexInPage) => { 
      const link = article.querySelector('a');
      const manufacturerEl = article.querySelector('p.entry-company.notranslate');
      const modelEl = article.querySelector('h3.entry-title');
      const certificateIdEl = article.querySelector('span.entry-cert-id');
      const certificateIdPEl = article.querySelector('p.entry-certificate-id');
      let certificateId;

      if (certificateIdPEl && certificateIdPEl.textContent) {
        const text = certificateIdPEl.textContent.trim();
        if (text.startsWith('Certificate ID: ')) {
          certificateId = text.replace('Certificate ID: ', '').trim();
        } else {
          certificateId = text;
        }
      } else if (certificateIdEl && certificateIdEl.textContent) {
        certificateId = certificateIdEl.textContent.trim();
      }

      return {
        url: link && link.href ? link.href : '',
        manufacturer: manufacturerEl ? manufacturerEl.textContent?.trim() : undefined,
        model: modelEl ? modelEl.textContent?.trim() : undefined,
        certificateId,
        siteIndexInPage 
      };
    });
  }

  private _mapRawProductsToProducts(
    rawProducts: RawProductData[],
    sitePageNumber: number, 
    offset: number 
  ): Product[] {
    return rawProducts.map((product) => {
      const { siteIndexInPage } = product; 
      const { pageId, indexInPage } = PageIndexManager.mapToLocalIndexing(
        sitePageNumber, 
        siteIndexInPage, 
        offset
      );
      const { siteIndexInPage: _, ...rest } = product;
      return {
        ...rest,
        pageId, 
        indexInPage 
      };
    });
  }

  private static _mergeAndDeduplicateProductLists(
    existingProducts: Product[],
    newProducts: Product[]
  ): Product[] {
    const productMap = new Map<string, Product>();
    
    for (const product of existingProducts) { 
      if (product.url) {
        productMap.set(product.url, product);
      }
    }
    for (const product of newProducts) { 
      if (product.url) {
        productMap.set(product.url, product);
      }
    }
    const mergedProducts = Array.from(productMap.values());
    mergedProducts.sort((a, b) => {
      if ((a.pageId ?? -1) === (b.pageId ?? -1)) {
        return (a.indexInPage ?? -1) - (b.indexInPage ?? -1);
      }
      return (a.pageId ?? -1) - (b.pageId ?? -1);
    });
    return mergedProducts;
  }

  private finalizeCollectedProducts(pageNumbersToCrawl: number[]): Product[] {
    let allCollectedProducts: Product[] = [];
    const sortedPageNumbers = [...pageNumbersToCrawl].sort((a, b) => a - b);

    for (const pageNum of sortedPageNumbers) {
      const productsOnPage = this.productCache.get(pageNum) || [];
      allCollectedProducts.push(...productsOnPage);
    }
    this.productCache.clear(); 
    return allCollectedProducts;
  }

  private async crawlPageWithTimeout(
    pageNumber: number, 
    siteTotalPages: number, 
    signal: AbortSignal,
    attempt: number
  ): Promise<Product[]> {
    if (signal.aborted) {
      throw new PageAbortedError('Aborted before crawlPageWithTimeout call', pageNumber, attempt);
    }

    const pageUrl = `${this.config.matterFilterUrl}&paged=${pageNumber}`; 
    const timeout = this.config.pageTimeoutMs ?? 60000;

    let context: BrowserContext | null = null;
    let page: Page | null = null;

    try {
      context = await this.browserManager.createContext();
      page = await this.browserManager.createPageInContext(context);
      if (!page) {
        throw new PageInitializationError('Failed to create page in new context', pageNumber, attempt);
      }

      if (attempt > 1) { 
        await delay(this.config.minRequestDelayMs ?? 500);
      }
      await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout });

      const rawProducts = await page.evaluate<RawProductData[]>(
        ProductListCollector._extractProductsFromPageDOM
      );
      
      const { totalPages: siteTotal, lastPageProductCount: siteLastPageCount } = await this.fetchTotalPagesCached(); 
      const sitePageNumber = PageIndexManager.toSitePageNumber(pageNumber, siteTotal);
      const offset = PageIndexManager.calculateOffset(siteLastPageCount);

      const products = this._mapRawProductsToProducts(rawProducts, sitePageNumber, offset);
      return products;

    } catch (error: unknown) {
      if (error instanceof PageOperationError) throw error; 
      
      if (error instanceof Error) {
        if (error.name === 'TimeoutError') { 
          throw new PageTimeoutError(`Page ${pageNumber} timed out after ${timeout}ms on attempt ${attempt}. URL: ${pageUrl}`, pageNumber, attempt);
        }
        throw new PageOperationError(`Error crawling page ${pageNumber} (attempt ${attempt}): ${error.message}. URL: ${pageUrl}`, pageNumber, attempt);
      }
      throw new PageOperationError(`Unknown error crawling page ${pageNumber} (attempt ${attempt}). URL: ${pageUrl}`, pageNumber, attempt);
    } finally {
      if (page) {
        await this.browserManager.closePageAndContext(page);
      } else if (context) {
        await context.close();
      }
    }
  }
}