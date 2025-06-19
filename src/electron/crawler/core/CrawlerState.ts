/**
 * CrawlerState.ts
 * 크롤링 상태를 관리하는 클래스
 */

import type { 
  Product, 
  MatterProduct, 
  PageProcessingStatusItem, 
  PageProcessingStatusValue,
  CrawlingProgress,
  CrawlingStatus
} from '../../../../types.d.ts';
import { crawlerEvents, emitSafeProgress } from '../utils/progress.js';
import { PageValidator, type PageValidationResult } from '../utils/page-validator.js';
import { logger } from '../../../shared/utils/Logger.js';
import { CrawlingUtils } from '../../../shared/utils/CrawlingUtils.js';
import type { CrawlingStage } from '../../../../types.js';
import { timeEstimationService } from '../services/TimeEstimationService.js';

// Mutable version of CrawlingProgress for internal state management
type MutableCrawlingProgress = {
  -readonly [K in keyof CrawlingProgress]: CrawlingProgress[K]
};

// ProgressData 인터페이스를 CrawlingProgress 타입으로 대체
// 내부 stage 필드를 위한 CrawlingStage 매핑 유틸리티
export function mapCrawlingStageToStatus(stage: CrawlingStage): CrawlingStatus {
  switch (stage) {
    case 'preparation':
      return 'initializing';
    case 'productList:init':
    case 'productList:fetching':
    case 'productList:processing':
    case 'validation:init':
    case 'validation:processing':
    case 'validation:complete':
    case 'productDetail:init':
    case 'productDetail:fetching':
    case 'productDetail:processing':
      return 'running';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'error';
    default:
      return 'running';
  }
}

// 페이지 처리 상태 타입 정의
export interface PageProcessingStatus {
  pageNumber: number;
  status: 'idle' | 'fetching' | 'processing' | 'completed' | 'failed';
  error?: string;
}

export class CrawlerState {
  private products: Product[] = [];
  private matterProducts: MatterProduct[] = [];
  private failedProducts: string[] = [];
  private failedPages: number[] = [];
  private failedPageErrors: Record<number, string[]> = {};
  private failedProductErrors: Record<string, string[]> = {};
  private progressData: MutableCrawlingProgress;
  private detailStageProcessedCount: number = 0;
  private detailStageNewCount: number = 0;
  private detailStageUpdatedCount: number = 0;
  private detailStageTotalProductCount: number = 0; // Added for Stage 3 total (Detail stage)
  private processedProductUrls: Set<string> = new Set(); // 중복 처리 방지
  
  // 페이지당 기대되는 제품 수
  private _expectedProductsPerPage: number = 12;
  
  // 페이지 번호별 수집된 제품 정보를 저장하는 맵
  private pageProductsCache: Map<number, Product[]> = new Map();
  
  // 페이지 처리 상태를 저장하는 배열
  private pageProcessingStatuses: Map<number, PageProcessingStatusItem> = new Map();

  /**
   * 페이지 처리 상태 가져오기
   */
  public getPageProductsCache(pageNumber: number): Product[] {
    return this.pageProductsCache.get(pageNumber) || [];
  }

  /**
   * 페이지 처리 상태 가져오기
   */
  public getPageProcessingStatus(pageNumber: number): PageProcessingStatusItem | undefined {
    return this.pageProcessingStatuses.get(pageNumber);
  }

  /**
   * 모든 페이지 처리 상태 가져오기
   */
  public getAllPageProcessingStatuses(): PageProcessingStatusItem[] {
    return Array.from(this.pageProcessingStatuses.values());
  }

  /**
   * 페이지 처리 상태 업데이트
   */
  public updatePageProcessingStatus(
    pageNumber: number, 
    status: PageProcessingStatusValue, 
    attempt: number = 1
  ): void {
    this.pageProcessingStatuses.set(pageNumber, {
      pageNumber,
      status,
      attempt
    });
  }

  /**
   * 페이지가 완전히 수집되었는지 확인
   */
  public isPageCompletelyCollected(pageNumber: number): boolean {
    const status = this.pageProcessingStatuses.get(pageNumber);
    return status?.status === 'success';
  }

  /**
   * 페이지 상태를 초기화 (재시도를 위해)
   * 캐시된 제품 정보는 유지하면서 상태만 재설정
   */
  public resetPageStatus(pageNumber: number): void {
    if (this.pageProcessingStatuses.has(pageNumber)) {
      const currentStatus = this.pageProcessingStatuses.get(pageNumber)!;
      this.pageProcessingStatuses.set(pageNumber, {
        ...currentStatus,
        status: 'waiting',
        attempt: (currentStatus.attempt || 0) + 1
      });
    } else {
      this.pageProcessingStatuses.set(pageNumber, {
        pageNumber,
        status: 'waiting',
        attempt: 1
      });
    }
  }

  /**
   * 페이지별 제품 캐시를 업데이트합니다.
   * 기존에 캐시된 제품과 새로 수집한 제품을 병합합니다.
   */
  public updatePageProductsCache(pageNumber: number, newProducts: Product[]): Product[] {
    // 기존 캐시된 제품 가져오기
    const existingProducts = this.getPageProductsCache(pageNumber);
    
    // URL 기준으로 중복 제거하며 병합
    const mergedProducts = this.mergeProductsWithoutDuplicates(existingProducts, newProducts);
    
    // 업데이트된 캐시 저장
    this.pageProductsCache.set(pageNumber, mergedProducts);
    logger.debug(`페이지 ${pageNumber}의 제품 캐시 업데이트: 기존 ${existingProducts.length}개 + 신규 ${newProducts.length}개 = 병합 후 ${mergedProducts.length}개`, 'CrawlerState');
    
    return mergedProducts;
  }

