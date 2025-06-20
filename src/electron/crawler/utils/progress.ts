/**
 * progress.ts
 * 크롤링 작업의 진행 상태를 관리하는 유틸리티
 */

import { EventEmitter } from 'events';
import type { CrawlingProgress, ConcurrentTaskStatus, PageProcessingStatusItem } from '../../../../types.js';
import type { RetryStatusInfo, RetryLogItem } from './types.js';

// 크롤링 이벤트 이미터
export const crawlerEvents = new EventEmitter();

// 전체 크롤링 시작 시간 추적
let globalCrawlingStartTime: number = 0;

/**
 * 전체 크롤링 시작 시간 설정
 */
export function setGlobalCrawlingStartTime(startTime: number): void {
    globalCrawlingStartTime = startTime;
}

/**
 * 전체 크롤링 시작 시간 조회
 */
export function getGlobalCrawlingStartTime(): number {
    return globalCrawlingStartTime;
}

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
    // 전역 크롤링 시작 시간이 설정되어 있으면 사용, 아니면 현재 시간 사용
    const startTime = globalCrawlingStartTime > 0 ? globalCrawlingStartTime : Date.now();
    
    const progress: CrawlingProgress = {
        // types.d.ts에서 필요한 필수 속성 추가
        current: 0,
        total: 0,
        status: 'initializing',
        currentPage: 0,
        totalPages: 0,
        processedItems: 0,
        totalItems: 0,
        startTime: startTime,
        estimatedEndTime: 0,
        newItems: 0,
        updatedItems: 0,
        percentage: 0,
        currentStep,
        currentStage, // 단계 정보 추가
        remainingTime: -1,
        elapsedTime: startTime === globalCrawlingStartTime ? 0 : Date.now() - startTime,
        message: `크롤링 초기화 중: ${currentStep}`, // 명확한 메시지 추가
        stage1PageStatuses: [] // Initialize with empty array
    };
    crawlerEvents.emit('crawlingProgress', progress);
    return progress;
}

/**
 * 1/2단계: 제품 목록 수집 상태 업데이트
 */
