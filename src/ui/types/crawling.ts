import type { MatterProduct } from '../../../types';

// 크롤링 완료 이벤트 데이터 타입
export interface CrawlingCompleteData {
  success: boolean;
  products: MatterProduct[];
  autoSavedToDb?: boolean;
  timestamp?: number;
  message?: string;
}

// DB 저장 완료 이벤트 데이터 타입
export interface DbSaveCompleteData {
  success: boolean;
  count?: number;
  message?: string;
}

// DB 저장 스킵 이벤트 데이터 타입
export interface DbSaveSkippedData {
  reason?: string;
}
