/**
 * productList.ts
 * 제품 목록 수집을 담당하는 클래스
 */

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-chromium';
// import { getDatabaseSummaryFromDb } from '../../database.js';
import { getRandomDelay, delay } from '../utils/delay.js';
import { CrawlerState } from '../core/CrawlerState.js';
import {
  promisePool, updateTaskStatus, initializeTaskStates,
} from '../utils/concurrency.js';

import type { CrawlResult } from '../utils/types.js';
import type { Product } from '../../../../types.js';
import { debugLog } from '../../util.js';
import { getConfig, type CrawlerConfig } from '../core/config.js';
import { crawlerEvents, updateRetryStatus, logRetryError } from '../utils/progress.js';
import { PageIndexManager } from '../utils/page-index-manager.js';

// 캐시
let cachedTotalPages: number | null = null;
let cachedTotalPagesFetchedAt: number | null = null;

// 진행 상황 콜백 타입 정의
export type ProgressCallback = (processedPages: number) => void;

export class ProductListCollector {
  private state: CrawlerState;
  private abortController: AbortController;
  private progressCallback: ProgressCallback | null = null;
  private processedPages: number = 0;
  private readonly config: CrawlerConfig;
  private browser: Browser | null = null; // ProductListCollector 인스턴스 레벨에서 브라우저 관리

  // 마지막 페이지 제품 수를 저장하는 캐시 변수
  private static lastPageProductCount: number | null = null;
  // 페이지별로 수집된 제품을 임시 저장하는 캐시
  private productCache: Map<number, Product[]>;

  constructor(state: CrawlerState, abortController: AbortController, config: CrawlerConfig) {
    this.state = state;
    this.abortController = abortController;
    this.config = config;
    this.productCache = new Map(); // 제품 캐시 초기화
  }

  private async _initializeBrowser(): Promise<void> {
    if (!this.browser || !this.browser.isConnected()) {
      debugLog('[ProductListCollector] Initializing browser instance...');
      this.browser = await chromium.launch({ headless: true });
    }
  }