export async function updateProductListProgress(
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
    },
    batchInfo?: { // 배치 처리 정보 추가
        currentBatch: number,
        totalBatches: number,
        globalTotalPages?: number // 전체 크롤링 페이지 수 (모든 배치 포함)
    }
): Promise<void> {
    // 전체 크롤링 시간을 사용 (설정된 경우), 그렇지 않으면 전달받은 startTime 사용
    const actualStartTime = globalCrawlingStartTime > 0 ? globalCrawlingStartTime : startTime;
    
    const now = Date.now();
    const elapsedTime = now - actualStartTime; // 전체 크롤링 시작부터의 경과 시간
    // processedPages는 성공적으로 완료된 페이지 기준
    const percentage = totalPages > 0 ? (processedPages / totalPages) * 100 : 0;
    let remainingTime: number | undefined = undefined;
    let confidence: 'low' | 'medium' | 'high' = 'low';

    // Clean Architecture: 시간 예측 서비스 활용
    try {
        console.log('🔍 [Progress] TimeEstimationService 호출 시도:', {
            processedPages,
            totalPages,
            percentage,
            elapsedTime,
            currentRetryCount
        });

        const { timeEstimationService } = await import('../services/TimeEstimationService.js');
        const stageId = batchInfo ? `stage1_batch_${batchInfo.currentBatch}` : 'stage1_product_list';
        
        // Batch 모드일 때 global context 전달
        const globalContext = batchInfo ? {
            totalPages: batchInfo.globalTotalPages || (totalPages * batchInfo.totalBatches), // 정확한 전체 페이지 수 또는 추정치
            totalBatches: batchInfo.totalBatches,
            currentBatch: batchInfo.currentBatch
        } : undefined;
        
        const estimation = await timeEstimationService.updateEstimation(
            stageId,
            percentage,
            elapsedTime,
            currentRetryCount,
            totalPages, // 현재 배치 내 totalPages (기존 호환성)
            processedPages, // 현재 배치 내 processedPages (기존 호환성)
            globalContext
        );
        
        remainingTime = estimation.remainingTime.seconds * 1000; // ms로 변환
        confidence = estimation.confidence;

        console.log('✅ [Progress] TimeEstimationService 성공:', {
            remainingTimeMs: remainingTime,
            remainingTimeSeconds: estimation.remainingTime.seconds,
            confidence
        });
    } catch (error) {
        console.error('❌ [Progress] Clean Architecture 시간 예측 실패, 레거시 방식 사용:', error);
        
        // 레거시 백업: 크롤러에서 제공한 시간 추정치가 있으면 사용
        if (timeEstimate && timeEstimate.remainingTimeMs > 0) {
            remainingTime = timeEstimate.remainingTimeMs;
        } 
        // 없으면 기존 방식으로 계산 - 더 신뢰할 만한 조건 사용 (전체 크롤링 시간 기준)
        else if (processedPages > 0 && processedPages >= Math.max(1, totalPages * 0.02) && elapsedTime > 30000) { 
            // 최소 2% 이상 진행되고 30초 이상 경과한 경우에만 예측 (더 빠른 피드백)
            const avgTimePerPage = elapsedTime / processedPages;
            remainingTime = (totalPages - processedPages) * avgTimePerPage;
        }
        // 위 조건들도 만족하지 않으면 기본값 설정 (안전한 fallback)
        else {
            // 진행률 기반 동적 계산 - 더 보수적으로 설정
            if (percentage > 0) {
                const estimatedTotalTime = elapsedTime / (percentage / 100);
                remainingTime = Math.max(600000, estimatedTotalTime - elapsedTime); // 최소 10분
            } else {
                // 초기 단계에서는 페이지 수 기반 추정
                const estimatedTimePerPage = 30000; // 30초/페이지 보수적 추정
                remainingTime = Math.max(1200000, totalPages * estimatedTimePerPage); // 최소 20분
            }
            console.warn('🔄 [Progress] 모든 조건 실패, 보수적 기본값 사용:', {
                remainingTimeMs: remainingTime,
                remainingTimeSeconds: Math.floor(remainingTime / 1000),
                percentage,
                elapsedTime,
                totalPages
            });
        }
    }

    // 안전성 검사: remainingTime이 여전히 undefined이거나 0이면 기본값 설정
    if (remainingTime === undefined || remainingTime === null || remainingTime <= 0) {
        if (percentage > 0) {
            const estimatedTotalTime = elapsedTime / (percentage / 100);
            remainingTime = Math.max(600000, estimatedTotalTime - elapsedTime);
        } else {
            remainingTime = Math.max(1200000, totalPages * 30000); // 30초/페이지 * 페이지 수, 최소 20분
        }
        console.warn('🚨 [Progress] remainingTime이 invalid, 강화된 안전 기본값 설정:', {
            remainingTimeMs: remainingTime,
            remainingTimeSeconds: Math.floor(remainingTime / 1000),
            percentage,
            elapsedTime,
            totalPages
        });
    }

    let message = isCompleted 
        ? `제품 목록 페이지 수집 완료: ${totalPages}개 페이지 처리 완료`
        : `제품 목록 페이지 ${processedPages}/${totalPages} 처리 중 (${percentage.toFixed(1)}%)`;

    // 배치 처리 중인 경우 메시지에 배치 정보 추가
    if (batchInfo) {
        message = isCompleted 
            ? `배치 ${batchInfo.currentBatch}/${batchInfo.totalBatches} - 제품 목록 페이지 수집 완료: ${totalPages}개 페이지 처리 완료`
            : `배치 ${batchInfo.currentBatch}/${batchInfo.totalBatches} - 제품 목록 페이지 ${processedPages}/${totalPages} 처리 중 (${percentage.toFixed(1)}%)`;
    }

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
        remainingTime: isCompleted ? 0 : (remainingTime || 0),
        remainingTimeSeconds: isCompleted ? 0 : (remainingTime ? Math.floor(remainingTime / 1000) : 0),
        confidence, // Clean Architecture: 신뢰도 정보 추가
        elapsedTime, // 전체 크롤링 시작부터의 경과 시간
        startTime: actualStartTime, // 전체 크롤링 시작 시간
        estimatedEndTime: remainingTime && !isCompleted ? now + remainingTime : (isCompleted ? now : 0),
        newItems: 0, 
        updatedItems: 0,
        message: message,
        retryCount: currentRetryCount,
        maxRetries: maxConfigRetries,
        stage1PageStatuses: stage1PageStatuses,
        // 배치 처리 정보 추가
        ...(batchInfo && {
            currentBatch: batchInfo.currentBatch,
            totalBatches: batchInfo.totalBatches
        })
    };

    crawlerEvents.emit('crawlingProgress', progressData);
}

