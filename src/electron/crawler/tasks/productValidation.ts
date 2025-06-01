/**
 * productValidation.ts
 * 로컬 DB와 중복 제품 필터링을 담당하는 1.5단계 클래스
 */

import { CrawlerState } from '../core/CrawlerState.js';
import type { Product, ValidationSummary, CrawlingProgress, CrawlerConfig } from '../../../../types.js';
import { getExistingProductUrls } from '../../database.js';

export class ProductValidationCollector {
  private state: CrawlerState;

  constructor(state: CrawlerState, _config: CrawlerConfig) {
    this.state = state;
  }

  /**
   * 1단계에서 수집된 제품들 중 로컬DB에 없는 제품들만 필터링
   */
  public async validateAndFilterProducts(
    products: Product[]
  ): Promise<{
    newProducts: Product[];
    existingProducts: Product[];
    duplicateProducts: Product[];
    validationSummary: ValidationSummary;
  }> {
    console.log(`[ProductValidation] 검증 시작: ${products.length}개 제품`);
    
    // 검증 시작 상태 업데이트
    this.updateValidationProgress({
      current: 0,
      total: products.length,
      percentage: 0,
      currentStep: "2/4단계: DB 중복 검증 중",
      message: `2/4단계: ${products.length}개 제품 유효성 검증 중`
    });
    
    // 로컬DB에서 기존 제품 URL들을 Set으로 조회 (성능 최적화)
    const existingUrls = await getExistingProductUrls();
    
    const newProducts: Product[] = [];
    const existingProducts: Product[] = [];
    const duplicateProducts: Product[] = [];
    
    // URL 기준으로 제품 분류
    const urlSeen = new Set<string>();
    
    products.forEach(product => {
      // 1단계 수집 과정에서의 중복 제품 감지
      if (urlSeen.has(product.url)) {
        duplicateProducts.push(product);
        return;
      }
      urlSeen.add(product.url);
      
      // 로컬DB와의 중복 확인
      if (existingUrls.has(product.url)) {
        existingProducts.push(product);
      } else {
        newProducts.push(product);
      }
    });

    const validationSummary: ValidationSummary = {
      totalProducts: products.length,
      newProducts: newProducts.length,
      existingProducts: existingProducts.length,
      duplicateProducts: duplicateProducts.length,
      skipRatio: ((existingProducts.length + duplicateProducts.length) / products.length) * 100,
      duplicateRatio: (duplicateProducts.length / products.length) * 100
    };

    // 중복률이 높은 경우 경고 로그
    if (validationSummary.duplicateRatio > 20) {
      console.warn(`[ProductValidation] 높은 중복률 감지: ${validationSummary.duplicateRatio.toFixed(1)}%`);
      console.warn('[ProductValidation] 크롤링 범위 설정을 재검토해주세요.');
    }

    // 최종 검증 상태 업데이트
    this.updateValidationProgress({
      current: products.length,
      total: products.length,
      percentage: 100,
      currentStep: "1.5/3단계: DB 중복 검증 완료",
      message: `검증 완료: 신규 ${newProducts.length}개, 기존 ${existingProducts.length}개, 중복 ${duplicateProducts.length}개`
    });

    console.log(`[ProductValidation] 검증 완료: 신규 ${newProducts.length}개, 기존 ${existingProducts.length}개, 중복 ${duplicateProducts.length}개`);
    
    return { 
      newProducts, 
      existingProducts, 
      duplicateProducts, 
      validationSummary 
    };
  }

  /**
   * 크롤링 범위의 적절성 검증 및 권장사항 생성
   */
  public validateCrawlingRange(validationSummary: ValidationSummary): {
    isRangeAppropriate: boolean;
    recommendations: string[];
  } {
    const recommendations: string[] = [];
    let isRangeAppropriate = true;

    // 기존 제품 비율이 너무 높은 경우
    if (validationSummary.skipRatio > 50) {
      isRangeAppropriate = false;
      recommendations.push('크롤링 범위가 너무 오래된 데이터를 포함하고 있습니다. 더 최신 페이지부터 수집하는 것을 권장합니다.');
    }

    // 중복 제품이 너무 많은 경우
    if (validationSummary.duplicateRatio > 10) {
      isRangeAppropriate = false;
      recommendations.push('동일한 제품이 여러 페이지에 중복 표시되고 있습니다. 사이트의 페이지 정렬 규칙을 재확인해주세요.');
    }

    // 신규 제품이 너무 적은 경우
    if (validationSummary.newProducts < 5 && validationSummary.totalProducts > 20) {
      recommendations.push('신규 제품이 매우 적습니다. 크롤링 설정을 재검토해주세요.');
    }

    return { isRangeAppropriate, recommendations };
  }

  /**
   * 진행 상태 업데이트 유틸리티 메소드
   */
  private updateValidationProgress(data: Partial<CrawlingProgress>): void {
    const currentProgressData = this.state.getProgressData();

    this.state.updateProgress({
      ...currentProgressData,
      ...data,
      stage: 2  // Stage 2: Validation
    });
  }
}
