/**
 * CrawlingUtils.ts
 * 크롤링 과정에서 공통으로 사용되는 유틸리티 함수들을 모아놓은 클래스
 * 중복 코드 제거를 위해 재시도 로직, 진행률 계산, 시간 포맷팅, 페이지 범위 검증 등을 중앙화
 * 
 * Phase 4: Common Utility Integration - Enhanced progress calculation and display utilities
 */

import { retryWithBackoff } from '../../electron/crawler/utils/retry.js';
import { TimeUtils } from './TimeUtils.js';

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

// Phase 4: Enhanced interfaces for comprehensive progress handling
export interface ProgressCalculationOptions {
  /** Minimum progress required before calculating remaining time (default: 0.1 = 10%) */
  minProgressForETA?: number;
  /** Whether the operation is completed */
  isCompleted?: boolean;
  /** Custom message template: {processed}/{total} ({percentage}%) */
  messageTemplate?: string;
  /** Stage identifier for multi-stage operations */
  stageIdentifier?: string;
  /** Additional context for progress messages */
  context?: string;
}

export interface EnhancedProgressMetrics extends ProgressMetrics {
  /** Safe percentage value (0-100) */
  safePercentage: number;
  /** Formatted percentage string with % symbol */
  formattedPercentage: string;
  /** Standard progress message */
  progressMessage: string;
  /** Whether progress calculation is reliable for ETA */
  isETAReliable: boolean;
  /** Progress ratio (0-1) */
  progressRatio: number;
}

export interface ProgressDisplayOptions {
  /** Include percentage in message */
  includePercentage?: boolean;
  /** Include ETA in message */
  includeETA?: boolean;
  /** Decimal places for percentage (default: 1) */
  percentageDecimals?: number;
  /** Custom separator between elements */
  separator?: string;
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

  // === Phase 4: Enhanced Progress Calculation Utilities ===

  /**
   * 안전한 백분율 계산 함수
   * 0으로 나누기 방지 및 0-100 범위 보장
   * 
   * @param processed 처리된 항목 수
   * @param total 전체 항목 수
   * @returns 0-100 범위의 안전한 백분율
   */
  static safePercentage(processed: number, total: number): number {
    if (total <= 0) return 0;
    return Math.min(Math.max((processed / total) * 100, 0), 100);
  }

  /**
   * 진행 상태 완료 여부 확인
   * 여러 조건을 종합하여 완료 상태 판단
   * 
   * @param processed 처리된 항목 수
   * @param total 전체 항목 수
   * @param percentage 현재 백분율 (선택적)
   * @param isCompleted 명시적 완료 플래그 (선택적)
   * @returns 완료 여부
   */
  static isProgressCompleted(
    processed: number, 
    total: number, 
    percentage?: number,
    isCompleted?: boolean
  ): boolean {
    // 명시적 완료 플래그가 있으면 우선 적용
    if (isCompleted !== undefined) return isCompleted;
    
    // 백분율 기준 완료 체크
    const currentPercentage = percentage ?? this.safePercentage(processed, total);
    if (currentPercentage >= 100) return true;
    
    // 처리 항목 기준 완료 체크
    return total > 0 && processed >= total;
  }

