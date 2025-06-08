/**
 * crawler-strategy.ts
 * 크롤링 전략 인터페이스 정의
 */

import type { RawProductData, SitePageInfo } from '../tasks/product-list-types.js';

/**
 * 크롤러 전략 인터페이스
 * Playwright 또는 Axios/Cheerio 등 다양한 구현체를 위한 공통 인터페이스
 */
export interface ICrawlerStrategy {
  /**
   * 전략 초기화
   */
  initialize(): Promise<void>;

  /**
   * 전체 페이지 수와 마지막 페이지 제품 수 조회
   */
  fetchTotalPages(): Promise<SitePageInfo>;

  /**
   * 특정 페이지 번호의 제품 목록 크롤링
   * @param pageNumber 페이지 번호
   * @param signal 중단 신호
   * @param attempt 시도 횟수
   */
  crawlPage(pageNumber: number, signal: AbortSignal, attempt: number): Promise<{
    rawProducts: RawProductData[];
    url: string;
    pageNumber: number;
    attempt: number;
  }>;

  /**
   * 리소스 정리
   */
  cleanup(): Promise<void>;
}
