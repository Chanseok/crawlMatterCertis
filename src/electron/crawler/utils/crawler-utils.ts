/**
 * crawler-utils.ts
 * 크롤러 관련 유틸리티 함수 모음
 */

import { chromium } from 'playwright-chromium';
import { getDatabaseSummaryFromDb } from '../../database.js';
import { configManager } from '../../ConfigManager.js'; // Added import for configManager
import type { CrawlerConfig } from '../../../../types.js';

// 캐시
let cachedTotalPages: number | null = null;
let cachedTotalPagesFetchedAt: number | null = null;

/**
 * 캐시된 전체 페이지 수를 가져오거나 최신화
 * 
 * @param force 캐시 무시 여부
 * @param providedConfig 설정 객체 (선택적)
 * @returns 총 페이지 수
 */
export async function getTotalPagesCached(force = false, providedConfig?: CrawlerConfig): Promise<number> {
  // 제공된 config가 있으면 사용하고, 없으면 configManager에서 가져옴
  const config = providedConfig || configManager.getConfig();
  const now = Date.now();
  if (!force && cachedTotalPages && cachedTotalPagesFetchedAt && (now - cachedTotalPagesFetchedAt < (config.cacheTtlMs ?? 0))) {
    return cachedTotalPages;
  }
  
  const totalPages = await getTotalPages(config);
  cachedTotalPages = totalPages;
  cachedTotalPagesFetchedAt = now;
  return totalPages;
}

/**
 * 총 페이지 수를 가져오는 함수
 * 
 * @param providedConfig 설정 객체 (선택적)
 * @returns 총 페이지 수
 */
async function getTotalPages(providedConfig?: CrawlerConfig): Promise<number> {
  // 제공된 config가 있으면 사용하고, 없으면 configManager에서 가져옴
  const config = providedConfig || configManager.getConfig();
  const browser = await chromium.launch({ headless: config.headlessBrowser ?? true }); // Use headlessBrowser from config
  let totalPages = 0;
  
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    if (!config.matterFilterUrl) {
      throw new Error('[CrawlerUtils] matterFilterUrl is not defined in the configuration.');
    }
    
    console.log(`[CrawlerUtils] Navigating to ${config.matterFilterUrl}`);
    await page.route('**/*.{png,jpg,jpeg,gif,svg,css,woff,woff2}', route => route.abort());
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
 * @param providedConfig 설정 객체 (선택적)
 * @returns 시작 페이지와 종료 페이지
 */
export async function determineCrawlingRange(totalPages: number, providedConfig?: CrawlerConfig): Promise<{ startPage: number; endPage: number }> {
  // 제공된 config가 있으면 사용하고, 없으면 configManager에서 가져옴
  const config = providedConfig || configManager.getConfig();
  const dbSummary = await getDatabaseSummaryFromDb();
  
  if (dbSummary.productCount === 0) {
    console.log('[CrawlerUtils] Database is empty. Need to crawl all pages.');
    return { startPage: 1, endPage: totalPages };
  }
  
  // 이미 수집된 페이지 수 계산
  const collectedPages = Math.floor(dbSummary.productCount / config.productsPerPage);
  const endPage = Math.max(1, totalPages - collectedPages);
  const startPage = 1;
  
  console.log(`[CrawlerUtils] Database has ${dbSummary.productCount} products. Will crawl from page ${startPage} to ${endPage}.`);
  return { startPage, endPage };
}