// types.d.ts에서 공유 타입 import
import { 
  AppMode,
  DatabaseSummary,
  MatterProduct,
  ConcurrentCrawlingTask,
  ConcurrentTaskStatus,
  EventPayloadMapping,
  CrawlingStatus,    // 공유 타입 import
  CrawlingProgress   // 공유 타입 import
} from '../../types.js';

// UI 전용 타입 정의
// 로그 항목 타입 (UI 전용)
export interface LogEntry {
  timestamp: Date;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
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

// 공유 타입 re-export
export type { 
  AppMode,
  DatabaseSummary,
  MatterProduct,
  ConcurrentCrawlingTask,
  ConcurrentTaskStatus,
  EventPayloadMapping,
  CrawlingStatus,
  CrawlingProgress
};