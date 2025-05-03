/**
 * CrawlerEngine.ts
 * 크롤링 작업의 핵심 로직을 담당하는 엔진 클래스
 */

import { EventEmitter } from 'events';
import { crawlerEvents } from '../utils/progress.js';
import { getDatabaseSummaryFromDb } from '../../database.js';
import { getConfig } from './config.js';
import { CrawlerState } from './CrawlerState.js';
import { ProductListCollector } from '../tasks/productList.js';
import { ProductDetailCollector } from '../tasks/productDetail.js';
import { saveProductsToFile, saveMatterProductsToFile } from '../utils/file.js';
import { deduplicateAndSortProducts, deduplicateAndSortMatterProducts, validateDataConsistency } from '../utils/data-processing.js';
import { initializeCrawlingState } from '../utils/concurrency.js';
import type {
  CrawlingSummary,
  CrawlResult,
  DetailCrawlResult,
  FailedPageReport,
  FailedProductReport
} from '../utils/types.js';
import type { Product, MatterProduct } from '../../../../types.d.ts';
import type { CrawlingProgress } from '../../../ui/types.js';
import { debugLog } from '../../util.js';

export class CrawlerEngine {
  private state: CrawlerState;
  private isCrawling: boolean = false;
  private abortController: AbortController | null = null;

  constructor() {
    this.state = new CrawlerState();
  }

  /**
   * 크롤링이 현재 진행 중인지 확인
   */
  public isRunning(): boolean {
    return this.isCrawling;
  }

  /**
   * 크롤링 작업을 시작
   */
  public async startCrawling(): Promise<boolean> {
    if (this.isCrawling) {
      console.log('[CrawlerEngine] Crawling is already in progress.');
      return false;
    }

    // 크롤링 상태 초기화
    initializeCrawlingState();
    this.isCrawling = true;
    this.abortController = new AbortController();

    try {
      console.log('[CrawlerEngine] Starting crawling process...');

      // 1단계: 제품 목록 수집
      const productListCollector = new ProductListCollector(this.state, this.abortController);
      const products = await productListCollector.collect();

      // 중단 여부 확인 - 명시적으로 요청된 중단만 처리
      if (this.abortController.signal.aborted) {
        console.log('[CrawlerEngine] Crawling was explicitly stopped after product list collection.');
        this.isCrawling = false;
        return true;
      }

      // 제품 목록 결과 저장
      this.handleListCrawlingResults(products);

      // 치명적 오류 확인 및 처리
      if (this.state.hasCriticalFailures()) {
        const message = '제품 목록 수집 중 심각한 오류가 발생했습니다. 크롤링 중단.';
        console.error(`[CrawlerEngine] ${message}`);
        this.state.reportCriticalFailure(message);
        this.isCrawling = false;
        return false;
      }

      if (products.length === 0) {
        console.log('[CrawlerEngine] No products found to process. Crawling complete.');
        this.isCrawling = false;
        return true;
      }

      // 성공률 확인
      const failedPages = this.state.getFailedPages();
      const totalPages = this.state.getTotalPagesCount();
      const successRate = totalPages > 0 ? (totalPages - failedPages.length) / totalPages : 1;
      const successRatePercent = (successRate * 100).toFixed(1);
      
      if (successRate < 1) {
        const message = `제품 목록 수집 성공률이 100%가 아닙니다(${successRatePercent}%). 2단계 크롤링을 진행하지 않습니다.`;
        console.warn(`[CrawlerEngine] ${message}`);
        this.state.setStage('completed', message);
        this.isCrawling = false;
        
        // 성공률이 100%가 아닌 경우 UI에 알림
        crawlerEvents.emit('crawlingWarning', {
          message,
          successRate: parseFloat(successRatePercent),
          failedPages: failedPages.length,
          totalPages
        });
        
        return true;
      }

      // 2단계: 제품 상세 정보 수집
      debugLog(`[CrawlerEngine] Found ${products.length} products to process. Starting detail collection...`);
      const productDetailCollector = new ProductDetailCollector(this.state, this.abortController);
      const matterProducts = await productDetailCollector.collect(products);

      // 중복 제거 및 정렬
      deduplicateAndSortMatterProducts(matterProducts);

      // 데이터 일관성 검증
      validateDataConsistency(products, matterProducts);

      // 제품 상세 결과 저장 및 처리
      this.handleDetailCrawlingResults(matterProducts);

      console.log('[CrawlerEngine] Crawling process completed successfully.');
      this.state.setStage('completed', '크롤링이 성공적으로 완료되었습니다.');
      return true;
    } catch (error) {
      this.handleCrawlingError(error);
      return false;
    } finally {
      // 모든 작업이 완료되었을 때만 크롤링 상태 변경
      this.isCrawling = false;

      // 이 시점에서 명시적으로 정리 - 리소스 누수 방지
      if (this.abortController && !this.abortController.signal.aborted) {
        // 모든 작업이 완료된 후 정리 목적으로만 abort 신호 발생
        this.abortController.abort('cleanup');
      }
    }
  }

