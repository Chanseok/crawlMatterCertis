/**
 * crawler.ts
 * 인증 정보 웹사이트 크롤링을 위한 모듈
 */

import { chromium } from 'playwright-chromium';
import { getDatabaseSummaryFromDb } from './database.js';
import type { CrawlingProgress } from '../ui/types.js';
import { EventEmitter } from 'events';

// 크롤링 URL 상수
const BASE_URL = 'https://csa-iot.org/csa-iot_products/';
const MATTER_FILTER_URL = 'https://csa-iot.org/csa-iot_products/?p_keywords=&p_type%5B%5D=14&p_program_type%5B%5D=1049&p_certificate=&p_family=&p_firmware_ver=';

// 크롤링 이벤트 이미터
export const crawlerEvents = new EventEmitter();

// 크롤링 상태 관리
let isCrawling = false;
let shouldStopCrawling = false;

/**
 * 총 페이지 수를 가져오는 함수
 * @returns 총 페이지 수
 */
async function getTotalPages(): Promise<number> {
    const browser = await chromium.launch({ headless: true });
    let totalPages = 0;

    try {
        const context = await browser.newContext();
        const page = await context.newPage();

        console.log(`[Crawler] Navigating to ${MATTER_FILTER_URL}`);
        // 페이지 로드
        await page.goto(MATTER_FILTER_URL, { waitUntil: 'domcontentloaded' });

        // 페이지네이션 정보 추출
        // div.pagination-wrapper > nav > div > a:nth-child(7) > span 에서 마지막 페이지 번호 확인
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
        console.log(`[Crawler] Found ${totalPages} total pages`);

    } catch (error: unknown) {
        console.error('[Crawler] Error getting total pages:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to get total pages: ${errorMessage}`);
    } finally {
        await browser.close();
    }

    return totalPages;
}

/**
 * 크롤링해야 할 페이지 범위를 결정하는 함수
 * 현재 DB에 저장된 정보와 비교하여 필요한 페이지 범위를 반환
 */
async function determineCrawlingRange(): Promise<{ startPage: number; endPage: number }> {
    // DB 요약 정보 가져오기
    const dbSummary = await getDatabaseSummaryFromDb();
    const totalPages = await getTotalPages();

    if (dbSummary.productCount === 0) {
        // DB가 비어있으면 전체 페이지 크롤링
        console.log('[Crawler] Database is empty. Need to crawl all pages.');
        return { startPage: 1, endPage: totalPages };
    }

    // 이미 수집된 페이지 수 계산 (각 페이지 별로 12개 제품, 마지막 페이지는 12개 이내의 정보를 가질 수 있으므로 제외)
    const collectedPages = Math.floor(dbSummary.productCount / 12);
    // 최신 페이지가 1번, 가장 오래된 페이지가 totalPages번
    // endPage: 아직 수집하지 않은 최신 페이지까지
    const endPage = Math.max(1, totalPages - collectedPages);
    const startPage = 1;

    console.log(`[Crawler] Database has ${dbSummary.productCount} products. Will crawl from page ${startPage} to ${endPage}.`);
    return { startPage, endPage };
}

/**
 * 특정 페이지의 제품 정보 목록을 크롤링하는 함수
 * @param pageNumber 크롤링할 페이지 번호
 * @param totalPages 전체 페이지 수 (getTotalPages() 결과를 전달)
 * @returns 수집된 제품 정보 배열
 */
async function crawlProductsFromPage(pageNumber: number, totalPages: number) {
    console.log(`[Crawler] Crawling page ${pageNumber}`);

    const pageUrl = `${MATTER_FILTER_URL}&paged=${pageNumber}`;
    const browser = await chromium.launch({ headless: true });

    try {
        const context = await browser.newContext();
        const page = await context.newPage();

        // 페이지 로드
        await page.goto(pageUrl, { waitUntil: 'domcontentloaded'});

        const pageId = totalPages - pageNumber;

        // 제품 정보 추출
        const products: Product[] = await page.evaluate((pageId) => {
            const articles = Array.from(document.querySelectorAll('div.post-feed article'));
            // 아래(0) ~ 위(11) 순서로 indexInPage 부여
            return articles.reverse().map((article, idx) => {
                const link = article.querySelector('a');
                const manufacturerEl = article.querySelector('p.entry-company.notranslate');
                const modelEl = article.querySelector('h3.entry-title');
                const certificateIdEl = article.querySelector('span.entry-cert-id');
                return {
                    url: link && link.href ? link.href : '',
                    manufacturer: manufacturerEl ? manufacturerEl.textContent?.trim() : undefined,
                    model: modelEl ? modelEl.textContent?.trim() : undefined,
                    certificateId: certificateIdEl ? certificateIdEl.textContent?.trim() : undefined,
                    pageId,
                    indexInPage: idx,
                };
            });
        }, pageId);

        console.log(`[Crawler] Extracted ${products.length} products on page ${pageNumber}`);
        return products;
    } catch (error: unknown) {
        console.error(`[Crawler] Error crawling page ${pageNumber}:`, error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to crawl page ${pageNumber}: ${errorMessage}`);
    } finally {
        await browser.close();
    }
}

/**
 * 병렬 크롤링을 위한 Promise Pool 유틸리티
 */
async function promisePool<T>(
    items: number[],
    worker: (item: number) => Promise<T>,
    concurrency: number
): Promise<T[]> {
    const results: T[] = [];
    let index = 0;

    async function next(): Promise<void> {
        if (index >= items.length) return;
        const current = index++;
        results[current] = await worker(items[current]);
        await next();
    }

    const workers = Array.from({ length: concurrency }, () => next());
    await Promise.all(workers);
    return results;
}

/**
 * 크롤링 작업을 시작하는 함수 (병렬 버전)
 * @returns 크롤링 작업 시작 성공 여부
 */
export async function startCrawling(): Promise<boolean> {
    if (isCrawling) {
        console.log('[Crawler] Crawling is already in progress');
        return false;
    }

    isCrawling = true;
    shouldStopCrawling = false;

    try {
        const crawlingProgress: CrawlingProgress = {
            status: 'initializing',
            currentPage: 0,
            totalPages: 0,
            processedItems: 0,
            totalItems: 0,
            startTime: Date.now(),
            estimatedEndTime: 0,
            newItems: 0,
            updatedItems: 0
        };

        crawlerEvents.emit('crawlingProgress', crawlingProgress);

        // 크롤링 범위 결정 및 totalPages 1회만 호출
        const totalPages = await getTotalPages();
        const { startPage, endPage } = await determineCrawlingRange();
        const pageNumbers = Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i);

        crawlingProgress.status = 'running';
        crawlingProgress.totalPages = pageNumbers.length;
        crawlerEvents.emit('crawlingProgress', { ...crawlingProgress });

        console.log(`[Crawler] Starting parallel crawling from page ${startPage} to ${endPage}`);

        // 병렬 크롤링 (최대 8개 동시 실행)
        await promisePool(
            pageNumbers,
            async (pageNumber) => {
                if (shouldStopCrawling) return 0;
                const products = await crawlProductsFromPage(pageNumber, totalPages);
                crawlingProgress.processedItems += products.length;
                crawlingProgress.currentPage++;
                crawlingProgress.estimatedEndTime = estimateEndTime(
                    crawlingProgress.startTime,
                    crawlingProgress.currentPage,
                    crawlingProgress.totalPages
                );
                crawlerEvents.emit('crawlingProgress', { ...crawlingProgress });
                return products.length;
            },
            8 // 동시 실행 개수
        );

        crawlingProgress.status = 'completed';
        crawlingProgress.estimatedEndTime = 0;
        crawlerEvents.emit('crawlingProgress', { ...crawlingProgress });
        crawlerEvents.emit('crawlingComplete', { success: true, count: crawlingProgress.processedItems });

        console.log('[Crawler] Crawling completed successfully');
        return true;
    } catch (error: unknown) {
        console.error('[Crawler] Error during crawling:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        crawlerEvents.emit('crawlingError', {
            message: 'Crawling failed',
            details: errorMessage
        });
        return false;
    } finally {
        isCrawling = false;
    }
}

/**
 * 크롤링 작업을 중지하는 함수
 * @returns 중지 요청 성공 여부
 */
export function stopCrawling(): boolean {
    if (!isCrawling) {
        console.log('[Crawler] No crawling in progress to stop');
        return false;
    }

    console.log('[Crawler] Stopping crawling');
    shouldStopCrawling = true;
    return true;
}

/**
 * 크롤링 완료 예상 시간을 계산하는 함수
 */
function estimateEndTime(startTime: number, currentPage: number, totalPages: number): number {
    if (currentPage <= 1) return 0;

    const elapsed = Date.now() - startTime;
    const avgTimePerPage = elapsed / currentPage;
    const remainingPages = totalPages - currentPage;
    const estimatedTimeRemaining = avgTimePerPage * remainingPages;

    return Date.now() + estimatedTimeRemaining;
}