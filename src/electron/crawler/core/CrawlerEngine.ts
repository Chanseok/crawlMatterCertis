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
import { PageIndexManager } from '../utils/page-index-manager.js';
import type {
  CrawlingSummary,
  FailedPageReport,
  FailedProductReport
} from '../utils/types.js';
import type { Product, MatterProduct, PageProcessingStatusItem } from '../../../../types.js'; // Added PageProcessingStatusItem
import { debugLog } from '../../util.js';
import { configManager } from '../../ConfigManager.js';

export class CrawlerEngine {
  private state: CrawlerState;
  private isCrawling: boolean = false;
  private abortController: AbortController | null = null;
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

    // Get the latest configuration AT THE START of the crawling process
    const currentConfig = configManager.getConfig();
    
    // 배치 처리 설정 가져오기
    const batchSize = currentConfig.batchSize || 30; // 기본값 30페이지
    const batchDelayMs = currentConfig.batchDelayMs || 2000; // 기본값 2초
    const enableBatchProcessing = currentConfig.enableBatchProcessing !== false; // 기본값 true
    
    // 크롤링 상태 초기화
    initializeCrawlingState();
    this.isCrawling = true;
    this.abortController = new AbortController();
    const startTime = Date.now();

    // Use the latest config for BrowserManager
    // Ensure browserManager is always (re)created with the latest config for a new crawling session
    this.browserManager = new BrowserManager(currentConfig);

