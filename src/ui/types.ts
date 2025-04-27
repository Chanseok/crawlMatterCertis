// Matter 인증 제품 정보에 대한 타입 정의
export interface MatterProduct {
  id: string;
  manufacturer: string;
  model: string;
  deviceType: string;
  certificationId: string;
  certificationDate: string;
  softwareVersion: string;
  hardwareVersion: string;
  vid: string;
  pid: string;
  familySku: string;
  familyVariantSku: string;
  firmwareVersion: string;
  certificateId: string;
  familyId: string;
  tisTrpTested: string;
  specificationVersion: string;
  transportInterface: string;
  primaryDeviceTypeId: string;
  applicationCategories: string[];
}

// 앱 모드 타입
export type AppMode = 'development' | 'production';

// 크롤링 상태 타입
export type CrawlingStatus = 'idle' | 'running' | 'paused' | 'completed' | 'error';

// 로그 항목 타입
export interface LogEntry {
  timestamp: Date;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
}

// 크롤링 진행 상태 타입
export interface CrawlingProgress {
  current: number;
  total: number;
  percentage: number;
  currentStep: string;
  remainingTime?: number; // 예상 남은 시간 (초)
  elapsedTime: number; // 경과 시간 (초)
}

// 데이터베이스 요약 정보 타입
export interface DatabaseSummary {
  totalProducts: number;
  lastUpdated: Date | null;
  newlyAddedCount: number; // 마지막 크롤링에서 새로 추가된 항목 수
}