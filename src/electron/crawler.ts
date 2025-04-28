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

    // 최신 제품 페이지가 사이트의 첫 페이지이고, 가장 오래된 제품이 마지막 페이지
    // DB의 pageId는 0부터 시작하며, 웹사이트의 페이지 번호는 1부터 시작함
    // DB의 pageId 0은 웹사이트의 가장 마지막 페이지와 매핑됨

    if (dbSummary.productCount === 0) {
        // DB가 비어있으면 전체 페이지 크롤링
        console.log('[Crawler] Database is empty. Need to crawl all pages.');
        return { startPage: 1, endPage: totalPages };
    }

    // DB에 데이터가 있으므로 최신 데이터만 크롤링 (첫 페이지부터)
    // 나중에는 중복 체크 로직을 통해 크롤링 중단점을 결정할 예정
    console.log('[Crawler] Database has existing records. Starting from page 1 to check for new records.');
    return { startPage: 1, endPage: totalPages };
}

/**
 * 특정 페이지의 제품 정보 목록을 크롤링하는 함수
 * @param pageNumber 크롤링할 페이지 번호
 * @returns 수집된 제품 정보 배열
 */
async function crawlProductsFromPage(pageNumber: number) {
    console.log(`[Crawler] Crawling page ${pageNumber}`);

    const pageUrl = `${MATTER_FILTER_URL}&paged=${pageNumber}`;
    const browser = await chromium.launch({ headless: true });

    try {
        const context = await browser.newContext();
        const page = await context.newPage();

        // 페이지 로드
        await page.goto(pageUrl, { waitUntil: 'networkidle' });

        // 제품 목록 추출 로직 (임시 구현 - 향후 확장 예정)
        const productCards = await page.locator('.product-card').all();
        console.log(`[Crawler] Found ${productCards.length} products on page ${pageNumber}`);

        // 현재는 수집된 제품 수만 반환 (향후 실제 데이터 추출 구현 예정)
        return productCards.length;
    } catch (error: unknown) {
        console.error(`[Crawler] Error crawling page ${pageNumber}:`, error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to crawl page ${pageNumber}: ${errorMessage}`);
    } finally {
        await browser.close();
    }
}

/**
 * 크롤링 작업을 시작하는 함수
 * @returns 크롤링 작업 시작 성공 여부
 */
export async function startCrawling(): Promise<boolean> {
    // 이미 크롤링 중이면 중복 실행 방지
    if (isCrawling) {
        console.log('[Crawler] Crawling is already in progress');
        return false;
    }

    isCrawling = true;
    shouldStopCrawling = false;

    try {
        // 크롤링 시작 이벤트 발생
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

        // 크롤링 범위 결정
        const { startPage, endPage } = await determineCrawlingRange();

        // 크롤링 진행 상태 업데이트
        crawlingProgress.status = 'running';
        crawlingProgress.totalPages = endPage - startPage + 1;
        crawlerEvents.emit('crawlingProgress', { ...crawlingProgress });

        console.log(`[Crawler] Starting crawling from page ${startPage} to ${endPage}`);

        // 각 페이지 순회하며 제품 정보 수집
        for (let currentPage = startPage; currentPage <= endPage; currentPage++) {
            // 중지 요청 확인
            if (shouldStopCrawling) {
                console.log('[Crawler] Crawling stopped by user request');
                crawlingProgress.status = 'stopped';
                crawlerEvents.emit('crawlingProgress', { ...crawlingProgress });
                isCrawling = false;
                return false;
            }

            crawlingProgress.currentPage = currentPage - startPage + 1;
            crawlerEvents.emit('crawlingProgress', { ...crawlingProgress });

            // 현재 페이지 크롤링
            const productsCount = await crawlProductsFromPage(currentPage);

            // 진행 상태 업데이트
            crawlingProgress.processedItems += productsCount;
            crawlingProgress.estimatedEndTime = estimateEndTime(
                crawlingProgress.startTime,
                crawlingProgress.currentPage,
                crawlingProgress.totalPages
            );

            crawlerEvents.emit('crawlingProgress', { ...crawlingProgress });

            // 다음 페이지 크롤링 전 짧은 대기 (서버 부하 방지)
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        // 크롤링 완료
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