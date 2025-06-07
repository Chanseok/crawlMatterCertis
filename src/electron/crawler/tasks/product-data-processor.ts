/**
 * product-data-processor.ts
 * 수집된 원시 제품 데이터를 처리하고 변환하는 클래스
 */

import { Product } from '../../../../types.js';
import { RawProductData } from './product-list-types.js';
import { PageIndexManager } from '../utils/page-index-manager.js';

/**
 * 제품 데이터 처리기
 */
export class ProductDataProcessor {
  /**
   * 원시 제품 데이터를 최종 제품 객체로 변환
   * @param rawProducts 크롤링된 원시 제품 데이터
   * @param sitePageNumber 사이트 페이지 번호
   * @param offset 인덱스 오프셋
   * @returns 처리된 제품 객체 배열
   */
  public mapRawProductsToProducts(
    rawProducts: RawProductData[],
    sitePageNumber: number,
    offset: number
  ): Product[] {
    return rawProducts.map((product) => {
      const { siteIndexInPage } = product;
      const { pageId, indexInPage } = PageIndexManager.mapToLocalIndexing(
        sitePageNumber,
        siteIndexInPage,
        offset
      );
      const { siteIndexInPage: _, ...rest } = product;
      return {
        ...rest,
        pageId,
        indexInPage
      };
    });
  }

  /**
   * 기존 제품 목록과 새로 수집한 제품 목록을 병합하고 중복 제거
   * @param existingProducts 기존 제품 목록
   * @param newProducts 새로 수집한 제품 목록
   * @returns 병합하고 중복 제거된 제품 목록
   */
  public mergeAndDeduplicateProductLists(
    existingProducts: Product[],
    newProducts: Product[]
  ): Product[] {
    const productMap = new Map<string, Product>();

    // 기존 제품 추가
    for (const product of existingProducts) {
      if (product.url) {
        productMap.set(product.url, product);
      }
    }
    
    // 새로운 제품 추가 (중복 시 덮어씀)
    for (const product of newProducts) {
      if (product.url) {
        productMap.set(product.url, product);
      }
    }
    
    // 맵에서 제품을 추출하고 정렬
    const mergedProducts = Array.from(productMap.values());
    mergedProducts.sort((a, b) => {
      if ((a.pageId ?? -1) === (b.pageId ?? -1)) {
        return (a.indexInPage ?? -1) - (b.indexInPage ?? -1);
      }
      return (a.pageId ?? -1) - (b.pageId ?? -1);
    });
    
    return mergedProducts;
  }
}
