/**
 * page-index-manager.ts
 * 크롤러 페이지 인덱싱 관리 유틸리티
 */

import { getDatabaseSummaryFromDb } from "../../database.js";
import { getConfig } from "../core/config.js";

/**
 * 사이트 페이지 번호와 로컬 데이터베이스 인덱싱 간의 변환을 관리하는 유틸리티 클래스
 */
export class PageIndexManager {
  /**
   * 사이트 페이지 번호를 내부 인덱싱용 sitePageNumber로 변환
   * 
   * @param sitePage 사이트에서의 페이지 번호 (1부터 시작)
   * @param totalPages 총 페이지 수
   * @returns 내부 인덱싱용 sitePageNumber (최신 페이지가 0부터 시작)
   */
  public static toSitePageNumber(sitePage: number, totalPages: number): number {
    return totalPages - sitePage;
  }

  /**
   * 마지막 페이지의 제품 수를 기준으로 옵셋 계산
   * 
   * @param lastPageProductCount 마지막 페이지의 제품 수
   * @returns 옵셋 값 (마지막 페이지가 꽉 차 있으면 0)
   */
  public static calculateOffset(lastPageProductCount: number): number {
    const config = getConfig();
    const productsPerPage = config.productsPerPage || 12;
    
    // 마지막 페이지가 꽉 차 있으면 옵셋 없음
    if (lastPageProductCount === productsPerPage) {
      return 0;
    }
    
    // 마지막 페이지에 비어 있는 슬롯 수가 옵셋
    return productsPerPage - lastPageProductCount;
  }

  /**
   * 사이트 페이지 번호와 인덱스를 로컬 pageId와 indexInPage로 변환
   * 
   * @param sitePageNumber 내부 인덱싱용 사이트 페이지 번호 (0이 최신 페이지)
   * @param siteIndexInPage 페이지 내 제품 인덱스 (0부터 시작)
   * @param offset 옵셋 값 (calculateOffset으로 계산)
   * @returns 로컬 데이터베이스용 pageId와 indexInPage
   */
  public static mapToLocalIndexing(
    sitePageNumber: number, 
    siteIndexInPage: number, 
    offset: number
  ): { pageId: number, indexInPage: number } {
    const config = getConfig();
    const productsPerPage = config.productsPerPage || 12;
    
    // 절대 위치 계산: 12*sitePageNumber + siteIndexInPage - offset
    let absolutePosition = (productsPerPage * sitePageNumber) + siteIndexInPage - offset;
    
    // 음수가 나오지 않도록 보정
    if (absolutePosition < 0) {
      absolutePosition = siteIndexInPage;
    }
    
    // pageId와 indexInPage 계산
    const pageId = Math.floor(absolutePosition / productsPerPage);
    const indexInPage = absolutePosition % productsPerPage;
    
    return { pageId, indexInPage };
  }

  /**
   * 크롤링 범위를 계산하는 함수
   * @param totalSitePages 사이트의 총 페이지 수
   * @param lastPageProductCount 마지막 페이지의 제품 수
   * @param userPageLimit 사용자가 설정한 페이지 수 제한 (선택적)
   */
  public static async calculateCrawlingRange(
    totalSitePages: number,
    lastPageProductCount: number,
    userPageLimit: number = 0
  ): Promise<{ startPage: number, endPage: number }> {
    // DB 요약 정보를 가져옴
    const dbSummary = await getDatabaseSummaryFromDb();
    const config = getConfig();
    const productsPerPage = config.productsPerPage || 12;
    
    // Offset 계산 - 마지막 페이지의 제품 수를 기반으로
    const offset = PageIndexManager.calculateOffset(lastPageProductCount);
    
    // 이미 수집된 페이지 수 계산
    const collectedPages = Math.ceil(dbSummary.productCount / productsPerPage);
    
    console.log(`[PageIndexManager] 크롤링 범위 계산: 총 페이지=${totalSitePages}, DB 제품 수=${dbSummary.productCount}, 마지막 페이지 제품=${lastPageProductCount}, offset=${offset}`);

    // 로컬DB가 비어있는 경우
    if (collectedPages === 0) {
      console.log('[PageIndexManager] DB가 비어있음. 마지막 페이지부터 크롤링 시작');
      
      // 사이트의 마지막 페이지부터 시작
      const startPage = totalSitePages;
      // 설정된 페이지 수만큼 수집 (제한이 0이면 전체 수집)
      const endPage = userPageLimit > 0 
        ? Math.max(1, totalSitePages - userPageLimit + 1) 
        : 1;
        
      console.log(`[PageIndexManager] 초기 크롤링 범위: 페이지 ${startPage}부터 ${endPage}까지`);
      return { startPage, endPage };
    }
    
    // 로컬DB에 이미 데이터가 있는 경우
    // 사이트 페이지 기준으로 가장 작은 페이지 번호부터 시작
    const startPage = Math.max(1, totalSitePages - collectedPages);
    
    // 사용자 설정 페이지 수에 따른 종료 페이지 결정
    const pagesToCollect = userPageLimit > 0 ? userPageLimit : totalSitePages - collectedPages;
    const endPage = Math.max(1, startPage - pagesToCollect + 1);
    
    console.log(`[PageIndexManager] 추가 크롤링 범위: 페이지 ${startPage}부터 ${endPage}까지 (이미 ${collectedPages}페이지 수집됨)`);
    return { startPage, endPage };
  }
}