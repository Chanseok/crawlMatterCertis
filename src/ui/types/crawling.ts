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
  added?: number;
  updated?: number;
  unchanged?: number;
  failed?: number;
  message?: string;
}

// DB 저장 스킵 이벤트 데이터 타입
export interface DbSaveSkippedData {
  reason?: string;
}

// 최종 크롤링 결과 데이터 타입
export interface FinalCrawlingResultData {
  collected: number;      // 크롤링 엔진에서 수집된 총 제품 수
  newItems: number;       // DB에 새로 추가된 제품 수
  updatedItems: number;   // DB에서 업데이트된 제품 수
  unchangedItems?: number; // 변경되지 않은 제품 수
  failedItems?: number;    // 저장 실패한 제품 수
}
