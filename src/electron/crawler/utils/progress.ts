/**
 * progress.ts
 * 크롤링 작업의 진행 상태를 관리하는 유틸리티
 */

import { EventEmitter } from 'events';
import type { CrawlingProgress, ConcurrentTaskStatus, PageProcessingStatusItem } from '../../../../types.js';
import type { RetryStatusInfo, RetryLogItem } from './types.js';

// 크롤링 이벤트 이미터
export const crawlerEvents = new EventEmitter();

// 크롤링 단계 상수
export const CRAWLING_PHASES = {
    PRODUCT_LIST: '제품 목록 수집',
    PRODUCT_DETAIL: '제품 상세 정보 수집'
};

// 크롤링 단계 상수 - 숫자 값 (순차 진행: 1→2→3)
export const CRAWLING_STAGE = {
    INIT: 0,
    PRODUCT_LIST: 1,
    PRODUCT_VALIDATION: 2,  // 기존 1.5 단계를 2로 변경
    PRODUCT_DETAIL: 3,      // 기존 2 단계를 3으로 변경
    COMPLETE: 4
};

// 동시 작업 상태는 공유 타입에서 사용
export interface ConcurrentCrawlingTask {
    pageNumber: number;
    status: ConcurrentTaskStatus;
    error?: string;
}

// 재시도 진행 상태를 위한 인터페이스 (UI-STATUS-001)
export interface RetryStatus {
    taskId: string;                 // 작업 식별자 (list-retry, detail-retry 등)
    stage: 'productList' | 'productDetail'; // 작업 단계
    currentAttempt: number;         // 현재 재시도 횟수
    maxAttempt: number;             // 설정된 최대 재시도 횟수
    remainingItems: number;         // 남은 항목 수 
    totalItems: number;             // 총 재시도 항목 수
    startTime: number;              // 재시도 시작 시간
    itemIds: string[];              // 재시도 대상 항목들 (페이지 번호 또는 URL)
}

// 재시도 이벤트 추적을 위한 상태 객체
export const retryStatusTracking: Record<string, RetryStatus> = {
    'list-retry': {
        taskId: 'list-retry',
        stage: 'productList',
        currentAttempt: 0,
        maxAttempt: 0,
        remainingItems: 0,
        totalItems: 0,
        startTime: 0,
        itemIds: []
    },
    'detail-retry': {
        taskId: 'detail-retry',
        stage: 'productDetail',
        currentAttempt: 0,
        maxAttempt: 0,
        remainingItems: 0,
        totalItems: 0,
        startTime: 0,
        itemIds: []
    }
};

/**
 * 재시도 상태 업데이트 함수 (UI-STATUS-001)
 */
export function updateRetryStatus(
    taskId: string,
    updates: Partial<RetryStatusInfo>
): void {
    // 기존 상태가 없으면 기본값으로 초기화
    if (!retryStatusTracking[taskId]) {
        retryStatusTracking[taskId] = {
            taskId,
            stage: updates.stage as 'productList' | 'productDetail' || 'productList',
            currentAttempt: updates.currentAttempt || 0,
            maxAttempt: updates.maxAttempt || 0,
            remainingItems: updates.remainingItems || 0,
            totalItems: updates.totalItems || 0,
            startTime: updates.startTime || Date.now(),
            itemIds: updates.itemIds || []
        };
    } else {
        // 상태 업데이트
        if (updates.stage) retryStatusTracking[taskId].stage = updates.stage as 'productList' | 'productDetail';
        if (updates.currentAttempt !== undefined) retryStatusTracking[taskId].currentAttempt = updates.currentAttempt;
        if (updates.maxAttempt !== undefined) retryStatusTracking[taskId].maxAttempt = updates.maxAttempt;
        if (updates.remainingItems !== undefined) retryStatusTracking[taskId].remainingItems = updates.remainingItems;
        if (updates.totalItems !== undefined) retryStatusTracking[taskId].totalItems = updates.totalItems;
        if (updates.startTime !== undefined) retryStatusTracking[taskId].startTime = updates.startTime;
        if (updates.itemIds !== undefined) retryStatusTracking[taskId].itemIds = [...updates.itemIds];
    }
    
    // 재시도 진행 상태 이벤트 발송
    crawlerEvents.emit('retryStatusUpdate', {...retryStatusTracking[taskId]});
}

/**
 * 오류 정보 로깅 및 알림 함수 (UI-STATUS-001)
 */