  private async _closeBrowser(): Promise<void> {
    if (this.browser && this.browser.isConnected()) {
      debugLog('[ProductListCollector] Closing browser instance...');
      await this.browser.close();
      this.browser = null;
    }
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
   * 제품 목록 수집 프로세스 실행
   * @param userPageLimit 사용자가 설정한 페이지 수 제한
   */
  public async collect(userPageLimit: number = 0): Promise<Product[]> {
    this.productCache.clear();
    this.state.setStage('productList:init', '1단계: 제품 목록 페이지 수 파악 중');
    this.processedPages = 0;

    try {
      await this._initializeBrowser(); // 브라우저 초기화
      const { totalPages, lastPageProductCount } = await ProductListCollector.fetchTotalPagesCached(false, this.config);
      debugLog(`Total pages: ${totalPages}, Last page product count: ${lastPageProductCount}`);
      ProductListCollector.lastPageProductCount = lastPageProductCount;

      const { startPage, endPage } = await PageIndexManager.calculateCrawlingRange(
        totalPages, lastPageProductCount, userPageLimit
      );
      debugLog(`Crawling range: ${startPage} to ${endPage}`);

      const pageNumbersToCrawl = Array.from({ length: startPage - endPage + 1 }, (_, i) => endPage + i).reverse();
      debugLog(`Page numbers to crawl: ${pageNumbersToCrawl.join(', ')}`);

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
        return [];
      }

      this.state.updateProgress({
        totalPages,
        currentPage: 0,
        totalItems: pageNumbersToCrawl.length * this.config.productsPerPage,
        currentItem: 0
      });
      this.state.setStage('productList:fetching', '1/2단계: 제품 목록 수집 중');
      initializeTaskStates(pageNumbersToCrawl);

      const incompletePagesAfterInitialCrawl: number[] = [];
      const allPageErrors: Record<string, string[]> = {};

      debugLog(`Starting initial crawl for ${pageNumbersToCrawl.length} pages.`);
      await this.executeParallelCrawling(
        pageNumbersToCrawl,
        totalPages,
        incompletePagesAfterInitialCrawl,
        allPageErrors,
        this.config.initialConcurrency ?? 5,
        false,
        1
      );

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

      let finalFailedCount = 0;
      pageNumbersToCrawl.forEach(pNum => {
        const sitePNum = PageIndexManager.toSitePageNumber(pNum, totalPages);
        const target = sitePNum === 0 ? (ProductListCollector.lastPageProductCount ?? this.config.productsPerPage) : this.config.productsPerPage;
        const cached = this.productCache.get(pNum) || [];
        if (cached.length < target) {
          finalFailedCount++;
          if (!this.state.getFailedPages().includes(pNum)) {
            const errors = allPageErrors[pNum.toString()] || ['Failed to meet target product count'];
            this.state.addFailedPage(pNum, errors.join('; '));
          }
        }
      });

      const successPagesCount = pageNumbersToCrawl.length - finalFailedCount;
      const successRate = pageNumbersToCrawl.length > 0 ? (successPagesCount / pageNumbersToCrawl.length) : 1;

      console.log(`[ProductListCollector] Final collection: ${successPagesCount}/${pageNumbersToCrawl.length} pages fully collected. Total products: ${finalProducts.length}`);

      crawlerEvents.emit('crawlingTaskStatus', {
        taskId: 'list-complete', status: 'success',
        message: JSON.stringify({
          stage: 1, type: 'complete', totalPages,
          processedPages: successPagesCount,
          collectedProducts: finalProducts.length,
          failedPages: finalFailedCount,
          successRate: parseFloat((successRate * 100).toFixed(1))
        })
      });

      this.state.setStage('productList:processing', '수집된 제품 목록 처리 중');
      return finalProducts;

    } finally {
      await this._closeBrowser(); // 브라우저 종료
      this.cleanupResources();
    }
  }

  /**
   * 리소스 정리 함수
   */
  private cleanupResources(): void {
    console.log('[ProductListCollector] Cleaning up resources...');
    // 추가적인 리소스 정리가 필요하면 여기에 작성
  }

  /**
   * 캐시된 페이지 정보 반환 또는 최신화
   */
  public async getTotalPagesCached(force = false): Promise<number> {
    const { totalPages } = await ProductListCollector.fetchTotalPagesCached(force, this.config);
    return totalPages;
  }

  /**
   * 정적 메서드: 캐시된 전체 페이지 수와 마지막 페이지 제품 수를 가져오거나 최신화
   * 외부 모듈에서 쉽게 접근할 수 있는 간단한 API 제공
   */
  public static async fetchTotalPagesCached(force = false, instanceConfig?: CrawlerConfig): Promise<{
    totalPages: number;
    lastPageProductCount: number;
  }> {
    const configToUse = instanceConfig || getConfig();
    const now = Date.now();
    const cacheTtl = configToUse.cacheTtlMs ?? 3600000;

    if (!force &&
      cachedTotalPages &&
      ProductListCollector.lastPageProductCount !== null &&
      cachedTotalPagesFetchedAt &&
      (now - cachedTotalPagesFetchedAt < cacheTtl)) {
      return {
        totalPages: cachedTotalPages,
        lastPageProductCount: ProductListCollector.lastPageProductCount!
      };
    }

    const result = await ProductListCollector.fetchTotalPages(configToUse);
    cachedTotalPages = result.totalPages;
    ProductListCollector.lastPageProductCount = result.lastPageProductCount;
    cachedTotalPagesFetchedAt = now;

    return result;
  }

