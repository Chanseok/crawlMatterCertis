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
import { ProductValidationCollector } from '../tasks/productValidation.js';
import type { CrawlerConfig, CrawlingRange } from '../../../../types.js';
import { saveProductsToFile, saveMatterProductsToFile } from '../utils/file.js';
import { 
  deduplicateAndSortMatterProducts, 
  validateDataConsistency 
} from '../utils/data-processing.js';
import { initializeCrawlingState } from '../utils/concurrency.js';
import { BrowserManager } from '../browser/BrowserManager.js';
import { PageIndexManager } from '../utils/page-index-manager.js';
import { createElectronLogger } from '../../utils/logger.js';
import type {
  CrawlingSummary,
  FailedPageReport,
  FailedProductReport
} from '../utils/types.js';
import type { Product, MatterProduct, PageProcessingStatusItem } from '../../../../types.js';
import { configManager } from '../../ConfigManager.js';
import { logger } from '../../../shared/utils/Logger.js';

export class CrawlerEngine {
  private state: CrawlerState;
  private isCrawling: boolean = false;
  private abortController: AbortController | null = null;
  private browserManager: BrowserManager | null = null;
  private sessionConfig: CrawlerConfig | null = null; // 현재 크롤링 세션의 설정을 저장
  private logger = createElectronLogger('CrawlerEngine');

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
   * 세션 설정을 무효화하여 다음 작업 시 최신 설정을 사용하도록 함
   */
  public invalidateSessionConfig(): void {
    this.sessionConfig = null;
    this.logger.info('Session config invalidated - will use latest config for next operation');
  }

