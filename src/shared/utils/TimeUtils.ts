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

  // === Phase 4.3: Advanced Time Formatting and Utilities ===

  /**
   * 업무 시간 기준으로 남은 시간 계산
   * 주말과 업무 시간 외를 제외한 실제 작업 가능 시간 계산
   * 
   * @param ms 밀리초
   * @param workHoursPerDay 하루 업무 시간 (기본: 8시간)
   * @returns 업무 시간 기준 포맷팅된 시간
   * 
   * @example
   * TimeUtils.formatBusinessDuration(28800000) // "1 업무일"
   * TimeUtils.formatBusinessDuration(14400000) // "4시간" (업무 시간 기준)
   */
  static formatBusinessDuration(ms: number, workHoursPerDay: number = 8): string {
    if (ms < 0) return '0시간';
    
    const totalHours = ms / (1000 * 60 * 60);
    const businessDays = Math.floor(totalHours / workHoursPerDay);
    const remainingHours = Math.floor(totalHours % workHoursPerDay);
    const remainingMinutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    
    const parts: string[] = [];
    
    if (businessDays > 0) {
      parts.push(`${businessDays} 업무일`);
    }
    if (remainingHours > 0) {
      parts.push(`${remainingHours}시간`);
    }
    if (remainingMinutes > 0 && businessDays === 0) {
      parts.push(`${remainingMinutes}분`);
    }
    
    return parts.length > 0 ? parts.join(' ') : '0시간';
  }

  /**
   * 정밀한 성능 측정용 시간 포맷팅
   * 마이크로초 단위까지 표시하는 고정밀 시간 포맷
   * 
   * @param ms 밀리초 (소수점 포함 가능)
   * @returns 정밀한 시간 문자열
   * 
   * @example
   * TimeUtils.formatPreciseDuration(0.123) // "123μs"
   * TimeUtils.formatPreciseDuration(1.5) // "1.5ms"
   * TimeUtils.formatPreciseDuration(1500) // "1.50s"
   */
  static formatPreciseDuration(ms: number): string {
    if (ms < 0) return '0ms';
    
    if (ms < 1) {
      const microseconds = Math.round(ms * 1000);
      return `${microseconds}μs`;
    } else if (ms < 1000) {
      return `${ms.toFixed(1)}ms`;
    } else if (ms < 60000) {
      return `${(ms / 1000).toFixed(2)}s`;
    } else {
      return this.formatDuration(ms);
    }
  }

  /**
   * 국제화 지원 시간 포맷팅
   * 다양한 언어로 시간을 표시
   * 
   * @param ms 밀리초
   * @param locale 로케일 ('ko-KR' | 'en-US' | 'ja-JP' | 'zh-CN')
   * @returns 해당 언어로 포맷팅된 시간 문자열
   * 
   * @example
   * TimeUtils.formatDurationI18n(3665000, 'en-US') // "1 hour 1 minute 5 seconds"
   * TimeUtils.formatDurationI18n(3665000, 'ja-JP') // "1時間1分5秒"
   */
  static formatDurationI18n(ms: number, locale: 'ko-KR' | 'en-US' | 'ja-JP' | 'zh-CN' = 'ko-KR'): string {
    if (ms < 0) {
      const zeroTexts = {
        'ko-KR': '0초',
        'en-US': '0 seconds',
        'ja-JP': '0秒',
        'zh-CN': '0秒'
      };
      return zeroTexts[locale];
    }
    
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    const remainingHours = hours % 24;
    const remainingMinutes = minutes % 60;
    const remainingSeconds = seconds % 60;
    
    const units = {
      'ko-KR': { day: '일', hour: '시간', minute: '분', second: '초' },
      'en-US': { day: ' day', hour: ' hour', minute: ' minute', second: ' second' },
      'ja-JP': { day: '日', hour: '時間', minute: '分', second: '秒' },
      'zh-CN': { day: '天', hour: '小时', minute: '分', second: '秒' }
    };
    
    const unit = units[locale];
    const parts: string[] = [];
    
    if (days > 0) {
      if (locale === 'en-US') {
        parts.push(`${days}${unit.day}${days > 1 ? 's' : ''}`);
      } else {
        parts.push(`${days}${unit.day}`);
      }
    }
    
    if (remainingHours > 0) {
      if (locale === 'en-US') {
        parts.push(`${remainingHours}${unit.hour}${remainingHours > 1 ? 's' : ''}`);
      } else {
        parts.push(`${remainingHours}${unit.hour}`);
      }
    }
    
    if (remainingMinutes > 0) {
      if (locale === 'en-US') {
        parts.push(`${remainingMinutes}${unit.minute}${remainingMinutes > 1 ? 's' : ''}`);
      } else {
        parts.push(`${remainingMinutes}${unit.minute}`);
      }
    }
    
    if (remainingSeconds > 0 || parts.length === 0) {
      if (locale === 'en-US') {
        parts.push(`${remainingSeconds}${unit.second}${remainingSeconds !== 1 ? 's' : ''}`);
      } else {
        parts.push(`${remainingSeconds}${unit.second}`);
      }
    }
    
    return locale === 'en-US' ? parts.join(' ') : parts.join('');
  }

  /**
   * 시간 범위를 표시하는 포맷터
   * 시작 시간과 종료 시간을 범위로 표시
   * 
   * @param startTime 시작 시간 (Date 또는 timestamp)
   * @param endTime 종료 시간 (Date 또는 timestamp)
   * @param includeDate 날짜 포함 여부 (기본: false)
   * @returns 시간 범위 문자열
   * 
   * @example
   * TimeUtils.formatTimeRange(new Date('2025-06-08T09:00'), new Date('2025-06-08T17:00'))
   * // "09:00 - 17:00"
   * TimeUtils.formatTimeRange(startDate, endDate, true)
   * // "2025-06-08 09:00 - 17:00"
   */
  static formatTimeRange(
    startTime: Date | number,
    endTime: Date | number,
    includeDate: boolean = false
  ): string {
    const start = startTime instanceof Date ? startTime : new Date(startTime);
    const end = endTime instanceof Date ? endTime : new Date(endTime);
    
    const isSameDay = start.toDateString() === end.toDateString();
    
    if (includeDate) {
      const dateStr = start.toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      
      if (isSameDay) {
        return `${dateStr} ${start.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} - ${end.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`;
      } else {
        return `${start.toLocaleDateString('ko-KR')} ${start.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} - ${end.toLocaleDateString('ko-KR')} ${end.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`;
      }
    } else {
      return `${start.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} - ${end.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`;
    }
  }

  /**
   * 적응형 시간 포맷팅
   * 시간의 크기에 따라 자동으로 최적의 형식 선택
   * 
   * @param ms 밀리초
   * @param precision 정밀도 레벨 ('low' | 'medium' | 'high')
   * @returns 적응형 포맷팅된 시간 문자열
   * 
   * @example
   * TimeUtils.formatAdaptiveDuration(500) // "500ms"
   * TimeUtils.formatAdaptiveDuration(65000) // "1분 5초"
   * TimeUtils.formatAdaptiveDuration(3665000) // "약 1시간"
   */
  static formatAdaptiveDuration(ms: number, precision: 'low' | 'medium' | 'high' = 'medium'): string {
    if (ms < 0) return '0초';
    
    // 매우 짧은 시간 (1초 미만)
    if (ms < 1000) {
      if (precision === 'high') {
        return this.formatPreciseDuration(ms);
      } else {
        return '1초 미만';
      }
    }
    
    // 1분 미만
    if (ms < 60000) {
      const seconds = Math.floor(ms / 1000);
      return `${seconds}초`;
    }
    
    // 1시간 미만
    if (ms < 3600000) {
      const minutes = Math.floor(ms / 60000);
      const seconds = Math.floor((ms % 60000) / 1000);
      
      if (precision === 'low') {
        return `약 ${minutes}분`;
      } else if (precision === 'medium' && seconds >= 30) {
        return `${minutes}분 30초`;
      } else if (precision === 'high' && seconds > 0) {
        return `${minutes}분 ${seconds}초`;
      } else {
        return `${minutes}분`;
      }
    }
    
    // 1일 미만
    if (ms < 86400000) {
      const hours = Math.floor(ms / 3600000);
      const minutes = Math.floor((ms % 3600000) / 60000);
      
      if (precision === 'low') {
        return `약 ${hours}시간`;
      } else if (precision === 'medium' && minutes >= 30) {
        return `${hours}시간 30분`;
      } else if (precision === 'high' && minutes > 0) {
        return `${hours}시간 ${minutes}분`;
      } else {
        return `${hours}시간`;
      }
    }
    
    // 1일 이상
    const days = Math.floor(ms / 86400000);
    const hours = Math.floor((ms % 86400000) / 3600000);
    
    if (precision === 'low') {
      return `약 ${days}일`;
    } else if (precision === 'medium' && hours >= 12) {
      return `${days}일 반`;
    } else if (precision === 'high' && hours > 0) {
      return `${days}일 ${hours}시간`;
    } else {
      return `${days}일`;
    }
  }

  /**
   * 성능 벤치마크용 시간 측정 유틸리티
   * 코드 실행 시간을 쉽게 측정할 수 있는 헬퍼
   * 
   * @returns 측정 인터페이스
   * 
   * @example
   * const timer = TimeUtils.createTimer();
   * // ... 코드 실행 ...
   * const elapsed = timer.elapsed(); // "1.23ms"
   * timer.mark('step1');
   * // ... 더 많은 코드 ...
   * const step1Time = timer.elapsed('step1'); // "step1부터 2.45ms"
   */
  static createTimer(): {
    start: number;
    marks: Map<string, number>;
    elapsed: (markName?: string) => string;
    mark: (markName: string) => void;
    getAllMarks: () => Record<string, string>;
  } {
    const start = performance.now();
    const marks = new Map<string, number>();
    
    return {
      start,
      marks,
      elapsed: (markName?: string) => {
        const now = performance.now();
        const startTime = markName ? marks.get(markName) || start : start;
        const elapsed = now - startTime;
        
        if (markName) {
          return `${markName}부터 ${TimeUtils.formatPreciseDuration(elapsed)}`;
        } else {
          return TimeUtils.formatPreciseDuration(elapsed);
        }
      },
      mark: (markName: string) => {
        marks.set(markName, performance.now());
      },
      getAllMarks: () => {
        const now = performance.now();
        const result: Record<string, string> = {};
        
        marks.forEach((time, name) => {
          result[name] = TimeUtils.formatPreciseDuration(now - time);
        });
        
        return result;
      }
    };
  }

  /**
   * 시간대 변환 유틸리티
   * UTC 시간을 다양한 시간대로 변환
   * 
   * @param date Date 객체 또는 timestamp
   * @param timeZone 시간대 (IANA 시간대 식별자)
   * @returns 해당 시간대의 로컬 시간 문자열
   * 
   * @example
   * TimeUtils.formatTimeZone(new Date(), 'America/New_York') // "3:30 AM EST"
   * TimeUtils.formatTimeZone(new Date(), 'Asia/Tokyo') // "오후 5:30"
   */
  static formatTimeZone(date: Date | number, timeZone: string): string {
    const dateObj = date instanceof Date ? date : new Date(date);
    
    try {
      return dateObj.toLocaleString('ko-KR', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch (error) {
      // 잘못된 시간대인 경우 기본 로컬 시간 반환
      return dateObj.toLocaleString('ko-KR');
    }
  }

  /**
   * 시간 기반 캐싱을 위한 캐시 키 생성
   * 시간 간격에 따라 일정 기간 동안 동일한 키를 생성
   * 
   * @param intervalMs 캐시 간격 (밀리초)
   * @param prefix 키 접두사 (선택사항)
   * @returns 시간 기반 캐시 키
   * 
   * @example
   * TimeUtils.getTimeCacheKey(60000) // "cache_1717854000" (1분 간격)
   * TimeUtils.getTimeCacheKey(300000, 'api') // "api_1717854000" (5분 간격)
   */
  static getTimeCacheKey(intervalMs: number, prefix: string = 'cache'): string {
    const now = Date.now();
    const interval = Math.floor(now / intervalMs) * intervalMs;
    return `${prefix}_${Math.floor(interval / 1000)}`;
  }
}
