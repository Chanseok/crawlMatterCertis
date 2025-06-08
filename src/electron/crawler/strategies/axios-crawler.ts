/**
 * axios-crawler.ts
 * Axios와 Cheerio를 사용한 크롤링 전략 구현
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { type CrawlerConfig } from '../../../../types.js';
import { debugLog } from '../../util.js';
import { delay } from '../utils/delay.js';
import { 
  PageInitializationError, PageContentExtractionError, PageOperationError, 
  PageTimeoutError, PageNavigationError 
} from '../utils/page-errors.js';
import type { RawProductData, SitePageInfo } from '../tasks/product-list-types.js';
import { MAX_FETCH_TOTAL_PAGES_ATTEMPTS, RETRY_DELAY_MS } from '../tasks/product-list-constants.js';
import type { ICrawlerStrategy } from './crawler-strategy.js';

/**
 * Axios와 Cheerio를 사용한 크롤링 전략 구현
 */
export class AxiosCrawlerStrategy implements ICrawlerStrategy {
  private readonly matterFilterUrl: string;
  private readonly pageTimeoutMs: number;
  private readonly minRequestDelayMs: number;
  private readonly userAgent: string;

  /**
   * Axios/Cheerio 크롤링 전략 생성
   * @param config 크롤러 설정
   */
  constructor(config: CrawlerConfig) {
    this.matterFilterUrl = config.matterFilterUrl || '';
    this.pageTimeoutMs = config.pageTimeoutMs || 90000; // 60초에서 90초로 증가하여 타임아웃 방지
    this.minRequestDelayMs = config.minRequestDelayMs || 500;
    this.userAgent = config.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';
  }

  /**
   * 크롤링에 필요한 HTTP 헤더를 생성합니다.
   * @returns 크롤링에 사용할 HTTP 헤더
   */
  private getEnhancedHeaders(): Record<string, string> {
    return {
      'User-Agent': this.userAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Referer': 'https://csa-iot.org/',
      'Connection': 'keep-alive',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Sec-Ch-Ua': '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'same-origin',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1'
    };
  }

  /**
   * 전략 초기화
   */
  public async initialize(): Promise<void> {
    // Axios/Cheerio 전략을 위한 추가 초기화가 필요한 경우 구현
    debugLog('[AxiosCrawlerStrategy] 초기화 완료');
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
    const pageStartTime = Date.now();
    
    // 상세 페이지 타임아웃 로깅
    debugLog(`[AxiosCrawler] Starting page ${pageNumber} crawl (attempt ${attempt}) - URL: ${pageUrl}, Timeout: ${this.pageTimeoutMs}ms`);
    
    try {
      if (attempt > 1) {
        await delay(this.minRequestDelayMs);
        debugLog(`[AxiosCrawler] Page ${pageNumber} - Applied retry delay of ${this.minRequestDelayMs}ms`);
      }
      
      const requestStartTime = Date.now();
      const response = await axios.get(pageUrl, {
        timeout: this.pageTimeoutMs,
        headers: this.getEnhancedHeaders(),
        signal
      });
      const requestElapsed = Date.now() - requestStartTime;
      debugLog(`[AxiosCrawler] Page ${pageNumber} - HTTP request completed in ${requestElapsed}ms`);

      if (response.status !== 200) {
        throw new PageNavigationError(`Failed to load page: Status ${response.status}`, pageNumber, attempt);
      }

      const extractStartTime = Date.now();
      const html = response.data;
      const rawProducts = this.extractProductsFromHTML(html);
      const extractElapsed = Date.now() - extractStartTime;
      const totalElapsed = Date.now() - pageStartTime;
      
      debugLog(`[AxiosCrawler] Page ${pageNumber} - Product extraction completed in ${extractElapsed}ms, found ${rawProducts.length} products`);
      debugLog(`[AxiosCrawler] Page ${pageNumber} - ✅ Total page crawl completed in ${totalElapsed}ms (timeout was ${this.pageTimeoutMs}ms)`);

      return {
        rawProducts,
        url: pageUrl,
        pageNumber,
        attempt
      };

    } catch (error: unknown) {
      const errorElapsed = Date.now() - pageStartTime;
      debugLog(`[AxiosCrawler] Page ${pageNumber} - ❌ Error occurred after ${errorElapsed}ms (timeout was ${this.pageTimeoutMs}ms)`);
      
      if (error instanceof PageOperationError) throw error;

      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNABORTED') {
          debugLog(`[AxiosCrawler] Page ${pageNumber} - Timeout error: ${error.message}`);
          throw new PageTimeoutError(`Page ${pageNumber} timed out after ${this.pageTimeoutMs}ms on attempt ${attempt}. Actual elapsed: ${errorElapsed}ms. URL: ${pageUrl}`, pageNumber, attempt);
        }
        debugLog(`[AxiosCrawler] Page ${pageNumber} - Axios error: ${error.message}`);
        throw new PageNavigationError(`Error navigating to page ${pageNumber} (attempt ${attempt}): ${error.message}. Elapsed: ${errorElapsed}ms. URL: ${pageUrl}`, pageNumber, attempt);
      }

