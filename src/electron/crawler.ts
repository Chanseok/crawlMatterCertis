/**
 * crawler.ts
 * 인증 정보 웹사이트 크롤링을 위한 모듈
 */

import { chromium } from 'playwright-chromium';
import { getDatabaseSummaryFromDb } from './database.js';
import type { CrawlingProgress } from '../ui/types.js';
import type { Product, MatterProduct } from '../../types.js';
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { debugLog } from './util.js';
//#region file scope constants, variables and types
// 크롤링 URL 상수
const BASE_URL = 'https://csa-iot.org/csa-iot_products/';
const MATTER_FILTER_URL = 'https://csa-iot.org/csa-iot_products/?p_keywords=&p_type%5B%5D=14&p_program_type%5B%5D=1049&p_certificate=&p_family=&p_firmware_ver=';

// 크롤링 설정 상수
const PAGE_TIMEOUT_MS = 10000; // 페이지 타임아웃
const PRODUCT_DETAIL_TIMEOUT_MS = 15000; // 제품 상세 페이지 타임아웃
const PRODUCTS_PER_PAGE = 12;  // 페이지당 제품 수
const INITIAL_CONCURRENCY = 9; // 초기 병렬 크롤링 동시성 수준
const DETAIL_CONCURRENCY = 9; // 제품 상세 정보 크롤링 동시성 수준
const RETRY_CONCURRENCY = 6;   // 재시도 시 병렬 크롤링 동시성 수준
const MIN_REQUEST_DELAY_MS = 100; // 요청 간 최소 지연 시간(ms)
const MAX_REQUEST_DELAY_MS = 2200; // 요청 간 최대 지연 시간(ms)
const RETRY_START = 2;          // 재시도 시작 횟수 (첫 시도가 1)
const RETRY_MAX = 10;           // 최대 재시도 횟수 (총 9회 재시도)

// 크롤링 단계 상수
const CRAWLING_PHASES = {
    PRODUCT_LIST: '제품 목록 수집',
    PRODUCT_DETAIL: '제품 상세 정보 수집'
};


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

interface DetailCrawlResult {
    url: string;
    product: MatterProduct | null;
    error?: string;
}

interface FailedPageReport {
    pageNumber: number;
    errors: string[];
}

interface FailedProductReport {
    url: string;
    errors: string[];
}

// 각 페이지별/상품별 작업 상태 관리용
let concurrentTaskStates: Record<number, ConcurrentCrawlingTask> = {};
let concurrentProductTaskStates: Record<string, any> = {};