  /**
   * 두 제품 배열을 URL 기준으로 중복 없이 병합합니다.
   */
  private mergeProductsWithoutDuplicates(existing: Product[], newItems: Product[]): Product[] {
    // URL을 키로 사용하여 맵 생성
    const productMap = new Map<string, Product>();
    
    // 기존 제품 추가
    existing.forEach(product => {
      if (product.url) {
        productMap.set(product.url, product);
      }
    });
    
    // 새 제품 추가 또는 업데이트 (기존 정보와 병합)
    newItems.forEach(product => {
      if (!product.url) return;
      
      const existingProduct = productMap.get(product.url);
      if (existingProduct) {
        // 기존 제품과 새 제품 정보 병합
        productMap.set(product.url, {
          ...existingProduct,
          ...product,
          // 항목별 병합 로직이 필요하면 여기서 구현
        });
      } else {
        // 새 제품 추가
        productMap.set(product.url, product);
      }
    });
    
    // 맵에서 배열로 변환하여 반환
    return Array.from(productMap.values());
  }

  // 내부적으로 사용할 현재 크롤링 단계
  private currentStage: CrawlingStage = 'preparation';
  
  constructor() {
    // CrawlingProgress 형태로 초기화
    this.progressData = {
      current: 0,
      total: 0,
      percentage: 0,
      status: 'initializing',
      currentStep: '크롤링 준비 중...',
      currentStage: 1, // ✅ currentStage 필드 추가 - 기본값 1단계
      currentPage: 0,
      totalPages: 0,
      processedItems: 0,
      totalItems: 0,
      newItems: 0,
      updatedItems: 0,
      elapsedTime: 0,
      startTime: Date.now(),
      message: '크롤링 준비 중...'
    };
  }

  /**
   * 현재 진행 상태를 반환
   */
  public getProgressData(): CrawlingProgress {
    return { ...this.progressData };
  }

  /**
   * 진행 상태의 단계를 설정
   */
  public setStage(stage: CrawlingStage, message?: string): void {
    // 내부 단계 상태 저장
    this.currentStage = stage;
    
    // CrawlingProgress 필드 업데이트
    this.progressData.status = mapCrawlingStageToStatus(stage);
    this.progressData.message = message ? message : this.progressData.message;
    
    // 이벤트 발행
    crawlerEvents.emit('crawlingStageChanged', stage, message);
    
    // 기존 progress 이벤트도 발행하여 일관성 유지 (안전한 방식 사용)
    emitSafeProgress(this.progressData);
    
    logger.info(`Stage changed to: ${stage} - ${message}`, 'CrawlerState');
  }

  /**
   * 현재 단계를 반환
   */
  public getStage(): CrawlingStage {
    return this.currentStage;
  }

  /**
   * 진행 상태 업데이트
   */
  public async updateProgress(data: Partial<CrawlingProgress>): Promise<void> {
    // 현재 상태 업데이트
    this.progressData = {
      ...this.progressData,
      ...data
    };

    // 경과 시간 계산 - 더 정확하고 안정적으로
    if (this.progressData.startTime) {
      const currentTime = Date.now();
      this.progressData.elapsedTime = currentTime - this.progressData.startTime;
      
      // Clean Architecture: 새로운 시간 예측 시스템 사용
      try {
        console.log('🔍 [CrawlerState] updateAdaptiveTimeEstimation 호출:', {
          stage: data.currentStage?.toString() || 'unknown',
          percentage: this.progressData.percentage || 0,
          totalItems: this.progressData.totalItems || this.progressData.totalPages || 100,
          completedItems: this.progressData.processedItems || this.progressData.currentPage || 0
        });

        await this.updateAdaptiveTimeEstimation(
          data.currentStage?.toString() || 'unknown',
          this.progressData.percentage || 0,
          0, // 재시도 횟수는 별도 관리
          this.progressData.totalItems || this.progressData.totalPages || 100,
          this.progressData.processedItems || this.progressData.currentPage || 0
        );

        console.log('✅ [CrawlerState] updateAdaptiveTimeEstimation 성공:', {
          remainingTimeMs: this.progressData.remainingTime,
          remainingTimeSeconds: this.progressData.remainingTimeSeconds,
          confidence: this.progressData.confidence
        });
      } catch (error) {
        console.error('❌ [CrawlerState] 시간 예측 업데이트 실패, 기본 계산 사용:', error);
        // 백업으로 기존 로직 사용
        if (this.progressData.percentage > 5 && this.progressData.elapsedTime > 60000) {
          const estimatedTotal = this.progressData.elapsedTime / (this.progressData.percentage / 100);
          this.progressData.remainingTime = Math.max(0, estimatedTotal - this.progressData.elapsedTime);
        }
      }

      // 완료 상태 확인 - 강화된 조건
      const isCompleted = this.progressData.status === 'completed' || 
                         this.progressData.percentage >= 100 ||
                         data.stage === 'complete' ||
                         data.status === 'completed' ||
                         (this.progressData.total > 0 && this.progressData.current >= this.progressData.total);
      
      if (isCompleted) {
        // 완료된 경우 남은 시간을 0으로 설정
        this.progressData.remainingTime = 0;
        this.progressData.percentage = 100;
        logger.debug('Setting remaining time to 0 due to completion', 'CrawlerState');
      } else {
        this.progressData.percentage = CrawlingUtils.safePercentage(this.progressData.current, this.progressData.total);
      }
    }

    // 명시적 디버그 로깅 추가
    logger.debug(`Progress updated: ${this.progressData.current}/${this.progressData.total} (${CrawlingUtils.safePercentage(this.progressData.current || 0, this.progressData.total || 1).toFixed(1)}%)`, 'CrawlerState');

    // 헬퍼 메서드를 사용하여 이벤트 발행 (일관성 유지)
    this.emitProgressUpdate();
  }

