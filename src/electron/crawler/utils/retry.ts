/**
 * retry.ts
 * 재시도 로직에 대한 유틸리티 함수
 */

/**
 * 지수 백오프 및 지터를 사용하여 재시도 지연 시간을 계산합니다.
 * @param attempt 현재 시도 횟수 (1부터 시작)
 * @param baseDelay 기본 지연 시간 (밀리초)
 * @param maxDelay 최대 지연 시간 (밀리초)
 * @returns 다음 재시도까지 대기할 시간 (밀리초)
 */
export function calculateBackoffDelay(attempt: number, baseDelay: number = 1000, maxDelay: number = 30000): number {
  // 지수 백오프: 2^attempt * baseDelay
  const exponentialDelay = Math.pow(2, attempt - 1) * baseDelay;
  
  // 최대 지연 시간으로 제한
  const cappedDelay = Math.min(exponentialDelay, maxDelay);
  
  // 지터 추가: ±25% 랜덤성 (네트워크 요청의 동시성 문제 완화)
  const jitter = cappedDelay * 0.5 * (Math.random() - 0.5);
  
  return Math.max(baseDelay, Math.floor(cappedDelay + jitter));
}

/**
 * 함수를 지수 백오프 및 지터를 사용하여 재시도합니다.
 * @param fn 실행할 함수
 * @param maxRetries 최대 재시도 횟수
 * @param baseDelay 기본 지연 시간 (밀리초)
 * @param maxDelay 최대 지연 시간 (밀리초)
 * @param onRetry 재시도 시 호출할 콜백 함수
 * @param shouldAbort 중지 조건을 체크하는 함수 (선택사항)
 * @returns 원본 함수의 결과
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000,
  maxDelay: number = 30000,
  onRetry?: (attempt: number, delay: number, error: Error) => void,
  shouldAbort?: (attempt: number, error: Error) => boolean
): Promise<T> {
  let attempt = 1;
  let lastError: Error;

  while (attempt <= maxRetries + 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // 중지 조건 체크 - 재시도 전에 확인
      if (shouldAbort && shouldAbort(attempt, lastError)) {
        console.log(`[retryWithBackoff] 중지 신호 감지됨, 재시도 중단 (attempt: ${attempt})`);
        throw lastError;
      }
      
      if (attempt > maxRetries) {
        throw lastError;
      }
      
      const delay = calculateBackoffDelay(attempt, baseDelay, maxDelay);
      
      if (onRetry) {
        onRetry(attempt, delay, lastError);
      }
      
      // 지연 시간 동안에도 중지 신호 체크
      await new Promise(resolve => {
        const timer = setTimeout(resolve, delay);
        
        // 중지 조건을 주기적으로 체크 (100ms마다)
        const checkInterval = setInterval(() => {
          if (shouldAbort && shouldAbort(attempt, lastError)) {
            clearTimeout(timer);
            clearInterval(checkInterval);
            console.log(`[retryWithBackoff] 지연 중 중지 신호 감지됨, 재시도 중단`);
            resolve(undefined);
          }
        }, 100);
        
        setTimeout(() => {
          clearInterval(checkInterval);
        }, delay);
      });
      
      // 지연 후에도 다시 한번 중지 조건 체크
      if (shouldAbort && shouldAbort(attempt, lastError)) {
        console.log(`[retryWithBackoff] 지연 후 중지 신호 감지됨, 재시도 중단`);
        throw lastError;
      }
      
      attempt++;
    }
  }
  
  throw lastError!;
}
