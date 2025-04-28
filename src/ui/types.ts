// Matter 인증 제품 정보에 대한 타입 정의
export interface MatterProduct {
    url: string;
    manufacturer?: string;
    model?: string;
    certificateId?: string;
    pageId?: number;
    indexInPage?: number;
}

// Define the structure for detailed product info
export interface ProductDetail  {
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

// 앱 모드 타입
export type AppMode = 'development' | 'production';

// 크롤링 상태 타입
export type CrawlingStatus = 'idle' | 'running' | 'paused' | 'completed' | 'error' | 'initializing' | 'stopped';

// 로그 항목 타입
export interface LogEntry {
  timestamp: Date;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
}

// 크롤링 진행 상태 타입
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
  remainingTime?: number; // 예상 남은 시간 (초)
  elapsedTime?: number; // 경과 시간 (초)
}

// 데이터베이스 요약 정보 타입
export interface DatabaseSummary {
  totalProducts: number;
  productCount: number; // 총 제품 수에 대한 별칭(alias) - 호환성을 위해 유지
  lastUpdated: Date | null;
  newlyAddedCount: number; // 마지막 크롤링에서 새로 추가된 항목 수
}

// 동시 처리 작업 상태 타입
export type ConcurrentTaskStatus = 'pending' | 'running' | 'success' | 'error' | 'stopped';

export interface ConcurrentCrawlingTask {
  pageNumber: number;
  status: ConcurrentTaskStatus;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
}

// EventPayloadMapping을 이 파일에서 정의 및 export
export interface EventPayloadMapping {
  statistics: any;
  crawlingProgress: CrawlingProgress;
  crawlingComplete: { success: boolean; count: number };
  crawlingError: { message: string; details?: string };
  dbSummary: DatabaseSummary;
  getStaticData: any;
  products: MatterProduct[];
  crawlingTaskStatus: ConcurrentCrawlingTask[];
  crawlingStopped: ConcurrentCrawlingTask[];
}