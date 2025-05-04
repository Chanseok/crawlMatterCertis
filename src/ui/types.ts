// types.d.ts에서 공유 타입 import
import { 
  AppMode,
  DatabaseSummary,
  MatterProduct,
  ConcurrentCrawlingTask,
  ConcurrentTaskStatus,
  EventPayloadMapping
} from '../../types.js';

// UI 전용 타입 정의
// 크롤링 상태 타입 (UI 전용)
export type CrawlingStatus = 'idle' | 'running' | 'paused' | 'completed' | 'error' | 'initializing' | 'stopped';

// 로그 항목 타입 (UI 전용)
export interface LogEntry {
  timestamp: Date;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
}

// 확장된 크롤링 진행 상태 타입 (UI 전용)
export interface CrawlingProgress {
  status: CrawlingStatus;
  currentPage: number;
  totalPages: number;
  processedItems: number;
  totalItems: number;
  startTime: number;
  estimatedEndTime: number;
  newItems: number;
  updatedItems: number;
  percentage?: number;
  currentStep?: string;
  currentStage?: number; // 1=목록 수집, 2=상세정보 수집
  remainingTime?: number; // 예상 남은 시간 (초)
  elapsedTime?: number; // 경과 시간 (초)
  message?: string; // 사용자에게 표시할 명확한 메시지
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

// 공유 타입 re-export ('export type'으로 변경하여 isolatedModules 호환성 확보)
export type { 
  AppMode,
  DatabaseSummary,
  MatterProduct,
  ConcurrentCrawlingTask,
  ConcurrentTaskStatus,
  EventPayloadMapping
};