/**
 * CrawlerEngine.ts
 * 크롤링 작업의 핵심 로직을 담당하는 엔진 클래스
 */

import { 
  crawlerEvents, 
  initializeCrawlingProgress, 
  updateProductListProgress, 
  updateProductDetailProgress,
  CRAWLING_STAGE
} from '../utils/progress.js';
import { getDatabaseSummaryFromDb, saveProductsToDb } from '../../database.js';
import { getConfig } from './config.js';
import { CrawlerState } from './CrawlerState.js';
import { ProductListCollector } from '../tasks/productList.js';
import { ProductDetailCollector } from '../tasks/productDetail.js';
import { saveProductsToFile, saveMatterProductsToFile } from '../utils/file.js';
import { 
  deduplicateAndSortMatterProducts, 
  validateDataConsistency 
} from '../utils/data-processing.js';
import { initializeCrawlingState } from '../utils/concurrency.js';
import { BrowserManager } from '../browser/BrowserManager.js';
import type {
  CrawlingSummary,
  FailedPageReport,
  FailedProductReport
} from '../utils/types.js';
import type { Product, MatterProduct } from '../../../../types.js';
import { debugLog } from '../../util.js';
import { configManager } from '../../ConfigManager.js';

export class CrawlerEngine {
  private state: CrawlerState;
  private isCrawling: boolean = false;
  private abortController: AbortController | null = null;
  private startTime: number = 0;
  private browserManager: BrowserManager | null = null;

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
    this.startTime = Date.now();

    const config = getConfig();
    this.browserManager = new BrowserManager(config);

