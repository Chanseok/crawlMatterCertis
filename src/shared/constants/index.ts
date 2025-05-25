/**
 * 애플리케이션 전체에서 사용되는 상수 정의
 */

// 크롤링 관련 상수
export const CRAWLING_CONSTANTS = {
  DEFAULT_PAGE_LIMIT: 50,
  DEFAULT_RETRY_COUNT: 3,
  DEFAULT_DELAY_BETWEEN_REQUESTS: 1000,
  DEFAULT_BATCH_SIZE: 10,
  MAX_CONCURRENT_REQUESTS: 5,
  REQUEST_TIMEOUT: 30000,
} as const;

// UI 관련 상수
export const UI_CONSTANTS = {
  NOTIFICATION_DURATION: 5000,
  MODAL_ANIMATION_DURATION: 300,
  DEBOUNCE_DELAY: 300,
  PAGINATION_SIZES: [10, 25, 50, 100] as const,
  TABLE_ROW_HEIGHT: 48,
} as const;

// 데이터베이스 관련 상수
export const DATABASE_CONSTANTS = {
  DEFAULT_PAGE_SIZE: 25,
  MAX_PAGE_SIZE: 100,
  SEARCH_MIN_LENGTH: 2,
  CACHE_EXPIRY_TIME: 5 * 60 * 1000, // 5분
} as const;

// 파일 관련 상수
export const FILE_CONSTANTS = {
  MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
  SUPPORTED_EXPORT_FORMATS: ['json', 'csv', 'xlsx'] as const,
  DEFAULT_EXPORT_FORMAT: 'json' as const,
} as const;

// 날짜 포맷 상수
export const DATE_FORMATS = {
  DISPLAY: 'YYYY-MM-DD HH:mm:ss',
  FILE_NAME: 'YYYYMMDD_HHmmss',
  ISO: 'YYYY-MM-DDTHH:mm:ssZ',
} as const;

// 로그 레벨
export const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
} as const;

// 상태 코드
export const STATUS_CODES = {
  SUCCESS: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
} as const;

// 테마 관련 상수
export const THEME_CONSTANTS = {
  STORAGE_KEY: 'app-theme',
  DEFAULT_THEME: 'system' as const,
  AVAILABLE_THEMES: ['light', 'dark', 'system'] as const,
} as const;
