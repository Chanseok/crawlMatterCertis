/**
 * progress.ts
 * 크롤링 작업의 진행 상태를 관리하는 유틸리티
 */

import { EventEmitter } from 'events';
import type { CrawlingProgress } from '../../../ui/types.js';

// 크롤링 이벤트 이미터
export const crawlerEvents = new EventEmitter();

// 크롤링 단계 상수
export const CRAWLING_PHASES = {
    PRODUCT_LIST: '제품 목록 수집',
    PRODUCT_DETAIL: '제품 상세 정보 수집'
};

// 동시 작업 상태 타입 정의
export type ConcurrentTaskStatus = 'pending' | 'running' | 'success' | 'error' | 'stopped';

export interface ConcurrentCrawlingTask {
    pageNumber: number;
    status: ConcurrentTaskStatus;
    error?: string;
}

/**
 * 크롤링 진행 상태 초기화 함수
 */
export function initializeCrawlingProgress(currentStep: string): CrawlingProgress {
    const progress: CrawlingProgress = {
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
        remainingTime: undefined,
        elapsedTime: 0
    };
    crawlerEvents.emit('crawlingProgress', progress);
    return progress;
}

/**
 * 진행 상황 업데이트
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
        remainingTime: isCompleted ? 0 : remainingTime,
        elapsedTime,
        startTime,
        estimatedEndTime: remainingTime ? now + remainingTime : 0,
        newItems: processedItems,
        updatedItems: 0
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