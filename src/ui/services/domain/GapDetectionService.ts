/**
 * GapDetectionService.ts
 * Domain Service for Gap Detection Operations
 * 
 * 책임:
 * - 누락된 제품 탐지 및 분석
 * - 갭 수집 작업 관리
 * - 갭 검출 관련 비즈니스 로직 캡슐화
 */

import { BaseService } from '../base/BaseService';
import type { ServiceResult } from '../base/BaseService';
import type { 
  GapDetectionResult, 
  GapCollectionResult, 
  GapCollectionOptions,
  CrawlerConfig 
} from '../../../../types';

/**
 * 갭 검출 서비스 클래스
 * 모든 갭 검출 관련 작업을 추상화하여 제공
 */
export class GapDetectionService extends BaseService {
  private static _instance: GapDetectionService | null = null;

  constructor() {
    super('GapDetectionService');
  }

  /**
   * 싱글톤 인스턴스 반환
   */
  static getInstance(): GapDetectionService {
    if (!GapDetectionService._instance) {
      GapDetectionService._instance = new GapDetectionService();
    }
    return GapDetectionService._instance;
  }

  /**
   * 누락된 제품 탐지
   * @param config 크롤러 설정 (옵션)
   */
  async detectGaps(config?: CrawlerConfig): Promise<ServiceResult<GapDetectionResult>> {
    return this.executeOperation(async () => {
      if (!this.isIPCAvailable()) {
        throw new Error('IPC not available');
      }

      const result = await this.ipcService.detectGaps({ config });
      
      if (!result.success) {
        throw new Error(result.error || 'Gap detection failed');
      }

      if (!result.result) {
        throw new Error('No gap detection result returned');
      }

      return result.result;
    }, 'detectGaps');
  }

  /**
   * 탐지된 갭을 기반으로 누락된 제품 수집
   * @param gapResult 갭 탐지 결과
   * @param options 수집 옵션
   */
  async collectGaps(
    gapResult: GapDetectionResult,
    options?: GapCollectionOptions
  ): Promise<ServiceResult<GapCollectionResult>> {
    return this.executeOperation(async () => {
      if (!this.isIPCAvailable()) {
        throw new Error('IPC not available');
      }

      if (!gapResult) {
        throw new Error('Gap detection result is required');
      }

      const result = await this.ipcService.collectGaps({ 
        gapResult, 
        options 
      });
      
      if (!result.success) {
        throw new Error(result.error || 'Gap collection failed');
      }

      if (!result.result) {
        throw new Error('No gap collection result returned');
      }

      return result.result;
    }, 'collectGaps');
  }

  /**
   * 갭 탐지 및 수집을 연속으로 실행
   * @param config 크롤러 설정 (옵션)
   * @param options 수집 옵션
   */
  async detectAndCollectGaps(
    config?: CrawlerConfig,
    options?: GapCollectionOptions
  ): Promise<ServiceResult<{
    detection: GapDetectionResult;
    collection: GapCollectionResult;
  }>> {
    return this.executeOperation(async () => {
      // 1. 갭 탐지
      const detectionResult = await this.detectGaps(config);
      
      if (!detectionResult.success || !detectionResult.data) {
        throw new Error('Gap detection failed');
      }

      // 2. 탐지된 갭이 없다면 수집 건너뛰기
      if (detectionResult.data.totalMissingProducts === 0) {
        this.log('No gaps detected, skipping collection');
        return {
          detection: detectionResult.data,
          collection: {
            collected: 0,
            failed: 0,
            skipped: 0,
            collectedPages: [],
            failedPages: [],
            errors: []
          }
        };
      }

      // 3. 갭 수집
      const collectionResult = await this.collectGaps(detectionResult.data, options);
      
      if (!collectionResult.success || !collectionResult.data) {
        throw new Error('Gap collection failed');
      }

      return {
        detection: detectionResult.data,
        collection: collectionResult.data
      };
    }, 'detectAndCollectGaps');
  }

  /**
   * 갭 배치 수집 실행 (3-batch 처리 시스템)
   * @param config 크롤러 설정 (옵션)
   */
  async executeGapBatchCollection(
    config?: CrawlerConfig
  ): Promise<ServiceResult<{
    gapResult: GapDetectionResult | null;
    collectionResult: GapCollectionResult | null;
  }>> {
    return this.executeOperation(async () => {
      if (!this.isIPCAvailable()) {
        throw new Error('IPC not available');
      }

      const result = await this.ipcService.executeGapBatchCollection({ config });
      
      if (!result.success) {
        throw new Error(result.error || 'Gap batch collection failed');
      }

      return {
        gapResult: result.gapResult || null,
        collectionResult: result.collectionResult || null
      };
    }, 'executeGapBatchCollection');
  }

  /**
   * 갭 탐지 결과를 요약 정보로 변환
   * @param result 갭 탐지 결과
   */
  getGapSummary(result: GapDetectionResult): {
    totalMissing: number;
    completionRate: number;
    missingPageCount: number;
    completelyMissingPages: number;
    partiallyMissingPages: number;
  } {
    return {
      totalMissing: result.totalMissingProducts,
      completionRate: result.summary.completionPercentage,
      missingPageCount: result.missingPages.length,
      completelyMissingPages: result.completelyMissingPageIds.length,
      partiallyMissingPages: result.partiallyMissingPageIds.length
    };
  }

  /**
   * 갭 수집 결과를 요약 정보로 변환
   * @param result 갭 수집 결과
   */
  getCollectionSummary(result: GapCollectionResult): {
    totalProcessed: number;
    successRate: number;
    collected: number;
    failed: number;
    skipped: number;
  } {
    const totalProcessed = result.collected + result.failed + result.skipped;
    const successRate = totalProcessed > 0 ? (result.collected / totalProcessed) * 100 : 0;

    return {
      totalProcessed,
      successRate,
      collected: result.collected,
      failed: result.failed,
      skipped: result.skipped
    };
  }
}
