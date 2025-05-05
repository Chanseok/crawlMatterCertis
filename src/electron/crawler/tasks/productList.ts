/**
 * productList.ts
 * 제품 목록 수집을 담당하는 클래스
 */

import { chromium } from 'playwright-chromium';
// import { getDatabaseSummaryFromDb } from '../../database.js';
import { getRandomDelay, delay } from '../utils/delay.js';
import { CrawlerState } from '../core/CrawlerState.js';
import {
  promisePool, updateTaskStatus, initializeTaskStates,
} from '../utils/concurrency.js';

import type { CrawlResult } from '../utils/types.js';
import type { Product } from '../../../../types.js';
import { debugLog } from '../../util.js';
import { getConfig } from '../core/config.js';
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

  // 마지막 페이지 제품 수를 저장하는 캐시 변수
  private static lastPageProductCount: number | null = null;
  

  constructor(state: CrawlerState, abortController: AbortController) {
    this.state = state;
    this.abortController = abortController;
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
    try {
      this.state.setStage('productList:init', '1단계: 제품 목록 페이지 수 파악 중');
      this.processedPages = 0;
  
      // 총 페이지 수와 마지막 페이지 제품 수 가져오기
      const { totalPages, lastPageProductCount } = await ProductListCollector.fetchTotalPagesCached();
      debugLog(`Total pages: ${totalPages}, Last page product count: ${lastPageProductCount}`);
      
      // 크롤링 범위 결정 (마지막 페이지 제품 수도 함께 전달)
      const { startPage, endPage } = await PageIndexManager.calculateCrawlingRange(
        totalPages, 
        lastPageProductCount,
        userPageLimit
      );
      debugLog(`Crawling range: ${startPage} to ${endPage}`);
      
      // 사용자 설정 페이지 수에 따른 범위 계산
      const pageNumbers = Array.from({ length: startPage - endPage + 1 }, (_, i) => endPage + i).reverse();
      debugLog(`Page numbers to crawl: ${pageNumbers}`);
      // 설정값 가져오기
      const config = getConfig();
      
      // 수집할 페이지 범위 정보 이벤트 발송
      crawlerEvents.emit('crawlingTaskStatus', {
        taskId: 'list-range',
        status: 'running',
        message: JSON.stringify({
          stage: 1,
          type: 'range',
          totalPages,
          startPage,
          endPage,
          pageCount: pageNumbers.length,
          estimatedProductCount: pageNumbers.length * config.productsPerPage,
          lastPageProductCount // 마지막 페이지 제품 수 추가
        })
      });
  
      // 수집해야할 페이지가 없는 경우
      if (pageNumbers.length === 0) {
        console.log('[ProductListCollector] No new pages to crawl. Database is up to date.');
        
        // 상태 업데이트
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
  
      // 진행 상태 업데이트
      this.state.updateProgress({
        totalPages,
        currentPage: 0,
        totalItems: pageNumbers.length * config.productsPerPage,
        currentItem: 0
      });
  
      this.state.setStage('productList:fetching', '1/2단계: 제품 목록 수집 중');
      debugLog(`Total pages to crawl: ${pageNumbers.length} (range: ${startPage}~${endPage}, total site pages: ${totalPages})`);
  
      const productsResults: Product[] = [];
      const failedPages: number[] = [];
      const failedPageErrors: Record<number, string[]> = {};
  
      // 작업 상태 초기화
      initializeTaskStates(pageNumbers);
  
      // 페이지 범위 정보 로그
      console.log(`[ProductListCollector] Preparing to crawl pages ${pageNumbers[0]} to ${pageNumbers[pageNumbers.length - 1]}, total: ${pageNumbers.length} pages`);
  
      // 초기 페이지 수집 상태 추적
      const pageCollectionStatus = new Map<number, boolean>();
      pageNumbers.forEach(pageNumber => {
        pageCollectionStatus.set(pageNumber, false);
      });
  
      // 1차 병렬 크롤링 실행
      debugLog(`Starting phase 1: crawling product lists from page ${pageNumbers[0]} to ${pageNumbers[pageNumbers.length - 1]}`);
  
      await this.executeParallelCrawling(
        pageNumbers,
        totalPages,
        productsResults,
        failedPages,
        failedPageErrors,
        config.initialConcurrency ?? 5 // Provide a default value if undefined
      );
  
      // 중단 여부 처리
      if (this.abortController.signal.aborted) {
        console.log('[ProductListCollector] Crawling was stopped during product list collection.');
        return productsResults;
      }
  
      // 1차 수집 후 성공한 페이지들 상태 업데이트
      pageNumbers.forEach(pageNumber => {
        if (!failedPages.includes(pageNumber)) {
          pageCollectionStatus.set(pageNumber, true);
        }
      });
  
      // 실패한 페이지 재시도
      const initialFailedPages = [...failedPages];
      if (failedPages.length > 0) {
        console.log(`[ProductListCollector] Retrying ${failedPages.length} failed pages.`);
        await this.retryFailedPages(
          failedPages,
          totalPages,
          productsResults,
          failedPageErrors
        );
  
        // 재시도 후 성공한 페이지들 상태 업데이트
        debugLog(`${failedPages.length} pages failed after retrying.`);
        initialFailedPages.forEach(pageNumber => {
          if (!failedPages.includes(pageNumber)) {
            pageCollectionStatus.set(pageNumber, true);
          }
        });
      }
  
      // 중단 여부 처리
      if (this.abortController.signal.aborted) {
        console.log('[ProductListCollector] Crawling was stopped during product list collection.');
        return productsResults;
      }
  
      // 최종 수집 실패율 계산
      const totalPagesToFetch = pageNumbers.length;
      const totalFailedPages = failedPages.length;
      const failureRate = totalFailedPages / totalPagesToFetch;
  
      // 실패율 로깅
      const initialFailRate = initialFailedPages.length / totalPagesToFetch;
      const finalFailRate = failureRate;
      console.log(`[ProductListCollector] Initial failure rate: ${(initialFailRate * 100).toFixed(1)}% (${initialFailedPages.length}/${totalPagesToFetch})`);
      console.log(`[ProductListCollector] Final failure rate after retries: ${(finalFailRate * 100).toFixed(1)}% (${totalFailedPages}/${totalPagesToFetch})`);
  
      // 실패 상태 기록
      failedPages.forEach(pageNumber => {
        const errors = failedPageErrors[pageNumber] || ['Unknown error'];
        this.state.addFailedPage(pageNumber, errors.join('; '));
      });
  
      // 수집 성공률 통계
      const successPages = pageNumbers.length - totalFailedPages;
      const successRate = successPages / totalPagesToFetch;
      console.log(`[ProductListCollector] Collection success rate: ${(successRate * 100).toFixed(1)}% (${successPages}/${totalPagesToFetch})`);
  
      // 수집 완료 상태 이벤트 발송
      crawlerEvents.emit('crawlingTaskStatus', {
        taskId: 'list-complete',
        status: 'success',
        message: JSON.stringify({
          stage: 1,
          type: 'complete',
          totalPages,
          processedPages: successPages,
          collectedProducts: productsResults.length,
          failedPages: totalFailedPages,
          successRate: parseFloat((successRate * 100).toFixed(1))
        })
      });
      
      // 제품 목록 반환
      this.state.setStage('productList:processing', '수집된 제품 목록 처리 중');
      this.state.addProducts(productsResults);
  
      return productsResults;
    } finally  {
      // 리소스 정리
      this.cleanupResources();
    }
  }

  /**
   * 리소스 정리 함수
   */
  private cleanupResources(): void {
    console.log('[ProductListCollector] Cleaning up resources...');

  // 열려있는 브라우저 인스턴스나 기타 리소스 정리
  // 단, abortController는 호출하지 않음 - 이것은 CrawlerEngine의 책임
  
  // 기존 코드:
  // if (!this.abortController.signal.aborted) {
  //   this.abortController.abort();
  // }
  
  // 모든 인스턴스 관련 정리 코드만 유지
  // 예: browser.close() 관련 코드
  }

/**
 * 캐시된 페이지 정보 반환 또는 최신화
 */
public async getTotalPagesCached(force = false): Promise<number> {
  const { totalPages } = await ProductListCollector.fetchTotalPagesCached(force);
  return totalPages;
}
/**
 * 정적 메서드: 캐시된 전체 페이지 수와 마지막 페이지 제품 수를 가져오거나 최신화
 * 외부 모듈에서 쉽게 접근할 수 있는 간단한 API 제공
 */
public static async fetchTotalPagesCached(force = false): Promise<{
  totalPages: number;
  lastPageProductCount: number;
}> {
  const config = getConfig();
  const now = Date.now();
  // Provide a default TTL of 1 hour (3600000 ms) if not configured
  const cacheTtl = config.cacheTtlMs ?? 3600000; 
  
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

  const result = await ProductListCollector.fetchTotalPages();
  cachedTotalPages = result.totalPages;
  ProductListCollector.lastPageProductCount = result.lastPageProductCount;
  cachedTotalPagesFetchedAt = now;
  
  
  return result;
}

/**
 * 정적 메서드: 총 페이지 수와 마지막 페이지의 제품 수를 가져오는 함수
 */
private static async fetchTotalPages(): Promise<{ totalPages: number; lastPageProductCount: number }> {
  const config = getConfig();
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

    // 페이지네이션 정보 추출
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
    
    // 마지막 페이지로 이동하여 제품 수 확인
    if (totalPages > 0) {
      const lastPageUrl = `${config.matterFilterUrl}&paged=${totalPages}`;
      console.log(`[ProductListCollector] Navigating to last page: ${lastPageUrl}`);
      await page.goto(lastPageUrl, { waitUntil: 'domcontentloaded' });
      
      // 제품 개수 계산
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
 * 정적 메서드: 크롤링 범위를 결정하는 함수
 * 특정 인스턴스 없이도 크롤링 범위를 파악할 수 있음
 * @param totalPages 총 페이지 수
 * @param userPageLimit 사용자가 설정한 페이지 수 제한 (선택적)
 */
public static async determineCrawlingRange(totalPages: number, userPageLimit: number = 0): Promise<{ startPage: number; endPage: number }> {
  // 마지막 페이지 제품 수 가져오기
  const { lastPageProductCount } = await ProductListCollector.fetchTotalPagesCached();
  
  // PageIndexManager를 사용하여 크롤링 범위 계산
  return await PageIndexManager.calculateCrawlingRange(totalPages, lastPageProductCount, userPageLimit);
}

/**
 * 마지막 페이지의 제품 수를 가져오는 함수
 * 이 정보는 옵셋 계산에 사용됨
 */
public async getLastPageProductCount(force = false): Promise<number> {
  // fetchTotalPagesCached 함수를 활용하여 마지막 페이지의 제품 수를 가져옴
  const { lastPageProductCount } = await ProductListCollector.fetchTotalPagesCached(force);
  return lastPageProductCount;
}

/**
 * 특정 페이지의 제품 정보 목록을 크롤링하는 함수
 */
private async crawlProductsFromPage(pageNumber: number, totalPages: number, signal: AbortSignal): Promise<Product[]> {
  const config = getConfig();
  
  // 서버 과부하 방지를 위한 무작위 지연 시간 적용
  const delayTime = getRandomDelay(config.minRequestDelayMs ?? 1000, config.maxRequestDelayMs ?? 3000);
  await delay(delayTime);

  // 중단 확인
  if (signal.aborted) {
    throw new Error('Aborted');
  }

  const pageUrl = `${config.matterFilterUrl}&paged=${pageNumber}`;
  const browser = await chromium.launch({ headless: true });

  try {
    // 중단 신호 확인 - 브라우저 생성 직후
    if (signal.aborted) {
      throw new Error('Aborted');
    }

    const context = await browser.newContext();
    const page = await context.newPage();

    // 중단 시 브라우저 작업을 취소하기 위한 이벤트 리스너
    const abortListener = () => {
      if (!browser.isConnected()) return;
      browser.close().catch(e => console.error('Error closing browser after abort:', e));
    };
    signal.addEventListener('abort', abortListener);

    // 페이지 로드를 시작하기 전에 중단 신호 확인
    if (signal.aborted) {
      throw new Error('Aborted');
    }

    await page.goto(pageUrl, { waitUntil: 'domcontentloaded' });

    // 중단 신호 확인 - 페이지 이동 직후
    if (signal.aborted) {
      throw new Error('Aborted');
    }

    // 마지막 페이지의 제품 수 확인 (캐시 사용)
    const lastPageProductCount = await this.getLastPageProductCount();
    
    // sitePageNumber 계산 (새로운 제품일수록 숫자가 작아짐)
    const sitePageNumber = PageIndexManager.toSitePageNumber(pageNumber, totalPages);
    
    // 옵셋 계산
    const offset = PageIndexManager.calculateOffset(lastPageProductCount);
    
    console.log(`[ProductListCollector] 페이지 ${pageNumber} 크롤링 (sitePageNumber: ${sitePageNumber}, lastPageProductCount: ${lastPageProductCount}, offset: ${offset})`);

    // 제품 정보 추출 - 기본 정보와 페이지 내 인덱스만 가져오고 인덱싱은 서버 측에서 처리
    const rawProducts = await page.evaluate(() => {
      const articles = Array.from(document.querySelectorAll('div.post-feed article'));
      
      // 최신순으로 정렬된 제품 리스트를 가져옴
      return articles.reverse().map((article, siteIndexInPage) => {
        // 제품 기본 정보 추출
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
          siteIndexInPage  // 페이지 내 인덱스만 반환
        };
      });
    });

    // 서버 측에서 PageIndexManager의 mapToLocalIndexing 함수를 활용하여 페이지 ID와 인덱스 계산
    const products: Product[] = rawProducts
      .map((product) => {
      const { siteIndexInPage } = product;
      
      // PageIndexManager의 mapToLocalIndexing 함수 활용
      const { pageId, indexInPage } = PageIndexManager.mapToLocalIndexing(
        sitePageNumber, 
        siteIndexInPage, 
        offset
      );
      
      return {
        ...product,
        pageId,
        indexInPage,
        sitePageNumber,  // 디버깅용 추가 정보
        siteIndexInPage  // 디버깅용 추가 정보
      };
      })
      .sort((a, b) => {
      if (a.pageId !== b.pageId) {
        return a.pageId - b.pageId;
      }
      return a.indexInPage - b.indexInPage;
      });

    if (products.length == 0) {
      debugLog(`[Extracted ${products.length} products on page ${pageNumber}`);
      throw new Error(`Failed to crawl page ${pageNumber}: No products found`);
    }

    return products;
  } catch (error: unknown) {
    if (signal.aborted) {
      throw new Error(`Aborted crawling for page ${pageNumber}`);
    }
    console.error(`[ProductListCollector] Error crawling page ${pageNumber}:`, error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to crawl page ${pageNumber}: ${errorMessage}`);
  } finally {
    try {
      // 중단 여부와 상관없이 항상 브라우저 종료 시도
      if (browser.isConnected()) {
        await browser.close();
      }
    } catch (e) {
      console.error(`Error while closing browser for page ${pageNumber}:`, e);
    }
  }
}
  /**
  * 타임아웃 처리가 있는 페이지 크롤링 함수
  */
  private async crawlPageWithTimeout(
    pageNumber: number,
    totalPages: number,
    productsResults: Product[],
    signal: AbortSignal
  ): Promise<Product[]> {
    const pageId = totalPages - pageNumber;

    // 중단 확인
    if (signal.aborted) {
      throw new Error('Aborted');
    }

    const hasDuplicatePage = productsResults.some(product => product.pageId === pageId);

    if (hasDuplicatePage) {
      console.log(`[ProductListCollector] Skipping duplicate page ${pageNumber} (pageId: ${pageId})`);
      return [];
    }

    // signal을 crawlProductsFromPage에 전달
    const products = await this.crawlProductsFromPage(pageNumber, totalPages, signal);

    if (products && products.length > 0) {
      productsResults.push(...products);
      console.log(`[ProductListCollector] Added ${products.length} products from page ${pageNumber} (pageId: ${pageId})`);
    }

    return products;
  }

  /**
 * 단일 페이지 크롤링 작업을 처리하는 함수
 */
  private async processPageCrawl(
    pageNumber: number,
    totalPages: number,
    productsResults: Product[],
    failedPages: number[],
    failedPageErrors: Record<number, string[]>,
    signal: AbortSignal,
    attempt: number = 1
  ): Promise<CrawlResult | null> {
    const config = getConfig();
    
    if (signal.aborted) {
      updateTaskStatus(pageNumber, 'stopped');
      return null;
    }

    // 상세 작업 상태 이벤트 발송 (JSON 구조화)
    crawlerEvents.emit('crawlingTaskStatus', {
      taskId: `page-${pageNumber}`,
      status: 'running',
      message: JSON.stringify({
        stage: 1,
        type: 'page',
        pageNumber,
        url: `${config.matterFilterUrl}&paged=${pageNumber}`,
        attempt: attempt,
        startTime: new Date().toISOString()
      })
    });

    updateTaskStatus(pageNumber, 'running');

    try {
      // signal을 crawlPageWithTimeout에 전달
      const products = await Promise.race([
        this.crawlPageWithTimeout(pageNumber, totalPages, productsResults, signal),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), config.pageTimeoutMs)
        )
      ]);

      // 진행 상태 업데이트
      this.state.updateProgress({
        currentPage: pageNumber
      });
      
      // 페이지 성공적으로 처리했으면 진행 상황 업데이트
      this.updateProgress();

      // 상세 작업 완료 이벤트 발송 (JSON 구조화)
      crawlerEvents.emit('crawlingTaskStatus', {
        taskId: `page-${pageNumber}`,
        status: 'success',
        message: JSON.stringify({
          stage: 1,
          type: 'page',
          pageNumber,
          productsCount: products?.length || 0,
          endTime: new Date().toISOString()
        })
      });

      updateTaskStatus(pageNumber, 'success');
      return { pageNumber, products };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const status = signal.aborted ? 'stopped' : 'error';
      updateTaskStatus(pageNumber, status, errorMsg);

      // 실패 이벤트 발송 (JSON 구조화)
      crawlerEvents.emit('crawlingTaskStatus', {
        taskId: `page-${pageNumber}`,
        status: 'error',
        message: JSON.stringify({
          stage: 1,
          type: 'page',
          pageNumber,
          error: errorMsg,
          attempt: attempt,
          endTime: new Date().toISOString()
        })
      });

      failedPages.push(pageNumber);
      if (!failedPageErrors[pageNumber]) {
        failedPageErrors[pageNumber] = [];
      }

      const attemptPrefix = attempt > 1 ? `Attempt ${attempt}: ` : '';
      failedPageErrors[pageNumber].push(`${attemptPrefix}${errorMsg}`);

      return { pageNumber, products: null, error: errorMsg };
    }
  }

  /**
   * 병렬 크롤링 실행
   */
  private async executeParallelCrawling(
    pageNumbers: number[],
    totalPages: number,
    productsResults: Product[],
    failedPages: number[],
    failedPageErrors: Record<number, string[]>,
    concurrency: number
  ): Promise<void> {
    await promisePool(
      pageNumbers,
      async (pageNumber, signal) => this.processPageCrawl(
        pageNumber, totalPages, productsResults, failedPages, failedPageErrors, signal
      ),
      concurrency,
      this.abortController
    );
  }

  /**
   * 실패한 페이지를 재시도하는 함수
   */
  private async retryFailedPages(
    failedPages: number[],
    totalPages: number,
    productsResults: Product[],
    failedPageErrors: Record<number, string[]>
  ): Promise<void> {
    // 재시도 설정 가져오기
    const config = getConfig();
    const productListRetryCount = config.productListRetryCount ?? 3; // Default to 3 retries
    
    // 재시도 횟수가 0이면 재시도 하지 않음
    if (productListRetryCount <= 0) {
      debugLog(`[RETRY] 재시도 횟수가 0으로 설정되어 페이지 재시도를 건너뜁니다.`);
      return;
    }
    
    // 재시도 최대 횟수 계산 (retryStart는 첫 번째 재시도 회차)
    const retryStart = config.retryStart ?? 1; // Default to starting from attempt 1
    const maxRetry = retryStart + productListRetryCount - 1;
    
    // 재시도 시작 전 상태 초기화 (UI-STATUS-001)
    updateRetryStatus('list-retry', {
      stage: 'productList',
      currentAttempt: 1,
      maxAttempt: productListRetryCount,
      remainingItems: failedPages.length,
      totalItems: failedPages.length,
      startTime: Date.now(),
      itemIds: failedPages.map(page => page.toString())
    });
    
    for (let attempt = retryStart; attempt <= maxRetry && failedPages.length > 0; attempt++) {
      const retryPages = [...failedPages];
      failedPages.length = 0;
      
      // 현재 재시도 회차 상태 업데이트 (UI-STATUS-001)
      updateRetryStatus('list-retry', {
        currentAttempt: attempt - retryStart + 1,
        remainingItems: retryPages.length,
        itemIds: retryPages.map(page => page.toString())
      });
      
      // 재시도 상태 이벤트 발송 - 이제 기본 상태 메시지와 함께 상세 정보도 제공
      crawlerEvents.emit('crawlingTaskStatus', {
        taskId: 'list-retry',
        status: 'running',
        message: `페이지 목록 재시도 중 (${attempt - retryStart + 1}/${productListRetryCount}): ${retryPages.length}개 페이지`
      });
      
      debugLog(`[RETRY] 페이지 재시도 중 (${attempt - retryStart + 1}/${productListRetryCount}): ${retryPages.join(', ')}`);

      await promisePool(
        retryPages,
        async (pageNumber, signal) => {
          const result = await this.processPageCrawl(
            pageNumber, totalPages, productsResults, failedPages, failedPageErrors, signal, attempt
          );
          
          // 페이지 처리 결과에 따라 상세 로깅 (UI-STATUS-001)
          if (result) {
            if (result.error) {
              // 오류 정보 로깅
              logRetryError(
                'productList', 
                pageNumber.toString(),
                result.error,
                attempt - retryStart + 1
              );
            } else {
              // 성공 정보 로깅
              console.log(`[RETRY][${attempt - retryStart + 1}/${productListRetryCount}] 페이지 ${pageNumber} 재시도 성공`);
            }
            
            // 재시도 상태 업데이트 - 남은 항목 수 등
            updateRetryStatus('list-retry', {
              remainingItems: failedPages.length,
              itemIds: failedPages.map(page => page.toString())
            });
          }
          
          return result;
        },
        config.retryConcurrency ?? 1, // Provide a default value if undefined
        this.abortController
      );

      if (failedPages.length === 0) {
        debugLog('[RETRY] 모든 페이지 재시도 성공');
        
        // 성공 상태 이벤트 발송
        crawlerEvents.emit('crawlingTaskStatus', {
          taskId: 'list-retry',
          status: 'success',
          message: '페이지 목록 재시도 완료: 모든 페이지 성공'
        });
        
        // 최종 성공 상태 업데이트 (UI-STATUS-001)
        updateRetryStatus('list-retry', {
          remainingItems: 0,
          itemIds: [],
          currentAttempt: attempt - retryStart + 1
        });
        
        break;
      }
    }

    if (failedPages.length > 0) {
      debugLog(`[RETRY] ${productListRetryCount}회 재시도 후에도 실패한 페이지: ${failedPages.join(', ')}`);
      
      // 실패 상태 이벤트 발송
      crawlerEvents.emit('crawlingTaskStatus', {
        taskId: 'list-retry',
        status: 'error',
        message: `페이지 목록 재시도 완료: ${failedPages.length}개 페이지 실패`
      });
      
      // 최종 실패 상태 업데이트 (UI-STATUS-001)
      updateRetryStatus('list-retry', {
        remainingItems: failedPages.length,
        itemIds: failedPages.map(page => page.toString())
      });
      
      // 최종 실패 항목들 로깅
      failedPages.forEach(pageNumber => {
        const errors = failedPageErrors[pageNumber] || ['Unknown error'];
        console.error(`[RETRY] 페이지 ${pageNumber} 재시도 최종 실패: ${errors.join('; ')}`);
      });
    }
  }
}