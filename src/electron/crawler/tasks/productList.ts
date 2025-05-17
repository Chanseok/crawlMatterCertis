/**
 * productList.ts
 * 제품 목록 수집을 담당하는 클래스
 */


import { CrawlerState } from '../core/CrawlerState.js';
import {
  promisePool, updateTaskStatus, initializeTaskStates,
} from '../utils/concurrency.js';

import type { CrawlResult, CrawlError } from '../utils/types.js';
import type { Product, PageProcessingStatusItem, PageProcessingStatusValue } from '../../../../types.js';
import { debugLog } from '../../util.js';
import { type CrawlerConfig } from '../core/config.js';
import { crawlerEvents, updateRetryStatus } from '../utils/progress.js';
import { PageIndexManager } from '../utils/page-index-manager.js';
import { BrowserManager } from '../browser/BrowserManager.js';
// import { delay } from '../utils/delay.js';

// 모듈화된 클래스 가져오기
import { 
  PageOperationError, PageTimeoutError, PageAbortedError,
  PageNavigationError, PageContentExtractionError, PageInitializationError 
} from '../utils/page-errors.js';
import { PageCacheManager } from '../utils/page-cache-manager.js';
import { SitePageInfo } from './product-list-types.js';
import { DEFAULT_CACHE_TTL_MS } from './product-list-constants.js';
import { PageCrawler } from './page-crawler.js';
import { ProductDataProcessor } from './product-data-processor.js';
import { ProgressManager } from './progress-manager.js';

// 캐시 매니저 인스턴스 생성
const sitePageInfoCache = new PageCacheManager<SitePageInfo>();

// 진행 상황 콜백 타입 정의 (하위 호환성 유지)
export type EnhancedProgressCallback = (
  processedSuccessfully: number,
  totalPagesInStage: number,
  stage1PageStatuses: PageProcessingStatusItem[],
  currentOverallRetryCountForStage: number,
  stage1StartTime: number,
  isStageComplete?: boolean
) => void;

export class ProductListCollector {
  
  private abortController: AbortController;
  private enhancedProgressCallback: EnhancedProgressCallback | null = null;
  
  private readonly config: CrawlerConfig;
  
  // private readonly state: CrawlerState;

  // private readonly browserManager: BrowserManager;

  private static lastPageProductCount: number | null = null;
  private productCache: Map<number, Product[]>;

  // New members for detailed stage 1 progress
  private stage1PageStatuses: PageProcessingStatusItem[] = [];
  private currentStageRetryCount: number = 0; // Tracks the number of retry *cycles* for the stage
  
  
  

  // Cached configuration values
  private pageTimeoutMs: number;
  private productsPerPage: number;
  private matterFilterUrl: string;
  
  // 새로운 유틸리티 클래스 인스턴스
  private readonly pageCrawler: PageCrawler;
  private readonly productDataProcessor: ProductDataProcessor;
  private progressManager: ProgressManager;

  constructor(state: CrawlerState, abortController: AbortController, config: CrawlerConfig, browserManager: BrowserManager) {
    // this.state = state;
    this.abortController = abortController;
    this.config = config;
    // this.browserManager = browserManager;
    this.productCache = new Map();
    
    // 자주 사용하는 설정값 미리 추출
    this.pageTimeoutMs = config.pageTimeoutMs || 60000;
    this.productsPerPage = config.productsPerPage || 12;
    this.matterFilterUrl = config.matterFilterUrl || '';
    
    // 유틸리티 클래스 초기화 (config에서 crawlerType 사용)
    this.pageCrawler = new PageCrawler(browserManager, config);
    this.productDataProcessor = new ProductDataProcessor();
    this.progressManager = new ProgressManager(state);
  }

  public setProgressCallback(callback: EnhancedProgressCallback): void {
    this.enhancedProgressCallback = callback;
    this.progressManager.setProgressCallback(callback);
  }
  
  /**
   * 크롤링 전략 변경
   * @param crawlerType 크롤링 전략 유형 ('playwright' 또는 'axios')
   */
  public async switchCrawlerStrategy(crawlerType: 'playwright' | 'axios'): Promise<void> {
    await this.pageCrawler.switchCrawlerStrategy(crawlerType);
    console.log(`[ProductListCollector] 크롤링 전략이 ${crawlerType}로 변경되었습니다.`);
  }
  
  /**
   * 현재 사용 중인 크롤링 전략 확인
   * @returns 현재 크롤링 전략 유형
   */
  public getCurrentCrawlerStrategy(): 'playwright' | 'axios' {
    return this.pageCrawler.getCurrentStrategy();
  }

  private _sendProgressUpdate(isStageComplete: boolean = false): void {
    if (this.enhancedProgressCallback) {
      this.progressManager.sendProgressUpdate(isStageComplete);
    }
  }

