/**
 * page-crawler.ts
 * 제품 목록 페이지 크롤링을 담당하는 클래스
 * 전략 패턴을 사용하여 다양한 크롤링 방식 지원
 */

import { type CrawlerConfig } from '../core/config.js';
import { debugLog } from '../../util.js';
import { BrowserManager } from '../browser/BrowserManager.js';
import { PageOperationError } from '../utils/page-errors.js';
import { RawProductData, SitePageInfo } from './product-list-types.js';
import { ICrawlerStrategy } from '../strategies/crawler-strategy.js';
import { CrawlerStrategyFactory, CrawlerType } from '../strategies/crawler-strategy-factory.js';

/**
 * 페이지 크롤링 결과
 */
export interface PageCrawlResult {
  rawProducts: RawProductData[];
  url: string;
  pageNumber: number;
  attempt: number;
}

/**
 * 페이지 크롤러 클래스
 * 전략 패턴을 사용하여 다양한 크롤링 방식 지원
 */
export class PageCrawler {
  private crawlerStrategy: ICrawlerStrategy;
  private readonly config: CrawlerConfig;
  private readonly browserManager?: BrowserManager;
  private crawlerType: CrawlerType;

  /**
   * 페이지 크롤러 생성
   * @param browserManager 브라우저 매니저 인스턴스 (Playwright 전략에만 필요)
   * @param config 크롤러 설정
   * @param crawlerType 크롤링 전략 유형 ('playwright' 또는 'axios')
   */
  constructor(browserManager: BrowserManager, config: CrawlerConfig, crawlerType: CrawlerType = 'playwright') {
    this.config = config;
    this.browserManager = browserManager;
    this.crawlerType = crawlerType;
    
    // 설정된 크롤러 전략 초기화
    this.crawlerStrategy = CrawlerStrategyFactory.createStrategy(
      this.crawlerType, 
      this.config, 
      this.browserManager
    );
  }

  /**
   * 크롤링 전략 변경
   * @param crawlerType 크롤링 전략 유형 ('playwright' 또는 'axios')
   */
  public async switchCrawlerStrategy(crawlerType: CrawlerType): Promise<void> {
    if (this.crawlerType === crawlerType) {
      debugLog(`[PageCrawler] 이미 ${crawlerType} 전략을 사용 중입니다.`);
      return;
    }
    
    // 기존 전략 리소스 정리
    await this.crawlerStrategy.cleanup();
    
    // 새 전략으로 전환
    this.crawlerType = crawlerType;
    this.crawlerStrategy = CrawlerStrategyFactory.createStrategy(
      this.crawlerType, 
      this.config, 
      this.browserManager
    );
    
    // 새 전략 초기화
    await this.crawlerStrategy.initialize();
    debugLog(`[PageCrawler] 크롤링 전략을 ${crawlerType}로 변경했습니다.`);
  }
  
  /**
   * 현재 사용 중인 크롤링 전략 확인
   * @returns 현재 크롤링 전략 유형
   */
  public getCurrentStrategy(): CrawlerType {
    return this.crawlerType;
  }

  /**
   * 크롤러 초기화 (선택적)
   */
  public async initialize(): Promise<void> {
    await this.crawlerStrategy.initialize();
  }

  /**
   * 특정 페이지 번호의 제품 목록을 크롤링
   * @param pageNumber 페이지 번호
   * @param signal 중단 신호
   * @param attempt 시도 횟수
   * @returns 크롤링 결과
   */
  public async crawlPage(pageNumber: number, signal: AbortSignal, attempt: number = 1): Promise<PageCrawlResult> {
    try {
      return await this.crawlerStrategy.crawlPage(pageNumber, signal, attempt);
    } catch (error) {
      if (error instanceof PageOperationError) throw error;
      
      if (error instanceof Error) {
        throw new PageOperationError(
          `페이지 크롤링 중 오류 발생: ${error.message}`,
          pageNumber,
          attempt
        );
      }
      
      throw new PageOperationError(
        `알 수 없는 오류 발생`,
        pageNumber,
        attempt
      );
    }
  }

  /**
   * 사이트의 총 페이지 수와 마지막 페이지의 제품 수 조회
   * @returns 페이지 정보 (총 페이지 수, 마지막 페이지 제품 수)
   */
  public async fetchTotalPages(): Promise<{totalPages: number; lastPageProductCount: number}> {
    try {
      const sitePageInfo: SitePageInfo = await this.crawlerStrategy.fetchTotalPages();
      return {
        totalPages: sitePageInfo.totalPages,
        lastPageProductCount: sitePageInfo.lastPageProductCount
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`총 페이지 수를 가져오는데 실패했습니다: ${error.message}`);
      }
      throw new Error('총 페이지 수를 가져오는데 알 수 없는 오류가 발생했습니다.');
    }
  }

  /**
   * 리소스 정리
   */
  public async cleanup(): Promise<void> {
    await this.crawlerStrategy.cleanup();
  }
}
