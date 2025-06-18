/**
 * productList.ts
 * 제품 목록 수집을 담당하는 클래스
 */


import { CrawlerState } from '../core/CrawlerState.js';
import {
  promisePool, updateTaskStatus, initializeTaskStates,
} from '../utils/concurrency.js';

import type { CrawlResult, CrawlError } from '../utils/types.js';
import type { Product, PageProcessingStatusValue, MutablePageProcessingStatusItem } from '../../../../types.js';
import { type CrawlerConfig } from '../../../../types.js';
import { logger } from '../../../shared/utils/Logger.js';
import { crawlerEvents, updateRetryStatus } from '../utils/progress.js';
import { PageIndexManager } from '../utils/page-index-manager.js';
import { BrowserManager } from '../browser/BrowserManager.js';
import { PageValidator } from '../utils/page-validator.js';
import { CrawlingUtils } from '../../../shared/utils/CrawlingUtils.js';
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

// 진행 상황 콜백 타입 정의 (배치 처리 지원 추가)
export type EnhancedProgressCallback = (
  processedSuccessfully: number,
  totalPagesInStage: number,
  stage1PageStatuses: MutablePageProcessingStatusItem[],
  currentOverallRetryCountForStage: number,
  stage1StartTime: number,
  isStageComplete?: boolean,
  currentBatch?: number,
  totalBatches?: number
) => void;

export class ProductListCollector {
  
  private abortController: AbortController;
  private enhancedProgressCallback: EnhancedProgressCallback | null = null;
  
  private readonly config: CrawlerConfig;
  
  private readonly state: CrawlerState;

  // private readonly browserManager: BrowserManager;

  private static lastPageProductCount: number | null = null;
  private productCache: Map<number, Product[]>;

  // New members for detailed stage 1 progress
  private stage1PageStatuses: MutablePageProcessingStatusItem[] = [];
  private currentStageRetryCount: number = 0; // Tracks the number of retry *cycles* for the stage
  // Track total number of pages to process
  
  // 배치 처리 정보 저장
  private batchInfo?: {
    currentBatch: number;
    totalBatches: number;
  } = undefined;

  // Cached configuration values
  private pageTimeoutMs: number;
  private productsPerPage: number;
  private matterFilterUrl: string;
  
  // 새로운 유틸리티 클래스 인스턴스
  private readonly pageCrawler: PageCrawler;
  private readonly productDataProcessor: ProductDataProcessor;
  private progressManager: ProgressManager;