  private _updatePageStatusInternal(pageNumber: number, newStatus: PageProcessingStatusValue, attempt?: number): void {
    // ProgressManager를 통해 페이지 상태 업데이트
    this.progressManager.updatePageStatus(pageNumber, newStatus, attempt);
    
    // 하위 호환성을 위해 로컬 상태도 함께 업데이트
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
    // ProgressManager를 통해 페이지 크롤링 상태 이벤트 발생
    this.progressManager.emitPageCrawlStatus(pageNumber, status, data);
  }

  public async collect(userPageLimit: number = 0): Promise<Product[]> {
    this.productCache.clear();
    
    // ProgressManager 초기화 및 단계 설정
    this.progressManager.setInitStage();
    
    this.currentStageRetryCount = 0;
    this.stage1PageStatuses = [];

    try {
      const prepResult = await this._preparePageRange(userPageLimit);
      if (!prepResult || prepResult.pageNumbersToCrawl.length === 0) {
        this._sendProgressUpdate(true);
        return [];
      }
      // siteTotalPages is the total number of pages on the site, used for PageIndexManager
      const { totalPages: siteTotalPages, pageNumbersToCrawl, lastPageProductCount } = prepResult;
      ProductListCollector.lastPageProductCount = lastPageProductCount;

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
      // 기존 캐시된 제품 데이터 가져오기
      const cachedProducts = this.productCache.get(pageNumber) || [];
      
      // 새 데이터 가져오기 (crawlPageWithTimeout에 타임아웃 적용됨)
      newlyFetchedProducts = await this.crawlPageWithTimeout(pageNumber, signal, attempt);

      // 새 제품과 기존 제품을 URL 기준으로 병합
      const mergedProducts = ProductListCollector._mergeAndDeduplicateProductLists(
        cachedProducts, newlyFetchedProducts
      );
      
      // 병합된 제품을 캐시에 저장
      this.productCache.set(pageNumber, mergedProducts);
      currentProductsOnPage = mergedProducts;

      // 타겟 수와 비교하여 성공 여부 결정
      isComplete = currentProductsOnPage.length >= targetProductCount;

      const currentProcessingStatus: PageProcessingStatusValue = isComplete ? 'success' : 'incomplete';
      this._updatePageStatusInternal(pageNumber, currentProcessingStatus, attempt);
      this._emitPageCrawlStatus(pageNumber, currentProcessingStatus, {
        productsCount: currentProductsOnPage.length,
        newlyFetchedCount: newlyFetchedProducts.length,
        isComplete, targetCount: targetProductCount, attempt
      });
      updateTaskStatus(pageNumber, isComplete ? 'success' : 'incomplete'); 
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
      
      // 지수 백오프 적용 (새로 추가)
      const baseDelay = 1000; // 기본 1초
      const retryDelay = Math.min(
        Math.pow(1.5, retryCycleIndex) * baseDelay + (Math.random() * 500),
        30000 // 최대 30초
      );
      console.log(`[ProductListCollector] Waiting ${Math.round(retryDelay)}ms before retry cycle ${this.currentStageRetryCount}/${productListRetryCount}`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));

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

      // ProgressManager를 통해 재시도 상태 업데이트
      this.progressManager.updateRetryStatus(
        this.currentStageRetryCount,
        productListRetryCount,
        pagesForThisRetryCycle.length,
        pagesToRetryInitially.length,
        pagesForThisRetryCycle.map(p => p.toString())
      );
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
    // ProgressManager를 통해 수집 결과 요약 보고
    this.progressManager.summarizeCollectionOutcome(totalPages, collectedProducts.length);
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
    const cacheTtl = this.config.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    sitePageInfoCache.setTtl(cacheTtl);
    
    return await sitePageInfoCache.getOrFetch(force, async () => {
      debugLog(`[ProductListCollector] Fetching total pages. Force refresh: ${force}`);
      const result = await this._fetchTotalPages();
      ProductListCollector.lastPageProductCount = result.lastPageProductCount;
      debugLog(`[ProductListCollector] Fetched and cached new total pages data: ${result.totalPages} pages, ${result.lastPageProductCount} products on last page.`);
      return {
        totalPages: result.totalPages,
        lastPageProductCount: result.lastPageProductCount,
        fetchedAt: Date.now()  // 현재 시간을 fetchedAt 속성으로 추가
      };
    });
  }

