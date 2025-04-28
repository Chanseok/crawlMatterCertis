/**
 * crawler.ts
 * 인증 정보 웹사이트 크롤링을 위한 모듈
 */

import { chromium } from 'playwright-chromium';
import { getDatabaseSummaryFromDb } from './database.js';
import type { CrawlingProgress } from '../ui/types.js';
import type { Product } from '../../types.js'; 
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { debugLog } from './util.js'; 

// 크롤링 URL 상수
const BASE_URL = 'https://csa-iot.org/csa-iot_products/';
const MATTER_FILTER_URL = 'https://csa-iot.org/csa-iot_products/?p_keywords=&p_type%5B%5D=14&p_program_type%5B%5D=1049&p_certificate=&p_family=&p_firmware_ver=';
const PAGE_TIMEOUT_MS = 20000; // 타임아웃 상수화
const PRODUCTS_PER_PAGE = 12; // 페이지당 제품 수 상수화

// 크롤링 이벤트 이미터
export const crawlerEvents = new EventEmitter();

// 크롤링 상태 관리
let isCrawling = false;
let shouldStopCrawling = false;

// 네트워크 호출 캐시(세션 단위)
let cachedTotalPages: number | null = null;
let cachedTotalPagesFetchedAt: number | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5분 캐시

// 동시 작업 상태 타입 정의 (프론트와 동일하게)
type ConcurrentTaskStatus = 'pending' | 'running' | 'success' | 'error' | 'stopped';
interface ConcurrentCrawlingTask {
    pageNumber: number;
    status: ConcurrentTaskStatus;
    error?: string;
}

// 크롤링 결과 타입 정의
interface CrawlResult {
    pageNumber: number;
    products: Product[] | null;
    error?: string;
}

interface FailedPageReport {
    pageNumber: number;
    errors: string[];
}

// 각 페이지별 작업 상태 관리용
let concurrentTaskStates: Record<number, ConcurrentCrawlingTask> = {};

/**
 * 캐시된 페이지 정보 반환 또는 최신화
 */
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
 */
