/**
 * page-validator.ts
 * 페이지 수집 데이터 완전성 검증을 위한 유틸리티
 */

import type { Product } from "../../../../types.js";
import { debugLog } from "../../util.js";

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
   * @param pageNumber 페이지 번호
   * @param products 수집된 제품 목록
   * @param isLastPage 마지막 페이지 여부
   * @param expectedCount 일반 페이지의 기대 제품 수 (기본값 12)
   * @param lastPageExpectedCount 마지막 페이지의 기대 제품 수 (알려진 경우)
   * @returns 검증 결과
   */
  public static validatePage(
    pageNumber: number,
    products: Product[],
    isLastPage: boolean,
    expectedCount: number = 12,
    lastPageExpectedCount?: number
  ): PageValidationResult {
    // 마지막 페이지의 경우 특정 개수 검증 안함 (lastPageExpectedCount가 제공된 경우 제외)
    const targetCount = isLastPage && lastPageExpectedCount === undefined ? 
      undefined : (isLastPage ? lastPageExpectedCount : expectedCount);
    
    const actualCount = products.length;
    
    // 기대 제품 수가 없거나 실제 수집된 제품 수가 기대치와 일치하면 완전함
    if (targetCount === undefined || actualCount >= targetCount) {
      return {
        isComplete: true,
        expectedCount: targetCount || actualCount,
        actualCount
      };
    }
    
    // 제품 누락이 있는지 확인 (인덱스 기반)
    const presentIndices = new Set(
      products.map(p => p.indexInPage).filter(i => i !== undefined)
    );
    
    const missingIndices = Array.from(
      { length: targetCount },
      (_, i) => i
    ).filter(i => !presentIndices.has(i));
    
    debugLog(`[PageValidator] 페이지 ${pageNumber} 검증: ${actualCount}/${targetCount} 제품 수집됨. 누락 인덱스: ${missingIndices.join(', ')}`);
    
    return {
      isComplete: false,
      expectedCount: targetCount,
      actualCount,
      missingIndices: missingIndices.length > 0 ? missingIndices : undefined,
      reason: `필요한 ${targetCount}개 중 ${actualCount}개만 수집됨${missingIndices.length > 0 ? `. 누락된 인덱스: ${missingIndices.join(", ")}` : ''}`
    };
  }
  
  /**
   * 제품 데이터에 필수 필드가 누락되지 않았는지 검증
   * @param products 검증할 제품 목록
   * @returns 검증 결과 (유효한 제품 목록, 무효한 제품 목록)
   */
  public static validateProductData(
    products: Product[]
  ): { valid: Product[], invalid: Product[] } {
    const valid: Product[] = [];
    const invalid: Product[] = [];
    
    products.forEach(product => {
      // 필수 필드 확인 (url은 항상 필요)
      const hasMandatoryFields = !!product.url;
      
      // 최소 제품 식별 정보 확인 (제조사, 모델, 인증 ID 중 하나 이상 있어야 함)
      const hasIdentificationInfo = !!(
        product.manufacturer || 
        product.model || 
        product.certificateId
      );
      
      if (hasMandatoryFields && hasIdentificationInfo) {
        valid.push(product);
      } else {
        invalid.push(product);
      }
    });
    
    return { valid, invalid };
  }
}
