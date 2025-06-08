import { toJS } from 'mobx';
import type { CrawlingProgress, CrawlingStatusSummary } from '../../../../types';

export type IPCEventHandler<T = any> = (data: T) => void;
export type IPCUnsubscribeFunction = () => void;

/**
 * Unified IPC Communication Service
 * 
 * Provides comprehensive IPC communication with:
 * - Automatic MobX observable conversion for safe data transmission
 * - Event subscription/unsubscription management
 * - Type safety and error handling
 * - Single responsibility principle for communication layer
 */
class IPCService {
  private static instance: IPCService | null = null;
  private isElectronAvailable: boolean;
  
  // Event subscription management
  private readonly subscriptions = new Map<string, boolean>();
  private readonly unsubscribeFunctions = new Map<string, () => void>();

  constructor() {
    this.isElectronAvailable = typeof window !== 'undefined' && !!window.electron;
    
    if (!this.isElectronAvailable) {
      console.warn('[IPCService] Electron API not available - running in web mode');
    }
  }

  /**
   * Singleton instance getter
   */
  public static getInstance(): IPCService {
    if (!IPCService.instance) {
      IPCService.instance = new IPCService();
    }
    return IPCService.instance;
  }

  /**
   * Check if Electron IPC is available
   */
  public get isAvailable(): boolean {
    return this.isElectronAvailable;
  }

  // ================================
  // Method Invocation (with MobX safety)
  // ================================

  /**
   * Safely call IPC methods with automatic MobX observable conversion
   */
  public async call<T>(channel: string, data?: any): Promise<T> {
    // MobX observable 자동 변환
    const plainData = data ? this.sanitizeForIPC(data) : undefined;
    
    console.log(`📡 IPCService: Calling ${channel}`, {
      originalData: data,
      plainData: plainData,
      dataType: data?.constructor?.name,
      hasWindow: typeof window !== 'undefined',
      hasElectron: typeof window !== 'undefined' && !!(window as any).electron
    });
    
    if (!this.isAvailable) {
      throw new Error(`IPCService: Electron IPC not available for channel: ${channel}`);
    }
    
    return (window as any).electron[channel](plainData);
  }

  /**
   * IPC 전송을 위한 데이터 정화
   * MobX observable, Proxy, 순환 참조 등을 안전한 형태로 변환
   */
  private sanitizeForIPC(data: any): any {
    if (data === null || data === undefined) {
      return data;
    }
    
    // 원시 타입은 그대로 반환
    if (typeof data !== 'object') {
      return data;
    }
    
    try {
      // MobX observable 감지 및 변환
      const converted = toJS(data);
      
      // 추가 안전 검증: 순환 참조 제거
      return this.removeCircularReferences(converted);
      
    } catch (error) {
      console.warn('IPCService: Failed to convert MobX observable, using JSON fallback:', error);
      
      try {
        // 최후의 수단: JSON 직렬화/역직렬화
        return JSON.parse(JSON.stringify(data));
      } catch (jsonError) {
        console.error('IPCService: Failed to serialize data for IPC:', jsonError);
        throw new Error(`Failed to serialize data for IPC transmission: ${jsonError}`);
      }
    }
  }