  /**
   * 병렬 작업 상태 업데이트
   * CrawlingProgress에는 직접적인 병렬 작업 필드가 없어서 해당 정보는 메시지에 포함시킴
   */
  public updateParallelTasks(active: number, total: number): void {
    // 메시지에 병렬 작업 상태 정보 포함
    if (this.progressData.message) {
      this.progressData.message = `${this.progressData.message} (동시작업: ${active}/${total})`;
    }
    this.emitProgressUpdate();
  }

  /**
   * 치명적인 오류를 보고하고 크롤링 상태를 실패로 변경
   * 
   * 이 메서드는 크롤링을 계속할 수 없는 심각한 오류가 발생했을 때 호출됩니다.
   * 예를 들어 네트워크 연결 끊김, 인증 실패, 사이트 구조 변경 등의 상황에서 사용됩니다.
   * 오류는 로그에 기록되고 UI에 표시될 수 있도록 상태가 업데이트됩니다.
   * 
   * @param {string} error - 오류 메시지 (사용자에게 표시될 수 있음)
   * @returns {void}
   */
  public reportCriticalFailure(error: string): void {
    try {
      // 내부 상태 업데이트
      this.currentStage = 'failed';
      
      // CrawlingProgress 타입으로 변환하여 업데이트
      this.progressData.status = 'error';
      this.progressData.criticalError = error;
      this.progressData.message = `크롤링 중단: ${error}`;
      
      // 상세 로그 기록
      logger.error(`치명적 오류 발생: ${error}`, 'CrawlerState');
      logger.error(`현재 상태: 단계=${this.currentStage}, 처리된 항목=${this.progressData.current}/${this.progressData.total}`, 'CrawlerState');
      
      // 상태 업데이트 이벤트 발생
      this.emitProgressUpdate();
    } catch (err) {
      // 메타 오류 처리 (오류 보고 중 발생한 오류)
      logger.error(`오류 보고 중 예외 발생: ${err instanceof Error ? err.message : String(err)}`, 'CrawlerState');
    }
  }

  /**
   * 실패한 페이지를 추가하고 오류 정보를 기록
   * 
   * 페이지 처리 실패 시 호출되어 실패한 페이지 목록과 오류 정보를 업데이트합니다.
   * 오류 유형에 따라 재시도 전략을 결정하는 데 필요한 정보를 수집합니다.
   * 
   * @param {number} pageNumber - 실패한 페이지 번호
   * @param {string} error - 오류 메시지
   * @returns {void}
   */
  public addFailedPage(pageNumber: number, error: string): void {
    if (!this.failedPages.includes(pageNumber)) {
      this.failedPages.push(pageNumber);
    }
    
    if (!this.failedPageErrors[pageNumber]) {
      this.failedPageErrors[pageNumber] = [];
    }
    this.failedPageErrors[pageNumber].push(error);
    
    // 오류 메시지 분석
    const errorAnalysis = this.analyzeError(error);
    
    // 페이지 처리 상태 업데이트
    this.updatePageProcessingStatus(pageNumber, 'failed');
    
    // 치명적 오류인 경우 추가 처리
    if (errorAnalysis.isCritical) {
      logger.warn(`페이지 ${pageNumber}에서 치명적 오류 발생: ${errorAnalysis.message}`, 'CrawlerState');
      this.progressData.message = `페이지 ${pageNumber}: ${errorAnalysis.message}`;
      this.emitProgressUpdate();
    } 
    
    logger.debug(`페이지 ${pageNumber} 실패 기록: ${error.substring(0, 100)}${error.length > 100 ? '...' : ''}`, 'CrawlerState');
  }

  /**
   * 실패한 제품을 추가하고 오류 정보를 기록
   * 
   * 제품 상세 정보 처리 실패 시 호출되어 실패한 제품 목록과 오류 정보를 업데이트합니다.
   * 오류 정보는 로그와 UI에 표시되며, 추후 재시도 전략을 결정하는 데 사용됩니다.
   * 
   * @param {string} url - 실패한 제품의 URL (식별자로 사용)
   * @param {string} error - 오류 메시지
   * @returns {void}
   */
  public addFailedProduct(url: string, error: string): void {
    if (!this.failedProducts.includes(url)) {
      this.failedProducts.push(url);
    }
    
    if (!this.failedProductErrors[url]) {
      this.failedProductErrors[url] = [];
    }
    this.failedProductErrors[url].push(error);
    
    // 오류 메시지 분석
    const errorAnalysis = this.analyzeError(error);
    
    // 실패 정보 업데이트 및 UI에 표시
    const failedCount = this.failedProducts.length;
    const totalCount = this.progressData.totalItems || 0;
    const failureRate = totalCount > 0 ? (failedCount / totalCount * 100).toFixed(1) : '0.0';
    
    // 짧은 URL 표시를 위한 처리
    const shortUrl = url.length > 30 ? `${url.substring(0, 27)}...` : url;
    
    // 치명적 오류인 경우 추가 처리
    if (errorAnalysis.isCritical) {
      logger.warn(`제품 ${shortUrl}에서 치명적 오류 발생: ${errorAnalysis.message}`, 'CrawlerState');
      this.progressData.message = `처리 중 오류: ${errorAnalysis.message} (실패: ${failedCount}건, ${failureRate}%)`;
    } else {
      this.progressData.message = `제품 상세정보 수집 중... (실패: ${failedCount}건, ${failureRate}%)`;
    }
    
    logger.debug(`제품 실패 기록 [${failedCount}/${totalCount}]: ${shortUrl} - ${error.substring(0, 100)}${error.length > 100 ? '...' : ''}`, 'CrawlerState');
    this.emitProgressUpdate();
  }

