/**
 * crawler.ts
 * 인증 정보 웹사이트 크롤링을 위한 모듈
 */

import { chromium } from 'playwright-chromium';
import { getDatabaseSummaryFromDb } from '../database.js';
import type { CrawlingProgress } from '../../ui/types.js';
import type { Product, MatterProduct } from '../../../types.d.ts';
import { EventEmitter } from 'events';

// Import utility modules
import { getRandomDelay, delay } from './utils/delay.js';
import { saveProductsToFile, saveMatterProductsToFile } from './utils/file.js';
import {
  crawlerEvents, handleCrawlingError, initializeCrawlingProgress,
  updateCrawlingProgress, CRAWLING_PHASES, ConcurrentTaskStatus
} from './utils/progress.js';
import {
  deduplicateAndSortProducts, deduplicateAndSortMatterProducts, validateDataConsistency
} from './utils/data-processing.js';
import {
  promisePool, updateTaskStatus, updateProductTaskStatus,
  initializeTaskStates, initializeProductTaskStates, initializeCrawlingState,
  concurrentTaskStates, concurrentProductTaskStates
} from './utils/concurrency.js';
import {
  BASE_URL, MATTER_FILTER_URL, PAGE_TIMEOUT_MS, PRODUCT_DETAIL_TIMEOUT_MS,
  PRODUCTS_PER_PAGE, INITIAL_CONCURRENCY, DETAIL_CONCURRENCY,
  RETRY_CONCURRENCY, MIN_REQUEST_DELAY_MS, MAX_REQUEST_DELAY_MS,
  RETRY_START, RETRY_MAX, CACHE_TTL_MS
} from './utils/constants.js';
import type {
  CrawlResult, DetailCrawlResult, FailedPageReport, FailedProductReport
} from './utils/types.js';
import { debugLog } from '../util.js';

//#region file scope variables
// 크롤링 상태 관리
let isCrawling = false;
let shouldStopCrawling = false;

