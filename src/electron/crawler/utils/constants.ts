/**
 * constants.ts
 * 크롤러에 사용되는 상수 값들을 정의
 */

// 크롤링 URL 상수
export const BASE_URL = 'https://csa-iot.org/csa-iot_products/';
export const MATTER_FILTER_URL = 'https://csa-iot.org/csa-iot_products/?p_keywords=&p_type%5B%5D=14&p_program_type%5B%5D=1049&p_certificate=&p_family=&p_firmware_ver=';

// 크롤링 설정 상수
export const PAGE_TIMEOUT_MS = 30000; // 페이지 타임아웃
export const PRODUCT_DETAIL_TIMEOUT_MS = 30000; // 제품 상세 페이지 타임아웃
export const PRODUCTS_PER_PAGE = 12;  // 페이지당 제품 수
export const INITIAL_CONCURRENCY = 9; // 초기 병렬 크롤링 동시성 수준
export const DETAIL_CONCURRENCY = 9; // 제품 상세 정보 크롤링 동시성 수준
export const RETRY_CONCURRENCY = 6;   // 재시도 시 병렬 크롤링 동시성 수준
export const MIN_REQUEST_DELAY_MS = 100; // 요청 간 최소 지연 시간(ms)
export const MAX_REQUEST_DELAY_MS = 2200; // 요청 간 최대 지연 시간(ms)
export const RETRY_START = 2;          // 재시도 시작 횟수 (첫 시도가 1)
export const RETRY_MAX = 10;           // 최대 재시도 횟수 (총 9회 재시도)

// 캐시 관련 상수
export const CACHE_TTL_MS = 5 * 60 * 1000; // 5분 캐시