  /**
   * 제품 추가
   */
  public addProducts(products: Product[]): void {
    this.products.push(...products);
  }

  /**
   * Matter 제품 추가
   */
  public addMatterProduct(product: MatterProduct): void {
    this.matterProducts.push(product);
  }

  /**
   * 모든 제품 가져오기
   */
  public getProducts(): Product[] {
    return [...this.products];
  }

  /**
   * 모든 Matter 제품 가져오기
   */
  public getMatterProducts(): MatterProduct[] {
    return [...this.matterProducts];
  }
  
  /**
   * 실패한 페이지 목록 가져오기
   */
  public getFailedPages(): number[] {
    return [...this.failedPages];
  }
  
  /**
   * 실패한 페이지 목록 초기화
   * 배치 재시도 등에 사용
   */
  public resetFailedPages(): void {
    this.failedPages = [];
    this.failedPageErrors = {};
    logger.info('Failed pages have been reset for retry.', 'CrawlerState');
  }
  
  /**
   * 실패한 제품 URL 목록 가져오기
   */
  public getFailedProducts(): string[] {
    return [...this.failedProducts];
  }
  
  /**
   * 실패한 페이지 오류 정보 가져오기
   */
  public getFailedPageErrors(): Record<number, string[]> {
    return { ...this.failedPageErrors };
  }
  
  /**
   * 실패한 제품 오류 정보 가져오기
   */
  public getFailedProductErrors(): Record<string, string[]> {
    return { ...this.failedProductErrors };
  }

  /**
   * 전체 페이지/제품 개수 확인
   */
  public getTotalItems(): number {
    return this.products.length;
  }
  
  /**
   * 전체 페이지 수 가져오기
   */
  public getTotalPagesCount(): number {
    return this.progressData.totalPages || 0;
  }
  
  /**
   * 치명적 오류가 있는지 확인 (실패율 기반)
   */
  /**
   * 현재 상태가 치명적 오류 상태인지 실패율을 기반으로 판단
   * 
   * 다음과 같은 조건을 모두 검사합니다:
   * 1. 실패한 페이지 수가 전체의 30% 이상인지 확인
   * 2. 실패한 제품 수가 전체의 30% 이상인지 확인
   * 
   * @returns {boolean} true: 치명적 오류 상태, false: 정상 또는 허용 가능한 오류 상태
   */
  public hasCriticalFailures(): boolean {
    const totalItems = this.getTotalItems();
    const CRITICAL_FAILURE_THRESHOLD = 0.3; // 30% 이상 실패 시 치명적 오류로 간주
    
    // 실패율이 30% 이상이면 치명적 오류로 간주
    if (this.failedPages.length > 0) {
      return this.failedPages.length / totalItems > CRITICAL_FAILURE_THRESHOLD;
    } else if (this.failedProducts.length > 0 && totalItems > 0) {
      return this.failedProducts.length / totalItems > CRITICAL_FAILURE_THRESHOLD;
    }
    
    return false;
  }
  
  /**
   * 진행 상태 업데이트를 이벤트로 발행
   */
  private emitProgressUpdate(): void {
    // The actual update to this.progressData happens in updateProgress or setStage
    console.log(`[CrawlerState] Emitting 'crawlingProgress'. currentStage: ${this.progressData.currentStage}, currentStep: "${this.progressData.currentStep}", status: ${this.progressData.status}, total: ${this.progressData.total}, completed: ${this.progressData.current}, message: ${this.progressData.message}`);
    emitSafeProgress(this.progressData); // Send validated and normalized progress
  }

  /**
   * 상태 초기화
   */
  public reset(): void {
    this.products = [];
    this.matterProducts = [];
    this.failedProducts = [];
    this.failedPages = [];
    this.failedPageErrors = {};
    this.failedProductErrors = {};
    
    // 내부 상태 초기화
    this.currentStage = 'preparation';
    
    // CrawlingProgress 형식으로 초기화
    this.progressData = {
      current: 0,
      total: 0,
      percentage: 0,
      currentStep: '크롤링 준비 중...',
      currentStage: 1, // ✅ currentStage 필드 추가 - 기본값 1단계
      currentPage: 0,
      totalPages: 0,
      processedItems: 0,
      totalItems: 0,
      newItems: 0,
      updatedItems: 0,
      elapsedTime: 0,
      startTime: Date.now(),
      status: 'initializing',
      message: '크롤링 준비 중...'
    };
    
    this.detailStageProcessedCount = 0;
    this.detailStageNewCount = 0;
    this.detailStageUpdatedCount = 0;
    this.detailStageTotalProductCount = 0; // Reset for Stage 3 total (Detail stage)
    this.processedProductUrls.clear(); // Reset duplicate tracking
    
    // 스마트 병합을 위한 상태 초기화
    this.pageProductsCache.clear();
    this.pageProcessingStatuses.clear();
  }

  /**
   * 상세 정보 수집 단계의 총 제품 수를 설정합니다.
   * 이 값은 1단계에서 수집된 총 제품 수로 설정되어야 합니다.
   * @param count 총 제품 수
   */
  public async setDetailStageProductCount(count: number): Promise<void> {
    if (count < 0) {
      logger.warn(`Invalid negative count ${count} passed to setDetailStageProductCount, ignoring.`, 'CrawlerState');
      return;
    }
    
    this.detailStageTotalProductCount = count;
    logger.debug(`Detail stage total product count set to: ${count}`, 'CrawlerState');
    
    // Stage 3에 있는 경우, UI를 위해 progressData.totalItems 및 total도 업데이트
    if ((typeof this.currentStage === 'string' && this.currentStage.startsWith('productDetail')) || this.currentStage === 'completed') {
      await this.updateProgress({ 
        total: count,
        totalItems: count 
      });
      console.log(`[CrawlerState] Updated progressData.total and totalItems to ${count} for UI display`);
    }
  }

