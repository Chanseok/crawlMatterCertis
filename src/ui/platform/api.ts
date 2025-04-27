/**
 * 플랫폼 독립적인 API 인터페이스
 * 이 파일은 Electron, Tauri 등 다양한 백엔드 통신을 추상화합니다.
 */

import { MatterProduct, CrawlingProgress, AppMode, DatabaseSummary } from '../types';
import { 
  allMockProducts, 
  mockDatabaseSummary, 
  simulateCrawling, 
  simulateSearch, 
  simulateExportToExcel 
} from '../services/mockData';

// 통계 데이터 인터페이스
export interface Statistics {
  timestamp: number;
  cpuUsage: number;
  memoryUsage: number;
  [key: string]: any;
}

// 이벤트 구독 해제 함수 타입
export type UnsubscribeFunction = () => void;

// 이벤트 페이로드 맵핑 인터페이스
export interface EventPayloadMapping {
  'statistics': Statistics;
  'crawlingProgress': CrawlingProgress;
  'crawlingComplete': { success: boolean; count: number };
  'crawlingError': { message: string; details?: string };
  'dbSummary': DatabaseSummary;
  'getStaticData': any;
  'products': MatterProduct[];
}

// 플랫폼 API 인터페이스
export interface IPlatformAPI {
  // 이벤트 구독 메소드
  subscribeToEvent<K extends keyof EventPayloadMapping>(
    eventName: K,
    callback: (data: EventPayloadMapping[K]) => void
  ): UnsubscribeFunction;

  // 메소드 호출 (Promise 기반)
  invokeMethod<K extends keyof MethodParamsMapping, R = MethodReturnMapping[K]>(
    methodName: K,
    params?: MethodParamsMapping[K]
  ): Promise<R>;
}

// 메소드 매개변수 맵핑 인터페이스
export interface MethodParamsMapping {
  'startCrawling': { mode: AppMode };
  'stopCrawling': void;
  'exportToExcel': { path?: string };
  'getProducts': { search?: string; page?: number; limit?: number };
  'getDatabaseSummary': void;
  'getStaticData': void;
}

// 메소드 반환 맵핑 인터페이스
export interface MethodReturnMapping {
  'startCrawling': { success: boolean };
  'stopCrawling': { success: boolean };
  'exportToExcel': { success: boolean; path?: string };
  'getProducts': { products: MatterProduct[]; total: number };
  'getDatabaseSummary': DatabaseSummary;
  'getStaticData': any;
}

// 현재 활성화된 플랫폼 API
let currentPlatformAPI: IPlatformAPI;
// 현재 앱 모드에 따라 API를 선택할지 여부
let useMockApiInDevelopment = true;
// 현재 앱 모드 (기본값: 개발 모드)
let currentAppMode: AppMode = 'development';

// Mock API 어댑터 (개발 모드에서 사용)
class MockApiAdapter implements IPlatformAPI {
  private eventHandlers: Map<string, Set<(data: any) => void>> = new Map();
  private crawlingStopper: (() => void) | null = null;

  subscribeToEvent<K extends keyof EventPayloadMapping>(
    eventName: K,
    callback: (data: EventPayloadMapping[K]) => void
  ): UnsubscribeFunction {
    if (!this.eventHandlers.has(eventName)) {
      this.eventHandlers.set(eventName, new Set());
    }
    
    this.eventHandlers.get(eventName)!.add(callback);
    
    // 구독 즉시 초기 데이터 전송 (products, dbSummary 등)
    if (eventName === 'products') {
      setTimeout(() => {
        this.emitEvent('products', allMockProducts.slice(0, 20));
      }, 0);
    }
    
    if (eventName === 'dbSummary') {
      setTimeout(() => {
        this.emitEvent('dbSummary', mockDatabaseSummary);
      }, 0);
    }
    
    return () => {
      const handlers = this.eventHandlers.get(eventName);
      if (handlers) {
        handlers.delete(callback);
      }
    };
  }

  async invokeMethod<K extends keyof MethodParamsMapping, R = MethodReturnMapping[K]>(
    methodName: K,
    params?: MethodParamsMapping[K]
  ): Promise<R> {
    console.log(`[MockAPI] Invoking method: ${String(methodName)}`, params);
    
    // 약간의 지연 시간을 두어 실제 API 호출처럼 느껴지게 함
    await new Promise(resolve => setTimeout(resolve, 300));
    
    switch (methodName) {
      case 'startCrawling':
        if (this.crawlingStopper) {
          return { success: false } as any;
        }
        
        this.crawlingStopper = simulateCrawling(
          (progress) => this.emitEvent('crawlingProgress', progress),
          (success, count) => this.emitEvent('crawlingComplete', { success, count }),
          (message, details) => this.emitEvent('crawlingError', { message, details })
        );
        
        return { success: true } as any;
        
      case 'stopCrawling':
        if (this.crawlingStopper) {
          this.crawlingStopper();
          this.crawlingStopper = null;
          return { success: true } as any;
        }
        return { success: false } as any;
        
      case 'getProducts':
        const searchParams = params as MethodParamsMapping['getProducts'] || {};
        const result = simulateSearch(
          searchParams.search || '', 
          searchParams.page || 1, 
          searchParams.limit || 20
        );
        return result as any;
        
      case 'getDatabaseSummary':
        return mockDatabaseSummary as any;
        
      case 'exportToExcel':
        return simulateExportToExcel() as any;
        
      case 'getStaticData':
        return {
          cpuModel: 'Intel(R) Core(TM) i7-10700K CPU @ 3.80GHz',
          totalMemoryGB: 32,
          totalStorage: 1000
        } as any;
        
      default:
        throw new Error(`Method ${String(methodName)} is not implemented in mock API`);
    }
  }