// 네트워크 호출 캐시(세션 단위)
let cachedTotalPages: number | null = null;
let cachedTotalPagesFetchedAt: number | null = null;
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
        failedPages.length = 0;
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
    
    // 유효한 URL로 원래 배열 업데이트 (참조 유지)
    failedProducts.length = 0;
    failedProducts.push(...validFailedProducts);
    
    for (let attempt = RETRY_START; attempt <= RETRY_MAX && failedProducts.length > 0; attempt++) {
        const retryUrls = [...failedProducts];
        
        // 기존 배열을 재할당하지 않고 길이를 0으로 설정하여 비움
        failedProducts.length = 0;
        
        // URL로 제품 찾기
        const retryProducts = allProducts.filter(p => p.url && retryUrls.includes(p.url));
        
        debugLog(`[RETRY][${attempt}] 제품 상세 정보 재시도 중: ${retryProducts.length}개 제품`);
        
        if (retryProducts.length === 0) {
            debugLog(`[RETRY][${attempt}] 재시도할 제품이 없습니다.`);
            break;
        }
        
        // 이 부분이 수정된 부분입니다 - 결과 처리 로직 추가
        const results = await promisePool(
            retryProducts,
            async (product, signal) => {
                const result = await processProductDetailCrawl(
                    product, matterProducts, failedProducts, failedProductErrors, signal, attempt
                );
                
                // 결과가 성공적이면 matterProducts 배열에 추가
                if (result && result.product) {
                    matterProducts.push(result.product);
                }
                
                return result;
            },
            RETRY_CONCURRENCY,
            abortController
        );
        
        if (failedProducts.length === 0) {
            debugLog(`[RETRY] 모든 제품 상세 정보 재시도 성공`);
            break;
        }
    }
    
    // 재시도 결과 요약 로깅
    const retrySuccessCount = validFailedProducts.length - failedProducts.length;
    if (retrySuccessCount > 0) {
        debugLog(`[RETRY] 재시도를 통해 ${retrySuccessCount}개의 추가 제품 정보를 성공적으로 수집했습니다.`);
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

    // 수집해야할 페이지가 없는 경우
    if (pageNumbers.length === 0) {
        console.log('[Crawler] No new pages to crawl. Database is up to date.');
        crawlerEvents.emit('crawlingWarning', {
            message: 'No new pages to crawl',
            details: 'Database is already up to date with the latest products.'
        });
        return { products: [], failedPages: [], failedPageErrors: {} };
    }

    // 수집할 총 페이지 수
    const totalPagesToFetch = pageNumbers.length;
    crawlingProgress.totalPages = totalPagesToFetch;
    crawlingProgress.totalItems = totalPagesToFetch * PRODUCTS_PER_PAGE;
    crawlerEvents.emit('crawlingProgress', crawlingProgress);

    debugLog(`Total pages to crawl: ${totalPages}`);
    const productsResults: Product[] = [];
    const failedPages: number[] = [];
    const failedPageErrors: Record<number, string[]> = {};

    // 작업 상태 초기화
    initializeTaskStates(pageNumbers);

    // 페이지 범위 정보 로그
    console.log(`[Crawler] Preparing to crawl pages ${pageNumbers[0]} to ${pageNumbers[pageNumbers.length - 1]}, total: ${pageNumbers.length} pages`);

    // 초기 페이지 수집 상태 추적 - 각 페이지별 수집 결과를 추적하기 위한 맵
    // 이를 통해 최종적으로 몇 개의 페이지가 성공/실패했는지 정확히 판단 가능
    const pageCollectionStatus = new Map<number, boolean>();
    pageNumbers.forEach(pageNumber => {
        pageCollectionStatus.set(pageNumber, false); // 초기값: 미수집(false)
    });

    // 1차 병렬 크롤링 실행
    debugLog(`Starting phase 1: crawling product lists from page ${pageNumbers[0]} to ${pageNumbers[pageNumbers.length - 1]}`);
    await executeParallelCrawling(pageNumbers, totalPages, productsResults, failedPages, failedPageErrors, abortController, INITIAL_CONCURRENCY);

    // 1차 수집 후 성공한 페이지들 상태 업데이트
    pageNumbers.forEach(pageNumber => {
        if (!failedPages.includes(pageNumber)) {
            pageCollectionStatus.set(pageNumber, true); // 성공으로 표시
        }
    });

    // 실패한 페이지 재시도
    const initialFailedPages = [...failedPages]; // 1차 시도에서 실패한 페이지들의 복사본
    if (failedPages.length > 0) {
        console.log(`[Crawler] Retrying ${failedPages.length} failed pages.`);
        await retryFailedPages(failedPages, totalPages, productsResults, failedPageErrors, abortController);
        
        // 재시도 후 성공한 페이지들 상태 업데이트
        debugLog(`${failedPages.length} pages failed after retrying.`);
        debugLog(`${failedPages}`)
        initialFailedPages.forEach(pageNumber => {
            if (!failedPages.includes(pageNumber)) {
                pageCollectionStatus.set(pageNumber, true); // 재시도 성공으로 표시
            }
        });
    }

    // 중단 여부 처리
    if (shouldStopCrawling || abortController.signal.aborted) {
        console.log('[Crawler] Crawling was stopped during product list collection.');
        crawlerEvents.emit('crawlingStopped', {
            message: 'Crawling stopped by user',
            details: 'Crawling process was manually stopped during product list collection.'
        });
    }

    // 최종 수집 실패율 계산 (초기 + 재시도 후)
    const totalFailedPages = failedPages.length;
    const failureRate = totalFailedPages / totalPagesToFetch;
    
    // 초기 실패율과 최종 실패율 로깅
    const initialFailRate = initialFailedPages.length / totalPagesToFetch;
    const finalFailRate = failureRate;
    console.log(`[Crawler] Initial failure rate: ${(initialFailRate * 100).toFixed(1)}% (${initialFailedPages.length}/${totalPagesToFetch})`);
    console.log(`[Crawler] Final failure rate after retries: ${(finalFailRate * 100).toFixed(1)}% (${totalFailedPages}/${totalPagesToFetch})`);
    
    if (totalFailedPages > 0) {
        // 1 페이지라도 실패한 경우 (심각한 오류로 간주)
        console.warn(`[Crawler] Some pages failed: ${totalFailedPages} out of ${totalPagesToFetch} pages (${(failureRate * 100).toFixed(1)}%) could not be crawled even after retries`);
        crawlerEvents.emit('crawlingWarning', {
            message: 'Some pages failed',
            details: `${totalFailedPages} out of ${totalPagesToFetch} pages (${(failureRate * 100).toFixed(1)}%) could not be crawled even after retries`
        });
    } else if (initialFailedPages.length > 0 && totalFailedPages === 0) {
        // 재시도 후 모든 페이지 성공한 경우
        console.log(`[Crawler] All pages successfully crawled after retries. Initial failures: ${initialFailedPages.length}`);
    }

    // 수집 성공률 통계
    const successPages = pageNumbers.length - totalFailedPages;
    const successRate = successPages / totalPagesToFetch;
    console.log(`[Crawler] Collection success rate: ${(successRate * 100).toFixed(1)}% (${successPages}/${totalPagesToFetch})`);

    // 중복 제거 및 정렬
    deduplicateAndSortProducts(productsResults);
    
    // 1단계 결과 처리
    handleListCrawlingResults(productsResults, failedPages, failedPageErrors, crawlingProgress);
    
    return { products: productsResults, failedPages, failedPageErrors };
}