  /**
   * 상세 정보 수집 단계의 총 제품 수를 가져옵니다.
   */
  public getDetailStageTotalProductCount(): number {
    return this.detailStageTotalProductCount;
  }

  /**
   * 상세 정보 수집 단계에서 처리된 항목 기록
   * 이 메서드는 processProductDetailCrawl에서 한 번만 호출되어야 함
   * 
   * 2025-05-24 수정: 카운터 오버플로우 감지 및 비상 조치 개선
   * - 오버플로우 감지 조건 강화: 전체 제품 수를 기반으로 오버플로우 감지
   * - 현재 UI 상태도 함께 업데이트하여 실시간 정확성 보장
   * - 중복 처리 방지 메커니즘 추가
   */
  public async recordDetailItemProcessed(isNewItem: boolean, productUrl?: string): Promise<void> {
    // 중복 처리 방지를 위한 검증
    if (productUrl && this.processedProductUrls.has(productUrl)) {
      console.warn(`[CrawlerState] Duplicate processing detected for: ${productUrl.substring(0, 50)}...`);
      return;
    }

    // 기대된 최대 제품 수를 초과하는지 확인
    const expectedMaxProducts = this.detailStageTotalProductCount > 0 ? 
                               this.detailStageTotalProductCount :
                               this.progressData.totalItems || 60; // 기본값 60
    
    // 오버플로우 감지 조건 개선: 기대된 제품 수를 크게 초과할 경우
    const overflowThreshold = Math.max(expectedMaxProducts * 1.1, expectedMaxProducts + 5);
    
    if (this.detailStageProcessedCount >= overflowThreshold) {
      console.warn(`[CrawlerState] WARNING: Counter overflow detected! Current value: ${this.detailStageProcessedCount} exceeds safe threshold: ${overflowThreshold}`);
      console.warn(`[CrawlerState] Expected total products: ${expectedMaxProducts}, Actual processed: ${this.detailStageProcessedCount}`);
      console.warn(`[CrawlerState] This may indicate that state.reset() was not properly called between sessions.`);
      
      // 호출 스택 기록하여 디버깅에 도움
      const fullStack = new Error().stack || 'Stack not available';
      console.warn(`[CrawlerState] Full stack: ${fullStack}`);
      
      // 비상 초기화 (문제 해결을 위한 조치)
      this.detailStageProcessedCount = 0;
      this.detailStageNewCount = 0;
      this.detailStageUpdatedCount = 0;
      this.processedProductUrls.clear();
      console.warn(`[CrawlerState] Emergency reset performed for detail stage counters.`);
    }
    
    this.detailStageProcessedCount++;
    if (isNewItem) {
      this.detailStageNewCount++;
    } else {
      this.detailStageUpdatedCount++;
    }

    // 처리된 제품 URL 기록 (중복 방지)
    if (productUrl) {
      this.processedProductUrls.add(productUrl);
    }
    
    // UI 상태도 업데이트: 카운트와 UI가 일치하도록 보장
    const totalItems = this.detailStageTotalProductCount || this.progressData.totalItems || 0;
    const percentage = totalItems > 0 ? (this.detailStageProcessedCount / totalItems * 100) : 0;
    const safePercentage = Math.min(Math.max(percentage, 0), 100);
    
    // ✅ Ensure stage remains as productDetail during Stage 3 processing
    if (this.currentStage !== 'productDetail:processing') {
      this.setStage('productDetail:processing', '3단계: 제품 상세 정보 수집 중');
    }
    
    // 정확한 상태 업데이트를 위한 전체 필드 설정
    await this.updateProgress({
      current: this.detailStageProcessedCount,
      total: totalItems,
      processedItems: this.detailStageProcessedCount,
      totalItems: totalItems,
      newItems: this.detailStageNewCount,
      updatedItems: this.detailStageUpdatedCount,
      percentage: safePercentage,
      currentStage: 3,  // ✅ 3단계 명시적 설정 (Stage 3: Detail)
      currentStep: '3단계: 제품 상세 정보 수집',  // ✅ 현재 단계 명시적 설정  
      status: 'running',
      message: `3단계: 제품 상세정보 ${this.detailStageProcessedCount}/${totalItems} 처리 중 (${safePercentage.toFixed(1)}%)`
    });
    
    // 향상된 디버그 로깅 (호출 스택 추적 포함)
    const stack = new Error().stack?.split('\n').slice(2, 5).join('\n') || 'Stack not available';
    console.log(`[CrawlerState] Detail item processed: total=${this.detailStageProcessedCount}/${totalItems}, new=${this.detailStageNewCount}, updated=${this.detailStageUpdatedCount}, isNew=${isNewItem}, url=${productUrl?.substring(0, 50)}...`);
    console.log(`[CrawlerState] Called from: ${stack}`);
  }

  /**
   * 상세 정보 수집 단계에서 처리된 항목 수 가져오기
   */
  public getDetailStageProcessedCount(): number {
    return this.detailStageProcessedCount;
  }

  /**
   * 상세 정보 수집 단계에서 새로 추가된 항목 수 가져오기
   */
  public getDetailStageNewCount(): number {
    return this.detailStageNewCount;
  }

  /**
   * 상세 정보 수집 단계에서 업데이트된 항목 수 가져오기
   */
  public getDetailStageUpdatedCount(): number {
    return this.detailStageUpdatedCount;
  }

