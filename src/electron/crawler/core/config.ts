/**
 * config.ts
 * 크롤링 설정 관리 모듈
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { app } from 'electron';

import {
  BASE_URL,
  MATTER_FILTER_URL,
  PAGE_TIMEOUT_MS,
  PRODUCT_DETAIL_TIMEOUT_MS,
  PRODUCTS_PER_PAGE,
  INITIAL_CONCURRENCY,
  DETAIL_CONCURRENCY,
  RETRY_CONCURRENCY,
  MIN_REQUEST_DELAY_MS,
  MAX_REQUEST_DELAY_MS,
  RETRY_START,
  RETRY_MAX,
  CACHE_TTL_MS,
  DEFAULT_PRODUCT_LIST_RETRY_COUNT,
  DEFAULT_PRODUCT_DETAIL_RETRY_COUNT,
  MIN_RETRY_COUNT,
  MAX_RETRY_COUNT,
  DEFAULT_PAGE_RANGE_LIMIT,
  CONFIG_STORAGE_KEY
} from '../utils/constants.js';

export interface CrawlerConfig {
  baseUrl: string;
  matterFilterUrl: string;
  pageTimeoutMs: number;
  productDetailTimeoutMs: number;
  productsPerPage: number;
  initialConcurrency: number;
  detailConcurrency: number;
  retryConcurrency: number;
  minRequestDelayMs: number;
  maxRequestDelayMs: number;
  retryStart: number;
  retryMax: number;
  cacheTtlMs: number;
  // 요구사항 CRAWL-RETRY-001에 따른 별도 재시도 설정 추가
  productListRetryCount: number;  // Product List 수집 재시도 횟수
  productDetailRetryCount: number; // Product Detail 수집 재시도 횟수
  pageRangeLimit: number; // 수집할 페이지 수 제한
}

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