  /**
   * 포괄적인 진행률 계산 함수
   * 기존 calculateProgress를 확장하여 더 많은 옵션과 정보 제공
   * 
   * @param processed 처리된 항목 수
   * @param total 전체 항목 수  
   * @param startTime 시작 시간 (밀리초)
   * @param options 진행률 계산 옵션
   * @returns 확장된 진행률 정보
   */
  static calculateProgressWithOptions(
    processed: number,
    total: number,
    startTime: number,
    options: ProgressCalculationOptions = {}
  ): EnhancedProgressMetrics {
    const {
      minProgressForETA = 0.1,
      isCompleted = false,
      messageTemplate,
      stageIdentifier = '',
      context = ''
    } = options;

    const now = Date.now();
    const elapsedTime = now - startTime;
    
    // 기본 진행률 계산
    const safeTotal = Math.max(total, 1);
    const progressRatio = Math.min(Math.max(processed / safeTotal, 0), 1);
    const safePercentage = progressRatio * 100;
    const completed = this.isProgressCompleted(processed, total, safePercentage, isCompleted);
    
    // 포맷팅된 백분율
    const formattedPercentage = this.formatPercentage(safePercentage);
    
    // 남은 시간 계산
    let remainingTime: number | undefined = undefined;
    let estimatedEndTime: number | undefined = undefined;
    let isETAReliable = false;
    
    if (!completed && processed > 0 && progressRatio > minProgressForETA) {
      const avgTimePerItem = elapsedTime / processed;
      remainingTime = (total - processed) * avgTimePerItem;
      estimatedEndTime = now + remainingTime;
      isETAReliable = true;
    } else if (completed) {
      remainingTime = 0;
      estimatedEndTime = now;
      isETAReliable = true;
    }
    
    // 진행률 메시지 생성
    const progressMessage = this.formatProgressMessage(
      processed, 
      total, 
      safePercentage, 
      { 
        messageTemplate,
        stageIdentifier,
        context,
        isCompleted: completed
      }
    );
    
    return {
      percentage: safePercentage,
      elapsedTime,
      remainingTime,
      estimatedEndTime,
      safePercentage,
      formattedPercentage,
      progressMessage,
      isETAReliable,
      progressRatio
    };
  }

  /**
   * 표준화된 진행률 메시지 포맷팅
   * 일관된 진행률 메시지 생성을 위한 중앙화된 함수
   * 
   * @param processed 처리된 항목 수
   * @param total 전체 항목 수
   * @param percentage 백분율
   * @param options 메시지 옵션
   * @returns 포맷팅된 진행률 메시지
   */
  static formatProgressMessage(
    processed: number,
    total: number,
    percentage?: number,
    options: {
      messageTemplate?: string;
      stageIdentifier?: string;
      context?: string;
      isCompleted?: boolean;
      includePercentage?: boolean;
    } = {}
  ): string {
    const {
      messageTemplate,
      stageIdentifier = '',
      context = '',
      isCompleted = false,
      includePercentage = true
    } = options;

    const safePercentage = percentage ?? this.safePercentage(processed, total);
    const percentageText = includePercentage ? ` (${this.formatPercentage(safePercentage)})` : '';
    
    // 사용자 정의 템플릿이 있는 경우
    if (messageTemplate) {
      return messageTemplate
        .replace('{processed}', processed.toString())
        .replace('{total}', total.toString())
        .replace('{percentage}', this.formatPercentage(safePercentage))
        .replace('{stage}', stageIdentifier)
        .replace('{context}', context);
    }
    
    // 기본 메시지 형식
    const stage = stageIdentifier ? `${stageIdentifier}: ` : '';
    const contextText = context ? ` ${context}` : '';
    
    if (isCompleted) {
      return `${stage}완료: ${total}개${contextText} 처리됨`;
    }
    
    return `${stage}${contextText} ${processed}/${total} 처리 중${percentageText}`;
  }

  /**
   * 진행률 디스플레이 정보 생성
   * UI 컴포넌트에서 사용할 수 있는 포맷팅된 진행률 정보 제공
   * 
   * @param processed 처리된 항목 수
   * @param total 전체 항목 수
   * @param elapsedTime 경과 시간 (밀리초)
   * @param options 디스플레이 옵션
   * @returns 디스플레이용 진행률 정보
   */
  static generateProgressDisplay(
    processed: number,
    total: number,
    elapsedTime: number,
    options: ProgressDisplayOptions = {}
  ): {
    progressText: string;
    percentageText: string;
    etaText: string;
    statusText: string;
  } {
    const {
      includePercentage = true,
      includeETA = true,
      percentageDecimals = 1,
      separator = ' | '
    } = options;

    const percentage = this.safePercentage(processed, total);
    const progressText = `${processed}/${total}`;
    const percentageText = includePercentage ? 
      `${percentage.toFixed(percentageDecimals)}%` : '';
    
    let etaText = '';
    if (includeETA && processed > 0 && processed < total && elapsedTime > 0) {
      const avgTimePerItem = elapsedTime / processed;
      const remainingTime = (total - processed) * avgTimePerItem;
      etaText = `ETA: ${TimeUtils.formatDuration(remainingTime)}`;
    }
    
    // 상태 텍스트 조합
    const parts = [progressText];
    if (percentageText) parts.push(percentageText);
    if (etaText) parts.push(etaText);
    
    const statusText = parts.join(separator);
    
    return {
      progressText,
      percentageText,
      etaText,
      statusText
    };
  }