  private async _fetchTotalPages(): Promise<{ totalPages: number; lastPageProductCount: number }> {
    try {
      // PageCrawler를 사용하여 총 페이지 수와 마지막 페이지 제품 수 조회
      return await this.pageCrawler.fetchTotalPages();
    } catch (error) {
      // 기존 에러 처리 로직은 PageCrawler 내부에서 처리하므로 여기서는 에러를 그대로 전달
      console.error(`[ProductListCollector] Failed to fetch total pages: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  private async executeParallelCrawling(
    pageNumbersToCrawl: number[],
    siteTotalPages: number,
    concurrency: number,
    currentAttemptNumber: number
  ): Promise<{ results: (CrawlResult | null)[] }> {
    // 연속 실패 감지를 위한 변수 추가
    let consecutiveFailures = 0;
    const MAX_CONSECUTIVE_FAILURES = 3;
  
    const results: (CrawlResult | null)[] = await promisePool(
      pageNumbersToCrawl,
      async (pageNumber, signalFromPool) => {
        try {
          const result = await this.processPageCrawl(
            pageNumber, siteTotalPages, signalFromPool, currentAttemptNumber
          );
          
          if (result && !result.error) {
            consecutiveFailures = 0; // 성공 시 카운터 리셋
          } else {
            consecutiveFailures++;
            
            // 연속 실패가 임계값을 초과하면 잠시 대기
            if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
              const pauseTime = 5000; // 5초 대기
              console.log(`[ProductListCollector] Detected ${consecutiveFailures} consecutive failures. Pausing for ${pauseTime}ms`);
              await new Promise(resolve => setTimeout(resolve, pauseTime));
              consecutiveFailures = 0; // 대기 후 카운터 리셋
            }
          }
          
          return result;
        } catch (error) {
          consecutiveFailures++;
          // 연속 실패가 임계값을 초과하면 잠시 대기
          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            const pauseTime = 5000; // 5초 대기
            console.log(`[ProductListCollector] Detected ${consecutiveFailures} consecutive failures. Pausing for ${pauseTime}ms`);
            await new Promise(resolve => setTimeout(resolve, pauseTime));
            consecutiveFailures = 0; // 대기 후 카운터 리셋
          }
          throw error;
        }
      },
      concurrency,
      this.abortController
    );
    return { results };
  }

  // DOM에서 제품 추출 메서드는 PageCrawler로 이동하여 제거



  private static _mergeAndDeduplicateProductLists(
    existingProducts: Product[],
    newProducts: Product[]
  ): Product[] {
    // ProductDataProcessor의 정적 메서드 호출
    const processor = new ProductDataProcessor();
    return processor.mergeAndDeduplicateProductLists(existingProducts, newProducts);
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
    // siteTotalPages: number,
    signal: AbortSignal,
    attempt: number
  ): Promise<Product[]> {
    if (signal.aborted) {
      throw new PageAbortedError('Aborted before crawlPageWithTimeout call', pageNumber, attempt);
    }

    try {
      // 명시적인 타임아웃 적용
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new PageTimeoutError(
          `Page ${pageNumber} timed out after ${this.pageTimeoutMs}ms on attempt ${attempt}`,
          pageNumber,
          attempt
        )), this.pageTimeoutMs);
      });
      
      // PageCrawler를 사용하여 페이지 크롤링
      // Promise.race로 타임아웃 처리
      const result = await Promise.race([
        this.pageCrawler.crawlPage(pageNumber, signal, attempt),
        timeoutPromise
      ]);
      
      // 수집된 데이터 처리
      const { totalPages: siteTotal, lastPageProductCount: siteLastPageCount } = await this.fetchTotalPagesCached();
      const sitePageNumber = PageIndexManager.toSitePageNumber(pageNumber, siteTotal);
      const offset = PageIndexManager.calculateOffset(siteLastPageCount);

      // ProductDataProcessor를 사용하여 데이터 변환
      return this.productDataProcessor.mapRawProductsToProducts(
        result.rawProducts, 
        sitePageNumber, 
        offset
      );
    } catch (error: unknown) {
      // 기존 에러 처리는 그대로 유지
      if (error instanceof PageOperationError) throw error;

      const pageUrl = `${this.matterFilterUrl}&paged=${pageNumber}`;
      const timeout = this.pageTimeoutMs;
      
      if (error instanceof Error) {
        if (error.name === 'TimeoutError') {
          throw new PageTimeoutError(`Page ${pageNumber} timed out after ${timeout}ms on attempt ${attempt}. URL: ${pageUrl}`, pageNumber, attempt);
        }
        throw new PageOperationError(`Error crawling page ${pageNumber} (attempt ${attempt}): ${error.message}. URL: ${pageUrl}`, pageNumber, attempt);
      }
      throw new PageOperationError(`Unknown error crawling page ${pageNumber} (attempt ${attempt}). URL: ${pageUrl}`, pageNumber, attempt);
    }
  }

  // 페이지 최적화 및 네비게이션 메서드는 PageCrawler로 이동하여 제거
}