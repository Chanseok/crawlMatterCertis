/**
 * concurrency.ts
 * 병렬 크롤링을 위한 동시성 관리 유틸리티
 */
import type { ConcurrentTaskStatus } from '../../../../types.js';
import { crawlerEvents } from './progress.js';

// 각 페이지별/상품별 작업 상태 관리용
export let concurrentTaskStates: Record<number, any> = {};
export let concurrentProductTaskStates: Record<string, any> = {};

/**
 * 병렬 크롤링을 위한 Promise Pool 유틸리티
 * 효율적인 병렬 처리를 위해 재귀 호출 대신 while 루프 사용
 * 실패율을 모니터링하여 동적으로 동시성 조절 기능 추가
 */
export async function promisePool<T, U>(
    items: T[],
    worker: (item: T, signal: AbortSignal) => Promise<U>,
    initialConcurrency: number,
    abortController: AbortController,
    shouldStopCrawling?: boolean,
    options?: {
        adaptiveConcurrency?: boolean;
        errorThreshold?: number;  // 동시성을 줄이는 에러 비율 임계값 (기본: 0.3 = 30%)
        minConcurrency?: number;  // 최소 동시성 (기본값: 1)
        successWindowSize?: number; // 성공/실패 기록을 유지할 윈도우 크기 (기본값: 10)
    }
): Promise<U[]> {
    const results: U[] = [];
    let nextIndex = 0;
    const total = items.length;
    
    // 적응형 동시성 설정
    const useAdaptiveConcurrency = options?.adaptiveConcurrency ?? false;
    const errorThreshold = options?.errorThreshold ?? 0.3; // 30%
    const minConcurrency = options?.minConcurrency ?? 1;
    const successWindowSize = options?.successWindowSize ?? 10;
    
    // 성공/실패 기록을 위한 슬라이딩 윈도우
    const recentResults: boolean[] = [];
    let currentConcurrency = initialConcurrency;
    
    // 적응형 동시성 조절 함수
    function adjustConcurrency(success: boolean): void {
        if (!useAdaptiveConcurrency) return;
        
        // 가장 최근 결과 추가 및 윈도우 크기 유지
        recentResults.push(success);
        if (recentResults.length > successWindowSize) {
            recentResults.shift();
        }
        
        // 충분한 샘플이 수집된 경우에만 동시성 조절
        if (recentResults.length >= Math.min(5, successWindowSize)) {
            const failures = recentResults.filter(r => !r).length;
            const failureRate = failures / recentResults.length;
            
            if (failureRate >= errorThreshold) {
                // 실패율이 높으면 동시성 감소
                const newConcurrency = Math.max(minConcurrency, currentConcurrency - 1);
                if (newConcurrency !== currentConcurrency) {
                    console.log(`[AdaptiveConcurrency] Reducing concurrency from ${currentConcurrency} to ${newConcurrency} (failure rate: ${(failureRate * 100).toFixed(1)}%)`);
                    currentConcurrency = newConcurrency;
                }
            } else if (failureRate < errorThreshold / 2 && currentConcurrency < initialConcurrency) {
                // 실패율이 낮고 초기값보다 작은 경우 동시성 증가
                const newConcurrency = Math.min(initialConcurrency, currentConcurrency + 1);
                console.log(`[AdaptiveConcurrency] Increasing concurrency from ${currentConcurrency} to ${newConcurrency} (failure rate: ${(failureRate * 100).toFixed(1)}%)`);
                currentConcurrency = newConcurrency;
            }
        }
    }

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
                adjustConcurrency(true); // 성공
            } catch (error) {
                console.error(`Worker error processing index ${currentIndex}:`, error);
                adjustConcurrency(false); // 실패
            }
        }
    }

    // 적응형 동시성을 고려하여 작업자 생성 및 병렬 실행
    let activeWorkers = Math.min(currentConcurrency, total);
    const workers = Array.from(
        { length: activeWorkers }, 
        () => runWorker()
    );

    // 모든 작업자가 작업을 마칠 때까지 대기
    await Promise.all(workers);

    return results;
}

/**
 * 크롤링 시 페이지 상태 업데이트 및 이벤트 발생
 * 
 * 작업 상태가 'success'이면 이후에 다른 상태로 변경되지 않도록 처리
 * (일단 성공한 페이지는 성공 상태를 유지해야 UI에서 성공 페이지 수가 감소하지 않음)
 */
export function updateTaskStatus(pageNumber: number, status: ConcurrentTaskStatus, error?: string): void {
    const existingTask = concurrentTaskStates[pageNumber];
    
    // 이미 성공 상태인 작업은 다시 다른 상태로 변경되지 않도록 처리
    if (existingTask && existingTask.status === 'success' && status !== 'success') {
        console.log(`[updateTaskStatus] 페이지 ${pageNumber}는 이미 성공 상태입니다. 상태 변경 무시: ${status}`);
        return; // 상태 변경 무시
    }
    
    concurrentTaskStates[pageNumber] = { pageNumber, status, error };
    
    // 디버깅 로그 추가
    const successCount = Object.values(concurrentTaskStates).filter(t => t.status === 'success').length;
    // console.log(`[updateTaskStatus] 페이지 ${pageNumber} 상태 업데이트: ${status}, 전체 성공 페이지: ${successCount}`);
    
    // 전체 작업 상태 이벤트 발생
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