  // 이벤트 발생 메서드 (내부용)
  private emitEvent<K extends keyof EventPayloadMapping>(
    eventName: K, 
    data: EventPayloadMapping[K]
  ): void {
    const handlers = this.eventHandlers.get(eventName);
    if (handlers) {
      handlers.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event handler for ${String(eventName)}:`, error);
        }
      });
    }
  }
}

// Electron API 어댑터
class ElectronApiAdapter implements IPlatformAPI {
  subscribeToEvent<K extends keyof EventPayloadMapping>(
    eventName: K,
    callback: (data: EventPayloadMapping[K]) => void
  ): UnsubscribeFunction {
    try {
      // 기본 구독 메서드를 사용
      return window.electron.subscribeToEvent(eventName, callback);
    } catch (error) {
      console.error(`Error subscribing to ${String(eventName)}:`, error);
      // 오류 발생시 비어있는 리스너 반환
      return () => {};
    }
  }

  async invokeMethod<K extends keyof MethodParamsMapping, R = MethodReturnMapping[K]>(
    methodName: K,
    params?: MethodParamsMapping[K]
  ): Promise<R> {
    try {
      // 기본 호출 메서드를 사용
      return await window.electron.invokeMethod(methodName, params) as Promise<R>;
    } catch (error) {
      console.error(`Error invoking ${String(methodName)}:`, error);
      throw error;
    }
  }
}

// 미래의 Tauri API 어댑터 (주석 처리)
/*
class TauriApiAdapter implements IPlatformAPI {
  subscribeToEvent<K extends keyof EventPayloadMapping>(
    eventName: K,
    callback: (data: EventPayloadMapping[K]) => void
  ): UnsubscribeFunction {
    // Tauri 특화 구현은 추후 추가
    return () => {};
  }

  async invokeMethod<K extends keyof MethodParamsMapping, R = MethodReturnMapping[K]>(
    methodName: K,
    params?: MethodParamsMapping[K]
  ): Promise<R> {
    // Tauri 특화 구현은 추후 추가
    throw new Error(`Method ${String(methodName)} is not implemented yet for Tauri`);
  }
}
*/

// 플랫폼 감지 및 적절한 API 어댑터 초기화
function detectPlatformAndInitApi(): IPlatformAPI {
  // 개발 모드에서 Mock API 사용
  if (useMockApiInDevelopment && currentAppMode === 'development') {
    console.log('[API] Using Mock API in development mode');
    return new MockApiAdapter();
  }
  
  // 실사용 모드나 Mock API를 사용하지 않는 경우
  if (window.electron) {
    console.log('[API] Using Electron API');
    return new ElectronApiAdapter();
  }
  
  // 미래의 Tauri 지원
  // if (window.tauri) {
  //   return new TauriApiAdapter();
  // }
  
  // 플랫폼이 감지되지 않았다면 Mock API로 폴백
  console.warn('[API] No platform API detected, falling back to Mock API');
  return new MockApiAdapter();
}

// API 인스턴스 초기화 및 공개
export function initPlatformApi(): IPlatformAPI {
  currentPlatformAPI = detectPlatformAndInitApi();
  return currentPlatformAPI;
}

// 플랫폼 API 싱글톤 인스턴스 얻기
export function getPlatformApi(): IPlatformAPI {
  if (!currentPlatformAPI) {
    currentPlatformAPI = initPlatformApi();
  }
  return currentPlatformAPI;
}

// 앱 모드 변경 시 API 재초기화
export function updateApiForAppMode(mode: AppMode): IPlatformAPI {
  currentAppMode = mode;
  currentPlatformAPI = detectPlatformAndInitApi();
  return currentPlatformAPI;
}

// Mock API 사용 설정 변경
export function setUseMockApiInDevelopment(value: boolean): void {
  useMockApiInDevelopment = value;
  if (currentAppMode === 'development') {
    currentPlatformAPI = detectPlatformAndInitApi();
  }
}

// 이 API를 window 객체에도 노출하여 개발 과정에서 디버깅 용이하게 함
// 실제 배포 환경에서는 제거 고려
if (import.meta.env.DEV) {
  // @ts-ignore - 개발 환경에서만 사용되는 코드
  window.platformAPI = getPlatformApi();
}