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
import { CrawlerConfig } from '../../../../types.js';
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
import type { Product, MatterProduct, PageProcessingStatusItem } from '../../../../types.js';
import { debugLog } from '../../util.js';
import { configManager } from '../../ConfigManager.js';

export class CrawlerEngine {
  private state: CrawlerState;
  private isCrawling: boolean = false;
  private abortController: AbortController | null = null;
  private browserManager: BrowserManager | null = null;
  private sessionConfig: CrawlerConfig | null = null; // 현재 크롤링 세션의 설정을 저장

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
   * @param config 세션 전체에 사용할 크롤러 설정 (UI에서 전달)
   */
  public async startCrawling(config: CrawlerConfig): Promise<boolean> {
    if (this.isCrawling) {
      console.log('[CrawlerEngine] Crawling is already in progress.');
      return false;
    }
    // 세션 시작 시 받은 config만 사용 (세션 도중 변경 무시)
    // 이 config를 크롤링 세션 전체에서 공유하여 불필요한 configManager.getConfig() 호출 방지
    this.sessionConfig = config; // 세션 설정을 클래스 멤버에 저장
    const sessionConfig = this.sessionConfig; // 지역 변수로도 사용
    
    // 배치 처리 설정 가져오기
    const batchSize = sessionConfig.batchSize || 30; // 기본값 30페이지
    const batchDelayMs = sessionConfig.batchDelayMs || 2000; // 기본값 2초
    const enableBatchProcessing = sessionConfig.enableBatchProcessing !== false; // 기본값 true
    const batchRetryLimit = sessionConfig.batchRetryLimit || 3; // 기본값 3회
    
    // 크롤링 상태 초기화
    initializeCrawlingState();
    
    // 크롤러 상태(CrawlerState) 완전 초기화 - 카운터가 이전 세션에서 누적되지 않도록 함
    this.state.reset();
    console.log('[CrawlerEngine] CrawlerState has been reset for new crawling session');
    
    // 명시적으로 상태 확인 (디버깅용)
    console.log('[CrawlerEngine] State after reset: ' +
                `detailStageProcessedCount=${this.state.getDetailStageProcessedCount()}, ` +
                `detailStageNewCount=${this.state.getDetailStageNewCount()}, ` +
                `detailStageUpdatedCount=${this.state.getDetailStageUpdatedCount()}`);
    
    this.isCrawling = true;
    this.abortController = new AbortController();
    
    // Use the session config for BrowserManager to maintain consistency
    // Ensure browserManager is always (re)created with the session config for a new crawling session
    this.browserManager = new BrowserManager(sessionConfig);

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

      // 사용자 설정 가져오기 (CRAWL-RANGE-001) - from the session config
      const userPageLimit = sessionConfig.pageRangeLimit;
      
      // 제품 목록 수집기 생성 (1단계) - Pass the session config for consistency
      const productListCollector = new ProductListCollector(this.state, this.abortController, sessionConfig, this.browserManager!);
      
      // totalPages와 lastPageProductCount 정보 가져오기
      const { totalPages: totalPagesFromCache, lastPageProductCount } = await productListCollector.fetchTotalPagesCached(true);
      
      // 크롤링 범위 계산
      const { startPage, endPage } = await PageIndexManager.calculateCrawlingRange(
        totalPagesFromCache, 
        lastPageProductCount || 0,
        userPageLimit,
        sessionConfig // 세션 설정을 명시적으로 전달
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
          sessionConfig.productListRetryCount,
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
            batchRetryCount: 0,
            batchRetryLimit: batchRetryLimit,
            message: `배치 처리 중: ${batchNumber}/${totalBatches} 배치 - 1단계: 제품 목록 수집`
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
                console.log(`[CrawlerEngine] Retrying batch ${batchNumber} 1단계 (attempt ${batchRetryCount}/${batchRetryLimit})`);
                
                // 재시도 상태 업데이트
                crawlerEvents.emit('crawlingProgress', {
                  currentBatch: batchNumber,
                  totalBatches: totalBatches,
                  batchRetryCount: batchRetryCount,
                  batchRetryLimit: batchRetryLimit,
                  message: `배치 ${batchNumber} 1단계 재시도 중 (${batchRetryCount}/${batchRetryLimit})`
                });
                
                // 재시도 전 잠시 대기 (지수 백오프 적용)
                const retryDelay = Math.min(batchDelayMs * (1.5 ** batchRetryCount), 30000);
                console.log(`[CrawlerEngine] Waiting ${retryDelay}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
              }
              
              // 이 배치를 위한 새로운 수집기 생성
              const batchCollector = new ProductListCollector(
                this.state,
                this.abortController,
                sessionConfig,
                this.browserManager!
              );
              
              batchCollector.setProgressCallback(enhancedProgressUpdater);
              
              // 이 배치에 대한 페이지 범위 설정
              console.log(`[CrawlerEngine] Collecting batch ${batchNumber} range: ${batchRange.startPage} to ${batchRange.endPage}${batchRetryCount > 0 ? ` (retry ${batchRetryCount})` : ''}`);
              batchProducts = await batchCollector.collectPageRange(batchRange);
              
              // 이 배치의 실패 확인
              const failedPages = this.state.getFailedPages();
              
              // 재시도 결과 확인
              if (failedPages.length === 0) {
                // 성공한 경우
                batchSuccess = true;
                console.log(`[CrawlerEngine] Batch ${batchNumber} 1단계 completed successfully${batchRetryCount > 0 ? ` after ${batchRetryCount} retries` : ''}`);
              } else {
                // 실패한 경우
                console.warn(`[CrawlerEngine] Batch ${batchNumber} 1단계 attempt ${batchRetryCount + 1} failed with ${failedPages.length} failed pages.`);
                
                // 재시도 횟수 증가
                batchRetryCount++;
                
                // 마지막 시도였다면 실패로 처리
                if (batchRetryCount > batchRetryLimit) {
                  console.error(`[CrawlerEngine] Batch ${batchNumber} 1단계 failed after ${batchRetryLimit} retries.`);
                  
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
              console.error(`[CrawlerEngine] Error processing batch ${batchNumber} 1단계:`, error);
              
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
          
          // 1단계가 성공했고 제품이 있는 경우에만 2단계 실행
          if (batchSuccess && batchProducts.length > 0) {
            // 2단계: 제품 상세 정보 수집 및 DB 저장
            crawlerEvents.emit('crawlingProgress', {
              currentBatch: batchNumber,
              totalBatches: totalBatches,
              batchRetryCount: 0,
              batchRetryLimit: batchRetryLimit,
              message: `배치 처리 중: ${batchNumber}/${totalBatches} 배치 - 2단계: 제품 상세 정보 수집`
            });
            
            console.log(`[CrawlerEngine] Starting batch ${batchNumber} 2단계 (detail collection) with ${batchProducts.length} products`);
            
            // 2단계 시작 시간
            const detailStartTime = Date.now();
            
            // 2단계 진행 상황 초기화
            updateProductDetailProgress(0, batchProducts.length, detailStartTime);
            
            // 2단계 상세 정보 수집기 생성
            const batchDetailCollector = new ProductDetailCollector(
              this.state,
              this.abortController,
              sessionConfig,
              this.browserManager!
            );
            
            try {
              // 이 배치의 제품 상세 정보 수집
              const batchMatterProducts = await batchDetailCollector.collect(batchProducts);
              
              // 2단계 완료 이벤트
              updateProductDetailProgress(
                batchProducts.length, 
                batchProducts.length, 
                detailStartTime, 
                true
              );
              
              // DB 저장 단계
              crawlerEvents.emit('crawlingProgress', {
                currentBatch: batchNumber,
                totalBatches: totalBatches,
                message: `배치 처리 중: ${batchNumber}/${totalBatches} 배치 - DB 저장`
              });
              
              // 배치 결과를 DB에 저장
              if (sessionConfig.autoAddToLocalDB && batchMatterProducts.length > 0) {
                try {
                  console.log(`[CrawlerEngine] Saving batch ${batchNumber} products to DB (${batchMatterProducts.length} products)`);
                  
                  // 임시 파일 저장 (백업 용도)
                  const batchFilename = `batch_${batchNumber}_${Date.now()}.json`;
                  try {
                    await this.saveBatchToTempFile(batchMatterProducts, batchFilename);
                  } catch (saveErr) {
                    const errorMessage = saveErr instanceof Error ? saveErr.message : String(saveErr);
                    console.warn(`[CrawlerEngine] Failed to save temporary batch file: ${errorMessage}`);
                  }
                  
                  // DB에 저장
                  const saveResult = await saveProductsToDb(batchMatterProducts);
                  
                  // 저장 결과 로그
                  console.log(`[CrawlerEngine] Batch ${batchNumber} DB Save Result: ${saveResult.added} added, ${saveResult.updated} updated`);
                  
                  // DB 저장 완료 이벤트
                  crawlerEvents.emit('dbSaveComplete', {
                    success: true,
                    added: saveResult.added,
                    updated: saveResult.updated,
                    unchanged: saveResult.unchanged,
                    failed: saveResult.failed,
                    message: `배치 ${batchNumber}: ${saveResult.added}개 추가, ${saveResult.updated}개 업데이트됨`
                  });
                } catch (dbError) {
                  console.error(`[CrawlerEngine] Error saving batch ${batchNumber} to DB:`, dbError);
                  
                  // DB 저장 오류 이벤트
                  crawlerEvents.emit('dbSaveError', {
                    error: `배치 ${batchNumber} DB 저장 오류: ${dbError instanceof Error ? dbError.message : String(dbError)}`
                  });
                }
              } else {
                console.log(`[CrawlerEngine] Skipping DB save for batch ${batchNumber} (auto-save disabled or no products)`);
                
                // DB 저장 스킵 이벤트
                crawlerEvents.emit('dbSaveSkipped', {
                  message: `배치 ${batchNumber} DB 저장 건너뜀 (${sessionConfig.autoAddToLocalDB ? '제품 없음' : '자동 저장 비활성화'})`,
                  count: batchMatterProducts.length
                });
              }
              
              // 배치 제품 정보 전체 목록에 추가
              allCollectedProducts = allCollectedProducts.concat(batchProducts);
              
              console.log(`[CrawlerEngine] Batch ${batchNumber} complete`);
              
            } catch (detailError) {
              console.error(`[CrawlerEngine] Error in batch ${batchNumber} 2단계 (detail collection):`, detailError);
              
              // 2단계 오류 이벤트
              const errorMessage = detailError instanceof Error ? detailError.message : String(detailError);
              const message = `배치 ${batchNumber} 2단계 처리 중 오류 발생: ${errorMessage}`;
              
              crawlerEvents.emit('crawlingProgress', {
                currentBatch: batchNumber,
                totalBatches: totalBatches,
                message: message,
                error: errorMessage
              });
              
              // 치명적인 오류인 경우에만 전체 크롤링 중단
              if (detailError instanceof Error && detailError.message.includes('CRITICAL')) {
                this.state.reportCriticalFailure(message);
                return false;
              }
            }
          } else {
            console.warn(`[CrawlerEngine] Batch ${batchNumber} has no products to process in 2단계, skipping`);
          }
          
          // 이 배치의 실패 확인 (최종 상태)
          const currentFailedPages = this.state.getFailedPages();
          if (currentFailedPages.length > 0) {
            console.warn(`[CrawlerEngine] Batch ${batchNumber} completed with ${currentFailedPages.length} failed pages.`);
          }
          
          // 다음 배치 준비
          currentPage = batchEndPage - 1;
          
          // 배치 간 지연 추가
          if (batch < totalBatches - 1) {
            console.log(`[CrawlerEngine] Batch ${batchNumber} complete. Waiting ${batchDelayMs}ms before next batch...`);
            
            crawlerEvents.emit('crawlingProgress', {
              currentBatch: batchNumber,
              totalBatches: totalBatches,
              message: `배치 ${batchNumber} 완료. 다음 배치 준비 중...`
            });
            
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
      
      // 배치 처리 완료 알림
      crawlerEvents.emit('crawlingProgress', {
        message: '모든 배치 처리가 완료되었습니다.',
        status: 'completed_stage_1'
      });

      // 중단 여부 확인 - 명시적으로 요청된 중단만 처리
      if (this.abortController.signal.aborted) {
        console.log('[CrawlerEngine] Crawling was explicitly stopped after product list collection.');
        this.isCrawling = false;
        return true;
      }

      // 제품 목록 결과 저장
      this.handleListCrawlingResults(products);

      // 치명적 오류 확인 - 하지만 성공적인 수집이 있었다면 오류를 무시
      const hasCriticalFailures = this.state.hasCriticalFailures();
      const hasSuccessfulCollection = products.length > 0;

      if (hasCriticalFailures && !hasSuccessfulCollection) {
        const message = '제품 목록 수집 중 심각한 오류가 발생했고 수집된 제품이 없습니다. 크롤링 중단.';
        console.error(`[CrawlerEngine] ${message}`);
        this.state.reportCriticalFailure(message);
        this.isCrawling = false;
        return false;
      } else if (hasCriticalFailures && hasSuccessfulCollection) {
        console.warn(`[CrawlerEngine] 일부 오류가 있었지만 ${products.length}개 제품 수집에 성공했습니다. 계속 진행합니다.`);
        // 치명적 오류 상태를 정리하고 계속 진행
        this.state.clearCriticalFailures();
      }

      if (products.length === 0) {
        console.log('[CrawlerEngine] No products found to process. Crawling complete.');
        this.isCrawling = false;
        return true;
      }

      // 성공률 확인
      const failedPages = this.state.getFailedPages();
      const successRate = totalPagesFromCache > 0 ? (totalPagesFromCache - failedPages.length) / totalPagesFromCache : 1;
      const successRatePercent = (successRate * 100).toFixed(1);
      
      // 실패 페이지가 있어도 충분한 제품이 수집되었다면 경고만 하고 계속 진행
      if (failedPages.length > 0) {
        const message = `[경고] 제품 목록 수집 성공률: ${successRatePercent}% (${totalPagesFromCache - failedPages.length}/${totalPagesFromCache}).`;
        console.warn(`[CrawlerEngine] ${message}`);
        
        // 제품이 충분히 수집되었다면 계속 진행
        if (products.length > 0) {
          console.log(`[CrawlerEngine] ${products.length}개 제품이 수집되어 계속 진행합니다.`);
          
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

      // 배치 처리를 사용하지 않은 경우에만 여기서 2단계 실행
      if (!enableBatchProcessing || totalPagesToCrawl <= batchSize) {
        // [NEW CODE START] Correctly setup CrawlerState for Stage 2 product detail collection
        // This ensures the UI displays the correct total number of products to be processed from Stage 1.
        console.log(`[CrawlerEngine] Preparing CrawlerState for Stage 2 (non-batch or small batch). Total products from Stage 1: ${products.length}`);

        // Set the specific counter for total products in the detail stage.
        // This helps CrawlerState and UI to correctly track progress against the total items from Stage 1.
        this.state.setDetailStageProductCount(products.length);
        console.log(`[CrawlerEngine] Called this.state.setDetailStageProductCount(${products.length}) for Stage 2.`);

        // Update the main progress state for the beginning of Stage 2.
        // This resets processed counts and sets the overall total for this stage.
        this.state.updateProgress({
            currentStage: CRAWLING_STAGE.PRODUCT_DETAIL, // Mark current stage as Product Detail
            totalItems: products.length,                 // Total items to process in Stage 2
            processedItems: 0,                           // Reset processed items for Stage 2
            newItems: 0,                                 // Reset new items count
            updatedItems: 0,                             // Reset updated items count
            percentage: 0,                               // Reset percentage completion
            currentStep: '제품 상세 정보 수집 초기화 중...',   // Initial status message for Stage 2
            currentPage: 0,                              // Reset current page (if applicable to Stage 2)
            totalPages: 0,                               // Reset total pages (if applicable to Stage 2)
        });
        console.log(`[CrawlerEngine] Called this.state.updateProgress for start of Stage 2: totalItems=${products.length}, processedItems=0.`);
        // [NEW CODE END]

        // 2/2단계: 제품 상세 정보 수집 시작 알림
        const detailStartTime = Date.now();
        updateProductDetailProgress(0, products.length, detailStartTime);
        
        debugLog(`[CrawlerEngine] Found ${products.length} products to process. Starting detail collection...`);
        
        // 제품 상세 정보 수집기 생성 (2단계)
        const productDetailCollector = new ProductDetailCollector(this.state, this.abortController, sessionConfig, this.browserManager); // Pass session config for consistency
        
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
      } else {
        // 배치 처리를 사용한 경우에는 여기서 2단계 추가 작업을 할 필요가 없음
        console.log('[CrawlerEngine] All batches have been processed in batch mode, skipping additional detail collection.');
        
        // 모든 배치가 완료되었음을 알림
        crawlerEvents.emit('crawlingComplete', {
          success: true,
          count: products.length,
          message: '모든 배치가 처리되었습니다. 배치별 상세 정보가 이미 수집 및 저장되었습니다.',
          autoSavedToDb: sessionConfig.autoAddToLocalDB
        });
      }

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
      
      // 최종 완료 로그
      console.log('[CrawlerEngine] Crawling process finalized.');
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
    // 현재 세션의 설정이 있으면 사용하고, 없으면 최신 설정 가져옴
    const sessionConfig = this.sessionConfig || configManager.getConfig();
    console.log('[CrawlerEngine] checkCrawlingStatus called with config:', JSON.stringify(sessionConfig));
    
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

    // 설정에 따라 자동으로 DB에 저장 - 메서드 전체에서 일관된 설정 사용
    // 세션 시작 시 저장한 설정을 사용하므로 여기서 새로 가져올 필요가 없음
    // 세션 내에서 설정 변경을 무시하는 것이 목적임
    const sessionConfig = this.sessionConfig || configManager.getConfig();
    console.log(`[CrawlerEngine] Current autoAddToLocalDB setting: ${sessionConfig.autoAddToLocalDB}`);
    
    if (sessionConfig.autoAddToLocalDB) {
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
      autoSavedToDb: sessionConfig.autoAddToLocalDB
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
      console.log(`[CrawlerEngine] Batch products saved to ${filePath}`);
      return filePath;
    } catch (error) {
      console.error('[CrawlerEngine] Failed to save batch file:', error);
      throw error;
    }
  }
}