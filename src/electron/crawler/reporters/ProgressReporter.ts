/**
 * ProgressReporter.ts
 * 크롤링 진행 상태를 UI에 보고하는 클래스
 */

import { crawlerEvents } from '../utils/progress.js';
import { createElectronLogger } from '../../utils/logger.js';
import { CrawlingUtils } from '../../../shared/utils/CrawlingUtils.js';
import { TimeUtils } from '../../../shared/utils/TimeUtils.js';
import type { CrawlingProgress, FinalCrawlingResult, CrawlingStage } from '../../../../types.js';

export class ProgressReporter {
  private updateCallback: (data: CrawlingProgress) => void;
  private lastStage: CrawlingStage | null = null;
  private logger = createElectronLogger('ProgressReporter');
  
  /**
   * @param updateCallback UI에 진행 상태를 업데이트하는 콜백 함수
   */
  constructor(updateCallback: (data: CrawlingProgress) => void) {
    this.updateCallback = updateCallback;
    
    // 이벤트 리스너 설정 - 모든 진행 상황 이벤트 캡처
    crawlerEvents.on('crawlingProgress', (data: CrawlingProgress) => {
      this.handleProgressUpdate(data);
    });
    
    // 단계 변경 이벤트 추가 모니터링
    crawlerEvents.on('crawlingStageChanged', (stage: CrawlingStage, message: string) => {
      this.logger.info('Stage changed', { data: `${stage}: ${message}` });
      this.lastStage = stage;
    });
    
    // 최종 크롤링 결과 이벤트 모니터링 추가
    crawlerEvents.on('finalCrawlingResult', (result: FinalCrawlingResult) => {
      this.logger.info('Final crawling result received', { 
        data: `${result.newItems} new, ${result.updatedItems} updated of ${result.collected} total` 
      });
      
      // 이 이벤트는 CrawlerState에서 이미 처리되어 crawlingProgress 이벤트를 발생시키지만,
      // 추가적인 상태 업데이트가 필요하면 여기서 처리
    });
  }
  
  /**
   * 진행 상황 업데이트를 처리
   */
  private handleProgressUpdate(data: CrawlingProgress): void {
    // 단계 변경 감지 및 로깅 (status 사용)
    if (data.status && this.lastStage !== data.status) {
      this.logger.info('Status changed', { 
        data: `from ${this.lastStage || 'none'} to ${data.status}` 
      });
      // 여기서는 직접적인 매핑이 어려움 - status와 stage가 다른 개념이므로 로깅만 수행
    }
    
    // 진행 상황 로깅 (진행률이 변경될 때만)
    const percentComplete = this.calculatePercentComplete(data);
    if (percentComplete > 0 && percentComplete % 10 < 1) {
      this.logger.info('Progress update', { data: `${percentComplete.toFixed(0)}% complete` });
    }
    
    // 필요한 경우 추가 데이터 가공
    const enrichedData = {
      ...data,
      formattedElapsedTime: TimeUtils.formatDuration(data.elapsedTime || 0),
      formattedRemainingTime: TimeUtils.formatDuration(data.remainingTime || 0),
      percentComplete: percentComplete
    };
    
    // UI 콜백 호출
    this.updateCallback(enrichedData);
  }
  
  /**
   * 진행률 백분율 계산
   */
  private calculatePercentComplete(data: CrawlingProgress): number {
    if (data.percentage) {
      return data.percentage;
    }
    
    if (data.currentPage && data.totalPages) {
      return CrawlingUtils.safePercentage(data.currentPage, data.totalPages);
    }
    
    if (data.totalItems && data.totalItems > 0) {
      const processed = (data.newItems || 0) + (data.updatedItems || 0);
      return CrawlingUtils.safePercentage(processed, data.totalItems);
    }
    
    if (data.current && data.total) {
      return CrawlingUtils.safePercentage(data.current, data.total);
    }
    
    return 0;
  }
  
  /**
   * 단계 이름을 사용자 친화적 형식으로 변환
   */
  public formatStage(stage: CrawlingStage): string {
    if (typeof stage === 'string') {
      if (stage.startsWith('productList')) return '1/2단계: 제품 목록 수집';
      if (stage.startsWith('productDetail')) return '2/2단계: 제품 상세 정보 수집';
      if (stage === 'completed') return '완료';
      if (stage === 'failed') return '실패';
    }
    return '준비 중';
  }
}