  /**
   * 크롤링 작업을 중지
   */
  public stopCrawling(): boolean {
    if (!this.isCrawling || !this.abortController) {
      console.log('[CrawlerEngine] No crawling in progress to stop');
      return false;
    }

    console.log('[CrawlerEngine] Explicitly stopping crawling by user request');
    this.abortController.abort('user_request'); // 중단 이유 추가
    return true;
  }

  /**
   * 크롤링 상태 체크 요약 정보 반환
   */
  public async checkCrawlingStatus(): Promise<CrawlingSummary> {
    try {
      // 데이터베이스 정보 가져오기
      const dbSummary = await getDatabaseSummaryFromDb();

      // 페이지 정보 가져오기
      let totalPages = 0;
      try {
        const tempController = new AbortController();
        const collector = new ProductListCollector(this.state, tempController);
        totalPages = await collector.getTotalPagesCached(true);
      } catch (e) {
        console.error('[CrawlerEngine] Error getting total pages:', e);
        totalPages = 0;
      }

      // 사이트 제품 수 계산
      const config = getConfig();
      const siteProductCount = totalPages * config.productsPerPage;

      // 크롤링 범위 계산
      let crawlingRange;
      if (dbSummary.productCount === 0) {
        crawlingRange = { startPage: 1, endPage: totalPages };
      } else {
        const collectedPages = Math.floor(dbSummary.productCount / config.productsPerPage);
        const endPage = Math.max(1, totalPages - collectedPages);
        crawlingRange = { startPage: 1, endPage };
      }

      const safeDbSummary = {
        ...dbSummary,
        lastUpdated: dbSummary.lastUpdated ? dbSummary.lastUpdated.toISOString() : null
      };

      return {
        dbLastUpdated: safeDbSummary.lastUpdated,
        dbProductCount: safeDbSummary.productCount,
        siteTotalPages: totalPages,
        siteProductCount,
        diff: siteProductCount - dbSummary.productCount,
        needCrawling: siteProductCount > dbSummary.productCount,
        crawlingRange
      };
    } catch (error) {
      console.error("[CrawlerEngine] Error in checkCrawlingStatus:", error);
      return {
        error: error instanceof Error ? error.message : String(error),
        dbLastUpdated: null,
        dbProductCount: 0,
        siteTotalPages: 0,
        siteProductCount: 0,
        diff: 0,
        needCrawling: false,
        crawlingRange: { startPage: 1, endPage: 1 }
      };
    }
  }

  /**
   * 제품 목록 크롤링 결과 처리 함수
   */
  private handleListCrawlingResults(products: Product[]): void {
    // 제품 목록 결과 파일로 저장
    try {
      saveProductsToFile(products);
    } catch (err) {
      console.error('[CrawlerEngine] Failed to save products json:', err);
    }

    // 결과 이벤트 발행
    const failedPages = this.state.getFailedPages();
    const failedPageErrors = this.state.getFailedPageErrors();

    // 실패 보고서 생성
    let failedReport: FailedPageReport[] = [];
    if (failedPages.length > 0) {
      failedReport = failedPages.map(pageNumber => ({
        pageNumber,
        errors: failedPageErrors[pageNumber] || []
      }));
      crawlerEvents.emit('crawlingFailedPages', failedReport);
    }

    // 크롤링 결과 중간 보고
    crawlerEvents.emit('crawlingPhase1Complete', {
      success: true,
      count: products.length,
      products: products,
      failedReport
    });
  }

  /**
   * 제품 상세 정보 크롤링 결과 처리 함수
   */
  private handleDetailCrawlingResults(matterProducts: MatterProduct[]): void {
    // 제품 상세 정보 결과 파일로 저장
    try {
      saveMatterProductsToFile(matterProducts);
    } catch (err) {
      console.error('[CrawlerEngine] Failed to save matter products json:', err);
    }

    // 결과 이벤트 발행
    const failedProducts = this.state.getFailedProducts();
    const failedProductErrors = this.state.getFailedProductErrors();

    // 실패 보고서 생성
    let failedReport: FailedProductReport[] = [];
    if (failedProducts.length > 0) {
      failedReport = failedProducts.map(url => ({
        url,
        errors: failedProductErrors[url] || []
      }));
      crawlerEvents.emit('crawlingFailedProducts', failedReport);
    }

    // 크롤링 결과 보고
    crawlerEvents.emit('crawlingComplete', {
      success: true,
      count: matterProducts.length,
      products: matterProducts,
      failedReport
    });
  }

  /**
   * 크롤링 오류 처리
   */
  private handleCrawlingError(error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[CrawlerEngine] Error during crawling process:', errorMessage);

    this.state.reportCriticalFailure(`크롤링 과정에서 오류가 발생했습니다: ${errorMessage}`);

    crawlerEvents.emit('crawlingError', {
      message: 'Crawling process failed',
      details: errorMessage
    });
  }
}