    try {
      console.log('[CrawlerEngine] Starting crawling process...');
      
      // 초기 크롤링 상태 이벤트
      initializeCrawlingProgress('크롤링 초기화', CRAWLING_STAGE.INIT);
      
      // Initialize BrowserManager with its current config
      await this.browserManager.initialize();

      if (!await this.browserManager.isValid()) {
        console.error('[CrawlerEngine] BrowserManager is not initialized correctly.');
        this.state.setStage('failed', '브라우저 초기화 실패');
        this.isCrawling = false; // Ensure isCrawling is reset
        // Clean up the browser manager if initialization failed right away
        if (this.browserManager) {
            await this.browserManager.cleanupResources();
            this.browserManager = null;
        }
        return false;
      }

      // 사용자 설정 가져오기 (CRAWL-RANGE-001) - from the already fetched currentConfig
      const userPageLimit = currentConfig.pageRangeLimit;
      
      // 제품 목록 수집기 생성 (1단계) - Pass the latest currentConfig
      const productListCollector = new ProductListCollector(this.state, this.abortController, currentConfig, this.browserManager!);
      
      // totalPages와 lastPageProductCount 정보 가져오기
      const { totalPages: totalPagesFromCache, lastPageProductCount } = await productListCollector.fetchTotalPagesCached(true);
      
      // 크롤링 범위 계산
      const { startPage, endPage } = await PageIndexManager.calculateCrawlingRange(
        totalPagesFromCache, 
        lastPageProductCount || 0,
        userPageLimit
      );
      
      // 크롤링할 페이지가 없는 경우 종료
      if (startPage <= 0 || endPage <= 0 || startPage < endPage) {
        console.log('[CrawlerEngine] No pages to crawl.');
        this.isCrawling = false;
        return true;
      }
      
      // 총 크롤링할 페이지 수 계산
      const totalPagesToCrawl = startPage - endPage + 1;
      console.log(`[CrawlerEngine] Total pages to crawl: ${totalPagesToCrawl}, from page ${startPage} to ${endPage}`);

      // Define the enhanced progress callback
      const enhancedProgressUpdater = (
        processedSuccessfully: number, 
        totalPagesInStage: number, 
        stage1PageStatuses: PageProcessingStatusItem[], 
        currentOverallRetryCountForStage: number, 
        stage1StartTime: number,
        isStageComplete: boolean = false
      ) => {
        updateProductListProgress(
          processedSuccessfully, 
          totalPagesInStage, 
          stage1StartTime,
          stage1PageStatuses, 
          currentOverallRetryCountForStage, 
          currentConfig.productListRetryCount,
          isStageComplete
        );
      };
      
      // 결과를 저장할 변수 초기화
      let allCollectedProducts: Product[] = [];
      let batchNumber = 0;
      
      // 배치 처리가 활성화되고 크롤링할 페이지가 배치 크기보다 큰 경우 배치 처리 실행
      if (enableBatchProcessing && totalPagesToCrawl > batchSize) {
        console.log(`[CrawlerEngine] Using batch processing with ${batchSize} pages per batch`);
        
        // 배치 수 계산
        const totalBatches = Math.ceil(totalPagesToCrawl / batchSize);
        let currentPage = startPage;
        
        // 각 배치 처리
        for (let batch = 0; batch < totalBatches; batch++) {
          if (this.abortController.signal.aborted) {
            console.log('[CrawlerEngine] Crawling aborted during batch processing.');
            break;
          }
          
          batchNumber = batch + 1;
          console.log(`[CrawlerEngine] Processing batch ${batchNumber}/${totalBatches}`);
          
          // 배치 정보 업데이트 (UI에 표시)
          crawlerEvents.emit('crawlingProgress', {
            currentBatch: batchNumber,
            totalBatches: totalBatches,
            message: `배치 처리 중: ${batchNumber}/${totalBatches} 배치`
          });
          
          // 배치 범위 계산
          const batchEndPage = Math.max(endPage, currentPage - batchSize + 1);
          const batchRange = {
            startPage: currentPage,
            endPage: batchEndPage
          };
          
          // 이 배치를 위한 새로운 수집기 생성
          const batchCollector = new ProductListCollector(
            this.state,
            this.abortController,
            currentConfig,
            this.browserManager!
          );
          
          batchCollector.setProgressCallback(enhancedProgressUpdater);
          
          // 이 배치에 대한 페이지 범위 설정
          console.log(`[CrawlerEngine] Collecting batch ${batchNumber} range: ${batchRange.startPage} to ${batchRange.endPage}`);
          const batchProducts = await batchCollector.collectPageRange(batchRange);
          
          // 결과 합치기
          allCollectedProducts = allCollectedProducts.concat(batchProducts);
          
          // 이 배치의 실패 확인
          const failedPages = this.state.getFailedPages();
          if (failedPages.length > 0) {
            console.warn(`[CrawlerEngine] Batch ${batchNumber} completed with ${failedPages.length} failed pages.`);
          }
          
          // 다음 배치 준비
          currentPage = batchEndPage - 1;
          
          // 각 배치 후 리소스 해제
          await batchCollector.cleanupResources();
          
          // 배치간 지연 추가
          if (batch < totalBatches - 1) {
            console.log(`[CrawlerEngine] Waiting ${batchDelayMs}ms before next batch...`);
            await new Promise(resolve => setTimeout(resolve, batchDelayMs));
          }
        }
      } else {
        // 작은 수집에 대해서는 원래 비배치 프로세스 사용
        console.log('[CrawlerEngine] Using standard processing (no batching needed)');
        productListCollector.setProgressCallback(enhancedProgressUpdater);
        allCollectedProducts = await productListCollector.collect(userPageLimit);
      }
      
      // 크롤링 제품 목록 사용
      const products = allCollectedProducts;
      
      // The final progress update for stage 1 completion is now handled internally by productListCollector.collect() calling _sendProgressUpdate(true)
      // So, this explicit call might be redundant if productListCollector guarantees a final update.
      // updateProductListProgress(totalPagesFromCache, totalPagesFromCache, listStartTime, true); // Old completion call

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
      // Use totalPagesFromCache for success rate calculation if it's the basis of the collection range
      const successRate = totalPagesFromCache > 0 ? (totalPagesFromCache - failedPages.length) / totalPagesFromCache : 1;
      const successRatePercent = (successRate * 100).toFixed(1);
      
      // 1단계에서 실패 페이지가 있으면 중단 (원래 동작으로 복원)
      if (failedPages.length > 0) {
        const message = `[경고] 제품 목록 수집 성공률: ${successRatePercent}% (${totalPagesFromCache - failedPages.length}/${totalPagesFromCache}). 실패한 페이지가 있어 크롤링을 중단합니다.`;
        console.warn(`[CrawlerEngine] ${message}`);
        
        // 경고 이벤트 발생 및 크롤링 중단
        crawlerEvents.emit('crawlingWarning', {
          message,
          successRate: parseFloat(successRatePercent),
          failedPages: failedPages.length,
          totalPages: totalPagesFromCache, // Use totalPagesFromCache
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
      const productDetailCollector = new ProductDetailCollector(this.state, this.abortController, currentConfig, this.browserManager); // Pass latest currentConfig and browserManager
      
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
    const currentConfig = configManager.getConfig(); 
    console.log('[CrawlerEngine] checkCrawlingStatus called with latest config:', JSON.stringify(currentConfig));
    
    let tempBrowserManager: BrowserManager | null = null;
    let createdTempBrowserManager = false;

    try {
      const dbSummary = await getDatabaseSummaryFromDb();
      console.log('[CrawlerEngine] Database summary fetched:', JSON.stringify(dbSummary));
      
      let totalPages = 0;
      let lastPageProductCount = 0;

      if (this.browserManager && await this.browserManager.isValid()) {
        tempBrowserManager = this.browserManager;
      } else {
        tempBrowserManager = new BrowserManager(currentConfig);
        await tempBrowserManager.initialize();
        createdTempBrowserManager = true;
      }

      if (!await tempBrowserManager.isValid()) {
        throw new Error('Failed to initialize a valid BrowserManager for status check.');
      }

      const tempController = new AbortController();
      const collector = new ProductListCollector(this.state, tempController, currentConfig, tempBrowserManager);
      
      try {
        const pageData = await collector.fetchTotalPagesCached(true); 
        totalPages = pageData.totalPages;
        lastPageProductCount = pageData.lastPageProductCount;
      } catch (fetchError: any) {
        const criticalErrorMessage = `사이트의 전체 페이지 정보를 가져오는데 실패했습니다 (재시도 포함): ${fetchError.message}`;
        console.error(`[CrawlerEngine] Critical error in checkCrawlingStatus during fetchTotalPagesCached: ${criticalErrorMessage}`, fetchError);
        
        crawlerEvents.emit('criticalError', criticalErrorMessage); 

        return {
          error: criticalErrorMessage,
          dbLastUpdated: null,
          dbProductCount: 0,
          siteTotalPages: 0,
          siteProductCount: 0,
          diff: 0,
          needCrawling: false,
          crawlingRange: { startPage: 0, endPage: 0 },
          selectedPageCount: 0,
          estimatedProductCount: 0,
          estimatedTotalTime: 0,
          lastPageProductCount: 0
        };
      }

      const siteProductCount = totalPages > 0 
        ? ((totalPages - 1) * currentConfig.productsPerPage) + lastPageProductCount 
        : 0;
      
      const userPageLimit = currentConfig.pageRangeLimit;

      let crawlingRange = { startPage: 0, endPage: 0 };
      if (totalPages > 0) {
          crawlingRange = await PageIndexManager.calculateCrawlingRange(
              totalPages,
              lastPageProductCount,
              userPageLimit
          );
      }
    
      const selectedPageCount = crawlingRange.startPage > 0 && crawlingRange.endPage > 0 && crawlingRange.startPage >= crawlingRange.endPage
        ? crawlingRange.startPage - crawlingRange.endPage + 1 
        : 0;
      
      // actualTargetPageCountForStage1 계산 (selectedPageCount와 동일하게 사용)
      const actualTargetPageCountForStage1 = selectedPageCount;

      let estimatedProductCount = 0;
      if (selectedPageCount > 0) {
        if (selectedPageCount === 1 && totalPages === 1) {
            estimatedProductCount = lastPageProductCount;
        } else {
            let includesLastSitePage = false;
            if (crawlingRange.endPage === 1) {
                includesLastSitePage = true;
            }

            if (includesLastSitePage) {
                estimatedProductCount = ((selectedPageCount - 1) * currentConfig.productsPerPage) + lastPageProductCount;
            } else {
                estimatedProductCount = selectedPageCount * currentConfig.productsPerPage;
            }
        }
      }
            
      const estimatedTimePerPage = 5000;
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
        needCrawling: siteProductCount > dbSummary.productCount && selectedPageCount > 0,
        crawlingRange,
        selectedPageCount,
        actualTargetPageCountForStage1, // 추가된 필드
        estimatedProductCount,
        estimatedTotalTime,
        userPageLimit: userPageLimit > 0 ? userPageLimit : undefined,
        lastPageProductCount
      };
    } catch (error) {
      const generalErrorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[CrawlerEngine] General error in checkCrawlingStatus: ${generalErrorMessage}`, error);
      if (!(error instanceof Error && error.name === 'PageInitializationError')) { 
         crawlerEvents.emit('criticalError', `상태 확인 중 오류 발생: ${generalErrorMessage}`);
      }
      return {
        error: generalErrorMessage,
        dbLastUpdated: null,
        dbProductCount: 0,
        siteTotalPages: 0,
        siteProductCount: 0,
        diff: 0,
        needCrawling: false,
        crawlingRange: { startPage: 0, endPage: 0 },
        selectedPageCount: 0,
        actualTargetPageCountForStage1: 0, // 오류 발생 시 기본값
        estimatedProductCount: 0,
        estimatedTotalTime: 0,
        lastPageProductCount: 0
      };
    } finally {
      if (createdTempBrowserManager && tempBrowserManager) {
        await tempBrowserManager.cleanupResources();
      }
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
    console.log('[CrawlerEngine] Fetching latest config from ConfigManager for DB save decision');
    const currentConfig = configManager.getConfig();
    console.log(`[CrawlerEngine] Current autoAddToLocalDB setting from ConfigManager: ${currentConfig.autoAddToLocalDB}`);
    
    if (currentConfig.autoAddToLocalDB) {
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
      autoSavedToDb: currentConfig.autoAddToLocalDB
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