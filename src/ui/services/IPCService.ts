/**
 * IPCService.ts
 * Centralized IPC Communication Service
 * 
 * 책임:
 * - 모든 window.electron 통신의 중앙화
 * - IPC 이벤트 구독/해제 관리
 * - 타입 안전성과 오류 처리 제공
 * - 단일 책임 원칙에 따른 통신 계층 분리
 */

import type { CrawlingProgress, CrawlingStatusSummary, AppMode } from '../../../types';

export type IPCEventHandler<T = any> = (data: T) => void;
export type IPCUnsubscribeFunction = () => void;

/**
 * IPC 통신 전용 서비스 클래스
 */
export class IPCService {
  private static instance: IPCService | null = null;
  private isElectronAvailable: boolean;
  // 구독 상태 관리를 위한 맵
  private readonly subscriptions = new Map<string, boolean>();
  private readonly unsubscribeFunctions = new Map<string, () => void>();

  constructor() {
    this.isElectronAvailable = typeof window !== 'undefined' && !!window.electron;
    
    if (!this.isElectronAvailable) {
      console.warn('[IPCService] Electron API not available - running in web mode');
    }
    // Removed problematic window.ipc.on and this.eventEmitter logic
    // Subscriptions are now handled by specific subscribe methods like subscribeCrawlingProgress
  }

  /**
   * 싱글톤 인스턴스 반환
   */
  public static getInstance(): IPCService {
    if (!IPCService.instance) {
      IPCService.instance = new IPCService();
    }
    return IPCService.instance;
  }

  /**
   * Electron 사용 가능 여부 확인
   */
  public get isAvailable(): boolean {
    return this.isElectronAvailable;
  }

  // === 크롤링 진행 상태 관련 ===

  /**
   * 크롤링 진행 상태 이벤트 구독 (개선된 버전)
   */
  public subscribeToCrawlingProgress(handler: IPCEventHandler<CrawlingProgress>): boolean {
    const channelKey = 'crawlingProgress';
    
    // 이미 구독 중인 경우 중복 구독 방지
    if (this.subscriptions.get(channelKey)) {
      console.log('[IPCService] Already subscribed to crawling progress events');
      return true;
    }

    if (!this.isElectronAvailable || !window.electron) {
      console.warn('[IPCService] Electron API not available for crawling progress subscription');
      return false;
    }

    try {
      console.log('[IPCService] Setting up crawling progress subscription...');
      
      const wrappedHandler = (progress: CrawlingProgress) => {
        try {
          console.log(`[IPCService] Progress event received, calling handler. Data: ${JSON.stringify(progress)}`);
          handler(progress);
          console.log('[IPCService] Handler called successfully for crawlingProgress');
        } catch (error) {
          console.error('[IPCService] Error in crawlingProgress handler:', error);
        }
      };
      
      // Electron API를 통한 구독
      window.electron.on('crawlingProgress', wrappedHandler);
      
      // 구독 상태 및 해제 함수 저장
      this.subscriptions.set(channelKey, true);
      this.unsubscribeFunctions.set(channelKey, () => {
        window.electron?.removeAllListeners?.('crawlingProgress');
        this.subscriptions.set(channelKey, false);
        this.unsubscribeFunctions.delete(channelKey);
      });
      
      console.log('[IPCService] Subscribed to crawling progress events');
      return true;
    } catch (error) {
      console.error('[IPCService] Failed to subscribe to crawling progress:', error);
      return false;
    }
  }

