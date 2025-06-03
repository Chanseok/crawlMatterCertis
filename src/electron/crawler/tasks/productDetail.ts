/**
 * productDetail.ts
 * 제품 상세 정보 수집을 담당하는 클래스
 * 
 * 2025-05-24 수정 1차: UI와 터미널 로그 간의 카운트 불일치 문제 수정
 * - 문제: 터미널에서는 60/60 제품이 수집되었다고 표시되나 UI에서는 58/60으로 표시되는 문제
 * - 원인: this.updateProgress() 메서드와 processProductDetailCrawl() 메서드에서 
 *        동일한 제품에 대해 recordDetailItemProcessed()가 두 번 호출되어 중복 카운팅됨
 * - 해결: updateProgress() 메서드에서 recordDetailItemProcessed() 호출 제거
 *        processProductDetailCrawl() 에서만 정확한 isNewItem 값으로 한 번만 호출하도록 수정
 *
 * 2025-05-24 수정 2차: 연속 크롤링 시 카운터 누적 문제 수정
 * - 문제: 연속으로 크롤링을 실행했을 때 이전 세션의 카운터가 누적되어 UI에 62/60과 같이 표시되는 문제
 * - 원인: 새로운 크롤링 세션 시작 시 CrawlerState가 완전히 초기화되지 않음
 * - 해결: CrawlerEngine.startCrawling()에서 this.state.reset() 호출하여 모든 카운터 초기화
 *        비정상적인 카운터 값 감지 시 경고 로그 출력 및 비상 초기화 로직 추가
 */

import { type Page } from 'playwright-chromium';
import { getRandomDelay, delay } from '../utils/delay.js';
import { CrawlerState } from '../core/CrawlerState.js';
import {
  promisePool, updateProductTaskStatus, initializeProductTaskStates
} from '../utils/concurrency.js';
import { MatterProductParser } from '../parsers/MatterProductParser.js';
import { BrowserManager } from '../browser/BrowserManager.js';
import { retryWithBackoff } from '../utils/retry.js';
import axios from 'axios';
import * as cheerio from 'cheerio';

import type { DetailCrawlResult } from '../utils/types.js';
import type { Product, MatterProduct, CrawlerConfig } from '../../../../types.d.ts';
import { logger } from '../../../shared/utils/Logger.js';
import { 
  crawlerEvents, 
  updateRetryStatus, 
  logRetryError
} from '../utils/progress.js';

export class ProductDetailCollector {
  private state: CrawlerState;
  private abortController: AbortController;
  private readonly config: CrawlerConfig;
  private browserManager: BrowserManager;
  private currentBatch?: number;
  private totalBatches?: number;

  constructor(
    state: CrawlerState,
    abortController: AbortController,
    config: CrawlerConfig,
    browserManager: BrowserManager,
    currentBatch?: number,
    totalBatches?: number
  ) {
    this.state = state;
    this.abortController = abortController;
    this.config = config;
    this.browserManager = browserManager;
    this.currentBatch = currentBatch;
    this.totalBatches = totalBatches;
  }
  
  /**
   * 설정 정보를 갱신합니다.
   * @param newConfig 새 설정 객체
   */
  refreshConfig(newConfig: CrawlerConfig): void {
    // config는 readonly이므로 Object.assign으로 속성들을 복사
    Object.assign(this.config, newConfig);
  }

  /**
   * 크롤링에 필요한 향상된 HTTP 헤더를 생성합니다.
   * @returns 크롤링에 사용할 HTTP 헤더
   */
  private getEnhancedHeaders(): Record<string, string> {
    const userAgent = this.config.userAgent ?? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';
    
    return {
      'User-Agent': userAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Referer': 'https://csa-iot.org/',
      'Connection': 'keep-alive',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Sec-Ch-Ua': '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'same-origin',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1'
    };
  }


  /**
   * 제품 상세 정보를 크롤링하는 함수
   */
  private async crawlProductDetail(product: Product, signal: AbortSignal): Promise<MatterProduct> {
    const config = this.config;
    
    const minDelay = config.minRequestDelayMs ?? 100;
    const maxDelay = config.maxRequestDelayMs ?? 2200;
    const delayTime = getRandomDelay(minDelay, maxDelay);
    await delay(delayTime);
    
    // config에서 정의된 크롤러 타입 가져오기 (기본값은 axios)
    const crawlerType = config.crawlerType || 'axios';
    
    // 하이브리드 전략 사용 플래그
    const useHybridStrategy = config.useHybridStrategy ?? false;
    
    // config에 정의된 크롤러 타입에 따라 적절한 전략 사용
    if (crawlerType === 'playwright') {
      try {
        const result = await this.crawlWithPlaywright(product, signal);
        return result;
      } catch (error) {
        const playwrightError = error instanceof Error ? error : new Error(String(error));
        
        // 하이브리드 전략이 활성화되어 있고 신호가 중단되지 않은 경우에만 Axios로 시도
        if (useHybridStrategy && !signal.aborted) {
          logger.debug(`Falling back to Axios/Cheerio strategy for ${product.url}`, 'ProductDetailCollector');
          try {
            const result = await this.crawlWithAxios(product, signal);
            return result;
          } catch (axiosError) {
            logger.debug(`Axios/Cheerio fallback also failed for ${product.url}`, 'ProductDetailCollector');
            throw axiosError instanceof Error ? axiosError : new Error(String(axiosError)); // 두 전략 모두 실패한 경우 마지막 오류를 전달
          }
        } else {
          throw playwrightError; // 하이브리드 전략이 비활성화된 경우 원래 오류를 전달
        }
      }
    } else {
      // axios/cheerio 전략 사용
      try {
        const result = await this.crawlWithAxios(product, signal);
        return result;
      } catch (error) {
        throw error instanceof Error ? error : new Error(String(error));
      }
    }
  }
  
  /**
   * Playwright를 사용하여 제품 상세 정보를 크롤링
   */
  private async crawlWithPlaywright(product: Product, signal: AbortSignal): Promise<MatterProduct> {
    const config = this.config;
    let page: Page | null = null;

    try {
      page = await this.browserManager.getPage();

      if (signal.aborted) {
        throw new Error('Aborted before page operations');
      }
      
      // 불필요한 리소스 차단
      await page.route('**/*.{png,jpg,jpeg,gif,svg,css,woff,woff2}', route => route.abort());
      
      // 페이지 로드 타임아웃 설정
      const timeout = config.productDetailTimeoutMs ?? 60000;
      await page.goto(product.url, { 
        waitUntil: 'domcontentloaded', 
        timeout: timeout
      });

      if (signal.aborted) {
        throw new Error('Aborted after page.goto');
      }

      const extractedDetails = await page.evaluate(
        MatterProductParser.extractProductDetails,
        product
      );

      const matterProduct: MatterProduct = {
        ...product,
        id: `csa-matter-${String(product.pageId).padStart(5, '0')}-${String(product.indexInPage).padStart(2, '0')}`,
        ...extractedDetails,
      };

      return matterProduct;

    } catch (error: unknown) {
      if (signal.aborted) {
        throw new Error(`Aborted crawling for ${product.url} during operation.`);
      }
      logger.debug(`Playwright error: ${config.productDetailTimeoutMs} ms timeout for ${product.model}`, 'ProductDetailCollector');
      // console.error(`[ProductDetailCollector] Error crawling product detail with Playwright for ${product.url}:`, error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to crawl product detail with Playwright for ${product.url}: ${errorMessage}`);
    } finally {
      if (page) {
        await this.browserManager.closePage(page);
      }
    }
  }
  
  /**
   * Axios와 Cheerio를 사용하여 제품 상세 정보를 크롤링 (Playwright 대체 전략)
   */
  private async crawlWithAxios(product: Product, signal: AbortSignal): Promise<MatterProduct> {
    const config = this.config;
    
    if (signal.aborted) {
      throw new Error('Aborted before Axios operation');
    }
    
    try {
      // Axios 타임아웃 설정 (Playwright보다 짧게 설정하여 빠른 실패를 유도)
      const axiosTimeout = config.axiosTimeoutMs ?? 45000; // 개선: 30초에서 45초로 증가
      
      // 향상된 HTTP 헤더 사용
      const headers = this.getEnhancedHeaders();
      
      // extractProductDetailsWithAxios 함수 수정하여 향상된 헤더 전달
      const extractedDetails = await this.extractProductDetailsWithAxios(product, headers, axiosTimeout);
      
      const matterProduct: MatterProduct = {
        ...product,
        id: `csa-matter-${String(product.pageId).padStart(5, '0')}-${String(product.indexInPage).padStart(2, '0')}`,
        ...extractedDetails,
      };
      
      return matterProduct;
    } catch (error: unknown) {
      if (signal.aborted) {
        throw new Error(`Aborted Axios crawling for ${product.url} during operation.`);
      }
      // console.error(`[ProductDetailCollector] Error crawling product detail with Axios for ${product.url}:`, error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to crawl product detail with Axios for ${product.url}: ${errorMessage}`);
    }
  }

