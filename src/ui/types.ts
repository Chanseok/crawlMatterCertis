// types.d.ts에서 공유 타입 import
import {
  AppMode,
  DatabaseSummary,
  MatterProduct,
  CrawlingProgress,
  ConcurrentCrawlingTask,
  ConcurrentTaskStatus,
  EventPayloadMapping
} from '../../types.js';

// Re-export these types for use throughout the UI
export type {
  AppMode,
  DatabaseSummary,
  MatterProduct,
  CrawlingProgress,
  ConcurrentCrawlingTask,
  ConcurrentTaskStatus,
  EventPayloadMapping
};

// UI 전용 타입 정의
// 로그 항목 타입 (UI 전용) - import from shared types
export type { LogEntry } from '../shared/types/ui.js';

// 사이트 상태 정보 타입
export interface StatusStore {
  isChecking: boolean;
  siteConnected: boolean;
  lastCheckedAt: number | null;
  isCrawling: boolean;
  crawlingStartedAt: number | null;
  crawlingFinishedAt: number | null;
  currentPage: number;
  totalPages: number;
  lastPageProductCount: number;
  targetPageCount: number; // 사용자가 설정한 페이지 범위 (새로 추가)
  foundProducts: number;
  detailProgress: number;
  detailTotal: number;
}

// ProductDetail은 UI 전용이므로 유지
export interface ProductDetail {
  url: string;
  pageId?: number;
  indexInPage?: number;
  id?: string;
  manufacturer?: string;
  model?: string;
  deviceType?: string;
  certificationId?: string;
  certificationDate?: string | Date;
  softwareVersion?: string;
  hardwareVersion?: string;
  vid?: string;
  pid?: string;
  familySku?: string;
  familyVariantSku?: string;
  firmwareVersion?: string;
  familyId?: string;
  tisTrpTested?: string;
  specificationVersion?: string;
  transportInterface?: string;
  primaryDeviceTypeId?: string;
  applicationCategories?: string[];
}