  /**
   * 크롤링 완료 이벤트 구독 (개선된 버전)
   */
  public subscribeToCrawlingComplete(handler: IPCEventHandler): boolean {
    const channelKey = 'crawlingComplete';
    
    if (this.subscriptions.get(channelKey)) {
      console.log('[IPCService] Already subscribed to crawling complete events');
      return true;
    }

    if (!this.isElectronAvailable || !window.electron) {
      console.warn('[IPCService] Electron API not available for crawling complete subscription');
      return false;
    }

    try {
      const wrappedHandler = (data: any) => {
        try {
          handler(data);
          console.log('[IPCService] Handler called successfully for crawlingComplete');
        } catch (error) {
          console.error('[IPCService] Error in crawlingComplete handler:', error);
        }
      };

      window.electron.on('crawlingComplete', wrappedHandler);
      
      this.subscriptions.set(channelKey, true);
      this.unsubscribeFunctions.set(channelKey, () => {
        window.electron?.removeAllListeners?.('crawlingComplete');
        this.subscriptions.set(channelKey, false);
        this.unsubscribeFunctions.delete(channelKey);
      });
      
      console.log('[IPCService] Subscribed to crawling complete events');
      return true;
    } catch (error) {
      console.error('[IPCService] Failed to subscribe to crawling complete:', error);
      return false;
    }
  }

  /**
   * 크롤링 오류 이벤트 구독 (개선된 버전)
   */
  public subscribeToCrawlingError(handler: IPCEventHandler): boolean {
    const channelKey = 'crawlingError';
    
    if (this.subscriptions.get(channelKey)) {
      console.log('[IPCService] Already subscribed to crawling error events');
      return true;
    }

    if (!this.isElectronAvailable || !window.electron) {
      console.warn('[IPCService] Electron API not available for crawling error subscription');
      return false;
    }

    try {
      const wrappedHandler = (error: any) => {
        try {
          handler(error);
          console.log('[IPCService] Handler called successfully for crawlingError');
        } catch (err) {
          console.error('[IPCService] Error in crawlingError handler:', err);
        }
      };

      window.electron.on('crawlingError', wrappedHandler);
      
      this.subscriptions.set(channelKey, true);
      this.unsubscribeFunctions.set(channelKey, () => {
        window.electron?.removeAllListeners?.('crawlingError');
        this.subscriptions.set(channelKey, false);
        this.unsubscribeFunctions.delete(channelKey);
      });
      
      console.log('[IPCService] Subscribed to crawling error events');
      return true;
    } catch (error) {
      console.error('[IPCService] Failed to subscribe to crawling error:', error);
      return false;
    }
  }

  /**
   * 크롤링 중단 이벤트 구독 (개선된 버전)
   */
  public subscribeCrawlingStopped(handler: IPCEventHandler): boolean {
    const channelKey = 'crawlingStopped';
    
    if (this.subscriptions.get(channelKey)) {
      console.log('[IPCService] Already subscribed to crawling stopped events');
      return true;
    }

    if (!this.isElectronAvailable || !window.electron) {
      console.warn('[IPCService] Electron API not available for crawling stopped subscription');
      return false;
    }

    try {
      const wrappedHandler = (data: any) => {
        try {
          handler(data);
          console.log('[IPCService] Handler called successfully for crawlingStopped');
        } catch (error) {
          console.error('[IPCService] Error in crawlingStopped handler:', error);
        }
      };

      window.electron.on('crawlingStopped', wrappedHandler);
      
      this.subscriptions.set(channelKey, true);
      this.unsubscribeFunctions.set(channelKey, () => {
        window.electron?.removeAllListeners?.('crawlingStopped');
        this.subscriptions.set(channelKey, false);
        this.unsubscribeFunctions.delete(channelKey);
      });
      
      console.log('[IPCService] Subscribed to crawling stopped events');
      return true;
    } catch (error) {
      console.error('[IPCService] Failed to subscribe to crawling stopped:', error);
      return false;
    }
  }
  
  /**
   * 크롤링 상태 요약 이벤트 구독 (개선된 버전)
   */
  public subscribeCrawlingStatusSummary(handler: IPCEventHandler<CrawlingStatusSummary>): boolean {
    const channelKey = 'crawlingStatusSummary';
    
    if (this.subscriptions.get(channelKey)) {
      console.log('[IPCService] Already subscribed to crawling status summary events');
      return true;
    }

    if (!this.isElectronAvailable || !window.electron) {
      console.warn('[IPCService] Electron API not available for crawling status summary subscription');
      return false;
    }

    try {
      const wrappedHandler = (data: CrawlingStatusSummary) => {
        try {
          console.log('[IPCService] ✅ Raw crawlingStatusSummary event received!', JSON.stringify(data));
          handler(data);
          console.log('[IPCService] Handler called successfully for crawlingStatusSummary');
        } catch (error) {
          console.error('[IPCService] Error in crawlingStatusSummary handler:', error);
        }
      };

      window.electron.on('crawlingStatusSummary', wrappedHandler);
      
      this.subscriptions.set(channelKey, true);
      this.unsubscribeFunctions.set(channelKey, () => {
        window.electron?.removeAllListeners?.('crawlingStatusSummary');
        this.subscriptions.set(channelKey, false);
        this.unsubscribeFunctions.delete(channelKey);
      });
      
      console.log('[IPCService] Subscribed to crawling status summary events');
      return true;
    } catch (error) {
      console.error('[IPCService] Failed to subscribe to crawling status summary:', error);
      return false;
    }
  }

