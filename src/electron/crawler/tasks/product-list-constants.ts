/**
 * product-list-constants.ts
 * 제품 목록 수집 관련 상수 정의
 */

/**
 * 페이지 총 수 조회 최대 시도 횟수
 */
export const MAX_FETCH_TOTAL_PAGES_ATTEMPTS = 3;

/**
 * 재시도 간 딜레이 (밀리초)
 */
export const RETRY_DELAY_MS = 2500; 

/**
 * 기본 페이지 로딩 타임아웃 (밀리초)
 */
export const DEFAULT_PAGE_TIMEOUT_MS = 60000;

/**
 * 기본 제품 페이지당 표시 수
 */
export const DEFAULT_PRODUCTS_PER_PAGE = 12;

/**
 * 기본 초기 병렬 처리 개수
 */
export const DEFAULT_INITIAL_CONCURRENCY = 5;

/**
 * 기본 재시도 병렬 처리 개수
 */
export const DEFAULT_RETRY_CONCURRENCY = 1;

/**
 * 기본 재시도 횟수
 */
export const DEFAULT_RETRY_COUNT = 3;

/**
 * 기본 캐시 TTL (밀리초) - 1시간
 */
export const DEFAULT_CACHE_TTL_MS = 3600000;