//#endregion

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
    // console.log(`[Crawler] Crawling page ${pageNumber}`);

    // 서버 과부하 방지를 위한 무작위 지연 시간 적용
    const delayTime = getRandomDelay(MIN_REQUEST_DELAY_MS, MAX_REQUEST_DELAY_MS);
    await delay(delayTime);

    const pageUrl = `${MATTER_FILTER_URL}&paged=${pageNumber}`;
    const browser: import('playwright-chromium').Browser = await chromium.launch({ headless: true });

    try {
        const context = await browser.newContext();
        const page = await context.newPage();

        await page.goto(pageUrl, { waitUntil: 'domcontentloaded' });
        const pageId = totalPages - pageNumber;

        // 제품 정보 추출
        const products: Product[] = await page.evaluate((pageId) => {
            const articles = Array.from(document.querySelectorAll('div.post-feed article'));
            return articles.reverse().map((article, idx) => {
                const link = article.querySelector('a');
                const manufacturerEl = article.querySelector('p.entry-company.notranslate');
                const modelEl = article.querySelector('h3.entry-title');
                const certificateIdEl = article.querySelector('span.entry-cert-id');
                const certificateIdPEl = article.querySelector('p.entry-certificate-id');
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

        if (products.length == 0) {
            debugLog(`[Extracted ${products.length} products on page ${pageNumber}`);
            throw new Error(`Failed to crawl page ${pageNumber}: `);
        }

        // console.log(`[Crawler] Extracted ${products.length} products on page ${pageNumber}`);
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
 * 제품 상세 정보를 크롤링하는 함수
 * @param product 기본 제품 정보
 * @returns 상세 제품 정보
 */
async function crawlProductDetail(product: Product): Promise<MatterProduct> {
    // 서버 과부하 방지를 위한 무작위 지연 시간 적용
    const delayTime = getRandomDelay(MIN_REQUEST_DELAY_MS, MAX_REQUEST_DELAY_MS);
    await delay(delayTime);

    const browser = await chromium.launch({ headless: true });

    try {
        const context = await browser.newContext();
        const page = await context.newPage();

        await page.goto(product.url, { waitUntil: 'domcontentloaded' });

        // 제품 상세 정보 추출 - 익명 함수를 사용하여 브라우저 컨텍스트로 전달
        const detailProduct = await page.evaluate((baseProduct) => {
            type ProductDetails = Record<string, string>;
            
            // 타입스크립트는 브라우저 컨텍스트에서 실행되지 않으므로 
            // 런타임에는 간단한 객체로 다루고, 이후 MatterProduct로 타입 변환
            const result = {
                // baseProduct의 모든 속성을 복사
                ...baseProduct,
                // 필수 속성 설정
                id: `csa-matter-${baseProduct.pageId}-${baseProduct.indexInPage}`,
                deviceType: 'Matter Device',
                applicationCategories: [] as string[]
            };
            
            console.debug(`[Extracting product details for ${result.id}]`);

            // 제품 제목 추출
            function extractProductTitle(): string {
                const getText = (selector: string): string => {
                    const el = document.querySelector(selector);
                    return el ? el.textContent?.trim() || '' : '';
                };
                
                return getText('h1.entry-title') || getText('h1') || 'Unknown Product';
            }
            
            // 인증 정보 테이블에서 데이터 추출
            function extractDetailsFromTable(): ProductDetails {
                const details: ProductDetails = {};
                const infoTable = document.querySelector('.product-certificates-table');
                if (!infoTable) return details;

                const rows = infoTable.querySelectorAll('tr');
                rows.forEach(row => {
                    const cells = row.querySelectorAll('td');
                    if (cells.length >= 2) {
                        const key = cells[0].textContent?.trim().toLowerCase() || '';
                        const value = cells[1].textContent?.trim() || '';

                        if (value) {
                            if (key.includes('certification id')) details.certificationId = value;
                            else if (key.includes('certification date')) details.certificationDate = value;
                            else if (key.includes('software version')) details.softwareVersion = value;
                            else if (key.includes('hardware version')) details.hardwareVersion = value;
                            else if (key.includes('vid')) details.vid = value;
                            else if (key.includes('pid')) details.pid = value;
                            else if (key.includes('family sku')) details.familySku = value;
                            else if (key.includes('family variant sku')) details.familyVariantSku = value;
                            else if (key.includes('firmware version')) details.firmwareVersion = value;
                            else if (key.includes('family id')) details.familyId = value;
                            else if (key.includes('tis') && key.includes('trp tested')) details.tisTrpTested = value;
                            else if (key.includes('specification version')) details.specificationVersion = value;
                            else if (key.includes('transport interface')) details.transportInterface = value;
                            else if (key.includes('primary device type id')) details.primaryDeviceTypeId = value;
                            else if (key.includes('device type') || key.includes('product type')) details.deviceType = value;
                        }
                    }
                });
                
                return details;
            }
            
            // 제품 상세 정보를 span.label, span.value 구조에서 추출
            function extractDetailValues(): ProductDetails {
                const details: ProductDetails = {};
                const detailItems = document.querySelectorAll('.entry-product-details div ul li');

                for (const item of detailItems) {
                    const label = item.querySelector('span.label');
                    const value = item.querySelector('span.value');

                    if (label && value) {
                        const labelText = label.textContent?.trim().toLowerCase() || '';
                        const valueText = value.textContent?.trim() || '';

                        if (valueText) {
                            // 레이블에 따라 해당 키에 값 할당
                            if (labelText === 'manufacturer' || labelText.includes('company'))
                                details.manufacturer = valueText;
                            else if (labelText === 'vendor id' || labelText.includes('vid'))
                                details.vid = valueText;
                            else if (labelText === 'product id' || labelText.includes('pid'))
                                details.pid = valueText;
                            else if (labelText === 'family sku')
                                details.familySku = valueText;
                            else if (labelText === 'family variant sku')
                                details.familyVariantSku = valueText;
                            else if (labelText === 'firmware version')
                                details.firmwareVersion = valueText;
                            else if (labelText === 'hardware version')
                                details.hardwareVersion = valueText;
                            else if (labelText === 'certificate id' || labelText.includes('certification id'))
                                details.certificationId = valueText;
                            else if (labelText === 'certified date' || labelText.includes('certification date'))
                                details.certificationDate = valueText;
                            else if (labelText === 'family id')
                                details.familyId = valueText;
                            else if (labelText === 'tis/trp tested' || labelText.includes('tis') || labelText.includes('trp'))
                                details.tisTrpTested = valueText;
                            else if (labelText === 'specification version' || labelText.includes('spec version'))
                                details.specificationVersion = valueText;
                            else if (labelText === 'transport interface')
                                details.transportInterface = valueText;
                            else if (labelText === 'primary device type id' || labelText.includes('primary device'))
                                details.primaryDeviceTypeId = valueText;
                            else if (labelText === 'device type' || labelText.includes('product type') ||
                                labelText.includes('category'))
                                details.deviceType = valueText;
                        }
                    }
                }
                
                return details;
            }
            
            // 애플리케이션 카테고리 추출
            function extractApplicationCategories(deviceType: string): string[] {
                const appCategories: string[] = [];
                const appCategoriesSection = Array.from(document.querySelectorAll('h3')).find(
                    el => el.textContent?.trim().includes('Application Categories')
                );
                
                if (appCategoriesSection) {
                    const parentDiv = appCategoriesSection.parentElement;
                    if (parentDiv) {
                        const listItems = parentDiv.querySelectorAll('ul li');
                        if (listItems.length > 0) {
                            Array.from(listItems).forEach(li => {
                                const category = li.textContent?.trim();
                                if (category) appCategories.push(category);
                            });
                        }
                    }
                }
                
                // 애플리케이션 카테고리가 없으면 deviceType을 사용
                if (appCategories.length === 0 && deviceType !== 'Matter Device') {
                    appCategories.push(deviceType);
                } else if (appCategories.length === 0) {
                    appCategories.push('Matter Device');
                }
                
                return appCategories;
            }

            // 제조사 정보 추출 및 결과에 할당
            function extractManufacturerInfo(result: Record<string, any>, details: ProductDetails, productTitle: string): void {
                // Extract manufacturer (fallback methods)
                let manufacturer = details.manufacturer || result.manufacturer || '';
                const knownManufacturers = ['Govee', 'Philips', 'Samsung', 'Apple', 'Google', 'Amazon', 'Aqara', 'LG', 'IKEA', 'Belkin', 'Eve', 'Nanoleaf', 'GE', 'Cync', 'Tapo', 'TP-Link', 'Signify', 'Haier', 'WiZ'];

                // 이미 제조사를 찾았다면 다음 단계를 건너뜀
                if (!manufacturer) {
                    // Try to find manufacturer in the title first
                    for (const brand of knownManufacturers) {
                        if (productTitle.includes(brand)) {
                            manufacturer = brand;
                            break;
                        }
                    }
                }

                // If not found in title, look for it in company info
                if (!manufacturer) {
                    const companyInfo = document.querySelector('.company-info')?.textContent?.trim() || 
                                    document.querySelector('.manufacturer')?.textContent?.trim() || '';
                    if (companyInfo) {
                        manufacturer = companyInfo;
                    }
                }

                // If still not found, check for it in product details using text parsing
                if (!manufacturer) {
                    const detailsList = document.querySelectorAll('div.entry-product-details > div > ul li');
                    for (const li of detailsList) {
                        const text = li.textContent || '';
                        if (text.toLowerCase().includes('manufacturer') || text.toLowerCase().includes('company')) {
                            const parts = text.split(':');
                            if (parts.length > 1) {
                                manufacturer = parts[1].trim();
                                break;
                            }
                        }
                    }
                }

                // Default if still not found
                result.manufacturer = manufacturer || 'Unknown';
            }

            // 장치 유형 정보 추출 및 결과에 할당
            function extractDeviceTypeInfo(result: Record<string, any>, details: ProductDetails, productTitle: string): void {
                // Extract device type (fallback method)
                let deviceType = details.deviceType || 'Matter Device';

                // 디바이스 타입 추출 (alternatives)
                if (deviceType === 'Matter Device') {
                    const deviceTypeEl = document.querySelector('.category-link');
                    if (deviceTypeEl && deviceTypeEl.textContent) {
                        deviceType = deviceTypeEl.textContent.trim();
                    }
                }

                // If no specific device type found, try to identify from common types
                if (deviceType === 'Matter Device') {
                    const deviceTypes = [
                        'Light Bulb', 'Smart Switch', 'Door Lock', 'Thermostat',
                        'Motion Sensor', 'Smart Plug', 'Hub', 'Gateway', 'Camera',
                        'Smoke Detector', 'Outlet', 'Light', 'Door', 'Window',
                        'Sensor', 'Speaker', 'Display'
                    ];

                    const allText = document.body.textContent || '';
                    for (const type of deviceTypes) {
                        if (allText.includes(type) || productTitle.includes(type)) {
                            deviceType = type;
                            break;
                        }
                    }
                }
                result.deviceType = deviceType;
            }

            // 인증 정보 추출 및 결과에 할당
            function extractCertificationInfo(result: Record<string, any>, details: ProductDetails): void {
                // Extract certification ID (fallback method)
                let certificationId = details.certificationId || result.certificateId || '';
                if (!certificationId) {
                    const detailsList = document.querySelectorAll('div.entry-product-details > div > ul li');
                    for (const li of detailsList) {
                        const text = li.textContent || '';
                        if (text.toLowerCase().includes('certification') || text.toLowerCase().includes('certificate') ||
                            text.toLowerCase().includes('cert id')) {
                            const match = text.match(/([A-Za-z0-9-]+\d+[-][A-Za-z0-9]+)/);
                            if (match) {
                                certificationId = match[1];
                                break;
                            }

                            // Alternative: try to get anything after a colon
                            const parts = text.split(':');
                            if (parts.length > 1 && parts[1].trim()) {
                                certificationId = parts[1].trim();
                                break;
                            }
                        }
                    }
                }
                result.certificationId = certificationId;
                result.certificateId = certificationId;

                // Extract certification date (fallback method)
                let certificationDate = details.certificationDate || '';
                if (!certificationDate) {
                    const detailsList = document.querySelectorAll('div.entry-product-details > div > ul li');
                    for (const li of detailsList) {
                        const text = li.textContent || '';
                        if (text.toLowerCase().includes('date')) {
                            // Try to match a date pattern
                            const dateMatch = text.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})|(\d{4}-\d{1,2}-\d{1,2})|([A-Za-z]+\s+\d{1,2},?\s+\d{4})/);
                            if (dateMatch) {
                                certificationDate = dateMatch[0];
                                break;
                            }

                            // Alternative: try to get anything after a colon
                            const parts = text.split(':');
                            if (parts.length > 1 && parts[1].trim()) {
                                certificationDate = parts[1].trim();
                                break;
                            }
                        }
                    }
                }

                // Default to today if no date found
                if (!certificationDate) {
                    certificationDate = new Date().toISOString().split('T')[0];
                }
                result.certificationDate = certificationDate;
            }

            // 소프트웨어 및 하드웨어 버전 정보 추출 및 결과에 할당
            function extractVersionInfo(result: Record<string, any>, details: ProductDetails): void {
                // Extract software and hardware versions (fallback method)
                let softwareVersion = details.firmwareVersion || details.softwareVersion || '';
                let hardwareVersion = details.hardwareVersion || '';

                if (!softwareVersion || !hardwareVersion) {
                    const detailsList = document.querySelectorAll('div.entry-product-details > div > ul li');
                    for (const li of detailsList) {
                        const text = li.textContent || '';
                        if (!softwareVersion && (text.toLowerCase().includes('software') || text.toLowerCase().includes('firmware'))) {
                            const parts = text.split(':');
                            if (parts.length > 1) {
                                softwareVersion = parts[1].trim();
                            }
                        }
                        if (!hardwareVersion && text.toLowerCase().includes('hardware')) {
                            const parts = text.split(':');
                            if (parts.length > 1) {
                                hardwareVersion = parts[1].trim();
                            }
                        }
                    }
                }
                result.softwareVersion = softwareVersion;
                result.hardwareVersion = hardwareVersion;
                result.firmwareVersion = details.firmwareVersion || softwareVersion;
            }

            // VID/PID 하드웨어 ID 정보 추출 및 결과에 할당
            function extractHardwareIds(result: Record<string, any>, details: ProductDetails): void {
                // VID/PID 추출 (fallback method)
                let vid = details.vid || '';
                let pid = details.pid || '';

                if (!vid || !pid) {
                    const detailsList = document.querySelectorAll('div.entry-product-details > div > ul li');
                    for (const li of detailsList) {
                        const text = li.textContent || '';
                        if (!vid && (text.toLowerCase().includes('vendor id') || text.toLowerCase().includes('vid'))) {
                            const parts = text.split(':');
                            if (parts.length > 1) {
                                vid = parts[1].trim();
                            }
                        }
                        if (!pid && (text.toLowerCase().includes('product id') || text.toLowerCase().includes('pid'))) {
                            const parts = text.split(':');
                            if (parts.length > 1) {
                                pid = parts[1].trim();
                            }
                        }
                    }
                }
                result.vid = vid;
                result.pid = pid;
            }

            // 추가 정보 필드를 결과에 할당
            function extractAdditionalInfo(result: Record<string, any>, details: ProductDetails): void {
                // 추가 정보 할당
                result.familySku = details.familySku || '';
                result.familyVariantSku = details.familyVariantSku || '';
                result.familyId = details.familyId || '';
                result.tisTrpTested = details.tisTrpTested || '';
                result.specificationVersion = details.specificationVersion || '';
                result.transportInterface = details.transportInterface || '';
                result.primaryDeviceTypeId = details.primaryDeviceTypeId || '';
            }

            // 여기서 실제 데이터 추출 실행
            const productTitle = extractProductTitle();
            result.model = result.model || productTitle;

            // 세부 정보 추출 (두 가지 방식)
            const tableDetails = extractDetailsFromTable();
            const structuredDetails = extractDetailValues();

            // 두 정보를 병합 (구조화된 방식이 우선)
            const details = { ...tableDetails, ...structuredDetails };

            // 각 필드 정보 추출 및 병합
            extractManufacturerInfo(result, details, productTitle);
            extractDeviceTypeInfo(result, details, productTitle);
            extractCertificationInfo(result, details);
            extractVersionInfo(result, details);
            extractHardwareIds(result, details);
            extractAdditionalInfo(result, details);
            result.applicationCategories = extractApplicationCategories(result.deviceType);

            return result;
        }, product);

        return detailProduct as MatterProduct;
    } catch (error: unknown) {
        console.error(`[Crawler] Error crawling product detail for ${product.url}:`, error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to crawl product detail for ${product.url}: ${errorMessage}`);
    } finally {
        await browser.close();
    }
}

/**
 * 병렬 크롤링을 위한 Promise Pool 유틸리티
 * 개선된 버전: 효율적인 병렬 처리를 위해 재귀 호출 대신 while 루프 사용
 */
async function promisePool<T, U>(
    items: T[],
    worker: (item: T, signal: AbortSignal) => Promise<U>,
    concurrency: number,
    abortController: AbortController
): Promise<U[]> {
    const results: U[] = [];
    let nextIndex = 0;
    const total = items.length;

    // 각 작업자는 독립적으로 작업을 처리하는 함수
    async function runWorker(): Promise<void> {
        // 처리할 항목이 남아있는 동안 계속 작업 수행
        while (nextIndex < total) {
            if (shouldStopCrawling || abortController.signal.aborted) {
                break;
            }

            const currentIndex = nextIndex++;
            try {
                results[currentIndex] = await worker(items[currentIndex], abortController.signal);
            } catch (error) {
                console.error(`Worker error processing index ${currentIndex}:`, error);
            }
        }
    }

    // concurrency 수만큼 작업자 생성 및 병렬 실행
    const workers = Array.from(
        { length: Math.min(concurrency, total) },
        () => runWorker()
    );

    // 모든 작업자가 작업을 마칠 때까지 대기
    await Promise.all(workers);

    return results;
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
 * 제품 상세 정보 병렬 크롤링 실행
 */
async function executeParallelProductDetailCrawling(
    products: Product[],
    matterProducts: MatterProduct[],
    failedProducts: string[],
    failedProductErrors: Record<string, string[]>,
    abortController: AbortController,
    concurrency: number
): Promise<void> {
    let processedItems = 0;
    const totalItems = products.length;
    const startTime = Date.now();
    let lastProgressUpdate = Date.now();
    const progressUpdateInterval = 1000; // 1초마다 진행 상황 업데이트

    await promisePool(
        products,
        async (product, signal) => {
            const result = await processProductDetailCrawl(
                product, matterProducts, failedProducts, failedProductErrors, signal
            );

            processedItems++;

            // 정기적으로 진행 상황 업데이트
            const now = Date.now();
            if (now - lastProgressUpdate > progressUpdateInterval) {
                lastProgressUpdate = now;
                updateCrawlingProgress(processedItems, totalItems, startTime);
            }

            // 결과가 성공적이면 matterProducts 배열에 추가
            if (result && result.product) {
                matterProducts.push(result.product);
            }

            return result;
        },
        concurrency,
        abortController
    );

    // 마지막 진행 상황 업데이트
    updateCrawlingProgress(processedItems, totalItems, startTime, true);
}

/**
 * 진행 상황 업데이트
 */
function updateCrawlingProgress(
    processedItems: number, 
    totalItems: number, 
    startTime: number, 
    isCompleted: boolean = false
): void {
    const now = Date.now();
    const elapsedTime = now - startTime;
    const percentage = (processedItems / totalItems) * 100;
    let remainingTime: number | undefined = undefined;

    // 10% 이상 진행된 경우에만 남은 시간 예측
    if (processedItems > totalItems * 0.1) {
        const avgTimePerItem = elapsedTime / processedItems;
        remainingTime = (totalItems - processedItems) * avgTimePerItem;
    }

    crawlerEvents.emit('crawlingProgress', {
        status: isCompleted ? 'completed' : 'running',
        currentPage: processedItems,
        totalPages: totalItems,
        processedItems,
        totalItems,
        percentage,
        currentStep: CRAWLING_PHASES.PRODUCT_DETAIL,
        remainingTime: isCompleted ? 0 : remainingTime,
        elapsedTime,
        startTime,
        estimatedEndTime: remainingTime ? now + remainingTime : 0,
        newItems: processedItems,
        updatedItems: 0
    });
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
        const products = await Promise.race([
            crawlPageWithTimeout(pageNumber, totalPages, productsResults),
            new Promise<null>((_, reject) =>
                setTimeout(() => reject(new Error('Timeout')), PAGE_TIMEOUT_MS)
            ),
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
 * 단일 제품 상세 정보 크롤링 작업을 처리하는 함수
 */
async function processProductDetailCrawl(
    product: Product,
    matterProducts: MatterProduct[],
    failedProducts: string[],
    failedProductErrors: Record<string, string[]>,
    signal: AbortSignal,
    attempt: number = 1
): Promise<DetailCrawlResult | null> {
    if (shouldStopCrawling || signal.aborted) {
        updateProductTaskStatus(product.url, 'stopped');
        return null;
    }

    updateProductTaskStatus(product.url, 'running');

    try {
        const detailProduct = await Promise.race([
            crawlProductDetail(product),
            new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Timeout')), PRODUCT_DETAIL_TIMEOUT_MS)
            ),
            new Promise<never>((_, reject) => {
                signal.addEventListener('abort', () => reject(new Error('Aborted')));
            })
        ]);

        updateProductTaskStatus(product.url, 'success');
        return { url: product.url, product: detailProduct };
    } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        const status = shouldStopCrawling ? 'stopped' : 'error';
        updateProductTaskStatus(product.url, status, errorMsg);

        failedProducts.push(product.url);
        if (!failedProductErrors[product.url]) {
            failedProductErrors[product.url] = [];
        }

        const attemptPrefix = attempt > 1 ? `Attempt ${attempt}: ` : '';
        failedProductErrors[product.url].push(`${attemptPrefix}${errorMsg}`);

        return { url: product.url, product: null, error: errorMsg };
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
 * 제품 상세 정보 크롤링 시 작업 상태 업데이트 및 이벤트 발생
 */
function updateProductTaskStatus(url: string, status: ConcurrentTaskStatus, error?: string): void {
    const key = encodeURIComponent(url);
    concurrentProductTaskStates[key] = { url, status, error };
    crawlerEvents.emit('crawlingProductTaskStatus', Object.values(concurrentProductTaskStates));
}

/**
 * 타임아웃 처리가 있는 페이지 크롤링 함수
 */
async function crawlPageWithTimeout(
    pageNumber: number,
    totalPages: number,
    productsResults: Product[]
): Promise<Product[]> {
    const pageId = totalPages - pageNumber;

    const hasDuplicatePage = productsResults.some(product => product.pageId === pageId);

    if (hasDuplicatePage) {
        console.log(`[Crawler] Skipping duplicate page ${pageNumber} (pageId: ${pageId})`);
        return [];
    }

    const products = await crawlProductsFromPage(pageNumber, totalPages);

    if (products && products.length > 0) {
        productsResults.push(...products);
        console.log(`[Crawler] Added ${products.length} products from page ${pageNumber} (pageId: ${pageId})`);
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

        const uniquePageIds = [...new Set(products.map(p => p.pageId).filter((id): id is number => id !== undefined))];
        const sortedPageIds = uniquePageIds.sort((a, b) => b - a);

        debugLog(`[Crawler] 수집된 고유 pageId 개수: ${uniquePageIds.length}`);
        debugLog(`[Crawler] 고유 pageId 목록(내림차순): ${sortedPageIds.join(', ')}`);

        const pageIdCounts: Record<number, number> = {};
        products.forEach(p => {
            if (p.pageId !== undefined) {
                pageIdCounts[p.pageId] = (pageIdCounts[p.pageId] || 0) + 1;
            }
        });
        
        if(false){
            debugLog(`[Crawler] 각 pageId 별 제품 개수:`);
            Object.entries(pageIdCounts)
                .sort(([aKey, _], [bKey, __]) => Number(bKey) - Number(aKey))
                .forEach(([pageId, count]) => {
                    debugLog(`[Crawler] pageId ${pageId}: ${count}개 제품`);
                });
        }

        return filePath;
    } catch (err) {
        console.error('[Crawler] Failed to save products json:', err);
        throw err;
    }
}

/**
 * Matter 제품 상세 정보를 JSON 파일로 저장
 */
function saveMatterProductsToFile(products: MatterProduct[]): string {
    try {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        const h = String(now.getHours()).padStart(2, '0');
        const min = String(now.getMinutes()).padStart(2, '0');
        const s = String(now.getSeconds()).padStart(2, '0');
        const filename = `matter-products_${y}${m}${d}_${h}${min}${s}.json`;
        const outputDir = path.resolve(process.cwd(), 'dist-output');

        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const filePath = path.join(outputDir, filename);
        fs.writeFileSync(filePath, JSON.stringify(products, null, 2), 'utf-8');
        console.log(`[Crawler] Matter products saved to ${filePath}`);
        return filePath;
    } catch (err) {
        console.error('[Crawler] Failed to save matter products json:', err);
        throw err;
    }
}

/**
 * 크롤링 작업을 시작하는 함수 (병렬 버전)
 * @returns 크롤링 작업 시작 성공 여부
 */
export async function startCrawling(): Promise<boolean> {
    if (isCrawling) return false;
    
    // 크롤링 상태 초기화
    initializeCrawlingState();
    const abortController = new AbortController();

    try {
        // 1단계: 제품 목록 수집
        const productListResult = await collectProductList(abortController);
        
        // 중단 여부 처리
        if (shouldStopCrawling || abortController.signal.aborted) {
            crawlerEvents.emit('crawlingStopped', Object.values(concurrentTaskStates));
            isCrawling = false;
            return true;
        }
        
        // 2단계: 제품 상세 정보 수집
        await collectProductDetails(productListResult.products, abortController);
        
        return true;
    } catch (error) {
        handleCrawlingError(error);
        return false;
    } finally {
        isCrawling = false;
    }
}

/**
 * 크롤링 상태 초기화
 */
function initializeCrawlingState(): void {
    isCrawling = true;
    shouldStopCrawling = false;
    concurrentTaskStates = {};
    concurrentProductTaskStates = {};
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
        const totalPages = await getTotalPagesCached(true);
        const siteProductCount = totalPages * PRODUCTS_PER_PAGE;
        const { startPage, endPage } = await determineCrawlingRange();

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
 * 지정된 범위 내에서 랜덤한 지연 시간(ms)을 생성하는 함수
 */
function getRandomDelay(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * 특정 시간만큼 지연시키는 Promise를 반환하는 함수
 */
function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 크롤링 진행 상태 초기화 함수
 */
function initializeCrawlingProgress(currentStep: string): CrawlingProgress {
    const progress: CrawlingProgress = {
        status: 'initializing',
        currentPage: 0,
        totalPages: 0,
        processedItems: 0,
        totalItems: 0,
        startTime: Date.now(),
        estimatedEndTime: 0,
        newItems: 0,
        updatedItems: 0,
        percentage: 0,
        currentStep,
        remainingTime: undefined,
        elapsedTime: 0
    };
    crawlerEvents.emit('crawlingProgress', progress);
    return progress;
}

/**
 * 크롤링 오류 처리 함수
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
 * 1단계: 제품 목록 수집 프로세스
 */
async function collectProductList(abortController: AbortController): Promise<{
    products: Product[];
    failedPages: number[];
    failedPageErrors: Record<number, string[]>;
}> {
    // 진행 상태 초기화
    const crawlingProgress = initializeCrawlingProgress(CRAWLING_PHASES.PRODUCT_LIST);
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
    debugLog(`Starting phase 1: crawling product lists from page ${pageNumbers[0]} to ${pageNumbers[pageNumbers.length - 1]}`);
    await executeParallelCrawling(pageNumbers, totalPages, productsResults, failedPages, failedPageErrors, abortController, INITIAL_CONCURRENCY);

    // 실패한 페이지 재시도
    await retryFailedPages(failedPages, totalPages, productsResults, failedPageErrors, abortController);

    // 중복 제거 및 정렬
    deduplicateAndSortProducts(productsResults);
    
    // 1단계 결과 처리
    handleListCrawlingResults(productsResults, failedPages, failedPageErrors, crawlingProgress);
    
    return { products: productsResults, failedPages, failedPageErrors };
}

/**
 * 제품 목록 중복 제거 및 정렬
 */
function deduplicateAndSortProducts(productsResults: Product[]): void {
    if(false) {
        debugLog(`[Crawler] 중복 제거 전 제품 수: ${productsResults.length}`);
    }
    // 중복 제거를 위한 Map 생성 (pageId-indexInPage 조합을 키로 사용)
    const uniqueProductsMap = new Map<string, Product>();
    productsResults.forEach(product => {
        const key = `${product.pageId}-${product.indexInPage}`;
        uniqueProductsMap.set(key, product);
    });

    // Map에서 중복 제거된 제품 목록을 배열로 변환
    const uniqueProducts = Array.from(uniqueProductsMap.values());

    // pageId는 내림차순, 같은 pageId 내에서는 indexInPage 오름차순으로 정렬
    const sortedProducts = uniqueProducts.sort((a, b) => {
        const aPageId = a.pageId ?? 0;
        const bPageId = b.pageId ?? 0;

        if (aPageId !== bPageId) {
            return bPageId - aPageId;
        }

        const aIndexInPage = a.indexInPage ?? 0;
        const bIndexInPage = b.indexInPage ?? 0;
        return aIndexInPage - bIndexInPage;
    });

    // 정렬된 결과로 productsResults 업데이트
    productsResults.length = 0; 
    productsResults.push(...sortedProducts);

    if (false) {
        debugLog(`[Crawler] 중복 제거 및 정렬 후 제품 수: ${productsResults.length}`);
    }
}

/**
 * 2단계: 제품 상세 정보 수집 프로세스
 */
async function collectProductDetails(
    productsResults: Product[],
    abortController: AbortController
): Promise<void> {
    // 진행 상태 초기화 (2단계)
    const crawlingProgress = initializeCrawlingProgress(CRAWLING_PHASES.PRODUCT_DETAIL);
    crawlingProgress.totalItems = productsResults.length;
    crawlerEvents.emit('crawlingProgress', crawlingProgress);

    const matterProducts: MatterProduct[] = [];
    let failedProducts: string[] = [];
    const failedProductErrors: Record<string, string[]> = {};

    // 제품 상세 정보 작업 상태 초기화
    initializeProductTaskStates(productsResults);

    debugLog(`Starting phase 2: crawling product details for ${productsResults.length} products`);

    // 제품 상세 정보 병렬 크롤링 실행
    await executeParallelProductDetailCrawling(
        productsResults,
        matterProducts,
        failedProducts,
        failedProductErrors,
        abortController,
        DETAIL_CONCURRENCY
    );

    // 실패한 제품 재시도
    await retryFailedProductDetails(
        failedProducts,
        productsResults,
        matterProducts,
        failedProductErrors,
        abortController
    );

    // 중복 제거 및 정렬
    deduplicateAndSortMatterProducts(matterProducts);
    
    // 데이터 일관성 검증
    validateDataConsistency(productsResults, matterProducts);
    
    // 2단계 결과 처리 및 보고
    handleDetailCrawlingResults(matterProducts, failedProducts, failedProductErrors, crawlingProgress);

    // 중단 여부 처리
    if (shouldStopCrawling || abortController.signal.aborted) {
        crawlerEvents.emit('crawlingProductsStopped', Object.values(concurrentProductTaskStates));
    }
}

/**
 * Matter 제품 상세 정보 중복 제거 및 정렬
 */
function deduplicateAndSortMatterProducts(matterProducts: MatterProduct[]): void {
    debugLog(`[Crawler] 중복 제거 전 수집에 성공한 상세 제품 정보 수: ${matterProducts.length}`);
    
    // 중복 제거를 위한 Map 생성 (pageId-indexInPage 조합을 키로 사용)
    const uniqueMatterProductsMap = new Map<string, MatterProduct>();
    matterProducts.forEach(product => {
        if (product.pageId !== undefined && product.indexInPage !== undefined) {
            const key = `${product.pageId}-${product.indexInPage}`;
            uniqueMatterProductsMap.set(key, product);
        }
    });
    
    // Map에서 중복 제거된 제품 목록을 배열로 변환
    const uniqueMatterProducts = Array.from(uniqueMatterProductsMap.values());
    
    // pageId는 오름차순, 같은 pageId 내에서는 indexInPage 오름차순으로 정렬
    const sortedMatterProducts = uniqueMatterProducts.sort((a, b) => {
        const aPageId = a.pageId ?? 0;
        const bPageId = b.pageId ?? 0;
        
        if (aPageId !== bPageId) {
            return aPageId - bPageId;
        }
        
        const aIndexInPage = a.indexInPage ?? 0;
        const bIndexInPage = b.indexInPage ?? 0;
        return aIndexInPage - bIndexInPage;
    });
    
    // 정렬된 결과로 matterProducts 업데이트
    matterProducts.length = 0;
    matterProducts.push(...sortedMatterProducts);
    
    debugLog(`[Crawler] 중복 제거 및 정렬 후 상세 제품 정보 수: ${matterProducts.length}`);
}

/**
 * 1단계와 2단계 데이터 일관성 검증
 */
function validateDataConsistency(productsResults: Product[], matterProducts: MatterProduct[]): void {
    debugLog(`[Crawler] 1단계(제품 목록)와 2단계(상세 정보) 데이터 일관성 검증 시작`);
    
    // URL 기준으로 1단계 결과를 맵으로 변환하여 빠른 조회 가능하게 함
    const productsResultsMap = new Map<string, Product>();
    productsResults.forEach(product => {
        if (product.url) {
            productsResultsMap.set(product.url, product);
        }
    });
    
    // 2단계에서 수집했지만 1단계에 없는 항목 확인
    const missingInProductsResults: MatterProduct[] = [];
    
    // 1단계와 2단계 사이의 불일치 항목 확인
    const discrepancies: Array<{
        url: string;
        phase1Data: Product;
        phase2Data: MatterProduct;
        differences: Array<{ field: string; phase1Value: any; phase2Value: any }>;
    }> = [];
    
    // 2단계 수집 후 누락된 URL 확인 
    const missingInMatterProducts: Product[] = [];
    
    // 모든 matterProducts 항목을 productsResults와 비교
    matterProducts.forEach(matterProduct => {
        const productResult = productsResultsMap.get(matterProduct.url);
        
        if (!productResult) {
            // 1단계에서 수집되지 않은 URL인 경우
            missingInProductsResults.push(matterProduct);
        } else {
            // 두 단계 사이의 데이터 불일치 확인
            const differences = findDataDiscrepancies(productResult, matterProduct);
            
            if (differences.length > 0) {
                discrepancies.push({
                    url: matterProduct.url,
                    phase1Data: productResult,
                    phase2Data: matterProduct,
                    differences
                });
            }
        }
    });
    
    // 1단계에서 수집했지만 2단계에서 누락된 항목 확인
    const matterProductsUrlSet = new Set(matterProducts.map(p => p.url));
    productsResults.forEach(product => {
        if (product.url && !matterProductsUrlSet.has(product.url)) {
            missingInMatterProducts.push(product);
        }
    });
    
    // 일관성 검증 결과 로그
    logDataConsistencyResults(missingInProductsResults, discrepancies, missingInMatterProducts);
}

/**
 * 두 단계 사이의 데이터 불일치 찾기
 */
function findDataDiscrepancies(productResult: Product, matterProduct: MatterProduct): Array<{ field: string; phase1Value: any; phase2Value: any }> {
    const differences: Array<{ field: string; phase1Value: any; phase2Value: any }> = [];
    
    // 주요 필드 비교
    const fieldsToCompare: Array<keyof Product> = ['model', 'manufacturer', 'certificateId', 'pageId', 'indexInPage'];
    
    fieldsToCompare.forEach(field => {
        const phase1Value = productResult[field];
        const phase2Value = matterProduct[field];
        
        // 값이 다르고, 둘 다 존재하는 경우에만 기록
        if (phase1Value !== undefined && phase2Value !== undefined && phase1Value !== phase2Value) {
            differences.push({
                field: field.toString(),
                phase1Value,
                phase2Value
            });
        }
    });
    
    return differences;
}

/**
 * 데이터 일관성 검증 결과 로깅
 */
function logDataConsistencyResults(
    missingInProductsResults: MatterProduct[],
    discrepancies: Array<{
        url: string;
        phase1Data: Product;
        phase2Data: MatterProduct;
        differences: Array<{ field: string; phase1Value: any; phase2Value: any }>;
    }>,
    missingInMatterProducts: Product[]
): void {
    debugLog(`[Crawler] 데이터 일관성 검증 결과:`);
    
    // 1단계에 없는 URL 보고
    debugLog(`[Crawler] - 1단계에 없지만 2단계에서 수집된 URL 수: ${missingInProductsResults.length}`);
    if (missingInProductsResults.length > 0) {
        missingInProductsResults.forEach(product => {
            debugLog(`[Crawler]   * ${product.url} (ID: ${product.id})`);
        });
    }
    
    // 불일치 항목 보고
    debugLog(`[Crawler] - 1단계와 2단계 사이 정보 불일치 항목 수: ${discrepancies.length}`);
    if (discrepancies.length > 0) {
        discrepancies.forEach(({url, differences}) => {
            debugLog(`[Crawler]   * ${url} 불일치 필드:`);
            differences.forEach(diff => {
                debugLog(`[Crawler]     - ${diff.field}: 1단계="${diff.phase1Value}" vs 2단계="${diff.phase2Value}"`);
            });
        });
    }
    
    // 누락된 URL 보고
    debugLog(`[Crawler] - 2단계에서 누락된 제품 URL 수: ${missingInMatterProducts.length}`);
    if (missingInMatterProducts.length > 0 && missingInMatterProducts.length <= 10) {
        // 10개 이하만 상세 출력
        missingInMatterProducts.forEach(product => {
            debugLog(`[Crawler]   * ${product.url} (pageId: ${product.pageId}, indexInPage: ${product.indexInPage})`);
        });
    } else if (missingInMatterProducts.length > 10) {
        // 10개 초과 시 일부만 출력
        debugLog(`[Crawler]   * 처음 10개만 표시: ${missingInMatterProducts.slice(0, 10).map(p => p.url).join(', ')}`);
    }
}

/**
 * 작업 상태 초기화 함수
 */
function initializeTaskStates(pageNumbers: number[]): void {
    for (const pageNumber of pageNumbers) {
        concurrentTaskStates[pageNumber] = { pageNumber, status: 'pending' };
    }
    crawlerEvents.emit('crawlingTaskStatus', Object.values(concurrentTaskStates));
}

/**
 * 제품 상세 정보 작업 상태 초기화 함수
 */
function initializeProductTaskStates(products: Product[]): void {
    for (const product of products) {
        const key = encodeURIComponent(product.url);
        concurrentProductTaskStates[key] = { url: product.url, status: 'pending' };
    }
    crawlerEvents.emit('crawlingProductTaskStatus', Object.values(concurrentProductTaskStates));
}

/**
 * 실패한 페이지를 재시도하는 함수
 */
async function retryFailedPages(
    failedPages: number[],
    totalPages: number,
    productsResults: Product[],
    failedPageErrors: Record<number, string[]>,
    abortController: AbortController
): Promise<void> {
    for (let attempt = RETRY_START; attempt <= RETRY_MAX && failedPages.length > 0; attempt++) {
        const retryPages = [...failedPages];
        failedPages = [];
        debugLog(`[Retry] 페이지 재시도 중 (${attempt}번째 시도): ${retryPages.join(', ')}`);
        
        await promisePool(
            retryPages,
            async (pageNumber, signal) => processPageCrawl(
                pageNumber, totalPages, productsResults, failedPages, failedPageErrors, signal, attempt
            ),
            RETRY_CONCURRENCY,
            abortController
        );
        
        if (failedPages.length === 0) {
            debugLog('[Retry] 모든 페이지 재시도 성공');
            break;
        }
    }
    
    if (failedPages.length > 0) {
        debugLog(`[Retry] ${RETRY_MAX}회 재시도 후에도 실패한 페이지: ${failedPages.join(', ')}`);
    }
}

/**
 * 실패한 제품 상세 정보를 재시도하는 함수
 */
async function retryFailedProductDetails(
    failedProducts: string[],
    allProducts: Product[],
    matterProducts: MatterProduct[],
    failedProductErrors: Record<string, string[]>,
    abortController: AbortController
): Promise<void> {
    // URL 유효성 검증: 빈 URL 필터링
    const validFailedProducts = failedProducts.filter(url => !!url);
    if (validFailedProducts.length !== failedProducts.length) {
        debugLog(`[RETRY] 유효하지 않은 URL ${failedProducts.length - validFailedProducts.length}개를 필터링했습니다.`);
    }
    
    // 유효한 URL만 사용
    failedProducts = validFailedProducts;
    
    for (let attempt = RETRY_START; attempt <= RETRY_MAX && failedProducts.length > 0; attempt++) {
        const retryUrls = [...failedProducts];
        failedProducts = [];
        
        // URL로 제품 찾기
        const retryProducts = allProducts.filter(p => p.url && retryUrls.includes(p.url));
        
        debugLog(`[RETRY][${attempt}] 제품 상세 정보 재시도 중: ${retryProducts.length}개 제품`);
        
        if (retryProducts.length === 0) {
            debugLog(`[RETRY][${attempt}] 재시도할 제품이 없습니다.`);
            break;
        }
        
        await promisePool(
            retryProducts,
            async (product, signal) => processProductDetailCrawl(
                product, matterProducts, failedProducts, failedProductErrors, signal, attempt
            ),
            RETRY_CONCURRENCY,
            abortController
        );
        
        if (failedProducts.length === 0) {
            debugLog(`[RETRY] 모든 제품 상세 정보 재시도 성공`);
            break;
        }
    }
    
    if (failedProducts.length > 0) {
        debugLog(`[RETRY] ${RETRY_MAX}회 재시도 후에도 실패한 제품 URL 수: ${failedProducts.length}`);
    }
}

/**
 * 제품 목록 크롤링 결과 처리 함수
 */
function handleListCrawlingResults(
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

    // 크롤링 결과 중간 보고
    crawlerEvents.emit('crawlingPhase1Complete', {
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
}

/**
 * 제품 상세 정보 크롤링 결과 처리 함수
 */
function handleDetailCrawlingResults(
    matterProducts: MatterProduct[],
    failedProducts: string[],
    failedProductErrors: Record<string, string[]>,
    crawlingProgress: CrawlingProgress
): void {
    // 실패 보고서 생성
    let failedReport: FailedProductReport[] = [];
    if (failedProducts.length > 0) {
        failedReport = failedProducts.map(url => ({
            url,
            errors: failedProductErrors[url]
        }));
        crawlerEvents.emit('crawlingFailedProducts', failedReport);
    }

    // 크롤링 결과 보고
    crawlerEvents.emit('crawlingComplete', {
        success: true,
        count: matterProducts.length,
        products: matterProducts,
        failedReport
    });

    // 결과 파일 저장
    try {
        saveMatterProductsToFile(matterProducts);
    } catch (err) {
        console.error('[Crawler] Failed to save matter products json:', err);
    }
}