  /**
   * 크롤링 상태 요약 이벤트 구독 (별칭)
   */
  public subscribeToCrawlingStatusSummary(handler: IPCEventHandler<CrawlingStatusSummary>): boolean {
    return this.subscribeCrawlingStatusSummary(handler);
  }

  /**
   * 크롤링 태스크 상태 이벤트 구독
   */
  public subscribeCrawlingTaskStatus(handler: IPCEventHandler): IPCUnsubscribeFunction {
    if (!this.isElectronAvailable || !window.electron?.subscribeCrawlingTaskStatus) {
      console.warn('[IPCService] subscribeCrawlingTaskStatus not available.');
      return () => {};
    }

    try {
      console.log('[IPCService] Setting up crawling task status subscription...');
      const wrappedHandler = (data: any) => {
        console.log('[IPCService] CrawlingTaskStatus event received, calling handler. Data:', JSON.stringify(data));
        try {
          handler(data);
          console.log('[IPCService] Handler called successfully for crawlingTaskStatus');
        } catch (error) {
          console.error('[IPCService] Error in crawlingTaskStatus handler:', error);
        }
      };
      
      const unsubscribe = window.electron.subscribeCrawlingTaskStatus(wrappedHandler);
      console.log('[IPCService] Subscribed to crawling task status events');
      return unsubscribe;
    } catch (error) {
      console.error('[IPCService] Failed to subscribe to crawling task status:', error);
      return () => {};
    }
  }

  /**
   * 초기 크롤링 상태 조회
   */
  public async checkCrawlingStatus(): Promise<any> {
    if (!this.isElectronAvailable) {
      console.warn('[IPCService] 🚫 checkCrawlingStatus called but Electron not available');
      return null;
    }

    try {
      console.log('[IPCService] 🔍 checkCrawlingStatus - calling window.electron.checkCrawlingStatus()...');
      const result = await window.electron.checkCrawlingStatus();
      console.log('[IPCService] ✅ checkCrawlingStatus response received:', result);
      console.log('[IPCService] Result type:', typeof result);
      console.log('[IPCService] Result keys:', result ? Object.keys(result) : 'null/undefined');
      
      if (result && result.success && result.status) {
        const status = result.status;
        console.log('[IPCService] Status details:');
        console.log('[IPCService] - dbProductCount:', status.dbProductCount);
        console.log('[IPCService] - siteProductCount:', status.siteProductCount);
        console.log('[IPCService] - needCrawling:', status.needCrawling);
        console.log('[IPCService] - diff:', status.diff);
        console.log('[IPCService] 🎯 Returning status object:', status);
        return status; // Return the actual status object, not the wrapped result
      } else {
        console.log('[IPCService] ❌ Invalid result structure or failed status check');
        return null;
      }
    } catch (error) {
      console.error('[IPCService] 💥 Failed to check crawling status:', error);
      return null;
    }
  }

  // === 크롤링 제어 ===

