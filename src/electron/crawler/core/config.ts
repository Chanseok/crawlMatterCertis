/**
 * config.ts
 * 크롤링 설정 관리 모듈
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { app } from 'electron';
import { CrawlerConfig } from '../../../../types.js';


//#region Constants
// 크롤링 URL 상수
const BASE_URL = 'https://csa-iot.org/csa-iot_products/';
const MATTER_FILTER_URL = 'https://csa-iot.org/csa-iot_products/?p_keywords=&p_type%5B%5D=14&p_program_type%5B%5D=1049&p_certificate=&p_family=&p_firmware_ver=';

// 크롤링 설정 상수
const PAGE_TIMEOUT_MS = 30000; // 페이지 타임아웃
const PRODUCT_DETAIL_TIMEOUT_MS = 30000; // 제품 상세 페이지 타임아웃
const PRODUCTS_PER_PAGE = 12;  // 페이지당 제품 수
const INITIAL_CONCURRENCY = 9; // 초기 병렬 크롤링 동시성 수준
const DETAIL_CONCURRENCY = 9; // 제품 상세 정보 크롤링 동시성 수준
const RETRY_CONCURRENCY = 6;   // 재시도 시 병렬 크롤링 동시성 수준
const MIN_REQUEST_DELAY_MS = 100; // 요청 간 최소 지연 시간(ms)
const MAX_REQUEST_DELAY_MS = 2200; // 요청 간 최대 지연 시간(ms)
const RETRY_START = 2;          // 재시도 시작 횟수 (첫 시도가 1)
const RETRY_MAX = 10;           // 최대 재시도 횟수 (총 9회 재시도)

// 캐시 관련 상수
const CACHE_TTL_MS = 5 * 60 * 1000; // 5분 캐시

// 재시도 횟수 관련 상수 (Improving.md 요구사항에 따름)
const DEFAULT_PRODUCT_LIST_RETRY_COUNT = 9;    // Product List 수집 재시도 횟수 기본값
const DEFAULT_PRODUCT_DETAIL_RETRY_COUNT = 9;  // Product Detail 수집 재시도 횟수 기본값
const MIN_RETRY_COUNT = 3;    // 최소 재시도 횟수 
const MAX_RETRY_COUNT = 20;   // 최대 재시도 횟수

// 페이지 범위 관련 상수
const DEFAULT_PAGE_RANGE_LIMIT = 0; // 0은 제한 없음을 의미

//#endregion

export const defaultConfig: CrawlerConfig = {
  baseUrl: BASE_URL,
  matterFilterUrl: MATTER_FILTER_URL,
  pageTimeoutMs: PAGE_TIMEOUT_MS,
  productDetailTimeoutMs: PRODUCT_DETAIL_TIMEOUT_MS,
  productsPerPage: PRODUCTS_PER_PAGE,
  initialConcurrency: INITIAL_CONCURRENCY,
  detailConcurrency: DETAIL_CONCURRENCY,
  retryConcurrency: RETRY_CONCURRENCY,
  minRequestDelayMs: MIN_REQUEST_DELAY_MS,
  maxRequestDelayMs: MAX_REQUEST_DELAY_MS,
  retryStart: RETRY_START,
  retryMax: RETRY_MAX,
  cacheTtlMs: CACHE_TTL_MS,
  // constants.ts의 기본값 사용
  productListRetryCount: DEFAULT_PRODUCT_LIST_RETRY_COUNT,
  productDetailRetryCount: DEFAULT_PRODUCT_DETAIL_RETRY_COUNT,
  pageRangeLimit: DEFAULT_PAGE_RANGE_LIMIT
};

// 현재 설정을 메모리에 유지
let currentConfig: CrawlerConfig = { ...defaultConfig };

// 설정 파일 경로
const CONFIG_FILE_PATH = join(app.getPath('userData'), 'crawler-settings.json');

// 설정 초기화 - 앱 시작 시 한번만 호출
(async function initConfig() {
  try {
    // 파일 존재 여부 확인
    try {
      await fs.access(CONFIG_FILE_PATH);
      const configData = await fs.readFile(CONFIG_FILE_PATH, 'utf-8');
      const loadedConfig = JSON.parse(configData);
      // 기본값과 저장된 값 병합
      currentConfig = { ...defaultConfig, ...loadedConfig };
      console.log('설정을 파일에서 로드했습니다:', CONFIG_FILE_PATH);
    } catch (err) {
      // 파일이 없으면 기본 설정 사용
      console.log('설정 파일이 없어 기본값을 사용합니다.');
      await saveConfigToFile(defaultConfig);
    }
  } catch (error) {
    console.error('설정 초기화 중 오류 발생:', error);
  }
})();

/**
 * 설정을 파일에 저장
 */
async function saveConfigToFile(config: CrawlerConfig): Promise<void> {
  try {
    await fs.writeFile(
      CONFIG_FILE_PATH,
      JSON.stringify(config, null, 2),
      'utf-8'
    );
    console.log('설정을 파일에 저장했습니다:', CONFIG_FILE_PATH);
  } catch (error) {
    console.error('설정 저장 중 오류 발생:', error);
  }
}

/**
 * 현재 크롤러 설정 가져오기
 */
export function getConfig(): CrawlerConfig {
  return { ...currentConfig };
}

/**
 * 크롤러 설정 업데이트
 */
export function updateConfig(newConfig: Partial<CrawlerConfig>): void {
  currentConfig = { ...currentConfig, ...newConfig };
  
  // 재시도 횟수 범위 제한 (MIN_RETRY_COUNT ~ MAX_RETRY_COUNT)
  if (currentConfig.productListRetryCount < MIN_RETRY_COUNT) {
    currentConfig.productListRetryCount = MIN_RETRY_COUNT;
  } else if (currentConfig.productListRetryCount > MAX_RETRY_COUNT) {
    currentConfig.productListRetryCount = MAX_RETRY_COUNT;
  }
  
  if (currentConfig.productDetailRetryCount < MIN_RETRY_COUNT) {
    currentConfig.productDetailRetryCount = MIN_RETRY_COUNT;
  } else if (currentConfig.productDetailRetryCount > MAX_RETRY_COUNT) {
    currentConfig.productDetailRetryCount = MAX_RETRY_COUNT;
  }
  
  // 변경된 설정 저장 (비동기이지만 완료를 기다리지 않음)
  saveConfigToFile(currentConfig).catch(err => 
    console.error('설정 업데이트 저장 중 오류:', err)
  );
}

/**
 * 설정을 기본값으로 초기화
 */
export function resetConfig(): void {
  currentConfig = { ...defaultConfig };
  // 변경된 설정 저장 (비동기이지만 완료를 기다리지 않음)
  saveConfigToFile(currentConfig).catch(err => 
    console.error('설정 초기화 후 저장 중 오류:', err)
  );
}