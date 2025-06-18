/**
 * progress-manager.ts
 * 진행 상황 관리 및 보고를 담당하는 클래스
 */

import { PageProcessingStatusValue, MutablePageProcessingStatusItem } from '../../../../types.js';
import { crawlerEvents, updateRetryStatus } from '../utils/progress.js';
import { CrawlerState } from '../core/CrawlerState.js';
import { ProductListProgressCallback } from './product-list-types.js';


/**
 * 진행 상황 관리자
 */
export class ProgressManager {
  // private statusUpdates: PageStatusUpdate[] = [];
  private state: CrawlerState;
  private progressCallback: ProductListProgressCallback | null = null;
  private pageStatuses: MutablePageProcessingStatusItem[] = [];
  private retryCount: number = 0;
  private processedSuccessfully: number = 0;
  private totalPagesCount: number = 0;
  private stageStartTime: number = 0;
  
  // 배치 처리 정보 저장
  private batchInfo?: {
    currentBatch: number;
    totalBatches: number;
  } = undefined;

  /**
   * 진행 상황 관리자 생성
   * @param state 크롤러 상태
   */
  constructor(state: CrawlerState) {
    this.state = state;
    this.stageStartTime = Date.now();
  }

  /**
   * 진행상황 업데이트 콜백 설정
   * @param callback 진행상황 업데이트 콜백 함수
   */
  public setProgressCallback(callback: ProductListProgressCallback): void {
    this.progressCallback = callback;
  }

  /**
   * 배치 처리 정보 설정
   */
  public setBatchInfo(currentBatch: number, totalBatches: number): void {
    this.batchInfo = { currentBatch, totalBatches };
  }

  /**
   * 초기 페이지 목록 설정
   * @param pageNumbers 페이지 번호 배열
   */
  public initializePages(pageNumbers: number[]): void {
    this.pageStatuses = pageNumbers.map(pageNumber => ({
      pageNumber,
      status: 'waiting',
      attempt: 0
    }));
    this.totalPagesCount = pageNumbers.length;
  }

  /**
   * 페이지 상태 업데이트
   * @param pageNumber 페이지 번호
   * @param status 새 상태
   * @param attempt 시도 횟수
   */
  public updatePageStatus(pageNumber: number, status: PageProcessingStatusValue, attempt?: number): void {
    const pageStatus = this.pageStatuses.find(p => p.pageNumber === pageNumber);
    if (pageStatus) {
      pageStatus.status = status;
      if (attempt !== undefined) {
        pageStatus.attempt = attempt;
      }
    }
  }

  /**
   * 크롤링 작업 상태 이벤트 발생
   * @param taskId 작업 ID
   * @param status 작업 상태
   * @param data 추가 데이터
   */
  public emitTaskStatus(taskId: string, status: PageProcessingStatusValue, data: Record<string, any>): void {
    const messagePayload: Record<string, any> = {
      stage: 1,
      type: 'page',
      ...data
    };
    
    if (status === 'attempting') {
      messagePayload.startTime = new Date().toISOString();
    } else {
      messagePayload.endTime = new Date().toISOString();
    }
    
    // 불필요한 필드 제거
    Object.keys(messagePayload).forEach(key => {
      if (messagePayload[key] === undefined) delete messagePayload[key];
    });
    
    crawlerEvents.emit('crawlingTaskStatus', {
      taskId,
      status,
      message: JSON.stringify(messagePayload)
    });
  }

  /**
   * 페이지 크롤링 상태 이벤트 발생
   * @param pageNumber 페이지 번호
   * @param status 상태
   * @param data 추가 데이터
   */
  public emitPageCrawlStatus(pageNumber: number, status: PageProcessingStatusValue, data: Record<string, any>): void {
    this.emitTaskStatus(`page-${pageNumber}`, status, {
      pageNumber,
      ...data
    });
  }

  /**
   * 재시도 상태 업데이트
   * @param currentAttempt 현재 시도 횟수
   * @param maxAttempt 최대 시도 횟수
   * @param remainingItems 남은 항목 수
   * @param totalItems 전체 항목 수
   * @param itemIds 항목 ID 목록
   */
  public updateRetryStatus(
    currentAttempt: number,
    maxAttempt: number,
    remainingItems: number,
    totalItems: number,
    itemIds: string[]
  ): void {
    this.retryCount = currentAttempt;
    
    // 재시도 정보를 전역 이벤트로 발생
    updateRetryStatus('list-retry', {
      stage: 'productList',
      currentAttempt,
      maxAttempt,
      remainingItems,
      totalItems,
      startTime: Date.now(),
      itemIds
    });
    
    // 재시도 상태를 UI에 즉시 표시 - 상태를 'preparing'으로 설정하여 즉시 표시되도록 함
    crawlerEvents.emit('crawlingTaskStatus', {
      taskId: 'list-retry',
      status: 'running',
      message: `Product list retry cycle ${currentAttempt}/${maxAttempt}: ${remainingItems} pages preparing for retry`
    });
    
    // 즉시 진행 상황 업데이트 발송
    this.sendProgressUpdate(false);
  }

  /**
   * 모든 진행 상황 업데이트 발송
   * @param isStageComplete 단계 완료 여부
   */
  public sendProgressUpdate(isStageComplete: boolean = false): void {
    if (this.progressCallback) {
      this.processedSuccessfully = this.pageStatuses.filter(p => p.status === 'success').length;
      this.progressCallback(
        this.processedSuccessfully,
        this.totalPagesCount,
        [...this.pageStatuses],
        this.retryCount,
        this.stageStartTime,
        isStageComplete,
        this.batchInfo?.currentBatch,
        this.batchInfo?.totalBatches
      );
    }
  }

  /**
   * 수집 결과 요약 정보 보고
   * @param totalPages 총 페이지 수
   * @param collectedProducts 수집된 제품 수
   */
  public summarizeCollectionOutcome(totalPages: number, collectedProducts: number): void {
    const failedCount = this.pageStatuses.filter(p => p.status === 'failed' || p.status === 'incomplete').length;
    const successPagesCount = this.totalPagesCount - failedCount;
    const successRate = this.totalPagesCount > 0 ? (successPagesCount / this.totalPagesCount) : 1;

    console.log(`[ProductListCollector] Final collection: ${successPagesCount}/${this.totalPagesCount} pages fully collected. Total products: ${collectedProducts}`);

    crawlerEvents.emit('crawlingTaskStatus', {
      taskId: 'list-complete', 
      status: 'success',
      message: JSON.stringify({
        stage: 1, 
        type: 'complete',
        siteTotalPages: totalPages,
        pagesAttemptedInStage: this.totalPagesCount,
        successfullyCollectedPagesInStage: successPagesCount,
        collectedProducts: collectedProducts,
        failedOrIncompletePagesInStage: failedCount,
        successRate: parseFloat((successRate * 100).toFixed(1))
      })
    });

    this.state.setStage('productList:processing', '수집된 제품 목록 처리 중');
  }

  /**
   * 재시도 결과 보고
   * @param success 성공 여부
   * @param message 메시지
   */
  public reportRetryOutcome(success: boolean, message: string): void {
    crawlerEvents.emit('crawlingTaskStatus', {
      taskId: 'list-retry', 
      status: success ? 'success' : 'error',
      message
    });
  }

  /**
   * 초기화 단계 설정
   */
  public setInitStage(): void {
    this.state.setStage('productList:init', '1단계: 제품 목록 페이지 수 파악 중');
  }

  /**
   * 처리 단계 설정
   */
  public setProcessingStage(): void {
    this.state.setStage('productList:processing', '수집된 제품 목록 처리 중');
  }
}
