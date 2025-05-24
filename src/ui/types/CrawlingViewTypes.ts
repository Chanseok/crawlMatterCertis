/**
 * ViewModel을 위한 통합 크롤링 상태 타입 정의
 * 모든 UI 컴포넌트가 참조할 단일 데이터 소스 구조
 */

export interface DetailCollectionState {
  processed: number;
  total: number;
}

export interface PageProgressState {
  current: number;
  total: number;
}

export interface ItemCountState {
  new: number;
  updated: number;
}

export interface CrawlingStatusInfo {
  text: string;
  className: string;
  iconType: 'loading' | 'success' | 'error' | 'idle';
  isError: boolean;
  isComplete: boolean;
  isIdle: boolean;
}

export interface TimeInfo {
  elapsed: number;
  remaining: number;
  remainingDisplay: string;
}

/**
 * ViewModel의 핵심 상태 객체
 * 모든 UI 표시 정보의 단일 원본
 */
export interface UnifiedCrawlingState {
  // 기본 상태
  stage: string;
  percentage: number;
  currentStep: string;
  
  // 컬렉션 상태
  detailCollection: DetailCollectionState;
  pageProgress: PageProgressState;
  itemCounts: ItemCountState;
  
  // 완료/오류 상태
  isComplete: boolean;
  hasError: boolean;
  errorMessage?: string;
  
  // 시간 정보
  timeInfo: TimeInfo;
  
  // 원본 진행 데이터 (디버깅용)
  _rawProgress?: any;
}

/**
 * UI 컴포넌트에서 사용할 Display 타입들
 */
export interface CollectionDisplay {
  processed: number;
  total: number;
  displayText: string;
  isComplete: boolean;
}

export interface ProgressDisplay {
  percentage: number;
  barColor: string;
  isComplete: boolean;
}

export interface StatusDisplay extends CrawlingStatusInfo {
  showErrorButton: boolean;
}
