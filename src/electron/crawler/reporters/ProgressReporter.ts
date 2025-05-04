/**
 * ProgressReporter.ts
 * 크롤링 진행 상태를 UI에 보고하는 클래스
 */

import { crawlerEvents } from '../utils/progress.js';
import { CrawlingStage, ProgressData } from '../core/CrawlerState.js';

export class ProgressReporter {
  private updateCallback: (data: ProgressData) => void;
  private lastStage: CrawlingStage | null = null;
  
  /**
   * @param updateCallback UI에 진행 상태를 업데이트하는 콜백 함수
   */
  constructor(updateCallback: (data: ProgressData) => void) {
    this.updateCallback = updateCallback;
    
    // 이벤트 리스너 설정 - 모든 진행 상황 이벤트 캡처
    crawlerEvents.on('crawlingProgress', (data: ProgressData) => {
      this.handleProgressUpdate(data);
    });
    
    // 단계 변경 이벤트 추가 모니터링
    crawlerEvents.on('crawlingStageChanged', (stage: CrawlingStage, message: string) => {
      console.log(`[ProgressReporter] Stage changed to ${stage}: ${message}`);
      this.lastStage = stage;
    });
  }
  
  /**
   * 진행 상황 업데이트를 처리
   */
  private handleProgressUpdate(data: ProgressData): void {
    // 단계 변경 감지 및 로깅
    if (data.stage && this.lastStage !== data.stage) {
      console.log(`[ProgressReporter] Stage changed from ${this.lastStage || 'none'} to ${data.stage}`);
      this.lastStage = data.stage;
    }
    
    // 진행 상황 로깅 (진행률이 변경될 때만)
    const percentComplete = this.calculatePercentComplete(data);
    if (percentComplete > 0 && percentComplete % 10 < 1) {
      console.log(`[ProgressReporter] Progress: ${percentComplete.toFixed(0)}% complete`);
    }
    
    // 필요한 경우 추가 데이터 가공
    const enrichedData = {
      ...data,
      formattedElapsedTime: this.formatTime(data.elapsedTime),
      formattedRemainingTime: this.formatTime(data.remainingTime),
      percentComplete: percentComplete
    };
    
    // UI 콜백 호출
    this.updateCallback(enrichedData);
  }
  
  /**
   * 시간을 사람이 읽기 쉬운 형식으로 변환
   */
  public formatTime(timeMs: number | undefined): string {
    if (!timeMs) return '알 수 없음';
    
    const seconds = Math.floor(timeMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}시간 ${minutes % 60}분`;
    } else if (minutes > 0) {
      return `${minutes}분 ${seconds % 60}초`;
    } else {
      return `${seconds}초`;
    }
  }
  
  /**
   * 진행률 백분율 계산
   */
  private calculatePercentComplete(data: ProgressData): number {
    if (data.currentPage && data.totalPages) {
      return Math.floor((data.currentPage / data.totalPages) * 100);
    }
    
    if (data.currentItem && data.totalItems) {
      return Math.floor((data.currentItem / data.totalItems) * 100);
    }
    
    return 0;
  }
  
  /**
   * 단계 이름을 사용자 친화적 형식으로 변환
   */
  public formatStage(stage: CrawlingStage): string {
    if (stage.startsWith('productList')) return '1/2단계: 제품 목록 수집';
    if (stage.startsWith('productDetail')) return '2/2단계: 제품 상세 정보 수집';
    if (stage === 'completed') return '완료';
    if (stage === 'failed') return '실패';
    return '준비 중';
  }
}