  /**
   * 크롤링 시작
   */
  public async startCrawling(config?: any): Promise<boolean> {
    if (!this.isElectronAvailable) {
      console.warn('[IPCService] Cannot start crawling - Electron not available');
      return false;
    }

    try {
      // 완전히 순수한 객체로 변환하여 IPC 직렬화 문제 방지
      let cleanConfig = null;
      if (config) {
        try {
          cleanConfig = JSON.parse(JSON.stringify(config));
          console.log('[IPCService] Config serialized successfully:', Object.keys(cleanConfig));
        } catch (serError) {
          console.error('[IPCService] Config serialization failed:', serError);
          cleanConfig = {};
        }
      }
      
      // Main process expects an object with 'mode' and 'config' properties
      const argsForMainProcess = {
        mode: 'development' as AppMode,
        config: cleanConfig
      };
      
      console.log('[IPCService] Calling window.electron.startCrawling with args:', argsForMainProcess);
      await window.electron.startCrawling(argsForMainProcess);
      console.log('[IPCService] Crawling started successfully');
      return true;
    } catch (error) {
      console.error('[IPCService] Failed to start crawling:', error);
      return false;
    }
  }

  /**
   * 크롤링 중단
   */
  public async stopCrawling(): Promise<boolean> {
    if (!this.isElectronAvailable) {
      console.warn('[IPCService] Cannot stop crawling - Electron not available');
      return false;
    }

    try {
      await window.electron.stopCrawling();
      console.log('[IPCService] Crawling stopped successfully');
      return true;
    } catch (error) {
      console.error('[IPCService] Failed to stop crawling:', error);
      return false;
    }
  }

  // === 유틸리티 메서드 ===

  /**
   * 멀티플 이벤트 구독을 위한 도우미 메서드
   */
  public subscribeMultiple(subscriptions: { 
    event: string, 
    handler: IPCEventHandler 
  }[]): IPCUnsubscribeFunction[] {
    const unsubscribeFunctions: IPCUnsubscribeFunction[] = [];

    subscriptions.forEach(({ event, handler }) => {
      switch (event) {
        case 'crawling-progress':
          unsubscribeFunctions.push(this.subscribeToCrawlingProgress(handler) ? (() => {}) : (() => {}));
          break;
        case 'crawling-complete':
          unsubscribeFunctions.push(this.subscribeToCrawlingComplete(handler) ? (() => {}) : (() => {}));
          break;
        case 'crawling-error':
          unsubscribeFunctions.push(this.subscribeToCrawlingError(handler) ? (() => {}) : (() => {}));
          break;
        default:
          console.warn(`[IPCService] Unknown event type: ${event}`);
      }
    });

    return unsubscribeFunctions;
  }

  /**
   * 포괄적인 구독 정리 관리
   */
  
  /**
   * 특정 채널의 구독을 정리합니다
   */
  public unsubscribe(channelKey: string): boolean {
    const unsubscribeFunction = this.unsubscribeFunctions.get(channelKey);
    if (unsubscribeFunction) {
      try {
        unsubscribeFunction();
        console.log(`[IPCService] Successfully unsubscribed from ${channelKey}`);
        return true;
      } catch (error) {
        console.error(`[IPCService] Error unsubscribing from ${channelKey}:`, error);
        return false;
      }
    } else {
      console.log(`[IPCService] No active subscription found for ${channelKey}`);
      return true;
    }
  }

  /**
   * 모든 구독을 정리합니다
   */
  public unsubscribeAll(): void {
    console.log('[IPCService] Cleaning up all subscriptions...');
    
    const channels = Array.from(this.unsubscribeFunctions.keys());
    for (const channel of channels) {
      this.unsubscribe(channel);
    }
    
    // 상태 맵 초기화
    this.subscriptions.clear();
    this.unsubscribeFunctions.clear();
    
    console.log('[IPCService] All subscriptions cleaned up');
  }

  /**
   * 현재 활성 구독 상태를 반환합니다
   */
  public getActiveSubscriptions(): string[] {
    return Array.from(this.subscriptions.entries())
      .filter(([_, isActive]) => isActive)
      .map(([channel, _]) => channel);
  }

  /**
   * 특정 채널의 구독 상태를 확인합니다
   */
  public isSubscribed(channelKey: string): boolean {
    return this.subscriptions.get(channelKey) === true;
  }

  // === 설정 관련 ===