  /**
   * 페이지가 완전히 수집되었는지 확인 (강화된 검증)
   * @param pageNumber 검증할 페이지 번호
   * @param isLastPage 마지막 페이지 여부
   * @param lastPageExpectedCount 마지막 페이지의 기대 제품 수 (알려진 경우)
   * @returns 검증 결과
   */
  public validatePageCompleteness(
    pageNumber: number, 
    isLastPage: boolean = false,
    lastPageExpectedCount?: number
  ): PageValidationResult {
    const products = this.getPageProductsCache(pageNumber);
    
    // PageValidator를 사용하여 완전성 검증
    return PageValidator.validatePage(
      pageNumber,
      products,
      isLastPage,
      this._expectedProductsPerPage, // 설정에서 가져온 기대 제품 수
      lastPageExpectedCount
    );
  }

  /**
   * 마지막으로 설정된 페이지당 기대 제품 수를 조회
   * 
   * 이 값은 페이지 수집 완료 여부를 판단하는 데 사용됩니다.
   * 예상되는 제품 수보다 적은 수가 수집되면 페이지가 불완전하게 수집됐을 가능성이 있습니다.
   * 
   * @returns {number} 페이지당 기대되는 제품 수 (기본값: 12)
   */
  public get expectedProductsPerPage(): number {
    return this._expectedProductsPerPage || 12; // 기본값 12
  }

  /**
   * 페이지당 기대 제품 수를 설정
   * 
   * 이 값은 페이지 검증과 진행률 계산에 사용됩니다.
   * 사이트 분석 결과나 사용자 설정에 따라 업데이트될 수 있습니다.
   * 
   * @param {number} count - 페이지당 기대 제품 수 (양수여야 함)
   * @throws {Error} 0 이하의 값이 입력되면 무시됨
   * @returns {void}
   */
  public setExpectedProductsPerPage(count: number): void {
    if (count > 0) {
      this._expectedProductsPerPage = count;
    } else {
      console.warn(`[CrawlerState] 유효하지 않은 페이지당 제품 수: ${count}. 무시됩니다.`);
    }
  }

  /**
   * 치명적 오류 상태를 정리하고 크롤링을 계속 진행할 수 있도록 함
   * 
   * 이 메서드는 일시적인 오류 후 성공적인 수집이 이루어졌거나,
   * 사용자의 명시적 요청으로 오류 상태를 초기화할 때 호출됩니다.
   * 
   * 다음과 같은 동작을 수행합니다:
   * 1. progressData에서 criticalError 필드 제거
   * 2. 상태를 현재 단계에 맞게 업데이트
   * 3. 현재 단계가 'failed'인 경우 'preparation'으로 초기화
   * 4. 진행 상태 업데이트 이벤트 발생
   * 
   * @returns {void}
   */
  public clearCriticalFailures(): void {
    // 치명적 오류 플래그 리셋
    if (this.progressData.status === 'error') {
      // 오류 상태 초기화
      delete this.progressData.criticalError;
      
      // 현재 단계에 맞는 상태로 업데이트
      this.progressData.status = mapCrawlingStageToStatus(this.currentStage);
      
      // 현재 단계가 실패 상태인 경우 준비 상태로 복원
      if (this.currentStage === 'failed') {
        this.currentStage = 'preparation';
        this.progressData.status = 'initializing';
        this.progressData.message = '크롤링 준비 중...';
      }
      
      console.log('[CrawlerState] Critical failures have been cleared');
      this.emitProgressUpdate();
    }
  }

  /**
   * 현재 상태가 실제로 치명적인지 제품 수집 결과를 고려하여 판단
   * 
   * 일부 제품이 성공적으로 수집되었다면, 오류가 발생했더라도
   * 치명적인 실패로 간주하지 않고 부분 성공으로 처리합니다.
   * 
   * @param {number} collectedProductCount - 실제로 수집된 제품 수
   * @returns {boolean} true: 치명적 실패 상태, false: 부분 성공 또는 성공 상태
   */
  public isTrulyFailed(collectedProductCount: number): boolean {
    const hasCritical = this.hasCriticalFailures();
    const hasProducts = collectedProductCount > 0;
    
    // 제품이 수집되었다면 치명적이지 않음
    // (부분 성공으로 간주하고 계속 진행)
    return hasCritical && !hasProducts;
  }
  
  /**
   * 현재까지 발생한 오류들의 요약 정보를 반환
   * 
   * 이 메서드는 현재까지 발생한 모든 오류를 분석하여 요약 정보를 제공합니다.
   * 주로 UI에 표시하거나 로깅, 보고서 생성에 활용할 수 있습니다.
   * 
   * @returns {Object} 오류 요약 정보
   * @property {number} totalErrors - 전체 오류 수
   * @property {number} pageErrors - 페이지 처리 시 발생한 오류 수
   * @property {number} productErrors - 제품 처리 시 발생한 오류 수
   * @property {number} criticalErrors - 치명적 오류 수
   * @property {number} retryableErrors - 재시도 가능한 오류 수
   * @property {Object} errorTypes - 오류 유형별 발생 횟수
   * @property {Object} mostFrequentErrors - 가장 자주 발생한 오류 메시지와 횟수
   */
  public getErrorSummary(): {
    totalErrors: number;
    pageErrors: number;
    productErrors: number;
    criticalErrors: number;
    retryableErrors: number;
    errorTypes: Record<string, number>;
    mostFrequentErrors: Array<{message: string, count: number}>;
  } {
    // 모든 오류 메시지 수집
    const allPageErrors: string[] = [];
    for (const pageErrors of Object.values(this.failedPageErrors)) {
      allPageErrors.push(...pageErrors);
    }
    
    const allProductErrors: string[] = [];
    for (const productErrors of Object.values(this.failedProductErrors)) {
      allProductErrors.push(...productErrors);
    }
    
    // 오류 분석
    const allErrors = [...allPageErrors, ...allProductErrors];
    const errorTypes: Record<string, number> = {};
    let criticalCount = 0;
    let retryableCount = 0;
    
    // 오류 유형 분석
    allErrors.forEach(err => {
      const analysis = this.analyzeError(err);
      errorTypes[analysis.errorType] = (errorTypes[analysis.errorType] || 0) + 1;
      
      if (analysis.isCritical) criticalCount++;
      if (analysis.isRetryable) retryableCount++;
    });
    
    // 가장 자주 발생하는 오류 찾기
    const errorFrequency: Record<string, number> = {};
    allErrors.forEach(err => {
      // 오류 메시지 정규화 (비슷한 오류를 그룹화)
      const normalizedError = err
        .replace(/\d+/g, 'N') // 숫자를 N으로 대체
        .replace(/https?:\/\/[^\s)]+/g, 'URL') // URL 정규화
        .substring(0, 100); // 길이 제한
      
      errorFrequency[normalizedError] = (errorFrequency[normalizedError] || 0) + 1;
    });
    
