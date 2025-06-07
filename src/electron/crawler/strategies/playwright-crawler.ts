/**
 * playwright-crawler.ts
 * Playwright를 사용한 크롤링 전략 구현
 */

import { type Page, type BrowserContext } from 'playwright-chromium';
import { BrowserManager } from '../browser/BrowserManager.js';
import { type CrawlerConfig } from '../core/config.js';
import { debugLog } from '../../util.js';
import { delay } from '../utils/delay.js';
import { 
  PageInitializationError, PageContentExtractionError, PageOperationError, 
  PageTimeoutError, PageNavigationError 
} from '../utils/page-errors.js';
import { RawProductData, SitePageInfo } from '../tasks/product-list-types.js';
import { MAX_FETCH_TOTAL_PAGES_ATTEMPTS, RETRY_DELAY_MS } from '../tasks/product-list-constants.js';
import { ICrawlerStrategy } from './crawler-strategy.js';

/**
 * Playwright를 사용한 크롤링 전략 구현
 */
export class PlaywrightCrawlerStrategy implements ICrawlerStrategy {
  private readonly browserManager: BrowserManager;
  private readonly matterFilterUrl: string;
  private readonly pageTimeoutMs: number;
  private readonly minRequestDelayMs: number;

  /**
   * Playwright 크롤링 전략 생성
   * @param browserManager 브라우저 매니저
   * @param config 크롤러 설정
   */
  constructor(browserManager: BrowserManager, config: CrawlerConfig) {
    this.browserManager = browserManager;
    this.matterFilterUrl = config.matterFilterUrl || '';
    this.pageTimeoutMs = config.pageTimeoutMs || 90000; // 60초에서 90초로 증가하여 타임아웃 방지
    this.minRequestDelayMs = config.minRequestDelayMs || 500;
  }

  /**
   * 전략 초기화
   */
  public async initialize(): Promise<void> {
    // Playwright 전략을 위한 추가 초기화가 필요한 경우 구현
    debugLog('[PlaywrightCrawlerStrategy] 초기화 완료');
  }

  /**
   * 특정 페이지 번호의 제품 목록을 크롤링
   * @param pageNumber 페이지 번호
   * @param signal 중단 신호
   * @param attempt 시도 횟수
   * @returns 크롤링 결과
   */
  public async crawlPage(pageNumber: number, signal: AbortSignal, attempt: number = 1): Promise<{
    rawProducts: RawProductData[];
    url: string;
    pageNumber: number;
    attempt: number;
  }> {
    if (signal.aborted) {
      throw new PageNavigationError('Aborted before page crawling started', pageNumber, attempt);
    }

    const pageUrl = `${this.matterFilterUrl}&paged=${pageNumber}`;
    const timeout = this.pageTimeoutMs;
    const pageStartTime = Date.now();

    // 상세 페이지 타임아웃 로깅
    debugLog(`[PlaywrightCrawler] Starting page ${pageNumber} crawl (attempt ${attempt}) - URL: ${pageUrl}, Timeout: ${timeout}ms`);

    let context: BrowserContext | null = null;
    let page: Page | null = null;

    try {
      context = await this.browserManager.createContext();
      page = await this.browserManager.createPageInContext(context);
      
      if (!page) {
        throw new PageInitializationError('Failed to create page in new context', pageNumber, attempt);
      }

      if (attempt > 1) {
        await delay(this.minRequestDelayMs);
        debugLog(`[PlaywrightCrawler] Page ${pageNumber} - Applied retry delay of ${this.minRequestDelayMs}ms`);
      }
      
      await this.optimizePage(page);
      debugLog(`[PlaywrightCrawler] Page ${pageNumber} - Page optimization completed`);
      
      const navStartTime = Date.now();
      await this.optimizedNavigation(page, pageUrl, timeout);
      const navElapsed = Date.now() - navStartTime;
      debugLog(`[PlaywrightCrawler] Page ${pageNumber} - Navigation completed in ${navElapsed}ms`);

      const extractStartTime = Date.now();
      const rawProducts = await page.evaluate<RawProductData[]>(this.extractProductsFromPageDOM);
      const extractElapsed = Date.now() - extractStartTime;
      const totalElapsed = Date.now() - pageStartTime;
      
      debugLog(`[PlaywrightCrawler] Page ${pageNumber} - Product extraction completed in ${extractElapsed}ms, found ${rawProducts.length} products`);
      debugLog(`[PlaywrightCrawler] Page ${pageNumber} - ✅ Total page crawl completed in ${totalElapsed}ms (timeout was ${timeout}ms)`);

      return {
        rawProducts,
        url: pageUrl,
        pageNumber,
        attempt
      };

    } catch (error: unknown) {
      const errorElapsed = Date.now() - pageStartTime;
      debugLog(`[PlaywrightCrawler] Page ${pageNumber} - ❌ Error occurred after ${errorElapsed}ms (timeout was ${timeout}ms)`);
      
      if (error instanceof PageOperationError) throw error;

      if (error instanceof Error) {
        if (error.name === 'TimeoutError') {
          debugLog(`[PlaywrightCrawler] Page ${pageNumber} - Timeout error: ${error.message}`);
          throw new PageTimeoutError(`Page ${pageNumber} timed out after ${timeout}ms on attempt ${attempt}. Actual elapsed: ${errorElapsed}ms. URL: ${pageUrl}`, pageNumber, attempt);
        }
        debugLog(`[PlaywrightCrawler] Page ${pageNumber} - General error: ${error.message}`);
        throw new PageOperationError(`Error crawling page ${pageNumber} (attempt ${attempt}): ${error.message}. Elapsed: ${errorElapsed}ms. URL: ${pageUrl}`, pageNumber, attempt);
      }
      
      debugLog(`[PlaywrightCrawler] Page ${pageNumber} - Unknown error type`);
      throw new PageOperationError(`Unknown error crawling page ${pageNumber} (attempt ${attempt}). Elapsed: ${errorElapsed}ms. URL: ${pageUrl}`, pageNumber, attempt);
    } finally {
      if (page) {
        await this.browserManager.closePageAndContext(page);
      } else if (context) {
        await context.close();
      }
    }
  }

