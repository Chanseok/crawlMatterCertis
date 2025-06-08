/**
 * MissingProductDetailCollector.ts
 * 누락된 개별 제품 상세 정보 수집 서비스
 */

import { logger } from '../../shared/utils/Logger.js';
import { MissingDataAnalyzer } from './MissingDataAnalyzer.js';
import type { 
  MissingProduct, 
  MissingProductCollectionResult 
} from '../../../types.js';

/**
 * 개별 제품 상세 정보 수집 결과
 */
export interface DetailCollectionProgress {
  total: number;
  processed: number;
  successful: number;
  failed: number;
  errors: { url: string; error: string }[];
}

/**
 * 누락된 개별 제품 상세 정보를 수집하는 서비스 클래스
 */
export class MissingProductDetailCollector {
  private analyzer: MissingDataAnalyzer;

  constructor() {
    this.analyzer = new MissingDataAnalyzer();
  }

  /**
   * 누락된 모든 제품 상세 정보 수집
   */
  async collectAllMissingDetails(): Promise<MissingProductCollectionResult> {
    try {
      logger.info("[MissingProductDetailCollector] Starting missing product detail collection", "MissingProductDetailCollector");

      // 1. 누락된 제품 목록 조회
      const missingProducts = await this.analyzer.findMissingDetails();
      
      if (missingProducts.length === 0) {
        logger.info("[MissingProductDetailCollector] No missing product details found", "MissingProductDetailCollector");
        return {
          collected: 0,
          failed: 0,
          skipped: 0,
          collectedUrls: [],
          failedUrls: [],
          errors: []
        };
      }

      logger.info(
        `[MissingProductDetailCollector] Found ${missingProducts.length} missing product details to collect`,
        "MissingProductDetailCollector"
      );

      // 2. 배치 단위로 제품 상세 정보 수집
      const progress: DetailCollectionProgress = {
        total: missingProducts.length,
        processed: 0,
        successful: 0,
        failed: 0,
        errors: []
      };

      const batchSize = 5; // 동시에 처리할 제품 수
      const batches = this.createBatches(missingProducts, batchSize);

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        logger.info(
          `[MissingProductDetailCollector] Processing batch ${i + 1}/${batches.length} (${batch.length} products)`,
          "MissingProductDetailCollector"
        );

        const batchResults = await this.processBatch(batch);
        
        // 진행 상황 업데이트
        progress.processed += batchResults.processed;
        progress.successful += batchResults.successful;
        progress.failed += batchResults.failed;
        progress.errors.push(...batchResults.errors);

        // 각 배치 간 짧은 대기 (서버 부하 방지)
        if (i < batches.length - 1) {
          await this.delay(2000); // 2초 대기
        }
      }

      const result: MissingProductCollectionResult = {
        collected: progress.successful,
        failed: progress.failed,
        skipped: 0,
        collectedUrls: missingProducts
          .slice(0, progress.successful)
          .map(p => p.url),
        failedUrls: progress.errors.map(e => e.url),
        errors: progress.errors.map(e => e.error)
      };

      logger.info(
        `[MissingProductDetailCollector] Collection completed: ${result.collected}/${missingProducts.length} collected`,
        "MissingProductDetailCollector"
      );

      return result;

    } catch (error) {
      logger.error("[MissingProductDetailCollector] Error during collection", "MissingProductDetailCollector", error as Error);
      return {
        collected: 0,
        failed: 0,
        skipped: 0,
        collectedUrls: [],
        failedUrls: [],
        errors: [(error as Error).message]
      };
    }
  }

  /**
   * 특정 제품들의 상세 정보 수집
   */
  async collectSpecificProducts(urls: string[]): Promise<MissingProductCollectionResult> {
    try {
      logger.info(
        `[MissingProductDetailCollector] Collecting details for ${urls.length} specific products`,
        "MissingProductDetailCollector"
      );

      // URL 목록을 MissingProduct 형태로 변환 (pageId, indexInPage는 임시값)
      const products: MissingProduct[] = urls.map(url => ({
        url,
        pageId: -1, // 특정 제품 수집시 pageId는 중요하지 않음
        indexInPage: -1
      }));

      const progress: DetailCollectionProgress = {
        total: products.length,
        processed: 0,
        successful: 0,
        failed: 0,
        errors: []
      };

      const batchSize = 3; // 특정 제품은 더 작은 배치 크기 사용
      const batches = this.createBatches(products, batchSize);

      for (const batch of batches) {
        const batchResults = await this.processBatch(batch);
        
        progress.processed += batchResults.processed;
        progress.successful += batchResults.successful;
        progress.failed += batchResults.failed;
        progress.errors.push(...batchResults.errors);

        await this.delay(1500); // 1.5초 대기
      }

      const result: MissingProductCollectionResult = {
        collected: progress.successful,
        failed: progress.failed,
        skipped: 0,
        collectedUrls: products
          .slice(0, progress.successful)
          .map(p => p.url),
        failedUrls: progress.errors.map(e => e.url),
        errors: progress.errors.map(e => e.error)
      };

      logger.info(
        `[MissingProductDetailCollector] Specific collection completed: ${result.collected}/${products.length} collected`,
        "MissingProductDetailCollector"
      );

      return result;

    } catch (error) {
      logger.error("[MissingProductDetailCollector] Error during specific collection", "MissingProductDetailCollector", error as Error);
      throw error;
    }
  }

  /**
   * 제품 목록을 배치로 나누기
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * 배치 단위로 제품 상세 정보 수집 처리
   */
  private async processBatch(batch: MissingProduct[]): Promise<DetailCollectionProgress> {
    const progress: DetailCollectionProgress = {
      total: batch.length,
      processed: 0,
      successful: 0,
      failed: 0,
      errors: []
    };

    // 병렬로 제품 상세 정보 수집
    const promises = batch.map(product => this.collectSingleProductDetail(product));
    const results = await Promise.allSettled(promises);

    results.forEach((result, index) => {
      const product = batch[index];
      progress.processed++;

      if (result.status === 'fulfilled' && result.value) {
        progress.successful++;
        logger.debug(
          `[MissingProductDetailCollector] Successfully collected: ${product.url}`,
          "MissingProductDetailCollector"
        );
      } else {
        progress.failed++;
        const error = result.status === 'rejected' ? result.reason.message : 'Unknown error';
        progress.errors.push({
          url: product.url,
          error
        });
        logger.warn(
          `[MissingProductDetailCollector] Failed to collect: ${product.url} - ${error}`,
          "MissingProductDetailCollector"
        );
      }
    });

    return progress;
  }

  /**
   * 단일 제품의 상세 정보 수집
   * NOTE: Currently using simulation - can be extended to use Stage 2 crawler if needed
   */
  private async collectSingleProductDetail(product: MissingProduct): Promise<boolean> {
    try {
      logger.debug(
        `[MissingProductDetailCollector] Collecting detail for: ${product.url}`,
        "MissingProductDetailCollector"
      );

      // SIMULATION: Replace with actual Stage 2 crawler call if detailed collection is needed
      // Currently simulating collection process for development/testing purposes
      await this.delay(Math.random() * 1000 + 500); // 0.5-1.5초 랜덤 대기

      // Simulation: 90% success rate
      const success = Math.random() > 0.1;
      
      if (success) {
        // SIMULATION: Replace with actual database save operation if needed
        return true;
      } else {
        throw new Error('Simulated collection failure');
      }

    } catch (error) {
      logger.error(
        `[MissingProductDetailCollector] Error collecting ${product.url}`,
        "MissingProductDetailCollector",
        error as Error
      );
      throw error;
    }
  }

  /**
   * 지연 함수
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