  /**
   * 크롤링 작업을 시작
   * @param config 세션 전체에 사용할 크롤러 설정 (UI에서 전달)
   */
  public async startCrawling(config: CrawlerConfig): Promise<boolean> {
    if (this.isCrawling) {
      this.logger.info('Crawling is already in progress.');
      return false;
    }
    // 세션 시작 시 받은 config만 사용 (세션 도중 변경 무시)
    // 이 config를 크롤링 세션 전체에서 공유하여 불필요한 configManager.getConfig() 호출 방지
    this.sessionConfig = config; // 세션 설정을 클래스 멤버에 저장
    const sessionConfig = this.sessionConfig; // 지역 변수로도 사용
    
    // 로깅 시스템 초기화 (세션 시작 시)
    logger.initializeFromConfig(sessionConfig);
    logger.info('Crawler session started with logging configuration', 'CrawlerEngine');
    
    // 배치 처리 설정 가져오기
    const batchSize = sessionConfig.batchSize || 30; // 기본값 30페이지
    const batchDelayMs = sessionConfig.batchDelayMs || 2000; // 기본값 2초
    const enableBatchProcessing = sessionConfig.enableBatchProcessing !== false; // 기본값 true
    const batchRetryLimit = sessionConfig.batchRetryLimit || 3; // 기본값 3회
    
    // 크롤링 상태 초기화
    initializeCrawlingState();
    
    // 크롤러 상태(CrawlerState) 완전 초기화 - 카운터가 이전 세션에서 누적되지 않도록 함
    this.state.reset();
    
    // 크롤링 시작 시간 정확히 설정
    this.state.setCrawlingStartTime();
    
    // 전역 크롤링 시작 시간도 설정하여 모든 진행률 업데이트에서 동일한 시작 시간 사용
    const { setGlobalCrawlingStartTime } = await import('../utils/progress.js');
    setGlobalCrawlingStartTime(Date.now());
    
    this.logger.info('CrawlerState has been reset for new crawling session');
    
    // 명시적으로 상태 확인 (디버깅용)
    this.logger.debug('State after reset: ' +
                `detailStageProcessedCount=${this.state.getDetailStageProcessedCount()}, ` +
                `detailStageNewCount=${this.state.getDetailStageNewCount()}, ` +
                `detailStageUpdatedCount=${this.state.getDetailStageUpdatedCount()}`);
    
    this.isCrawling = true;
    this.abortController = new AbortController();
    
    // Use the session config for BrowserManager to maintain consistency
    // Ensure browserManager is always (re)created with the session config for a new crawling session
    this.browserManager = new BrowserManager(sessionConfig);

    try {
      this.logger.info('Starting crawling process...');
      
      // 크롤링 시작 즉시 진행률 이벤트 발송 (시간 추적 시작을 위해)
      const startTime = Date.now();
      crawlerEvents.emit('crawlingProgress', {
        status: 'running',
        currentStage: CRAWLING_STAGE.INIT,
        currentStep: '크롤링 시작',
        message: '크롤링을 시작합니다...',
        percentage: 0,
        currentPage: 0,
        totalPages: 0,
        processedItems: 0,
        totalItems: 0,
        current: 0,
        total: 0,
        elapsedTime: 0,
        startTime: startTime,
        remainingTime: 0
      });
      
      // 초기 크롤링 상태 이벤트
      initializeCrawlingProgress('크롤링 초기화', CRAWLING_STAGE.INIT);
      
      // Initialize BrowserManager with its current config
      await this.browserManager.initialize();

      if (!await this.browserManager.isValid()) {
        this.logger.error('BrowserManager is not initialized correctly.');
        this.state.setStage('failed', '브라우저 초기화 실패');
        this.isCrawling = false; // Ensure isCrawling is reset
        // Clean up the browser manager if initialization failed right away
        if (this.browserManager) {
            await this.browserManager.cleanupResources();
            this.browserManager = null;
        }
        return false;
      }

      // 브라우저 초기화 완료 후 상태 업데이트
      crawlerEvents.emit('crawlingProgress', {
        status: 'running',
        currentStage: CRAWLING_STAGE.INIT,
        currentStep: '브라우저 초기화 완료',
        message: '브라우저 초기화가 완료되었습니다. 페이지 정보를 수집하는 중...',
        percentage: 5,
        currentPage: 0,
        totalPages: 0,
        processedItems: 0,
        totalItems: 0,
        current: 0,
        total: 0,
        elapsedTime: 0,
        startTime: Date.now()
      });

      // 브라우저 초기화 완료 상태 업데이트
      crawlerEvents.emit('crawlingProgress', {
        status: 'running',
        currentStage: CRAWLING_STAGE.INIT,
        currentStep: '브라우저 초기화 완료',
        message: '브라우저 초기화가 완료되었습니다. 페이지 정보를 가져오는 중...',
        percentage: 5,
        currentPage: 0,
        totalPages: 0,
        processedItems: 0,
        totalItems: 0,
        current: 0,
        total: 0,
        elapsedTime: Date.now() - Date.now(),
        startTime: Date.now()
      });

      // 사용자 설정 가져오기 (CRAWL-RANGE-001) - from the session config
      const userPageLimit = sessionConfig.pageRangeLimit;
      
      // 제품 목록 수집기 생성 (1단계) - Pass the session config for consistency
      const productListCollector = new ProductListCollector(this.state, this.abortController, sessionConfig, this.browserManager!);
      
      // 페이지 정보 수집 중 상태 업데이트
      crawlerEvents.emit('crawlingProgress', {
        status: 'running',
        currentStage: CRAWLING_STAGE.INIT,
        currentStep: '페이지 정보 수집 중',
        message: '사이트의 총 페이지 수를 확인하고 있습니다...',
        percentage: 10,
        currentPage: 0,
        totalPages: 0,
        processedItems: 0,
        totalItems: 0,
        current: 0,
        total: 0,
        elapsedTime: Date.now() - Date.now(),
        startTime: Date.now()
      });
      
      // totalPages와 lastPageProductCount 정보 가져오기
      const { totalPages: totalPagesFromCache, lastPageProductCount } = await productListCollector.fetchTotalPagesCached(true);
      
      // 크롤링 범위 계산 중 상태 업데이트
      crawlerEvents.emit('crawlingProgress', {
        status: 'running',
        currentStage: CRAWLING_STAGE.INIT,
        currentStep: '크롤링 범위 계산 중',
        message: '크롤링할 페이지 범위를 계산하고 있습니다...',
        percentage: 15,
        currentPage: 0,
        totalPages: totalPagesFromCache,
        processedItems: 0,
        totalItems: 0,
        current: 0,
        total: totalPagesFromCache,
        elapsedTime: Date.now() - Date.now(),
        startTime: Date.now()
      });
      
      // 크롤링 범위 계산
      const { startPage, endPage } = await PageIndexManager.calculateCrawlingRange(
        totalPagesFromCache, 
        lastPageProductCount || 0,
        userPageLimit,
        sessionConfig // 세션 설정을 명시적으로 전달
      );
      
      // 총 크롤링할 페이지 수 계산
      const totalPagesToCrawl = startPage - endPage + 1;
      this.logger.info(`Total pages to crawl: ${totalPagesToCrawl}, from page ${startPage} to ${endPage}`);

      // 크롤링 시작 준비 완료 상태 업데이트
      crawlerEvents.emit('crawlingProgress', {
        status: 'running',
        currentStage: CRAWLING_STAGE.PRODUCT_LIST,
        currentStep: '크롤링 시작 준비',
        message: `${totalPagesToCrawl}개 페이지 크롤링을 시작합니다...`,
        percentage: 20,
        currentPage: 0,
        totalPages: totalPagesToCrawl,
        processedItems: 0,
        totalItems: totalPagesToCrawl,
        current: 0,
        total: totalPagesToCrawl,
        elapsedTime: 0,
        startTime: Date.now()
      });
      
      // 크롤링할 페이지가 없는 경우 종료
      if (startPage <= 0 || endPage <= 0 || startPage < endPage) {
        this.logger.info('No pages to crawl.');
        this.isCrawling = false;
        
        // 크롤링할 페이지가 없음을 알림
        crawlerEvents.emit('crawlingProgress', {
          status: 'completed',
          currentStage: CRAWLING_STAGE.COMPLETE,
          currentStep: '크롤링 완료',
          message: '크롤링할 새로운 페이지가 없습니다.',
          percentage: 100,
          currentPage: 0,
          totalPages: 0,
          processedItems: 0,
          totalItems: 0,
          current: 0,
          total: 0,
          elapsedTime: Date.now() - Date.now(),
          startTime: Date.now()
        });
        
        return true;
      }
      
      // Define the enhanced progress callback with batch support
      const enhancedProgressUpdater = async (
        processedSuccessfully: number, 
        totalPagesInStage: number, 
        stage1PageStatuses: PageProcessingStatusItem[], 
        currentOverallRetryCountForStage: number, 
        stage1StartTime: number,
        isStageComplete: boolean = false,
        currentBatch?: number,
        totalBatches?: number
      ) => {
        await updateProductListProgress(
          processedSuccessfully, 
          totalPagesInStage, 
          stage1StartTime,
          stage1PageStatuses, 
          currentOverallRetryCountForStage, 
          sessionConfig.productListRetryCount,
          isStageComplete,
          undefined, // timeEstimate
          currentBatch && totalBatches ? { 
            currentBatch, 
            totalBatches,
            globalTotalPages: totalPagesToCrawl // 전체 크롤링 페이지 수 전달
          } : undefined // batchInfo
        );
      };
      
      // 결과를 저장할 변수 초기화
      let allCollectedProducts: Product[] = [];
      let batchNumber = 0;
      let totalBatches = 1; // 기본값: 1 (비배치 처리의 경우)
      
      // 배치 처리가 활성화되고 크롤링할 페이지가 배치 크기보다 큰 경우 배치 처리 실행
      if (enableBatchProcessing && totalPagesToCrawl > batchSize) {
        this.logger.info(`Using batch processing with ${batchSize} pages per batch`);
        
        // 배치 수 계산
        totalBatches = Math.ceil(totalPagesToCrawl / batchSize);
        let currentPage = startPage;
        
        // 배치 처리 시작 이벤트 - 전체 진행 상황 초기화
        crawlerEvents.emit('crawlingProgress', {
          stage: CRAWLING_STAGE.PRODUCT_LIST,
          step: "배치 처리 시작",
          message: `배치 처리 모드: 총 ${totalPagesToCrawl}페이지를 ${totalBatches}개 배치로 처리`,
          currentPage: 0,
          totalPages: totalPagesToCrawl,
          processedItems: 0,
          totalItems: 0,
          percentage: 0,
          status: 'running',
          currentBatch: 1,
          totalBatches: totalBatches
        });
        
        // 각 배치 처리
        for (let batch = 0; batch < totalBatches; batch++) {
          if (this.abortController.signal.aborted) {
            this.logger.info('Crawling aborted during batch processing.');
            break;
          }
          
          batchNumber = batch + 1;
          this.logger.info(`Processing batch ${batchNumber}/${totalBatches}`);
          
          // 배치 정보 업데이트 (UI에 표시) - 전체 페이지 정보 포함
          const currentPageOffset = (batchNumber - 1) * batchSize;
          crawlerEvents.emit('crawlingProgress', {
            stage: CRAWLING_STAGE.PRODUCT_LIST,
            step: "1단계: 제품 목록 수집",
            message: `배치 처리 중: ${batchNumber}/${totalBatches} 배치 - 1단계: 제품 목록 수집`,
            currentPage: currentPageOffset,
            totalPages: totalPagesToCrawl,
            processedItems: 0,
            totalItems: 0,
            percentage: (currentPageOffset / totalPagesToCrawl) * 100,
            status: 'running',
            currentBatch: batchNumber,
            totalBatches: totalBatches
          });
          
          // 배치 범위 계산
          const batchEndPage = Math.max(endPage, currentPage - batchSize + 1);
          const batchRange = {
            startPage: currentPage,
            endPage: batchEndPage
          };
          
          let batchSuccess = false;
          let batchRetryCount = 0;
          let batchProducts: Product[] = [];
          
          // 1단계: 배치 수집 시도 (실패 시 재시도)
          while (!batchSuccess && batchRetryCount <= batchRetryLimit) {
            try {
              if (batchRetryCount > 0) {
                this.logger.info(`Retrying batch ${batchNumber} 1단계 (attempt ${batchRetryCount}/${batchRetryLimit})`);
                
                // 재시도 상태 업데이트
                crawlerEvents.emit('crawlingProgress', {
                  stage: CRAWLING_STAGE.PRODUCT_LIST,
                  step: "1단계: 제품 목록 수집 재시도",
                  message: `배치 ${batchNumber} 1단계 재시도 중 (${batchRetryCount}/${batchRetryLimit})`,
                  currentPage: (batchNumber - 1) * batchSize,
                  totalPages: totalPagesToCrawl,
                  processedItems: 0,
                  totalItems: 0,
                  percentage: ((batchNumber - 1) / totalBatches) * 100,
                  status: 'running',
                  currentBatch: batchNumber,
                  totalBatches: totalBatches,
                  batchRetryCount: batchRetryCount,
                  batchRetryLimit: batchRetryLimit
                });
                
                // 재시도 전 잠시 대기 (지수 백오프 적용)
                const retryDelay = Math.min(batchDelayMs * (1.5 ** batchRetryCount), 30000);
                this.logger.info(`Waiting ${retryDelay}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
              }
              
              // 이 배치를 위한 새로운 수집기 생성
              const batchCollector = new ProductListCollector(
                this.state,
                this.abortController,
                sessionConfig,
                this.browserManager!
              );
              
              // 배치 정보 설정
              batchCollector.setBatchInfo(batchNumber, totalBatches);
              
              batchCollector.setProgressCallback(enhancedProgressUpdater);
              
              // 이 배치에 대한 페이지 범위 설정
              this.logger.info(`Collecting batch ${batchNumber} range: ${batchRange.startPage} to ${batchRange.endPage}${batchRetryCount > 0 ? ` (retry ${batchRetryCount})` : ''}`);
              batchProducts = await batchCollector.collectPageRange(batchRange);
              
              // 이 배치의 실패 확인
              const failedPages = this.state.getFailedPages();
              
              // 재시도 결과 확인
              if (failedPages.length === 0) {
                // 성공한 경우
                batchSuccess = true;
                this.logger.info(`Batch ${batchNumber} 1단계 completed successfully${batchRetryCount > 0 ? ` after ${batchRetryCount} retries` : ''}`);
              } else {
                // 실패한 경우
                this.logger.warn(`Batch ${batchNumber} 1단계 attempt ${batchRetryCount + 1} failed with ${failedPages.length} failed pages.`);
                
                // 재시도 횟수 증가
                batchRetryCount++;
                
                // 마지막 시도였다면 실패로 처리
                if (batchRetryCount > batchRetryLimit) {
                  this.logger.error(`Batch ${batchNumber} 1단계 failed after ${batchRetryLimit} retries.`);
                  
                  // 실패 이벤트 발행
                  const message = `배치 ${batchNumber} 1단계 처리 실패 (${batchRetryLimit}회 재시도 후)`;
                  this.state.reportCriticalFailure(message);
                  return false;
                }
                
                // 실패한 페이지 초기화 (재시도를 위해)
                this.state.resetFailedPages();
              }
              
              // 수집기 리소스 정리
              await batchCollector.cleanupResources();
              
            } catch (error) {
              this.logger.error(`Error processing batch ${batchNumber} 1단계:`, { data: error });
              
              // 재시도 횟수 증가
              batchRetryCount++;
              
              // 마지막 시도였다면 오류 발생
              if (batchRetryCount > batchRetryLimit) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                const message = `배치 ${batchNumber} 1단계 처리 중 오류 발생 (${batchRetryLimit}회 재시도 후): ${errorMessage}`;
                this.state.reportCriticalFailure(message);
                return false;
              }
            }
          }
          
          // Add the batch products to the overall collection
          allCollectedProducts = allCollectedProducts.concat(batchProducts);
          
          if (batchSuccess && batchProducts.length > 0) {
            // 2단계: 제품 상세 정보 수집 및 DB 저장
            crawlerEvents.emit('crawlingProgress', {
              stage: CRAWLING_STAGE.PRODUCT_DETAIL,
              step: '2단계: 제품 상세 정보 수집',
              message: `배치 처리 중: ${batchNumber}/${totalBatches} 배치 - 2단계: 제품 상세 정보 수집`,
              currentPage: (batchNumber - 1) * batchSize,
              totalPages: totalPagesToCrawl,
              processedItems: 0,
              totalItems: batchProducts.length,
              percentage: ((batchNumber - 1) / totalBatches) * 100,
              status: 'running',
              currentBatch: batchNumber,
              totalBatches: totalBatches
            });
            
            this.logger.info(`Starting batch ${batchNumber} 2단계 (detail collection) with ${batchProducts.length} products`);
            
            // 2단계 시작 시간
            const detailStartTime = Date.now();
            
            // 2단계 진행 상황 초기화
            await updateProductDetailProgress(0, batchProducts.length, detailStartTime, false, 0, 0, batchNumber, totalBatches, 0);
            
            // 2단계 상세 정보 수집기 생성
            const batchDetailCollector = new ProductDetailCollector(
              this.state,
              this.abortController!,
              sessionConfig,
              this.browserManager!,
              batchNumber,
              totalBatches
            );
            
            // 진행 상황 업데이트 콜백 설정
            batchDetailCollector.setProgressCallback(async (processedItems, totalItems, startTime, isCompleted, newItems, updatedItems, currentBatch, totalBatches, retryCount = 0) => {
              await updateProductDetailProgress(
                processedItems,
                totalItems,
                detailStartTime, // 실제 시작 시간 사용
                isCompleted,
                newItems,
                updatedItems,
                currentBatch,
                totalBatches,
                retryCount
              );
            });
            
            try {
              // 이 배치의 제품 상세 정보 수집
              const batchMatterProducts = await batchDetailCollector.collect(batchProducts);
              
              // 2단계 완료 이벤트
              await updateProductDetailProgress(
                batchProducts.length, 
                batchProducts.length, 
                detailStartTime, 
                true,
                0,
                0,
                batchNumber,
                totalBatches,
                0
              );
              
              // DB 저장 단계
              crawlerEvents.emit('crawlingProgress', {
                currentBatch: batchNumber,
                totalBatches: totalBatches,
                status: 'running',
                currentStage: 3,
                currentStep: '3단계: DB 저장',
                message: `배치 처리 중: ${batchNumber}/${totalBatches} 배치 - DB 저장`
              });
              
              // 배치 결과를 DB에 저장
              if (sessionConfig.autoAddToLocalDB && batchMatterProducts.length > 0) {
                try {
                  this.logger.info(`Saving batch ${batchNumber} products to DB (${batchMatterProducts.length} products)`);
                  
                  // 임시 파일 저장 (백업 용도)
                  const batchFilename = `batch_${batchNumber}_${Date.now()}.json`;
                  try {
                    await this.saveBatchToTempFile(batchMatterProducts, batchFilename);
                  } catch (saveErr: unknown) {
                    const errorMessage = (saveErr as Error)?.message || String(saveErr);
                    this.logger.warn(`Failed to save temporary batch file: ${errorMessage}`);
                  }
                  
                  // DB에 저장
                  const saveResult = await saveProductsToDb(batchMatterProducts);
                  
                  // 저장 결과 로그
                  this.logger.info(`Batch ${batchNumber} DB Save Result: ${saveResult.added} added, ${saveResult.updated} updated`);
                  
                  // DB 저장 완료 이벤트
                  crawlerEvents.emit('dbSaveComplete', {
                    success: true,
                    added: saveResult.added,
                    updated: saveResult.updated,
                    unchanged: saveResult.unchanged,
                    failed: saveResult.failed,
                    message: `배치 ${batchNumber}: ${saveResult.added}개 추가, ${saveResult.updated}개 업데이트됨`
                  });
                  
                  // 배치 처리 중이라도 최종 카운트는 계속 누적 업데이트
                  this.handleDatabaseSaveResult(saveResult);
                } catch (dbError: unknown) {
                  this.logger.error(`Error saving batch ${batchNumber} to DB:`, { data: dbError });
                  
                  // DB 저장 오류 이벤트
                  crawlerEvents.emit('dbSaveError', {
                    error: `배치 ${batchNumber} DB 저장 오류: ${(dbError as Error)?.message || String(dbError)}`
                  });
                }
              } else {
                this.logger.info(`Skipping DB save for batch ${batchNumber} (auto-save disabled or no products)`);
                
                // DB 저장 스킵 이벤트
                crawlerEvents.emit('dbSaveSkipped', {
                  message: `배치 ${batchNumber} DB 저장 건너뜀 (${sessionConfig.autoAddToLocalDB ? '제품 없음' : '자동 저장 비활성화'})`,
                  count: batchMatterProducts.length
                });
              }
              
              // 배치 제품 정보 전체 목록에 추가
              allCollectedProducts = allCollectedProducts.concat(batchProducts);
              
              this.logger.info(`Batch ${batchNumber} complete`);
              
            } catch (detailError: unknown) {
              this.logger.error(`Error in batch ${batchNumber} 2단계 (detail collection):`, { data: detailError });
              
              // 2단계 오류 이벤트
              const errorMessage = (detailError as Error)?.message || String(detailError);
              const message = `배치 ${batchNumber} 2단계 처리 중 오류 발생: ${errorMessage}`;
              
              crawlerEvents.emit('crawlingProgress', {
                currentBatch: batchNumber,
                totalBatches: totalBatches,
                message: message,
                error: errorMessage
              });
              
              // 치명적인 오류인 경우에만 전체 크롤링 중단
              if ((detailError as Error)?.message?.includes('CRITICAL')) {
                this.state.reportCriticalFailure(message);
                return false;
              }
            }
          } else {
            this.logger.warn(`Batch ${batchNumber} has no products to process in 2단계, skipping`);
          }
          
          // 이 배치의 실패 확인 (최종 상태)
          const currentFailedPages = this.state.getFailedPages();
          if (currentFailedPages.length > 0) {
            this.logger.warn(`Batch ${batchNumber} completed with ${currentFailedPages.length} failed pages.`);
          }
          
          // 다음 배치 준비
          currentPage = batchEndPage - 1;
          
          // 배치 간 지연 추가
          if (batch < totalBatches - 1) {
            this.logger.info(`Batch ${batchNumber} complete. Waiting ${batchDelayMs}ms before next batch...`);
            
            crawlerEvents.emit('crawlingProgress', {
              currentBatch: batchNumber,
              totalBatches: totalBatches,
              status: 'running',
              currentStage: 1,
              currentStep: '1단계: 배치 간 대기',
              message: `배치 ${batchNumber} 완료. 다음 배치 준비 중...`
            });
            
            await new Promise(resolve => setTimeout(resolve, batchDelayMs));
          }
        }
      } else {
        // 작은 수집에 대해서는 원래 비배치 프로세스 사용
        this.logger.info('Using standard processing (no batching needed)');
        productListCollector.setProgressCallback(enhancedProgressUpdater);
        allCollectedProducts = await productListCollector.collect(userPageLimit);
      }
      
      // 크롤링 제품 목록 사용
      const products = allCollectedProducts;
      
      // 배치 처리 완료 알림
      crawlerEvents.emit('crawlingProgress', {
        message: '1단계: 제품 목록 수집이 완료되었습니다. 2단계를 시작합니다.',
        status: 'completed_stage_1',
        currentStage: 1,
        currentStep: '1단계 완료',
        // 배치 정보 유지 (배치 처리된 경우)
        currentBatch: enableBatchProcessing && totalPagesToCrawl > batchSize ? totalBatches : undefined,
        totalBatches: enableBatchProcessing && totalPagesToCrawl > batchSize ? totalBatches : undefined
      });
      
      this.logger.info('Stage 1 (Product List Collection) completed successfully. Proceeding to Stage 2.');

      // 중단 여부 확인 - 명시적으로 요청된 중단만 처리
      if (this.abortController?.signal.aborted) {
        this.logger.info('Crawling was explicitly stopped after product list collection.');
        this.isCrawling = false;
        return true;
      }

      // 제품 목록 결과 저장
      this.handleListCrawlingResults(products);

      // 2단계: 로컬DB 상태 체크 및 중복 필터링
      this.logger.info('Starting 2단계: 로컬DB 중복 체크');
      this.state.setStage('validation:init', '2단계: 로컬DB 중복 검증 중');
      
      // ProductValidationCollector 인스턴스 생성
      const productValidationCollector = new ProductValidationCollector(this.state, sessionConfig);
      
      // 제품 검증 및 필터링 수행
      const { 
        newProducts, 
        existingProducts, 
        duplicateProducts, 
        validationSummary 
      } = await productValidationCollector.validateAndFilterProducts(products);
      
      // 검증 결과 로깅
      this.logger.info(`검증 완료: 신규 ${newProducts.length}개, 기존 ${existingProducts.length}개, 중복 ${duplicateProducts.length}개`);
      
      // 검증 결과에 기반한 크롤링 범위 적절성 평가
      const { isRangeAppropriate, recommendations } = 
        productValidationCollector.validateCrawlingRange(validationSummary);
      
      // 범위 적절성 결과 로깅
      this.logger.info(`크롤링 범위 적절성: ${isRangeAppropriate ? '적절함' : '부적절함'}`);
      
      // 권장사항이 있는 경우 UI에 표시
      if (recommendations.length > 0) {
        this.logger.info('크롤링 범위 권장사항:', { data: recommendations });
        
        // 진행 상태에 권장사항 추가
        await this.state.updateProgress({
          rangeRecommendations: recommendations
        });
      }
      
      this.logger.info(`검증 완료: 
        - 총 수집 제품: ${validationSummary.totalProducts}개
        - 신규 제품: ${validationSummary.newProducts}개 (${(100 - validationSummary.skipRatio).toFixed(1)}%)
        - 기존 제품: ${validationSummary.existingProducts}개
        - 중복 제품: ${validationSummary.duplicateProducts}개 (${validationSummary.duplicateRatio.toFixed(1)}%)
      `);
      
      // 검증 단계 완료
      this.state.setStage('validation:complete', '2단계: 로컬DB 중복 검증 완료');

      // 치명적 오류 확인 - 하지만 성공적인 수집이 있었다면 오류를 무시
      const hasCriticalFailures = this.state.hasCriticalFailures();
      const hasSuccessfulCollection = products.length > 0;

      if (hasCriticalFailures && !hasSuccessfulCollection) {
        const message = '제품 목록 수집 중 심각한 오류가 발생했고 수집된 제품이 없습니다. 크롤링 중단.';
        this.logger.error(`${message}`);
        this.state.reportCriticalFailure(message);
        this.isCrawling = false;
        return false;
      } else if (hasCriticalFailures && hasSuccessfulCollection) {
        this.logger.warn(`일부 오류가 있었지만 ${products.length}개 제품 수집에 성공했습니다. 계속 진행합니다.`);
        // 치명적 오류 상태를 정리하고 계속 진행
        this.state.clearCriticalFailures();
      }

      if (products.length === 0) {
        this.logger.info('No products found to process. Crawling complete.');
        await this.finalizeSession(); // 세션 최종화 호출
        return true;
      }
      
      // 검증 결과에 따라 2단계에서는 신규 제품만 처리
      const productsForDetailStage = newProducts;
      
      if (productsForDetailStage.length === 0) {
        this.logger.info('No new products to process after validation. Skipping detail stage.');
        this.state.setStage('completed', '새로운 제품이 없습니다. 크롤링이 완료되었습니다.');
        await this.finalizeSession(); // 세션 최종화 호출
        return true;
      }
      
      this.logger.info(`Found ${productsForDetailStage.length} new products to process in detail stage.`);

      // 성공률 확인
      const failedPages = this.state.getFailedPages();
      const successRate = totalPagesFromCache > 0 ? (totalPagesFromCache - failedPages.length) / totalPagesFromCache : 1;
      const successRatePercent = (successRate * 100).toFixed(1);
      
      // 실패 페이지가 있어도 충분한 제품이 수집되었다면 경고만 하고 계속 진행
      if (failedPages.length > 0) {
        const message = `[경고] 제품 목록 수집 성공률: ${successRatePercent}% (${totalPagesFromCache - failedPages.length}/${totalPagesFromCache}).`;
        this.logger.warn(`${message}`);
        
        // 제품이 충분히 수집되었다면 계속 진행
        if (products.length > 0) {
          this.logger.info(`${products.length}개 제품이 수집되어 계속 진행합니다.`);
          
          crawlerEvents.emit('crawlingWarning', {
            message: message + ' 수집된 제품으로 계속 진행합니다.',
            successRate: parseFloat(successRatePercent),
            failedPages: failedPages.length,
            totalPages: totalPagesFromCache,
            continueProcess: true // 계속 진행
          });
        } else {
          // 제품이 없는 경우에만 중단
          crawlerEvents.emit('crawlingWarning', {
            message: message + ' 수집된 제품이 없어 크롤링을 중단합니다.',
            successRate: parseFloat(successRatePercent),
            failedPages: failedPages.length,
            totalPages: totalPagesFromCache,
            continueProcess: false
          });
          
          this.state.setStage('failed', '제품 목록 수집 중 오류가 발생하여 크롤링이 중단되었습니다.');
          this.isCrawling = false;
          return false;
        }
      }

      // Continue to Stage 2 processing
      if (!enableBatchProcessing || totalPagesToCrawl <= batchSize) {
        // [NEW CODE START] Correctly setup CrawlerState for Stage 2 product detail collection
        // This ensures the UI displays the correct total number of products to be processed from Stage 1.
        this.logger.debug(`Preparing CrawlerState for Stage 2 (non-batch or small batch). Total new products from validation: ${productsForDetailStage.length}`);

        // Set the specific counter for total products in the detail stage.
        // This helps CrawlerState and UI to correctly track progress against the total items from Stage 1.
        this.state.setDetailStageProductCount(productsForDetailStage.length);
        this.logger.debug(`Called this.state.setDetailStageProductCount(${productsForDetailStage.length}) for Stage 2.`);

        // ✅ Explicitly set stage to productDetail to ensure UI recognizes Stage 3
        this.state.setStage('productDetail:init', '3단계: 제품 상세 정보 수집 시작');
        this.logger.debug(`Set stage to productDetail:init for Stage 3`);

        // Update the main progress state for the beginning of Stage 3.
        // This resets processed counts and sets the overall total for this stage.
        await this.state.updateProgress({
            currentStage: CRAWLING_STAGE.PRODUCT_DETAIL, // Mark current stage as Product Detail (Stage 3)
            totalItems: productsForDetailStage.length,   // Total items to process in Stage 3
            processedItems: 0,                           // Reset processed items for Stage 3
            newItems: 0,                                 // Reset new items count
            updatedItems: 0,                             // Reset updated items count
            percentage: 0,                               // Reset percentage completion
            currentStep: '3단계: 제품 상세 정보 수집 초기화 중...',   // Initial status message for Stage 3
            currentPage: 0,                              // Reset current page (if applicable to Stage 3)
            totalPages: 0,                               // Reset total pages (if applicable to Stage 3)
            remainingTime: 0, // Stage 2 시작 시 예상 남은 시간 0으로 명확히
        });
        this.logger.info(`Called this.state.updateProgress for start of Stage 2: totalItems=${productsForDetailStage.length}, processedItems=0.`);
        // [NEW CODE END]

        // 2/2단계: 제품 상세 정보 수집 시작 알림
        const detailStartTime = Date.now();
        await updateProductDetailProgress(0, productsForDetailStage.length, detailStartTime, false, 0, 0, undefined, undefined, 0);
        
        logger.info(`Found ${productsForDetailStage.length} new products to process. Starting detail collection...`);
        
        // 제품 상세 정보 수집기 생성 (2단계)
        const productDetailCollector = new ProductDetailCollector(this.state, this.abortController!, sessionConfig, this.browserManager!); // Pass session config for consistency
        
        // 진행 상황 업데이트 콜백 설정
        productDetailCollector.setProgressCallback(async (processedItems, totalItems, startTime, isCompleted, newItems, updatedItems, currentBatch, totalBatches, retryCount = 0) => {
          await updateProductDetailProgress(
            processedItems,
            totalItems,
            detailStartTime, // 실제 시작 시간 사용
            isCompleted,
            newItems,
            updatedItems,
            currentBatch,
            totalBatches,
            retryCount
          );
        });
        
        // 제품 상세 정보 수집 실행
        const matterProducts = await productDetailCollector.collect(productsForDetailStage);

        // 2단계 완료 이벤트
        await updateProductDetailProgress(
          productsForDetailStage.length, 
          productsForDetailStage.length, 
          detailStartTime, 
          true,
          0,
          0,
          undefined,
          undefined,
          0
        );

        // 중복 제거 및 정렬
        deduplicateAndSortMatterProducts(matterProducts);

        // 데이터 일관성 검증
        validateDataConsistency(products, matterProducts);

        // 제품 상세 결과 저장 및 처리
        await this.handleDetailCrawlingResults(matterProducts);
      } else {
        // 배치 처리를 사용한 경우에는 여기서 2단계 추가 작업을 할 필요가 없음
        this.logger.info('All batches have been processed in batch mode, skipping additional detail collection.');
        
        // 모든 배치가 완료되었음을 알림
        crawlerEvents.emit('crawlingComplete', {
          success: true,
          count: products.length,
          message: '모든 배치가 처리되었습니다. 배치별 상세 정보가 이미 수집 및 저장되었습니다.',
          autoSavedToDb: sessionConfig.autoAddToLocalDB
        });
      }

      this.logger.info('Crawling process completed successfully');
      await this.finalizeSession(); // 세션 최종화 호출
      return true;
    } catch (error) {
      this.handleCrawlingError(error);
      return false;
    } finally {
      // 크롤링 상태 정리
      this.isCrawling = false;
      
      // 실패한 경우 UI 상태 업데이트
      if (!this.isCrawling && this.state.getStage() !== 'completed') {
        crawlerEvents.emit('crawlingProgress', {
          status: 'idle',
          currentStage: CRAWLING_STAGE.INIT,
          currentStep: '크롤링 중지됨',
          message: '크롤링이 중지되었습니다.',
          percentage: 0,
          currentPage: 0,
          totalPages: 0,
          processedItems: 0,
          totalItems: 0,
          current: 0,
          total: 0,
          elapsedTime: 0,
          startTime: Date.now()
        });
      }
      
      if (this.browserManager) {
        await this.browserManager.cleanupResources(); // Cleanup BrowserManager
        this.browserManager = null;
      }

      // 이 시점에서 명시적으로 정리 - 리소스 누수 방지
      if (this.abortController && !this.abortController.signal.aborted) {
        // 모든 작업이 완료된 후 정리 목적으로만 abort 신호 발생
        this.abortController.abort('cleanup');
      }
      
      // 최종 완료 로그
      this.logger.info('Crawling process finalized.');
    }
  }

  /**
   * 크롤링 작업을 중지
   */
  public stopCrawling(): boolean {
    if (!this.isCrawling || !this.abortController) {
      this.logger.info('No crawling in progress to stop');
      return false;
    }

    this.logger.info('Explicitly stopping crawling by user request');
    this.abortController.abort('user_request'); // 중단 이유 추가
    return true;
  }

  /**
   * 크롤링 상태 체크 요약 정보 반환
   */
  public async checkCrawlingStatus(): Promise<CrawlingSummary> {
    // 항상 최신 설정을 사용하여 설정 변경사항이 즉시 반영되도록 함
    // 크롤링 중이 아닐 때는 세션 설정보다 최신 설정이 우선됨
    const sessionConfig = configManager.getConfig();
    this.logger.info('checkCrawlingStatus called with latest config:', { data: JSON.stringify(sessionConfig) });
    
    let tempBrowserManager: BrowserManager | null = null;
    let createdTempBrowserManager = false;

    try {
      const dbSummary = await getDatabaseSummaryFromDb();
      this.logger.info('Database summary fetched:', { data: JSON.stringify(dbSummary) });
      
      let totalPages = 0;
      let lastPageProductCount = 0;

      if (this.browserManager && await this.browserManager.isValid()) {
        tempBrowserManager = this.browserManager;
      } else {
        tempBrowserManager = new BrowserManager(sessionConfig);
        await tempBrowserManager.initialize();
        createdTempBrowserManager = true;
      }

      if (!await tempBrowserManager.isValid()) {
        throw new Error('Failed to initialize a valid BrowserManager for status check.');
      }

      const tempController = new AbortController();
      const collector = new ProductListCollector(this.state, tempController, sessionConfig, tempBrowserManager);
      
      try {
        const pageData = await collector.fetchTotalPagesCached(true); 
        totalPages = pageData.totalPages;
        lastPageProductCount = pageData.lastPageProductCount;
      } catch (fetchError: any) {
        const criticalErrorMessage = `사이트의 전체 페이지 정보를 가져오는데 실패했습니다 (재시도 포함): ${fetchError.message}`;
        this.logger.error(`Critical error in checkCrawlingStatus during fetchTotalPagesCached: ${criticalErrorMessage}`, fetchError);
        
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
        ? ((totalPages - 1) * sessionConfig.productsPerPage) + lastPageProductCount 
        : 0;
      
      const userPageLimit = sessionConfig.pageRangeLimit;

      let crawlingRange = { startPage: 0, endPage: 0 };
      if (totalPages > 0) {
          crawlingRange = await PageIndexManager.calculateCrawlingRange(
              totalPages,
              lastPageProductCount,
              userPageLimit,
              sessionConfig // 설정 객체 전달
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
                estimatedProductCount = ((selectedPageCount - 1) * sessionConfig.productsPerPage) + lastPageProductCount;
            } else {
                estimatedProductCount = selectedPageCount * sessionConfig.productsPerPage;
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
      this.logger.error(`General error in checkCrawlingStatus: ${generalErrorMessage}`, { data: error });
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
      this.logger.error('Failed to save products json:', { data: err });
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
    this.logger.info(`handleDetailCrawlingResults called with ${matterProducts.length} products`);
    
    // 제품 상세 정보 결과 파일로 저장
    try {
      saveMatterProductsToFile(matterProducts);
    } catch (err) {
      this.logger.error('Failed to save matter products json:', { data: err });
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

    // 설정에 따라 자동으로 DB에 저장 - 메서드 전체에서 일관된 설정 사용
    // 세션 시작 시 저장한 설정을 사용하므로 여기서 새로 가져올 필요가 없음
    // 세션 내에서 설정 변경을 무시하는 것이 목적임
    const sessionConfig = this.sessionConfig || configManager.getConfig();
    this.logger.info(`Current autoAddToLocalDB setting: ${sessionConfig.autoAddToLocalDB}`);
    
    if (sessionConfig.autoAddToLocalDB) {
      try {
        // 자동 저장 옵션이 켜져 있으면 DB에 저장
        this.logger.info('Automatically saving collected products to DB per user settings...');
        
        if (matterProducts.length === 0) {
          this.logger.info('No products to save to DB.');
          crawlerEvents.emit('dbSaveSkipped', {
            message: '저장할 제품 정보가 없습니다.',
            count: 0
          });
        } else {
          
          this.logger.info(`Calling saveProductsToDb with ${matterProducts.length} products`);
          
          const saveResult = await saveProductsToDb(matterProducts);
          
          // 저장 결과 로그
          this.logger.info(`DB Save Result: ${saveResult.added} added, ${saveResult.updated} updated, ${saveResult.unchanged} unchanged, ${saveResult.failed} failed`);
          
          // 상태 이벤트 발생 - DB 저장 결과
          crawlerEvents.emit('dbSaveComplete', {
            success: true,
            added: saveResult.added,
            updated: saveResult.updated,
            unchanged: saveResult.unchanged,
            failed: saveResult.failed,
            duplicateInfo: saveResult.duplicateInfo
          });
          
          // 최종 저장 결과로 크롤링 상태 카운터 업데이트
          this.handleDatabaseSaveResult(saveResult);
        }
      } catch (err) {
        this.logger.error('Error saving products to DB:', { data: err });
        this.logger.error('Error details:', { data: err instanceof Error ? err.stack : String(err) });
        
        // 오류 이벤트 발생
        crawlerEvents.emit('dbSaveError', {
          message: 'Failed to save products to DB',
          error: err instanceof Error ? err.message : String(err)
        });
      }
    } else {
      this.logger.info('Automatic DB save is disabled in settings. Products not saved to DB');
      
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
      autoSavedToDb: sessionConfig.autoAddToLocalDB
    });
  }

  /**
   * 크롤링 오류 처리
   */
  private handleCrawlingError(error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    this.logger.error('Error during crawling process', { data: errorMessage });

    this.state.reportCriticalFailure(`크롤링 과정에서 오류가 발생했습니다: ${errorMessage}`);

    // UI에 오류 상태 업데이트
    crawlerEvents.emit('crawlingProgress', {
      status: 'error',
      currentStage: CRAWLING_STAGE.INIT,
      currentStep: '크롤링 오류',
      message: `오류 발생: ${errorMessage}`,
      percentage: 0,
      currentPage: 0,
      totalPages: 0,
      processedItems: 0,
      totalItems: 0,
      current: 0,
      total: 0,
      elapsedTime: 0,
      startTime: Date.now(),
      criticalError: errorMessage
    });

    crawlerEvents.emit('crawlingError', {
      message: 'Crawling process failed',
      details: errorMessage
    });
  }

  /**
   * 배치 수집된 제품 정보를 임시 파일로 저장
   * @param products 저장할 Matter 제품 정보 배열
   * @param filename 저장할 파일 이름
   * @returns 저장된 파일 경로
   */
  private async saveBatchToTempFile(products: MatterProduct[], filename: string): Promise<string> {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const outputDir = path.resolve(process.cwd(), 'dist-output', 'batch-temp');
      
      // 디렉토리가 없으면 생성
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      const filePath = path.join(outputDir, filename);
      fs.writeFileSync(filePath, JSON.stringify(products, null, 2), 'utf-8');
      this.logger.info('Batch products saved', { data: filePath });
      return filePath;
    } catch (error) {
      this.logger.error('Failed to save batch file', { data: error });
      throw error;
    }
  }

  /**
   * DB 저장 결과를 처리하고 최종 카운트 업데이트
   * 
   * 크롤링 중에는 새로운/업데이트된 항목으로 간주되었지만 실제 DB 저장 시
   * 다른 결과가 나올 수 있으므로 최종 결과를 기준으로 카운트 업데이트
   */
  private handleDatabaseSaveResult(saveResult: { 
    added: number; 
    updated: number; 
    unchanged?: number; 
    failed?: number; 
  }): void {
    // CrawlerState의 최종 카운트 업데이트 메서드 호출
    this.state.updateFinalCounts(
      saveResult.added, 
      saveResult.updated, 
      saveResult.unchanged || 0, 
      saveResult.failed || 0
    );
    
    this.logger.info('Final counts updated based on DB results', { 
      data: `${saveResult.added} new, ${saveResult.updated} updated` 
    });
  }

  /**
   * 크롤링 세션을 최종화하고 일관된 완료 상태를 보장
   * 이 메서드는 모든 데이터 수집이 완료된 후 호출되어야 함
   */
  private async finalizeSession(): Promise<void> {
    this.logger.info('Finalizing crawling session...');
    // 상태를 완료로 설정
    this.state.setStage('completed', '크롤링이 성공적으로 완료되었습니다.');
    this.isCrawling = false;
    // 최종 진행 상태 업데이트 - 100% 완료 상태로 설정
    const progressData = this.state.getProgressData();
    
    // forceProgressSync를 사용하여 완료 상태 동기화
    await this.state.forceProgressSync(progressData.totalItems || 0, progressData.totalItems || 0);
    
    await this.state.updateProgress({
      ...progressData,
      percentage: 100,
      status: 'completed',
      currentStage: CRAWLING_STAGE.COMPLETE, // UI 완료 조건에 맞게 설정 (4)
      stage: 'complete', // UI에서 사용하는 완료 상태 설정
      elapsedTime: progressData.startTime ? Date.now() - progressData.startTime : 0,
      remainingTime: 0, // 완료 시 남은 시간은 0
      message: '크롤링이 성공적으로 완료되었습니다.'
    });
    
    // 완료 이벤트 명확히 전달
    crawlerEvents.emit('crawlingProgress', {
      status: 'completed',
      currentStage: CRAWLING_STAGE.COMPLETE,
      percentage: 100,
      currentPage: progressData.totalItems || 0,
      totalPages: progressData.totalItems || 0,
      processedItems: progressData.totalItems || 0,
      totalItems: progressData.totalItems || 0,
      message: '크롤링이 성공적으로 완료되었습니다.',
      elapsedTime: progressData.startTime ? Date.now() - progressData.startTime : 0,
      remainingTime: 0
    });
    
    // 완료 이벤트 명확히 전달
    crawlerEvents.emit('crawlingComplete', {
      message: '크롤링이 성공적으로 완료되었습니다.',
      timestamp: Date.now()
    });
    if (this.abortController && !this.abortController.signal.aborted) {
      this.abortController.abort('cleanup');
    }
    this.logger.info('Session finalized successfully');
  }

  /**
   * 누락된 제품을 위한 비연속 페이지 범위 크롤링
   * MissingPageCalculator에서 계산된 여러 범위를 처리
   * @param ranges 크롤링할 페이지 범위 배열
   * @param config 크롤러 설정
   * @returns 크롤링 성공 여부
   */
  public async crawlMissingProductPages(ranges: CrawlingRange[], config: CrawlerConfig): Promise<boolean> {
    if (this.isCrawling) {
      this.logger.info('Crawling is already in progress');
      return false;
    }

    this.logger.info('Starting missing product collection', { data: `${ranges.length} ranges` });
    
    // 세션 설정 초기화
    this.sessionConfig = config;
    const sessionConfig = this.sessionConfig;
    
    // 로깅 시스템 초기화
    logger.initializeFromConfig(sessionConfig);
    logger.info('Missing product crawling session started', 'CrawlerEngine');
    
    // 배치 처리 설정
    const batchSize = sessionConfig.batchSize || 30;
    const batchDelayMs = sessionConfig.batchDelayMs || 2000;
    const batchRetryLimit = sessionConfig.batchRetryLimit || 3;
    
    // 크롤링 상태 초기화
    initializeCrawlingState();
    this.state.reset();
    this.isCrawling = true;
    this.abortController = new AbortController();
    this.browserManager = new BrowserManager(sessionConfig);

    try {
      this.logger.info('Starting missing product pages crawling process...');
      
      // 초기 크롤링 상태 이벤트
      initializeCrawlingProgress('누락된 제품 페이지 수집을 시작합니다...', CRAWLING_STAGE.PRODUCT_LIST);
      
      let allCollectedProducts: Product[] = [];
      let totalRangesProcessed = 0;
      
      // 각 범위별로 처리
      for (const range of ranges) {
        if (this.abortController.signal.aborted) {
          this.logger.info('Missing product crawling aborted during range processing');
          break;
        }
        
        totalRangesProcessed++;
        const rangeId = `${range.startPage}-${range.endPage}`;
        
        this.logger.info('Processing range', { 
          data: `${totalRangesProcessed}/${ranges.length}: Pages ${range.startPage} to ${range.endPage} (${range.reason})` 
        });
        
        // 범위 내 페이지 수 계산
        const totalPagesInRange = range.startPage - range.endPage + 1;
        
        // 범위가 배치 크기보다 큰 경우 배치 처리
        if (totalPagesInRange > batchSize) {
          this.logger.info('Range has pages, using batch processing', { 
            data: `${rangeId} has ${totalPagesInRange} pages` 
          });
          
          let currentPage = range.startPage;
          let batchNumber = 0;
          const totalBatches = Math.ceil(totalPagesInRange / batchSize);
          
          while (currentPage >= range.endPage) {
            if (this.abortController.signal.aborted) {
              this.logger.info('Missing product crawling aborted during batch processing');
              break;
            }
            
            batchNumber++;
            const batchEndPage = Math.max(range.endPage, currentPage - batchSize + 1);
            const batchRange = {
              startPage: currentPage,
              endPage: batchEndPage
            };
            
            this.logger.info('Processing batch', { 
              data: `${batchNumber}/${totalBatches} for range ${rangeId}: ${batchRange.startPage} to ${batchRange.endPage}` 
            });
            
            let batchSuccess = false;
            let batchRetryCount = 0;
            let batchProducts: Product[] = [];
            
            // 배치 재시도 로직
            while (!batchSuccess && batchRetryCount <= batchRetryLimit) {
              try {
                if (batchRetryCount > 0) {
                  this.logger.info('Retrying batch', { 
                    data: `${batchNumber} for range ${rangeId} (attempt ${batchRetryCount}/${batchRetryLimit})` 
                  });
                  
                  const retryDelay = Math.min(batchDelayMs * (1.5 ** batchRetryCount), 30000);
                  this.logger.info('Waiting before retry', { data: `${retryDelay}ms` });
                  await new Promise(resolve => setTimeout(resolve, retryDelay));
                }
                
                // 배치용 수집기 생성
                const batchCollector = new ProductListCollector(
                  this.state,
                  this.abortController,
                  sessionConfig,
                  this.browserManager!
                );
                
                // 진행 상황 콜백 설정
                batchCollector.setProgressCallback((processedSuccessfully, totalPagesInStage, stage1PageStatuses, currentOverallRetryCountForStage, stage1StartTime, isStageComplete) => {
                  updateProductListProgress(
                    processedSuccessfully,
                    totalPagesInStage,
                    stage1StartTime,
                    stage1PageStatuses,
                    currentOverallRetryCountForStage,
                    sessionConfig.productListRetryCount,
                    isStageComplete
                  );
                });
                
                this.logger.info('Collecting batch for missing products', { 
                  data: `${batchNumber} range: ${batchRange.startPage} to ${batchRange.endPage}` 
                });
                batchProducts = await batchCollector.collectPageRange(batchRange);
                
                // 실패 확인
                const failedPages = this.state.getFailedPages();
                
                if (failedPages.length === 0) {
                  batchSuccess = true;
                  this.logger.info('Batch completed successfully', { 
                    data: `${batchNumber} for range ${rangeId}${batchRetryCount > 0 ? ` after ${batchRetryCount} retries` : ''}` 
                  });
                } else {
                  this.logger.warn('Batch attempt failed', { 
                    data: `${batchNumber} for range ${rangeId} attempt ${batchRetryCount + 1} failed with ${failedPages.length} failed pages` 
                  });
                  batchRetryCount++;
                  
                  if (batchRetryCount > batchRetryLimit) {
                    this.logger.error('Batch failed after retries', { 
                      data: `${batchNumber} for range ${rangeId} failed after ${batchRetryLimit} retries` 
                    });
                    // 실패해도 다음 배치로 계속 진행
                    batchSuccess = true; // 루프를 빠져나가기 위해
                  } else {
                    // 실패한 페이지 초기화 (재시도를 위해)
                    this.state.resetFailedPages();
                  }
                }
                
                // 수집기 리소스 정리
                await batchCollector.cleanupResources();
                
              } catch (error) {
                this.logger.error('Error processing batch', { 
                  data: `${batchNumber} for range ${rangeId}: ${error}` 
                });
                batchRetryCount++;
                
                if (batchRetryCount > batchRetryLimit) {
                  this.logger.error('Batch failed after retries', { 
                    data: `${batchNumber} for range ${rangeId} failed after ${batchRetryLimit} retries` 
                  });
                  batchSuccess = true; // 루프를 빠져나가기 위해
                }
              }
            }
            
            // 배치 결과를 전체 결과에 추가
            allCollectedProducts = allCollectedProducts.concat(batchProducts);
            
            // 다음 페이지로 이동
            currentPage = batchEndPage - 1;
            
            // 배치 간 지연
            if (currentPage >= range.endPage && batchDelayMs > 0) {
              this.logger.info('Waiting before next batch', { data: `${batchDelayMs}ms` });
              await new Promise(resolve => setTimeout(resolve, batchDelayMs));
            }
          }
        } else {
          // 배치 크기보다 작은 범위는 직접 처리
          this.logger.info('Range processing directly', { 
            data: `${rangeId} has ${totalPagesInRange} pages` 
          });
          
          try {
            const rangeCollector = new ProductListCollector(
              this.state,
              this.abortController,
              sessionConfig,
              this.browserManager!
            );
            
            // 진행 상황 콜백 설정
            rangeCollector.setProgressCallback((processedSuccessfully, totalPagesInStage, stage1PageStatuses, currentOverallRetryCountForStage, stage1StartTime, isStageComplete) => {
              updateProductListProgress(
                processedSuccessfully,
                totalPagesInStage,
                stage1StartTime,
                stage1PageStatuses,
                currentOverallRetryCountForStage,
                sessionConfig.productListRetryCount,
                isStageComplete
              );
            });
            
            const rangeProducts = await rangeCollector.collectPageRange({
              startPage: range.startPage,
              endPage: range.endPage
            });
            
            allCollectedProducts = allCollectedProducts.concat(rangeProducts);
            
            // 수집기 리소스 정리
            await rangeCollector.cleanupResources();
            
          } catch (error) {
            this.logger.error('Error processing range', { data: `${rangeId}: ${error}` });
            // 오류가 있어도 다음 범위로 계속 진행
          }
        }
        
        // 범위 간 지연 (마지막 범위가 아닌 경우)
        if (totalRangesProcessed < ranges.length && batchDelayMs > 0) {
          this.logger.info('Waiting before next range', { data: `${batchDelayMs}ms` });
          await new Promise(resolve => setTimeout(resolve, batchDelayMs));
        }
      }
      
      this.logger.info('Missing product page collection completed', { 
        data: `Collected ${allCollectedProducts.length} products from ${totalRangesProcessed} ranges` 
      });
      
      if (allCollectedProducts.length === 0) {
        this.logger.info('No products found in missing page ranges');
        await this.finalizeSession();
        return true;
      }
      
      // 2단계: 수집된 제품의 상세 정보 크롤링 (기존 로직 재사용)
      this.state.setStage('productDetail:init', '2/3단계: 제품 상세 정보 수집 중...');
      
      const detailCollector = new ProductDetailCollector(
        this.state,
        this.abortController,
        sessionConfig,
        this.browserManager!
      );
      
      const matterProducts = await detailCollector.collect(allCollectedProducts);
      
      this.logger.info('Missing product detail collection completed', { 
        data: `Processed ${matterProducts.length} products` 
      });
      
      // 3단계: 데이터 저장 (자동 저장이 활성화된 경우)
      if (sessionConfig.autoAddToLocalDB && matterProducts.length > 0) {
        this.state.setStage('completed', '3/3단계: 로컬 DB 저장 중...');
        
        try {
          const saveResult = await saveProductsToDb(matterProducts);
          this.logger.info('Missing products saved to database', { 
            data: `${saveResult.added} new, ${saveResult.updated} updated` 
          });
          
          this.handleDatabaseSaveResult(saveResult);
        } catch (error) {
          this.logger.error('Failed to save missing products to database', { data: error });
        }
      }
      
      // 완료 처리
      await this.finalizeSession();
      return true;
      
    } catch (error) {
      this.logger.error('Error during missing product crawling', { data: error });
      this.handleCrawlingError(error);
      return false;
    } finally {
      // 리소스 정리
      if (this.browserManager) {
        await this.browserManager.cleanupResources();
        this.browserManager = null;
      }
      this.isCrawling = false;
    }
  }
}