export function logRetryError(
    stage: string,
    itemId: string,
    errorMessage: string,
    attempt: number
): void {
    const timestamp = Date.now();
    const errorInfo: RetryLogItem = {
        stage,
        itemId,
        errorMessage,
        attempt,
        timestamp
    };
    
    // 오류 로그 이벤트 발송
    crawlerEvents.emit('retryErrorLogged', errorInfo);
    
    // 콘솔에 로깅
    console.error(`[RETRY][${stage}] 재시도 ${attempt}회차 실패 - ${itemId}: ${errorMessage}`);
}

/**
 * 크롤링 진행 상태 초기화 함수
 * @param currentStep 현재 크롤링 단계 설명
 * @param currentStage 현재 크롤링 단계 번호 (1=목록 수집, 2=상세 수집)
 */
export function initializeCrawlingProgress(currentStep: string, currentStage: number = CRAWLING_STAGE.INIT): CrawlingProgress {
    const progress: CrawlingProgress = {
        // types.d.ts에서 필요한 필수 속성 추가
        current: 0,
        total: 0,
        status: 'initializing',
        currentPage: 0,
        totalPages: 0,
        processedItems: 0,
        totalItems: 0,
        startTime: Date.now(),
        estimatedEndTime: 0,
        newItems: 0,
        updatedItems: 0,
        percentage: 0,
        currentStep,
        currentStage, // 단계 정보 추가
        remainingTime: -1,
        elapsedTime: 0,
        message: `크롤링 초기화 중: ${currentStep}`, // 명확한 메시지 추가
        stage1PageStatuses: [] // Initialize with empty array
    };
    crawlerEvents.emit('crawlingProgress', progress);
    return progress;
}

/**
 * 1/2단계: 제품 목록 수집 상태 업데이트
 */
export function updateProductListProgress(
    processedPages: number, // 성공적으로 완료된 페이지 수
    totalPages: number,     // 1단계의 총 페이지 수
    startTime: number,      // 1단계 시작 시간
    stage1PageStatuses: PageProcessingStatusItem[], // 각 페이지의 현재 상태
    currentRetryCount: number, // 현재까지의 총 재시도 횟수 (1단계)
    maxConfigRetries: number, // 설정된 최대 재시도 횟수 (1단계)
    isCompleted: boolean = false,
    timeEstimate?: { // 추가된 시간 예측 정보
        estimatedTotalTimeMs: number, // 예상 총 소요 시간
        remainingTimeMs: number // 예상 남은 시간
    }
): void {
    const now = Date.now();
    const elapsedTime = now - startTime;
    // processedPages는 성공적으로 완료된 페이지 기준
    const percentage = totalPages > 0 ? (processedPages / totalPages) * 100 : 0;
    let remainingTime: number | undefined = undefined;

    // 크롤러에서 제공한 시간 추정치가 있으면 사용
    if (timeEstimate && timeEstimate.remainingTimeMs > 0) {
        remainingTime = timeEstimate.remainingTimeMs;
    } 
    // 없으면 기존 방식으로 계산
    else if (processedPages > 0 && processedPages > totalPages * 0.1) { // 10% 이상 진행 및 1페이지 이상 완료 시
        const avgTimePerPage = elapsedTime / processedPages;
        remainingTime = (totalPages - processedPages) * avgTimePerPage;
    }

    const message = isCompleted 
        ? `1단계 완료: ${totalPages}개 제품 목록 페이지 수집 완료`
        : `1단계: 제품 목록 페이지 ${processedPages}/${totalPages} 처리 중 (${percentage.toFixed(1)}%)`;

    const progressData: CrawlingProgress = {
        current: processedPages, // Overall progress current value for stage 1
        total: totalPages,       // Overall progress total value for stage 1
        status: isCompleted ? 'completed_stage_1' : 'running',
        currentPage: processedPages, // 성공한 페이지 수
        totalPages,                  // 전체 대상 페이지 수
        processedItems: processedPages, 
        totalItems: totalPages,
        percentage,
        currentStep: CRAWLING_PHASES.PRODUCT_LIST,
        currentStage: CRAWLING_STAGE.PRODUCT_LIST,
        remainingTime: isCompleted ? 0 : remainingTime,
        elapsedTime,
        startTime,
        estimatedEndTime: remainingTime && !isCompleted ? now + remainingTime : (isCompleted ? now : 0),
        newItems: 0, 
        updatedItems: 0,
        message: message,
        retryCount: currentRetryCount,
        maxRetries: maxConfigRetries,
        stage1PageStatuses: stage1PageStatuses
    };

    crawlerEvents.emit('crawlingProgress', progressData);
}

/**
 * 2/2단계: 제품 상세 정보 수집 상태 업데이트
 * 
 * 2025-05-24 수정: UI 표시 문제 해결
 * - 문제: UI에 표시되는 총 제품 수와 처리된 제품 수의 불일치
 * - 해결: 명시적으로 totalItems 값을 항상 전달하고, 일관된 값 사용 보장
 */
