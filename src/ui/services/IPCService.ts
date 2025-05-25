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

import type { CrawlingProgress } from '../../../types';

export type IPCEventHandler<T = any> = (data: T) => void;
export type IPCUnsubscribeFunction = () => void;

/**
 * IPC 통신 전용 서비스 클래스
 */
export class IPCService {
  private static instance: IPCService | null = null;
  private isElectronAvailable: boolean;

  constructor() {
    this.isElectronAvailable = typeof window !== 'undefined' && !!window.electron;
    
    if (!this.isElectronAvailable) {
      console.warn('[IPCService] Electron API not available - running in web mode');
    }
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
   * 크롤링 진행 상태 이벤트 구독
   */
  public subscribeCrawlingProgress(handler: IPCEventHandler<CrawlingProgress>): IPCUnsubscribeFunction {
    if (!this.isElectronAvailable) {
      return () => {}; // No-op unsubscribe
    }

    try {
      const unsubscribe = window.electron.subscribeCrawlingProgress(handler);
      console.log('[IPCService] Subscribed to crawling progress events');
      return unsubscribe;
    } catch (error) {
      console.error('[IPCService] Failed to subscribe to crawling progress:', error);
      return () => {};
    }
  }

  /**
   * 크롤링 완료 이벤트 구독
   */
  public subscribeCrawlingComplete(handler: IPCEventHandler): IPCUnsubscribeFunction {
    if (!this.isElectronAvailable) {
      return () => {};
    }

    try {
      const unsubscribe = window.electron.subscribeCrawlingComplete(handler);
      console.log('[IPCService] Subscribed to crawling complete events');
      return unsubscribe;
    } catch (error) {
      console.error('[IPCService] Failed to subscribe to crawling complete:', error);
      return () => {};
    }
  }

  /**
   * 크롤링 오류 이벤트 구독
   */
  public subscribeCrawlingError(handler: IPCEventHandler): IPCUnsubscribeFunction {
    if (!this.isElectronAvailable) {
      return () => {};
    }

    try {
      const unsubscribe = window.electron.subscribeCrawlingError(handler);
      console.log('[IPCService] Subscribed to crawling error events');
      return unsubscribe;
    } catch (error) {
      console.error('[IPCService] Failed to subscribe to crawling error:', error);
      return () => {};
    }
  }

  /**
   * 초기 크롤링 상태 조회
   */
  public async checkCrawlingStatus(): Promise<any> {
    if (!this.isElectronAvailable) {
      return null;
    }

    try {
      const status = await window.electron.checkCrawlingStatus();
      console.log('[IPCService] Initial crawling status retrieved:', status);
      return status;
    } catch (error) {
      console.error('[IPCService] Failed to check crawling status:', error);
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
      await window.electron.startCrawling(config);
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
          unsubscribeFunctions.push(this.subscribeCrawlingProgress(handler));
          break;
        case 'crawling-complete':
          unsubscribeFunctions.push(this.subscribeCrawlingComplete(handler));
          break;
        case 'crawling-error':
          unsubscribeFunctions.push(this.subscribeCrawlingError(handler));
          break;
        default:
          console.warn(`[IPCService] Unknown event type: ${event}`);
      }
    });

    return unsubscribeFunctions;
  }

  /**
   * 모든 구독 한번에 해제
   */
  public unsubscribeAll(unsubscribeFunctions: IPCUnsubscribeFunction[]): void {
    unsubscribeFunctions.forEach(unsubscribe => {
      try {
        unsubscribe();
      } catch (error) {
        console.warn('[IPCService] Error during unsubscribe:', error);
      }
    });
    console.log(`[IPCService] ${unsubscribeFunctions.length} subscriptions cleaned up`);
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
      return await window.electron.updateConfig(config);
    } catch (error) {
      console.error('[IPCService] Failed to update config:', error);
      throw error;
    }
  }

  /**
   * 벤더 정보 갱신
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
}

// 싱글톤 인스턴스 생성
const ipcService = IPCService.getInstance();

// Named export와 default export 모두 제공
export { ipcService };
export default ipcService;
