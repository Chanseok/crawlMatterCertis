/**
 * 크롤링 관련 타입 정의
 * 크롤링 프로세스, 상태, 구성 등에 관련된 모든 타입들
 */

import { ProgressInfo } from './common';

/**
 * 크롤링 상태를 나타내는 타입
 */
export type CrawlingStatus = 
    | 'idle' 
    | 'running' 
    | 'paused' 
    | 'completed' 
    | 'error' 
    | 'initializing' 
    | 'stopped' 
    | 'completed_stage_1';

/**
 * 크롤링 단계를 세부적으로 나타내는 타입
 */
export type CrawlingStage = 
    | 'idle' 
    | 'productList:init' 
    | 'productList:collecting' 
    | 'productList:retrying' 
    | 'productList:complete'
    | 'validation:init'
    | 'validation:processing'
    | 'validation:complete'
    | 'productDetail:init' 
    | 'productDetail:collecting' 
    | 'productDetail:retrying' 
    | 'productDetail:complete'
    | 'complete' 
    | 'error';

/**
 * 개별 페이지 처리 상태
 */
export type PageProcessingStatusValue = 'waiting' | 'attempting' | 'success' | 'failed' | 'incomplete';

/**
 * 크롤링 진행 상황
 */
export interface CrawlingProgress extends ProgressInfo {
  currentStage: 1 | 2;
  currentPage: number;
  totalPages: number;
  processedItems: number;
  totalItems: number;
  newItems?: number;
  updatedItems?: number;
  errorCount: number;
  estimatedTimeRemaining?: number;
}

/**
 * 크롤링 설정
 */
export interface CrawlingConfig {
  pageLimit: number;
  retryCount: number;
  delayBetweenRequests: number;
  batchSize: number;
  enableRetry?: boolean;
  retryDelay?: number;
}

/**
 * 크롤링 세션 정보
 */
export interface CrawlingSession {
  id: string;
  status: CrawlingStatus;
  stage: CrawlingStage;
  startTime: Date;
  endTime?: Date;
  config: CrawlingConfig;
  progress: CrawlingProgress;
  statistics: CrawlingStatistics;
}

/**
 * 크롤링 통계
 */
export interface CrawlingStatistics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  bytesDownloaded: number;
  pagesProcessed: number;
  productsCollected: number;
}

/**
 * 페이지 처리 상태
 */
export interface PageProcessingStatus {
  pageId: number;
  status: PageProcessingStatusValue;
  attempts: number;
  lastAttempt?: Date;
  error?: string;
  itemsCollected?: number;
}