  /**
   * 전체 페이지 수와 마지막 페이지 제품 수 조회
   */
  public async fetchTotalPages(): Promise<SitePageInfo> {
    const MAX_FETCH_ATTEMPTS = MAX_FETCH_TOTAL_PAGES_ATTEMPTS;

    for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt++) {
      let context: BrowserContext | null = null;
      let page: Page | null = null;
      
      try {
        debugLog(`[PlaywrightCrawlerStrategy] fetchTotalPages - Attempt ${attempt}/${MAX_FETCH_ATTEMPTS}`);
        context = await this.browserManager.createContext();
        page = await this.browserManager.createPageInContext(context);
        
        if (!page) {
          throw new PageInitializationError('Failed to create page in new context for fetchTotalPages', 0, attempt);
        }

        if (!this.matterFilterUrl) {
          throw new Error('Configuration error: matterFilterUrl is not defined.');
        }

        if (attempt > 1) {
          await delay(RETRY_DELAY_MS / 2);
        }

        debugLog(`[PlaywrightCrawlerStrategy] Navigating to ${this.matterFilterUrl} to fetch total pages (Attempt ${attempt}).`);
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
        
        debugLog(`[PlaywrightCrawlerStrategy] Determined ${totalPages} total pages from pagination elements (Attempt ${attempt}).`);

        let lastPageProductCount = 0;
        if (totalPages > 0) {
          const lastPageUrl = `${this.matterFilterUrl}&paged=${totalPages}`;
          debugLog(`[PlaywrightCrawlerStrategy] Navigating to last page: ${lastPageUrl} (Attempt ${attempt})`);
          
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
            debugLog(`[PlaywrightCrawlerStrategy] Last page ${totalPages} has ${lastPageProductCount} products (Attempt ${attempt}).`);
          }
        } else {
          debugLog(`[PlaywrightCrawlerStrategy] No pagination elements found or totalPages is 0. Checking current page for products (Attempt ${attempt}).`);
          
          if (page) {
            try {
              lastPageProductCount = await page.evaluate(() => {
                return document.querySelectorAll('div.post-feed article').length;
              });
            } catch (evalError: any) {
              throw new PageContentExtractionError(`Failed to count products on initial page (no pagination) (Attempt ${attempt}): ${evalError?.message || String(evalError)}`, 1, attempt);
            }

            if (lastPageProductCount > 0 && totalPages <= 0) {
              totalPages = 1;
              debugLog(`[PlaywrightCrawlerStrategy] Found ${lastPageProductCount} products on the first page. Setting totalPages to 1 (Attempt ${attempt}).`);
            } else if (totalPages <= 0 && lastPageProductCount <= 0) {
              debugLog(`[PlaywrightCrawlerStrategy] No products found on the first page and no pagination. totalPages remains 0 (Attempt ${attempt}).`);
              throw new PageContentExtractionError(`No pages or products found on the site (Attempt ${attempt}).`, 0, attempt);
            }
          } else {
            throw new PageInitializationError('Page object was null when trying to count products on initial page.', 0, attempt);
          }
        }

        // After all checks, if totalPages is still not positive, it's a failure for this attempt.
        if (totalPages <= 0) {
          throw new PageContentExtractionError(`Site reported ${totalPages} pages. This is considered an error (Attempt ${attempt}).`, totalPages, attempt);
        }

        // If successful and totalPages > 0, return the result
        return {
          totalPages,
          lastPageProductCount,
          fetchedAt: Date.now()
        };

      } catch (error: unknown) {
        const attemptError = error instanceof PageOperationError ? error :
          new PageOperationError(error instanceof Error ? error.message : String(error), 0, attempt);

        console.warn(`[PlaywrightCrawlerStrategy] fetchTotalPages - Attempt ${attempt}/${MAX_FETCH_ATTEMPTS} failed: ${attemptError.message}`);

        if (attempt === MAX_FETCH_ATTEMPTS) {
          console.error(`[PlaywrightCrawlerStrategy] fetchTotalPages - All ${MAX_FETCH_ATTEMPTS} attempts failed. Last error: ${attemptError.message}`, attemptError);
          throw new PageInitializationError(`Failed to get total pages after ${MAX_FETCH_ATTEMPTS} attempts: ${attemptError.message}`, 0, attempt);
        }
        
        await delay(RETRY_DELAY_MS);
      } finally {
        if (page) {
          try {
            await this.browserManager.closePageAndContext(page);
          } catch (e) {
            console.error(`[PlaywrightCrawlerStrategy] Error releasing page and context in fetchTotalPages (Attempt ${attempt}):`, e);
          }
        } else if (context) {
          try {
            await context.close();
          } catch (e) {
            console.error(`[PlaywrightCrawlerStrategy] Error releasing context in fetchTotalPages (Attempt ${attempt}):`, e);
          }
        }
      }
    }
    
    throw new PageInitializationError(`Failed to get total pages after ${MAX_FETCH_ATTEMPTS} attempts (unexpectedly reached end of retry loop).`, 0, MAX_FETCH_ATTEMPTS);
  }

  /**
   * 리소스 정리
   */
  public async cleanup(): Promise<void> {
    // Playwright 관련 리소스 정리
    debugLog('[PlaywrightCrawlerStrategy] 리소스 정리 완료');
  }

  /**
   * 페이지 최적화 (리소스 차단 등)
   */
  private async optimizePage(page: Page): Promise<void> {
    // 더 공격적인 리소스 차단
    await page.route('**/*', (route) => {
      const request = route.request();
      const resourceType = request.resourceType();
      const url = request.url();
      
      // HTML과 필수 CSS만 허용
      if (resourceType === 'document' || 
          (resourceType === 'stylesheet' && url.includes('main'))) {
        route.continue();
      } else {
        route.abort();
      }
    });
  }

  /**
   * 최적화된 네비게이션 함수
   */
  private async optimizedNavigation(page: Page, url: string, timeout: number): Promise<boolean> {
    let navigationSucceeded = false;
    const startTime = Date.now();
    
    // 상세 타임아웃 로깅
    debugLog(`[PlaywrightNavigation] Starting optimized navigation to ${url}, timeout: ${timeout}ms`);
    
    try {
      // 첫 시도: 매우 짧은 타임아웃으로 시도
      const firstAttemptTimeout = Math.min(5000, timeout / 3);
      debugLog(`[PlaywrightNavigation] First attempt with timeout: ${firstAttemptTimeout}ms`);
      
      await page.goto(url, { 
        waitUntil: 'domcontentloaded', // 더 가벼운 로드 조건
        timeout: firstAttemptTimeout
      });
      navigationSucceeded = true;
      const elapsedTime = Date.now() - startTime;
      debugLog(`[PlaywrightNavigation] ✅ First attempt succeeded in ${elapsedTime}ms`);
    } catch (error: any) {
      const firstAttemptElapsed = Date.now() - startTime;
      debugLog(`[PlaywrightNavigation] ⚠️ First attempt failed after ${firstAttemptElapsed}ms: ${error?.message || 'Unknown error'}`);
      
      if (error && error.name === 'TimeoutError') {
        // 타임아웃 발생해도 HTML이 로드되었다면 성공으로 간주
        const readyState = await page.evaluate(() => document.readyState).catch(() => 'unknown');
        debugLog(`[PlaywrightNavigation] Document readyState after timeout: ${readyState}`);
        
        if (readyState !== 'loading' && readyState !== 'unknown') {
          navigationSucceeded = true;
          debugLog(`[PlaywrightNavigation] ✅ Navigation timed out but document is in '${readyState}' state. Continuing... (${firstAttemptElapsed}ms)`);
        } else {
          // 첫 시도 실패 시, 두 번째 시도 - 조금 더 긴 타임아웃
          const secondAttemptTimeout = timeout / 2;
          debugLog(`[PlaywrightNavigation] Starting second attempt with timeout: ${secondAttemptTimeout}ms`);
          
          try {
            await page.goto(url, { 
              waitUntil: 'domcontentloaded',
              timeout: secondAttemptTimeout
            });
            navigationSucceeded = true;
            const totalElapsed = Date.now() - startTime;
            debugLog(`[PlaywrightNavigation] ✅ Second attempt succeeded in ${totalElapsed}ms total`);
          } catch (secondError: any) {
            const totalElapsed = Date.now() - startTime;
            debugLog(`[PlaywrightNavigation] ❌ Second attempt failed after ${totalElapsed}ms total: ${secondError?.message || 'Unknown error'}`);
            // 최종 실패 시 오류 로깅
            debugLog(`[PlaywrightNavigation] Navigation failed after retry: ${secondError && secondError.message ? secondError.message : 'Unknown error'}`);
          }
        }
      } else {
        debugLog(`[PlaywrightNavigation] ❌ Non-timeout error in first attempt: ${error?.message || 'Unknown error'}`);
      }
    }
    
    const totalElapsed = Date.now() - startTime;
    debugLog(`[PlaywrightNavigation] Navigation ${navigationSucceeded ? 'succeeded' : 'failed'} - Total time: ${totalElapsed}ms, Target timeout: ${timeout}ms`);
    
    return navigationSucceeded;
  }

  /**
   * 페이지에서 제품 정보 추출 (DOM 분석)
   */
  private extractProductsFromPageDOM(): RawProductData[] {
    // @ts-ignore - document is available at runtime
    const articles = Array.from(document.querySelectorAll('div.post-feed article'));
    return articles.reverse().map((article, siteIndexInPage) => {
      // @ts-ignore - article is Element at runtime
      const link = article.querySelector('a');
      // @ts-ignore - article is Element at runtime
      const manufacturerEl = article.querySelector('p.entry-company.notranslate');
      // @ts-ignore - article is Element at runtime
      const modelEl = article.querySelector('h3.entry-title');
      // @ts-ignore - article is Element at runtime
      const certificateIdEl = article.querySelector('span.entry-cert-id');
      // @ts-ignore - article is Element at runtime
      const certificateIdPEl = article.querySelector('p.entry-certificate-id');
      let certificateId;

      // @ts-ignore - certificateIdPEl is Element at runtime
      if (certificateIdPEl && certificateIdPEl.textContent) {
        const text = certificateIdPEl.textContent.trim();
        if (text.startsWith('Certificate ID: ')) {
          certificateId = text.replace('Certificate ID: ', '').trim();
        } else {
          certificateId = text;
        }
      // @ts-ignore - certificateIdEl is Element at runtime
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
}