  /**
   * 순환 참조 제거
   */
  private removeCircularReferences(obj: any, seen = new WeakSet()): any {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    
    if (seen.has(obj)) {
      return '[Circular Reference]';
    }
    
    seen.add(obj);
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.removeCircularReferences(item, seen));
    }
    
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = this.removeCircularReferences(value, seen);
    }
    
    return result;
  }

  // ================================
  // Event Subscription Management
  // ================================

  /**
   * 크롤링 진행 상태 이벤트 구독
   * Enhanced: Returns unsubscribe function for consistent interface
   */
  public subscribeToCrawlingProgress(handler: IPCEventHandler<CrawlingProgress>): IPCUnsubscribeFunction {
    const channelKey = 'crawlingProgress';
    
    // 이미 구독 중인 경우 기존 구독자 반환
    const existingUnsubscribe = this.unsubscribeFunctions.get(channelKey);
    if (existingUnsubscribe && this.subscriptions.get(channelKey)) {
      console.log('[IPCService] Already subscribed to crawling progress events');
      return existingUnsubscribe;
    }

    if (!this.isAvailable || !window.electron) {
      console.warn('[IPCService] Electron API not available for crawling progress subscription');
      return () => {};
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
      
      // 구독 해제 함수 생성
      const unsubscribe: IPCUnsubscribeFunction = () => {
        window.electron?.removeAllListeners?.('crawlingProgress');
        this.subscriptions.set(channelKey, false);
        this.unsubscribeFunctions.delete(channelKey);
      };
      
      // 구독 상태 및 해제 함수 저장
      this.subscriptions.set(channelKey, true);
      this.unsubscribeFunctions.set(channelKey, unsubscribe);
      
      console.log('[IPCService] Subscribed to crawling progress events');
      return unsubscribe;
    } catch (error) {
      console.error('[IPCService] Failed to subscribe to crawling progress:', error);
      return () => {};
    }
  }

  /**
   * 크롤링 완료 이벤트 구독
   * Enhanced: Returns unsubscribe function for consistent interface
   */
  public subscribeToCrawlingComplete(handler: IPCEventHandler): IPCUnsubscribeFunction {
    const channelKey = 'crawlingComplete';
    
    // 이미 구독 중인 경우 기존 구독자 반환
    const existingUnsubscribe = this.unsubscribeFunctions.get(channelKey);
    if (existingUnsubscribe && this.subscriptions.get(channelKey)) {
      console.log('[IPCService] Already subscribed to crawling complete events');
      return existingUnsubscribe;
    }

    if (!this.isAvailable || !window.electron) {
      console.warn('[IPCService] Electron API not available for crawling complete subscription');
      return () => {};
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
      
      // 구독 해제 함수 생성
      const unsubscribe: IPCUnsubscribeFunction = () => {
        window.electron?.removeAllListeners?.('crawlingComplete');
        this.subscriptions.set(channelKey, false);
        this.unsubscribeFunctions.delete(channelKey);
      };
      
      this.subscriptions.set(channelKey, true);
      this.unsubscribeFunctions.set(channelKey, unsubscribe);
      
      console.log('[IPCService] Subscribed to crawling complete events');
      return unsubscribe;
    } catch (error) {
      console.error('[IPCService] Failed to subscribe to crawling complete:', error);
      return () => {};
    }
  }

  /**
   * 크롤링 오류 이벤트 구독
   * Enhanced: Returns unsubscribe function for consistent interface
   */
  public subscribeToCrawlingError(handler: IPCEventHandler): IPCUnsubscribeFunction {
    const channelKey = 'crawlingError';
    
    // 이미 구독 중인 경우 기존 구독자 반환
    const existingUnsubscribe = this.unsubscribeFunctions.get(channelKey);
    if (existingUnsubscribe && this.subscriptions.get(channelKey)) {
      console.log('[IPCService] Already subscribed to crawling error events');
      return existingUnsubscribe;
    }

    if (!this.isAvailable || !window.electron) {
      console.warn('[IPCService] Electron API not available for crawling error subscription');
      return () => {};
    }

    try {
      const wrappedHandler = (error: any) => {
        try {
          handler(error);
          console.log('[IPCService] Handler called successfully for crawlingError');
        } catch (handlerError) {
          console.error('[IPCService] Error in crawlingError handler:', handlerError);
        }
      };

      window.electron.on('crawlingError', wrappedHandler);
      
      // 구독 해제 함수 생성
      const unsubscribe: IPCUnsubscribeFunction = () => {
        window.electron?.removeAllListeners?.('crawlingError');
        this.subscriptions.set(channelKey, false);
        this.unsubscribeFunctions.delete(channelKey);
      };
      
      this.subscriptions.set(channelKey, true);
      this.unsubscribeFunctions.set(channelKey, unsubscribe);
      
      console.log('[IPCService] Subscribed to crawling error events');
      return unsubscribe;
    } catch (error) {
      console.error('[IPCService] Failed to subscribe to crawling error:', error);
      return () => {};
    }
  }

  /**
   * 크롤링 중단 이벤트 구독
   * Enhanced: Returns unsubscribe function for consistent interface
   */
  public subscribeCrawlingStopped(handler: IPCEventHandler): IPCUnsubscribeFunction {
    const channelKey = 'crawlingStopped';
    
    // 이미 구독 중인 경우 기존 구독자 반환
    const existingUnsubscribe = this.unsubscribeFunctions.get(channelKey);
    if (existingUnsubscribe && this.subscriptions.get(channelKey)) {
      console.log('[IPCService] Already subscribed to crawling stopped events');
      return existingUnsubscribe;
    }

    if (!this.isAvailable || !window.electron) {
      console.warn('[IPCService] Electron API not available for crawling stopped subscription');
      return () => {};
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
      
      // 구독 해제 함수 생성
      const unsubscribe: IPCUnsubscribeFunction = () => {
        window.electron?.removeAllListeners?.('crawlingStopped');
        this.subscriptions.set(channelKey, false);
        this.unsubscribeFunctions.delete(channelKey);
      };
      
      this.subscriptions.set(channelKey, true);
      this.unsubscribeFunctions.set(channelKey, unsubscribe);
      
      console.log('[IPCService] Subscribed to crawling stopped events');
      return unsubscribe;
    } catch (error) {
      console.error('[IPCService] Failed to subscribe to crawling stopped:', error);
      return () => {};
    }
  }

  /**
   * 크롤링 상태 요약 이벤트 구독
   * Enhanced: Returns unsubscribe function for consistent interface
   */
  public subscribeToCrawlingStatusSummary(handler: IPCEventHandler<CrawlingStatusSummary>): IPCUnsubscribeFunction {
    const channelKey = 'crawlingStatusSummary';
    
    // 이미 구독 중인 경우 기존 구독자 반환
    const existingUnsubscribe = this.unsubscribeFunctions.get(channelKey);
    if (existingUnsubscribe && this.subscriptions.get(channelKey)) {
      console.log('[IPCService] Already subscribed to crawling status summary events');
      return existingUnsubscribe;
    }

    if (!this.isAvailable || !window.electron) {
      console.warn('[IPCService] Electron API not available for status summary subscription');
      return () => {};
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
      
      // 구독 해제 함수 생성
      const unsubscribe: IPCUnsubscribeFunction = () => {
        window.electron?.removeAllListeners?.('crawlingStatusSummary');
        this.subscriptions.set(channelKey, false);
        this.unsubscribeFunctions.delete(channelKey);
      };
      
      this.subscriptions.set(channelKey, true);
      this.unsubscribeFunctions.set(channelKey, unsubscribe);
      
      console.log('[IPCService] Subscribed to crawling status summary events');
      return unsubscribe;
    } catch (error) {
      console.error('[IPCService] Failed to subscribe to crawling status summary:', error);
      return () => {};
    }
  }

  /**
   * 크롤링 상태 요약 이벤트 구독 (별칭)
   * Enhanced: Returns unsubscribe function for consistent interface
   */
  public subscribeCrawlingStatusSummary(handler: IPCEventHandler<CrawlingStatusSummary>): IPCUnsubscribeFunction {
    return this.subscribeToCrawlingStatusSummary(handler);
  }

  /**
   * 크롤링 태스크 상태 이벤트 구독
   */
  public subscribeCrawlingTaskStatus(handler: IPCEventHandler): IPCUnsubscribeFunction {
    if (!this.isAvailable || !window.electron?.subscribeCrawlingTaskStatus) {
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

  // ================================
  // Crawling Control Methods
  // ================================

  /**
   * 크롤링 시작
   */
  public async startCrawling(config?: any): Promise<boolean> {
    if (!this.isAvailable) {
      console.warn('[IPCService] Cannot start crawling - Electron not available');
      return false;
    }

    try {
      // 완전히 순수한 객체로 변환하여 IPC 직렬화 문제 방지
      let cleanConfig = null;
      if (config) {
        cleanConfig = this.sanitizeForIPC(config);
        console.log('[IPCService] Config serialized successfully:', Object.keys(cleanConfig));
      }
      
      // Main process expects an object with 'mode' and 'config' properties
      const argsForMainProcess = {
        mode: 'development' as any,
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
    if (!this.isAvailable) {
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

  /**
   * 초기 크롤링 상태 조회
   */
  public async checkCrawlingStatus(): Promise<any> {
    if (!this.isAvailable) {
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

  // ================================
  // Configuration Methods
  // ================================

  /**
   * 현재 설정 조회
   */
  public async getConfig(): Promise<any> {
    if (!this.isAvailable) {
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
    if (!this.isAvailable) {
      throw new Error('Electron not available');
    }

    try {
      // Serialize the config to ensure it can be cloned for IPC
      const cleanConfig = this.sanitizeForIPC(config);
      console.log('[IPCService] Updating config with:', cleanConfig);
      const result = await window.electron.updateConfig(cleanConfig);
      console.log('[IPCService] Update config result:', result);
      return result;
    } catch (error) {
      console.error('[IPCService] Failed to update config:', error);
      throw error;
    }
  }

  // ================================
  // Subscription Management
  // ================================

  /**
   * 특정 이벤트 구독 해제
   */
  public unsubscribe(channelKey: string): boolean {
    const unsubscribeFn = this.unsubscribeFunctions.get(channelKey);
    
    if (unsubscribeFn) {
      try {
        unsubscribeFn();
        console.log(`[IPCService] Unsubscribed from ${channelKey}`);
        return true;
      } catch (error) {
        console.error(`[IPCService] Error unsubscribing from ${channelKey}:`, error);
        return false;
      }
    } else {
      console.warn(`[IPCService] No subscription found for ${channelKey}`);
      return false;
    }
  }

  /**
   * 모든 이벤트 구독 해제
   */
  public unsubscribeAll(): void {
    for (const [channelKey] of this.unsubscribeFunctions) {
      this.unsubscribe(channelKey);
    }
  }

  // ================================
  // Utility Methods
  // ================================

  /**
   * 사용 가능한 IPC 채널 목록 (디버깅용)
   */
  public getAvailableChannels(): string[] {
    if (!this.isAvailable) {
      return [];
    }
    
    const electron = (window as any).electron;
    return Object.keys(electron).filter(key => typeof electron[key] === 'function');
  }

  /**
   * 현재 구독 상태 확인 (디버깅용)
   */
  public getSubscriptionStatus(): Record<string, boolean> {
    const status: Record<string, boolean> = {};
    for (const [channel, isActive] of this.subscriptions) {
      status[channel] = isActive;
    }
    return status;
  }

  /**
   * Excel에서 데이터 가져오기
   */
  public async importFromExcel(): Promise<any> {
    if (!this.isElectronAvailable) {
      throw new Error('Electron not available');
    }

    try {
      console.log('[IPCService] Calling Excel import...');
      const result = await window.electron.importFromExcel();
      console.log('[IPCService] Excel import result:', result);
      return result;
    } catch (error) {
      console.error('[IPCService] Failed to import from Excel:', error);
      throw error;
    }
  }

  /**
   * 인스턴스 정리 (테스트용)
   */
  public dispose(): void {
    this.unsubscribeAll();
    IPCService.instance = null;
  }
}

// Export singleton instance and class
export const ipcService = IPCService.getInstance();
export { IPCService };
export default ipcService;
