/**
 * ViewModel을 위한 통합 크롤링 상태 타입 정의
 * 모든 UI 컴포넌트가 참조할 단일 데이터 소스 구조
 * Clean Architecture 기반 구조적 안정성 보장
 */

/**
 * 크롤링 단계 정보
 */
export interface PhaseInfo {
  current: 'idle' | 'listCollection' | 'detailCollection' | 'validation' | 'completed';
  description: string;
  stageNumber: number;
}

/**
 * 진행률 정보  
 */
export interface ProgressInfo {
  percentage: number;
  isComplete: boolean;
}

/**
 * 항목 처리 정보
 */
export interface ItemsInfo {
  processed: number;
  total: number;
  new: number;
  updated: number;
}

/**
 * 페이지 처리 정보
 */
export interface PagesInfo {
  current: number;
  total: number;
}

/**
 * 시간 정보
 */
export interface TimeInfo {
  elapsed: number;
  remaining: number;
  formattedElapsed: string;
  formattedRemaining: string;
}

/**
 * 오류 정보
 */
export interface ErrorInfo {
  hasError: boolean;
  message: string | null;
  isRecoverable: boolean;
}

/**
 * ViewModel의 핵심 상태 객체 - 구조적 일관성 보장
 * 모든 UI 표시 정보의 단일 원본 (Single Source of Truth)
 */
export interface UnifiedCrawlingState {
  // 단계 정보 (완전히 분리)
  phase: PhaseInfo;
  
  // 진행 정보 (일관된 백분율)
  progress: ProgressInfo;
  
  // 항목 처리 정보 (모든 UI가 참조할 단일 소스)
  items: ItemsInfo;
  
  // 페이지 처리 정보 (항목과 분리)
  pages: PagesInfo;
  
  // 시간 정보 (포맷팅 포함)
  time: TimeInfo;
  
  // 오류 정보 (복구 가능성 포함)
  error: ErrorInfo;
  
  // 원본 진행 데이터 (디버깅용)
  _rawProgress?: any;
}

/**
 * UI 컴포넌트에서 사용할 Display 타입들 - 구조적 일관성
 */

/**
 * 제품 수집 현황 표시용
 */
export interface CollectionDisplay {
  processed: number;
  total: number;
  displayText: string;
  isComplete: boolean;
  phaseText: string; // "페이지" vs "제품" 구분
}

/**
 * 진행률 표시용  
 */
export interface ProgressDisplay {
  percentage: number;
  barColor: string;
  isComplete: boolean;
  statusText: string;
}

/**
 * 상태 표시용
 */
export interface StatusDisplay {
  text: string;
  className: string;
  iconType: 'loading' | 'success' | 'error' | 'idle';
  isError: boolean;
  isComplete: boolean;
  isIdle: boolean;
  showErrorButton: boolean;
}

/**
 * 시간 표시용
 */
export interface TimeDisplay {
  elapsed: number;
  remaining: number;
  elapsedDisplay: string;
  remainingDisplay: string;
  isComplete: boolean;
}

/**
 * 페이지 진행 표시용
 * - 문제 #3 해결: 페이지/제품 수 혼합 표시(48/5 페이지) 문제
 */
export interface PageDisplay {
  current: number;
  total: number;
  displayText: string;
}
