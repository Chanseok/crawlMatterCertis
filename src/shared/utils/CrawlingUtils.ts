/**
 * CrawlingUtils.ts
 * 크롤링 과정에서 공통으로 사용되는 유틸리티 함수들을 모아놓은 클래스
 * 중복 코드 제거를 위해 재시도 로직, 진행률 계산, 시간 포맷팅, 페이지 범위 검증 등을 중앙화
 */

import { retryWithBackoff } from '../../electron/crawler/utils/retry.js';

export interface ProgressMetrics {
  percentage: number;
  elapsedTime: number;
  remainingTime?: number;
  estimatedEndTime?: number;
}

export interface BatchMetrics {
  currentBatch: number;
  totalBatches: number;
  batchPercentage: number;
}

export interface PageRangeValidationResult {
  isValid: boolean;
  message: string;
  adjustedStartPage?: number;
  adjustedEndPage?: number;
}

export class CrawlingUtils {
  
  /**
   * 재시도 로직을 위한 래퍼 함수
   * 기존 retryWithBackoff 함수를 감싸서 일관된 인터페이스 제공
   */
  static async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000,
    maxDelay: number = 30000,
    onRetry?: (attempt: number, delay: number, error: Error) => void,
    shouldAbort?: (attempt: number, error: Error) => boolean
  ): Promise<T> {
    return retryWithBackoff(
      operation,
      maxRetries,
      baseDelay,
      maxDelay,
      onRetry,
      shouldAbort
    );
  }

  /**
   * 진행률 계산 함수
   * 현재 처리된 항목 수와 총 항목 수를 기반으로 진행률과 예상 시간 계산
   */
  static calculateProgress(
    processed: number,
    total: number,
    startTime: number,
    isCompleted: boolean = false
  ): ProgressMetrics {
    const now = Date.now();
    const elapsedTime = now - startTime;
    
    // 0으로 나누기 방지
    const safeTotal = Math.max(total, 1);
    const percentage = Math.min(Math.max((processed / safeTotal) * 100, 0), 100);
    
    let remainingTime: number | undefined = undefined;
    let estimatedEndTime: number | undefined = undefined;
    
    if (!isCompleted && processed > 0 && processed > total * 0.1) {
      // 10% 이상 진행된 경우에만 남은 시간 예측
      const avgTimePerItem = elapsedTime / processed;
      remainingTime = (total - processed) * avgTimePerItem;
      estimatedEndTime = now + remainingTime;
    } else if (isCompleted) {
      remainingTime = 0;
      estimatedEndTime = now;
    }
    
    return {
      percentage,
      elapsedTime,
      remainingTime,
      estimatedEndTime
    };
  }

  /**
   * 시간 포맷팅 함수 (표준 형식)
   * 밀리초를 "0h 0m 0s" 형식으로 변환
   */
  static formatDuration(ms: number): string {
    if (ms < 0) return '0초';
    
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}시간 ${minutes % 60}분 ${seconds % 60}초`;
    } else if (minutes > 0) {
      return `${minutes}분 ${seconds % 60}초`;
    } else {
      return `${seconds}초`;
    }
  }

  /**
   * 시간 포맷팅 함수 (간결한 형식)
   * 밀리초를 "0h 0m 0s" 형식으로 변환
   */
  static formatDurationCompact(ms: number): string {
    if (ms < 0) return '0s';
    
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * 시간 포맷팅 함수 (짧은 형식)
   * 밀리초를 "00:00:00" 형식으로 변환
   */
  static formatDurationShort(ms: number): string {
    if (ms < 0) return '00:00';
    
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    const h = hours.toString().padStart(2, '0');
    const m = (minutes % 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    
    if (hours > 0) {
      return `${h}:${m}:${s}`;
    } else {
      return `${m}:${s}`;
    }
  }

  /**
   * 페이지 범위 검증 함수
   * 시작 페이지와 끝 페이지가 유효한지 검증하고 조정된 값 제공
   */
  static validatePageRange(
    startPage: number,
    endPage: number,
    totalPages: number
  ): PageRangeValidationResult {
    // 기본 유효성 검사
    if (startPage < 1 || endPage < 1) {
      return {
        isValid: false,
        message: '페이지 번호는 1 이상이어야 합니다.'
      };
    }
    
    if (startPage > totalPages || endPage > totalPages) {
      return {
        isValid: false,
        message: `페이지 번호는 총 페이지 수(${totalPages})를 초과할 수 없습니다.`,
        adjustedStartPage: Math.min(startPage, totalPages),
        adjustedEndPage: Math.min(endPage, totalPages)
      };
    }
    
    if (startPage < endPage) {
      return {
        isValid: false,
        message: '시작 페이지는 끝 페이지보다 크거나 같아야 합니다.',
        adjustedStartPage: Math.max(startPage, endPage),
        adjustedEndPage: Math.min(startPage, endPage)
      };
    }
    
    return {
      isValid: true,
      message: '유효한 페이지 범위입니다.'
    };
  }

  /**
   * 안전한 지연 함수
   * 중단 조건을 확인하면서 지연을 수행
   */
  static async delay(ms: number, shouldAbort?: () => boolean): Promise<void> {
    if (shouldAbort && shouldAbort()) {
      return;
    }
    
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve();
      }, ms);
      
      // 중단 조건이 있는 경우 주기적으로 확인
      if (shouldAbort) {
        const checkInterval = Math.min(ms / 10, 100); // 최대 100ms 간격으로 확인
        const checker = setInterval(() => {
          if (shouldAbort()) {
            clearTimeout(timeout);
            clearInterval(checker);
            resolve();
          }
        }, checkInterval);
        
        // timeout과 함께 interval도 정리
        setTimeout(() => {
          clearInterval(checker);
        }, ms);
      }
    });
  }

  /**
   * 배치 메트릭 계산 함수
   * 현재 배치와 총 배치 수를 기반으로 메트릭 계산
   */
  static calculateBatchMetrics(
    currentBatch: number,
    totalBatches: number
  ): BatchMetrics {
    const safeTotalBatches = Math.max(totalBatches, 1);
    const batchPercentage = Math.min(
      Math.max((currentBatch / safeTotalBatches) * 100, 0),
      100
    );
    
    return {
      currentBatch,
      totalBatches,
      batchPercentage
    };
  }

  /**
   * 퍼센트 포맷팅 함수
   * 숫자를 백분율 문자열로 변환 (소수점 1자리)
   */
  static formatPercentage(value: number): string {
    return `${Math.max(0, Math.min(100, value)).toFixed(1)}%`;
  }

  /**
   * 오류 타입 확인 함수
   * 오류가 특정 타입인지 확인
   */
  static isAbortError(error: any): boolean {
    return error?.name === 'AbortError' || 
           error?.message?.includes('abort') ||
           error?.code === 'ABORT_ERR';
  }

  /**
   * 오류가 타임아웃 오류인지 확인
   */
  static isTimeoutError(error: any): boolean {
    return error?.name === 'TimeoutError' ||
           error?.message?.includes('timeout') ||
           error?.code === 'TIMEOUT';
  }

  /**
   * 오류가 네트워크 오류인지 확인
   */
  static isNetworkError(error: any): boolean {
    return error?.code === 'ECONNREFUSED' ||
           error?.code === 'ENOTFOUND' ||
           error?.code === 'ECONNRESET' ||
           error?.message?.includes('network') ||
           error?.message?.includes('fetch');
  }

  /**
   * 지수 백오프 지연 시간 계산 함수
   * 재시도 횟수를 기반으로 지수적으로 증가하는 지연 시간 계산 (지터 포함)
   */
  static exponentialBackoff(
    attempt: number, 
    baseDelay: number = 1000, 
    maxDelay: number = 30000
  ): number {
    // 지수 백오프: 2^attempt * baseDelay
    const exponentialDelay = Math.pow(2, attempt - 1) * baseDelay;
    
    // 최대 지연 시간으로 제한
    const cappedDelay = Math.min(exponentialDelay, maxDelay);
    
    // 지터 추가: ±25% 랜덤성 (네트워크 요청의 동시성 문제 완화)
    const jitter = cappedDelay * 0.5 * (Math.random() - 0.5);
    
    return Math.max(baseDelay, Math.floor(cappedDelay + jitter));
  }

  /**
   * 성공률 계산 함수
   * 성공한 항목과 총 항목 수를 기반으로 성공률 계산
   */
  static calculateSuccessRate(successful: number, total: number): number {
    if (total === 0) return 1; // 총 항목이 0인 경우 100%로 처리
    return Math.max(0, Math.min(1, successful / total));
  }
}