  /**
   * 정적 메서드: 총 페이지 수와 마지막 페이지의 제품 수를 가져오는 함수
   */
  private static async fetchTotalPages(config: CrawlerConfig): Promise<{ totalPages: number; lastPageProductCount: number }> {
    const browser = await chromium.launch({ headless: true });
    let totalPages = 0;
    let lastPageProductCount = 0;

    try {
      const context = await browser.newContext();
      const page = await context.newPage();

      if (!config.matterFilterUrl) {
        throw new Error('Configuration error: matterFilterUrl is not defined.');
      }

      console.log(`[ProductListCollector] Navigating to ${config.matterFilterUrl}`);
      await page.goto(config.matterFilterUrl, { waitUntil: 'domcontentloaded' });

      const pageElements = await page.locator('div.pagination-wrapper > nav > div > a > span').all();
      if (pageElements.length > 0) {
        const pageNumbers = await Promise.all(
          pageElements.map(async (el) => {
            const text = await el.textContent();
            return text ? parseInt(text.trim(), 10) : 0;
          })
        );

        totalPages = Math.max(...pageNumbers.filter(n => !isNaN(n)));
      }
      console.log(`[ProductListCollector] Found ${totalPages} total pages`);

      if (totalPages > 0) {
        const lastPageUrl = `${config.matterFilterUrl}&paged=${totalPages}`;
        console.log(`[ProductListCollector] Navigating to last page: ${lastPageUrl}`);
        await page.goto(lastPageUrl, { waitUntil: 'domcontentloaded' });

        lastPageProductCount = await page.evaluate(() => {
          return document.querySelectorAll('div.post-feed article').length;
        });

        console.log(`[ProductListCollector] Last page ${totalPages} has ${lastPageProductCount} products`);
      }
    } catch (error: unknown) {
      console.error('[ProductListCollector] Error getting total pages:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get total pages: ${errorMessage}`);
    } finally {
      await browser.close();
    }

    return { totalPages, lastPageProductCount };
  }

  /**
   * 단일 페이지 크롤링 작업을 처리하는 함수
   */
  private async processPageCrawl(
    pageNumber: number,
    totalPages: number,
    failedPagesOutput: number[],
    failedPageErrors: Record<string, string[]>,
    signal: AbortSignal,
    attempt: number = 1
  ): Promise<CrawlResult | null> {
    const sitePageNumber = PageIndexManager.toSitePageNumber(pageNumber, totalPages);

    const actualLastPageProductCount = ProductListCollector.lastPageProductCount ?? 0;
    const targetProductCount = sitePageNumber === 0 ? actualLastPageProductCount : this.config.productsPerPage;

    if (signal.aborted) {
      updateTaskStatus(pageNumber, 'stopped');
      const cachedProducts = this.productCache.get(pageNumber) || [];
      return {
        pageNumber,
        products: cachedProducts,
        error: 'Aborted',
        isComplete: cachedProducts.length >= targetProductCount
      };
    }

    crawlerEvents.emit('crawlingTaskStatus', {
      taskId: `page-${pageNumber}`,
      status: 'running',
      message: JSON.stringify({
        stage: 1, type: 'page', pageNumber,
        url: `${this.config.matterFilterUrl}&paged=${pageNumber}`,
        attempt: attempt, startTime: new Date().toISOString()
      })
    });
    updateTaskStatus(pageNumber, 'running');

    let newlyFetchedProducts: Product[] = [];
    let currentProductsOnPage: Product[] = this.productCache.get(pageNumber) || [];
    let pageErrorMessage: string | undefined;
    let isComplete = currentProductsOnPage.length >= targetProductCount;

    try {
      newlyFetchedProducts = await Promise.race([
        this.crawlPageWithTimeout(pageNumber, totalPages, signal),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), this.config.pageTimeoutMs)
        )
      ]);

      currentProductsOnPage = this.mergePageProducts(pageNumber, newlyFetchedProducts);
      isComplete = currentProductsOnPage.length >= targetProductCount;

      this.state.updateProgress({ currentPage: pageNumber });
      this.updateProgress();

