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
 * 시스템 자원 사용 통계 (기존 types.d.ts에서 이관)
 */
export interface Statistics {
  timestamp: number;
  cpuUsage: number;
  memoryUsage: number;
  ramUsage?: number; // 이전 호환성을 위해 선택적으로 유지
  storageUsage?: number; // 이전 호환성을 위해 선택적으로 유지
}

/**
 * 크롤링 상태 열거형
 */
export type CrawlingStatus = 
  | 'idle' 
  | 'running' 
  | 'paused' 
  | 'completed' 
  | 'error' 
  | 'initializing' 
  | 'stopped' 
  | 'completed_stage_1';

/**
 * 크롤링 단계 열거형
 */
export type CrawlingStage = 
  | 'idle' 
  | 'productList:init' 
  | 'productList:collecting' 
  | 'productList:retrying' 
  | 'productList:complete'
  | 'validation:init'
  | 'validation:processing'
  | 'validation:complete'
  | 'productDetail:init' 
  | 'productDetail:collecting' 
  | 'productDetail:retrying' 
  | 'productDetail:complete'
  | 'complete' 
  | 'error';

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
