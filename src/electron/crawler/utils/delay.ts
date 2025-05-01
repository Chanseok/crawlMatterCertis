/**
 * delay.ts
 * 크롤링 작업에서 요청 간 지연을 처리하는 유틸리티
 */

/**
 * 지정된 범위 내에서 랜덤한 지연 시간(ms)을 생성하는 함수
 */
export function getRandomDelay(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * 특정 시간만큼 지연시키는 Promise를 반환하는 함수
 */
export function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}