      crawlerEvents.emit('crawlingTaskStatus', {
        taskId: `page-${pageNumber}`, status: 'success',
        message: JSON.stringify({
          stage: 1, type: 'page', pageNumber,
          productsCount: currentProductsOnPage.length,
          newlyFetchedCount: newlyFetchedProducts.length,
          isComplete,
          targetCount: targetProductCount,
          endTime: new Date().toISOString()
        })
      });
      updateTaskStatus(pageNumber, 'success');

    } catch (err) {
      pageErrorMessage = err instanceof Error ? err.message : String(err);
      const status = signal.aborted ? 'stopped' : 'error';
      updateTaskStatus(pageNumber, status, pageErrorMessage);

      crawlerEvents.emit('crawlingTaskStatus', {
        taskId: `page-${pageNumber}`, status: 'error',
        message: JSON.stringify({
          stage: 1, type: 'page', pageNumber,
          error: pageErrorMessage, attempt: attempt,
          endTime: new Date().toISOString()
        })
      });
      isComplete = currentProductsOnPage.length >= targetProductCount;

      if (!failedPageErrors[pageNumber.toString()]) {
        failedPageErrors[pageNumber.toString()] = [];
      }
      const attemptPrefix = attempt > 1 ? `Attempt ${attempt}: ` : '';
      failedPageErrors[pageNumber.toString()].push(`${attemptPrefix}${pageErrorMessage}`);
    }

    if (!isComplete) {
      if (!failedPagesOutput.includes(pageNumber)) {
        failedPagesOutput.push(pageNumber);
      }
    } else {
      const index = failedPagesOutput.indexOf(pageNumber);
      if (index > -1) {
        failedPagesOutput.splice(index, 1);
      }
    }

    return {
      pageNumber,
      products: currentProductsOnPage,
      error: pageErrorMessage,
      isComplete
    };
  }

  /**
   * 병렬 크롤링 실행
   */
  private async executeParallelCrawling(
    pageNumbersToCrawl: number[],
    totalPages: number,
    incompletePagesOutput: number[],
    failedPageErrors: Record<string, string[]>,
    concurrency: number,
    isRetryAttempt: boolean = false,
    currentAttemptNumber: number = 1
  ): Promise<void> {
    if (!isRetryAttempt) {
      incompletePagesOutput.length = 0;
    }

    await promisePool(
      pageNumbersToCrawl,
      async (pageNumber, signal) => {
        return this.processPageCrawl(
          pageNumber, totalPages, incompletePagesOutput, failedPageErrors, signal, currentAttemptNumber
        );
      },
      concurrency,
      this.abortController
    );

    debugLog(`[ExecuteParallelCrawling attempt ${currentAttemptNumber}] Completed batch. ${incompletePagesOutput.length} pages remain incomplete.`);
  }

  /**
   * 실패한 페이지를 재시도하는 함수
   */
  private async retryFailedPages(
    pagesToRetryInitially: number[],
    totalPages: number,
    failedPageErrors: Record<string, string[]>
  ): Promise<void> {
    const productListRetryCount = this.config.productListRetryCount ?? 3;
    const retryConcurrency = this.config.retryConcurrency ?? 1;

    if (productListRetryCount <= 0) {
      debugLog(`[RETRY] Product list retries disabled.`);
      pagesToRetryInitially.forEach(pageNumber => {
        const sitePNum = PageIndexManager.toSitePageNumber(pageNumber, totalPages);
        const lastPageProdCount = ProductListCollector.lastPageProductCount ?? 0;
        const target = sitePNum === 0 ? lastPageProdCount : this.config.productsPerPage;
        const cached = this.productCache.get(pageNumber) || [];
        if (cached.length < target) {
          if (!this.state.getFailedPages().includes(pageNumber)) {
            const errors = failedPageErrors[pageNumber.toString()] || ['Failed to meet target product count, retries disabled'];
            this.state.addFailedPage(pageNumber, errors.join('; '));
          }
        }
      });
      return;
    }

    let currentIncompletePages = [...pagesToRetryInitially];
    const retryStartAttemptNumber = 1;

    for (let attempt = retryStartAttemptNumber; attempt <= productListRetryCount && currentIncompletePages.length > 0; attempt++) {
      if (this.abortController.signal.aborted) {
        debugLog(`[RETRY] Aborted during retry loop for product list.`);
        break;
      }

      const pagesForThisAttempt = [...currentIncompletePages];
      currentIncompletePages.length = 0;

      updateRetryStatus('list-retry', {
        stage: 'productList',
        currentAttempt: attempt,
        maxAttempt: productListRetryCount,
        remainingItems: pagesForThisAttempt.length,
        totalItems: pagesToRetryInitially.length,
        startTime: Date.now(),
        itemIds: pagesForThisAttempt.map(p => p.toString())
      });

      crawlerEvents.emit('crawlingTaskStatus', {
        taskId: 'list-retry', status: 'running',
        message: `Product list retry attempt ${attempt}/${productListRetryCount}: ${pagesForThisAttempt.length} pages`
      });
      debugLog(`[RETRY] Product list attempt ${attempt}/${productListRetryCount} for pages: ${pagesForThisAttempt.join(', ')}`);

      await this.executeParallelCrawling(
        pagesForThisAttempt,
        totalPages,
        currentIncompletePages,
        failedPageErrors,
        retryConcurrency,
        true,
        attempt
      );

      pagesForThisAttempt.forEach(pageNumber => {
        if (currentIncompletePages.includes(pageNumber)) {
          const errorsForPage = failedPageErrors[pageNumber.toString()] || [];
          const lastError = errorsForPage.length > 0 ? errorsForPage[errorsForPage.length - 1] : "Unknown error during retry";
          logRetryError('productList', pageNumber.toString(), lastError, attempt);
        } else {
          console.log(`[RETRY][${attempt}/${productListRetryCount}] Page ${pageNumber} successfully completed.`);
        }
      });

      updateRetryStatus('list-retry', {
        remainingItems: currentIncompletePages.length,
        itemIds: currentIncompletePages.map(p => p.toString())
      });

      if (currentIncompletePages.length === 0) {
        debugLog(`[RETRY] All product list pages successfully completed after attempt ${attempt}.`);
        crawlerEvents.emit('crawlingTaskStatus', {
          taskId: 'list-retry', status: 'success',
          message: `Product list retry successful after attempt ${attempt}.`
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
      currentIncompletePages.forEach(pageNumber => {
        const errors = failedPageErrors[pageNumber.toString()] || ['Unknown error after max retries'];
        this.state.addFailedPage(pageNumber, errors.join('; '));
        console.error(`[RETRY] Page ${pageNumber} ultimately failed to complete: ${errors.join('; ')}`);
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

  /**
   * 특정 페이지의 제품 정보 목록을 크롤링하는 함수
   */
  private async crawlProductsFromPage(pageNumber: number, totalPages: number, signal: AbortSignal): Promise<Product[]> {
    const delayTime = getRandomDelay(this.config.minRequestDelayMs ?? 1000, this.config.maxRequestDelayMs ?? 3000);
    await delay(delayTime);

    if (signal.aborted) {
      debugLog(`[ProductListCollector] Crawl for page ${pageNumber} aborted before starting.`);
      throw new Error('Aborted');
    }
    if (!this.browser || !this.browser.isConnected()) {
      debugLog(`[ProductListCollector] Browser not initialized or disconnected for page ${pageNumber}.`);
      throw new Error('Browser not initialized or disconnected in ProductListCollector');
    }

    const pageUrl = `${this.config.matterFilterUrl}&paged=${pageNumber}`;
    let context: BrowserContext | null = null;
    let page: Page | null = null;

    const cleanupPageAndContext = async () => {
      if (page && !page.isClosed()) {
        try {
          await page.close();
        } catch (e) {
          console.error(`[ProductListCollector] Error closing page for ${pageNumber}:`, e);
        }
      }
      if (context) {
        try {
          await context.close();
        } catch (e) {
          console.error(`[ProductListCollector] Error closing context for ${pageNumber}:`, e);
        }
      }
    };

    const abortListener = () => {
      debugLog(`[ProductListCollector] Abort signal received for page ${pageNumber}. Cleaning up page/context.`);
      cleanupPageAndContext().catch(e => console.error(`[ProductListCollector] Error in abort listener cleanup for page ${pageNumber}:`, e));
    };

    try {
      signal.addEventListener('abort', abortListener, { once: true });
      if (signal.aborted) throw new Error('Aborted');

      context = await this.browser.newContext();
      if (signal.aborted) throw new Error('Aborted');

      page = await context.newPage();
      if (signal.aborted) throw new Error('Aborted');
      
      debugLog(`[ProductListCollector] Navigating to ${pageUrl} for page ${pageNumber}`);
      await page.goto(pageUrl, { waitUntil: 'domcontentloaded' });

      if (signal.aborted) {
        debugLog(`[ProductListCollector] Crawl for page ${pageNumber} aborted during navigation/load.`);
        throw new Error('Aborted');
      }

      const actualLastPageProductCount = ProductListCollector.lastPageProductCount ?? 0;

      const sitePageNumber = PageIndexManager.toSitePageNumber(pageNumber, totalPages);
      const offset = PageIndexManager.calculateOffset(actualLastPageProductCount);

      debugLog(`[ProductListCollector] 페이지 ${pageNumber} 크롤링 (sitePageNumber: ${sitePageNumber}, lastPageProductCount: ${actualLastPageProductCount}, offset: ${offset})`);

      const rawProducts = await page.evaluate(() => {
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
      });

      const products: Product[] = rawProducts
        .map((product) => {
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

      debugLog(`[ProductListCollector] Successfully crawled ${products.length} products from page ${pageNumber}.`);
      return products;
    } catch (error: unknown) {
      if (signal.aborted) {
        debugLog(`[ProductListCollector] Crawl for page ${pageNumber} confirmed aborted in catch block.`);
        throw new Error(`Aborted crawling for page ${pageNumber}`);
      }
      console.error(`[ProductListCollector] Error crawling page ${pageNumber}:`, error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to crawl page ${pageNumber}: ${errorMessage}`);
    } finally {
      signal.removeEventListener('abort', abortListener);
      await cleanupPageAndContext();
    }
  }

  /**
   * 새로 가져온 제품과 캐시된 제품을 병합하고 캐시를 업데이트합니다.
   * @param pageNumber 대상 페이지 번호
   * @param newProducts 새로 가져온 제품 목록
   * @returns 병합되고 URL 기준으로 중복 제거된 제품 목록
   */
  private mergePageProducts(pageNumber: number, newProducts: Product[]): Product[] {
    const existingProducts = this.productCache.get(pageNumber) || [];
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
    this.productCache.set(pageNumber, mergedProducts);
    return mergedProducts;
  }

  /**
   * 수집된 제품들을 최종적으로 정리하여 반환합니다.
   * @param pageNumbersToCrawl 크롤링 대상이었던 페이지 번호 목록
   * @returns 모든 페이지에서 수집된 제품의 통합 목록
   */
  private finalizeCollectedProducts(pageNumbersToCrawl: number[]): Product[] {
    let allProducts: Product[] = [];
    for (const pageNum of pageNumbersToCrawl) {
      const productsOnPage = this.productCache.get(pageNum) || [];
      allProducts = allProducts.concat(productsOnPage);
    }
    // TODO: Consider sorting or other final processing if necessary
    return allProducts;
  }

  /**
   * 타임아웃 처리가 있는 페이지 크롤링 함수
   */
  private async crawlPageWithTimeout(
    pageNumber: number,
    totalPages: number,
    signal: AbortSignal
  ): Promise<Product[]> {
    if (signal.aborted) {
      throw new Error('Aborted');
    }

    const products = await this.crawlProductsFromPage(pageNumber, totalPages, signal);

    return products;
  }
}