  /**
   * 현재 설정 조회
   */
  public async getConfig(): Promise<any> {
    if (!this.isElectronAvailable) {
      throw new Error('Electron not available');
    }

    try {
      return await window.electron.getConfig();
    } catch (error) {
      console.error('[IPCService] Failed to get config:', error);
      throw error;
    }
  }

  /**
   * 설정 업데이트
   */
  public async updateConfig(config: any): Promise<any> {
    if (!this.isElectronAvailable) {
      throw new Error('Electron not available');
    }

    try {
      // Serialize the config to ensure it can be cloned for IPC
      const cleanConfig = JSON.parse(JSON.stringify(config));
      console.log('[IPCService] Updating config with:', cleanConfig);
      const result = await window.electron.updateConfig(cleanConfig);
      console.log('[IPCService] Update config result:', result);
      return result;
    } catch (error) {
      console.error('[IPCService] Failed to update config:', error);
      throw error;
    }
  }

  /**
   * 설정 초기화
   */
  public async resetConfig(): Promise<any> {
    if (!this.isElectronAvailable) {
      throw new Error('Electron not available');
    }

    try {
      return await window.electron.resetConfig();
    } catch (error) {
      console.error('[IPCService] Failed to reset config:', error);
      throw error;
    }
  }

  /**
   * 설정 파일 경로 조회
   */
  public async getConfigPath(): Promise<any> {
    if (!this.isElectronAvailable) {
      throw new Error('Electron not available');
    }

    try {
      return await window.electron.getConfigPath();
    } catch (error) {
      console.error('[IPCService] Failed to get config path:', error);
      throw error;
    }
  }

  // === 데이터베이스 관련 ===

  /**
   * 제품을 데이터베이스에 저장
   */
  public async saveToDatabase(products: any[]): Promise<any> {
    if (!this.isElectronAvailable) {
      throw new Error('Electron not available');
    }

    try {
      return await window.electron.invokeMethod('saveProductsToDB', products);
    } catch (error) {
      console.error('[IPCService] Failed to save to database:', error);
      throw error;
    }
  }

  /**
   * 배치 UI 테스트 시작
   */
  public async testBatchUI(args?: any): Promise<any> {
    if (!this.isElectronAvailable) {
      throw new Error('Electron not available');
    }

    try {
      return await window.electron.testBatchUI(args);
    } catch (error) {
      console.error('[IPCService] Failed to start batch UI test:', error);
      throw error;
    }
  }

  /**
   * 제품 목록 조회
   */
  public async getProducts(args?: { page?: number; limit?: number }): Promise<any> {
    if (!this.isElectronAvailable) {
      throw new Error('Electron not available');
    }

    try {
      // Add search property to match expected interface
      const params = args ? { ...args, search: '' } : { search: '' };
      return await window.electron.getProducts(params);
    } catch (error) {
      console.error('[IPCService] Failed to get products:', error);
      throw error;
    }
  }

  /**
   * 제품 ID로 제품 조회
   */
  public async getProductById(id: string): Promise<any> {
    if (!this.isElectronAvailable) {
      throw new Error('Electron not available');
    }

    try {
      return await window.electron.getProductById(id);
    } catch (error) {
      console.error('[IPCService] Failed to get product by ID:', error);
      throw error;
    }
  }

  /**
   * 제품 검색
   */
  public async searchProducts(args: { query: string; page?: number; limit?: number }): Promise<any> {
    if (!this.isElectronAvailable) {
      throw new Error('Electron not available');
    }

    try {
      return await window.electron.searchProducts(args);
    } catch (error) {
      console.error('[IPCService] Failed to search products:', error);
      throw error;
    }
  }

  /**
   * 데이터베이스 요약 정보 조회
   */
  public async getDatabaseSummary(): Promise<any> {
    if (!this.isElectronAvailable) {
      throw new Error('Electron not available');
    }

    try {
      return await window.electron.getDatabaseSummary();
    } catch (error) {
      console.error('[IPCService] Failed to get database summary:', error);
      throw error;
    }
  }

  /**
   * 제품을 데이터베이스에 저장 (명시적 메서드)
   */
  public async saveProductsToDb(products: any[]): Promise<any> {
    if (!this.isElectronAvailable) {
      throw new Error('Electron not available');
    }

    try {
      return await window.electron.invokeMethod('saveProductsToDB', products);
    } catch (error) {
      console.error('[IPCService] Failed to save products to DB:', error);
      throw error;
    }
  }

