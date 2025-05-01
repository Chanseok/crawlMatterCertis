/**
 * concurrency.ts
 * 병렬 크롤링을 위한 동시성 관리 유틸리티
 */

import { ConcurrentTaskStatus } from './progress.js';
import { crawlerEvents } from './progress.js';

// 각 페이지별/상품별 작업 상태 관리용
export let concurrentTaskStates: Record<number, any> = {};
export let concurrentProductTaskStates: Record<string, any> = {};

/**
 * 병렬 크롤링을 위한 Promise Pool 유틸리티
 * 효율적인 병렬 처리를 위해 재귀 호출 대신 while 루프 사용
 */
export async function promisePool<T, U>(
    items: T[],
    worker: (item: T, signal: AbortSignal) => Promise<U>,
    concurrency: number,
    abortController: AbortController,
    shouldStopCrawling?: boolean
): Promise<U[]> {
    const results: U[] = [];
    let nextIndex = 0;
    const total = items.length;

    // 각 작업자는 독립적으로 작업을 처리하는 함수
    async function runWorker(): Promise<void> {
        // 처리할 항목이 남아있는 동안 계속 작업 수행
        while (nextIndex < total) {
            if (shouldStopCrawling || abortController.signal.aborted) {
                break;
            }

            const currentIndex = nextIndex++;
            try {
                results[currentIndex] = await worker(items[currentIndex], abortController.signal);
            } catch (error) {
                console.error(`Worker error processing index ${currentIndex}:`, error);
            }
        }
    }

    // concurrency 수만큼 작업자 생성 및 병렬 실행
    const workers = Array.from(
        { length: Math.min(concurrency, total) },
        () => runWorker()
    );

    // 모든 작업자가 작업을 마칠 때까지 대기
    await Promise.all(workers);

    return results;
}

/**
 * 크롤링 시 페이지 상태 업데이트 및 이벤트 발생
 */
export function updateTaskStatus(pageNumber: number, status: ConcurrentTaskStatus, error?: string): void {
    concurrentTaskStates[pageNumber] = { pageNumber, status, error };
    crawlerEvents.emit('crawlingTaskStatus', Object.values(concurrentTaskStates));
}

/**
 * 제품 상세 정보 크롤링 시 작업 상태 업데이트 및 이벤트 발생
 */
export function updateProductTaskStatus(url: string, status: ConcurrentTaskStatus, error?: string): void {
    const key = encodeURIComponent(url);
    concurrentProductTaskStates[key] = { url, status, error };
    crawlerEvents.emit('crawlingProductTaskStatus', Object.values(concurrentProductTaskStates));
}

/**
 * 작업 상태 초기화 함수
 */
export function initializeTaskStates(pageNumbers: number[]): void {
    for (const pageNumber of pageNumbers) {
        concurrentTaskStates[pageNumber] = { pageNumber, status: 'pending' };
    }
    crawlerEvents.emit('crawlingTaskStatus', Object.values(concurrentTaskStates));
}

/**
 * 제품 상세 정보 작업 상태 초기화 함수
 */
export function initializeProductTaskStates(products: { url: string }[]): void {
    for (const product of products) {
        const key = encodeURIComponent(product.url);
        concurrentProductTaskStates[key] = { url: product.url, status: 'pending' };
    }
    crawlerEvents.emit('crawlingProductTaskStatus', Object.values(concurrentProductTaskStates));
}

/**
 * 크롤링 상태 초기화
 */
export function initializeCrawlingState(): void {
    concurrentTaskStates = {};
    concurrentProductTaskStates = {};
}