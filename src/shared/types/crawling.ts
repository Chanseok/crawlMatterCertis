/**
 * 크롤링 관련 타입 정의
 * 크롤링 프로세스, 상태, 구성 등에 관련된 모든 타입들
 * 
 * Phase 1 Clean Code: 중복 타입 정의 제거 완료
 * 모든 타입은 루트 레벨 types.d.ts에서 가져옵니다.
 */

// 모든 크롤링 관련 타입을 루트 types.d.ts에서 re-export
export type {
    CrawlingStatus,
    CrawlingStage,
    CrawlingStageId,
    StageStatus,
    CrawlingProgress,
    StageProgress,
    CrawlingSessionProgress,
    BatchProgress,
    CrawlingError,
    CrawlerConfig,
    PageProcessingStatusValue,
    PageProcessingStatusItem
} from '../../../types.js';

// Import types for local use
import type {
    CrawlingStatus,
    CrawlingStage,
    CrawlingProgress,
    CrawlerConfig,
    PageProcessingStatusValue
} from '../../../types.js';

// Create alias for backward compatibility
export type CrawlingConfig = CrawlerConfig;

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
 * 페이지 처리 상태 (확장된 버전)
 */
export interface PageProcessingStatus {
    pageId: number;
    status: PageProcessingStatusValue;
    attempts: number;
    lastAttempt?: Date;
    error?: string;
    itemsCollected?: number;
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
    config: CrawlerConfig;
    progress: CrawlingProgress;
    statistics: CrawlingStatistics;
}