export function updateProductDetailProgress(
    processedItems: number,
    totalItems: number,
    startTime: number,
    isCompleted: boolean = false,
    newItems: number = 0,
    updatedItems: number = 0,
    currentBatch?: number,
    totalBatches?: number
): void {
    // 안전 검사: 음수 값이나 비정상적인 값을 방지
    if (processedItems < 0) processedItems = 0;
    if (totalItems < 0) totalItems = 0;
    
    const now = Date.now();
    const elapsedTime = now - startTime;
    
    // 0으로 나누기 방지를 위한 안전 검사
    const safeTotal = Math.max(totalItems, 1);
    const percentage = (processedItems / safeTotal) * 100;
    
    // 비정상적인 비율 방지
    const safePercentage = Math.min(Math.max(percentage, 0), 100);
    
    let remainingTime: number | undefined = undefined;

    // 10% 이상 진행된 경우에만 남은 시간 예측
    if (processedItems > totalItems * 0.1 && processedItems > 0) {
        const avgTimePerItem = elapsedTime / processedItems;
        remainingTime = (totalItems - processedItems) * avgTimePerItem;
    }

    const message = isCompleted 
        ? `2단계 완료: ${totalItems}개 제품 상세정보 수집 완료 (신규: ${newItems}, 업데이트: ${updatedItems})`
        : `2단계: 제품 상세정보 ${processedItems}/${totalItems} 처리 중 (${safePercentage.toFixed(1)}%)`;

    // 이벤트 발행 전에 로그로 확인
    console.log(`[Progress] Emitting detail progress: ${processedItems}/${totalItems}, ${safePercentage.toFixed(1)}%, new: ${newItems}, updated: ${updatedItems}`);
    
    crawlerEvents.emit('crawlingProgress', {
        status: isCompleted ? 'completed' : 'running',
        currentPage: processedItems, // 실제 처리된 항목 수
        totalPages: totalItems,      // 총 항목 수 (일관성 유지)
        processedItems,              // 처리된 항목 수
        totalItems,                  // 총 항목 수 (일관성 유지)
        percentage: safePercentage,  // 계산된 안전한 퍼센트 값
        currentStep: CRAWLING_PHASES.PRODUCT_DETAIL,
        currentStage: CRAWLING_STAGE.PRODUCT_DETAIL, // 단계 정보
        remainingTime: isCompleted ? 0 : remainingTime,
        elapsedTime,
        startTime,
        estimatedEndTime: remainingTime && !isCompleted ? now + remainingTime : (isCompleted ? now : 0),
        newItems,
        updatedItems,
        currentBatch,
        totalBatches,
        message: message // 명확한 메시지
    });
}

/**
 * 진행 상황 업데이트 (기존 함수 유지)
 * @deprecated 구체적인 단계별 업데이트 함수 사용 권장
 */
export function updateCrawlingProgress(
    processedItems: number, 
    totalItems: number, 
    startTime: number, 
    isCompleted: boolean = false
): void {
    const now = Date.now();
    const elapsedTime = now - startTime;
    const percentage = (processedItems / totalItems) * 100;
    let remainingTime: number | undefined = undefined;

    // 10% 이상 진행된 경우에만 남은 시간 예측
    if (processedItems > totalItems * 0.1) {
        const avgTimePerItem = elapsedTime / processedItems;
        remainingTime = (totalItems - processedItems) * avgTimePerItem;
    }

    crawlerEvents.emit('crawlingProgress', {
        status: isCompleted ? 'completed' : 'running',
        currentPage: processedItems,
        totalPages: totalItems,
        processedItems,
        totalItems,
        percentage,
        currentStep: CRAWLING_PHASES.PRODUCT_DETAIL,
        currentStage: CRAWLING_STAGE.PRODUCT_DETAIL, // 단계 정보 추가
        remainingTime: isCompleted ? 0 : remainingTime,
        elapsedTime,
        startTime,
        estimatedEndTime: remainingTime ? now + remainingTime : 0,
        newItems: processedItems,
        updatedItems: 0,
        message: isCompleted 
            ? `크롤링 완료: 총 ${totalItems}개 항목 처리됨` 
            : `크롤링 진행 중: ${processedItems}/${totalItems} 항목 처리 (${percentage.toFixed(1)}%)`
    });
}

/**
 * 크롤링 오류 처리 함수
 */
export function handleCrawlingError(error: unknown): void {
    console.error('[Crawler] Error during crawling:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    crawlerEvents.emit('crawlingError', {
        message: 'Crawling failed',
        details: errorMessage
    });
}