/**
 * ProgressManager.ts
 * Phase 1 개선: Throttling 메커니즘 도입
 * 
 * 진행 상황 업데이트를 효율적으로 관리하기 위한 Throttling 메커니즘 제공
 */

import { BrowserWindow } from 'electron';
import { CrawlingProgress, CrawlingSessionProgress, StageProgress } from '../../../types.js';

/**
 * 진행 상황 업데이트 관리자
 * 지나치게 빈번한 업데이트를 방지하고 효율적인 IPC 통신을 보장
 */
export class ProgressManager {
  private lastUpdateTime: Map<string, number> = new Map();
  private readonly UPDATE_THROTTLE = 500; // ms - 기본 스로틀링 (100ms -> 500ms로 증가)
  private readonly BATCH_UPDATE_THROTTLE = 1000; // ms - 배치 업데이트용 스로틀링 (250ms -> 1000ms로 증가)
  private pendingUpdates: Map<string, any> = new Map();
  private updateTimeout: number | null = null;
  private mainWindow: BrowserWindow | null = null;
  private progressCallback?: (progress: CrawlingProgress) => void;
  private batchUpdateMode: boolean = false; // 배치 업데이트 모드 플래그
  
  constructor(windowOrCallback: BrowserWindow | ((progress: CrawlingProgress) => void) | null) {
    if (windowOrCallback instanceof BrowserWindow) {
      this.mainWindow = windowOrCallback;
      this.progressCallback = undefined;
    } else if (typeof windowOrCallback === 'function') {
      this.mainWindow = null;
      this.progressCallback = windowOrCallback;
    } else {
      this.mainWindow = null;
      this.progressCallback = undefined;
    }
  }

  /**
   * 새로운 메인 윈도우 설정
   */
  public setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  /**
   * 진행 상황 업데이트 (기존 CrawlingProgress 타입 지원)
   */
  public updateProgress(progress: CrawlingProgress): void {
    this.throttledSend('crawling:progress', progress);
  }

  /**
   * 단계별 진행 상황 업데이트 (새로운 StageProgress 타입 지원)
   */
  public updateStageProgress(stageId: string, progress: StageProgress): void {
    this.throttledSend(`crawling:stage-progress:${stageId}`, progress);
  }

  /**
   * 세션 진행 상황 업데이트 (새로운 CrawlingSessionProgress 타입 지원)
   */
  public updateSessionProgress(sessionProgress: CrawlingSessionProgress): void {
    this.throttledSend('crawling:session-progress', sessionProgress);
  }

  /**
   * 배치 진행 상황 완료 이벤트 (즉시 전송)
   */
  public completeBatch(batchId: number): void {
    this.sendImmediately('crawling:batch-complete', { batchId });
  }

  /**
   * 크롤링 완료 이벤트 (즉시 전송)
   */
  public completeProcess(): void {
    this.sendImmediately('crawling:complete', {});
  }

  /**
   * 에러 이벤트 (즉시 전송)
   */
  public sendError(error: any): void {
    this.sendImmediately('crawling:error', error);
  }

  /**
   * 즉시 IPC 메시지 전송
   * @param channel IPC 채널명
   * @param data 전송할 데이터
   */
  private sendImmediately(channel: string, data: any): void {
    // progressCallback이 있으면 그것을 사용 (crawlingProgress 관련 채널들)
    if (this.progressCallback && (channel === 'crawlingProgress' || channel === 'crawling:progress')) {
      try {
        console.log(`[ProgressManager] 🔄 Calling progress callback with channel: ${channel}`);
        this.progressCallback(data);
      } catch (err) {
        console.error(`[ProgressManager] 🔄 Error calling progress callback:`, err);
      }
      return;
    }
    
    // mainWindow를 통한 전송
    if (!this.mainWindow) {
      console.warn('[ProgressManager] 🔄 Cannot send message, main window is null');
      return;
    }

    try {
      console.log(`[ProgressManager] 🔄 Sending to webContents channel: ${channel}`);
      this.mainWindow.webContents.send(channel, data);
    } catch (err) {
      console.error(`[ProgressManager] 🔄 Error sending message to channel ${channel}:`, err);
    }
  }

  /**
   * 제한된 빈도로 IPC 메시지 전송 (Throttling)
   * @param channel IPC 채널명
   * @param data 전송할 데이터
   */
  public throttledSend(channel: string, data: any): void {
    const now = Date.now();
    const lastUpdate = this.lastUpdateTime.get(channel) || 0;
    
    // 업데이트 요청을 저장
    this.pendingUpdates.set(channel, data);
    
    // 너무 빨리 업데이트를 보내지 않기 위한 Throttling 적용
    if (now - lastUpdate >= this.getCurrentThrottle()) {
      // 즉시 전송
      this.flushUpdate(channel);
    } else if (!this.updateTimeout) {
      // 다음 전송 시간에 맞춰 타이머 설정
      const nextUpdateTime = lastUpdate + this.getCurrentThrottle() - now;
      this.updateTimeout = setTimeout(() => {
        this.flushAllUpdates();
        this.updateTimeout = null;
      }, nextUpdateTime) as unknown as number;
    }
  }

  /**
   * 특정 채널에 대한 대기 중 업데이트를 즉시 전송
   * @param channel IPC 채널명
   */
  private flushUpdate(channel: string): void {
    if (!this.pendingUpdates.has(channel)) return;
    
    const data = this.pendingUpdates.get(channel);
    this.sendImmediately(channel, data);
    this.lastUpdateTime.set(channel, Date.now());
    this.pendingUpdates.delete(channel);
  }

  /**
   * 모든 대기 중 업데이트를 즉시 전송
   */
  private flushAllUpdates(): void {
    for (const channel of this.pendingUpdates.keys()) {
      this.flushUpdate(channel);
    }
  }

  /**
   * 배치 업데이트 모드 활성화 (대량 업데이트 시 사용)
   */
  public enableBatchUpdateMode(): void {
    this.batchUpdateMode = true;
    console.log('[ProgressManager] Batch update mode enabled - throttling increased to', this.BATCH_UPDATE_THROTTLE, 'ms');
  }

  /**
   * 배치 업데이트 모드 비활성화
   */
  public disableBatchUpdateMode(): void {
    this.batchUpdateMode = false;
    console.log('[ProgressManager] Batch update mode disabled - throttling reset to', this.UPDATE_THROTTLE, 'ms');
  }

  /**
   * 현재 적용할 스로틀링 시간 반환
   */
  private getCurrentThrottle(): number {
    return this.batchUpdateMode ? this.BATCH_UPDATE_THROTTLE : this.UPDATE_THROTTLE;
  }

  /**
   * 리소스 정리
   */
  public dispose(): void {
    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout);
      this.updateTimeout = null;
    }
    
    this.flushAllUpdates();
    this.pendingUpdates.clear();
    this.lastUpdateTime.clear();
  }
}
