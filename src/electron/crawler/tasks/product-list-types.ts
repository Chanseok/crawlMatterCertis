/**
 * product-list-types.ts
 * 제품 목록 수집 관련 타입 정의
 */

import type { PageProcessingStatusItem } from '../../../../types.js';
import type { CrawlError } from '../utils/types.js';

/**
 * 페이지 평가 함수에서 반환하는 원시 데이터 타입
 */
export interface RawProductData {
  url: string;
  manufacturer?: string;
  model?: string;
  certificateId?: string;
  siteIndexInPage: number; // DOM 순서 기반 인덱스
}

/**
 * 제품 목록 수집 진행 상황 콜백 타입
 */
export type ProductListProgressCallback = (
  processedSuccessfully: number, // Successfully completed pages
  totalPagesInStage: number, // Total pages specifically for this stage 1 collection
  stage1PageStatuses: PageProcessingStatusItem[],
  currentOverallRetryCountForStage: number, // Overall retries for stage 1
  stage1StartTime: number, // Start time of the current stage 1 processing
  isStageComplete?: boolean
) => void;

/**
 * 페이지 레인지 준비 결과 타입
 */
export interface PreparePageRangeResult {
  totalPages: number; // Site's total pages
  pageNumbersToCrawl: number[]; // DB pageIds to crawl
  lastPageProductCount: number;
}

/**
 * 초기 크롤 실행 결과 타입
 */
export interface InitialCrawlResult {
  incompletePages: number[];
  allPageErrors: Record<string, CrawlError[]>;
}

/**
 * 사이트 페이지 정보 타입
 */
export interface SitePageInfo {
  totalPages: number;
  lastPageProductCount: number;
}
