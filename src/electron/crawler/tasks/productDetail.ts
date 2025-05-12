/**
 * productDetail.ts
 * 제품 상세 정보 수집을 담당하는 클래스
 */

import { type Page } from 'playwright-chromium';
import { getRandomDelay, delay } from '../utils/delay.js';
import { CrawlerState } from '../core/CrawlerState.js';
import {
  promisePool, updateProductTaskStatus, initializeProductTaskStates
} from '../utils/concurrency.js';
import { MatterProductParser } from '../parsers/MatterProductParser.js';
import { BrowserManager } from '../browser/BrowserManager.js';

import type { DetailCrawlResult } from '../utils/types.js';
import type { Product, MatterProduct, CrawlerConfig } from '../../../../types.d.ts';
import { debugLog } from '../../util.js';
import { 
  crawlerEvents, 
  updateRetryStatus, 
  logRetryError
} from '../utils/progress.js';

export class ProductDetailCollector {
  private state: CrawlerState;
  private abortController: AbortController;
  private readonly config: CrawlerConfig;
  private browserManager: BrowserManager;
  
  // 설정 캐싱 관련 변수 (1. 설정 캐싱)
  private cachedMinDelay: number;
  private cachedMaxDelay: number;
  private cachedDetailTimeout: number;

  constructor(
    state: CrawlerState,
    abortController: AbortController,
    config: CrawlerConfig,
    browserManager: BrowserManager
  ) {
    this.state = state;
    this.abortController = abortController;
    this.config = config;
    this.browserManager = browserManager;
    
    // 설정 캐싱 초기화 (1. 설정 캐싱)
    this.cachedMinDelay = config.minRequestDelayMs ?? 100;
    this.cachedMaxDelay = config.maxRequestDelayMs ?? 2200;
    this.cachedDetailTimeout = config.productDetailTimeoutMs ?? 60000;
  }

  /**
   * 진행 상황 업데이트 함수
   * @param isNew 새로운 항목인지 여부
   */
  private updateProgress(isNew: boolean = true): void {
    this.state.recordDetailItemProcessed(isNew);
  }

  /**
   * 페이지 최적화를 위한 메서드 (2. 리소스 로딩 최적화)
   */
  private async optimizePage(page: Page): Promise<void> {
    // 더 공격적인 리소스 차단
    await page.route('**/*', (route) => {
      const request = route.request();
      const resourceType = request.resourceType();
      const url = request.url();
      
      // HTML과 필수 CSS만 허용
      if (resourceType === 'document' || 
          (resourceType === 'stylesheet' && url.includes('main'))) {
        route.continue();
      } else {
        route.abort();
      }
    });
  }

  /**
   * 최적화된 네비게이션 함수 (4. 페이지 네비게이션 최적화)
   */
  private async optimizedNavigation(page: Page, url: string, timeout: number): Promise<boolean> {
    let navigationSucceeded = false;
    
    try {
      // 첫 시도: 매우 짧은 타임아웃으로 시도
      await page.goto(url, { 
        waitUntil: 'domcontentloaded', // 더 가벼운 로드 조건
        timeout: Math.min(5000, timeout / 3) // 매우 짧은 타임아웃
      });
      navigationSucceeded = true;
    } catch (error: any) {
      if (error && error.name === 'TimeoutError') {
        // 타임아웃 발생해도 HTML이 로드되었다면 성공으로 간주
        const readyState = await page.evaluate(() => document.readyState).catch(() => 'unknown');
        if (readyState !== 'loading' && readyState !== 'unknown') {
          navigationSucceeded = true;
          debugLog(`Navigation timed out but document is in '${readyState}' state. Continuing...`);
        } else {
          // 첫 시도 실패 시, 두 번째 시도 - 조금 더 긴 타임아웃
          try {
            await page.goto(url, { 
              waitUntil: 'domcontentloaded',
              timeout: timeout / 2
            });
            navigationSucceeded = true;
          } catch (secondError: any) {
            // 최종 실패 시 오류 로깅
            debugLog(`Navigation failed after retry: ${secondError && secondError.message ? secondError.message : 'Unknown error'}`);
          }
        }
      }
    }
    
    return navigationSucceeded;
  }