/**
 * 2단계: 제품 상세 정보 수집 프로세스
 */
async function collectProductDetails(
    productsResults: Product[],
    abortController: AbortController
): Promise<{
    matterProducts: MatterProduct[];
    failedProducts: string[];
    failedProductErrors: Record<string, string[]>;
}> {
    if (productsResults.length === 0) {
        console.log('[Crawler] No products to collect details for.');
        return { matterProducts: [], failedProducts: [], failedProductErrors: {} };
    }

    // 진행 상태 초기화 (2단계)
    const crawlingProgress = initializeCrawlingProgress(CRAWLING_PHASES.PRODUCT_DETAIL);
    crawlingProgress.totalItems = productsResults.length;
    crawlingProgress.totalPages = productsResults.length; // 총 페이지 수 = 총 제품 수
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

    // 중단 여부 처리
    if (shouldStopCrawling || abortController.signal.aborted) {
        console.log('[Crawler] Crawling was stopped during product detail collection.');
        crawlerEvents.emit('crawlingProductsStopped', {
            message: 'Crawling stopped by user',
            details: 'Crawling process was manually stopped during product detail collection.'
        });
        return { matterProducts, failedProducts, failedProductErrors };
    }

    // 실패한 제품 재시도
    if (failedProducts.length > 0) {
        console.log(`[Crawler] Retrying ${failedProducts.length} failed products.`);
        await retryFailedProductDetails(
            failedProducts,
            productsResults,
            matterProducts,
            failedProductErrors,
            abortController
        );
    }

    // 중복 제거 및 정렬
    deduplicateAndSortMatterProducts(matterProducts);
    
    // 데이터 일관성 검증
    validateDataConsistency(productsResults, matterProducts);
    
    // 2단계 결과 처리 및 보고
    handleDetailCrawlingResults(matterProducts, failedProducts, failedProductErrors, crawlingProgress);

    return { matterProducts, failedProducts, failedProductErrors };
}

/**
 * 크롤링 작업을 시작하는 함수 (병렬 버전)
 * @returns 크롤링 작업 시작 성공 여부
 */
export async function startCrawling(): Promise<boolean> {
    if (isCrawling) {
        console.log('[Crawler] Crawling is already in progress.');
        return false;
    }
    
    // 크롤링 상태 초기화
    initializeCrawlingState();
    isCrawling = true;
    shouldStopCrawling = false;
    const abortController = new AbortController();

    try {
        console.log('[Crawler] Starting crawling process...');
        
        // 1단계: 제품 목록 수집
        const productListResult = await collectProductList(abortController);
        
        // 중단 여부 처리
        if (shouldStopCrawling || abortController.signal.aborted) {
            console.log('[Crawler] Crawling was stopped after product list collection.');
            crawlerEvents.emit('crawlingStopped', Object.values(concurrentTaskStates));
            isCrawling = false;
            return true;
        }
        
        // 심각한 오류가 있는지 확인하고 중단 여부 결정
        const totalPages = await getTotalPagesCached();
        const { startPage, endPage } = await determineCrawlingRange();
        const totalPagesToFetch = endPage - startPage + 1;
        
        if (productListResult.failedPages.length > totalPagesToFetch * 0.3) { // 30% 이상 실패 시 심각한 오류로 간주
            console.error(`[Crawler] Critical error: Failed to crawl ${productListResult.failedPages.length} out of ${totalPagesToFetch} pages (${(productListResult.failedPages.length / totalPagesToFetch * 100).toFixed(1)}%). Stopping the crawling process.`);
            crawlerEvents.emit('crawlingError', {
                message: 'Critical crawling error',
                details: `Failed to crawl ${productListResult.failedPages.length} out of ${totalPagesToFetch} pages (${(productListResult.failedPages.length / totalPagesToFetch * 100).toFixed(1)}%). Stopping the crawling process.`
            });
            isCrawling = false;
            return false;
        }
        
        // 2단계: 제품 상세 정보 수집
        await collectProductDetails(productListResult.products, abortController);
        
        console.log('[Crawler] Crawling process completed successfully.');
        return true;
    } catch (error) {
        handleCrawlingError(error);
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