      if (error instanceof Error) {
        debugLog(`[AxiosCrawler] Page ${pageNumber} - General error: ${error.message}`);
        throw new PageOperationError(`Error crawling page ${pageNumber} (attempt ${attempt}): ${error.message}. Elapsed: ${errorElapsed}ms. URL: ${pageUrl}`, pageNumber, attempt);
      }
      
      throw new PageOperationError(`Unknown error crawling page ${pageNumber} (attempt ${attempt}). URL: ${pageUrl}`, pageNumber, attempt);
    }
  }

  /**
   * 전체 페이지 수와 마지막 페이지 제품 수 조회
   */
  public async fetchTotalPages(): Promise<SitePageInfo> {
    const MAX_FETCH_ATTEMPTS = MAX_FETCH_TOTAL_PAGES_ATTEMPTS;

    for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt++) {
      try {
        debugLog(`[AxiosCrawlerStrategy] fetchTotalPages - Attempt ${attempt}/${MAX_FETCH_ATTEMPTS}`);

        if (!this.matterFilterUrl) {
          throw new Error('Configuration error: matterFilterUrl is not defined.');
        }

        if (attempt > 1) {
          await delay(RETRY_DELAY_MS / 2);
        }

        debugLog(`[AxiosCrawlerStrategy] Requesting ${this.matterFilterUrl} to fetch total pages (Attempt ${attempt}).`);
        
        const response = await axios.get(this.matterFilterUrl, {
          timeout: this.pageTimeoutMs,
          headers: this.getEnhancedHeaders()
        });

        if (response.status !== 200) {
          throw new PageNavigationError(`Failed to load page: Status ${response.status}`, 0, attempt);
        }

        const html = response.data;
        const $ = cheerio.load(html);
        
        // 페이지 번호 추출
        let totalPages = this.extractTotalPagesFromHTML($);
        
        debugLog(`[AxiosCrawlerStrategy] Determined ${totalPages} total pages from pagination elements (Attempt ${attempt}).`);

        // Fallback strategy: Try random page if pagination detection failed or returned 0
        if (totalPages <= 0) {
          debugLog(`[AxiosCrawlerStrategy] No pagination elements found, trying fallback strategy with random page (Attempt ${attempt}).`);
          
          const fallbackResult = await this.tryFallbackPaginationDetection(attempt);
          if (fallbackResult.success) {
            totalPages = fallbackResult.totalPages;
            debugLog(`[AxiosCrawlerStrategy] Fallback pagination detection successful: ${totalPages} pages (Attempt ${attempt}).`);
          } else {
            debugLog(`[AxiosCrawlerStrategy] Fallback pagination detection also failed, proceeding with manual check (Attempt ${attempt}).`);
          }
        }

        let lastPageProductCount = 0;
        if (totalPages > 0) {
          const lastPageUrl = `${this.matterFilterUrl}&paged=${totalPages}`;
          debugLog(`[AxiosCrawlerStrategy] Requesting last page: ${lastPageUrl} (Attempt ${attempt})`);
          
          const lastPageResponse = await axios.get(lastPageUrl, {
            timeout: this.pageTimeoutMs,
            headers: this.getEnhancedHeaders()
          });

          if (lastPageResponse.status !== 200) {
            throw new PageNavigationError(`Failed to load last page: Status ${lastPageResponse.status}`, totalPages, attempt);
          }

          const lastPageHtml = lastPageResponse.data;
          const lastPage$ = cheerio.load(lastPageHtml);
          
          try {
            lastPageProductCount = lastPage$('div.post-feed article').length;
          } catch (evalError: any) {
            throw new PageContentExtractionError(`Failed to count products on last page ${totalPages} (Attempt ${attempt}): ${evalError?.message || String(evalError)}`, totalPages, attempt);
          }
          
          debugLog(`[AxiosCrawlerStrategy] Last page ${totalPages} has ${lastPageProductCount} products (Attempt ${attempt}).`);
        } else {
          debugLog(`[AxiosCrawlerStrategy] No pagination elements found or totalPages is 0. Checking current page for products (Attempt ${attempt}).`);
          
          try {
            lastPageProductCount = $('div.post-feed article').length;
          } catch (evalError: any) {
            throw new PageContentExtractionError(`Failed to count products on initial page (no pagination) (Attempt ${attempt}): ${evalError?.message || String(evalError)}`, 1, attempt);
          }

          if (lastPageProductCount > 0 && totalPages <= 0) {
            // If fallback also failed but we have products, set to 1 page as fallback
            totalPages = 1;
            debugLog(`[AxiosCrawlerStrategy] Found ${lastPageProductCount} products on the first page. Setting totalPages to 1 (Attempt ${attempt}).`);
          } else if (totalPages <= 0 && lastPageProductCount <= 0) {
            debugLog(`[AxiosCrawlerStrategy] No products found on the first page and no pagination. totalPages remains 0 (Attempt ${attempt}).`);
            throw new PageContentExtractionError(`No pages or products found on the site (Attempt ${attempt}).`, 0, attempt);
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

        debugLog(`[AxiosCrawlerStrategy] fetchTotalPages - Attempt ${attempt}/${MAX_FETCH_ATTEMPTS} failed: ${attemptError.message}`);

        if (attempt === MAX_FETCH_ATTEMPTS) {
          debugLog(`[AxiosCrawlerStrategy] fetchTotalPages - All ${MAX_FETCH_ATTEMPTS} attempts failed. Last error: ${attemptError.message}`, attemptError);
          throw new PageInitializationError(`Failed to get total pages after ${MAX_FETCH_ATTEMPTS} attempts: ${attemptError.message}`, 0, attempt);
        }
        
        await delay(RETRY_DELAY_MS);
      }
    }
    
    throw new PageInitializationError(`Failed to get total pages after ${MAX_FETCH_ATTEMPTS} attempts (unexpectedly reached end of retry loop).`, 0, MAX_FETCH_ATTEMPTS);
  }

  /**
   * Fallback pagination detection strategy using random page
   */
  private async tryFallbackPaginationDetection(mainAttempt: number): Promise<{
    success: boolean;
    totalPages: number;
  }> {
    try {
      // Generate random page number between 100-400
      const randomPageId = Math.floor(Math.random() * 301) + 100; // 100 to 400
      const randomPageUrl = `${this.matterFilterUrl}&paged=${randomPageId}`;
      
      debugLog(`[AxiosCrawlerStrategy] Fallback: Trying random page ${randomPageId} (Main attempt ${mainAttempt})`);
      
      const response = await axios.get(randomPageUrl, {
        timeout: this.pageTimeoutMs,
        headers: this.getEnhancedHeaders()
      });

      if (response.status !== 200) {
        debugLog(`[AxiosCrawlerStrategy] Fallback: Random page ${randomPageId} returned status ${response.status}`);
        return { success: false, totalPages: 0 };
      }

      const html = response.data;
      const $ = cheerio.load(html);
      
      const totalPages = this.extractTotalPagesFromHTML($);
      
      if (totalPages > 1) {
        debugLog(`[AxiosCrawlerStrategy] Fallback: Successfully detected ${totalPages} pages from random page ${randomPageId}`);
        return { success: true, totalPages };
      } else {
        debugLog(`[AxiosCrawlerStrategy] Fallback: Random page ${randomPageId} also shows only ${totalPages} pages`);
        return { success: false, totalPages };
      }
      
    } catch (error: unknown) {
      debugLog(`[AxiosCrawlerStrategy] Fallback pagination detection failed: ${error instanceof Error ? error.message : String(error)}`);
      return { success: false, totalPages: 0 };
    }
  }

  /**
   * Extract total pages from HTML using pagination elements
   */
  private extractTotalPagesFromHTML($: cheerio.CheerioAPI): number {
    let totalPages = 0;
    const pageElements = $('div.pagination-wrapper > nav > div > a > span');
    
    if (pageElements.length > 0) {
      const pageNumbers = pageElements
        .map((_, el) => {
          const text = $(el).text().trim();
          return text ? parseInt(text, 10) : 0;
        })
        .get()
        .filter(n => !isNaN(n) && n > 0);
        
      totalPages = Math.max(...pageNumbers, 0);
    }
    
    return totalPages;
  }

  /**
   * Check if the detected total pages (usually 1) is likely incorrect
   */
  // private isDetectedTotalPagesLikelyIncorrect($: cheerio.CheerioAPI): boolean {
  //   // Check if there are products but no pagination
  //   const productCount = $('div.post-feed article').length;
  //   const hasProducts = productCount > 0;
  //   
  //   // Check for any pagination-related elements that might indicate more pages
  //   const hasPaginationWrapper = $('div.pagination-wrapper').length > 0;
  //   const hasNavElements = $('div.pagination-wrapper > nav').length > 0;
  //   
  //   // If we have products and some pagination structure but no page numbers,
  //   // it's likely the pagination detection failed
  //   return hasProducts && (hasPaginationWrapper || hasNavElements);
  // }

  /**
   * 리소스 정리
   */
  public async cleanup(): Promise<void> {
    // Axios/Cheerio 관련 리소스 정리 (필요한 경우)
    debugLog('[AxiosCrawlerStrategy] 리소스 정리 완료');
  }

  /**
   * HTML에서 제품 정보 추출 (Cheerio 사용)
   */
  private extractProductsFromHTML(html: string): RawProductData[] {
    const $ = cheerio.load(html);
    const articles = $('div.post-feed article').toArray();
    
    return articles.reverse().map((article, index) => {
      const $article = $(article);
      const link = $article.find('a').attr('href') || '';
      const manufacturerEl = $article.find('p.entry-company.notranslate');
      const modelEl = $article.find('h3.entry-title');
      const certificateIdEl = $article.find('span.entry-cert-id');
      const certificateIdPEl = $article.find('p.entry-certificate-id');
      
      let certificateId: string | undefined;
      
      if (certificateIdPEl.length > 0) {
        const text = certificateIdPEl.text().trim();
        if (text.startsWith('Certificate ID: ')) {
          certificateId = text.replace('Certificate ID: ', '').trim();
        } else {
          certificateId = text;
        }
      } else if (certificateIdEl.length > 0) {
        certificateId = certificateIdEl.text().trim();
      }

      return {
        url: link,
        manufacturer: manufacturerEl.length > 0 ? manufacturerEl.text().trim() : undefined,
        model: modelEl.length > 0 ? modelEl.text().trim() : undefined,
        certificateId,
        siteIndexInPage: index
      };
    });
  }
}
