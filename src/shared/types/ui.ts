/**
 * UI 관련 타입 정의
 * 사용자 인터페이스, 상태 관리, 이벤트 등에 관련된 타입들
 */

import { Status } from './common';

/**
 * UI 테마 설정
 */
export type Theme = 'light' | 'dark' | 'system';

/**
 * 모달 상태
 */
export interface ModalState {
  isOpen: boolean;
  type?: 'confirm' | 'alert' | 'form';
  title?: string;
  message?: string;
  data?: any;
}

/**
 * 알림 메시지
 */
export interface NotificationMessage {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  message: string;
  duration?: number;
  dismissible?: boolean;
  timestamp: Date;
}

/**
 * 로그 엔트리
 */
export interface LogEntry {
  id: string;
  message: string;
  type: 'info' | 'error' | 'warning' | 'success';
  timestamp: Date;
  source?: string;
  details?: any;
}

/**
 * 로그 필터 상태
 */
export interface LogFilterState {
  types: Array<'info' | 'error' | 'warning' | 'success'>;
  search: string;
  timeRange?: {
    start: Date;
    end: Date;
  };
}

/**
 * UI 뷰 상태
 */
export interface ViewState {
  currentTab: string;
  sidebarCollapsed: boolean;
  theme: Theme;
  notifications: NotificationMessage[];
  modal: ModalState;
}

/**
 * 검색 상태
 */
export interface SearchState {
  query: string;
  isSearching: boolean;
  results: any[];
  filters: Record<string, any>;
}

/**
 * 태스크 상태 표시용 인터페이스
 */
export interface TaskDisplayInfo {
  id: string;
  name: string;
  status: Status;
  progress?: number;
  startTime: Date;
  endTime?: Date;
  message?: string;
}

/**
 * 컴포넌트 크기 설정
 */
export type ComponentSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

/**
 * 컴포넌트 변형
 */
export type ComponentVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'link';

/**
 * 버튼 상태
 */
export interface ButtonState {
  isLoading?: boolean;
  isDisabled?: boolean;
  variant?: ComponentVariant;
  size?: ComponentSize;
}
