/**
 * 공통 기본 타입 정의
 * 모든 도메인에서 공통으로 사용되는 기본 타입들
 */

export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface LoadingState {
  isLoading: boolean;
  error?: string | null;
}

export interface SaveState {
  isSaving: boolean;
  saveResult?: {
    success: boolean;
    message?: string;
  } | null;
}

export type Status = 'idle' | 'loading' | 'success' | 'error';

export interface ProgressInfo {
  percentage: number;
  message?: string;
}

/**
 * 시스템 자원 사용 통계 - re-export from main types
 */
export type { Statistics } from '../../../types.js';

/**
 * 크롤링 관련 타입 - re-export from main types
 */
export type { CrawlingStatus, CrawlingStage } from '../../../types.js';

/**
 * 작업 통계 정보
 */
export interface TaskStatistics {
  total: number;
  pending: number;
  running: number;
  success: number;
  error: number;
  stopped: number;
  attempting: number;
  successRate: number;
  averageTime: number;
}

/**
 * 로그 엔트리
 */
export interface LogEntry {
  timestamp: Date;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
  details?: string;
}
