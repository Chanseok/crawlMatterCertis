/**
 * productDetail.ts
 * 제품 상세 정보 수집을 담당하는 클래스
 */

import { chromium } from 'playwright-chromium';
import { getRandomDelay, delay } from '../utils/delay.js';
import { CrawlerState } from '../core/CrawlerState.js';
import {
  promisePool, updateProductTaskStatus, initializeProductTaskStates
} from '../utils/concurrency.js';
import {
  PRODUCT_DETAIL_TIMEOUT_MS, DETAIL_CONCURRENCY, RETRY_CONCURRENCY,
  MIN_REQUEST_DELAY_MS, MAX_REQUEST_DELAY_MS, RETRY_START, RETRY_MAX
} from '../utils/constants.js';
import type { DetailCrawlResult } from '../utils/types.js';
import type { Product, MatterProduct } from '../../../../types.d.ts';
import { debugLog } from '../../util.js';
import { crawlerEvents } from '../utils/progress.js';

export class ProductDetailCollector {
  private state: CrawlerState;
  private abortController: AbortController;

  constructor(state: CrawlerState, abortController: AbortController) {
    this.state = state;
    this.abortController = abortController;
  }

  /**
   * 제품 상세 정보 수집 프로세스 실행
   */
  public async collect(products: Product[]): Promise<MatterProduct[]> {
    debugLog(`[ProductDetailCollector] Starting product detail collection for ${products.length} products.`);
    if (products.length === 0) {
      console.log('[ProductDetailCollector] No products to collect details for.');
      return [];
    }

    this.state.setStage('productDetail:init', '2단계: 제품 상세 정보 수집 준비 중');

    // 진행 상태 업데이트
    this.state.updateProgress({
      totalItems: products.length,
      currentItem: 0,
      parallelTasks: DETAIL_CONCURRENCY,
      activeParallelTasks: 0
    });

    const matterProducts: MatterProduct[] = [];
    const failedProducts: string[] = [];
    const failedProductErrors: Record<string, string[]> = {};

    // 제품 상세 정보 작업 상태 초기화
    initializeProductTaskStates(products);

    this.state.setStage('productDetail:fetching', '2단계: 제품 상세 정보 수집 중');
    debugLog(`Starting phase 2: crawling product details for ${products.length} products`);

    // 제품 상세 정보 병렬 크롤링 실행
    await this.executeParallelProductDetailCrawling(
      products,
      matterProducts,
      failedProducts,
      failedProductErrors
    );

    // 중단 여부 처리
    if (this.abortController.signal.aborted) {
      console.log('[ProductDetailCollector] Crawling was stopped during product detail collection.');
      return matterProducts;
    }

    // 실패한 제품 재시도
    const initialFailedProducts = [...failedProducts];
    if (failedProducts.length > 0) {
      console.log(`[ProductDetailCollector] Retrying ${failedProducts.length} failed products.`);
      await this.retryFailedProductDetails(
        failedProducts,
        products,
        matterProducts,
        failedProductErrors
      );
    }

    // 최종 실패율 계산 및 로깅
    const totalProducts = products.length;
    const finalFailedCount = failedProducts.length;
    const finalFailureRate = finalFailedCount / totalProducts;
    const initialFailRate = initialFailedProducts.length / totalProducts;

    console.log(`[ProductDetailCollector] Initial failure rate: ${(initialFailRate * 100).toFixed(1)}% (${initialFailedProducts.length}/${totalProducts})`);
    console.log(`[ProductDetailCollector] Final failure rate after retries: ${(finalFailureRate * 100).toFixed(1)}% (${finalFailedCount}/${totalProducts})`);

    // 실패 상태 기록
    failedProducts.forEach(url => {
      const errors = failedProductErrors[url] || ['Unknown error'];
      this.state.addFailedProduct(url, errors.join('; '));
    });

    // 수집 성공률 통계
    const successProducts = totalProducts - finalFailedCount;
    const successRate = successProducts / totalProducts;
    console.log(`[ProductDetailCollector] Collection success rate: ${(successRate * 100).toFixed(1)}% (${successProducts}/${totalProducts})`);

    // 제품 상세 정보 처리 단계로 전환
    this.state.setStage('productDetail:processing', '2단계: 제품 상세 정보 처리 중');
    // 최종 결과 반환 전에 모든 리소스 정리
    this.cleanupResources();

    return matterProducts;
  }

/**
 * 리소스 정리 함수
 */
private cleanupResources(): void {
  console.log('[ProductDetailCollector] Cleaning up resources...');

  // 열려있는 브라우저 인스턴스 정리
  try {
    // 여기에 필요한 리소스 정리 로직을 구현
    // (참고: AbortController는 호출하지 않음)
    
    // 마지막 상태 업데이트 강제 발생
    this.state.updateProgress({
      currentItem: this.state.getProgressData().totalItems,
      stage: 'productDetail:processing',
      message: '2단계: 제품 상세 정보 처리 완료'
    });
    
    // UI에 단계 변경 명시적 알림
    crawlerEvents.emit('crawlingStageChanged', 'productDetail:processing', '2단계: 제품 상세 정보 처리 완료');
  } catch (error) {
    console.error('[ProductDetailCollector] Error cleaning up resources:', error);
  }
}