    try {
      console.log('[CrawlerEngine] Starting crawling process...');
      
      // 초기 크롤링 상태 이벤트
      initializeCrawlingProgress('크롤링 초기화', CRAWLING_STAGE.INIT);
      
      await this.browserManager.initialize();

      if (!this.browserManager.isValid()) {
        console.error('[CrawlerEngine] BrowserManager is not initialized. Please call initialize first.');
        this.state.setStage('failed', '브라우저 초기화 실패');
        return false;
      }

      // 사용자 설정 가져오기 (CRAWL-RANGE-001)
      const userPageLimit = config.pageRangeLimit;

      // 1/2단계: 제품 목록 수집 시작 알림
      updateProductListProgress(0, 0, this.startTime);
      
      // 제품 목록 수집기 생성 (1단계)
      const productListCollector = new ProductListCollector(this.state, this.abortController, config, this.browserManager!);
      
      // 총 페이지 수 먼저 확인
      const totalPages = await productListCollector.getTotalPagesCached(true); // This will now use the instance config
      
      // 1단계 시작 - 총 페이지 수 알게 된 후 업데이트
      updateProductListProgress(0, totalPages, this.startTime);
      
      // 사용자 페이지 범위 설정이 있으면 적용 (CRAWL-RANGE-001)
      const listStartTime = Date.now();
      const progressUpdater = (processedPages: number) => {
        // 진행 상황 업데이트 - 1단계
        updateProductListProgress(processedPages, totalPages, listStartTime);
      };
      
      // 페이지별 작업 상태 전송 함수 설정
      productListCollector.setProgressCallback(progressUpdater);
      
      // 제품 목록 수집 실행
      const products = await productListCollector.collect(userPageLimit);

      // 1단계 완료 이벤트
      updateProductListProgress(totalPages, totalPages, listStartTime, true);

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
      const successRate = totalPages > 0 ? (totalPages - failedPages.length) / totalPages : 1;
      const successRatePercent = (successRate * 100).toFixed(1);
      
      // 1단계에서 실패 페이지가 있으면 중단 (원래 동작으로 복원)
      if (failedPages.length > 0) {
        const message = `[경고] 제품 목록 수집 성공률: ${successRatePercent}% (${totalPages - failedPages.length}/${totalPages}). 실패한 페이지가 있어 크롤링을 중단합니다.`;
        console.warn(`[CrawlerEngine] ${message}`);
        
        // 경고 이벤트 발생 및 크롤링 중단
        crawlerEvents.emit('crawlingWarning', {
          message,
          successRate: parseFloat(successRatePercent),
          failedPages: failedPages.length,
          totalPages,
          continueProcess: false // 중단 설정
        });
        
        // 크롤링 중단 상태로 설정
        this.state.setStage('failed', '제품 목록 수집 중 오류가 발생하여 크롤링이 중단되었습니다.');
        this.isCrawling = false;
        return false; // 함수 종료
      }

      // 2/2단계: 제품 상세 정보 수집 시작 알림
      const detailStartTime = Date.now();
      updateProductDetailProgress(0, products.length, detailStartTime);
      
      debugLog(`[CrawlerEngine] Found ${products.length} products to process. Starting detail collection...`);
      
      // 제품 상세 정보 수집기 생성 (2단계)
      const productDetailCollector = new ProductDetailCollector(this.state, this.abortController, config, this.browserManager); // Pass browserManager
      
      // 제품 상세 정보 수집 실행
      const matterProducts = await productDetailCollector.collect(products);

      // 2단계 완료 이벤트
      updateProductDetailProgress(
        products.length, 
        products.length, 
        detailStartTime, 
        true
      );

      // 중복 제거 및 정렬
      deduplicateAndSortMatterProducts(matterProducts);

      // 데이터 일관성 검증
      validateDataConsistency(products, matterProducts);

      // 제품 상세 결과 저장 및 처리
      await this.handleDetailCrawlingResults(matterProducts);

      console.log('[CrawlerEngine] Crawling process completed successfully.');
      this.state.setStage('completed', '크롤링이 성공적으로 완료되었습니다.');
      return true;
    } catch (error) {
      this.handleCrawlingError(error);
      return false;
    } finally {
      if (this.browserManager) {
        await this.browserManager.cleanupResources(); // Cleanup BrowserManager
        this.browserManager = null;
      }
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
      const currentConfig = getConfig(); // Call getConfig() once at the beginning

      // 페이지 정보 가져오기
      let totalPages = 0;
      let tempBrowserManager: BrowserManager | null = null; // Temporary BrowserManager for this method
      try {
        const tempController = new AbortController();
        // If a global browserManager exists and is initialized, use it. Otherwise, create a temporary one.
        if (this.browserManager && await this.browserManager.isValid()) {
          tempBrowserManager = this.browserManager;
        } else {
          tempBrowserManager = new BrowserManager(currentConfig);
          await tempBrowserManager.initialize(); // Initialize if created new
        }
        // 제품 목록 수집기 생성 시 config와 browserManager 전달
        const collector = new ProductListCollector(this.state, tempController, currentConfig, tempBrowserManager);
        totalPages = await collector.getTotalPagesCached(true);
      } catch (e) {
        console.error('[CrawlerEngine] Error getting total pages:', e);
        totalPages = 0;
      } finally {
        // If a temporary browserManager was created and initialized for this method, clean it up.
        // Do not clean up the global this.browserManager here.
        if (tempBrowserManager && tempBrowserManager !== this.browserManager) {
          await tempBrowserManager.cleanupResources();
        }
      }

      // 사이트 제품 수 계산
      const siteProductCount = totalPages * currentConfig.productsPerPage;
      
      // 사용자 설정 페이지 제한 확인
      const userPageLimit = currentConfig.pageRangeLimit;

      // 크롤링 범위 계산
      let crawlingRange;
      if (dbSummary.productCount === 0) {
        // 페이지 제한 적용
        const endPage = userPageLimit > 0 ? Math.min(userPageLimit, totalPages) : totalPages;
        crawlingRange = { startPage: 1, endPage };
      } else {
        const collectedPages = Math.floor(dbSummary.productCount / currentConfig.productsPerPage);
        let endPage = Math.max(1, totalPages - collectedPages);
        
        // 페이지 제한 적용
        if (userPageLimit > 0) {
          endPage = Math.min(endPage, userPageLimit);
        }
        
        crawlingRange = { startPage: 1, endPage };
      }

      // 선택된 페이지 범위에 따른 예상 제품 수 계산
      const selectedPageCount = crawlingRange.endPage - crawlingRange.startPage + 1;
      const estimatedProductCount = selectedPageCount * currentConfig.productsPerPage;
      
      // 예상 소요 시간 계산 (페이지당 평균 5초 기준)
      const estimatedTimePerPage = 5000; // 5초
      const estimatedTotalTime = selectedPageCount * estimatedTimePerPage;
      
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
        crawlingRange,
        // 추가 정보
        selectedPageCount,
        estimatedProductCount,
        estimatedTotalTime,
        userPageLimit: userPageLimit > 0 ? userPageLimit : undefined
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
        crawlingRange: { startPage: 1, endPage: 1 },
        selectedPageCount: 0,
        estimatedProductCount: 0,
        estimatedTotalTime: 0
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
  private async handleDetailCrawlingResults(matterProducts: MatterProduct[]): Promise<void> {
    console.log(`[CrawlerEngine] handleDetailCrawlingResults called with ${matterProducts.length} products`);
    
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

    // 설정에 따라 자동으로 DB에 저장
    // ConfigManager에서 설정을 직접 가져오기
    try {
      console.log('[CrawlerEngine] Fetching latest config from ConfigManager');
      
      const managerConfig = configManager.getConfig();
      console.log(`[CrawlerEngine] ConfigManager autoAddToLocalDB setting: ${managerConfig.autoAddToLocalDB}`);
    } catch (err) {
      console.error('[CrawlerEngine] Error accessing ConfigManager:', err);
    }
    
    // 로컬 설정 가져오기
    const config = getConfig();
    console.log('[CrawlerEngine] Auto DB save setting from local config:', config.autoAddToLocalDB);
    
    // 설정파일 재로드 시도
    try {
      console.log('[CrawlerEngine] Attempting to reload config before DB save decision');
      const { updateConfig } = await import('./config.js');
      // ConfigManager에서 최신 설정을 가져와 강제 업데이트
      
      const latestConfig = configManager.getConfig();
      
      // 기존 설정과 최신 설정의 autoAddToLocalDB 값 비교
      if (latestConfig.autoAddToLocalDB !== config.autoAddToLocalDB) {
        console.log(`[CrawlerEngine] Config mismatch detected! Updating autoAddToLocalDB from ${config.autoAddToLocalDB} to ${latestConfig.autoAddToLocalDB}`);
        updateConfig({ autoAddToLocalDB: latestConfig.autoAddToLocalDB });
      }
    } catch (err) {
      console.error('[CrawlerEngine] Error during config reload:', err);
    }
    
    // 최종 설정 다시 가져오기
    const finalConfig = getConfig();
    console.log(`[CrawlerEngine] FINAL autoAddToLocalDB setting: ${finalConfig.autoAddToLocalDB}`);
    
    if (finalConfig.autoAddToLocalDB) {
      try {
        // 자동 저장 옵션이 켜져 있으면 DB에 저장
        console.log('[CrawlerEngine] Automatically saving collected products to DB per user settings...');
        
        if (matterProducts.length === 0) {
          console.log('[CrawlerEngine] No products to save to DB.');
          crawlerEvents.emit('dbSaveSkipped', {
            message: '저장할 제품 정보가 없습니다.',
            count: 0
          });
        } else {
          
          console.log(`[CrawlerEngine] Calling saveProductsToDb with ${matterProducts.length} products`);
          
          const saveResult = await saveProductsToDb(matterProducts);
          
          // 저장 결과 로그
          console.log(`[CrawlerEngine] DB Save Result: ${saveResult.added} added, ${saveResult.updated} updated, ${saveResult.unchanged} unchanged, ${saveResult.failed} failed`);
          
          // 상태 이벤트 발생 - DB 저장 결과
          crawlerEvents.emit('dbSaveComplete', {
            success: true,
            added: saveResult.added,
            updated: saveResult.updated,
            unchanged: saveResult.unchanged,
            failed: saveResult.failed,
            duplicateInfo: saveResult.duplicateInfo
          });
        }
      } catch (err) {
        console.error('[CrawlerEngine] Error saving products to DB:', err);
        console.error('[CrawlerEngine] Error details:', err instanceof Error ? err.stack : String(err));
        
        // 오류 이벤트 발생
        crawlerEvents.emit('dbSaveError', {
          message: 'Failed to save products to DB',
          error: err instanceof Error ? err.message : String(err)
        });
      }
    } else {
      console.log('[CrawlerEngine] Automatic DB save is disabled in settings. Products not saved to DB.');
      
      // 사용자에게 수동 저장이 필요함을 알리는 이벤트 발생
      crawlerEvents.emit('dbSaveSkipped', {
        message: '설정에 따라 제품이 DB에 자동 저장되지 않았습니다. 검토 후 수동으로 추가해주세요.',
        count: matterProducts.length
      });
    }

    // 크롤링 결과 보고
    crawlerEvents.emit('crawlingComplete', {
      success: true,
      count: matterProducts.length,
      products: matterProducts,
      failedReport,
      autoSavedToDb: finalConfig.autoAddToLocalDB // 자동 저장 여부도 포함
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