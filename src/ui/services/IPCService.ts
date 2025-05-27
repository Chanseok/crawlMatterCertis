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
   * 크롤링 중단 이벤트 구독
   */
  public subscribeCrawlingStopped(handler: IPCEventHandler): IPCUnsubscribeFunction {
    if (!this.isElectronAvailable) {
      return () => {};
    }

    try {
      const unsubscribe = window.electron.subscribeCrawlingStopped(handler);
      console.log('[IPCService] Subscribed to crawling stopped events');
      return unsubscribe;
    } catch (error) {
      console.error('[IPCService] Failed to subscribe to crawling stopped:', error);
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
      // config가 이미 직렬화된 깔끔한 객체로 전달됨
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
}

// 싱글톤 인스턴스 생성
const ipcService = IPCService.getInstance();

// Named export와 default export 모두 제공
export { ipcService };
export default ipcService;
