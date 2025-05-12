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
import type { Product, PageProcessingStatusItem, PageProcessingStatusValue } from '../../../../types.js';
import { debugLog } from '../../util.js';
import { type CrawlerConfig } from '../core/config.js';
import { crawlerEvents, updateRetryStatus  } from '../utils/progress.js';
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
  isStageComplete?: boolean,
  timeEstimate?: { // 추가된 시간 예측 정보
    estimatedTotalTimeMs: number, // 예상 총 소요 시간
    remainingTimeMs: number // 예상 남은 시간
  }
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

  // 페이지별 처리 시간 추적 변수
  private pageProcessingTimes: Map<number, number> = new Map(); // 페이지번호 -> 처리시간(ms)
  private averagePageProcessingTimeMs: number = 30000; // 현재 평균 처리 시간 (기본값 30초)
  private successfullyProcessedPagesCount: number = 0; // 시간 계산에 포함된 페이지 수
  private totalProcessingTimeMs: number = 0; // 총 처리 시간

  // Cached configuration values
  private pageTimeoutMs: number;
  private productsPerPage: number;
  private matterFilterUrl: string;

  constructor(state: CrawlerState, abortController: AbortController, config: CrawlerConfig, browserManager: BrowserManager) {
    this.state = state;
    this.abortController = abortController;
    this.config = config;
    this.browserManager = browserManager;
    this.productCache = new Map();
    
    // 자주 사용하는 설정값 미리 추출
    this.pageTimeoutMs = config.pageTimeoutMs || 60000;
    this.productsPerPage = config.productsPerPage || 12;
    this.matterFilterUrl = config.matterFilterUrl || '';
    
    // 설정에서 이전에 저장된 평균 페이지 처리 시간 로드
    if (config.averagePageProcessingTimeMs && config.averagePageProcessingTimeMs > 0) {
      this.averagePageProcessingTimeMs = config.averagePageProcessingTimeMs;
      debugLog(`[ProductListCollector] 이전 실행에서 저장된 평균 페이지 처리 시간 로드: ${this.averagePageProcessingTimeMs}ms`);
    }
  }

  public setProgressCallback(callback: EnhancedProgressCallback): void {
    this.enhancedProgressCallback = callback;
  }

  private _sendProgressUpdate(isStageComplete: boolean = false): void {
    if (this.enhancedProgressCallback) {
      this.processedPagesSuccessfully = this.stage1PageStatuses.filter(p => p.status === 'success').length;
      
      // 예상 시간 계산
      const timeEstimate = this._calculateEstimatedRemainingTime();
      
      this.enhancedProgressCallback(
        this.processedPagesSuccessfully,
        this.totalPagesForThisStage1Collection, // Use the count of pages we are actually trying to process
        [...this.stage1PageStatuses],
        this.currentStageRetryCount,
        this.stage1StartTime, // Pass the stage1StartTime
        isStageComplete,
        timeEstimate // 예상 시간 정보 추가
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
    status: PageProcessingStatusValue,
    data: Record<string, any>
  ): void {
    const messagePayload: Record<string, any> = {
      stage: 1,
      type: 'page',
      pageNumber,
      ...data
    };
    // 'running' 대신 'attempting'으로 변경 (PageProcessingStatusValue에 'running'이 없을 경우 대비)
    if (status === 'attempting') { 
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
    
    // 시간 추적 변수 초기화
    this.pageProcessingTimes.clear();
    this.totalProcessingTimeMs = 0;
    this.successfullyProcessedPagesCount = 0;

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
          estimatedProductCount: pageNumbersToCrawl.length * this.productsPerPage,
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
    // 페이지 처리 시작 시간 기록
    this._recordPageProcessingStart(pageNumber);
    
    const url = `${this.matterFilterUrl}&paged=${pageNumber}`;
    const sitePageNumberForTargetCount = PageIndexManager.toSitePageNumber(pageNumber, siteTotalPages);
    const actualLastPageProductCount = ProductListCollector.lastPageProductCount ?? 0;
    const targetProductCount = sitePageNumberForTargetCount === 0 ? actualLastPageProductCount : this.productsPerPage;

    let crawlError: CrawlError | undefined;

    this._updatePageStatusInternal(pageNumber, 'attempting', attempt);
    // 'running' 대신 'attempting'으로 변경
    this._emitPageCrawlStatus(pageNumber, 'attempting', { url, attempt }); 
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
      this._recordPageProcessingStart(pageNumber);

      newlyFetchedProducts = await Promise.race([
        this.crawlPageWithTimeout(pageNumber, siteTotalPages, signal, attempt),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new PageTimeoutError('Timeout', pageNumber, attempt)), this.pageTimeoutMs)
        )
      ]);

      const existingProductsFromCache = this.productCache.get(pageNumber) || [];
      const allProductsForPage = ProductListCollector._mergeAndDeduplicateProductLists(
        existingProductsFromCache, newlyFetchedProducts
      );
      this.productCache.set(pageNumber, allProductsForPage);
      currentProductsOnPage = allProductsForPage;
      isComplete = currentProductsOnPage.length >= targetProductCount;

      const currentProcessingStatus: PageProcessingStatusValue = isComplete ? 'success' : 'incomplete';
      this._updatePageStatusInternal(pageNumber, currentProcessingStatus, attempt);
      this._emitPageCrawlStatus(pageNumber, currentProcessingStatus, {
        productsCount: currentProductsOnPage.length,
        newlyFetchedCount: newlyFetchedProducts.length,
        isComplete, targetCount: targetProductCount, attempt
      });
      updateTaskStatus(pageNumber, isComplete ? 'success' : 'incomplete'); 
      
      // 성공한 페이지의 경우 처리 완료 시간 기록
      if (isComplete) {
        this._recordPageProcessingEnd(pageNumber);
      }
    } catch (err) {
      this._updatePageStatusInternal(pageNumber, 'failed', attempt);
      const finalStatusForTaskSignal = signal.aborted ? 'stopped' : 'error';
      
      // _emitPageCrawlStatus는 PageProcessingStatusValue를 기대하므로, 'stopped'의 경우 'failed'로 전달
      const errorStatusForEmit: PageProcessingStatusValue = finalStatusForTaskSignal === 'stopped' ? 'failed' : 'failed';

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
      this._emitPageCrawlStatus(pageNumber, errorStatusForEmit, { error: crawlError, attempt });
      updateTaskStatus(pageNumber, finalStatusForTaskSignal, crawlError.message);
      isComplete = currentProductsOnPage.length >= targetProductCount; 
    } finally {
      this._recordPageProcessingEnd(pageNumber);
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

      pagesForThisRetryCycle.forEach(() => {
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
    _pageNumbersToCrawl: number[],
    totalPages: number,
    _allPageErrors: Record<string, CrawlError[]>,
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
    
    // 페이지 처리 시간 정보 저장을 위한 이벤트 발생
    if (this.successfullyProcessedPagesCount > 0) {
      console.log(`[ProductListCollector] 평균 페이지 처리 시간: ${this.averagePageProcessingTimeMs.toFixed(2)}ms (${this.successfullyProcessedPagesCount}개 페이지)`);
      
      // averagePageProcessingTimeMs 값을 설정에 저장하기 위한 이벤트 발생
      crawlerEvents.emit('crawlingPageProcessingTime', {
        averagePageProcessingTimeMs: Math.round(this.averagePageProcessingTimeMs),
        processedPagesCount: this.successfullyProcessedPagesCount
      });
    }
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
      // debugLog('[ProductListCollector] Returning cached total pages data.');
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
    const MAX_FETCH_ATTEMPTS = 3;
    const RETRY_DELAY_MS = 2500; // 2.5 seconds delay

    for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt++) {
      let context: BrowserContext | null = null;
      let page: Page | null = null;
      try {
        debugLog(`[ProductListCollector] _fetchTotalPages - Attempt ${attempt}/${MAX_FETCH_ATTEMPTS}`);
        context = await this.browserManager.getContextFromPool();
        page = await this.browserManager.createPageInContext(context);
        if (!page) {
          throw new PageInitializationError('Failed to create page in new context for _fetchTotalPages', 0, attempt);
        }

        if (!this.matterFilterUrl) {
          throw new Error('Configuration error: matterFilterUrl is not defined.');
        }

        if (attempt > 1) {
          await delay(RETRY_DELAY_MS / 2);
        }

        debugLog(`[ProductListCollector] Navigating to ${this.matterFilterUrl} to fetch total pages (Attempt ${attempt}).`);
        await this.optimizePage(page);
        await this.optimizedNavigation(page, this.matterFilterUrl, this.pageTimeoutMs);

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
        debugLog(`[ProductListCollector] Determined ${totalPages} total pages from pagination elements (Attempt ${attempt}).`);

        let lastPageProductCount = 0;
        if (totalPages > 0) {
          const lastPageUrl = `${this.matterFilterUrl}&paged=${totalPages}`;
          debugLog(`[ProductListCollector] Navigating to last page: ${lastPageUrl} (Attempt ${attempt})`);
          if (page && lastPageUrl !== page.url()) {
            await this.optimizePage(page);
            await this.optimizedNavigation(page, lastPageUrl, this.pageTimeoutMs);
          }

          if (page) {
            try {
              lastPageProductCount = await page.evaluate(() => {
                return document.querySelectorAll('div.post-feed article').length;
              });
            } catch (evalError: any) {
              throw new PageContentExtractionError(`Failed to count products on last page ${totalPages} (Attempt ${attempt}): ${evalError?.message || String(evalError)}`, totalPages, attempt);
            }
            debugLog(`[ProductListCollector] Last page ${totalPages} has ${lastPageProductCount} products (Attempt ${attempt}).`);
          }
        } else { // totalPages is 0 or less
          debugLog(`[ProductListCollector] No pagination elements found or totalPages is 0. Checking current page for products (Attempt ${attempt}).`);
          if (page) {
            try {
              lastPageProductCount = await page.evaluate(() => {
                return document.querySelectorAll('div.post-feed article').length;
              });
            } catch (evalError: any) {
              // If counting products on the "first" page (when no pagination) fails, it's an extraction error.
              throw new PageContentExtractionError(`Failed to count products on initial page (no pagination) (Attempt ${attempt}): ${evalError?.message || String(evalError)}`, 1, attempt);
            }

            if (lastPageProductCount > 0 && totalPages <= 0) { // Products found, but no pagination indicated more pages
              totalPages = 1;
              debugLog(`[ProductListCollector] Found ${lastPageProductCount} products on the first page. Setting totalPages to 1 (Attempt ${attempt}).`);
            } else if (totalPages <= 0 && lastPageProductCount <= 0) { // Still no pages and no products
              debugLog(`[ProductListCollector] No products found on the first page and no pagination. totalPages remains 0 (Attempt ${attempt}).`);
              // This is the critical point: if totalPages is still 0, it's an error for this attempt.
              throw new PageContentExtractionError(`No pages or products found on the site (Attempt ${attempt}).`, 0, attempt);
            }
          } else { // page is null, should have been caught by PageInitializationError earlier
            throw new PageInitializationError('Page object was null when trying to count products on initial page.', 0, attempt);
          }
        }

        // After all checks, if totalPages is still not positive, it's a failure for this attempt.
        if (totalPages <= 0) {
          throw new PageContentExtractionError(`Site reported ${totalPages} pages. This is considered an error (Attempt ${attempt}).`, totalPages, attempt);
        }

        // If successful and totalPages > 0, return the result
        return { totalPages, lastPageProductCount };

      } catch (error: unknown) {
        const attemptError = error instanceof PageOperationError ? error :
          new PageOperationError(error instanceof Error ? error.message : String(error), 0, attempt);

        console.warn(`[ProductListCollector] _fetchTotalPages - Attempt ${attempt}/${MAX_FETCH_ATTEMPTS} failed: ${attemptError.message}`);

        if (attempt === MAX_FETCH_ATTEMPTS) {
          console.error(`[ProductListCollector] _fetchTotalPages - All ${MAX_FETCH_ATTEMPTS} attempts failed. Last error: ${attemptError.message}`, attemptError);
          throw new PageInitializationError(`Failed to get total pages after ${MAX_FETCH_ATTEMPTS} attempts: ${attemptError.message}`, 0, attempt);
        }
        await delay(RETRY_DELAY_MS);
      } finally {
        if (page) {
          try {
            // 페이지만 닫고 컨텍스트는 풀로 반환
            if (!page.isClosed()) {
              await page.close();
            }
            
            // 컨텍스트 풀에 반환
            if (context) {
              await this.browserManager.returnContextToPool(context);
            }
          } catch (e) {
            console.error(`[ProductListCollector] Error releasing page and context in _fetchTotalPages (Attempt ${attempt}):`, e);
          }
        } else if (context) { // If page creation failed but context was made
          try {
            // 컨텍스트 풀에 반환
            await this.browserManager.returnContextToPool(context);
          } catch (e) {
            console.error(`[ProductListCollector] Error returning context to pool in _fetchTotalPages (Attempt ${attempt}):`, e);
          }
        }
      }
    }
    throw new PageInitializationError(`Failed to get total pages after ${MAX_FETCH_ATTEMPTS} attempts (unexpectedly reached end of retry loop).`, 0, MAX_FETCH_ATTEMPTS);
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
    console.log("DOM extraction started");
    
    // 첫 번째 방법: 표준 셀렉터
    let articles = Array.from(document.querySelectorAll('div.post-feed article'));
    console.log(`Found ${articles.length} articles with standard selector`);
    
    // 대체 셀렉터 시도 (기본 셀렉터가 충분한 항목을 찾지 못한 경우)
    if (articles.length < 12) {
      // 대체 셀렉터 시도 1
      const altArticles1 = Array.from(document.querySelectorAll('.post-feed article'));
      console.log(`Found ${altArticles1.length} articles with alternative selector 1`);
      
      if (altArticles1.length > articles.length) {
        articles = altArticles1;
      }
      
      // 대체 셀렉터 시도 2
      const altArticles2 = Array.from(document.querySelectorAll('article.post'));
      console.log(`Found ${altArticles2.length} articles with alternative selector 2`);
      
      if (altArticles2.length > articles.length) {
        articles = altArticles2;
      }
    }
    
    // 페이지 분석 로그 (디버깅용)
    console.log("페이지 구조:", 
      {
        postFeedExists: !!document.querySelector('.post-feed'),
        totalArticleTags: document.querySelectorAll('article').length,
        bodyContent: document.body.innerHTML.substring(0, 300) + '...'
      }
    );

    // 추출 로직 - 더 안정적인 버전
    return articles.reverse().map((article, siteIndexInPage) => {
      // 가능한 모든 셀렉터 시도 (기본 + 대체)
      const link = article.querySelector('a') || article.querySelector('a[href]');
      const manufacturerEl = 
        article.querySelector('p.entry-company.notranslate') || 
        article.querySelector('.entry-company') || 
        article.querySelector('.manufacturer');
      const modelEl = 
        article.querySelector('h3.entry-title') || 
        article.querySelector('.entry-title') || 
        article.querySelector('h3');
      const certificateIdEl = 
        article.querySelector('span.entry-cert-id') || 
        article.querySelector('.cert-id');
      const certificateIdPEl = 
        article.querySelector('p.entry-certificate-id') || 
        article.querySelector('.certificate-id');
      
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

      // 디버깅을 위한 요소 정보 로깅
      const itemInfo = {
        url: link && link.href ? link.href : '',
        manufacturer: manufacturerEl ? manufacturerEl.textContent?.trim() : undefined,
        model: modelEl ? modelEl.textContent?.trim() : undefined,
        certificateId,
        siteIndexInPage
      };
      
      // 각 제품 아이템 로깅 (첫 5개만)
      if (siteIndexInPage < 5) {
        console.log(`Product ${siteIndexInPage + 1} info:`, itemInfo);
      }
      
      return itemInfo;
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
    _siteTotalPages: number,
    signal: AbortSignal,
    attempt: number
  ): Promise<Product[]> {
    if (signal.aborted) {
      throw new PageAbortedError('Aborted before crawlPageWithTimeout call', pageNumber, attempt);
    }

    const pageUrl = `${this.matterFilterUrl}&paged=${pageNumber}`;
    const timeout = this.pageTimeoutMs;

    let context: BrowserContext | null = null;
    let page: Page | null = null;

    try {
      // 컨텍스트 풀에서 컨텍스트 가져오기
      context = await this.browserManager.getContextFromPool();
      page = await this.browserManager.createPageInContext(context);
      if (!page) {
        throw new PageInitializationError('Failed to create page in new context', pageNumber, attempt);
      }

      if (attempt > 1) {
        await delay(this.config.minRequestDelayMs ?? 500);
      }
      await this.optimizePage(page);
      await this.optimizedNavigation(page, pageUrl, timeout);
      
      // 제품 목록 컨테이너가 완전히 로드될 때까지 대기 (최대 10초)
      await page.waitForSelector('div.post-feed article', { timeout: 10000 }).catch(e => {
        debugLog(`[ProductListCollector] Warning: Waiting for article elements timed out: ${e.message}`);
      });
      
      // 안정성을 위한 추가 대기 시간
      await delay(1000);
      
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
        // 페이지만 닫고 컨텍스트는 풀로 반환
        if (!page.isClosed()) {
          await page.close().catch(e => {
            debugLog(`[ProductListCollector] Error closing page for ${pageNumber}: ${e}`);
          });
        }
        
        // 컨텍스트가 유효하면 풀에 반환
        if (context) {
          await this.browserManager.returnContextToPool(context);
        }
      } else if (context) {
        // 페이지 생성 실패 시 컨텍스트 반환
        await this.browserManager.returnContextToPool(context);
      }
    }
  }

  // 페이지 최적화를 위한 새로운 메서드
  private async optimizePage(page: Page): Promise<void> {
    // 덜 공격적인 리소스 차단 정책 (필요한 JS 허용)
    await page.route('**/*', (route) => {
      const request = route.request();
      const resourceType = request.resourceType();
      
      // 필수 리소스 허용 목록 확장
      if (resourceType === 'document' || 
          resourceType === 'script' ||  // JavaScript 허용
          (resourceType === 'stylesheet') || // 모든 CSS 허용
          (resourceType === 'fetch' || resourceType === 'xhr')) { // AJAX 요청 허용
        route.continue();
      } else {
        // 여전히 불필요한 리소스는 차단 (이미지, 폰트, 미디어 등)
        route.abort();
      }
    });
  }

  // 개선된 네비게이션 함수
  private async optimizedNavigation(page: Page, url: string, timeout: number): Promise<boolean> {
    let navigationSucceeded = false;
    
    try {
      // 적절한 타임아웃과 네트워크 유휴 상태 추가된 네비게이션
      await page.goto(url, { 
        waitUntil: 'networkidle', // 'networkidle'은 네트워크 요청이 완료되기를 기다림
        timeout: Math.max(10000, timeout / 2) // 최소 10초 이상의 타임아웃 보장
      });
      navigationSucceeded = true;
      
      // 페이지가 제대로 로드되었는지 추가 검증
      const readyState = await page.evaluate(() => document.readyState).catch(() => 'unknown');
      debugLog(`Page ready state: ${readyState}`);
      
      // 내용이 완전히 로드될 때까지 짧게 대기 (초기 JS 실행을 위한 시간)
      await delay(500);
      
    } catch (error: any) {
      if (error && error.name === 'TimeoutError') {
        // 타임아웃 발생해도 HTML이 로드되었다면 성공으로 간주
        const readyState = await page.evaluate(() => document.readyState).catch(() => 'unknown');
        if (readyState === 'interactive' || readyState === 'complete') {
          navigationSucceeded = true;
          debugLog(`Navigation timed out but document is in '${readyState}' state. Continuing...`);
          
          // 타임아웃이 발생했지만 문서가 로드되었으면 추가 대기
          await delay(1000);
        } else {
          // 첫 시도 실패 시, 두 번째 시도 - 조금 더 긴 타임아웃과 단순한 로드 조건
          try {
            debugLog(`Retrying navigation with simpler load condition...`);
            await page.goto(url, { 
              waitUntil: 'load', // 기본 load 이벤트만 기다림
              timeout: timeout
            });
            navigationSucceeded = true;
            
            // 성공했지만 추가 대기
            await delay(500);
          } catch (secondError: any) {
            // 마지막 시도: 단순 요청 후 준비 상태 확인
            try {
              debugLog(`Final navigation attempt with basic request...`);
              await page.goto(url, { timeout });
              const finalReadyState = await page.evaluate(() => document.readyState).catch(() => 'unknown');
              
              if (finalReadyState === 'interactive' || finalReadyState === 'complete') {
                navigationSucceeded = true;
                debugLog(`Basic navigation succeeded with state: ${finalReadyState}`);
                await delay(1500); // 더 긴 대기
              } else {
                debugLog(`Navigation failed after all attempts. Final state: ${finalReadyState}`);
              }
            } catch (finalError: any) {
              debugLog(`Final navigation attempt failed: ${finalError.message}`);
            }
          }
        }
      }
    }
    
    // 네비게이션 성공 시 추가 검증
    if (navigationSucceeded) {
      try {
        // 페이지 내용 검증 (기본 구조가 있는지)
        const hasContent = await page.evaluate(() => {
          return {
            hasBody: !!document.body,
            hasPosts: !!document.querySelector('.post-feed') || 
                     !!document.querySelector('article') ||
                     !!document.querySelector('.entry-title'),
            documentHeight: document.body?.scrollHeight || 0
          };
        });
        
        debugLog(`Page content validation: ${JSON.stringify(hasContent)}`);
        
        // 콘텐츠가 너무 작거나 필요한 요소가 없으면 추가 대기
        if (!hasContent.hasPosts || hasContent.documentHeight < 500) {
          debugLog(`Page seems to be incompletely loaded, waiting additional time...`);
          await delay(2000);
        }
      } catch (e) {
        debugLog(`Error during page content validation: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    
    return navigationSucceeded;
  }

  private _recordPageProcessingStart(pageNumber: number): void {
    const pageStatusItem = this.stage1PageStatuses.find(p => p.pageNumber === pageNumber);
    if (pageStatusItem) {
      pageStatusItem.startTime = Date.now();
      // 시작할 때는 endTime과 processingTimeMs를 초기화
      pageStatusItem.endTime = undefined;
      pageStatusItem.processingTimeMs = undefined;
    }
  }

  private _recordPageProcessingEnd(pageNumber: number): void {
    const now = Date.now();
    const pageStatusItem = this.stage1PageStatuses.find(p => p.pageNumber === pageNumber);
    
    if (pageStatusItem && pageStatusItem.startTime) {
      pageStatusItem.endTime = now;
      const processingTime = now - pageStatusItem.startTime;
      pageStatusItem.processingTimeMs = processingTime;
      
      // 성공한 페이지만 평균 계산에 포함
      if (pageStatusItem.status === 'success') {
        this._updateAverageProcessingTime(pageNumber, processingTime);
      }
    }
  }

  private _updateAverageProcessingTime(pageNumber: number, processingTimeMs: number): void {
    // 이동 평균(Moving Average) 계산 - 최근 값에 더 가중치 부여
    const weight = 0.3; // 가중치 계수 (0-1 사이, 클수록 최근 값에 더 많은 가중치)
    
    this.pageProcessingTimes.set(pageNumber, processingTimeMs);
    
    // 첫 번째 성공 페이지면 그대로 설정
    if (this.successfullyProcessedPagesCount === 0) {
      this.averagePageProcessingTimeMs = processingTimeMs;
    } else {
      // 이동 평균 계산 (Exponential Moving Average)
      this.averagePageProcessingTimeMs = (
        (1 - weight) * this.averagePageProcessingTimeMs + 
        weight * processingTimeMs
      );
    }
    
    this.totalProcessingTimeMs += processingTimeMs;
    this.successfullyProcessedPagesCount++;
    
    debugLog(`[ProductListCollector] 페이지 ${pageNumber} 처리 시간: ${processingTimeMs}ms, 새로운 평균: ${this.averagePageProcessingTimeMs.toFixed(2)}ms (총 ${this.successfullyProcessedPagesCount}개 페이지)`);
  }

  private _calculateEstimatedRemainingTime(): { 
    estimatedTotalTimeMs: number, 
    remainingTimeMs: number 
  } {
    const successfulPagesCount = this.successfullyProcessedPagesCount;
    const remainingPagesCount = this.totalPagesForThisStage1Collection - this.processedPagesSuccessfully;
    
    // 평균 처리 시간 기반 예측
    const estimatedTotalTimeMs = this.totalPagesForThisStage1Collection * this.averagePageProcessingTimeMs;
    const remainingTimeMs = remainingPagesCount * this.averagePageProcessingTimeMs;
    
    return {
      estimatedTotalTimeMs,
      remainingTimeMs
    };
  }
}