async function getTotalPages(): Promise<number> {
    const browser: import('playwright-chromium').Browser = await chromium.launch({ headless: true });
    let totalPages = 0;

    try {
        const context = await browser.newContext();
        const page = await context.newPage();

        console.log(`[Crawler] Navigating to ${MATTER_FILTER_URL}`);
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
 */
async function determineCrawlingRange(): Promise<{ startPage: number; endPage: number }> {
    const dbSummary = await getDatabaseSummaryFromDb();
    const totalPages = await getTotalPagesCached();

    if (dbSummary.productCount === 0) {
        console.log('[Crawler] Database is empty. Need to crawl all pages.');
        return { startPage: 1, endPage: totalPages };
    }

    // 이미 수집된 페이지 수 계산
    const collectedPages = Math.floor(dbSummary.productCount / PRODUCTS_PER_PAGE);
    const endPage = Math.max(1, totalPages - collectedPages);
    const startPage = 1;

    console.log(`[Crawler] Database has ${dbSummary.productCount} products. Will crawl from page ${startPage} to ${endPage}.`);
    return { startPage, endPage };
}

/**
 * 특정 페이지의 제품 정보 목록을 크롤링하는 함수
 */
async function crawlProductsFromPage(pageNumber: number, totalPages: number): Promise<Product[]> {
    console.log(`[Crawler] Crawling page ${pageNumber}`);

    const pageUrl = `${MATTER_FILTER_URL}&paged=${pageNumber}`;
    const browser: import('playwright-chromium').Browser = await chromium.launch({ headless: true });

    try {
        const context = await browser.newContext();
        const page = await context.newPage();

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
            return;
        }
        results[current] = await worker(items[current], abortController.signal);
        await next();
    }

    const workers = Array.from({ length: concurrency }, () => next());
    await Promise.all(workers);
    return results;
}

/**
 * 단일 페이지 크롤링 작업을 처리하는 함수
 */
async function processPageCrawl(
    pageNumber: number, 
    totalPages: number, 
    productsResults: Product[], 
    failedPages: number[], 
    failedPageErrors: Record<number, string[]>, 
    signal: AbortSignal,
    attempt: number = 1
): Promise<CrawlResult | null> {
    if (shouldStopCrawling || signal.aborted) {
        updateTaskStatus(pageNumber, 'stopped');
        return null;
    }

    updateTaskStatus(pageNumber, 'running');
    
    try {
        // 타임아웃/중단 지원 로직
        const products = await Promise.race([
            // 크롤링 로직
            crawlPageWithTimeout(pageNumber, totalPages, productsResults),
            // 타임아웃 처리
            new Promise<null>((_, reject) => 
                setTimeout(() => reject(new Error('Timeout')), PAGE_TIMEOUT_MS)
            ),
            // 중단 처리
            new Promise<null>((_, reject) => {
                signal.addEventListener('abort', () => reject(new Error('Aborted')));
            })
        ]);
        
        updateTaskStatus(pageNumber, 'success');
        return { pageNumber, products };
    } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        const status = shouldStopCrawling ? 'stopped' : 'error';
        updateTaskStatus(pageNumber, status, errorMsg);
        
        // 실패한 페이지 기록
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
 * 크롤링 시 페이지 상태 업데이트 및 이벤트 발생
 */
function updateTaskStatus(pageNumber: number, status: ConcurrentTaskStatus, error?: string): void {
    concurrentTaskStates[pageNumber] = { pageNumber, status, error };
    crawlerEvents.emit('crawlingTaskStatus', Object.values(concurrentTaskStates));
}

/**
 * 타임아웃 처리가 있는 페이지 크롤링 함수
 */
async function crawlPageWithTimeout(
    pageNumber: number,
    totalPages: number,
    productsResults: Product[]
): Promise<Product[]> {
    const products = await crawlProductsFromPage(pageNumber, totalPages);
    if (products && products.length > 0) {
        productsResults.push(...products);
    }
    return products;
}

/**
 * 크롤링 결과를 JSON 파일로 저장
 */
function saveProductsToFile(products: Product[]): string {
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
        fs.writeFileSync(filePath, JSON.stringify(products, null, 2), 'utf-8');
        console.log(`[Crawler] Products saved to ${filePath}`);
        return filePath;
    } catch (err) {
        console.error('[Crawler] Failed to save products json:', err);
        throw err;
    }
}

/**
 * 크롤링 작업을 시작하는 함수 (병렬 버전)
 * @returns 크롤링 작업 시작 성공 여부
 */
export async function startCrawling(): Promise<boolean> {
    if (isCrawling) return false;
    isCrawling = true;
    shouldStopCrawling = false;
    concurrentTaskStates = {};
    const abortController = new AbortController();

    try {
        // 진행 상태 초기화
        const crawlingProgress = initializeCrawlingProgress();
        const totalPages = await getTotalPagesCached();
        const { startPage, endPage } = await determineCrawlingRange();
        const pageNumbers = Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i);

        debugLog(`Total pages to crawl: ${totalPages}`);
        const productsResults: Product[] = [];
        let failedPages: number[] = [];
        const failedPageErrors: Record<number, string[]> = {};

        // 작업 상태 초기화
        initializeTaskStates(pageNumbers);

        // 1차 병렬 크롤링 실행
        debugLog(`Starting crawling from page ${pageNumbers[0]} to ${pageNumbers[pageNumbers.length - 1]}`);
        await executeParallelCrawling(pageNumbers, totalPages, productsResults, failedPages, failedPageErrors, abortController, 8);

        // 실패한 페이지 재시도 (최대 4번)
        await retryFailedPages(failedPages, totalPages, productsResults, failedPageErrors, abortController);

        // 결과 처리 및 보고
        handleCrawlingResults(productsResults, failedPages, failedPageErrors, crawlingProgress);

        // 중단 여부 처리
        if (shouldStopCrawling || abortController.signal.aborted) {
            crawlerEvents.emit('crawlingStopped', Object.values(concurrentTaskStates));
        }

        return true;
    } catch (error) {
        handleCrawlingError(error);
        return false;
    } finally {
        isCrawling = false;
    }
}