  /**
   * 제품 상세 정보를 크롤링하는 함수
   */
  private async crawlProductDetail(product: Product, signal: AbortSignal): Promise<MatterProduct> {
    const delayTime = getRandomDelay(this.cachedMinDelay, this.cachedMaxDelay);
    await delay(delayTime);
    
    let page = null;
    let context = null;

    try {
      // 컨텍스트 풀에서 컨텍스트 가져오기 (3. 브라우저 컨텍스트 재사용)
      context = await this.browserManager.getContextFromPool();
      page = await this.browserManager.createPageInContext(context);

      if (!page) {
        throw new Error('Failed to create page in new context');
      }

      if (signal.aborted) {
        throw new Error('Aborted before page operations');
      }

      // 페이지 최적화 적용 (2. 리소스 로딩 최적화)
      await this.optimizePage(page);
      
      // 최적화된 네비게이션 적용 (4. 페이지 네비게이션 최적화)
      const navigated = await this.optimizedNavigation(page, product.url, this.cachedDetailTimeout);
      
      if (!navigated) {
        throw new Error(`Navigation failed for ${product.url}`);
      }

      if (signal.aborted) {
        throw new Error('Aborted after page.goto');
      }

      const extractedDetails = await page.evaluate(
        MatterProductParser.extractProductDetails,
        product
      );

      const matterProduct: MatterProduct = {
        ...product,
        id: `csa-matter-${product.pageId}-${product.indexInPage}`,
        ...extractedDetails,
      };

      return matterProduct;

    } catch (error: unknown) {
      debugLog(`Error or ${this.cachedDetailTimeout} ms timeout for ${product.model}`);
      if (signal.aborted) {
        throw new Error(`Aborted crawling for ${product.url} during operation.`);
      }
      console.error(`[ProductDetailCollector] Error crawling product detail for ${product.url}:`, error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to crawl product detail for ${product.url}: ${errorMessage}`);
    } finally {
      if (page && !page.isClosed()) {
        try {
          await page.close().catch(e => {
            debugLog(`[ProductDetailCollector] Error closing page: ${e}`);
          });
        } catch (e) {
          debugLog(`[ProductDetailCollector] Error closing page: ${e}`);
        }
      }
      
      // 컨텍스트가 유효하면 풀에 반환 (3. 브라우저 컨텍스트 재사용)
      if (context) {
        try {
          await this.browserManager.returnContextToPool(context);
        } catch (e) {
          debugLog(`[ProductDetailCollector] Error returning context to pool: ${e}`);
        }
      }
    }
  }

  /**
   * 제품 상세 정보 수집 프로세스 실행
   */
  public async collect(products: Product[]): Promise<MatterProduct[]> {
    debugLog(`[ProductDetailCollector] Starting product detail collection for ${products.length} products.`);
    if (products.length === 0) {
      console.log('[ProductDetailCollector] No products to collect details for.');
      return [];
    }

    const config = this.config;

    this.state.setStage('productDetail:init', '2/2단계: 제품 상세 정보 수집 준비 중');
    this.state.updateProgress({
      totalItems: products.length,
      currentItem: 0,
      parallelTasks: config.detailConcurrency,
      activeParallelTasks: 0
    });

    const matterProducts: MatterProduct[] = [];
    const failedProducts: string[] = [];
    const failedProductErrors: Record<string, string[]> = {};

    initializeProductTaskStates(products);

    try {
      // Force a browser context refresh before starting detail collection
      if (this.browserManager && typeof this.browserManager.forceRefreshContext === 'function') {
        debugLog('[ProductDetailCollector] Forcing browser context refresh before detail collection.');
        try {
          await this.browserManager.forceRefreshContext();
          debugLog('[ProductDetailCollector] Browser context refreshed successfully.');
        } catch (refreshError) {
          console.error('[ProductDetailCollector] Failed to refresh browser context:', refreshError);
          // Decide if this error is critical enough to stop the collection
          // For now, we'll log and continue, but you might want to throw an error:
          // throw new Error(`Failed to refresh browser context: ${refreshError.message}`);
        }
      } else {
        debugLog('[ProductDetailCollector] BrowserManager or forceRefreshContext method not available. Skipping context refresh.');
      }

      this.state.setStage('productDetail:fetching', '2/2단계: 제품 상세 정보 수집 중');
      debugLog(`Starting phase 2: crawling product details for ${products.length} products`);

      crawlerEvents.emit('crawlingTaskStatus', {
        taskId: 'detail-start',
        status: 'running',
        message: JSON.stringify({
          stage: 2,
          type: 'start',
          totalProducts: products.length,
          startTime: new Date().toISOString()
        })
      });

      await this.executeParallelProductDetailCrawling(
        products,
        matterProducts,
        failedProducts,
        failedProductErrors
      );

      if (this.abortController.signal.aborted) {
        console.log('[ProductDetailCollector] Crawling was stopped during product detail collection.');
      
        crawlerEvents.emit('crawlingTaskStatus', {
          taskId: 'detail-abort',
          status: 'stopped',
          message: JSON.stringify({
            stage: 2,
            type: 'abort',
            processedItems: this.state.getDetailStageProcessedCount(),
            totalItems: products.length,
            abortReason: 'user_request',
            endTime: new Date().toISOString()
          })
        });
        return matterProducts;
      }

      const initialFailedProducts = [...failedProducts];
      if (failedProducts.length > 0) {
        console.log(`[ProductDetailCollector] Retrying ${failedProducts.length} failed products.`);
        await this.retryFailedProductDetails(
          failedProducts,
          products,
          matterProducts,
          failedProductErrors
        );
      }

      const totalProducts = products.length;
      const finalFailedCount = failedProducts.length;
      const finalFailureRate = totalProducts > 0 ? finalFailedCount / totalProducts : 0;
      const initialFailRate = totalProducts > 0 ? initialFailedProducts.length / totalProducts : 0;

      console.log(`[ProductDetailCollector] Initial failure rate: ${(initialFailRate * 100).toFixed(1)}% (${initialFailedProducts.length}/${totalProducts})`);
      console.log(`[ProductDetailCollector] Final failure rate after retries: ${(finalFailureRate * 100).toFixed(1)}% (${finalFailedCount}/${totalProducts})`);

      failedProducts.forEach(url => {
        const errors = failedProductErrors[url] || ['Unknown error'];
        this.state.addFailedProduct(url, errors.join('; '));
      });

      const successProducts = totalProducts - finalFailedCount;
      const successRate = totalProducts > 0 ? successProducts / totalProducts : 1;
      console.log(`[ProductDetailCollector] Collection success rate: ${(successRate * 100).toFixed(1)}% (${successProducts}/${totalProducts})`);

      crawlerEvents.emit('crawlingTaskStatus', {
        taskId: 'detail-complete',
        status: 'success',
        message: JSON.stringify({
          stage: 2,
          type: 'complete',
          totalItems: products.length,
          processedItems: this.state.getDetailStageProcessedCount(),
          successItems: successProducts,
          failedItems: finalFailedCount,
          newItems: this.state.getDetailStageNewCount(),
          updatedItems: this.state.getDetailStageUpdatedCount(),
          successRate: parseFloat((successRate * 100).toFixed(1)),
          endTime: new Date().toISOString()
        })
      });
      
      this.state.setStage('productDetail:processing', '2단계: 제품 상세 정보 처리 완료');

    } catch (error) {
      console.error('[ProductDetailCollector] Critical error during product detail collection:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.state.setStage('failed', `2단계 상세 수집 중 오류: ${errorMessage}`);
      crawlerEvents.emit('crawlingError', {
        stage: 'Product Detail Collection',
        message: errorMessage,
        error,
      });
    } finally {
      await this.cleanupResources();
    }

    return matterProducts;
  }

  /**
   * 리소스 정리를 위한 함수
   */
  private async cleanupResources(): Promise<void> {
    console.log('[ProductDetailCollector] Cleaning up resources specific to ProductDetailCollector...');
    
    try {
      const progressData = this.state.getProgressData();
      const totalItems = progressData?.totalItems ?? this.state.getDetailStageProcessedCount(); 

      this.state.updateProgress({
        currentItem: this.state.getDetailStageProcessedCount(), 
        totalItems: totalItems,
        stage: 'productDetail:processing', 
        message: '2단계: 제품 상세 정보 처리 완료'
      });
      
      crawlerEvents.emit('crawlingStageChanged', 'productDetail:processing', '2단계: 제품 상세 정보 처리 완료');
      
      // Note: We don't need to explicitly clean up the context pool here
      // as it's managed by BrowserManager's close/cleanupResources method
      // which is called by the main crawler after all collectors are done
    } catch (error) {
      console.error('[ProductDetailCollector] Error during final state update in cleanupResources:', error);
    }
  }

  /**
   * 단일 제품 상세 정보 크롤링 작업을 처리하는 함수
   */
  private async processProductDetailCrawl(
    product: Product,
    matterProducts: MatterProduct[],
    failedProducts: string[],
    failedProductErrors: Record<string, string[]>,
    signal: AbortSignal,
    attempt: number = 1
  ): Promise<DetailCrawlResult | null> {
    if (signal.aborted) {
      updateProductTaskStatus(product.url, 'stopped');
      return null;
    }

    crawlerEvents.emit('crawlingTaskStatus', {
      taskId: `product-${product.url}`,
      status: 'running',
      message: JSON.stringify({
        stage: 2,
        type: 'product',
        url: product.url,
        manufacturer: product.manufacturer || 'Unknown',
        model: product.model || 'Unknown',
        attempt: attempt,
        startTime: new Date().toISOString()
      })
    });

    updateProductTaskStatus(product.url, 'running');

    try {
      const detailProduct = await Promise.race([
        this.crawlProductDetail(product, signal),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), this.cachedDetailTimeout)
        )
      ]);

      updateProductTaskStatus(product.url, 'success');
      
      crawlerEvents.emit('crawlingTaskStatus', {
        taskId: `product-${product.url}`,
        status: 'success',
        message: JSON.stringify({
          stage: 2,
          type: 'product',
          url: product.url,
          manufacturer: detailProduct.manufacturer || 'Unknown',
          model: detailProduct.model || 'Unknown',
          endTime: new Date().toISOString()
        })
      });
      
      this.updateProgress(true);

      matterProducts.push(detailProduct);

      return { url: product.url, product: detailProduct };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const status = signal.aborted ? 'stopped' : 'error';
      updateProductTaskStatus(product.url, status, errorMsg);

      crawlerEvents.emit('crawlingTaskStatus', {
        taskId: `product-${product.url}`,
        status: 'error',
        message: JSON.stringify({
          stage: 2,
          type: 'product',
          url: product.url,
          manufacturer: product.manufacturer || 'Unknown',
          model: product.model || 'Unknown',
          error: errorMsg,
          attempt: attempt,
          endTime: new Date().toISOString()
        })
      });

      failedProducts.push(product.url);
      if (!failedProductErrors[product.url]) {
        failedProductErrors[product.url] = [];
      }

      const attemptPrefix = attempt > 1 ? `Attempt ${attempt}: ` : '';
      failedProductErrors[product.url].push(`${attemptPrefix}${errorMsg}`);

      return { url: product.url, product: null, error: errorMsg };
    }
  }

  /**
   * 제품 상세 정보 병렬 크롤링 실행
   */
  private async executeParallelProductDetailCrawling(
    products: Product[],
    matterProducts: MatterProduct[],
    failedProducts: string[],
    failedProductErrors: Record<string, string[]>
  ): Promise<void> {
    const config = this.config;
    
    let processedItems = 0;
    const totalItems = products.length;
    const startTime = Date.now();
    let lastProgressUpdate = 0;
    const progressUpdateInterval = 3000;
  
    this.state.updateProgress({
      currentItem: 0,
      totalItems: totalItems,
      stage: 'productDetail:fetching',
      message: `2/2단계: 제품 상세 정보 수집 중 (0/${totalItems})`
    });
    
    crawlerEvents.emit('crawlingProgress', {
      status: 'running',
      currentPage: 0,
      totalPages: totalItems,
      processedItems: 0,
      totalItems: totalItems,
      percentage: 0,
      currentStep: '제품 상세 정보 수집',
      currentStage: 2,
      remainingTime: undefined,
      elapsedTime: 0,
      startTime: startTime,
      estimatedEndTime: 0,
      newItems: 0,
      updatedItems: 0,
      message: `2단계: 제품 상세정보 0/${totalItems} 처리 중 (0.0%)`
    });
  
    console.log(`[ProductDetailCollector] Starting detail collection for ${totalItems} products`);
  
    await promisePool(
      products,
      async (product, signal) => {
        const result = await this.processProductDetailCrawl(
          product, matterProducts, failedProducts, failedProductErrors, signal
        );
  
        processedItems++;
  
        const now = Date.now();
        if (now - lastProgressUpdate > progressUpdateInterval) {
          lastProgressUpdate = now;
          
          const percentage = (processedItems / totalItems) * 100;
          const elapsedTime = now - startTime;
          let remainingTime: number | undefined = undefined;
          
          if (processedItems > totalItems * 0.1) {
            const avgTimePerItem = elapsedTime / processedItems;
            remainingTime = Math.round((totalItems - processedItems) * avgTimePerItem);
          }
          
          const message = `2단계: 제품 상세정보 ${processedItems}/${totalItems} 처리 중 (${percentage.toFixed(1)}%)`;
  
          this.state.updateProgress({
            currentItem: processedItems,
            totalItems: totalItems,
            message: message,
            percentage: percentage
          });
  
          const detailConcurrency = config.detailConcurrency ?? 1;
          const activeTasksCount = Math.min(detailConcurrency, totalItems - processedItems + 1);
          this.state.updateParallelTasks(activeTasksCount, detailConcurrency);
          
          crawlerEvents.emit('crawlingProgress', {
            status: 'running',
            currentPage: processedItems,
            totalPages: totalItems,
            processedItems: processedItems,
            totalItems: totalItems,
            percentage: percentage,
            currentStep: '제품 상세 정보 수집',
            currentStage: 2,
            remainingTime: remainingTime,
            elapsedTime: elapsedTime,
            startTime: startTime,
            estimatedEndTime: remainingTime ? now + remainingTime : 0,
            newItems: this.state.getDetailStageNewCount(),
            updatedItems: this.state.getDetailStageUpdatedCount(),
            message: message
          });
        }
  
        return result;
      },
      config.detailConcurrency ?? 1,
      this.abortController
    );
  
    const finalElapsedTime = Date.now() - startTime;
    this.state.updateProgress({
      currentItem: this.state.getDetailStageProcessedCount(),
      totalItems: totalItems,
      message: `2/2단계: 제품 상세 정보 수집 완료 (${this.state.getDetailStageProcessedCount()}/${totalItems})`,
      percentage: 100
    });
    this.state.updateParallelTasks(0, config.detailConcurrency ?? 1);
    
    crawlerEvents.emit('crawlingProgress', {
      status: 'completed',
      currentPage: processedItems,
      totalPages: totalItems,
      processedItems: processedItems,
      totalItems: totalItems,
      percentage: 100,
      currentStep: '제품 상세 정보 수집',
      currentStage: 2,
      remainingTime: 0,
      elapsedTime: finalElapsedTime,
      startTime: startTime,
      estimatedEndTime: Date.now(),
      newItems: this.state.getDetailStageNewCount(),
      updatedItems: this.state.getDetailStageUpdatedCount(),
      message: `2단계 완료: ${totalItems}개 제품 상세정보 수집 완료 (신규: ${this.state.getDetailStageNewCount()}, 업데이트: ${this.state.getDetailStageUpdatedCount()})` 
    });
  }

  /**
   * 실패한 제품 상세 정보를 재시도하는 함수
   */
  private async retryFailedProductDetails(
    failedProducts: string[],
    allProducts: Product[],
    matterProducts: MatterProduct[],
    failedProductErrors: Record<string, string[]>
  ): Promise<void> {
    const config = this.config;
    const { productDetailRetryCount } = config;
    const retryStart = config.retryStart ?? 1;
    
    if (productDetailRetryCount <= 0) {
      debugLog(`[RETRY] 재시도 횟수가 0으로 설정되어 제품 상세 정보 재시도를 건너뜁니다.`);
      return;
    }
    
    const validFailedProducts = failedProducts.filter(url => !!url);
    if (validFailedProducts.length !== failedProducts.length) {
      debugLog(`[RETRY] 유효하지 않은 URL ${failedProducts.length - validFailedProducts.length}개를 필터링했습니다.`);
    }

    failedProducts.length = 0;
    failedProducts.push(...validFailedProducts);

    const maxRetry = retryStart + productDetailRetryCount - 1;
    
    updateRetryStatus('detail-retry', {
      stage: 'productDetail',
      currentAttempt: 1,
      maxAttempt: productDetailRetryCount,
      remainingItems: failedProducts.length,
      totalItems: failedProducts.length,
      startTime: Date.now(),
      itemIds: failedProducts
    });
    
    for (let attempt = retryStart; attempt <= maxRetry && failedProducts.length > 0; attempt++) {
      updateRetryStatus('detail-retry', {
        currentAttempt: attempt - retryStart + 1,
        remainingItems: failedProducts.length,
        itemIds: [...failedProducts]
      });
      
      crawlerEvents.emit('crawlingTaskStatus', {
        taskId: 'detail-retry',
        status: 'running',
        message: `제품 상세 정보 재시도 중 (${attempt - retryStart + 1}/${productDetailRetryCount}): ${failedProducts.length}개 항목`
      });
    
      const retryUrls = [...failedProducts];

      failedProducts.length = 0;

      const retryProducts = allProducts.filter(p => p.url && retryUrls.includes(p.url));

      debugLog(`[RETRY][${attempt}] 제품 상세 정보 재시도 중: ${retryProducts.length}개 제품 (${attempt - retryStart + 1}/${productDetailRetryCount})`);

      if (retryProducts.length === 0) {
        debugLog(`[RETRY][${attempt}] 재시도할 제품이 없습니다.`);
        break;
      }

      await promisePool(
        retryProducts,
        async (product, signal) => {
          const result = await this.processProductDetailCrawl(
            product, matterProducts, failedProducts, failedProductErrors, signal, attempt
          );
          
          if (result) {
            if (result.error) {
              logRetryError(
                'productDetail', 
                product.url,
                result.error,
                attempt - retryStart + 1
              );
            } else {
              console.log(`[RETRY][${attempt - retryStart + 1}/${productDetailRetryCount}] 제품 ${product.url} 재시도 성공`);
            }
            
            updateRetryStatus('detail-retry', {
              remainingItems: failedProducts.length,
              itemIds: [...failedProducts]
            });
          }
          
          return result;
        },
        config.retryConcurrency ?? 1,
        this.abortController
      );

      if (failedProducts.length === 0) {
        debugLog(`[RETRY] 모든 제품 상세 정보 재시도 성공`);
        
        crawlerEvents.emit('crawlingTaskStatus', {
          taskId: 'detail-retry',
          status: 'success',
          message: `제품 상세 정보 재시도 완료: 모든 항목 성공`
        });
        
        updateRetryStatus('detail-retry', {
          remainingItems: 0,
          itemIds: [],
          currentAttempt: attempt - retryStart + 1
        });
        
        break;
      }
    }

    const retrySuccessCount = validFailedProducts.length - failedProducts.length;
    if (retrySuccessCount > 0) {
      debugLog(`[RETRY] 재시도를 통해 ${retrySuccessCount}개의 추가 제품 정보를 성공적으로 수집했습니다.`);
    }

    if (failedProducts.length > 0) {
      debugLog(`[RETRY] ${productDetailRetryCount}회 재시도 후에도 실패한 제품 URL 수: ${failedProducts.length}`);
      
      crawlerEvents.emit('crawlingTaskStatus', {
        taskId: 'detail-retry',
        status: 'error',
        message: `제품 상세 정보 재시도 완료: ${failedProducts.length}개 항목 실패`
      });
      
      updateRetryStatus('detail-retry', {
        remainingItems: failedProducts.length,
        itemIds: [...failedProducts]
      });
      
      failedProducts.forEach(url => {
        const errors = failedProductErrors[url] || ['Unknown error'];
        console.error(`[RETRY] 제품 ${url} 재시도 최종 실패: ${errors.join('; ')}`);
      });
    } else {
      crawlerEvents.emit('crawlingTaskStatus', {
        taskId: 'detail-retry',
        status: 'success',
        message: `제품 상세 정보 재시도 완료: 모든 항목 성공`
      });
    }
  }
}