  /**
   * 진행률 계산 함수 (기존 호환성 유지)
   * 현재 처리된 항목 수와 총 항목 수를 기반으로 진행률과 예상 시간 계산
   */
  static calculateProgress(
    processed: number,
    total: number,
    startTime: number,
    isCompleted: boolean = false
  ): ProgressMetrics {
    // 새로운 함수를 사용하되 기존 인터페이스 유지
    const enhanced = this.calculateProgressWithOptions(processed, total, startTime, { isCompleted });
    
    return {
      percentage: enhanced.percentage,
      elapsedTime: enhanced.elapsedTime,
      remainingTime: enhanced.remainingTime,
      estimatedEndTime: enhanced.estimatedEndTime
    };
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

  // === Duration and Time Formatting Utilities ===

  /**
   * 밀리초를 읽기 쉬운 형태로 포맷팅
   * TimeUtils로 위임하여 중복 제거
   * 
   * @param ms 밀리초
   * @param includeMs 밀리초 단위 포함 여부 (기본: false)
   * @returns 포맷팅된 시간 문자열
   * @deprecated Use TimeUtils.formatHumanReadableDuration() directly
   */
  static formatDuration(ms: number, includeMs: boolean = false): string {
    return TimeUtils.formatHumanReadableDuration(ms, includeMs);
  }

  /**
   * 컴팩트한 시간 포맷팅 (MM:SS 형식)
   * TimeUtils로 위임하여 중복 제거
   * 
   * @param ms 밀리초
   * @returns MM:SS 또는 HH:MM:SS 형식 문자열
   * @deprecated Use TimeUtils.formatCompactDuration() directly
   */
  static formatCompactDuration(ms: number): string {
    return TimeUtils.formatCompactDuration(ms);
  }

  /**
   * 상대적 시간 표시 (몇 초 전, 몇 분 전 등)
   * TimeUtils로 위임하여 중복 제거
   * 
   * @param timestamp 기준 시간 (밀리초)
   * @param now 현재 시간 (기본: 현재 시각)
   * @returns 상대적 시간 문자열
   * @deprecated Use TimeUtils.formatRelativeTime() directly
   */
  static formatRelativeTime(timestamp: number, now: number = Date.now()): string {
    return TimeUtils.formatRelativeTime(timestamp, now);
  }

  // === Configuration and Validation Utilities ===

  /**
   * 설정값의 안전한 읽기
   * undefined 또는 null 값에 대한 기본값 제공
   * 
   * @param config 설정 객체
   * @param key 설정 키
   * @param defaultValue 기본값
   * @returns 설정값 또는 기본값
   */
  static safeGetConfig<T>(config: any, key: string, defaultValue: T): T {
    if (!config || typeof config !== 'object') return defaultValue;
    const value = config[key];
    return value !== undefined && value !== null ? value : defaultValue;
  }

  /**
   * 숫자 설정값의 범위 검증 및 조정
   * 
   * @param value 검증할 값
   * @param min 최소값
   * @param max 최대값
   * @param defaultValue 기본값
   * @returns 유효한 범위 내의 값
   */
  static validateNumberRange(
    value: any, 
    min: number, 
    max: number, 
    defaultValue: number
  ): number {
    const num = typeof value === 'number' ? value : parseFloat(value);
    if (isNaN(num)) return defaultValue;
    return Math.max(min, Math.min(max, num));
  }

  /**
   * URL 유효성 검사
   * 
   * @param url 검사할 URL
   * @returns URL 유효성 및 정규화된 URL
   */
  static validateAndNormalizeUrl(url: string): { 
    isValid: boolean; 
    normalizedUrl?: string; 
    error?: string 
  } {
    try {
      if (!url || typeof url !== 'string') {
        return { isValid: false, error: 'URL이 문자열이 아닙니다.' };
      }
      
      // 프로토콜이 없는 경우 https 추가
      const urlToTest = url.startsWith('http') ? url : `https://${url}`;
      const urlObj = new URL(urlToTest);
      
      // 지원되는 프로토콜 확인
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        return { isValid: false, error: 'HTTP 또는 HTTPS 프로토콜만 지원됩니다.' };
      }
      
      return { isValid: true, normalizedUrl: urlObj.toString() };
    } catch (error) {
      return { 
        isValid: false, 
        error: `유효하지 않은 URL 형식: ${error instanceof Error ? error.message : '알 수 없는 오류'}` 
      };
    }
  }

