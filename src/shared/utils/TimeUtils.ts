/**
 * TimeUtils - 시간 관련 유틸리티 함수 통합
 * 
 * 중복된 시간 포맷팅 로직을 하나로 통합하여 일관성과 유지보수성을 향상시킵니다.
 * Clean Code 원칙에 따라 단일 책임을 가진 정적 메서드들로 구성됩니다.
 */

export class TimeUtils {
  /**
   * 밀리초를 시:분:초 형태로 포맷팅
   * 
   * @param ms 밀리초
   * @returns "HH:MM:SS" 또는 "MM:SS" 형태의 문자열
   * 
   * @example
   * TimeUtils.formatDuration(3661000) // "1:01:01"
   * TimeUtils.formatDuration(125000)  // "2:05"
   */
  static formatDuration(ms: number): string {
    if (ms < 0) return "0:00";
    
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    const remainingMinutes = minutes % 60;
    const remainingSeconds = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${remainingMinutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    return `${remainingMinutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  /**
   * Date 객체를 현지 시간 문자열로 포맷팅
   * 
   * @param date Date 객체
   * @returns 현지 시간 문자열
   * 
   * @example
   * TimeUtils.formatTimestamp(new Date()) // "오후 3:30:45"
   */
  static formatTimestamp(date: Date): string {
    return date.toLocaleTimeString();
  }

  /**
   * 시작 시간부터 현재까지의 경과 시간을 포맷팅
   * 
   * @param startTime 시작 시간
   * @returns 경과 시간 문자열
   * 
   * @example
   * TimeUtils.formatElapsedTime(new Date(Date.now() - 125000)) // "2:05"
   */
  static formatElapsedTime(startTime: Date): string {
    const elapsed = Date.now() - startTime.getTime();
    return this.formatDuration(elapsed);
  }

  /**
   * 시작 시간과 종료 시간 사이의 duration을 포맷팅
   * 
   * @param startTime 시작 시간
   * @param endTime 종료 시간 (기본값: 현재 시간)
   * @returns duration 문자열
   * 
   * @example
   * TimeUtils.formatDurationBetween(startTime, endTime) // "1:30:45"
   */
  static formatDurationBetween(startTime: Date, endTime: Date = new Date()): string {
    const duration = endTime.getTime() - startTime.getTime();
    return this.formatDuration(Math.max(0, duration));
  }

  /**
   * 남은 시간을 추정하여 포맷팅
   * 
   * @param completedItems 완료된 항목 수
   * @param totalItems 전체 항목 수
   * @param elapsedMs 경과 시간(밀리초)
   * @returns 예상 남은 시간 문자열
   * 
   * @example
   * TimeUtils.formatEstimatedRemainingTime(30, 100, 60000) // "2:20"
   */
  static formatEstimatedRemainingTime(
    completedItems: number, 
    totalItems: number, 
    elapsedMs: number
  ): string {
    if (completedItems <= 0 || totalItems <= completedItems) {
      return "0:00";
    }

    const averageTimePerItem = elapsedMs / completedItems;
    const remainingItems = totalItems - completedItems;
    const estimatedRemainingMs = averageTimePerItem * remainingItems;

    return this.formatDuration(estimatedRemainingMs);
  }

  /**
   * 현재 시간을 ISO 문자열로 반환 (로깅 등에 사용)
   * 
   * @returns ISO 문자열
   * 
   * @example
   * TimeUtils.getCurrentISOString() // "2025-06-08T12:30:45.123Z"
   */
  static getCurrentISOString(): string {
    return new Date().toISOString();
  }

  /**
   * 파일명에 사용할 수 있는 타임스탬프 생성
   * 
   * @returns 파일명용 타임스탬프
   * 
   * @example
   * TimeUtils.getFileTimestamp() // "20250608-123045"
   */
  static getFileTimestamp(): string {
    return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 15);
  }

  // === Phase 4.2: Enhanced Time Formatting Methods ===

  /**
   * 밀리초를 읽기 쉬운 한국어 형태로 포맷팅
   * CrawlingUtils의 formatDuration과 동일한 형식
   * 
   * @param ms 밀리초
   * @param includeMs 밀리초 단위 포함 여부 (기본: false)
   * @returns 한국어 형태의 시간 문자열
   * 
   * @example
   * TimeUtils.formatHumanReadableDuration(3665000) // "1시간 1분 5초"
   * TimeUtils.formatHumanReadableDuration(65000) // "1분 5초"  
   * TimeUtils.formatHumanReadableDuration(5000) // "5초"
   */
  static formatHumanReadableDuration(ms: number, includeMs: boolean = false): string {
    if (ms < 0) return '0초';
    
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) {
      return `${days}일 ${hours % 24}시간 ${minutes % 60}분`;
    } else if (hours > 0) {
      return `${hours}시간 ${minutes % 60}분 ${seconds % 60}초`;
    } else if (minutes > 0) {
      return `${minutes}분 ${seconds % 60}초`;
    } else if (seconds > 0) {
      return `${seconds}초`;
    } else if (includeMs && ms > 0) {
      return `${ms}ms`;
    } else {
      return '0초';
    }
  }

  /**
   * 상대적 시간 표시 (몇 초 전, 몇 분 전 등)
   * 
   * @param timestamp 기준 시간 (밀리초)
   * @param now 현재 시간 (기본: 현재 시각)
   * @returns 상대적 시간 문자열
   * 
   * @example
   * TimeUtils.formatRelativeTime(Date.now() - 30000) // "30초 전"
   * TimeUtils.formatRelativeTime(Date.now() - 3600000) // "1시간 전"
   */
  static formatRelativeTime(timestamp: number, now: number = Date.now()): string {
    const diff = now - timestamp;
    
    if (diff < 1000) return '방금 전';
    if (diff < 60000) return `${Math.floor(diff / 1000)}초 전`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}분 전`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}시간 전`;
    
    return `${Math.floor(diff / 86400000)}일 전`;
  }

  /**
   * 두 가지 시간 형식을 통합한 범용 포맷터
   * 용도에 따라 적절한 형식을 선택할 수 있음
   * 
   * @param ms 밀리초
   * @param format 포맷 형식 ('compact' | 'human' | 'colon')
   * @returns 선택된 형식의 시간 문자열
   * 
   * @example
   * TimeUtils.formatTime(65000, 'compact') // "01:05"
   * TimeUtils.formatTime(65000, 'human') // "1분 5초"
   * TimeUtils.formatTime(65000, 'colon') // "1:05"
   */
  static formatTime(ms: number, format: 'compact' | 'human' | 'colon' = 'colon'): string {
    switch (format) {
      case 'compact':
        return this.formatCompactDuration(ms);
      case 'human':
        return this.formatHumanReadableDuration(ms);
      case 'colon':
      default:
        return this.formatDuration(ms);
    }
  }

  /**
   * 컴팩트한 시간 포맷팅 (MM:SS 또는 HH:MM:SS 형식)
   * UI 표시용 간결한 시간 형식 (패딩 포함)
   * 
   * @param ms 밀리초
   * @returns MM:SS 또는 HH:MM:SS 형식 문자열
   * 
   * @example
   * TimeUtils.formatCompactDuration(65000) // "01:05"
   * TimeUtils.formatCompactDuration(3665000) // "01:01:05"
   */
  static formatCompactDuration(ms: number): string {
    if (ms < 0) return '00:00';
    
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    } else {
      return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
  }
}
