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

import type { DetailCrawlResult } from '../utils/types.js';
import type { Product, MatterProduct, CrawlerConfig } from '../../../../types.d.ts';
import { debugLog } from '../../util.js';
import { 
  crawlerEvents, 
  updateRetryStatus, 
  logRetryError
} from '../utils/progress.js';

// 진행 상황 콜백 타입 정의
export type DetailProgressCallback = (
  processedItems: number, 
  newItems: number, 
  updatedItems: number
) => void;

export class ProductDetailCollector {
  private state: CrawlerState;
  private abortController: AbortController;
  private readonly config: CrawlerConfig;
  private progressCallback: DetailProgressCallback | null = null;
  private processedItems: number = 0;
  private newItems: number = 0; // 새로 추가된 항목
  private updatedItems: number = 0; // 업데이트된 항목

  constructor(state: CrawlerState, abortController: AbortController, config: CrawlerConfig) {
    this.state = state;
    this.abortController = abortController;
    this.config = config;
    this.processedItems = 0;
    this.newItems = 0;
    this.updatedItems = 0;
  }

  /**
   * 진행 상황 콜백 설정 함수
   * @param callback 진행 상황을 업데이트할 콜백 함수
   */
  public setProgressCallback(callback: DetailProgressCallback): void {
    this.progressCallback = callback;
  }

