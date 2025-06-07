/**
 * 공유 타입 시스템 메인 인덱스
 * 전체 애플리케이션에서 사용하는 모든 타입을 중앙에서 관리
 */

// 공통 기본 타입
export * from './common.js';

// 도메인별 타입
export * from './crawling.js';
export * from './database.js';
export * from './tasks.js';
export * from './ui.js';

// 레거시 호환성을 위한 재내보내기
// 기존 types.d.ts에서 사용되던 타입들의 별칭
export type {
  MatterProduct,
  Product,
  DatabaseQueryParams as QueryParams
} from './database.js';

// Add the missing types from common
export type {
  CrawlingStatus,
  CrawlingStage,
  TaskStatistics,
  LogEntry
} from './common.js';

export type {
  CrawlingProgress,
  CrawlingConfig,
  CrawlingSession,
  PageProcessingStatusValue
} from './crawling.js';

export type {
  BaseTask as Task,
  TaskType,
  TaskPriority,
  TaskStatus
} from './tasks.js';

export type {
  NotificationMessage,
  ViewState,
  SearchState,
  Theme
} from './ui.js';

// 기존 코드와의 호환성을 위한 타입 별칭
export type Statistics = import('./common.js').Statistics;
