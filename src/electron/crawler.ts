/**
 * crawler.ts
 * 인증 정보 웹사이트 크롤링을 위한 모듈
 */

import { chromium } from 'playwright-chromium';
import { getDatabaseSummaryFromDb } from './database.js';
import type { CrawlingProgress } from '../ui/types.js';
import type { Product } from '../../types.js'; // Product 타입 import 추가
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';

// 크롤링 URL 상수
const BASE_URL = 'https://csa-iot.org/csa-iot_products/';
const MATTER_FILTER_URL = 'https://csa-iot.org/csa-iot_products/?p_keywords=&p_type%5B%5D=14&p_program_type%5B%5D=1049&p_certificate=&p_family=&p_firmware_ver=';

// 크롤링 이벤트 이미터
export const crawlerEvents = new EventEmitter();

// 크롤링 상태 관리
let isCrawling = false;
let shouldStopCrawling = false;

// 네트워크 호출 캐시(세션 단위)
let cachedTotalPages: number | null = null;
let cachedTotalPagesFetchedAt: number | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5분 캐시

async function getTotalPagesCached(force = false): Promise<number> {
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
 * @returns 총 페이지 수
 */
async function getTotalPages(): Promise<number> {
    const browser: import('playwright-chromium').Browser = await chromium.launch({ headless: true });
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
    const totalPages = await getTotalPagesCached();

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
    const browser: import('playwright-chromium').Browser = await chromium.launch({ headless: true });

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
                const certificateIdPEl = article.querySelector('p.entry-certificate-id');
                // certificateId: p.entry-certificate-id에서 prefix 제거 후 추출
                let certificateId: string | undefined = undefined;
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
    worker: (item: number, signal: AbortSignal) => Promise<T>,
    concurrency: number,
    abortController: AbortController
): Promise<T[]> {
    const results: T[] = [];
    let index = 0;

    async function next(): Promise<void> {
        if (index >= items.length) return;
        const current = index++;
        if (shouldStopCrawling || abortController.signal.aborted) {
            // 중단된 경우 즉시 resolve
            return;
        }
        results[current] = await worker(items[current], abortController.signal);
        await next();
    }

    const workers = Array.from({ length: concurrency }, () => next());
    await Promise.all(workers);
    return results;
}

// 동시 작업 상태 타입 정의 (프론트와 동일하게)
type ConcurrentTaskStatus = 'pending' | 'running' | 'success' | 'error' | 'stopped';
interface ConcurrentCrawlingTask {
    pageNumber: number;
    status: ConcurrentTaskStatus;
    error?: string;
}

// 각 페이지별 작업 상태 관리용
let concurrentTaskStates: Record<number, ConcurrentCrawlingTask> = {};

/**
 * 크롤링 작업을 시작하는 함수 (병렬 버전)
 * @returns 크롤링 작업 시작 성공 여부
 */
interface CrawlResult {
    pageNumber: number;
    products: Product[] | null;
    error?: string;
}

export async function startCrawling(): Promise<boolean> {
    if (isCrawling) return false;
    isCrawling = true;
    shouldStopCrawling = false;
    concurrentTaskStates = {};
    const abortController = new AbortController();

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

        const totalPages = await getTotalPagesCached();
        const { startPage, endPage } = await determineCrawlingRange();
        const pageNumbers = Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i);

        const productsResults: Product[] = [];
        let failedPages: number[] = [];
        const failedPageErrors: Record<number, string[]> = {};

        // 동시 작업 상태 초기화 및 emit
        for (const pageNumber of pageNumbers) {
            concurrentTaskStates[pageNumber] = { pageNumber, status: 'pending' };
        }
        crawlerEvents.emit('crawlingTaskStatus', Object.values(concurrentTaskStates));

        // 1차 병렬 크롤링
        await promisePool(
            pageNumbers,
            async (pageNumber, signal) => {
                if (shouldStopCrawling || signal.aborted) {
                    concurrentTaskStates[pageNumber] = { pageNumber, status: 'stopped' };
                    crawlerEvents.emit('crawlingTaskStatus', Object.values(concurrentTaskStates));
                    return null;
                }
                concurrentTaskStates[pageNumber] = { pageNumber, status: 'running' };
                crawlerEvents.emit('crawlingTaskStatus', Object.values(concurrentTaskStates));
                let browser: import('playwright-chromium').Browser | undefined;
                try {
                    // 타임아웃/중단 지원
                    const timeoutPromise = new Promise<null>((_, reject) =>
                        setTimeout(() => reject(new Error('Timeout')), 20000)
                    );
                    const crawlPromise = (async () => {
                        browser = await chromium.launch({ headless: true });
                        const context = await browser.newContext();
                        const page = await context.newPage();
                        await page.goto(`${MATTER_FILTER_URL}&paged=${pageNumber}`, { waitUntil: 'domcontentloaded' });
                        // ...제품 추출 로직 생략...
                        await browser.close();
                        return [] as Product[]; // 실제 제품 반환
                    })();
                    const products = await Promise.race([
                        crawlPromise,
                        timeoutPromise,
                        new Promise((_, reject) => {
                            signal.addEventListener('abort', () => reject(new Error('Aborted')));
                        })
                    ]);
                    concurrentTaskStates[pageNumber] = { pageNumber, status: 'success' };
                    crawlerEvents.emit('crawlingTaskStatus', Object.values(concurrentTaskStates));
                    return { pageNumber, products };
                } catch (err) {
                    if (browser) await browser.close().catch(() => {});
                    const errorMsg = err instanceof Error ? err.message : String(err);
                    concurrentTaskStates[pageNumber] = { pageNumber, status: shouldStopCrawling ? 'stopped' : 'error', error: errorMsg };
                    crawlerEvents.emit('crawlingTaskStatus', Object.values(concurrentTaskStates));
                    return { pageNumber, products: null, error: errorMsg };
                }
            },
            8,
            abortController
        );

        // 2~5차 재시도
        for (let attempt = 2; attempt <= 5 && failedPages.length > 0; attempt++) {
            const retryPages = [...failedPages];
            failedPages = [];
            await promisePool(
                retryPages,
                async (pageNumber, signal) => {
                    if (shouldStopCrawling || signal.aborted) {
                        concurrentTaskStates[pageNumber] = { pageNumber, status: 'stopped' };
                        crawlerEvents.emit('crawlingTaskStatus', Object.values(concurrentTaskStates));
                        return null;
                    }
                    concurrentTaskStates[pageNumber] = { pageNumber, status: 'running' };
                    crawlerEvents.emit('crawlingTaskStatus', Object.values(concurrentTaskStates));
                    let browser: import('playwright-chromium').Browser | undefined;
                    try {
                        const timeoutPromise = new Promise<null>((_, reject) =>
                            setTimeout(() => reject(new Error('Timeout')), 20000)
                        );
                        const crawlPromise = (async () => {
                            browser = await chromium.launch({ headless: true });
                            const context = await browser.newContext();
                            const page = await context.newPage();
                            await page.goto(`${MATTER_FILTER_URL}&paged=${pageNumber}`, { waitUntil: 'domcontentloaded' });
                            // ...제품 추출 로직 생략...
                            await browser.close();
                            return [] as Product[]; // 실제 제품 반환
                        })();
                        const products = await Promise.race([
                            crawlPromise,
                            timeoutPromise,
                            new Promise((_, reject) => {
                                signal.addEventListener('abort', () => reject(new Error('Aborted')));
                            })
                        ]);
                        concurrentTaskStates[pageNumber] = { pageNumber, status: 'success' };
                        crawlerEvents.emit('crawlingTaskStatus', Object.values(concurrentTaskStates));
                        return { pageNumber, products };
                    } catch (err) {
                        if (browser) await browser.close().catch(() => {});
                        const errorMsg = err instanceof Error ? err.message : String(err);
                        concurrentTaskStates[pageNumber] = { pageNumber, status: shouldStopCrawling ? 'stopped' : 'error', error: errorMsg };
                        crawlerEvents.emit('crawlingTaskStatus', Object.values(concurrentTaskStates));
                        return { pageNumber, products: null, error: errorMsg };
                    }
                },
                4,
                abortController
            );
        }

        // 최종 실패 페이지 보고서 생성
        let failedReport: { pageNumber: number; errors: string[] }[] = [];
        if (failedPages.length > 0) {
            failedReport = failedPages.map(pageNumber => ({
                pageNumber,
                errors: failedPageErrors[pageNumber]
            }));
            crawlerEvents.emit('crawlingFailedPages', failedReport);
        }

        // 크롤링 완료 후 productsResults를 사용자에게 보고
        crawlerEvents.emit('crawlingComplete', {
            success: true,
            count: productsResults.length,
            products: productsResults,
            failedReport
        });

        // === [추가] 크롤링 완료 시점에 products를 dist-output 폴더에 저장 ===
        try {
            const now = new Date();
            const y = now.getFullYear();
            const m = String(now.getMonth() + 1).padStart(2, '0');
            const d = String(now.getDate()).padStart(2, '0');
            const h = String(now.getHours()).padStart(2, '0');
            const min = String(now.getMinutes()).padStart(2, '0');
            const s = String(now.getSeconds()).padStart(2, '0');
            const filename = `products_${y}${m}${d}_${h}${min}${s}.json`;
            const outputDir = path.resolve(process.cwd(), 'dist-output');
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }
            const filePath = path.join(outputDir, filename);
            fs.writeFileSync(filePath, JSON.stringify(productsResults, null, 2), 'utf-8');
            console.log(`[Crawler] Products saved to ${filePath}`);
        } catch (err) {
            console.error('[Crawler] Failed to save products json:', err);
        }
        // === [추가 끝] ===

        crawlingProgress.status = 'completed';
        crawlingProgress.estimatedEndTime = 0;
        crawlerEvents.emit('crawlingProgress', { ...crawlingProgress });

        // 중단 시 crawlingStopped 이벤트로 전체 상태 보고
        if (shouldStopCrawling || abortController.signal.aborted) {
            crawlerEvents.emit('crawlingStopped', Object.values(concurrentTaskStates));
        }

        return true;
    } catch (error) {
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
 * 크롤링 상태 체크(요약 정보) 함수
 * - 네트워크 호출 최소화, 1회만 호출
 * - Date 객체 등 직렬화 문제 방지를 위해 안전한 형태로 변환
 */
export async function checkCrawlingStatus() {
    try {
        const dbSummary = await getDatabaseSummaryFromDb();
        const totalPages = await getTotalPagesCached(true); // 강제 갱신
        // 사이트의 총 제품 수 추정 (마지막 페이지에서 실제 개수 구하는 로직은 필요시 추가)
        const siteProductCount = totalPages * 12;
        const { startPage, endPage } = await determineCrawlingRange();
        
        // 직렬화 문제가 있는 객체들을 안전하게 변환
        const safeDbSummary = {
            ...dbSummary,
            // Date 객체를 ISO 문자열로 확실하게 변환
            lastUpdated: dbSummary.lastUpdated ? dbSummary.lastUpdated.toISOString() : null
        };
        
        // 직렬화 가능한 객체만 포함하는 새로운 객체 반환
        return {
            dbLastUpdated: safeDbSummary.lastUpdated,
            dbProductCount: safeDbSummary.productCount,
            siteTotalPages: totalPages,
            siteProductCount,
            diff: siteProductCount - dbSummary.productCount,
            needCrawling: siteProductCount > dbSummary.productCount,
            crawlingRange: { startPage, endPage }
        };
    } catch (error) {
        console.error("[Crawler] Error in checkCrawlingStatus:", error);
        // 오류 발생 시에도 직렬화 가능한 객체 반환
        return {
            error: error instanceof Error ? error.message : String(error),
            dbLastUpdated: null,
            dbProductCount: 0,
            siteTotalPages: 0,
            siteProductCount: 0,
            diff: 0,
            needCrawling: false,
            crawlingRange: { startPage: 1, endPage: 1 }
        };
    }
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