/**
 * config.ts
 * 크롤링 설정 관리 모듈
 */

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
  CACHE_TTL_MS
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
  cacheTtlMs: CACHE_TTL_MS
};

let currentConfig: CrawlerConfig = { ...defaultConfig };

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
}

/**
 * 설정을 기본값으로 초기화
 */
export function resetConfig(): void {
  currentConfig = { ...defaultConfig };
}