/**
 * types.ts
 * 크롤러에서 사용되는 타입 정의
 */

// types.d.ts에서 공용 타입 import
import type {
  Product,
  MatterProduct,
  CrawlingProgress,
  CrawlingStatus,
  CrawlerConfig,
  PageProcessingStatusItem
} from '../../../../types.d.ts';

/**
 * 크롤링 단계 결과 타입
 */
export interface CrawlResult {
    pageNumber: number;
    products: Product[];
    error?: CrawlError; // Changed from string | undefined
    isComplete: boolean;
}

export interface DetailCrawlResult {
    url: string;
    product: MatterProduct | null;
    error?: string;
}

/**
 * 실패 보고서 타입
 */
export interface FailedPageReport {
    pageNumber: number;
    errors: string[];
}

export interface FailedProductReport {
    url: string;
    errors: string[];
}

/**
 * 크롤링 상태 요약
 */
export interface CrawlingSummary {
    dbLastUpdated: string | null;
    dbProductCount: number;
    siteTotalPages: number;
    siteProductCount: number;
    diff: number;
    needCrawling: boolean;
    crawlingRange: { startPage: number; endPage: number };
    error?: string;
    
    // 페이지 범위 선택 기능(CRAWL-RANGE-001)에 필요한 추가 속성
    selectedPageCount?: number;        // 선택된 페이지 수
    actualTargetPageCountForStage1?: number; // 1단계 실제 크롤링 대상 페이지 수 (추가)
    estimatedProductCount?: number;    // 예상 제품 수집 개수
    estimatedTotalTime?: number;       // 예상 소요 시간 (밀리초)
    userPageLimit?: number;            // 사용자 지정 페이지 제한
    lastPageProductCount?: number;     // 마지막 페이지의 제품 수 추가
}

/**
 * 크롤링 결과 보고
 */
export interface CrawlingResultReport {
    success: boolean;
    count: number;
    products: Product[] | MatterProduct[];
    failedReport: FailedPageReport[] | FailedProductReport[];
}

/**
 * 재시도 상태 정보
 */
export interface RetryStatusInfo {
    stage: string;                // 현재 단계 (productList, productDetail)
    currentAttempt?: number;      // 현재 시도 회차
    maxAttempt?: number;          // 최대 시도 회차
    remainingItems?: number;      // 남은 재시도 항목 수
    totalItems?: number;          // 총 재시도 항목 수
    startTime?: number;           // 재시도 시작 시간
    itemIds?: string[];           // 재시도 대상 항목 ID 목록
}

/**
 * 재시도 로그 항목 타입
 */
export interface RetryLogItem {
    stage: string;                // 단계명 (productList, productDetail)
    itemId: string;               // 항목 ID (페이지 번호 또는 제품 URL)
    errorMessage: string;         // 오류 메시지
    attempt: number;              // 시도 회차
    timestamp: number;            // 기록 시간
}

/**
 * 구조화된 크롤링 오류 타입
 */
export interface CrawlError {
  type: 'Timeout' | 'Abort' | 'Navigation' | 'Extraction' | 'Initialization' | 'Generic';
  message: string;
  pageNumber?: number;
  attempt?: number;
  originalError?: any; // Can store the original error object if needed
}

// (이 파일 내에서 CrawlingProgress, CrawlingStatus, CrawlerConfig 등은 직접 정의하지 않고 반드시 import만 사용)