// 크롤링 관련 타입 정의
export interface CrawledProduct {
  id: string;
  name: string;
  brand?: string;
  category?: string;
  certificationNumber?: string;
  certificationType?: string;
  url?: string;
  imageUrl?: string;
  // 기타 필요한 속성들
  [key: string]: any; // 추가 속성을 위한 인덱스 시그니처
}

// 크롤링 완료 이벤트 데이터 타입
export interface CrawlingCompleteData {
  success: boolean;
  products: CrawledProduct[];
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