  /**
   * 데이터베이스 초기화 (clear database)
   * Note: 실제 구현이 필요할 수 있습니다
   */
  public async clearDatabase(): Promise<any> {
    if (!this.isElectronAvailable) {
      throw new Error('Electron not available');
    }

    try {
      // 페이지 범위를 매우 큰 값으로 설정하여 모든 레코드 삭제
      return await window.electron.deleteRecordsByPageRange({ startPageId: 1, endPageId: 999999 });
    } catch (error) {
      console.error('[IPCService] Failed to clear database:', error);
      throw error;
    }
  }

  /**
   * 페이지 범위로 레코드 삭제
   */
  public async deleteRecordsByPageRange(args: { startPageId: number; endPageId: number }): Promise<any> {
    if (!this.isElectronAvailable) {
      throw new Error('Electron not available');
    }

    try {
      return await window.electron.deleteRecordsByPageRange(args);
    } catch (error) {
      console.error('[IPCService] Failed to delete records by page range:', error);
      throw error;
    }
  }

  /**
   * 벤더 목록 조회
   */
  public async getVendors(): Promise<any> {
    if (!this.isElectronAvailable) {
      throw new Error('Electron not available');
    }

    try {
      return await window.electron.getVendors();
    } catch (error) {
      console.error('[IPCService] Failed to get vendors:', error);
      throw error;
    }
  }

  /**
   * 마지막 업데이트 시간 기록
   */
  public async markLastUpdated(timestamp?: number): Promise<any> {
    if (!this.isElectronAvailable) {
      throw new Error('Electron not available');
    }

    try {
      return await window.electron.markLastUpdated(timestamp || Date.now());
    } catch (error) {
      console.error('[IPCService] Failed to mark last updated:', error);
      throw error;
    }
  }

  /**
   * 데이터를 Excel로 내보내기
   */
  public async exportToExcel(params: any): Promise<any> {
    if (!this.isElectronAvailable) {
      throw new Error('Electron not available');
    }

    try {
      return await window.electron.exportToExcel(params);
    } catch (error) {
      console.error('[IPCService] Failed to export to Excel:', error);
      throw error;
    }
  }

  /**
   * 벤더 정보 가져와서 업데이트
   */
  public async fetchAndUpdateVendors(): Promise<any> {
    if (!this.isElectronAvailable) {
      throw new Error('Electron not available');
    }

    try {
      return await window.electron.fetchAndUpdateVendors();
    } catch (error) {
      console.error('[IPCService] Failed to fetch and update vendors:', error);
      throw error;
    }
  }

  // === Gap Detection 관련 ===

  /**
   * 갭 탐지 실행
   */
  public async detectGaps(params: any): Promise<any> {
    if (!this.isElectronAvailable) {
      throw new Error('Electron not available');
    }

    try {
      return await window.electron.detectGaps(params);
    } catch (error) {
      console.error('[IPCService] Failed to detect gaps:', error);
      throw error;
    }
  }

  /**
   * 갭 수집 실행
   */
  public async collectGaps(params: any): Promise<any> {
    if (!this.isElectronAvailable) {
      throw new Error('Electron not available');
    }

    try {
      return await window.electron.collectGaps(params);
    } catch (error) {
      console.error('[IPCService] Failed to collect gaps:', error);
      throw error;
    }
  }

  /**
   * 갭 배치 수집 실행 (새로운 배치 처리 시스템)
   */
  public async executeGapBatchCollection(params: any): Promise<any> {
    if (!this.isElectronAvailable) {
      throw new Error('Electron not available');
    }

    try {
      return await window.electron.executeGapBatchCollection(params);
    } catch (error) {
      console.error('[IPCService] Failed to execute gap batch collection:', error);
      throw error;
    }
  }
}

// 싱글톤 인스턴스 생성
const ipcService = IPCService.getInstance();

// Named export와 default export 모두 제공
export { ipcService };
export default ipcService;
