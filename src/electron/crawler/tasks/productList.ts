/**
 * productList.ts
 * 제품 목록 수집을 담당하는 클래스
 */

import { type Page } from 'playwright-chromium';
// import { getDatabaseSummaryFromDb } from '../../database.js';

import { CrawlerState } from '../core/CrawlerState.js';
import {
  promisePool, updateTaskStatus, initializeTaskStates,
} from '../utils/concurrency.js';

import type { CrawlResult, CrawlError } from '../utils/types.js';
import type { Product } from '../../../../types.js';
import { debugLog } from '../../util.js';
import { type CrawlerConfig } from '../core/config.js';
import { crawlerEvents, updateRetryStatus, logRetryError } from '../utils/progress.js';
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
export type ProgressCallback = (processedPages: number) => void;

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
  private progressCallback: ProgressCallback | null = null;
  private processedPages: number = 0;
  private readonly config: CrawlerConfig;
  private readonly browserManager: BrowserManager; // Added BrowserManager

  // 마지막 페이지 제품 수를 저장하는 캐시 변수
  private static lastPageProductCount: number | null = null;
  // 페이지별로 수집된 제품을 임시 저장하는 캐시
  private productCache: Map<number, Product[]>;

  constructor(state: CrawlerState, abortController: AbortController, config: CrawlerConfig, browserManager: BrowserManager) { // Added browserManager
    this.state = state;
    this.abortController = abortController;
    this.config = config; // Configuration is stored
    this.browserManager = browserManager; // Store browserManager
    this.productCache = new Map(); // 제품 캐시 초기화
  }

  /**
   * 진행 상황 콜백 설정 함수
   * @param callback 진행 상황을 업데이트할 콜백 함수
   */
  public setProgressCallback(callback: ProgressCallback): void {
    this.progressCallback = callback;
  }

  /**
   * 진행 상황 업데이트 함수
   */
  private updateProgress(): void {
    this.processedPages++;
    if (this.progressCallback) {
      this.progressCallback(this.processedPages);
    }
  }

  /**
   * 페이지 크롤링 상태 이벤트를 발생시키는 내부 헬퍼 메소드
   */
  private _emitPageCrawlStatus(
    pageNumber: number,
    status: 'success' | 'error' | 'running' | 'stopped',
    data: Record<string, any>
  ): void {
    const messagePayload: Record<string, any> = {
      stage: 1,
      type: 'page',
      pageNumber,
      ...data // Spread data first to allow specific overrides
    };

    if (status === 'running') {
      messagePayload.startTime = new Date().toISOString();
      // Ensure URL is included if provided in data for running status
      if (data.url) {
        messagePayload.url = data.url;
      }
    } else {
      messagePayload.endTime = new Date().toISOString();
    }

    // Remove undefined fields to keep payload clean
    Object.keys(messagePayload).forEach(key => {
      if (messagePayload[key] === undefined) {
        delete messagePayload[key];
      }
    });

    crawlerEvents.emit('crawlingTaskStatus', {
      taskId: `page-${pageNumber}`,
      status,
      message: JSON.stringify(messagePayload)
    });
  }

  /**
   * 제품 목록 수집 프로세스 실행
   * @param userPageLimit 사용자가 설정한 페이지 수 제한
   */
  public async collect(userPageLimit: number = 0): Promise<Product[]> {
    this.productCache.clear();
    this.state.setStage('productList:init', '1단계: 제품 목록 페이지 수 파악 중');
    this.processedPages = 0;

    try {
      const prepResult = await this._preparePageRange(userPageLimit);
      if (!prepResult) {
        return []; // No new pages to crawl
      }
      const { totalPages, pageNumbersToCrawl, lastPageProductCount } = prepResult;
      ProductListCollector.lastPageProductCount = lastPageProductCount; // Set static member

      const { incompletePages: incompletePagesAfterInitialCrawl, allPageErrors } = 
        await this._executeInitialCrawl(pageNumbersToCrawl, totalPages);

      if (this.abortController.signal.aborted) {
        console.log('[ProductListCollector] Crawling stopped after initial list collection.');
        return this.finalizeCollectedProducts(pageNumbersToCrawl);
      }

      if (incompletePagesAfterInitialCrawl.length > 0) {
        console.log(`[ProductListCollector] ${incompletePagesAfterInitialCrawl.length} pages incomplete after initial crawl. Retrying...`);
        await this.retryFailedPages(
          incompletePagesAfterInitialCrawl,
          totalPages,
          allPageErrors
        );
      }

      if (this.abortController.signal.aborted) {
        console.log('[ProductListCollector] Crawling stopped during/after retries.');
        return this.finalizeCollectedProducts(pageNumbersToCrawl);
      }

      const finalProducts = this.finalizeCollectedProducts(pageNumbersToCrawl);
      this._summarizeCollectionOutcome(pageNumbersToCrawl, totalPages, allPageErrors, finalProducts);
      return finalProducts;

    } finally {
      this.cleanupResources();
    }
  }

  private async _preparePageRange(userPageLimit: number): Promise<{
    totalPages: number;
    pageNumbersToCrawl: number[];
    lastPageProductCount: number;
  } | null> {
    try {
      const { totalPages, lastPageProductCount } = await this.fetchTotalPagesCached(false);
      debugLog(`[ProductListCollector] Total pages: ${totalPages}, Last page product count: ${lastPageProductCount}`);

      const { startPage, endPage } = await PageIndexManager.calculateCrawlingRange(
        totalPages, lastPageProductCount, userPageLimit
      );
      debugLog(`[ProductListCollector] Crawling range: ${startPage} to ${endPage}`);

      const pageNumbersToCrawl = Array.from({ length: startPage - endPage + 1 }, (_, i) => endPage + i).reverse();
      debugLog(`[ProductListCollector] Page numbers to crawl: ${pageNumbersToCrawl.join(', ')}`);

      crawlerEvents.emit('crawlingTaskStatus', {
        taskId: 'list-range',
        status: 'running',
        message: JSON.stringify({
          stage: 1,
          type: 'range',
          totalPages,
          startPage,
          endPage,
          pageCount: pageNumbersToCrawl.length,
          estimatedProductCount: pageNumbersToCrawl.length * this.config.productsPerPage,
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
            totalPages
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

  private async _executeInitialCrawl(pageNumbersToCrawl: number[], totalPages: number): Promise<{
    incompletePages: number[];
    allPageErrors: Record<string, CrawlError[]>;
  }> {
    this.state.updateProgress({
      totalPages,
      currentPage: 0,
      totalItems: pageNumbersToCrawl.length * this.config.productsPerPage,
      currentItem: 0
    });
    this.state.setStage('productList:fetching', '1/2단계: 제품 목록 수집 중');
    initializeTaskStates(pageNumbersToCrawl);

    const incompletePages: number[] = [];
    const allPageErrors: Record<string, CrawlError[]> = {};
    const initialAttemptNumber = 1;

    debugLog(`[ProductListCollector] Starting initial crawl for ${pageNumbersToCrawl.length} pages.`);
    const { results } = await this.executeParallelCrawling(
      pageNumbersToCrawl,
      totalPages,
      this.config.initialConcurrency ?? 5,
      initialAttemptNumber
    );

    this._processCrawlResults(results, incompletePages, allPageErrors, initialAttemptNumber);

    return { incompletePages, allPageErrors };
  }

  private _summarizeCollectionOutcome(
    pageNumbersToCrawl: number[],
    totalPages: number,
    allPageErrors: Record<string, CrawlError[]>,
    collectedProducts: Product[]
  ): void {
    let finalFailedCount = 0;
    pageNumbersToCrawl.forEach(pNum => {
      const sitePNum = PageIndexManager.toSitePageNumber(pNum, totalPages);
      const target = sitePNum === 0 ? (ProductListCollector.lastPageProductCount ?? this.config.productsPerPage) : this.config.productsPerPage;
      const cached = this.productCache.get(pNum) || [];
      if (cached.length < target) {
        finalFailedCount++;
        if (!this.state.getFailedPages().includes(pNum)) {
          const errorsForPage = allPageErrors[pNum.toString()];
          const errorMessage = errorsForPage && errorsForPage.length > 0 
            ? errorsForPage[errorsForPage.length -1].message
            : 'Failed to meet target product count after all attempts';
          this.state.addFailedPage(pNum, errorMessage);
        }
      }
    });

    const successPagesCount = pageNumbersToCrawl.length - finalFailedCount;
    const successRate = pageNumbersToCrawl.length > 0 ? (successPagesCount / pageNumbersToCrawl.length) : 1;

    console.log(`[ProductListCollector] Final collection: ${successPagesCount}/${pageNumbersToCrawl.length} pages fully collected. Total products: ${collectedProducts.length}`);

    crawlerEvents.emit('crawlingTaskStatus', {
      taskId: 'list-complete', status: 'success',
      message: JSON.stringify({
        stage: 1, type: 'complete', totalPages,
        processedPages: successPagesCount,
        collectedProducts: collectedProducts.length,
        failedPages: finalFailedCount,
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
    let page: Page | null = null;
    try {
      page = await this.browserManager.getPage();
      if (!page) {
        throw new Error('Failed to get a page from BrowserManager.');
      }

      if (!this.config.matterFilterUrl) {
        throw new Error('Configuration error: matterFilterUrl is not defined.');
      }
      delay(1000); // Optional delay before navigation
      debugLog(`[ProductListCollector] Navigating to ${this.config.matterFilterUrl} to fetch total pages.`);
      await page.goto(this.config.matterFilterUrl, { waitUntil: 'domcontentloaded', timeout: this.config.pageTimeoutMs ?? 60000 });
      debugLog(`[ProductListCollector] Page loaded: ${page.url()} with pageTimeoutMs: ${this.config.pageTimeoutMs}`);

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
          } catch (evalError) {
            throw new PageContentExtractionError(`Failed to count products on last page ${totalPages}: ${evalError instanceof Error ? evalError.message : String(evalError)}`, totalPages, 0);
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
          } catch (evalError) {
            throw new PageContentExtractionError(`Failed to count products on initial page (no pagination): ${evalError instanceof Error ? evalError.message : String(evalError)}`, 1, 0);
          }

          if (lastPageProductCount > 0) {
            totalPages = 1;
            debugLog(`[ProductListCollector] Found ${lastPageProductCount} products on the first page. Setting totalPages to 1.`);
          } else {
            totalPages = 0;
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
      if (page) {
        try {
          await this.browserManager.closePage(page);
        } catch (e) {
          console.error("[ProductListCollector] Error releasing page in _fetchTotalPages:", e);
        }
      }
    }
  }

  private async processPageCrawl(
    pageNumber: number,
    totalPages: number,
    signal: AbortSignal,
    attempt: number = 1
  ): Promise<CrawlResult | null> {
    const sitePageNumber = PageIndexManager.toSitePageNumber(pageNumber, totalPages);
    const url = `${this.config.matterFilterUrl}&paged=${pageNumber}`;

    const actualLastPageProductCount = ProductListCollector.lastPageProductCount ?? 0;
    const targetProductCount = sitePageNumber === 0 ? actualLastPageProductCount : this.config.productsPerPage;

    let crawlError: CrawlError | undefined;

    if (signal.aborted) {
      updateTaskStatus(pageNumber, 'stopped');
      crawlError = { type: 'Abort', message: 'Aborted before start', pageNumber, attempt };
      const cachedProducts = this.productCache.get(pageNumber) || [];
      return {
        pageNumber,
        products: cachedProducts,
        error: crawlError,
        isComplete: cachedProducts.length >= targetProductCount
      };
    }

    this._emitPageCrawlStatus(pageNumber, 'running', { url, attempt });
    updateTaskStatus(pageNumber, 'running');

    let newlyFetchedProducts: Product[] = [];
    let currentProductsOnPage: Product[] = this.productCache.get(pageNumber) || [];
    let isComplete = currentProductsOnPage.length >= targetProductCount;

    try {
      newlyFetchedProducts = await Promise.race([
        this.crawlPageWithTimeout(pageNumber, totalPages, signal, attempt),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new PageTimeoutError('Timeout', pageNumber, attempt)), this.config.pageTimeoutMs)
        )
      ]);

      const existingProductsFromCache = this.productCache.get(pageNumber) || [];
      const allProductsForPage = ProductListCollector._mergeAndDeduplicateProductLists(
        existingProductsFromCache,
        newlyFetchedProducts
      );
      this.productCache.set(pageNumber, allProductsForPage);
      currentProductsOnPage = allProductsForPage; 

      isComplete = currentProductsOnPage.length >= targetProductCount;

      this.state.updateProgress({ currentPage: pageNumber });
      this.updateProgress();

      this._emitPageCrawlStatus(pageNumber, 'success', {
        productsCount: currentProductsOnPage.length,
        newlyFetchedCount: newlyFetchedProducts.length,
        isComplete,
        targetCount: targetProductCount,
        attempt
      });
      updateTaskStatus(pageNumber, 'success');

    } catch (err) {
      const finalStatus = signal.aborted ? 'stopped' : 'error';
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
      
      updateTaskStatus(pageNumber, finalStatus, crawlError.message);
      this._emitPageCrawlStatus(pageNumber, finalStatus, { error: crawlError, attempt });
      isComplete = currentProductsOnPage.length >= targetProductCount; 
    }

    return {
      pageNumber,
      products: currentProductsOnPage, 
      error: crawlError,
      isComplete
    };
  }

  private async executeParallelCrawling(
    pageNumbersToCrawl: number[],
    totalPages: number,
    concurrency: number,
    currentAttemptNumber: number
  ): Promise<{ results: (CrawlResult | null)[] }> {
    const results: (CrawlResult | null)[] = await promisePool(
      pageNumbersToCrawl,
      async (pageNumber, signal) => {
        return this.processPageCrawl(
          pageNumber, totalPages, signal, currentAttemptNumber
        );
      },
      concurrency,
      this.abortController
    );
    return { results };
  }

  private _processCrawlResults(
    results: (CrawlResult | null)[],
    incompletePageList: number[],
    errorLog: Record<string, CrawlError[]>,
    attemptNumber: number
  ): void {
    results.forEach(result => {
      if (result) {
        const pageNumStr = result.pageNumber.toString();
        if (result.error) {
          if (!errorLog[pageNumStr]) {
            errorLog[pageNumStr] = [];
          }
          errorLog[pageNumStr].push(result.error);
        }

        if (!result.isComplete) {
          if (!incompletePageList.includes(result.pageNumber)) {
            incompletePageList.push(result.pageNumber);
          }
        } else {
          const index = incompletePageList.indexOf(result.pageNumber);
          if (index > -1) {
            incompletePageList.splice(index, 1);
          }
        }
      }
    });
    debugLog(`[_processCrawlResults attempt ${attemptNumber}] Processed ${results.length} results. ${incompletePageList.length} pages currently marked as incomplete.`);
  }

  private async retryFailedPages(
    pagesToRetryInitially: number[],
    totalPages: number,
    failedPageErrors: Record<string, CrawlError[]>
  ): Promise<void> {
    const productListRetryCount = this.config.productListRetryCount ?? 3;
    const retryConcurrency = this.config.retryConcurrency ?? 1;

    if (productListRetryCount <= 0) {
      debugLog(`[RETRY] Product list retries disabled.`);
      pagesToRetryInitially.forEach(pageNumber => {
        const pageNumStr = pageNumber.toString();
        if (!failedPageErrors[pageNumStr]) {
          failedPageErrors[pageNumStr] = [];
        }
        const errorToLog: CrawlError = {
          type: 'Generic',
          message: `Attempt 1: Failed to meet target product count, and retries are disabled.`,
          pageNumber,
          attempt: 1
        };
        if (!failedPageErrors[pageNumStr].some(err => err.message.includes("retries are disabled"))) {
           failedPageErrors[pageNumStr].push(errorToLog);
        }
      });
      return;
    }

    let currentIncompletePages = [...pagesToRetryInitially]; 
    
    const firstRetryAttemptNumber = 2;

    for (let retryLoopIndex = 0; retryLoopIndex < productListRetryCount && currentIncompletePages.length > 0; retryLoopIndex++) {
      const currentOverallAttemptNumber = firstRetryAttemptNumber + retryLoopIndex;
      
      if (this.abortController.signal.aborted) {
        debugLog(`[RETRY] Aborted during retry loop for product list.`);
        currentIncompletePages.forEach(pageNumber => {
            const pageNumStr = pageNumber.toString();
            if (!failedPageErrors[pageNumStr]) failedPageErrors[pageNumStr] = [];
            const abortError: CrawlError = { type: 'Abort', message: `Attempt ${currentOverallAttemptNumber}: Aborted before retry.`, pageNumber, attempt: currentOverallAttemptNumber };
            if (!failedPageErrors[pageNumStr].some(err => err.message === abortError.message)) {
                failedPageErrors[pageNumStr].push(abortError);
            }
        });
        break;
      }

      const pagesForThisRetryAttempt = [...currentIncompletePages];
      currentIncompletePages.length = 0;

      updateRetryStatus('list-retry', {
        stage: 'productList',
        currentAttempt: retryLoopIndex + 1, 
        maxAttempt: productListRetryCount,
        remainingItems: pagesForThisRetryAttempt.length,
        totalItems: pagesToRetryInitially.length, 
        startTime: Date.now(),
        itemIds: pagesForThisRetryAttempt.map(p => p.toString())
      });

      crawlerEvents.emit('crawlingTaskStatus', {
        taskId: 'list-retry', status: 'running',
        message: `Product list retry attempt ${retryLoopIndex + 1}/${productListRetryCount} (Overall attempt ${currentOverallAttemptNumber}): ${pagesForThisRetryAttempt.length} pages`
      });
      debugLog(`[RETRY] Product list attempt ${retryLoopIndex + 1}/${productListRetryCount} (Overall attempt ${currentOverallAttemptNumber}) for pages: ${pagesForThisRetryAttempt.join(', ')}`);

      const { results: retryBatchResults } = await this.executeParallelCrawling(
        pagesForThisRetryAttempt,
        totalPages,
        retryConcurrency,
        currentOverallAttemptNumber 
      );

      this._processCrawlResults(
        retryBatchResults,
        currentIncompletePages, 
        failedPageErrors,       
        currentOverallAttemptNumber
      );

      pagesForThisRetryAttempt.forEach(pageNumberAttempted => {
        const pageNumStr = pageNumberAttempted.toString();
        const resultForPage = retryBatchResults.find(r => r?.pageNumber === pageNumberAttempted);

        if (resultForPage) {
          if (!resultForPage.isComplete) {
            const lastErrorForPage = failedPageErrors[pageNumStr]?.slice(-1)[0] || 
              { type: 'Generic', message: `Attempt ${currentOverallAttemptNumber}: ${resultForPage.error?.message || "Unknown error during retry"}`, pageNumber: pageNumberAttempted, attempt: currentOverallAttemptNumber };
            logRetryError('productList', pageNumStr, lastErrorForPage.message, retryLoopIndex + 1); 
          } else {
            console.log(`[RETRY][${retryLoopIndex + 1}/${productListRetryCount}] Page ${pageNumberAttempted} successfully completed (Overall attempt ${currentOverallAttemptNumber}).`);
          }
        } else {
          if (currentIncompletePages.includes(pageNumberAttempted)) { 
            const errorsForPage = failedPageErrors[pageNumStr];
            let lastErrorForPage = errorsForPage?.slice(-1)[0];
            if (!lastErrorForPage || !lastErrorForPage.message.startsWith(`Attempt ${currentOverallAttemptNumber}`)){
                const missingResultError: CrawlError = {
                  type: 'Generic',
                  message: `Attempt ${currentOverallAttemptNumber}: Page ${pageNumberAttempted} was attempted, but no specific result was returned in the batch, and it remains incomplete.`,
                  pageNumber: pageNumberAttempted,
                  attempt: currentOverallAttemptNumber
                };
                if (!failedPageErrors[pageNumStr]) failedPageErrors[pageNumStr] = [];
                failedPageErrors[pageNumStr].push(missingResultError);
                lastErrorForPage = missingResultError;
            }
            logRetryError('productList', pageNumStr, lastErrorForPage.message, retryLoopIndex + 1);
          } else {
             console.log(`[RETRY][${retryLoopIndex + 1}/${productListRetryCount}] Page ${pageNumberAttempted} considered resolved (no direct result from batch, not in current incomplete list). Overall attempt ${currentOverallAttemptNumber}.`);
          }
        }
      });
      
      updateRetryStatus('list-retry', {
        remainingItems: currentIncompletePages.length,
        itemIds: currentIncompletePages.map(p => p.toString())
      });

      if (currentIncompletePages.length === 0) {
        debugLog(`[RETRY] All product list pages successfully completed after retry attempt ${retryLoopIndex + 1}.`);
        crawlerEvents.emit('crawlingTaskStatus', {
          taskId: 'list-retry', status: 'success',
          message: `Product list retry successful after attempt ${retryLoopIndex + 1}.`
        });
        break;
      }
    }

    if (currentIncompletePages.length > 0) {
      debugLog(`[RETRY] After ${productListRetryCount} retries, ${currentIncompletePages.length} pages remain incomplete: ${currentIncompletePages.join(', ')}`);
      crawlerEvents.emit('crawlingTaskStatus', {
        taskId: 'list-retry', status: 'error',
        message: `Product list retry finished: ${currentIncompletePages.length} pages still incomplete.`
      });
    } else {
      debugLog(`[RETRY] All product list pages completed within retry attempts.`);
      if (productListRetryCount > 0 && pagesToRetryInitially.length > 0) {
        crawlerEvents.emit('crawlingTaskStatus', {
          taskId: 'list-retry', status: 'success',
          message: 'Product list retry successful: All initially incomplete pages completed.'
        });
      }
    }
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
    
    for (const product of newProducts) {
      if (product.url) {
        productMap.set(product.url, product);
      }
    }
    for (const product of existingProducts) {
      if (product.url) {
        productMap.set(product.url, product);
      }
    }
    const mergedProducts = Array.from(productMap.values());
    return mergedProducts;
  }

  private finalizeCollectedProducts(pageNumbersToCrawl: number[]): Product[] {
    let allProducts: Product[] = [];
    for (const pageNum of pageNumbersToCrawl) {
      const productsOnPage = this.productCache.get(pageNum) || [];
      allProducts = allProducts.concat(productsOnPage);
    }
    return allProducts;
  }

  private async crawlPageWithTimeout(
    pageNumber: number,
    totalPages: number,
    signal: AbortSignal,
    attempt: number
  ): Promise<Product[]> {
    if (signal.aborted) {
      throw new PageAbortedError('Aborted before crawlPageWithTimeout call', pageNumber, attempt);
    }

    const pageUrl = `${this.config.matterFilterUrl}&paged=${pageNumber}`;
    let page: Page | null = null;
    const timeout = this.config.pageTimeoutMs ?? 60000; // Default to 60 seconds

    try {
      page = await this.browserManager.getPage();
      if (!page) {
        throw new PageInitializationError('Failed to get a page from BrowserManager.', pageNumber, attempt);
      }

      await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout });

      const rawProducts = await page.evaluate<RawProductData[]>(
        ProductListCollector._extractProductsFromPageDOM
      );

      const actualLastPageProductCount = ProductListCollector.lastPageProductCount ?? 0;
      const sitePageNumber = PageIndexManager.toSitePageNumber(pageNumber, totalPages);
      const offset = PageIndexManager.calculateOffset(actualLastPageProductCount);

      const products = this._mapRawProductsToProducts(rawProducts, sitePageNumber, offset);

      return products;
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'TimeoutError') {
          throw new PageTimeoutError(`Page ${pageNumber} timed out after ${timeout}ms on attempt ${attempt}. URL: ${pageUrl}`, pageNumber, attempt);
        }
        throw new PageOperationError(`Error crawling page ${pageNumber} (attempt ${attempt}): ${error.message}. URL: ${pageUrl}`, pageNumber, attempt);
      } else {
        throw new PageOperationError(`Unknown error crawling page ${pageNumber} (attempt ${attempt}). URL: ${pageUrl}`, pageNumber, attempt);
      }
    } finally {
      if (page) {
        await this.browserManager.closePage(page);
      }
    }
  }
}