  /**
   * Axios와 Cheerio를 사용하여 제품 상세 페이지의 정보를 추출합니다.
   * 
   * @param product 기본 제품 정보
   * @param headers HTTP 헤더
   * @param timeoutMs 요청 타임아웃 (밀리초)
   * @returns 추출된 제품 세부 정보
   */
  private async extractProductDetailsWithAxios(
    product: Product,
    headers: Record<string, string>,
    timeoutMs: number = 45000 // 개선: 30초에서 45초로 증가
  ): Promise<Partial<any>> {
    try {
      const response = await axios.get(product.url, {
        headers: headers,
        timeout: timeoutMs,
        maxRedirects: 5
      });

      const html = response.data;
      const $ = cheerio.load(html);

      // 제품 세부 정보를 저장할 객체
      const extractedFields: Record<string, any> = {
        manufacturer: product.manufacturer,
        model: product.model,
        certificateId: product.certificateId,
        deviceType: 'Matter Device',
        applicationCategories: [],
      };

      // 제품 제목 추출
      const productTitle = $('h1.entry-title').text().trim() || 
                         $('h1').text().trim() || 
                         'Unknown Product';
      
      extractedFields.model = extractedFields.model || productTitle;

      // 제품 정보 테이블에서 세부 정보 추출
      const infoTable = $('.product-certificates-table');
      
      infoTable.find('tr').each((_, row: any) => {
        const cells = $(row).find('td');
        if (cells.length >= 2) {
          const key = $(cells[0]).text().trim().toLowerCase();
          const value = $(cells[1]).text().trim();
          
          if (key && value) {
            // 키를 필드 이름으로 변환
            this.mapKeyToField(key, value, extractedFields);
          }
        }
      });

      // span.label, span.value 구조에서 세부 정보 추출
      $('.entry-product-details div ul li').each((_, item) => {
        const label = $(item).find('span.label');
        const value = $(item).find('span.value');
        
        if (label.length > 0 && value.length > 0) {
          const labelText = label.text().trim().toLowerCase();
          const valueText = value.text().trim();
          
          if (labelText && valueText) {
            this.mapKeyToField(labelText, valueText, extractedFields);
          }
        }
      });

      // 제조사 정보 보강 (fallback mechanism)
      this.enhanceManufacturerInfo($, extractedFields, productTitle);
      
      // 기기 유형 추출 보강
      this.enhanceDeviceTypeInfo($, extractedFields, productTitle);
      
      // 인증 정보 보강
      this.enhanceCertificationInfo($, extractedFields);
      
      // 버전 정보 보강
      this.enhanceVersionInfo($, extractedFields);
      
      // 하드웨어 ID 정보 보강
      this.enhanceHardwareIds($, extractedFields);
      
      // Primary Device Type ID 정보 보강 및 표준화
      this.enhancePrimaryDeviceTypeIds($, extractedFields);
      
      // 애플리케이션 카테고리 추출
      this.extractCategories($, extractedFields);
      
      // 텍스트 블록, 표 형식, 목록 항목에서 데이터 추출
      this.extractFromTextBlocks($, extractedFields);
      this.extractFromTable($, extractedFields);
      this.extractFromListItems($, extractedFields);
      
      return extractedFields;
    } catch (error) {
      // console.error(`[AxiosExtractor] Failed to extract data for ${product.url}:`, error);
      throw error;
    }
  }

  /**
   * VID/PID 값을 정수로 변환
   */
  private normalizeHexId(value: string | number | undefined): number | undefined {
    // 값이 숫자면 그대로 반환
    if (typeof value === 'number') {
      return value;
    }
    
    // 값이 없거나 무의미한 값이면 undefined 반환
    if (!value || (typeof value === 'string' && ['', 'n/a', '-', 'none', 'unknown'].includes(value.toLowerCase().trim()))) {
      return undefined;
    }
    
    const trimmedValue = String(value).trim();
    
    try {
      // 16진수 형식 확인 (0x 접두사 있음)
      if (/^0x[0-9A-Fa-f]+$/i.test(trimmedValue)) {
        // 16진수 문자열을 정수로 변환 (0x 제거하고 16진수로 파싱)
        return parseInt(trimmedValue, 16);
      } 
      // 16진수 형식 확인 (접두사 없음)
      else if (/^[0-9A-Fa-f]+$/i.test(trimmedValue)) {
        return parseInt(trimmedValue, 16);
      } 
      // 10진수 숫자
      else if (/^\d+$/.test(trimmedValue)) {
        return parseInt(trimmedValue, 10);
      } 
      // 지원되지 않는 형식
      else {
        return undefined;
      }
    } catch (e) {
      console.error(`16진수 변환 실패: ${value}`, e);
      return undefined;
    }
  }

  /**
   * primaryDeviceTypeId 값들을 정수 배열의 JSON 문자열로 변환
   * 
   * @param value 콤마로 구분된 primaryDeviceTypeId 값
   * @returns 정수 배열이 담긴 JSON 문자열
   */
  private normalizePrimaryDeviceTypeIds(value: string | number | undefined): string | undefined {
    if (!value) return '[]';
    
    // 숫자일 경우 바로 JSON 배열로 변환하여 반환
    if (typeof value === 'number') {
      return JSON.stringify([value]);
    }
    
    // 쉼표로 구분된 각 ID 처리
    const idList = String(value).split(',').map(id => id.trim()).filter(Boolean);
    
    // 각 ID를 정수로 변환
    const normalizedIds = idList.map(id => this.normalizeHexId(id)).filter(id => id !== undefined);
    
    // JSON 배열 문자열로 반환
    return JSON.stringify(normalizedIds);
  }

  /**
   * 키 이름을 필드 이름으로 매핑
   * 정규식 패턴 매칭을 사용하여 유연한 키 매핑 구현
   */
  private mapKeyToField(key: string, value: string | number, fields: Record<string, any>): void {
    const normalizedKey = key.toLowerCase().trim();
    
    // 매핑 로직을 함수로 분리
    const mapToField = (pattern: RegExp, fieldName: string): boolean => {
      if (pattern.test(normalizedKey)) {
        // 숫자인 경우 바로 처리
        if (typeof value === 'number') {
          // VID/PID에 대해 표준화된 16진수 형식 적용
          if (fieldName === 'vid' || fieldName === 'pid') {
            fields[fieldName] = value;
          } else {
            fields[fieldName] = value;
          }
          return true;
        }
        
        // 문자열인 경우 기존 로직대로 처리
        if (value && typeof value === 'string' && !['n/a', '-', 'none', 'unknown'].includes(value.toLowerCase().trim())) {
          // VID/PID에 대해 표준화된 16진수 형식 적용
          if (fieldName === 'vid' || fieldName === 'pid') {
            fields[fieldName] = this.normalizeHexId(value);
          } else {
            fields[fieldName] = value;
          }
          return true;
        }
      }
      return false;
    };
    
    // 키워드 기반 매핑 로직 - 확장된 정규식 패턴
    if (false
      || mapToField(/^manufacturer$|^company$|^brand$|^maker$|manufacturer|company|brand|maker/i, 'manufacturer')
      || mapToField(/^model$|^product\s*name$|model\s*name|product\s*model|device\s*model/i, 'model')
      || mapToField(/certificate\s*id|cert\s*id|certification\s*number|cert\s*number|certification\s*id/i, 'certificateId')
      || mapToField(/certification\s*date|cert\s*date|certified\s*on|date\s*of\s*certification|approval\s*date/i, 'certificationDate')
      || mapToField(/software\s*version|sw\s*version|application\s*version|app\s*version/i, 'softwareVersion')
      || mapToField(/hardware\s*version|hw\s*version|device\s*revision|hardware\s*revision|hw\s*rev/i, 'hardwareVersion')
      || mapToField(/^vid$|vendor\s*id|manufacturer\s*id|vendor\s*identifier/i, 'vid')
      || mapToField(/^pid$|product\s*id|device\s*id|product\s*identifier/i, 'pid')
      || mapToField(/family\s*sku|product\s*family\s*sku|sku\s*family/i, 'familySku')
      || mapToField(/family\s*variant\s*sku|variant\s*sku|model\s*variant\s*sku/i, 'familyVariantSku')
      || mapToField(/firmware\s*version|fw\s*version|firmware\s*rev|firmware\s*revision/i, 'firmwareVersion')
      || mapToField(/family\s*id|product\s*family\s*id|family\s*identifier/i, 'familyId')
      || mapToField(/tis\/trp\s*tested|tis\s*trp|tis\s*test|trp\s*test/i, 'tisTrpTested')
      || mapToField(/specification\s*version|spec\s*version|protocol\s*version|standard\s*version/i, 'specificationVersion')
      || mapToField(/transport\s*interface|communication\s*interface|connectivity|interfaces/i, 'transportInterface')
      || mapToField(/primary\s*device\s*type\s*id|main\s*device\s*type\s*id/i, 'primaryDeviceTypeId')
      || mapToField(/device\s*type|product\s*type|product\s*category|device\s*category|product\s*class/i, 'deviceType')
    ) {
      // 매핑 성공
    } else {
      // 매핑 실패시 원본 키를 정규화하여 사용
      const mappedField = normalizedKey.replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
      
      // 숫자인 경우 바로 처리
      if (typeof value === 'number') {
        fields[mappedField] = value;
      }
      // 문자열인 경우 기존 로직대로 처리
      // 매핑되지 않은 필드는 원본 키 이름을 정규화하여 사용하되,
      // 빈 값이나 의미 없는 값은 무시
      else if (value && typeof value === 'string' && !['n/a', '-', 'none', 'unknown'].includes(value.toLowerCase().trim())) {
        fields[mappedField] = value;
      }
    }
  }

