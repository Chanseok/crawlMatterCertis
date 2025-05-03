/**
 * crawler-utils.ts
 * 크롤러 관련 유틸리티 함수 모음
 */

import { chromium } from 'playwright-chromium';
import { getDatabaseSummaryFromDb } from '../../database.js';
import { MATTER_FILTER_URL, PRODUCTS_PER_PAGE, CACHE_TTL_MS } from './constants.js';

// 캐시
let cachedTotalPages: number | null = null;
let cachedTotalPagesFetchedAt: number | null = null;

/**
 * 캐시된 전체 페이지 수를 가져오거나 최신화
 * 
 * @param force 캐시 무시 여부
 * @returns 총 페이지 수
 */
export async function getTotalPagesCached(force = false): Promise<number> {
  const now = Date.now();
  if (!force && cachedTotalPages && cachedTotalPagesFetchedAt && (now - cachedTotalPagesFetchedAt < CACHE_TTL_MS)) {
    return cachedTotalPages;
  }
  
  const totalPages = await getTotalPages();
  cachedTotalPages = totalPages;
  cachedTotalPagesFetchedAt = now;
  return totalPages;
}

/**
 * 총 페이지 수를 가져오는 함수
 * 
 * @returns 총 페이지 수
 */
async function getTotalPages(): Promise<number> {
  const browser = await chromium.launch({ headless: true });
  let totalPages = 0;
  
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    console.log(`[CrawlerUtils] Navigating to ${MATTER_FILTER_URL}`);
    await page.goto(MATTER_FILTER_URL, { waitUntil: 'domcontentloaded' });
    
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
    console.log(`[CrawlerUtils] Found ${totalPages} total pages`);
  } catch (error: unknown) {
    console.error('[CrawlerUtils] Error getting total pages:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to get total pages: ${errorMessage}`);
  } finally {
    await browser.close();
  }
  
  return totalPages;
}

/**
 * 크롤링해야 할 페이지 범위를 결정하는 함수
 * 
 * @param totalPages 총 페이지 수
 * @returns 시작 페이지와 종료 페이지
 */
export async function determineCrawlingRange(totalPages: number): Promise<{ startPage: number; endPage: number }> {
  const dbSummary = await getDatabaseSummaryFromDb();
  
  if (dbSummary.productCount === 0) {
    console.log('[CrawlerUtils] Database is empty. Need to crawl all pages.');
    return { startPage: 1, endPage: totalPages };
  }
  
  // 이미 수집된 페이지 수 계산
  const collectedPages = Math.floor(dbSummary.productCount / PRODUCTS_PER_PAGE);
  const endPage = Math.max(1, totalPages - collectedPages);
  const startPage = 1;
  
  console.log(`[CrawlerUtils] Database has ${dbSummary.productCount} products. Will crawl from page ${startPage} to ${endPage}.`);
  return { startPage, endPage };
}