/**
 * 2/2단계: 제품 상세 정보 수집 상태 업데이트
 * 
 * 2025-05-24 수정: UI 표시 문제 해결
 * - 문제: UI에 표시되는 총 제품 수와 처리된 제품 수의 불일치
 * - 해결: 명시적으로 totalItems 값을 항상 전달하고, 일관된 값 사용 보장
 * 
 * Clean Architecture 통합: 시간 예측 서비스 활용
 */
export async function updateProductDetailProgress(
    processedItems: number,
    totalItems: number,
    startTime: number,
    isCompleted: boolean = false,
    newItems: number = 0,
    updatedItems: number = 0,
    currentBatch?: number,
    totalBatches?: number,
    retryCount: number = 0 // 재시도 횟수 파라미터 추가
): Promise<void> {
    // 전체 크롤링 시간을 사용 (설정된 경우), 그렇지 않으면 전달받은 startTime 사용
    const actualStartTime = globalCrawlingStartTime > 0 ? globalCrawlingStartTime : startTime;
    
    // 안전 검사: 음수 값이나 비정상적인 값을 방지
    if (processedItems < 0) processedItems = 0;
    if (totalItems < 0) totalItems = 0;
    
    const now = Date.now();
    const elapsedTime = now - actualStartTime; // 전체 크롤링 시작부터의 경과 시간
    
    // 0으로 나누기 방지를 위한 안전 검사
    const safeTotal = Math.max(totalItems, 1);
    const percentage = (processedItems / safeTotal) * 100;
    
    // 비정상적인 비율 방지
    const safePercentage = Math.min(Math.max(percentage, 0), 100);
    
    let remainingTime: number | undefined = undefined;
    let confidence: 'low' | 'medium' | 'high' = 'low';

    // Clean Architecture: 시간 예측 서비스 활용
    try {
        const { timeEstimationService } = await import('../services/TimeEstimationService.js');
        const stageId = currentBatch ? `stage3_batch_${currentBatch}` : 'PRODUCT_DETAIL'; // stage3 또는 PRODUCT_DETAIL 사용
        
        // Batch 모드일 때 global context 전달 (stage 3에서는 제품 수 기반)
        const globalContext = (currentBatch && totalBatches) ? {
            totalPages: totalItems, // stage 3에서는 totalItems가 전체 제품 수
            totalBatches: totalBatches,
            currentBatch: currentBatch
        } : undefined;
        
        const estimation = await timeEstimationService.updateEstimation(
            stageId,
            safePercentage,
            elapsedTime,
            retryCount, // 3단계에서도 재시도 횟수 전달
            totalItems,
            processedItems,
            globalContext
        );
        
        remainingTime = estimation.remainingTime.seconds * 1000; // ms로 변환
        confidence = estimation.confidence;
    } catch (error) {
        console.warn('[Progress] Clean Architecture 시간 예측 실패, 강화된 레거시 방식 사용:', error);
        
        // 강화된 fallback 로직 - 항상 동적 계산 제공
        if (processedItems >= Math.max(1, totalItems * 0.005) && processedItems > 0 && elapsedTime > 5000) {
            // 최소 0.5% 이상 진행되고 5초 이상 경과한 경우 예측 (훨씬 더 빠른 피드백)
            const avgTimePerItem = elapsedTime / processedItems;
            remainingTime = (totalItems - processedItems) * avgTimePerItem * 1.1; // 10% 여유시간
        } else if (safePercentage > 0) {
            // 진행률 기반 동적 계산
            const estimatedTotalTime = elapsedTime / (safePercentage / 100);
            remainingTime = Math.max(300000, (estimatedTotalTime - elapsedTime) * 1.1); // 최소 5분, 10% 여유시간
        } else {
            // 초기 단계에서는 아이템 수 기반 추정
            const estimatedTimePerItem = 6000; // 6초/아이템 보수적 추정
            remainingTime = Math.max(600000, totalItems * estimatedTimePerItem); // 최소 10분
        }
        
        console.warn('🔄 [Progress] 강화된 fallback 시간 예측 사용 (Stage 3):', {
            remainingTimeMs: remainingTime,
            remainingTimeSeconds: Math.floor(remainingTime / 1000),
            percentage: safePercentage,
            elapsedTime,
            totalItems,
            processedItems
        });
    }

    // 안전성 검사: remainingTime이 여전히 undefined이거나 0이면 기본값 설정
    if (remainingTime === undefined || remainingTime === null || remainingTime <= 0) {
        if (safePercentage > 0) {
            const estimatedTotalTime = elapsedTime / (safePercentage / 100);
            remainingTime = Math.max(600000, (estimatedTotalTime - elapsedTime) * 1.1); // 최소 10분, 10% 여유시간
        } else {
            remainingTime = Math.max(900000, totalItems * 8000); // 8초/아이템 * 아이템 수, 최소 15분
        }
        console.warn('🚨 [Progress] remainingTime이 invalid, 강화된 안전 기본값 설정 (Stage 3):', {
            remainingTimeMs: remainingTime,
            remainingTimeSeconds: Math.floor(remainingTime / 1000),
            percentage: safePercentage,
            elapsedTime,
            totalItems
        });
    }

    const message = isCompleted 
        ? `크롤링 완료: ${totalItems}개 제품 처리 완료 (신규: ${newItems}, 업데이트: ${updatedItems})`
        : `제품 상세정보 ${processedItems}/${totalItems} 처리 중 (${safePercentage.toFixed(1)}%)`;

    // 이벤트 발행 전에 로그로 확인
    console.log(`[Progress] Emitting detail progress with total crawling time: ${processedItems}/${totalItems}, ${safePercentage.toFixed(1)}%, elapsed: ${elapsedTime}ms, new: ${newItems}, updated: ${updatedItems}`);
    
    crawlerEvents.emit('crawlingProgress', {
        status: isCompleted ? 'completed' : 'running',
        currentPage: processedItems, // 실제 처리된 항목 수
        totalPages: totalItems,      // 총 항목 수 (일관성 유지)
        processedItems,              // 처리된 항목 수
        totalItems,                  // 총 항목 수 (일관성 유지)
        percentage: safePercentage,  // 계산된 안전한 퍼센트 값
        currentStep: CRAWLING_PHASES.PRODUCT_DETAIL,
        currentStage: CRAWLING_STAGE.PRODUCT_DETAIL, // 단계 정보
        remainingTime: isCompleted ? 0 : (remainingTime || 0),
        remainingTimeSeconds: isCompleted ? 0 : (remainingTime ? Math.floor(remainingTime / 1000) : 0),
        confidence, // Clean Architecture: 신뢰도 정보 추가
        elapsedTime, // 전체 크롤링 시작부터의 경과 시간
        startTime: actualStartTime, // 전체 크롤링 시작 시간
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

/**
 * 크롤링 진행 상태 데이터 검증 및 정규화
 */
export function validateAndNormalizeProgress(progress: Partial<CrawlingProgress>): CrawlingProgress {
    return {
        current: progress.current ?? 0,
        total: progress.total ?? 0,
        percentage: progress.percentage ?? 0,
        status: progress.status ?? 'idle',
        currentStep: progress.currentStep ?? '대기 중...',
        elapsedTime: progress.elapsedTime ?? 0,
        startTime: progress.startTime ?? Date.now(),
        message: progress.message ?? '대기 중...',
        currentStage: progress.currentStage ?? 0,
    };
}

/**
 * 안전한 크롤링 진행 상태 발송
 */
export function emitSafeProgress(progress: Partial<CrawlingProgress>): void {
    const normalizedProgress = validateAndNormalizeProgress(progress);
    console.log(`[Progress] Emitting safe progress:`, {
        stage: normalizedProgress.currentStage,
        step: normalizedProgress.currentStep,
        status: normalizedProgress.status,
        progress: `${normalizedProgress.current}/${normalizedProgress.total}`
    });
    crawlerEvents.emit('crawlingProgress', normalizedProgress);
}