  /**
   * 제품 상세 정보를 크롤링하는 함수
   */
  private async crawlProductDetail(product: Product, signal: AbortSignal): Promise<MatterProduct> {
    // 서버 과부하 방지를 위한 무작위 지연 시간 적용
    const delayTime = getRandomDelay(MIN_REQUEST_DELAY_MS, MAX_REQUEST_DELAY_MS);
    await delay(delayTime);

    const browser = await chromium.launch({ headless: true });

    try {
      // 중단 신호 확인 - 브라우저가 시작된 직후
      if (signal.aborted) {
        throw new Error('Aborted');
      }

      const context = await browser.newContext();
      const page = await context.newPage();

      // 중단 시 브라우저 작업을 취소하기 위한 이벤트 리스너
      const abortListener = () => {
        if (!browser.isConnected()) return;
        browser.close().catch(e => console.error('Error closing browser after abort:', e));
      };
      signal.addEventListener('abort', abortListener);

      // 페이지 로드를 시작하기 전에 중단 신호 확인
      if (signal.aborted) {
        throw new Error('Aborted');
      }

      await page.goto(product.url, { waitUntil: 'domcontentloaded' });

      // 중단 신호 확인 - 페이지 이동 직후
      if (signal.aborted) {
        throw new Error('Aborted');
      }

      // 제품 상세 정보 추출
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
      if (signal.aborted) {
        throw new Error(`Aborted crawling for ${product.url}`);
      }
      console.error(`[ProductDetailCollector] Error crawling product detail for ${product.url}:`, error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to crawl product detail for ${product.url}: ${errorMessage}`);
    } finally {
      try {
        // 중단 여부와 상관없이 항상 브라우저 종료 시도
        if (browser.isConnected()) {
          await browser.close();
        }
      } catch (e) {
        console.error(`Error while closing browser for ${product.url}:`, e);
      }
    }
  }

  /**
   * 단일 제품 상세 정보 크롤링 작업을 처리하는 함수
   */
  private async processProductDetailCrawl(
    product: Product,
    matterProducts: MatterProduct[],
    failedProducts: string[],
    failedProductErrors: Record<string, string[]>,
    signal: AbortSignal,
    attempt: number = 1
  ): Promise<DetailCrawlResult | null> {
    if (signal.aborted) {
      updateProductTaskStatus(product.url, 'stopped');
      return null;
    }

    updateProductTaskStatus(product.url, 'running');

    // AbortController에 signal을 전달하는 대신 직접 사용
    try {
      // 이제 crawlProductDetail 함수에 signal을 전달합니다
      const detailProduct = await Promise.race([
        this.crawlProductDetail(product, signal),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), PRODUCT_DETAIL_TIMEOUT_MS)
        )
      ]);

      updateProductTaskStatus(product.url, 'success');
      matterProducts.push(detailProduct);

      return { url: product.url, product: detailProduct };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const status = signal.aborted ? 'stopped' : 'error';
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
   * 제품 상세 정보 병렬 크롤링 실행
   */
  private async executeParallelProductDetailCrawling(
    products: Product[],
    matterProducts: MatterProduct[],
    failedProducts: string[],
    failedProductErrors: Record<string, string[]>
  ): Promise<void> {
    let processedItems = 0;
    const totalItems = products.length;
    const startTime = Date.now();
    let lastProgressUpdate = 0; // 즉시 첫 업데이트하도록 0으로 설정
    const progressUpdateInterval = 500; // 더 빈번한 업데이트를 위해 500ms로 변경
  
    // 초기 진행 상황 설정
    this.state.updateProgress({
      currentItem: 0,
      totalItems: totalItems,
      stage: 'productDetail:fetching',
      message: `2단계: 제품 상세 정보 수집 중 (0/${totalItems})`
    });
  
    console.log(`[ProductDetailCollector] Starting detail collection for ${totalItems} products`);
  
    await promisePool(
      products,
      async (product, signal) => {
        const result = await this.processProductDetailCrawl(
          product, matterProducts, failedProducts, failedProductErrors, signal
        );
  
        processedItems++;
  
        // 더 빈번하게 진행 상황 업데이트
        const now = Date.now();
        if (now - lastProgressUpdate > progressUpdateInterval) {
          lastProgressUpdate = now;
  
          // 더 자세한 메시지 포함
          this.state.updateProgress({
            currentItem: processedItems,
            totalItems: totalItems,
            message: `2단계: 제품 상세 정보 수집 중 (${processedItems}/${totalItems})`
          });
  
          // 병렬 작업 상태도 업데이트
          const activeTasksCount = Math.min(DETAIL_CONCURRENCY, totalItems - processedItems + 1);
          this.state.updateParallelTasks(activeTasksCount, DETAIL_CONCURRENCY);
        }
  
        return result;
      },
      DETAIL_CONCURRENCY,
      this.abortController
    );
  
    // 최종 진행 상황 업데이트 - 항상 실행되도록 보장
    this.state.updateProgress({
      currentItem: processedItems,
      totalItems: totalItems,
      message: `2단계: 제품 상세 정보 수집 완료 (${processedItems}/${totalItems})`
    });
    this.state.updateParallelTasks(0, DETAIL_CONCURRENCY);
  }

  /**
   * 실패한 제품 상세 정보를 재시도하는 함수
   */
  private async retryFailedProductDetails(
    failedProducts: string[],
    allProducts: Product[],
    matterProducts: MatterProduct[],
    failedProductErrors: Record<string, string[]>
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

      await promisePool(
        retryProducts,
        async (product, signal) => {
          const result = await this.processProductDetailCrawl(
            product, matterProducts, failedProducts, failedProductErrors, signal, attempt
          );
          return result;
        },
        RETRY_CONCURRENCY,
        this.abortController
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
}