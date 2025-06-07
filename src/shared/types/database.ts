/**
 * 데이터베이스 관련 타입 정의
 * 제품 데이터, 데이터베이스 조작, 검색 등에 관련된 타입들
 */

import { BaseEntity, PaginationInfo, LoadingState, SaveState } from './common';

/**
 * Matter 인증 제품의 상세 정보
 */
export interface MatterProduct extends BaseEntity {
  url: string;
  pageId?: number;
  indexInPage?: number;
  manufacturer?: string;
  model?: string;
  deviceType?: string;
  certificateId?: string;
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

/**
 * 제품 기본 정보 (목록용)
 */
export interface Product {
  url: string;
  manufacturer?: string;
  model?: string;
  certificateId?: string;
  pageId?: number;
  indexInPage?: number;
}

/**
 * 데이터베이스 쿼리 파라미터
 */
export interface DatabaseQueryParams extends PaginationInfo {
  search?: string;
  manufacturer?: string;
  deviceType?: string;
  sortBy?: 'manufacturer' | 'model' | 'certificationDate';
  sortOrder?: 'asc' | 'desc';
}

/**
 * 데이터베이스 저장 결과
 */
export interface DatabaseSaveResult {
  success: boolean;
  message?: string;
  affected?: number;
  errors?: string[];
}

/**
 * 데이터베이스 상태
 */
export interface DatabaseState extends LoadingState, SaveState {
  products: Product[];
  totalProducts: number;
  pagination: PaginationInfo;
  searchQuery: string;
  filters: DatabaseFilters;
}

/**
 * 데이터베이스 필터
 */
export interface DatabaseFilters {
  manufacturer?: string;
  deviceType?: string;
  dateRange?: {
    start: Date;
    end: Date;
  };
}

/**
 * 제품 통계 정보
 */
export interface ProductStatistics {
  totalProducts: number;
  uniqueManufacturers: number;
  deviceTypes: Record<string, number>;
  monthlyGrowth: Record<string, number>;
  latestUpdate: Date;
}