/**
 * 크롤링 진행 상태 초기화
 */
function initializeCrawlingProgress(): CrawlingProgress {
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
    return crawlingProgress;
}

/**
 * 작업 상태 초기화
 */
function initializeTaskStates(pageNumbers: number[]): void {
    for (const pageNumber of pageNumbers) {
        concurrentTaskStates[pageNumber] = { pageNumber, status: 'pending' };
    }
    crawlerEvents.emit('crawlingTaskStatus', Object.values(concurrentTaskStates));
}

/**
 * 병렬 크롤링 실행
 */
async function executeParallelCrawling(
    pageNumbers: number[],
    totalPages: number,
    productsResults: Product[],
    failedPages: number[],
    failedPageErrors: Record<number, string[]>,
    abortController: AbortController,
    concurrency: number
): Promise<void> {
    await promisePool(
        pageNumbers,
        async (pageNumber, signal) => processPageCrawl(
            pageNumber, totalPages, productsResults, failedPages, failedPageErrors, signal
        ),
        concurrency,
        abortController
    );
}

/**
 * 실패한 페이지 재시도
 */
async function retryFailedPages(
    failedPages: number[],
    totalPages: number,
    productsResults: Product[],
    failedPageErrors: Record<number, string[]>,
    abortController: AbortController
): Promise<void> {
    for (let attempt = 2; attempt <= 5 && failedPages.length > 0; attempt++) {
        const retryPages = [...failedPages];
        failedPages = [];
        await promisePool(
            retryPages,
            async (pageNumber, signal) => processPageCrawl(
                pageNumber, totalPages, productsResults, failedPages, failedPageErrors, signal, attempt
            ),
            4, // 재시도는 동시성 4로 실행
            abortController
        );
    }
}

/**
 * 크롤링 결과 처리 및 보고
 */
function handleCrawlingResults(
    productsResults: Product[],
    failedPages: number[],
    failedPageErrors: Record<number, string[]>,
    crawlingProgress: CrawlingProgress
): void {
    // 실패 보고서 생성
    let failedReport: FailedPageReport[] = [];
    if (failedPages.length > 0) {
        failedReport = failedPages.map(pageNumber => ({
            pageNumber,
            errors: failedPageErrors[pageNumber]
        }));
        crawlerEvents.emit('crawlingFailedPages', failedReport);
    }

    // 크롤링 결과 보고
    crawlerEvents.emit('crawlingComplete', {
        success: true,
        count: productsResults.length,
        products: productsResults,
        failedReport
    });

    // 결과 파일 저장
    try {
        saveProductsToFile(productsResults);
    } catch (err) {
        console.error('[Crawler] Failed to save products json:', err);
    }

    // 진행 상태 업데이트
    crawlingProgress.status = 'completed';
    crawlingProgress.estimatedEndTime = 0;
    crawlerEvents.emit('crawlingProgress', { ...crawlingProgress });
}

/**
 * 크롤링 오류 처리
 */
function handleCrawlingError(error: unknown): void {
    console.error('[Crawler] Error during crawling:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    crawlerEvents.emit('crawlingError', {
        message: 'Crawling failed',
        details: errorMessage
    });
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
 */
export async function checkCrawlingStatus() {
    try {
        const dbSummary = await getDatabaseSummaryFromDb();
        const totalPages = await getTotalPagesCached(true); // 강제 갱신
        const siteProductCount = totalPages * PRODUCTS_PER_PAGE;
        const { startPage, endPage } = await determineCrawlingRange();
        
        // 직렬화 문제가 있는 객체들을 안전하게 변환
        const safeDbSummary = {
            ...dbSummary,
            lastUpdated: dbSummary.lastUpdated ? dbSummary.lastUpdated.toISOString() : null
        };
        
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