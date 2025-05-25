/**
 * 태스크 관리 관련 타입 정의
 * 백그라운드 작업, 스케줄링, 상태 추적 등에 관련된 타입들
 */

import { Status } from './common';

/**
 * 태스크 타입
 */
export type TaskType = 
  | 'crawling'
  | 'data_processing'
  | 'database_operation'
  | 'file_export'
  | 'system_maintenance';

/**
 * 태스크 우선순위
 */
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';

/**
 * 태스크 상태
 */
export type TaskStatus = Status | 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * 기본 태스크 인터페이스
 */
export interface BaseTask {
  id: string;
  type: TaskType;
  name: string;
  description?: string;
  priority: TaskPriority;
  status: TaskStatus;
  progress: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  estimatedDuration?: number;
  actualDuration?: number;
  error?: string;
  metadata?: Record<string, any>;
}

/**
 * 크롤링 태스크
 */
export interface CrawlingTask extends BaseTask {
  type: 'crawling';
  config: {
    pageLimit: number;
    retryCount: number;
    delayBetweenRequests: number;
  };
  progress: number;
  pagesProcessed: number;
  itemsCollected: number;
  errors: string[];
}

/**
 * 데이터 처리 태스크
 */
export interface DataProcessingTask extends BaseTask {
  type: 'data_processing';
  inputSize: number;
  outputSize?: number;
  processingSteps: string[];
  currentStep?: string;
}

/**
 * 태스크 통계
 */
export interface TaskStatistics {
  total: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  success: number;
  error: number;
  successRate: number;
  averageDuration: number;
}

/**
 * 태스크 이벤트
 */
export interface TaskEvent {
  taskId: string;
  type: 'created' | 'started' | 'progress' | 'completed' | 'failed' | 'cancelled';
  timestamp: Date;
  data?: any;
  message?: string;
}

/**
 * 태스크 매니저 상태
 */
export interface TaskManagerState {
  activeTasks: Record<string, BaseTask>;
  taskHistory: BaseTask[];
  statistics: TaskStatistics;
  isProcessing: boolean;
  maxConcurrentTasks: number;
  queuedTasks: BaseTask[];
}
