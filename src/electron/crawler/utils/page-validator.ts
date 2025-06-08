/**
 * page-validator.ts
 * 페이지 수집 데이터 완전성 검증을 위한 유틸리티
 */

import type { Product } from "../../../../types.js";
import { ValidationUtils } from "../../../shared/utils/ValidationUtils.js";

/**
 * 페이지 수집 완전성 검사 결과
 */
export type PageValidationResult = {
  isComplete: boolean; // 페이지가 완전히 수집되었는지 여부
  expectedCount: number; // 기대하는 제품 수
  actualCount: number; // 실제 수집된 제품 수
  missingIndices?: number[]; // 수집되지 않은 인덱스 (있는 경우)
  reason?: string; // 불완전한 이유 설명
};

/**
 * 페이지 데이터 완전성 검증 유틸리티
 */
export class PageValidator {
  /**
   * 페이지가 완전히 수집되었는지 검증
   * @deprecated Use ValidationUtils.validatePageCompleteness() instead
   * @param pageNumber 페이지 번호
   * @param products 수집된 제품 목록
   * @param isLastPage 마지막 페이지 여부
   * @param expectedCount 일반 페이지의 기대 제품 수 (기본값 12)
   * @param lastPageExpectedCount 마지막 페이지의 기대 제품 수 (알려진 경우)
   * @returns 검증 결과
   */
  public static validatePage(
    _pageNumber: number,
    products: Product[],
    isLastPage: boolean,
    expectedCount: number = 12,
    lastPageExpectedCount?: number
  ): PageValidationResult {
    const result = ValidationUtils.validatePageCompleteness(
      products,
      expectedCount,
      isLastPage,
      lastPageExpectedCount
    );

    return {
      isComplete: result.isComplete,
      expectedCount: result.expectedCount,
      actualCount: result.actualCount,
      missingIndices: result.missingIndices,
      reason: result.reason
    };
  }
  
  /**
   * 제품 데이터에 필수 필드가 누락되지 않았는지 검증
   * @deprecated Use ValidationUtils.validateProductData() instead
   * @param products 검증할 제품 목록
   * @returns 검증 결과 (유효한 제품 목록, 무효한 제품 목록)
   */
  public static validateProductData(
    products: Product[]
  ): { valid: Product[], invalid: Product[] } {
    const result = ValidationUtils.validateProductData(products);
    return {
      valid: result.valid,
      invalid: result.invalid
    };
  }
}