  /**
   * 애플리케이션 카테고리 추출
   * 4단계 전략적 접근으로 애플리케이션 카테고리 추출 강화
   */
  private extractCategories($: cheerio.CheerioAPI, fields: Record<string, any>): void {
    const categories: string[] = [];
    let foundCategories = false;
    
    // 1. 명시적인 카테고리 헤더와 목록 찾기
    $('h1, h2, h3, h4, h5, h6, .section-title, .content-title, .entry-title, .product-title')
      .each((_, header) => {
        const headerText = $(header).text().trim();
        if (headerText.toLowerCase().includes('application categories') || 
            headerText.toLowerCase().includes('device categories') ||
            headerText.toLowerCase().includes('product categories')) {
          
          // 카테고리 헤더를 찾았으니, 다음 요소들을 검사
          const parent = $(header).parent();
          
          // 여러 형태의 목록 찾기 (직계 자식 또는 손자 요소)
          const lists = parent.find('ul, ol').first();
          if (lists.length > 0) {
            lists.find('li').each((_, li) => {
              const category = $(li).text().trim();
              if (category && !categories.includes(category)) {
                categories.push(category);
                foundCategories = true;
              }
            });
          }
          
          // 구분된 목록 또는 콤마로 구분된 텍스트 블록
          if (!foundCategories) {
            const nextParagraph = $(header).next('p, div');
            if (nextParagraph.length > 0) {
              const text = nextParagraph.text().trim();
              // 콤마로 구분된 목록 처리
              if (text.includes(',')) {
                const items = text.split(',').map(item => item.trim());
                for (const item of items) {
                  if (item && !categories.includes(item)) {
                    categories.push(item);
                    foundCategories = true;
                  }
                }
              } else if (text) {
                // 단일 항목 처리
                categories.push(text);
                foundCategories = true;
              }
            }
          }
          
          // 특별한 구분 기호가 있는 텍스트 처리 (예: 줄바꿈)
          if (!foundCategories) {
            const siblingTexts = parent.text().split(/[\n\r;|]+/);
            for (const text of siblingTexts) {
              const trimmed = text.trim();
              if (trimmed && !trimmed.toLowerCase().includes('application categories') && 
                  !categories.includes(trimmed)) {
                categories.push(trimmed);
                foundCategories = true;
              }
            }
          }
        }
      });
    
    // 2. 명시적인 CSS 클래스로 카테고리 찾기
    if (!foundCategories) {
      $('.categories, .application-categories, .category-list, .category-items, .product-categories')
        .find('li, .category-item, .category, .tag')
        .each((_, elem) => {
          const category = $(elem).text().trim();
          if (category && !categories.includes(category)) {
            categories.push(category);
            foundCategories = true;
          }
        });
    }
    
    // 3. 카테고리 링크 또는 태그 찾기
    if (!foundCategories) {
      $('.category-link, a[href*="category"], .tag, .product-tag, a[rel="tag"]')
        .each((_, elem) => {
          const category = $(elem).text().trim();
          if (category && !categories.includes(category) && 
              !category.toLowerCase().includes('categor')) { // 'categories' 같은 단어는 제외
            categories.push(category);
            foundCategories = true;
          }
        });
    }
    
    // 4. 제품 설명에서 카테고리 키워드 찾기
    if (!foundCategories) {
      const deviceTypeKeywords = [
        'Smart Light', 'Light Bulb', 'Smart Switch', 'Door Lock', 'Thermostat',
        'Motion Sensor', 'Smart Plug', 'Hub', 'Gateway', 'Camera',
        'Smoke Detector', 'Outlet', 'Light', 'Door', 'Window',
        'Sensor', 'Speaker', 'Display', 'Controller', 'Remote Control',
        'HVAC', 'Air Conditioner', 'Heater', 'Fan', 'Air Purifier',
        'Security System', 'Alarm', 'Water Leak Detector', 'Temperature Sensor',
        'Humidity Sensor', 'Energy Monitor', 'Power Meter'
      ];
      
      // 제품 이름이나 설명에서 카테고리 추출
      const productText = $('body').text().toLowerCase();
      
      for (const keyword of deviceTypeKeywords) {
        if (productText.includes(keyword.toLowerCase())) {
          if (!categories.includes(keyword)) {
            categories.push(keyword);
            foundCategories = true;
          }
          break; // 첫 번째 일치하는 항목 사용
        }
      }
    }
    
    // 5. 디바이스 타입을 카테고리로 사용 (최종 대안)
    if (categories.length === 0 && fields.deviceType && fields.deviceType !== 'Matter Device') {
      categories.push(fields.deviceType);
    } else if (categories.length === 0) {
      categories.push('Matter Device');
    }
    
    // 결과를 필드에 설정
    fields.applicationCategories = categories;
  }

  /**
   * 제조사 정보 보강
   */
  private enhanceManufacturerInfo($: cheerio.CheerioAPI, fields: Record<string, any>, productTitle: string): void {
    if (fields.manufacturer && fields.manufacturer !== 'Unknown') {
      return; // 이미 제조사 정보가 있으면 건너뜀
    }
    
    const knownManufacturers = ['Govee', 'Philips', 'Samsung', 'Apple', 'Google', 'Amazon', 'Aqara', 'LG', 'IKEA', 'Belkin', 'Eve', 'Nanoleaf', 'GE', 'Cync', 'Tapo', 'TP-Link', 'Signify', 'Haier', 'WiZ'];
    
    // 제품 제목에서 제조사 찾기
    for (const brand of knownManufacturers) {
      if (productTitle.toLowerCase().includes(brand.toLowerCase())) {
        fields.manufacturer = brand;
        return;
      }
    }
    
    // 회사 정보에서 제조사 찾기
    const companyInfo = $('.company-info').text().trim() || $('.manufacturer').text().trim();
    if (companyInfo) {
      fields.manufacturer = companyInfo;
      return;
    }
    
    // 제품 상세 내용에서 제조사 텍스트 찾기
    $('div.entry-product-details > div > ul li').each((_, elem) => {
      const text = $(elem).text().trim().toLowerCase();
      if (text.includes('manufacturer') || text.includes('company')) {
        const parts = text.split(':');
        if (parts.length > 1) {
          fields.manufacturer = parts[1].trim();
          return false; // 루프 중단
        }
      }
    });
  }

  /**
   * 기기 유형 정보 보강
   */
  private enhanceDeviceTypeInfo($: cheerio.CheerioAPI, fields: Record<string, any>, productTitle: string): void {
    if (fields.deviceType && fields.deviceType !== 'Matter Device') {
      return; // 이미 기기 유형 정보가 있으면 건너뜀
    }
    
    const deviceTypes = [
      'Light Bulb', 'Smart Switch', 'Door Lock', 'Thermostat',
      'Motion Sensor', 'Smart Plug', 'Hub', 'Gateway', 'Camera',
      'Smoke Detector', 'Outlet', 'Light', 'Door', 'Window',
      'Sensor', 'Speaker', 'Display'
    ];
    
    const bodyText = $('body').text().toLowerCase();
    const lowerProductTitle = productTitle.toLowerCase();
    
    for (const type of deviceTypes) {
      if (bodyText.includes(type.toLowerCase()) || lowerProductTitle.includes(type.toLowerCase())) {
        fields.deviceType = type;
        return;
      }
    }
  }

