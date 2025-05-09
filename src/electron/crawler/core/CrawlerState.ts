/**
 * CrawlerState.ts
 * 크롤링 상태를 관리하는 클래스
 */

import type { Product, MatterProduct } from '../../../../types.js';
import { crawlerEvents } from '../utils/progress.js';

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
}