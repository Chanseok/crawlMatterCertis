/**
 * CrawlerState.ts
 * 크롤링 상태를 관리하는 클래스
 */

import type { Product, MatterProduct, PageProcessingStatusItem, PageProcessingStatusValue } from '../../../../types.js';
import { crawlerEvents } from '../utils/progress.js';
import { PageValidator, PageValidationResult } from '../utils/page-validator.js';

export type CrawlingStage =
  | 'preparation'
  | 'productList:init'
  | 'productList:fetching'
  | 'productList:processing'
  | 'productDetail:init'
  | 'productDetail:fetching'
  | 'productDetail:processing'
  | 'completed'
  | 'failed';

export interface ProgressData {
  stage: CrawlingStage;
  message: string;
  currentPage?: number;
  totalPages?: number;
  currentItem?: number;
  totalItems?: number;
  parallelTasks?: number;
  activeParallelTasks?: number;
  startTime: number;
  estimatedEndTime?: number;
  elapsedTime?: number;
  remainingTime?: number;
  failedItems?: string[];
  criticalError?: string;
  percentage?: number;  // 진행률 퍼센트 (0-100)
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
  private progressData: ProgressData;
  private detailStageProcessedCount: number = 0;
  private detailStageNewCount: number = 0;
  private detailStageUpdatedCount: number = 0;
  
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
    console.log(`[CrawlerState] 페이지 ${pageNumber}의 제품 캐시 업데이트: 기존 ${existingProducts.length}개 + 신규 ${newProducts.length}개 = 병합 후 ${mergedProducts.length}개`);
    
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

  constructor() {
    this.progressData = {
      stage: 'preparation',
      message: '크롤링 준비 중...',
      startTime: Date.now(),
    };
  }

  /**
   * 현재 진행 상태를 반환
   */
  public getProgressData(): ProgressData {
    return { ...this.progressData };
  }

  /**
   * 진행 상태의 단계를 설정
   */
  public setStage(stage: CrawlingStage, message?: string): void {
    this.progressData.stage = stage;
    this.progressData.message = message ? message : this.progressData.message;
    
    // 이벤트 발행
    crawlerEvents.emit('crawlingStageChanged', stage, message);
    
    // 기존 progress 이벤트도 발행하여 일관성 유지
    crawlerEvents.emit('crawlingProgress', {...this.progressData});
    
    console.log(`[CrawlerState] Stage changed to: ${stage} - ${message}`);
  }
/**
 * 진행 상태 업데이트
 */
public updateProgress(data: Partial<ProgressData>): void {
  // 현재 상태 업데이트
  this.progressData = {
    ...this.progressData,
    ...data
  };

  // 경과 시간 계산
  if (this.progressData.startTime) {
    this.progressData.elapsedTime = Date.now() - this.progressData.startTime;
    
    // 남은 시간 추정 (진행률에 기반)
    if (this.progressData.totalItems && this.progressData.currentItem) {
      const percentComplete = this.progressData.currentItem / this.progressData.totalItems;
      if (percentComplete > 0) {
        const totalEstimatedTime = this.progressData.elapsedTime / percentComplete;
        this.progressData.remainingTime = totalEstimatedTime - this.progressData.elapsedTime;
        this.progressData.percentage = Math.round(percentComplete * 100); // 진행률 퍼센트 계산
      }
    }
  }

  // 명시적 디버그 로깅 추가
  console.log(`[CrawlerState] Progress updated: ${this.progressData.currentItem}/${this.progressData.totalItems} (${Math.round((this.progressData.currentItem || 0) / (this.progressData.totalItems || 1) * 100)}%)`);

  // 헬퍼 메서드를 사용하여 이벤트 발행 (일관성 유지)
  this.emitProgressUpdate();
}

  /**
   * 병렬 작업 상태 업데이트
   */
  public updateParallelTasks(active: number, total: number): void {
    this.progressData.parallelTasks = total;
    this.progressData.activeParallelTasks = active;
    this.emitProgressUpdate();
  }

  /**
   * 치명적인 오류 보고
   */
  public reportCriticalFailure(error: string): void {
    this.progressData.stage = 'failed';
    this.progressData.criticalError = error;
    this.progressData.message = `크롤링 중단: ${error}`;
    console.error(this.progressData.message);
    this.emitProgressUpdate();
  }

  /**
   * 실패한 페이지 추가
   */
  public addFailedPage(pageNumber: number, error: string): void {
    if (!this.failedPages.includes(pageNumber)) {
      this.failedPages.push(pageNumber);
    }
    
    if (!this.failedPageErrors[pageNumber]) {
      this.failedPageErrors[pageNumber] = [];
    }
    this.failedPageErrors[pageNumber].push(error);
  }

  /**
   * 실패한 제품 추가
   */
  public addFailedProduct(url: string, error: string): void {
    if (!this.failedProducts.includes(url)) {
      this.failedProducts.push(url);
    }
    
    if (!this.failedProductErrors[url]) {
      this.failedProductErrors[url] = [];
    }
    this.failedProductErrors[url].push(error);
    
    if (!this.progressData.failedItems) {
      this.progressData.failedItems = [];
    }
    if (!this.progressData.failedItems.includes(url)) {
      this.progressData.failedItems.push(url);
      this.emitProgressUpdate();
    }
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
    console.log('[CrawlerState] Failed pages have been reset for retry.');
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
  public hasCriticalFailures(): boolean {
    const totalItems = this.getTotalItems();
    
    // 실패율이 30% 이상이면 치명적 오류로 간주
    if (this.failedPages.length > 0) {
      return this.failedPages.length / totalItems > 0.3;
    } else if (this.failedProducts.length > 0 && totalItems > 0) {
      return this.failedProducts.length / totalItems > 0.3;
    }
    
    return false;
  }
  
  /**
   * 진행 상태 업데이트를 이벤트로 발행
   */
  private emitProgressUpdate(): void {
    crawlerEvents.emit('crawlingProgress', this.progressData);
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
    this.progressData = {
      stage: 'preparation',
      message: '크롤링 준비 중...',
      startTime: Date.now(),
    };
    this.detailStageProcessedCount = 0;
    this.detailStageNewCount = 0;
    this.detailStageUpdatedCount = 0;
    
    // 스마트 병합을 위한 상태 초기화
    this.pageProductsCache.clear();
    this.pageProcessingStatuses.clear();
  }

  /**
   * 상세 정보 수집 단계에서 처리된 항목 기록
   */
  public recordDetailItemProcessed(isNewItem: boolean): void {
    this.detailStageProcessedCount++;
    if (isNewItem) {
      this.detailStageNewCount++;
    } else {
      this.detailStageUpdatedCount++;
    }
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
   * 마지막으로 설정된 기대 제품 수 조회 (페이지당)
   */
  public get expectedProductsPerPage(): number {
    return this._expectedProductsPerPage || 12; // 기본값 12
  }

  /**
   * 페이지당 기대 제품 수 설정
   * @param count 페이지당 기대 제품 수
   */
  public setExpectedProductsPerPage(count: number): void {
    if (count > 0) {
      this._expectedProductsPerPage = count;
    }
  }
}