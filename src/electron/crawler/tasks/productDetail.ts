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
  }

  /**
   * 진행 상황 업데이트 함수
   * @param isNew 새로운 항목인지 여부
   */
  private updateProgress(isNew: boolean = true): void {
    this.state.recordDetailItemProcessed(isNew);
  }

  /**
   * 제품 상세 정보를 크롤링하는 함수
   */
  private async crawlProductDetail(product: Product, signal: AbortSignal): Promise<MatterProduct> {
    const config = this.config;
    
    const minDelay = config.minRequestDelayMs ?? 100;
    const maxDelay = config.maxRequestDelayMs ?? 2200;
    const delayTime = getRandomDelay(minDelay, maxDelay);
    await delay(delayTime);
    
    let page: Page | null = null;

    try {
      page = await this.browserManager.getPage();

      if (signal.aborted) {
        throw new Error('Aborted before page operations');
      }
      // 불필요한 리소스 차단 예시
      await page.route('**/*.{png,jpg,jpeg,gif,svg,css,woff,woff2}', route => route.abort());
      await page.goto(product.url, { waitUntil: 'domcontentloaded', timeout: config.productDetailTimeoutMs ?? 60000 });

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
      debugLog(`${config.productDetailTimeoutMs} ms timeout for ${product.model}`);
      if (signal.aborted) {
        throw new Error(`Aborted crawling for ${product.url} during operation.`);
      }
      console.error(`[ProductDetailCollector] Error crawling product detail for ${product.url}:`, error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to crawl product detail for ${product.url}: ${errorMessage}`);
    } finally {
      if (page) {
        await this.browserManager.closePage(page);
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
    const config = this.config;
    
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
          setTimeout(() => reject(new Error('Timeout')), config.productDetailTimeoutMs)
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