  constructor(state: CrawlerState, abortController: AbortController, config: CrawlerConfig, browserManager: BrowserManager) {
    this.state = state;
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
  
  /**
   * 설정 정보를 갱신합니다.
   * @param newConfig 새 설정 객체
   */
  refreshConfig(newConfig: CrawlerConfig): void {
    // config는 readonly이므로 Object.assign으로 속성들을 복사
    Object.assign(this.config, newConfig);
    
    // 캐싱된 설정값 갱신
    this.pageTimeoutMs = newConfig.pageTimeoutMs || 60000;
    this.productsPerPage = newConfig.productsPerPage || 12;
    this.matterFilterUrl = newConfig.matterFilterUrl || '';
    
    // 유틸리티 클래스 설정 갱신
    if (this.pageCrawler && typeof this.pageCrawler.refreshConfig === 'function') {
      this.pageCrawler.refreshConfig(newConfig);
    }
  }

  public setProgressCallback(callback: EnhancedProgressCallback): void {
    this.enhancedProgressCallback = callback;
    this.progressManager.setProgressCallback(callback);
  }

  /**
   * 배치 처리 정보 설정
   */
  public setBatchInfo(currentBatch: number, totalBatches: number): void {
    this.batchInfo = { currentBatch, totalBatches };
    // ProgressManager에도 배치 정보 전달
    if (this.progressManager && typeof this.progressManager.setBatchInfo === 'function') {
      this.progressManager.setBatchInfo(currentBatch, totalBatches);
    }
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
    
    // CrawlerState 상태 업데이트
    this.state.updatePageProcessingStatus(pageNumber, newStatus, attempt || 1);
    
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

  /**
   * 지정된 페이지 범위만 수집
   * @param pageRange 수집할 페이지 범위 {startPage, endPage}
   * @returns 수집된 제품 정보
   */
  public async collectPageRange(pageRange: {startPage: number, endPage: number}): Promise<Product[]> {
    this.productCache.clear();
    
    // ProgressManager 초기화 및 단계 설정
    this.progressManager.setInitStage();
    
    this.currentStageRetryCount = 0;
    this.stage1PageStatuses = [];

    try {
      const { totalPages: siteTotalPages, lastPageProductCount } = await this.fetchTotalPagesCached(false);
      ProductListCollector.lastPageProductCount = lastPageProductCount;
      
      // Generate page numbers within range
      const pageNumbersToCrawl: number[] = [];
      for (let page = pageRange.startPage; page >= pageRange.endPage; page--) {
        pageNumbersToCrawl.push(page);
      }
      
      if (pageNumbersToCrawl.length === 0) {
        this._sendProgressUpdate(true);
        return [];
      }
      
      this.stage1PageStatuses = pageNumbersToCrawl.map(pn => ({
        pageNumber: pn,
        status: 'waiting',
        attempt: 0
      }));

      // Prepare progress tracking
      const totalPages = pageNumbersToCrawl.length;
      this.progressManager.initializePages(pageNumbersToCrawl);
      this._sendProgressUpdate();

      // Process pages - similar to existing collect() method
      console.log(`[ProductListCollector] Collecting ${totalPages} pages in range: ${pageRange.startPage}-${pageRange.endPage}`);
      
      // Use existing methods instead of startStage
      this.progressManager.setInitStage();
      this._sendProgressUpdate();
      const collectedProducts = await this._crawlListOfPages(pageNumbersToCrawl, siteTotalPages);
      
      // Process any failed pages
      const allPageErrors: Record<string, CrawlError[]> = {};
      
      // Retry mechanism (similar to collect())
      const failedPageNumbers = pageNumbersToCrawl.filter(p => {
        const pageStatus = this.stage1PageStatuses.find(s => s.pageNumber === p);
        return pageStatus && (pageStatus.status === 'failed' || pageStatus.status === 'incomplete');
      });

      if (failedPageNumbers.length > 0) {
        await this.retryFailedPages(failedPageNumbers, siteTotalPages, allPageErrors);
      }

      // Summarize collection results
      this._summarizeCollectionOutcome(pageNumbersToCrawl, siteTotalPages, allPageErrors, collectedProducts);
      
      return collectedProducts;
    } catch (error) {
      console.error('[ProductListCollector] Error collecting page range:', error);
      throw error;
    }
  }

  /**
   * 리소스 정리 및 해제
   */
  public async cleanupResources(): Promise<void> {
    console.log('[ProductListCollector] Cleaning up resources...');
    
    // Clear caches
    this.productCache.clear();
    
    // If we're using a page crawler, clean it up
    if (this.pageCrawler) {
      await this.pageCrawler.cleanup();
    }
    
    // Allow garbage collection
    this.stage1PageStatuses = [];
  }

  private async _preparePageRange(userPageLimit: number): Promise<{
    totalPages: number; // Site's total pages
    pageNumbersToCrawl: number[]; // DB pageIds to crawl
    lastPageProductCount: number;
  } | null> {
    try {
      const { totalPages, lastPageProductCount } = await this.fetchTotalPagesCached(false);
      logger.debug(`Site total pages: ${totalPages}, Last page product count: ${lastPageProductCount}`, 'ProductListCollector');

      const { startPage, endPage } = await PageIndexManager.calculateCrawlingRange(
        totalPages, lastPageProductCount, userPageLimit
      );
      logger.debug(`Crawling range (db pageId): ${startPage} to ${endPage}`, 'ProductListCollector');

      const pageNumbersToCrawl = Array.from({ length: startPage - endPage + 1 }, (_, i) => endPage + i).reverse();
      logger.debug(`DB Page numbers to crawl: ${pageNumbersToCrawl.join(', ')}`, 'ProductListCollector');

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

    logger.info(`Starting initial crawl for ${pageNumbersToCrawl.length} pages.`, 'ProductListCollector');

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
          // 오류 로그 기록
          if (!errorLog[pageNumStr]) errorLog[pageNumStr] = [];
          errorLog[pageNumStr].push(result.error);
          
          // 오류 발생했지만 캐시에 충분한 제품이 있는 경우 성공으로 처리
          if (result.isComplete) {
            newStatus = 'success';
            console.log(`[ProductListCollector] 페이지 ${result.pageNumber} 시도 ${attemptNumber}: 오류 발생했으나 캐시된 제품(${result.products.length}개)으로 성공 처리`);
          } else {
            newStatus = 'failed';
          }
        } else if (!result.isComplete) {
          newStatus = 'incomplete';
        } else {
          newStatus = 'success';
        }

        // 내부 상태 업데이트
        this._updatePageStatusInternal(result.pageNumber, newStatus, attemptNumber);
        
        // CrawlerState의 상태도 업데이트
        this.state.updatePageProcessingStatus(result.pageNumber, newStatus, attemptNumber);

        // 불완전/실패한 페이지 목록 관리
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
    
    logger.debug(`Processed ${results.length} results. ${incompletePageListToPopulate.length} pages currently marked as incomplete/failed (attempt ${attemptNumber}).`);
  }

  /**
   * 페이지 크롤링 결과 처리 및 제품 정보 추출
   * @param pageNumber 페이지 번호
   * @param siteTotalPages 사이트 총 페이지 수
   * @param signal 중단 신호
   * @param attempt 시도 횟수
   * @returns 크롤링 결과
   */
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
    const isLastPage = sitePageNumberForTargetCount === 0;

    // 설정된 기대 제품 수를 CrawlerState에 업데이트
    this.state.setExpectedProductsPerPage(this.productsPerPage);

    let crawlError: CrawlError | undefined;

    this._updatePageStatusInternal(pageNumber, 'attempting', attempt);
    // 'running' 대신 'attempting'으로 변경
    this._emitPageCrawlStatus(pageNumber, 'attempting', { url, attempt }); 
    updateTaskStatus(pageNumber, 'running'); 

    if (signal.aborted) {
      this._updatePageStatusInternal(pageNumber, 'failed', attempt); 
      updateTaskStatus(pageNumber, 'stopped'); 
      crawlError = { type: 'Abort', message: 'Aborted before start', pageNumber, attempt };
      
      // 중단 시 CrawlerState에서 기존 캐시된 제품 가져오기
      const cachedProducts = this.state.getPageProductsCache(pageNumber);
      
      // 캐시된 제품으로 페이지 완전성 검증
      const validationResult = this.state.validatePageCompleteness(
        pageNumber, 
        isLastPage,
        isLastPage ? actualLastPageProductCount : undefined
      );
      
      return {
        pageNumber, 
        products: cachedProducts, 
        error: crawlError,
        isComplete: validationResult.isComplete
      };
    }

    let newlyFetchedProducts: Product[] = [];
    let currentProductsOnPage: Product[] = this.state.getPageProductsCache(pageNumber);
    
    // 페이지 완전성 검증
    let validationResult = this.state.validatePageCompleteness(
      pageNumber, 
      isLastPage,
      isLastPage ? actualLastPageProductCount : undefined
    );
    
    let isComplete = validationResult.isComplete;

    try {
      // 이미 완전히 수집된 페이지라면 새로 수집하지 않음
      if (isComplete && currentProductsOnPage.length >= targetProductCount) {
        console.log(`[ProductListCollector] 페이지 ${pageNumber} 시도 ${attempt}: 이미 완전히 수집됨 (${currentProductsOnPage.length}/${targetProductCount})`);
        
        // 상태 업데이트
        this._updatePageStatusInternal(pageNumber, 'success', attempt);
        this.state.updatePageProcessingStatus(pageNumber, 'success', attempt);
        
        this._emitPageCrawlStatus(pageNumber, 'success', {
          productsCount: currentProductsOnPage.length,
          newlyFetchedCount: 0,
          isComplete: true,
          targetCount: targetProductCount,
          attempt,
          fromCache: true
        });
        
        updateTaskStatus(pageNumber, 'success');
        
        return {
          pageNumber,
          products: currentProductsOnPage,
          isComplete: true
        };
      }
      
      // 새 데이터 가져오기 (crawlPageWithTimeout에 타임아웃 적용됨)
      newlyFetchedProducts = await this.crawlPageWithTimeout(pageNumber, signal, attempt);
      
      console.log(`[ProductListCollector] 페이지 ${pageNumber} 시도 ${attempt}: ${newlyFetchedProducts.length}개 제품 수집, 기존 캐시 ${currentProductsOnPage.length}개`);

      // 수집된 제품 데이터 유효성 검사 (PageValidator 활용)
      const { valid, invalid } = PageValidator.validateProductData(newlyFetchedProducts);
      
      if (invalid.length > 0) {
        console.warn(`[ProductListCollector] 페이지 ${pageNumber}: ${invalid.length}개 제품이 유효하지 않음`);
      }
      
      // 유효한 제품만 병합
      if (valid.length > 0) {
        // 스마트 병합: 새 제품과 기존 제품을 URL 기준으로 병합 (CrawlerState의 메서드 사용)
        const mergedProducts = this.state.updatePageProductsCache(pageNumber, valid);
        
        // 로컬 캐시도 업데이트 (하위 호환성)
        this.productCache.set(pageNumber, mergedProducts);
        currentProductsOnPage = mergedProducts;

        // 재검증: 페이지 완전성 검증 (병합 후)
        validationResult = this.state.validatePageCompleteness(
          pageNumber, 
          isLastPage,
          isLastPage ? actualLastPageProductCount : undefined
        );
        
        isComplete = validationResult.isComplete;
      }

      // 페이지 처리 상태 업데이트
      const currentProcessingStatus: PageProcessingStatusValue = isComplete ? 'success' : 'incomplete';
      this._updatePageStatusInternal(pageNumber, currentProcessingStatus, attempt);
      
      // CrawlerState의 페이지 처리 상태도 업데이트
      this.state.updatePageProcessingStatus(pageNumber, currentProcessingStatus, attempt);
      
      this._emitPageCrawlStatus(pageNumber, currentProcessingStatus, {
        productsCount: currentProductsOnPage.length,
        newlyFetchedCount: valid?.length || 0,
        invalidProductsCount: invalid?.length || 0,
        isComplete,
        targetCount: targetProductCount,
        attempt,
        mergedFromCache: currentProductsOnPage.length > newlyFetchedProducts.length,
        validationDetails: validationResult
      });
      
      updateTaskStatus(pageNumber, isComplete ? 'success' : 'incomplete'); 
    } catch (err) {
      // 로컬 상태 업데이트
      this._updatePageStatusInternal(pageNumber, 'failed', attempt);
      
      // CrawlerState 상태 업데이트
      this.state.updatePageProcessingStatus(pageNumber, 'failed', attempt);
      
      const finalStatusForTaskSignal = signal.aborted ? 'stopped' : 'error';
      
      // _emitPageCrawlStatus는 PageProcessingStatusValue를 기대하므로, 'stopped'의 경우 'failed'로 전달
      const errorStatusForEmit: PageProcessingStatusValue = finalStatusForTaskSignal === 'stopped' ? 'failed' : 'failed';

      // 오류 종류 분류
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
      
      // 오류 이벤트 발생
      this._emitPageCrawlStatus(pageNumber, errorStatusForEmit, { 
        error: crawlError, 
        attempt,
        cachedProductsCount: currentProductsOnPage.length,
        validationResult
      });
      
      // 작업 상태 업데이트
      updateTaskStatus(pageNumber, finalStatusForTaskSignal, crawlError.message);
      
      // 오류 발생했더라도 이전에 캐시된 제품이 충분한지 다시 검증
      // 오류가 발생했지만 캐시된 데이터가 완전한 경우를 처리
      const revalidationResult = this.state.validatePageCompleteness(
        pageNumber, 
        isLastPage,
        isLastPage ? actualLastPageProductCount : undefined
      );
      
      isComplete = revalidationResult.isComplete;
      
      // 오류가 발생했지만 캐시된 데이터가 완전하면 상태 업데이트
      if (isComplete) {
        console.log(`[ProductListCollector] 페이지 ${pageNumber}: 오류 발생했으나 캐시된 데이터가 완전하여 성공으로 처리`);
        this._updatePageStatusInternal(pageNumber, 'success', attempt);
        this.state.updatePageProcessingStatus(pageNumber, 'success', attempt);
        updateTaskStatus(pageNumber, 'success');
      }
      
      // 오류 정보를 CrawlerState에 기록
      if (!isComplete) {
        this.state.addFailedPage(pageNumber, crawlError.message);
      }
    }

    return {
      pageNumber, 
      products: currentProductsOnPage, 
      error: crawlError,
      isComplete
    };
  }

  /**
   * 실패한 페이지 재시도 (강화된 검증 로직 적용)
   * @param pagesToRetryInitially 초기 재시도 대상 페이지 번호 목록
   * @param siteTotalPages 사이트 총 페이지 수
   * @param failedPageErrors 페이지별 오류 정보
   */
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

    // 재시도 과정 시작 시 카운트를 1로 초기화
    this.currentStageRetryCount = 1;
    
    // 실패한 페이지에 대한 상세 정보 기록
    const failedPagesDetails = pagesToRetryInitially.map(pageNum => {
      // 현재 캐시된 제품 정보
      const cachedProducts = this.state.getPageProductsCache(pageNum);
      
      // 사이트 페이지 번호 계산
      const sitePageNumber = PageIndexManager.toSitePageNumber(pageNum, siteTotalPages);
      const isLastPage = sitePageNumber === 0;
      const expectedProductCount = isLastPage ? (ProductListCollector.lastPageProductCount || this.productsPerPage) : this.productsPerPage;
      
      // 페이지 검증
      const validationResult = this.state.validatePageCompleteness(
        pageNum,
        isLastPage,
        isLastPage ? ProductListCollector.lastPageProductCount || undefined : undefined
      );
      
      return {
        pageNumber: pageNum,
        sitePageNumber,
        isLastPage,
        expectedProductCount,
        currentProductCount: cachedProducts.length,
        isComplete: validationResult.isComplete,
        validationResult,
        errors: failedPageErrors[pageNum.toString()] || []
      };
    });
    
    console.log(`[ProductListCollector] 재시도 시작: ${failedPagesDetails.length}개 페이지 재시도 예정`);
    failedPagesDetails.forEach(pageInfo => {
      console.log(`[ProductListCollector] 재시도 대상 페이지 ${pageInfo.pageNumber}: 현재 ${pageInfo.currentProductCount}/${pageInfo.expectedProductCount} 제품 수집됨, 오류=${pageInfo.errors.length}개`);
    });
    
    // 재시도 전 각 페이지의 상태를 재설정 (캐시는 유지)
    pagesToRetryInitially.forEach(pageNumber => {
      // CrawlerState의 resetPageStatus 사용하여 상태 재설정 (캐시는 유지)
      this.state.resetPageStatus(pageNumber);
      // 내부 상태도 업데이트
      this._updatePageStatusInternal(pageNumber, 'waiting', 1);
    });
    
    // ProgressManager에 재시도 상태 업데이트
    this.progressManager.updateRetryStatus(
      this.currentStageRetryCount,
      productListRetryCount,
      pagesToRetryInitially.length,
      pagesToRetryInitially.length,
      pagesToRetryInitially.map(p => p.toString())
    );
    
    // UI 업데이트를 위한 이벤트 발생
    this._sendProgressUpdate();

    let currentIncompletePages = [...pagesToRetryInitially];

    for (let retryCycleIndex = 0; retryCycleIndex < productListRetryCount && currentIncompletePages.length > 0; retryCycleIndex++) {
      // 첫 번째 사이클은 이미 설정했으므로, 두 번째 사이클부터 증가
      if (retryCycleIndex > 0) {
        this.currentStageRetryCount = retryCycleIndex + 1;
      }
      const overallAttemptNumberForPagesInThisCycle = 1 + this.currentStageRetryCount;
      
      // 지수 백오프 적용 (CrawlingUtils 사용)
      const baseDelay = 1000; // 기본 1초
      const retryDelay = Math.min(
        Math.pow(1.5, retryCycleIndex) * baseDelay + (Math.random() * 500),
        30000 // 최대 30초
      );
      console.log(`[ProductListCollector] 재시도 사이클 ${this.currentStageRetryCount}/${productListRetryCount} 시작 전 ${Math.round(retryDelay)}ms 대기`);
      await CrawlingUtils.delay(retryDelay, () => this.abortController.signal.aborted);

      if (this.abortController.signal.aborted) {
        console.log(`[ProductListCollector] 재시도 중단: 중단 신호 감지됨`);
        currentIncompletePages.forEach(pNum => this._updatePageStatusInternal(pNum, 'failed', overallAttemptNumberForPagesInThisCycle));
        this._sendProgressUpdate();
        break;
      }

      // 현재 재시도 사이클에서 처리할 페이지 
      const pagesForThisRetryCycle = [...currentIncompletePages];
      currentIncompletePages.length = 0;
      
      // 재시도 대상 페이지 검증
      const pagesToActuallyRetry = pagesForThisRetryCycle.filter(pageNum => {
        // 페이지 완전성 검증
        // Get site page number for validation
        const sitePageNumber = PageIndexManager.toSitePageNumber(pageNum, siteTotalPages);
        const isLastPage = sitePageNumber === 0;
        
        const validationResult = this.state.validatePageCompleteness(
          pageNum,
          isLastPage,
          isLastPage ? ProductListCollector.lastPageProductCount || undefined : undefined
        );
        
        // 이미 완전하게 수집된 페이지는 재시도 대상에서 제외
        if (validationResult.isComplete) {
          console.log(`[ProductListCollector] 페이지 ${pageNum}: 이전 수집 또는 병합으로 완전해짐, 재시도 불필요`);
          this._updatePageStatusInternal(pageNum, 'success', overallAttemptNumberForPagesInThisCycle);
          return false;
        }
        
        // 불완전 페이지는 재시도 대상으로 포함
        return true;
      });
      
      if (pagesToActuallyRetry.length === 0) {
        console.log(`[ProductListCollector] 재시도 사이클 ${this.currentStageRetryCount}: 모든 페이지가 이미 완전함, 재시도 불필요`);
        break;
      }
      
      console.log(`[ProductListCollector] 재시도 사이클 ${this.currentStageRetryCount}: ${pagesToActuallyRetry.length}개 페이지 재시도`);

      // 상태 업데이트
      pagesToActuallyRetry.forEach(pNum => {
        this._updatePageStatusInternal(pNum, 'attempting', overallAttemptNumberForPagesInThisCycle);
      });
      this._sendProgressUpdate();

      // ProgressManager를 통해 재시도 상태 업데이트
      this.progressManager.updateRetryStatus(
        this.currentStageRetryCount,
        productListRetryCount,
        pagesToActuallyRetry.length,
        pagesToRetryInitially.length,
        pagesToActuallyRetry.map(p => p.toString())
      );
      
      logger.info(`Product list retry cycle ${this.currentStageRetryCount}/${productListRetryCount} for pages: ${pagesToActuallyRetry.join(', ')}`);

      // 실제 재시도 실행
      const { results: retryBatchResults } = await this.executeParallelCrawling(
        pagesToActuallyRetry,
        siteTotalPages,
        retryConcurrency,
        overallAttemptNumberForPagesInThisCycle
      );

      // 재시도 결과 처리
      this._processBatchResultsAndUpdateStatus(
        retryBatchResults,
        currentIncompletePages,
        failedPageErrors,
        overallAttemptNumberForPagesInThisCycle
      );

      // 재시도 후 불완전 페이지 갱신 - 완전성 강화 검증 적용
      currentIncompletePages = currentIncompletePages.filter(pageNum => {
        // Get site page number for validation
        const sitePageNumber = PageIndexManager.toSitePageNumber(pageNum, siteTotalPages);
        const isLastPage = sitePageNumber === 0;
        
        const validationResult = this.state.validatePageCompleteness(
          pageNum,
          isLastPage,
          isLastPage ? ProductListCollector.lastPageProductCount || undefined : undefined
        );
        
        // 완전해진 페이지는 제외
        return !validationResult.isComplete;
      });

      // 재시도 상태 업데이트
      updateRetryStatus('list-retry', {
        remainingItems: currentIncompletePages.length,
        itemIds: currentIncompletePages.map(p => p.toString())
      });

      // 모든 페이지가 완전해지면 종료
      if (currentIncompletePages.length === 0) {
        logger.info(`모든 제품 목록 페이지가 재시도 사이클 ${this.currentStageRetryCount} 후 완전해짐.`);
        crawlerEvents.emit('crawlingTaskStatus', {
          taskId: 'list-retry', 
          status: 'success',
          message: `Product list retry successful after cycle ${this.currentStageRetryCount}.`
        });
        break;
      }
    }

    // 최종 결과 보고
    if (currentIncompletePages.length > 0) {
      // 남은 불완전 페이지 세부 정보 조회
      const remainingIncompleteDetails = currentIncompletePages.map(pageNum => {
        const cachedProducts = this.state.getPageProductsCache(pageNum);
        const sitePageNumber = PageIndexManager.toSitePageNumber(pageNum, siteTotalPages);
        const isLastPage = sitePageNumber === 0;
        const expectedProductCount = isLastPage ? (ProductListCollector.lastPageProductCount || this.productsPerPage) : this.productsPerPage;
        
        const validationResult = this.state.validatePageCompleteness(
          pageNum,
          isLastPage,
          isLastPage ? ProductListCollector.lastPageProductCount || undefined : undefined
        );
        
        return {
          pageNumber: pageNum,
          sitePageNumber,
          isLastPage,
          expectedProductCount,
          currentProductCount: cachedProducts.length,
          validationDetails: validationResult
        };
      });
      
      const incompleteDetailsSummary = remainingIncompleteDetails.map(info => 
        `페이지 ${info.pageNumber}: ${info.currentProductCount}/${info.expectedProductCount} 제품${info.isLastPage ? ' (마지막 페이지)' : ''}`
      ).join(', ');
      
      logger.warn(`${this.currentStageRetryCount}번의 재시도 후에도 ${currentIncompletePages.length}개 페이지가 불완전함: ${incompleteDetailsSummary}`);
      
      crawlerEvents.emit('crawlingTaskStatus', {
        taskId: 'list-retry', 
        status: 'error',
        message: JSON.stringify({
          stage: 1,
          type: 'retry',
          message: `재시도 완료 후에도 ${currentIncompletePages.length}개 페이지가 불완전함`,
          details: incompleteDetailsSummary,
          cycles: this.currentStageRetryCount
        })
      });
    } else {
      if (this.currentStageRetryCount > 0) {
        logger.info(`모든 제품 목록 페이지가 ${this.currentStageRetryCount}번의 재시도 내에 완전히 수집됨.`);
        
        crawlerEvents.emit('crawlingTaskStatus', {
          taskId: 'list-retry', 
          status: 'success',
          message: JSON.stringify({
            stage: 1,
            type: 'retry',
            message: '모든 초기 불완전 페이지가 재시도 사이클 내에 완전히 수집됨',
            cycles: this.currentStageRetryCount
          })
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
  
  /**
   * 페이지 목록을 크롤링하는 메서드
   * @param pageNumbersToCrawl 크롤링할 페이지 번호 배열
   * @param siteTotalPages 사이트의 총 페이지 수
   * @returns 수집된 제품 목록
   */
  private async _crawlListOfPages(
    pageNumbersToCrawl: number[],
    siteTotalPages: number
  ): Promise<Product[]> {
    initializeTaskStates(pageNumbersToCrawl);
    
    const incompletePages: number[] = [];
    const allPageErrors: Record<string, CrawlError[]> = {};
    const initialAttemptNumber = 1;
    
    logger.info(`Starting crawl for ${pageNumbersToCrawl.length} pages.`);
    
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
    
    // Return the products that have been collected so far
    return this.finalizeCollectedProducts(pageNumbersToCrawl);
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
      logger.debug(`Fetching total pages. Force refresh: ${force}`);
      const result = await this._fetchTotalPages();
      ProductListCollector.lastPageProductCount = result.lastPageProductCount;
      logger.debug(`Fetched and cached new total pages data: ${result.totalPages} pages, ${result.lastPageProductCount} products on last page.`);
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
              await CrawlingUtils.delay(pauseTime, () => this.abortController.signal.aborted);
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
            await CrawlingUtils.delay(pauseTime, () => this.abortController.signal.aborted);
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




  /**
   * 최종 제품 목록 수집 및 트랜잭션 기반 저장
   * 모든 페이지의 완전성을 다시 검사하고, 불완전한 페이지가 있으면 로그에 기록
   * @param pageNumbersToCrawl 수집할 페이지 번호 목록
   * @returns 수집된 모든 제품 목록
   */
  private finalizeCollectedProducts(pageNumbersToCrawl: number[]): Product[] {
    let allCollectedProducts: Product[] = [];
    const sortedPageNumbers = [...pageNumbersToCrawl].sort((a, b) => a - b);
    
    console.log(`[ProductListCollector] 페이지 수집 결과 최종화: ${sortedPageNumbers.length}개 페이지 처리`);
    
    // 불완전 페이지 추적
    const incompletePages: { pageNumber: number; expected: number; actual: number; isLastPage: boolean }[] = [];
    
    // 사이트 정보 가져오기 (캐시된 totalPages와 lastPageProductCount 사용)
    // 먼저 SitePageInfoCache에서 비동기식으로 정보를 가져오는 대신, 캐시된 값을 이용
    let siteTotalPages = 0;
    
    try {
      // 캐시된 값이 있으면 사용하고, 없으면 기본값 사용
      const cachedInfo = sitePageInfoCache.getSync();
      if (cachedInfo) {
        siteTotalPages = cachedInfo.totalPages || 0;
      }
    } catch (error) {
      console.warn('[ProductListCollector] 캐시된 사이트 페이지 정보를 가져오는 중 오류 발생:', error);
    }
    
    const actualLastPageProductCount = ProductListCollector.lastPageProductCount || this.productsPerPage;
    
    // 트랜잭션 시작 (여기서는 개념적으로만 표현, 실제 트랜잭션은 DB 저장 시 구현)
    console.log(`[ProductListCollector] 트랜잭션 기반 제품 수집 시작`);
    
    for (const pageNum of sortedPageNumbers) {
      // CrawlerState에서 캐시된 제품 가져오기
      const productsOnPage = this.state.getPageProductsCache(pageNum);
      
      // 페이지 완전성 최종 검증
      const sitePageNumberForValidation = siteTotalPages ? PageIndexManager.toSitePageNumber(pageNum, siteTotalPages) : -1;
      const isLastPage = sitePageNumberForValidation === 0;
      
      const validationResult = this.state.validatePageCompleteness(
        pageNum, 
        isLastPage,
        isLastPage ? actualLastPageProductCount : undefined
      );
      
      // 검증 결과를 로그에 기록
      const expectedCount = validationResult.expectedCount;
      const actualCount = productsOnPage.length;
      
      console.log(`[ProductListCollector] 페이지 ${pageNum} 최종 상태: ${actualCount}/${expectedCount} 제품, 완전성=${validationResult.isComplete ? '완전' : '불완전'}`);
      
      // 불완전 페이지 추적
      if (!validationResult.isComplete) {
        incompletePages.push({
          pageNumber: pageNum,
          expected: expectedCount,
          actual: actualCount,
          isLastPage
        });
      }
      
      // 데이터 병합 (트랜잭션 내에서)
      allCollectedProducts.push(...productsOnPage);
      
      // 로컬 캐시도 업데이트 (하위 호환성)
      this.productCache.set(pageNum, productsOnPage);
    }
    
    // 불완전한 페이지가 있는 경우 로그에 기록
    if (incompletePages.length > 0) {
      const incompletePagesSummary = incompletePages.map(p => 
        `페이지 ${p.pageNumber}: ${p.actual}/${p.expected} 제품${p.isLastPage ? ' (마지막 페이지)' : ''}`
      ).join(', ');
      
      console.warn(`[ProductListCollector] 수집 완료 후에도 ${incompletePages.length}개 페이지가 불완전함: ${incompletePagesSummary}`);
      
      crawlerEvents.emit('crawlingTaskStatus', {
        taskId: 'list-finalize',
        status: 'warning',
        message: JSON.stringify({
          stage: 1,
          type: 'finalize',
          incompletePages: incompletePages.length,
          details: incompletePagesSummary
        })
      });
    } else {
      console.log(`[ProductListCollector] 모든 페이지가 완전히 수집됨: ${sortedPageNumbers.length}개 페이지, 총 ${allCollectedProducts.length}개 제품`);
      
      crawlerEvents.emit('crawlingTaskStatus', {
        taskId: 'list-finalize',
        status: 'success',
        message: JSON.stringify({
          stage: 1,
          type: 'finalize',
          pages: sortedPageNumbers.length,
          products: allCollectedProducts.length
        })
      });
    }
    
    // 트랜잭션 완료 (여기서는 개념적으로만 표현)
    console.log(`[ProductListCollector] 트랜잭션 기반 제품 수집 완료: ${allCollectedProducts.length}개 제품`);
    
    // 로컬 캐시만 초기화 (CrawlerState의 캐시는 유지하여 재시도 시 활용)
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
}