    // 빈도순 정렬
    const mostFrequent = Object.entries(errorFrequency)
      .map(([message, count]) => ({ message, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5); // 상위 5개만
    
    return {
      totalErrors: allErrors.length,
      pageErrors: allPageErrors.length,
      productErrors: allProductErrors.length,
      criticalErrors: criticalCount,
      retryableErrors: retryableCount,
      errorTypes,
      mostFrequentErrors: mostFrequent
    };
  }
  
  /**
   * 주어진 오류가 치명적인지 아닌지 판단
   * 
   * 네트워크 오류, 일시적 오류, 재시도 가능한 오류 등을 구분하여
   * 크롤러가 적절한 대응 전략을 선택할 수 있도록 돕습니다.
   * 
   * @param {Error|string} error - 분석할 오류 객체 또는 메시지
   * @returns {Object} 오류 분석 결과
   * @property {boolean} isCritical - 치명적 오류 여부
   * @property {boolean} isRetryable - 재시도 가능한 오류 여부
   * @property {string} errorType - 오류 유형 분류
   * @property {string} message - 사용자 친화적인 오류 메시지
   */
  public analyzeError(error: Error | string): { 
    isCritical: boolean; 
    isRetryable: boolean; 
    errorType: string; 
    message: string; 
  } {
    const errorMessage = error instanceof Error ? error.message : error;
    
    
    // 기본 결과
    const result = {
      isCritical: false,
      isRetryable: true,
      errorType: 'unknown',
      message: errorMessage,
    };
    
    // 네트워크 관련 오류 확인
    if (
      errorMessage.includes('ECONNRESET') ||
      errorMessage.includes('ETIMEDOUT') ||
      errorMessage.includes('ECONNREFUSED') ||
      errorMessage.includes('network error') ||
      errorMessage.includes('Network Error') ||
      errorMessage.includes('timeout')
    ) {
      result.errorType = 'network';
      result.isRetryable = true;
      result.isCritical = false;
      result.message = '네트워크 연결 오류: 재시도 중...';
    }
    // 서버 오류 확인
    else if (
      errorMessage.includes('500') ||
      errorMessage.includes('503') ||
      errorMessage.includes('server error') ||
      errorMessage.includes('Server Error')
    ) {
      result.errorType = 'server';
      result.isRetryable = true;
      result.isCritical = false;
      result.message = '서버 일시적 오류: 재시도 중...';
    }
    // 접근 권한 오류
    else if (
      errorMessage.includes('403') ||
      errorMessage.includes('Authentication') ||
      errorMessage.includes('권한') ||
      errorMessage.includes('접근이 거부') ||
      errorMessage.includes('blocked')
    ) {
      result.errorType = 'access';
      result.isRetryable = false;
      result.isCritical = true;
      result.message = '접근 권한 오류: 크롤링이 차단되었습니다.';
    }
    // 구문 분석 오류
    else if (
      errorMessage.includes('parse') ||
      errorMessage.includes('JSON') ||
      errorMessage.includes('syntax') ||
      errorMessage.includes('expected')
    ) {
      result.errorType = 'parsing';
      result.isRetryable = false;
      result.isCritical = true;
      result.message = '데이터 구문 분석 오류: 사이트 구조가 변경되었을 수 있습니다.';
    }
    
    console.log(`[CrawlerState] 오류 분석 결과: 타입=${result.errorType}, 치명적=${result.isCritical}, 재시도가능=${result.isRetryable}`);
    return result;
  }

  /**
   * 상세 정보 수집 단계 초기화
   * 중복 방지 셋도 함께 초기화
   */
  public initializeDetailStage(): void {
    this.detailStageProcessedCount = 0;
    this.detailStageNewCount = 0;
    this.detailStageUpdatedCount = 0;
    this.processedProductUrls.clear();
    console.log('[CrawlerState] Detail stage initialized with clean state');
  }

  /**
   * 최종 DB 저장 결과를 반영하여 카운터 업데이트
   * 크롤링 중에는 새로운 항목으로 간주되었지만, 실제 DB 저장 시에는 
   * 이미 존재하는 항목으로 판명된 경우를 처리하기 위함
   * 
   * @param {number} added DB에 새로 추가된 항목 수
   * @param {number} updated DB에서 업데이트된 항목 수
   * @param {number} unchanged DB에서 변경 없는 항목 수 (선택)
   * @param {number} failed DB 저장 실패한 항목 수 (선택)
   */
  public updateFinalCounts(added: number, updated: number, unchanged: number = 0, failed: number = 0): void {
    console.log(`[CrawlerState] Updating final counts with DB results - added: ${added}, updated: ${updated}, unchanged: ${unchanged}, failed: ${failed}`);
    
    // 기존 상태 정보 저장 (디버깅용)
    const prevNewCount = this.detailStageNewCount;
    const prevUpdatedCount = this.detailStageUpdatedCount;
    
    // 실제 DB 저장 결과를 기준으로 카운터 업데이트
    this.detailStageNewCount = added;
    this.detailStageUpdatedCount = updated;
    
    // 진행 상태 데이터 업데이트
    this.progressData.newItems = added;
    this.progressData.updatedItems = updated;
    
    // 메시지 추가
    this.progressData.message = `크롤링 완료: ${this.processedProductUrls.size}개 수집 (${added}개 추가, ${updated}개 업데이트)`;
    
    // 로그 출력
    console.log(`[CrawlerState] Final counts updated: newItems ${prevNewCount} → ${this.detailStageNewCount}, updatedItems ${prevUpdatedCount} → ${this.detailStageUpdatedCount}`);
    
    // 상태 변경 이벤트 발행
    this.emitProgressUpdate();
    
    // 최종 크롤링 결과 이벤트 발행
    crawlerEvents.emit('finalCrawlingResult', {
      collected: this.processedProductUrls.size,
      newItems: added,
      updatedItems: updated,
      unchangedItems: unchanged,
      failedItems: failed
    });
  }

  /**
   * 진행률을 강제로 동기화하는 메소드
   * UI와 실제 처리 상태가 불일치할 때 사용
   */
  public async forceProgressSync(processed: number, total: number): Promise<void> {
    console.log(`[CrawlerState] Forcing progress sync: ${processed}/${total}`);
    
    // 모든 관련 상태 변수를 동기화
    this.detailStageProcessedCount = processed;
    this.detailStageTotalProductCount = total;
    
    // 모든 UI 관련 속성 업데이트
    await this.updateProgress({
      currentPage: processed,
      totalPages: total,
      percentage: CrawlingUtils.safePercentage(processed, total),
      processedItems: processed,
      totalItems: total,
      newItems: this.detailStageNewCount,
      updatedItems: this.detailStageUpdatedCount,
      currentStep: `${processed}/${total} 제품 처리 완료`,
      remainingTime: processed >= total ? 0 : undefined // 완료 시 남은 시간 0
    });
    
    // 완료 시 상세 진행 상황 강제 동기화
    if (processed >= total) {
      this.emitDetailProgressComplete();
    }
  }

  /**
   * 상세 정보 수집 완료 이벤트 발생
   */
  private emitDetailProgressComplete(): void {
    crawlerEvents.emit('detailStageComplete', {
      processedCount: this.detailStageProcessedCount,
      totalCount: this.detailStageTotalProductCount,
      newCount: this.detailStageNewCount,
      updatedCount: this.detailStageUpdatedCount
    });
  }

  /**
   * 크롤링 시작 시간 설정 (정확한 타이밍 기록)
   */
  public setCrawlingStartTime(): void {
    const startTime = Date.now();
    this.progressData.startTime = startTime;
    logger.info('Crawling start time set', 'CrawlerState');
    
    // 전역 시작 시간도 함께 설정
    import('../utils/progress.js').then(({ setGlobalCrawlingStartTime }) => {
      setGlobalCrawlingStartTime(startTime);
    });
  }

  /**
   * 크롤링 시작 시간 설정 및 초기 시간 예측 (Clean Architecture)
   */
  public async setCrawlingStartTimeWithEstimation(totalPages: number, estimatedProducts: number): Promise<void> {
    const startTime = Date.now();
    this.progressData.startTime = startTime;
    logger.info('Crawling start time set with estimation', 'CrawlerState');
    
    // Clean Architecture: 시간 예측 서비스 활용
    try {
      const initialEstimate = await timeEstimationService.estimateInitialTime(totalPages, estimatedProducts);
      this.progressData.remainingTime = initialEstimate.seconds;
      logger.info(`초기 예상 시간 설정: ${initialEstimate.toString()}`, 'CrawlerState');
    } catch (error) {
      logger.error('초기 시간 예측 실패', error, 'CrawlerState');
    }
    
    // 전역 시간도 함께 설정
    import('../utils/progress.js').then(({ setGlobalCrawlingStartTime }) => {
      setGlobalCrawlingStartTime(startTime);
    });
  }

  /**
   * 적응적 시간 예측 업데이트 (Clean Architecture)
   */
  public async updateAdaptiveTimeEstimation(
    stageId: string,
    progressPercentage: number,
    retryCount: number = 0,
    totalItems: number,
    completedItems: number
  ): Promise<void> {
    if (!this.progressData.startTime) return;

    try {
      const elapsedTimeMs = Date.now() - this.progressData.startTime;
      const estimation = await timeEstimationService.updateEstimation(
        stageId,
        progressPercentage,
        elapsedTimeMs,
        retryCount,
        totalItems,
        completedItems
      );

      // Clean Architecture 결과를 progressData에 적용
      this.progressData.elapsedTime = estimation.elapsedTime.milliseconds; // ms로 저장 (기존 호환성)
      this.progressData.remainingTime = estimation.remainingTime.milliseconds; // ms로 저장 (기존 호환성)
      this.progressData.remainingTimeSeconds = estimation.remainingTime.seconds; // UI용 초 단위
      this.progressData.confidence = estimation.confidence; // 신뢰도 추가
      
      logger.info(`🔄 [CrawlerState] 시간 예측 업데이트 - 단계: ${stageId}, 진행률: ${progressPercentage}%, 남은시간: ${estimation.remainingTime.toString()}, 신뢰도: ${estimation.confidence}`, 'CrawlerState');
    } catch (error) {
      logger.error('적응적 시간 예측 업데이트 실패', error, 'CrawlerState');
    }
  }
}