  /**
   * 진행 상황 업데이트 함수
   * @param isNew 새로운 항목인지 여부
   */
  private updateProgress(isNew: boolean = true): void {
    this.processedItems++;
    
    if (isNew) {
      this.newItems++;
    } else {
      this.updatedItems++;
    }
    
    if (this.progressCallback) {
      this.progressCallback(this.processedItems, this.newItems, this.updatedItems);
    }
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

    const config = this.config;

    // 진행 상황 초기화
    this.processedItems = 0;
    this.newItems = 0;
    this.updatedItems = 0;

    this.state.setStage('productDetail:init', '2/2단계: 제품 상세 정보 수집 준비 중');

    // 진행 상태 업데이트
    this.state.updateProgress({
      totalItems: products.length,
      currentItem: 0,
      parallelTasks: config.detailConcurrency,
      activeParallelTasks: 0
    });

    const matterProducts: MatterProduct[] = [];
    const failedProducts: string[] = [];
    const failedProductErrors: Record<string, string[]> = {};

    // 제품 상세 정보 작업 상태 초기화
    initializeProductTaskStates(products);

    this.state.setStage('productDetail:fetching', '2/2단계: 제품 상세 정보 수집 중');
    debugLog(`Starting phase 2: crawling product details for ${products.length} products`);

    // 전체 크롤링 시작 메시지 이벤트
    crawlerEvents.emit('crawlingTaskStatus', {
      taskId: 'detail-start',
      status: 'running',
      message: JSON.stringify({
        stage: 2,
        type: 'start',
        totalProducts: products.length,
        startTime: new Date().toISOString()
      })
    });

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
      
      // 중단 상태 이벤트 발송
      crawlerEvents.emit('crawlingTaskStatus', {
        taskId: 'detail-abort',
        status: 'stopped',
        message: JSON.stringify({
          stage: 2,
          type: 'abort',
          processedItems: this.processedItems,
          totalItems: products.length,
          abortReason: 'user_request',
          endTime: new Date().toISOString()
        })
      });
      
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

    // 최종 완료 상태 이벤트 발송
    crawlerEvents.emit('crawlingTaskStatus', {
      taskId: 'detail-complete',
      status: 'success',
      message: JSON.stringify({
        stage: 2,
        type: 'complete',
        totalItems: products.length,
        processedItems: this.processedItems,
        successItems: successProducts,
        failedItems: finalFailedCount,
        newItems: this.newItems,
        updatedItems: this.updatedItems,
        successRate: parseFloat((successRate * 100).toFixed(1)),
        endTime: new Date().toISOString()
      })
    });

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
    const config = this.config;
    
    // 서버 과부하 방지를 위한 무작위 지연 시간 적용
    // Provide default values if config values are undefined
    const minDelay = config.minRequestDelayMs ?? 100; // Default min delay
    const maxDelay = config.maxRequestDelayMs ?? 2200; // Default max delay
    const delayTime = getRandomDelay(minDelay, maxDelay);
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

      // 신규 제품인지 여부 결정 (개선된 로직 필요 시 이 부분을 수정)
      // 현재는 예시로 일부 속성을 활용한 조건문 제공
      // const isNewProduct = true; // 기본값을 true로 설정 (기존 코드와 호환성 유지)
      
      // 기존 제품 속성을 MatterProduct 형식으로 확장
      const matterProduct: MatterProduct = {
        ...detailProduct
      };

      return matterProduct;
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
    const config = this.config;
    
    if (signal.aborted) {
      updateProductTaskStatus(product.url, 'stopped');
      return null;
    }

    crawlerEvents.emit('crawlingTaskStatus', {
      taskId: `product-${product.url}`,
      status: 'running',
      message: JSON.stringify({
        stage: 2,
        type: 'product',
        url: product.url,
        manufacturer: product.manufacturer || 'Unknown',
        model: product.model || 'Unknown',
        attempt: attempt,
        startTime: new Date().toISOString()
      })
    });

    updateProductTaskStatus(product.url, 'running');

    try {
      const detailProduct = await Promise.race([
        this.crawlProductDetail(product, signal),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), config.productDetailTimeoutMs)
        )
      ]);

      updateProductTaskStatus(product.url, 'success');
      
      crawlerEvents.emit('crawlingTaskStatus', {
        taskId: `product-${product.url}`,
        status: 'success',
        message: JSON.stringify({
          stage: 2,
          type: 'product',
          url: product.url,
          manufacturer: detailProduct.manufacturer || 'Unknown',
          model: detailProduct.model || 'Unknown',
          // isNew: detailProduct.isNewProduct, // Removed because isNewProduct does not exist on MatterProduct
          endTime: new Date().toISOString()
        })
      });
      
      this.updateProgress(true); // Assume new product, or adjust logic as needed

      matterProducts.push(detailProduct);

      return { url: product.url, product: detailProduct };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const status = signal.aborted ? 'stopped' : 'error';
      updateProductTaskStatus(product.url, status, errorMsg);

      crawlerEvents.emit('crawlingTaskStatus', {
        taskId: `product-${product.url}`,
        status: 'error',
        message: JSON.stringify({
          stage: 2,
          type: 'product',
          url: product.url,
          manufacturer: product.manufacturer || 'Unknown',
          model: product.model || 'Unknown',
          error: errorMsg,
          attempt: attempt,
          endTime: new Date().toISOString()
        })
      });

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
    const config = this.config;
    
    let processedItems = 0;
    const totalItems = products.length;
    const startTime = Date.now();
    let lastProgressUpdate = 0;
    const progressUpdateInterval = 3000;
  
    this.state.updateProgress({
      currentItem: 0,
      totalItems: totalItems,
      stage: 'productDetail:fetching',
      message: `2/2단계: 제품 상세 정보 수집 중 (0/${totalItems})`
    });
    
    crawlerEvents.emit('crawlingProgress', {
      status: 'running',
      currentPage: 0,
      totalPages: totalItems,
      processedItems: 0,
      totalItems: totalItems,
      percentage: 0,
      currentStep: '제품 상세 정보 수집',
      currentStage: 2,
      remainingTime: undefined,
      elapsedTime: 0,
      startTime: startTime,
      estimatedEndTime: 0,
      newItems: 0,
      updatedItems: 0,
      message: `2단계: 제품 상세정보 0/${totalItems} 처리 중 (0.0%)`
    });
  
    console.log(`[ProductDetailCollector] Starting detail collection for ${totalItems} products`);
  
    await promisePool(
      products,
      async (product, signal) => {
        const result = await this.processProductDetailCrawl(
          product, matterProducts, failedProducts, failedProductErrors, signal
        );
  
        processedItems++;
  
        const now = Date.now();
        if (now - lastProgressUpdate > progressUpdateInterval) {
          lastProgressUpdate = now;
          
          const percentage = (processedItems / totalItems) * 100;
          const elapsedTime = now - startTime;
          let remainingTime: number | undefined = undefined;
          
          if (processedItems > totalItems * 0.1) {
            const avgTimePerItem = elapsedTime / processedItems;
            remainingTime = Math.round((totalItems - processedItems) * avgTimePerItem);
          }
          
          const message = `2단계: 제품 상세정보 ${processedItems}/${totalItems} 처리 중 (${percentage.toFixed(1)}%)`;
  
          this.state.updateProgress({
            currentItem: processedItems,
            totalItems: totalItems,
            message: message,
            percentage: percentage
          });
  
          const detailConcurrency = config.detailConcurrency ?? 1; // Provide a default value
          const activeTasksCount = Math.min(detailConcurrency, totalItems - processedItems + 1);
          this.state.updateParallelTasks(activeTasksCount, detailConcurrency);
          
          if (this.progressCallback) {
            this.progressCallback(processedItems, this.newItems, this.updatedItems);
          }
          
          crawlerEvents.emit('crawlingProgress', {
            status: 'running',
            currentPage: processedItems,
            totalPages: totalItems,
            processedItems: processedItems,
            totalItems: totalItems,
            percentage: percentage,
            currentStep: '제품 상세 정보 수집',
            currentStage: 2,
            remainingTime: remainingTime,
            elapsedTime: elapsedTime,
            startTime: startTime,
            estimatedEndTime: remainingTime ? now + remainingTime : 0,
            newItems: this.newItems,
            updatedItems: this.updatedItems,
            message: message
          });
        }
  
        return result;
      },
      config.detailConcurrency ?? 1, // Provide a default value if undefined
      this.abortController
    );
  
    const finalElapsedTime = Date.now() - startTime;
    this.state.updateProgress({
      currentItem: processedItems,
      totalItems: totalItems,
      message: `2/2단계: 제품 상세 정보 수집 완료 (${processedItems}/${totalItems})`,
      percentage: 100
    });
    this.state.updateParallelTasks(0, config.detailConcurrency ?? 1);
    
    crawlerEvents.emit('crawlingProgress', {
      status: 'completed',
      currentPage: processedItems,
      totalPages: totalItems,
      processedItems: processedItems,
      totalItems: totalItems,
      percentage: 100,
      currentStep: '제품 상세 정보 수집',
      currentStage: 2,
      remainingTime: 0,
      elapsedTime: finalElapsedTime,
      startTime: startTime,
      estimatedEndTime: Date.now(),
      newItems: this.newItems,
      updatedItems: this.updatedItems,
      message: `2단계 완료: ${totalItems}개 제품 상세정보 수집 완료 (신규: ${this.newItems}, 업데이트: ${this.updatedItems})` 
    });
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
    const config = this.config;
    const { productDetailRetryCount } = config;
    const retryStart = config.retryStart ?? 1; // Default to 1 if undefined
    
    if (productDetailRetryCount <= 0) {
      debugLog(`[RETRY] 재시도 횟수가 0으로 설정되어 제품 상세 정보 재시도를 건너뜁니다.`);
      return;
    }
    
    const validFailedProducts = failedProducts.filter(url => !!url);
    if (validFailedProducts.length !== failedProducts.length) {
      debugLog(`[RETRY] 유효하지 않은 URL ${failedProducts.length - validFailedProducts.length}개를 필터링했습니다.`);
    }

    failedProducts.length = 0;
    failedProducts.push(...validFailedProducts);

    const maxRetry = retryStart + productDetailRetryCount - 1;
    
    updateRetryStatus('detail-retry', {
      stage: 'productDetail',
      currentAttempt: 1,
      maxAttempt: productDetailRetryCount,
      remainingItems: failedProducts.length,
      totalItems: failedProducts.length,
      startTime: Date.now(),
      itemIds: failedProducts
    });
    
    for (let attempt = retryStart; attempt <= maxRetry && failedProducts.length > 0; attempt++) {
      updateRetryStatus('detail-retry', {
        currentAttempt: attempt - retryStart + 1,
        remainingItems: failedProducts.length,
        itemIds: [...failedProducts]
      });
      
      crawlerEvents.emit('crawlingTaskStatus', {
        taskId: 'detail-retry',
        status: 'running',
        message: `제품 상세 정보 재시도 중 (${attempt - retryStart + 1}/${productDetailRetryCount}): ${failedProducts.length}개 항목`
      });
    
      const retryUrls = [...failedProducts];

      failedProducts.length = 0;

      const retryProducts = allProducts.filter(p => p.url && retryUrls.includes(p.url));

      debugLog(`[RETRY][${attempt}] 제품 상세 정보 재시도 중: ${retryProducts.length}개 제품 (${attempt - retryStart + 1}/${productDetailRetryCount})`);

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
          
          if (result) {
            if (result.error) {
              logRetryError(
                'productDetail', 
                product.url,
                result.error,
                attempt - retryStart + 1
              );
            } else {
              console.log(`[RETRY][${attempt - retryStart + 1}/${productDetailRetryCount}] 제품 ${product.url} 재시도 성공`);
            }
            
            updateRetryStatus('detail-retry', {
              remainingItems: failedProducts.length,
              itemIds: [...failedProducts]
            });
          }
          
          return result;
        },
        config.retryConcurrency ?? 1, // Provide a default value if undefined
        this.abortController
      );

      if (failedProducts.length === 0) {
        debugLog(`[RETRY] 모든 제품 상세 정보 재시도 성공`);
        
        crawlerEvents.emit('crawlingTaskStatus', {
          taskId: 'detail-retry',
          status: 'success',
          message: `제품 상세 정보 재시도 완료: 모든 항목 성공`
        });
        
        updateRetryStatus('detail-retry', {
          remainingItems: 0,
          itemIds: [],
          currentAttempt: attempt - retryStart + 1
        });
        
        break;
      }
    }

    const retrySuccessCount = validFailedProducts.length - failedProducts.length;
    if (retrySuccessCount > 0) {
      debugLog(`[RETRY] 재시도를 통해 ${retrySuccessCount}개의 추가 제품 정보를 성공적으로 수집했습니다.`);
    }

    if (failedProducts.length > 0) {
      debugLog(`[RETRY] ${productDetailRetryCount}회 재시도 후에도 실패한 제품 URL 수: ${failedProducts.length}`);
      
      crawlerEvents.emit('crawlingTaskStatus', {
        taskId: 'detail-retry',
        status: 'error',
        message: `제품 상세 정보 재시도 완료: ${failedProducts.length}개 항목 실패`
      });
      
      updateRetryStatus('detail-retry', {
        remainingItems: failedProducts.length,
        itemIds: [...failedProducts]
      });
      
      failedProducts.forEach(url => {
        const errors = failedProductErrors[url] || ['Unknown error'];
        console.error(`[RETRY] 제품 ${url} 재시도 최종 실패: ${errors.join('; ')}`);
      });
    } else {
      crawlerEvents.emit('crawlingTaskStatus', {
        taskId: 'detail-retry',
        status: 'success',
        message: `제품 상세 정보 재시도 완료: 모든 항목 성공`
      });
    }
  }
}