  /**
   * 인증 정보 보강
   */
  private enhanceCertificationInfo($: cheerio.CheerioAPI, fields: Record<string, any>): void {
    // 인증 ID 보강
    if (!fields.certificateId && !fields.certificationId) {
      $('div.entry-product-details > div > ul li').each((_, elem) => {
        const text = $(elem).text().trim();
        if (text.toLowerCase().includes('certification') || 
            text.toLowerCase().includes('certificate') ||
            text.toLowerCase().includes('cert id')) {
          
          const match = text.match(/([A-Za-z0-9-]+\d+[-][A-Za-z0-9]+)/);
          if (match) {
            fields.certificateId = match[1];
            fields.certificationId = match[1];
            return false; // 루프 중단
          }
          
          const parts = text.split(':');
          if (parts.length > 1 && parts[1].trim()) {
            fields.certificateId = parts[1].trim();
            fields.certificationId = parts[1].trim();
            return false; // 루프 중단
          }
        }
      });
    }
    
    // 인증 날짜 보강
    if (!fields.certificationDate) {
      $('div.entry-product-details > div > ul li').each((_, elem) => {
        const text = $(elem).text().trim();
        if (text.toLowerCase().includes('date')) {
          const dateMatch = text.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})|(\d{4}-\d{1,2}-\d{1,2})|([A-Za-z]+\s+\d{1,2},?\s+\d{4})/);
          if (dateMatch) {
            fields.certificationDate = dateMatch[0];
            return false; // 루프 중단
          }
          
          const parts = text.split(':');
          if (parts.length > 1 && parts[1].trim()) {
            fields.certificationDate = parts[1].trim();
            return false; // 루프 중단
          }
        }
      });
      
      // 날짜가 없으면 오늘 날짜를 기본값으로 사용
      if (!fields.certificationDate) {
        fields.certificationDate = new Date().toISOString().split('T')[0];
      }
    }
  }

  /**
   * 버전 정보 보강
   * 패턴 매칭 강화 및 다중 콜론 처리
   */
  private enhanceVersionInfo($: cheerio.CheerioAPI, fields: Record<string, any>): void {
    // 소프트웨어/펌웨어 버전 보강
    if (!fields.softwareVersion && !fields.firmwareVersion) {
      $('div.entry-product-details > div > ul li, .product-details li, .content li, p').each((_, elem) => {
        const text = $(elem).text().trim();
        
        if (text.toLowerCase().includes('software') || text.toLowerCase().includes('firmware') || 
            text.toLowerCase().includes('fw version') || text.toLowerCase().includes('sw version')) {
          
          // 향상된 버전 패턴 매칭 (v1.2.3, 1.2.3, Ver. 1.2.3, Version 1.2.3 등)
          const versionPatterns = [
            /(?:v|ver|version|vr)\s*\.?\s*(\d+(?:\.\d+)+)/i,  // v1.2.3, ver 1.2.3
            /(\d+\.\d+(?:\.\d+)*)/,                           // 1.2.3
            /(\d+\-\d+(?:\-\d+)*)/                           // 1-2-3
          ];
          
          let version = '';
          
          // 여러 패턴 시도
          for (const pattern of versionPatterns) {
            const match = text.match(pattern);
            if (match) {
              version = match[0];
              break;
            }
          }
          
          // 패턴 매칭 실패 시 콜론 기반 분리 시도
          if (!version) {
            const parts = text.split(':');
            if (parts.length > 1) {
              // 여러 콜론 처리: 첫 번째 콜론 이후의 모든 내용을 버전으로 간주
              version = parts.slice(1).join(':').trim();
            }
          }
          
          if (version) {
            // 불필요한 앞/뒤 문자 제거 (괄호 등)
            version = version.replace(/^\s*[\(\[\{]/, '').replace(/[\)\]\}]\s*$/, '');
            
            if (text.toLowerCase().includes('software')) {
              fields.softwareVersion = version;
              // 펌웨어 버전이 없고 소프트웨어 버전이 발견되면 동일하게 설정
              fields.firmwareVersion = fields.firmwareVersion || version;
            } else {
              fields.firmwareVersion = version;
              // 소프트웨어 버전이 없고 펌웨어 버전이 발견되면 동일하게 설정
              fields.softwareVersion = fields.softwareVersion || version;
            }
            return false; // 루프 중단
          }
        }
      });
      
      // 제품 설명에서 버전 정보 찾기
      if (!fields.softwareVersion && !fields.firmwareVersion) {
        $('.product-description, .entry-content p, .description').each((_, elem) => {
          const text = $(elem).text().trim();
          const versionMatch = text.match(/(?:firmware|software)\s+version[:\s]+v?(\d+(?:\.\d+)+)/i);
          
          if (versionMatch) {
            const versionPart = versionMatch[0].match(/v?(\d+(?:\.\d+)+)/i);
            if (versionPart && versionPart[0]) {
              const version = versionPart[0];
              fields.softwareVersion = version;
              fields.firmwareVersion = fields.firmwareVersion || version;
              return false; // 루프 중단
            }
          }
        });
      }
    }
    
    // 하드웨어 버전 보강
    if (!fields.hardwareVersion) {
      $('div.entry-product-details > div > ul li, .product-details li, .content li, p').each((_, elem) => {
        const text = $(elem).text().trim();
        
        if (text.toLowerCase().includes('hardware')) {
          // 향상된 버전 패턴 매칭
          const versionPatterns = [
            /(?:v|ver|version|vr)\s*\.?\s*(\d+(?:\.\d+)+)/i,
            /(\d+\.\d+(?:\.\d+)*)/,
            /(\d+\-\d+(?:\-\d+)*)/
          ];
          
          let version = '';
          
          // 여러 패턴 시도
          for (const pattern of versionPatterns) {
            const match = text.match(pattern);
            if (match) {
              version = match[0];
              break;
            }
          }
          
          // 패턴 매칭 실패 시 콜론 기반 분리 시도
          if (!version) {
            const parts = text.split(':');
            if (parts.length > 1) {
              version = parts.slice(1).join(':').trim();
            }
          }
          
          if (version) {
            // 불필요한 앞/뒤 문자 제거
            version = version.replace(/^\s*[\(\[\{]/, '').replace(/[\)\]\}]\s*$/, '');
            fields.hardwareVersion = version;
            return false; // 루프 중단
          }
        }
      });
      
      // 제품 설명에서 하드웨어 버전 찾기
      if (!fields.hardwareVersion) {
        $('.product-description, .entry-content p, .description').each((_, elem) => {
          const text = $(elem).text().trim();
          const versionMatch = text.match(/hardware\s+version[:\s]+v?(\d+(?:\.\d+)+)/i);
          
          if (versionMatch) {
            const versionPart = versionMatch[0].match(/v?(\d+(?:\.\d+)+)/i);
            if (versionPart && versionPart[0]) {
              const version = versionPart[0];
              fields.hardwareVersion = version;
              return false; // 루프 중단
            }
          }
        });
      }
    }
  }

  /**
   * 하드웨어 ID 정보 보강
   * 16진수 ID 패턴 매칭 강화로 VID/PID 추출 성능 향상
   */
  private enhanceHardwareIds($: cheerio.CheerioAPI, fields: Record<string, any>): void {
    // VID 정보 보강
    if (!fields.vid) {
      // 다양한 요소에서 VID 검색
      $('div.entry-product-details > div > ul li, .product-details li, p, .entry-content div').each((_, elem) => {
        const text = $(elem).text().trim();
        
        // 여러 형태의 VID 표현 식별
        if (text.toLowerCase().includes('vendor id') || 
            text.toLowerCase().includes('vid') || 
            text.toLowerCase().includes('manufacturer id')) {
          
          // 향상된 16진수 ID 패턴 매칭 - 다양한 형식 지원
          const hexPatterns = [
            /(0x[0-9A-Fa-f]{1,6})/i,             // 0x로 시작하는 16진수
            /([a-fA-F0-9]{1,6})(?:\s|$)/,        // 1-6자리 16진수
            /(\b\d{1,6}\b)/,                      // 1-6자리 숫자
            /id:\s*([a-fA-F0-9]{1,6})/i          // id: 뒤에 오는 16진수
          ];
          
          let vidValue = '';
          
          // 여러 패턴 시도
          for (const pattern of hexPatterns) {
            const match = text.match(pattern);
            if (match && match[1]) {
              vidValue = match[1];
              break;
            }
          }
          
          // 패턴 매칭 실패 시 콜론 기반 분리 시도
          if (!vidValue) {
            const parts = text.split(':');
            if (parts.length > 1) {
              // 값이 숫자나 16진수 형태인지 확인
              const potential = parts.slice(1).join(':').trim();
              const numericMatch = potential.match(/(\b\d{1,6}\b)|([a-fA-F0-9]{1,6})/);
              if (numericMatch) {
                vidValue = numericMatch[0];
              } else {
                vidValue = potential;
              }
            }
          }
          
          if (vidValue) {
            fields.vid = this.normalizeHexId(vidValue);
            return false; // 루프 중단
          }
        }
      });
      
      // 추가 검색: 페이지 전체 텍스트에서 VID 패턴 찾기
      if (!fields.vid) {
        const bodyText = $('body').text();
        const vidRegex = /vendor\s*id\s*[=:]\s*(0x[0-9A-Fa-f]{1,6}|[0-9A-Fa-f]{1,6})/i;
        const vidMatch = bodyText.match(vidRegex);
        
        if (vidMatch && vidMatch[1]) {
          fields.vid = this.normalizeHexId(vidMatch[1]);
        }
      }
    } else {
      fields.vid = this.normalizeHexId(fields.vid);
    }
    
    // PID 정보 보강
    if (!fields.pid) {
      // 다양한 요소에서 PID 검색
      $('div.entry-product-details > div > ul li, .product-details li, p, .entry-content div').each((_, elem) => {
        const text = $(elem).text().trim();
        
        // 여러 형태의 PID 표현 식별
        if (text.toLowerCase().includes('product id') || 
            text.toLowerCase().includes('pid') || 
            text.toLowerCase().includes('device id')) {
          
          // 향상된 16진수 ID 패턴 매칭 - 다양한 형식 지원
          const hexPatterns = [
            /(0x[0-9A-Fa-f]{1,6})/i,             // 0x로 시작하는 16진수
            /([a-fA-F0-9]{1,6})(?:\s|$)/,        // 1-6자리 16진수
            /(\b\d{1,6}\b)/,                      // 1-6자리 숫자
            /id:\s*([a-fA-F0-9]{1,6})/i          // id: 뒤에 오는 16진수
          ];
          
          let pidValue = '';
          
          // 여러 패턴 시도
          for (const pattern of hexPatterns) {
            const match = text.match(pattern);
            if (match && match[1]) {
              pidValue = match[1];
              break;
            }
          }
          
          // 패턴 매칭 실패 시 콜론 기반 분리 시도
          if (!pidValue) {
            const parts = text.split(':');
            if (parts.length > 1) {
              // 값이 숫자나 16진수 형태인지 확인
              const potential = parts.slice(1).join(':').trim();
              const numericMatch = potential.match(/(\b\d{1,6}\b)|([a-fA-F0-9]{1,6})/);
              if (numericMatch) {
                pidValue = numericMatch[0];
              } else {
                pidValue = potential;
              }
            }
          }
          
          if (pidValue) {
            fields.pid = this.normalizeHexId(pidValue);
            return false; // 루프 중단
          }
        }
      });
      
      // 추가 검색: 페이지 전체 텍스트에서 PID 패턴 찾기
      if (!fields.pid) {
        const bodyText = $('body').text();
        const pidRegex = /product\s*id\s*[=:]\s*(0x[0-9A-Fa-f]{1,6}|[0-9A-Fa-f]{1,6})/i;
        const pidMatch = bodyText.match(pidRegex);
        
        if (pidMatch && pidMatch[1]) {
          fields.pid = this.normalizeHexId(pidMatch[1]);
        }
      }
    } else {
      fields.pid = this.normalizeHexId(fields.pid);
    }
  }

  private extractFromTextBlocks($: cheerio.CheerioAPI, fields: Record<string, any>): void {
    // 제품 설명이나 콘텐츠 블록에서 정보 추출
    $('.product-description, .entry-content p, .description, .product-content, .device-info, .product-info')
      .each((_, elem) => {
        const text = $(elem).text().trim();
        
        // 소프트웨어/펌웨어 버전 정보 찾기
        if (!fields.softwareVersion || !fields.firmwareVersion) {
          const versionPatterns = [
            // 명시적인 "버전" 단어가 있는 패턴
            /(?:firmware|software|fw|sw)\s+version[:\s]+v?(\d+(?:\.\d+)+)/i,
            // 버전 번호만 표시된 패턴
            /(?:firmware|software|fw|sw)[:\s]+v?(\d+(?:\.\d+)+)/i,
            // v로 시작하는 버전 번호
            /v(\d+(?:\.\d+)+)/i
          ];
          
          for (const pattern of versionPatterns) {
            const vMatch = text.match(pattern);
            if (vMatch && vMatch[1]) {
              const version = vMatch[1];
              if (!fields.softwareVersion) {
                fields.softwareVersion = version;
              }
              if (!fields.firmwareVersion) {
                fields.firmwareVersion = version;
              }
              break;
            }
          }
        }
        
        // VID/PID 정보 찾기
        if (!fields.vid) {
          const vidPatterns = [
            /vendor\s+id[:\s]+(0x[0-9A-Fa-f]+|[0-9A-Fa-f]{1,6})/i,
            /vid[:\s]+(0x[0-9A-Fa-f]+|[0-9A-Fa-f]{1,6})/i,
            /vid\s*=\s*(0x[0-9A-Fa-f]+|[0-9A-Fa-f]{1,6})/i
          ];
          for (const pattern of vidPatterns) {
            const vMatch = text.match(pattern);
            if (vMatch && vMatch[1]) {
              fields.vid = this.normalizeHexId(vMatch[1]);
              break;
            }
          }
        }
        if (!fields.pid) {
          const pidPatterns = [
            /product\s+id[:\s]+(0x[0-9A-Fa-f]+|[0-9A-Fa-f]{1,6})/i,
            /pid[:\s]+(0x[0-9A-Fa-f]+|[0-9A-Fa-f]{1,6})/i,
            /pid\s*=\s*(0x[0-9A-Fa-f]+|[0-9A-Fa-f]{1,6})/i
          ];
          for (const pattern of pidPatterns) {
            const pMatch = text.match(pattern);
            if (pMatch && pMatch[1]) {
              fields.pid = this.normalizeHexId(pMatch[1]);
              break;
            }
          }
        }
        
        // 제조업체 정보 추출 (fallback)
        if (!fields.manufacturer || fields.manufacturer === 'Unknown') {
          const manuPatterns = [
            /manufacturer[:\s]+([^,.;]+)/i,
            /company[:\s]+([^,.;]+)/i,
            /made\s+by[:\s]+([^,.;]+)/i
          ];
          
          for (const pattern of manuPatterns) {
            const mMatch = text.match(pattern);
            if (mMatch && mMatch[1] && mMatch[1].trim().length > 1) {
              fields.manufacturer = mMatch[1].trim();
              break;
            }
          }
        }
        
        // 기기 유형 정보 추출 (fallback)
        if (!fields.deviceType || fields.deviceType === 'Matter Device') {
          const deviceTypePatterns = [
            /device\s+type[:\s]+([^,.;]+)/i,
            /product\s+type[:\s]+([^,.;]+)/i,
            /type[:\s]+([^,.;]+(?:light|switch|plug|sensor|lock|outlet|hub|gateway))/i
          ];
          
          for (const pattern of deviceTypePatterns) {
            const dtMatch = text.match(pattern);
            if (dtMatch && dtMatch[1] && dtMatch[1].trim().length > 1) {
              fields.deviceType = dtMatch[1].trim();
              break;
            }
          }
        }
      });
    
    // 스펙 목록 또는 기술 세부 정보에서 정보 추출
    $('.specs, .technical-details, .product-specifications, .tech-specs').each((_, elem) => {
      const text = $(elem).text().trim();
      
      // 각 줄을 개별적으로 처리 (줄 바꿈으로 분리)
      const lines = text.split(/[\r\n]+/);
      for (const line of lines) {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          const key = line.substring(0, colonIndex).trim().toLowerCase();
          const value = line.substring(colonIndex + 1).trim();
          
          if (key && value) {
            this.mapKeyToField(key, value, fields);
          }
        }
      }
    });
  }

  /**
   * 목록 항목에서 정보 추출
   * 목록 항목에서 콜론으로 구분된 정보를 더 효과적으로 추출
   */
  private extractFromListItems($: cheerio.CheerioAPI, fields: Record<string, any>): void {
    // 목록 항목에서 세부 정보 추출 - 다양한 HTML 구조 지원
    const listSelectors = [
      '.entry-product-details div ul li', 
      '.product-details li', 
      '.product-specs li', 
      '.details-list li', 
      '.specs-list li',
      '.tech-specs li',
      '.feature-list li',
      '.info-list li'
    ];
    
    $(listSelectors.join(', ')).each((_, item) => {
      // 1. span.label + span.value 스타일 구조 처리
      const label = $(item).find('span.label, .label, strong, b, .property-name');
      const value = $(item).find('span.value, .value, .data, .property-value');
      
      if (label.length > 0 && value.length > 0) {
        const labelText = label.text().trim().toLowerCase();
        const valueText = value.text().trim();
        
        if (labelText && valueText) {
          this.mapKeyToField(labelText, valueText, fields);
        }
      } 
      // 2. 콜론으로 구분된 텍스트 처리
      else {
        const fullText = $(item).text().trim();
        const colonIndex = fullText.indexOf(':');
        
        if (colonIndex > 0) {
          const key = fullText.substring(0, colonIndex).trim().toLowerCase();
          const value = fullText.substring(colonIndex + 1).trim();
          
          if (key && value) {
            this.mapKeyToField(key, value, fields);
          }
        }
        // 3. 키=값 형식 처리
        else if (fullText.includes('=')) {
          const parts = fullText.split('=', 2);
          if (parts.length === 2) {
            const key = parts[0].trim().toLowerCase();
            const value = parts[1].trim();
            
            if (key && value) {
              this.mapKeyToField(key, value, fields);
            }
          }
        }
        // 4. 다양한 구분자로 쪼개진 텍스트 처리
        else {
          // "키 - 값" 패턴 또는 "키 | 값" 패턴 검사
          const separatorMatch = fullText.match(/(.+?)(?:[-|–—]\s+|\|)(.+)/);
          if (separatorMatch) {
            const key = separatorMatch[1].trim().toLowerCase();
            const value = separatorMatch[2].trim();
            
            if (key && value) {
              // 키가 의미 있는 단어를 포함하는지 확인 (매핑 키워드 확인)
              const keyWords = ['vendor', 'product', 'manufacturer', 'version', 'id', 'type', 'model', 'certificate'];
              if (keyWords.some(word => key.includes(word))) {
                this.mapKeyToField(key, value, fields);
              }
            }
          }
        }
      }
    });
    
    // 정의 목록 (dl/dt/dd) 처리 - 별도로 처리
    $('dl, .definition-list').each((_, defList) => {
      $(defList).find('dt').each((_, dt) => {
        const key = $(dt).text().trim().toLowerCase();
        
        // 해당 dt의 다음 dd 요소 찾기
        let dd = $(dt).next('dd');
        if (dd.length > 0) {
          const value = dd.text().trim();
          
          if (key && value) {
            this.mapKeyToField(key, value, fields);
          }
        }
      });
    });
    
    // div 기반 속성/값 쌍 구조 처리
    $('.product-property, .property-item, .spec-item').each((_, propItem) => {
      const propName = $(propItem).find('.property-name, .prop-name, .spec-name');
      const propValue = $(propItem).find('.property-value, .prop-value, .spec-value');
      
      if (propName.length > 0 && propValue.length > 0) {
        const key = propName.text().trim().toLowerCase();
        const value = propValue.text().trim();
        
        if (key && value) {
          this.mapKeyToField(key, value, fields);
        }
      }
    });
  }

  /**
   * 테이블 형식에서 정보 추출
   * 다양한 형태의 테이블에서 제품 정보 추출
   */
  private extractFromTable($: cheerio.CheerioAPI, fields: Record<string, any>): void {
    // 테이블 검색 - 다양한 테이블 클래스 포함
    const tableSelectors = [
      '.product-certificates-table', 
      '.specs-table', 
      '.tech-specs-table', 
      '.product-info-table', 
      '.details-table',
      'table.specs',
      'table.data-table',
      'table.product-data'
    ];
    
    // 모든 해당 테이블 처리
    $(tableSelectors.join(', ')).each((_, table) => {
      $(table).find('tr').each((_, row) => {
        const cells = $(row).find('td, th');
        
        // 최소한 두 개의 셀이 있는 행만 처리 (키-값 쌍)
        if (cells.length >= 2) {
          // 첫 번째 셀은 키로, 두 번째 셀은 값으로 사용
          const key = $(cells[0]).text().trim().toLowerCase();
          const value = $(cells[1]).text().trim();
          
          if (key && value) {
            this.mapKeyToField(key, value, fields);
          }
        }
      });
    });
    
    // 정의 목록 형식의 테이블 (dl/dt/dd)도 처리
    $('dl.specs, dl.product-specs, dl.data-list').each((_, defList) => {
      $(defList).find('dt').each((_, dt) => {
        const key = $(dt).text().trim().toLowerCase();
        const dd = $(dt).next('dd');
        
        if (dd.length > 0) {
          const value = dd.text().trim();
          
          if (key && value) {
            this.mapKeyToField(key, value, fields);
          }
        }
      });
    });
  }

  /**
   * 제품 상세 정보 수집 프로세스 실행
   */
  public async collect(products: Product[]): Promise<MatterProduct[]> {
    logger.info(`Starting product detail collection for ${products.length} products.`, 'ProductDetailCollector');
    if (products.length === 0) {
      console.log('[ProductDetailCollector] No products to collect details for.');
      return [];
    }

    

    // Stage 2 초기화: UI에 올바른 총 제품 수를 표시하기 위한 상태 설정
    // 1. CrawlerState에 총 제품 수를 명시적으로 설정
    this.state.setDetailStageProductCount(products.length);
    console.log(`[ProductDetailCollector] Set detail stage product count to ${products.length}`);

    // 2. Initialize detail stage with proper duplicate tracking
    this.state.initializeDetailStage();

    // 3. 시작 단계 설정 및 UI 업데이트를 위한 기본 진행 상태 설정
    this.state.setStage('productDetail:init', '2/2단계: 제품 상세 정보 수집 준비 중');
    
    // 4. 명확한 초기 진행 상태 설정 - 확실히 총 항목 수를 설정하여 UI에 정확히 표시되도록 함
    this.state.updateProgress({
      current: 0,                   // 현재 처리된 항목 수 (0으로 초기화)
      total: products.length,       // 총 처리할 항목 수 (제품 목록 크기)
      totalItems: products.length,  // 총 항목 수 (명시적으로 설정)
      processedItems: 0,            // 처리된 항목 수 (0으로 초기화) 
      percentage: 0,                // 진행율 (0%로 초기화)
      newItems: 0,                  // 새 항목 수 (0으로 초기화)
      updatedItems: 0,              // 업데이트된 항목 수 (0으로 초기화)
      currentStage: 3,              // Stage 3: Product Detail (기존 stage 2를 stage 3으로 변경)
      currentBatch: this.currentBatch,
      totalBatches: this.totalBatches,
      currentStep: '2단계: 제품 상세 정보 수집',
      status: 'running',            // 실행 상태 설정
      message: `2단계: 제품 상세 정보 수집 시작 (0/${products.length})`
    });

    const matterProducts: MatterProduct[] = [];
    const failedProducts: string[] = [];
    const failedProductErrors: Record<string, string[]> = {};

    initializeProductTaskStates(products);

    try {
      // Force a browser context refresh before starting detail collection
      if (this.browserManager && typeof this.browserManager.forceRefreshContext === 'function') {
        logger.debug('Forcing browser context refresh before detail collection.', 'ProductDetailCollector');
        try {
          await this.browserManager.forceRefreshContext();
          logger.debug('Browser context refreshed successfully.', 'ProductDetailCollector');
        } catch (refreshError) {
          console.error('[ProductDetailCollector] Failed to refresh browser context:', refreshError);
          // Decide if this error is critical enough to stop the collection
          // For now, we'll log and continue, but you might want to throw an error:
          // throw new Error(`Failed to refresh browser context: ${refreshError.message}`);
        }
      } else {
        logger.debug('BrowserManager or forceRefreshContext method not available. Skipping context refresh.', 'ProductDetailCollector');
      }

      this.state.setStage('productDetail:fetching', '2/2단계: 제품 상세 정보 수집 중');
      logger.info(`Starting phase 2: crawling product details for ${products.length} products`, 'ProductDetailCollector');

      crawlerEvents.emit('crawlingTaskStatus', {
        taskId: 'detail-start',
        status: 'running',
        message: JSON.stringify({
          stage: 3, // Stage 3: Product Detail (기존 stage 2를 stage 3으로 변경)
          type: 'start',
          totalProducts: products.length,
          startTime: new Date().toISOString()
        })
      });

      await this.executeParallelProductDetailCrawling(
        products,
        matterProducts,
        failedProducts,
        failedProductErrors
      );

      if (this.abortController.signal.aborted) {
        console.log('[ProductDetailCollector] Crawling was stopped during product detail collection.');
      
        crawlerEvents.emit('crawlingTaskStatus', {
          taskId: 'detail-abort',
          status: 'stopped',
          message: JSON.stringify({
            stage: 3,  // Stage 3: Detail
            type: 'abort',
            processedItems: this.state.getDetailStageProcessedCount(),
            totalItems: products.length,
            abortReason: 'user_request',
            endTime: new Date().toISOString()
          })
        });
        return matterProducts;
      }

      
      if (failedProducts.length > 0) {
        console.log(`[ProductDetailCollector] Retrying ${failedProducts.length} failed products.`);
        await this.retryFailedProductDetails(
          failedProducts,
          products,
          matterProducts,
          failedProductErrors
        );
      }

      const totalProducts = products.length;
      const finalFailedCount = failedProducts.length;
      const actualProcessedCount = this.state.getDetailStageProcessedCount();
      const successProducts = actualProcessedCount - finalFailedCount;
      
      console.log(`[ProductDetailCollector] Collection complete:`);
      console.log(`[ProductDetailCollector] - Total products: ${totalProducts}`);
      console.log(`[ProductDetailCollector] - Actually processed: ${actualProcessedCount}`);
      console.log(`[ProductDetailCollector] - Successful: ${successProducts}`);
      console.log(`[ProductDetailCollector] - Failed: ${finalFailedCount}`);
      console.log(`[ProductDetailCollector] - New items: ${this.state.getDetailStageNewCount()}`);
      console.log(`[ProductDetailCollector] - Updated items: ${this.state.getDetailStageUpdatedCount()}`);

      // 최종 완료 상태 검증 using enhanced validation
      const validationResult = this.validateFinalCompletionStatus(
        totalProducts,
        finalFailedCount
      );
      
      const isFullyComplete = validationResult.isComplete;
      const completionStatus = validationResult.status;
      
      // Log the validation result
      console.log(`[ProductDetailCollector] Final validation: ${validationResult.message}`);

      crawlerEvents.emit('crawlingTaskStatus', {
        taskId: 'detail-complete',
        status: completionStatus,
        message: JSON.stringify({
          stage: 3,
          type: 'complete',
          totalItems: products.length,
          processedItems: actualProcessedCount,
          successItems: successProducts,
          failedItems: finalFailedCount,
          newItems: this.state.getDetailStageNewCount(),
          updatedItems: this.state.getDetailStageUpdatedCount(),
          successRate: parseFloat(((totalProducts > 0 ? successProducts / totalProducts : 1) * 100).toFixed(1)),
          isFullyComplete: isFullyComplete,
          endTime: new Date().toISOString()
        })
      });
      
      this.state.setStage('productDetail:processing', '2단계: 제품 상세 정보 처리 완료');

    } catch (error) {
      console.error('[ProductDetailCollector] Critical error during product detail collection:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.state.setStage('failed', `2단계 상세 수집 중 오류: ${errorMessage}`);
      crawlerEvents.emit('crawlingError', {
        stage: 'Product Detail Collection',
        message: errorMessage,
        error,
      });
    } finally {
      await this.cleanupResources();
    }

    return matterProducts;
  }

  /**
   * 리소스 정리를 위한 함수
   */
  private async cleanupResources(): Promise<void> {
    console.log('[ProductDetailCollector] Cleaning up resources specific to ProductDetailCollector...');
    
    try {
      const progressData = this.state.getProgressData();
      const totalItems = progressData?.total ?? this.state.getDetailStageProcessedCount(); 

      this.state.updateProgress({
        current: this.state.getDetailStageProcessedCount(), 
        total: totalItems,
        currentStage: 3,              // Stage 3: Detail collection (기존 stage 2를 stage 3으로 변경)
        currentStep: '3단계: 제품 상세 정보 처리 완료',
        status: 'running', 
        message: '3단계: 제품 상세 정보 처리 완료',
        currentBatch: this.currentBatch,
        totalBatches: this.totalBatches
      });
      
      crawlerEvents.emit('crawlingStageChanged', 'productDetail:processing', '2단계: 제품 상세 정보 처리 완료');
    } catch (error) {
      console.error('[ProductDetailCollector] Error during final state update in cleanupResources:', error);
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
    const startTime = Date.now(); // 시작 시간 기록
    
    if (signal.aborted) {
      updateProductTaskStatus(product.url, 'stopped');
      return null;
    }

    crawlerEvents.emit('crawlingTaskStatus', {
      taskId: `product-${product.url}`,
      status: 'running',
      message: JSON.stringify({
        stage: 3,
        type: 'product',
        url: product.url,
        manufacturer: product.manufacturer || 'Unknown',
        model: product.model || 'Unknown',
        attempt: attempt,
        startTime: new Date().toISOString()
      })
    });

    updateProductTaskStatus(product.url, 'running');

    
    
    let detailProduct: MatterProduct | null = null;

    try {
      // 지수 백오프와 재시도 로직을 사용하여 크롤링
      const baseRetryDelay = config.baseRetryDelayMs ?? 1000;
      const maxRetryDelay = config.maxRetryDelayMs ?? 15000;
      const retryMax = config.retryMax ?? 2;
      
      detailProduct = await retryWithBackoff(
        async () => {
          // retryWithBackoff 내부에서도 중지 신호 체크
          if (signal.aborted) {
            throw new Error('Aborted before Axios operation');
          }
          
          return await Promise.race([
            this.crawlProductDetail(product, signal),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Operation timed out')), config.productDetailTimeoutMs ?? 60000)
            )
          ]);
        },
        retryMax,
        baseRetryDelay,
        maxRetryDelay,
        (retryAttempt, delay, err) => {
          // 재시도 전에도 중지 신호 체크
          if (signal.aborted) {
            console.log(`[ProductDetailCollector] 재시도 중단됨 (재시도 ${retryAttempt}/${retryMax}): ${product.url} - ${err.message}`);
            return; // 재시도를 포기하고 에러를 던짐
          }
          
          console.warn(
            `[ProductDetailCollector] Retrying (${retryAttempt}/${retryMax}) after ${delay}ms for ${product.url}: ${err.message}`
          );
          crawlerEvents.emit('crawlingTaskStatus', {
            taskId: `product-retry-${product.url}`,
            status: 'attempting',
            message: JSON.stringify({
              stage: 3,
              type: 'retry',
              url: product.url,
              attempt: retryAttempt,
              maxAttempts: retryMax,
              delay: delay,
              error: err.message,
              timestamp: Date.now()
            })
          });
        },
        (_retryAttempt, _err) => {
          // 재시도 포기 조건: 중지 신호가 발생한 경우
          return signal.aborted;
        }
      );

      if (detailProduct) {
        updateProductTaskStatus(product.url, 'success');
        
        // 새로운 항목인지 정확히 판단
        const existingProductIndex = matterProducts.findIndex(p => p.url === product.url);
        const isNewItem = existingProductIndex === -1;

        // MatterProducts 배열에 추가/업데이트
        if (isNewItem) {
          matterProducts.push(detailProduct);
        } else {
          matterProducts[existingProductIndex] = detailProduct;
        }
        
        // CrawlerState에 정확한 정보로 기록 (중복 방지 포함)
        this.state.recordDetailItemProcessed(isNewItem, product.url);
        
        // 성공 로그
        const processingTime = Date.now() - startTime;
        console.log(`[ProductDetailCollector] Successfully processed product: ${product.url.substring(0, 50)}... (${processingTime}ms, isNew: ${isNewItem})`);
        
        // 현재 진행 상태를 로그로 출력 - 디버깅 목적
        const currentProcessed = this.state.getDetailStageProcessedCount();
        const currentNew = this.state.getDetailStageNewCount();
        const currentUpdated = this.state.getDetailStageUpdatedCount();
        const currentTotal = this.state.getDetailStageTotalProductCount();
        console.log(`[ProductDetailCollector] Current counts: processed=${currentProcessed}, new=${currentNew}, updated=${currentUpdated}, total=${currentTotal}`);
        
        // 진행률 업데이트 이벤트를 발생시켜 UI 업데이트 (업데이트 충돌 문제 해결)
        const totalItems = currentTotal > 0 ? currentTotal : this.state.getProgressData().totalItems || 0;
        
        crawlerEvents.emit('crawlingProgress', {
          status: 'running',
          currentPage: currentProcessed,       // 현재 처리된 항목 수
          totalPages: totalItems,              // 총 항목 수
          processedItems: currentProcessed,    // 처리된 항목 수
          totalItems: totalItems,              // 총 항목 수
          percentage: Math.min((currentProcessed / Math.max(totalItems, 1)) * 100, 100), // 진행율
          currentStep: '제품 상세 정보 수집',     // 현재 단계 설명
          currentStage: 3,                    // Stage 3: Detail collection (기존 stage 2를 stage 3으로 변경)
          newItems: currentNew,               // 새로운 항목 수
          updatedItems: currentUpdated,       // 업데이트된 항목 수
          message: `3단계: 제품 상세정보 ${currentProcessed}/${totalItems} 처리 중 (${Math.min((currentProcessed / Math.max(totalItems, 1)) * 100, 100).toFixed(1)}%)`
        });
        
        crawlerEvents.emit('crawlingTaskStatus', {
          taskId: `product-${product.url}`,
          status: 'success',
          message: JSON.stringify({
            stage: 3,
            type: 'product',
            url: product.url,
            manufacturer: detailProduct.manufacturer || 'Unknown',
            model: detailProduct.model || 'Unknown',
            isNewItem: isNewItem,
            endTime: new Date().toISOString()
          })
        });

        matterProducts.push(detailProduct);
        
        // 성공적인 결과 반환 - DetailCrawlResult 타입에 맞게 수정
        return {
          url: product.url,
          product: detailProduct,
          isNewItem: isNewItem,
          success: true
        };
      }
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const status = signal.aborted ? 'stopped' : 'error';
      updateProductTaskStatus(product.url, status, errorMsg);

      crawlerEvents.emit('crawlingTaskStatus', {
        taskId: `product-${product.url}`,
        status: 'error',
        message: JSON.stringify({
          stage: 3,
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

      // 실패한 경우에도 DetailCrawlResult 타입에 맞게 반환
      return { 
        url: product.url, 
        product: null, 
        error: errorMsg,
        success: false,
        isNewItem: false
      };
    }

    // 예상치 못한 경우 (detailProduct가 null인 경우)
    return null;
  }

  /**
   * 제품 상세 정보 병렬 크롤링 실행
   * 
   * 수정사항: 진행 상황 카운팅 동기화 문제 해결
   * - 로컬 processedItems 변수 제거하고 CrawlerState의 카운터만 사용
   * - 중복 카운팅 방지를 위해 updateProgress() 호출 제거 및 메서드 기능 변경
   * - 정확한 신규/업데이트 항목 카운팅을 위해 recordDetailItemProcessed는 processProductDetailCrawl에서만 호출
   * - 모든 진행률 업데이트는 this.state.getDetailStageProcessedCount() 기준으로 통일
   */
  private async executeParallelProductDetailCrawling(
    products: Product[],
    matterProducts: MatterProduct[],
    failedProducts: string[],
    failedProductErrors: Record<string, string[]>
  ): Promise<void> {
    const config = this.config;
    
    const totalItems = products.length;
    const startTime = Date.now();
    let lastProgressUpdate = 0;
    const progressUpdateInterval = 3000;

    // 단계 2 실행 시작 시 진행 상태 명확하게 초기화
    // CrawlerState 총 항목 수와 UI 표시를 일치시키기 위한 중요한 설정
    this.state.updateProgress({
      current: 0,                   // 현재까지 처리된 항목
      total: totalItems,            // 총 처리할 항목 수
      totalItems: totalItems,       // 총 항목 수 (명시적 설정)
      processedItems: 0,            // 처리된 항목 수
      percentage: 0,                // 진행율
      currentStage: 3,              // Stage 3: Detail collection (기존 stage 2를 stage 3으로 변경)
      currentStep: '3단계: 제품 상세 정보 수집',
      currentBatch: this.currentBatch,
      totalBatches: this.totalBatches,
      status: 'running',            // 상태
      newItems: 0,                  // 새 항목 수
      updatedItems: 0,              // 업데이트된 항목 수
      message: `3단계: 제품 상세 정보 수집 시작 (0/${totalItems})`
    });
    
    // 초기 진행 이벤트 발행 - UI 업데이트를 위한 중요한 단계
    // 이 이벤트를 통해 UI가 처음부터 정확한 "0/totalItems" 값을 표시함
    crawlerEvents.emit('crawlingProgress', {
      status: 'running',
      currentPage: 0,               // 현재 페이지/항목 위치
      totalPages: totalItems,       // 총 페이지/항목 수
      processedItems: 0,            // 처리된 항목 수
      totalItems: totalItems,       // 총 항목 수 (UI에 표시될 총 제품 수)
      percentage: 0,                // 진행율
      currentStep: '제품 상세 정보 수집',  // 현재 단계 설명
      currentStage: 3,              // 현재 단계 번호 (Stage 3: Detail)
      remainingTime: undefined,     // 남은 시간 (아직 계산 불가)
      elapsedTime: 0,               // 경과 시간
      startTime: startTime,         // 시작 시간
      estimatedEndTime: 0,          // 예상 종료 시간 (아직 계산 불가)
      newItems: 0,                  // 새 항목 수
      updatedItems: 0,              // 업데이트된 항목 수
      message: `3단계: 제품 상세정보 0/${totalItems} 처리 중 (0.0%)`
    });

    console.log(`[ProductDetailCollector] Starting detail collection for ${totalItems} products with proper UI initialization`);
    
    await promisePool(
      products,
      async (product, signal) => {
        const result = await this.processProductDetailCrawl(
          product, matterProducts, failedProducts, failedProductErrors, signal
        );

        const now = Date.now();
        if (now - lastProgressUpdate > progressUpdateInterval) {
          lastProgressUpdate = now;
          
          const currentProcessedItems = this.state.getDetailStageProcessedCount();
          const percentage = (currentProcessedItems / totalItems) * 100;
          const elapsedTime = now - startTime;
          let remainingTime: number | undefined = undefined;
          
          if (currentProcessedItems > totalItems * 0.1) {
            const avgTimePerItem = elapsedTime / currentProcessedItems;
            remainingTime = Math.round((totalItems - currentProcessedItems) * avgTimePerItem);
          }
          
          const message = `2단계: 제품 상세정보 ${currentProcessedItems}/${totalItems} 처리 중 (${percentage.toFixed(1)}%)`;

          // CrawlerState 상태와 동기화 - newItems와 updatedItems 보존
          this.state.updateProgress({
            current: currentProcessedItems,
            total: totalItems,
            currentStage: 3,              // 3단계 명시적 설정 (Stage 3: Detail)
            currentStep: '3단계: 제품 상세 정보 수집',
            status: 'running',
            message: message,
            percentage: percentage,
            currentBatch: this.currentBatch,
            totalBatches: this.totalBatches,
            newItems: this.state.getDetailStageNewCount(),
            updatedItems: this.state.getDetailStageUpdatedCount()
          });
          
          const detailConcurrency = config.detailConcurrency ?? 1;
          const activeTasksCount = Math.min(detailConcurrency, totalItems - currentProcessedItems + 1);
          this.state.updateParallelTasks(activeTasksCount, detailConcurrency);
          
          crawlerEvents.emit('crawlingProgress', {
            status: 'running',
            currentPage: currentProcessedItems,
            totalPages: totalItems,
            processedItems: currentProcessedItems,
            totalItems: totalItems,
            percentage: percentage,
            currentStep: '제품 상세 정보 수집',
            currentStage: 3,                       // Stage 3: Detail
            remainingTime: remainingTime,
            elapsedTime: elapsedTime,
            startTime: startTime,
            estimatedEndTime: remainingTime ? now + remainingTime : 0,
            newItems: this.state.getDetailStageNewCount(),
            updatedItems: this.state.getDetailStageUpdatedCount(),
            message: message
          });
        }
        
        return result;
      },
      config.detailConcurrency ?? 1,
      this.abortController,
      undefined, // shouldStopCrawling parameter
      {
        // 적응형 동시성 설정
        adaptiveConcurrency: config.adaptiveConcurrency ?? true,
        errorThreshold: 0.3, // 30% 실패율이 넘으면 동시성 감소
        minConcurrency: 1,
        successWindowSize: 10 // 최근 10개 요청의 성공/실패 기록을 기반으로 동시성 조절
      }
    );

    // 최종 진행률 업데이트 - 실제 처리된 항목 수 기준
    const finalElapsedTime = Date.now() - startTime;
    const actualProcessedItems = this.state.getDetailStageProcessedCount();
    const newItems = this.state.getDetailStageNewCount();
    const updatedItems = this.state.getDetailStageUpdatedCount();
    
    // 로그로 최종 상태 확인
    console.log(`[ProductDetailCollector] Final collection status: processed=${actualProcessedItems}/${totalItems}, new=${newItems}, updated=${updatedItems}`);
    
    // 수집 완료 전 UI와 상태 동기화 강제 실행
    this.state.forceProgressSync(actualProcessedItems, totalItems);
    
    // 상태 객체에 최종 상태 업데이트
    this.state.updateProgress({
      current: actualProcessedItems, // CrawlerState의 실제 카운터 사용
      total: totalItems,
      totalItems: totalItems,
      processedItems: actualProcessedItems,
      currentStage: 3,              // 3단계 명시적 설정 (Stage 3: Detail)
      currentStep: '3단계: 제품 상세 정보 수집 완료',
      status: 'running',
      newItems: newItems,
      updatedItems: updatedItems,
      message: `3단계: 제품 상세 정보 수집 완료 (${actualProcessedItems}/${totalItems})`,
      currentBatch: this.currentBatch,
      totalBatches: this.totalBatches,
      percentage: 100
    });
    this.state.updateParallelTasks(0, config.detailConcurrency ?? 1);
    
    // 진행 상태 변경 이벤트 먼저 발생시키기 (UI 상태 동기화를 위해)
    crawlerEvents.emit('crawlingStageChanged', 'productDetail:completed', `2단계 완료: ${actualProcessedItems}/${totalItems}개 제품 상세정보 수집 완료`);
    
    // 진행 상태 업데이트 이벤트 발생시키기
    crawlerEvents.emit('crawlingProgress', {
      status: 'completed',
      currentPage: actualProcessedItems,     // 실제 처리된 항목 수 사용
      totalPages: totalItems,                // 총 항목 수
      processedItems: actualProcessedItems,  // 처리된 항목 수
      totalItems: totalItems,                // 총 항목 수
      percentage: 100,                       // 완료 상태
      currentStep: '제품 상세 정보 수집 완료', // 완료 상태
      currentStage: 3,                      // 현재 단계 (Stage 3: Detail)
      remainingTime: 0,                     // 남은 시간
      elapsedTime: finalElapsedTime,        // 총 소요 시간
      startTime: startTime,                 // 시작 시간
      estimatedEndTime: Date.now(),         // 종료 시간
      newItems: newItems,                   // 신규 항목 수
      updatedItems: updatedItems,           // 업데이트 항목 수
      message: `3단계 완료: ${actualProcessedItems}/${totalItems}개 제품 상세정보 수집 완료 (신규: ${newItems}, 업데이트: ${updatedItems})`
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
    const retryStart = config.retryStart ?? 1;
    
    if (productDetailRetryCount <= 0) {
      logger.debug(`재시도 횟수가 0으로 설정되어 제품 상세 정보 재시도를 건너뜁니다.`, 'ProductDetailCollector');
      return;
    }
    
    const validFailedProducts = failedProducts.filter(url => !!url);
    if (validFailedProducts.length !== failedProducts.length) {
      logger.debug(`유효하지 않은 URL ${failedProducts.length - validFailedProducts.length}개를 필터링했습니다.`, 'ProductDetailCollector');
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
      // 크롤링 중지 신호 확인
      if (this.abortController.signal.aborted) {
        logger.info('재시도 중 중지 신호를 받아 제품 상세 정보 재시도를 중단합니다.', 'ProductDetailCollector');
        crawlerEvents.emit('crawlingTaskStatus', {
          taskId: 'detail-retry',
          status: 'cancelled',
          message: '제품 상세 정보 재시도가 중지되었습니다.'
        });
        return;
      }
      
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

      logger.info(`[RETRY][${attempt}] 제품 상세 정보 재시도 중: ${retryProducts.length}개 제품 (${attempt - retryStart + 1}/${productDetailRetryCount})`, 'ProductDetailCollector');

      if (retryProducts.length === 0) {
        logger.debug(`[RETRY][${attempt}] 재시도할 제품이 없습니다.`, 'ProductDetailCollector');
        break;
      }

      await promisePool(
        retryProducts,
        async (product, signal) => {
          // 프로세스 시작 전 중지 신호 체크
          if (this.abortController.signal.aborted || signal.aborted) {
            console.log(`[ProductDetailCollector] 재시도 중단됨 - 중지 신호 감지: ${product.url}`);
            return null;
          }
          
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
        config.retryConcurrency ?? 1,
        this.abortController
      );

      // promisePool 완료 후 중지 신호 체크
      if (this.abortController.signal.aborted) {
        logger.info('재시도 promisePool 완료 후 중지 신호를 받아 제품 상세 정보 재시도를 중단합니다.', 'ProductDetailCollector');
        crawlerEvents.emit('crawlingTaskStatus', {
          taskId: 'detail-retry',
          status: 'cancelled',
          message: '제품 상세 정보 재시도가 중지되었습니다.'
        });
        return;
      }

      if (failedProducts.length === 0) {
        logger.info(`모든 제품 상세 정보 재시도 성공`, 'ProductDetailCollector');
        
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
      logger.info(`재시도를 통해 ${retrySuccessCount}개의 추가 제품 정보를 성공적으로 수집했습니다.`, 'ProductDetailCollector');
    }

    if (failedProducts.length > 0) {
      logger.warn(`${productDetailRetryCount}회 재시도 후에도 실패한 제품 URL 수: ${failedProducts.length}`, 'ProductDetailCollector');
      
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

  /**
   * Primary Device Type ID 정보 보강 및 정규화
   */
  private enhancePrimaryDeviceTypeIds($: cheerio.CheerioAPI, fields: Record<string, any>): void {
    // 이미 primaryDeviceTypeId가 있으면 정규화만 수행
    if (fields.primaryDeviceTypeId) {
      fields.primaryDeviceTypeId = this.normalizePrimaryDeviceTypeIds(fields.primaryDeviceTypeId);
      return;
    }
    
    // 페이지 내용에서 primaryDeviceTypeId 추출 시도
    const possibleLabels = [
      'primary device type id', 
      'device type id', 
      'primary device id',
      'devicetypeid'
    ];
    
    // 제품 상세 내용에서 primaryDeviceTypeId 찾기
    $('div.entry-product-details > div > ul li').each((_, elem) => {
      const text = $(elem).text().trim().toLowerCase();
      
      for (const label of possibleLabels) {
        if (text.includes(label)) {
          const parts = text.split(':');
          if (parts.length > 1) {
            fields.primaryDeviceTypeId = this.normalizePrimaryDeviceTypeIds(parts[1].trim());
            return false; // 루프 중단
          }
        }
      }
    });
    
    // 테이블 구조에서 primaryDeviceTypeId 찾기
    $('.product-certificates-table tr').each((_, row) => {
      const cells = $(row).find('td');
      if (cells.length >= 2) {
        const key = $(cells[0]).text().trim().toLowerCase();
        
        for (const label of possibleLabels) {
          if (key.includes(label)) {
            const value = $(cells[1]).text().trim();
            if (value) {
              fields.primaryDeviceTypeId = this.normalizePrimaryDeviceTypeIds(value);
              return false; // 루프 중단
            }
          }
        }
      }
    });
  }

  /**
   * 최종 완료 상태 검증 개선
   */
  private validateFinalCompletionStatus(
    totalProducts: number,
    failedCount: number
  ): { isComplete: boolean; status: 'success' | 'partial' | 'failed'; message: string } {
    
    // 실제 처리된 항목 수 확인
    const actualProcessedCount = this.state.getDetailStageProcessedCount();
    const actualNewCount = this.state.getDetailStageNewCount();
    const actualUpdatedCount = this.state.getDetailStageUpdatedCount();

    console.log(`[ProductDetailCollector] Final validation:`);
    console.log(`  - Expected total: ${totalProducts}`);
    console.log(`  - Actually processed: ${actualProcessedCount}`);
    console.log(`  - New items: ${actualNewCount}`);
    console.log(`  - Updated items: ${actualUpdatedCount}`);
    console.log(`  - Failed: ${failedCount}`);

    const isComplete = actualProcessedCount >= totalProducts;
    const successRate = totalProducts > 0 ? (actualProcessedCount - failedCount) / totalProducts : 1;

    let status: 'success' | 'partial' | 'failed';
    let message: string;

    if (isComplete && successRate >= 0.95) {
      status = 'success';
      message = `제품 상세정보 수집 완료: ${actualProcessedCount}/${totalProducts} (신규: ${actualNewCount}, 업데이트: ${actualUpdatedCount})`;
    } else if (successRate >= 0.8) {
      status = 'partial';
      message = `제품 상세정보 부분 완료: ${actualProcessedCount}/${totalProducts} (성공률: ${(successRate * 100).toFixed(1)}%)`;
    } else {
      status = 'failed';
      message = `제품 상세정보 수집 실패: ${actualProcessedCount}/${totalProducts} (성공률: ${(successRate * 100).toFixed(1)}%)`;
    }

    return { isComplete, status, message };
  }
}