  // === Array and Object Utilities ===

  /**
   * 배열을 청크(덩어리)로 나누기
   * 대용량 데이터 처리 시 배치 분할에 유용
   * 
   * @param array 분할할 배열
   * @param chunkSize 청크 크기
   * @returns 청크로 나뉜 2차원 배열
   */
  static chunkArray<T>(array: T[], chunkSize: number): T[][] {
    if (chunkSize <= 0) return [array];
    
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * 객체의 깊은 복사 (순환 참조 방지)
   * 
   * @param obj 복사할 객체
   * @param seen 순환 참조 방지용 WeakSet
   * @returns 깊은 복사된 객체
   */
  static deepClone<T>(obj: T, seen = new WeakSet()): T {
    // 원시 타입이나 null인 경우
    if (obj === null || typeof obj !== 'object') return obj;
    
    // 순환 참조 확인
    if (seen.has(obj as any)) return obj;
    seen.add(obj as any);
    
    // Date 객체
    if (obj instanceof Date) return new Date(obj.getTime()) as T;
    
    // Array 객체
    if (Array.isArray(obj)) {
      return obj.map(item => this.deepClone(item, seen)) as T;
    }
    
    // 일반 객체
    const cloned = {} as T;
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        (cloned as any)[key] = this.deepClone(obj[key], seen);
      }
    }
    
    return cloned;
  }

  // === Memory and Performance Utilities ===

  /**
   * 메모리 사용량 체크 (Node.js 환경)
   * 
   * @returns 메모리 사용량 정보 또는 null (브라우저 환경)
   */
  static getMemoryUsage(): { 
    heapUsed: number; 
    heapTotal: number; 
    external: number;
    formattedHeapUsed: string;
    formattedHeapTotal: string;
  } | null {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const usage = process.memoryUsage();
      return {
        heapUsed: usage.heapUsed,
        heapTotal: usage.heapTotal,
        external: usage.external,
        formattedHeapUsed: this.formatBytes(usage.heapUsed),
        formattedHeapTotal: this.formatBytes(usage.heapTotal)
      };
    }
    return null;
  }

  /**
   * 바이트를 읽기 쉬운 단위로 변환
   * 
   * @param bytes 바이트 수
   * @param decimals 소수점 자리수 (기본: 2)
   * @returns 포맷팅된 문자열
   */
  static formatBytes(bytes: number, decimals: number = 2): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  /**
   * 스로틀링 함수 생성기
   * 함수 호출 빈도를 제한하는 스로틀 함수 생성
   * 
   * @param func 스로틀링할 함수
   * @param limit 제한 시간 (밀리초)
   * @returns 스로틀링된 함수
   */
  static throttle<T extends (...args: any[]) => any>(
    func: T,
    limit: number
  ): (...args: Parameters<T>) => void {
    let inThrottle: boolean;
    
    return function (this: any, ...args: Parameters<T>) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => (inThrottle = false), limit);
      }
    };
  }

  /**
   * 디바운싱 함수 생성기
   * 연속된 함수 호출에서 마지막 호출만 실행되도록 하는 디바운스 함수 생성
   * 
   * @param func 디바운싱할 함수
   * @param delay 지연 시간 (밀리초)
   * @returns 디바운싱된 함수
   */
  static debounce<T extends (...args: any[]) => any>(
    func: T,
    delay: number
  ): (...args: Parameters<T>) => void {
    let timeoutId: ReturnType<typeof setTimeout>;
    
    return function (this: any, ...args: Parameters<T>) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
  }
}