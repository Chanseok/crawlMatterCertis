/**
 * 플랫폼 독립적인 API 인터페이스
 * 이 파일은 Electron, Tauri 등 다양한 백엔드 통신을 추상화합니다.
 */

import type { EventPayloadMapping } from '../types';
import { MatterProduct, AppMode, DatabaseSummary } from '../types';

// 통계 데이터 인터페이스
export interface Statistics {
  timestamp: number;
  cpuUsage: number;
  memoryUsage: number;
  [key: string]: any;
}

// 이벤트 구독 해제 함수 타입
export type UnsubscribeFunction = () => void;

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
  'getProductById': string;
  'searchProducts': { query: string; page?: number; limit?: number };
  'getDatabaseSummary': void;
  'getStaticData': void;
  'markLastUpdated': number;
  'checkCrawlingStatus': void;
}

// 메소드 반환 맵핑 인터페이스
export interface MethodReturnMapping {
  'startCrawling': { success: boolean };
  'stopCrawling': { success: boolean };
  'exportToExcel': { success: boolean; path?: string };
  'getProducts': { products: MatterProduct[]; total: number };
  'getProductById': MatterProduct | null;
  'searchProducts': { products: MatterProduct[]; total: number };
  'getDatabaseSummary': DatabaseSummary;
  'getStaticData': any;
  'markLastUpdated': void;
  'checkCrawlingStatus': { success: boolean; status?: any; error?: string };
}

// 현재 활성화된 플랫폼 API
let currentPlatformAPI: IPlatformAPI;
// 실제 API를 사용하도록 설정
let useMockApiInDevelopment = false;
// 현재 앱 모드 (기본값: 개발 모드)
let currentAppMode: AppMode = 'development';

// 기본 API 어댑터 클래스
class MockApiAdapter implements IPlatformAPI {
  private eventHandlers: Map<string, Set<(data: any) => void>> = new Map();

  subscribeToEvent<K extends keyof EventPayloadMapping>(
    eventName: K,
    callback: (data: EventPayloadMapping[K]) => void
  ): UnsubscribeFunction {
    if (!this.eventHandlers.has(eventName)) {
      this.eventHandlers.set(eventName, new Set());
    }
    
    this.eventHandlers.get(eventName)!.add(callback);
    
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
    
    // 기본 빈 응답을 반환
    return {} as any;
  }

  // 이벤트 발생 메서드 (내부용)
  protected emitEvent<K extends keyof EventPayloadMapping>(
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
  private mockAdapter: MockApiAdapter;

  constructor() {
    // 안전장치로 기본 어댑터 생성
    this.mockAdapter = new MockApiAdapter();
    
    // window.electron 객체 체크
    if (typeof window !== 'undefined' && window.electron) {
      // 실제 함수가 존재하는지 확인
      if (typeof window.electron.subscribeToEvent !== 'function') {
        console.error('[API] window.electron.subscribeToEvent is not a function!');
        console.log('[API] electron object:', window.electron);
      }
      if (typeof window.electron.invokeMethod !== 'function') {
        console.error('[API] window.electron.invokeMethod is not a function!');
        console.log('[API] electron object:', window.electron);
      }
    } else {
      console.error('[API] window.electron is not properly initialized!');
    }
  }

  subscribeToEvent<K extends keyof EventPayloadMapping>(
    eventName: K,
    callback: (data: EventPayloadMapping[K]) => void
  ): UnsubscribeFunction {
    try {
      // window.electron.subscribeToEvent의 타입을 명시적으로 맞춤
      return (window.electron.subscribeToEvent as <T extends keyof EventPayloadMapping>(
        eventName: T,
        callback: (data: EventPayloadMapping[T]) => void
      ) => UnsubscribeFunction)(eventName, callback);
    } catch (error) {
      console.error(`Error subscribing to ${String(eventName)}:`, error);
      // 오류 발생시 대체 구현 사용
      return this.mockAdapter.subscribeToEvent(eventName, callback);
    }
  }

  async invokeMethod<K extends keyof MethodParamsMapping, R = MethodReturnMapping[K]>(
    methodName: K,
    params?: MethodParamsMapping[K]
  ): Promise<R> {
    try {
      console.log(`[ElectronAPI] Invoking method: ${String(methodName)}`, params);
      
      // 안전장치: 함수 존재 여부 확인
      if (window?.electron?.invokeMethod && typeof window.electron.invokeMethod === 'function') {
        // 특별 처리가 필요한 메서드들
        if (methodName === 'startCrawling' && !params) {
          console.warn(`[API] startCrawling called with undefined params. Using default mode 'development'.`);
          // 기본값 제공 - 타입 단언을 사용하여 타입 시스템과 호환되게 함
          return await window.electron.invokeMethod(
            methodName, 
            { mode: 'development' } as unknown as MethodParamsMapping[K]
          ) as Promise<R>;
        }
        
        // checkCrawlingStatus 특별 처리 (타입 안전성 확보)
        if (methodName === 'checkCrawlingStatus') {
          console.log('[API] Invoking checkCrawlingStatus with explicit type handling');
          return await window.electron.invokeMethod('checkCrawlingStatus') as unknown as Promise<R>;
        }
        
        // null이나 undefined인 경우 빈 객체로 대체 (분해 할당 오류 방지)
        const safeParams = params || ({} as unknown as MethodParamsMapping[K]);
        
        // 기본 호출 메서드를 사용
        return await window.electron.invokeMethod(methodName, safeParams) as Promise<R>;
      } else {
        console.warn(`[API] window.electron.invokeMethod is not available. Using fallback implementation for: ${String(methodName)}`);
        // 대체 구현 사용
        return await this.mockAdapter.invokeMethod(methodName, params);
      }
    } catch (error) {
      console.error(`Error invoking ${String(methodName)}:`, error);
      console.error(`Parameters:`, params ? JSON.stringify(params) : 'undefined');
      
      // 오류 발생시 대체 구현 사용 (자동 fallback)
      console.warn(`[API] Falling back to fallback implementation for: ${String(methodName)}`);
      return await this.mockAdapter.invokeMethod(methodName, params);
    }
  }
}

// 플랫폼 감지 및 적절한 API 어댑터 초기화
function detectPlatformAndInitApi(): IPlatformAPI {
  console.log('[API] Detecting platform and initializing API...');
  console.log('[API] Current app mode:', currentAppMode);
  console.log('[API] useMockApiInDevelopment:', useMockApiInDevelopment);
  console.log('[API] window.electron exists:', typeof window !== 'undefined' && 'electron' in window);
  
  // window.electron이 존재하는지 안전하게 확인하고, 존재하면 반드시 ElectronApiAdapter를 사용
  if (typeof window !== 'undefined' && 'electron' in window && window.electron) {
    console.log('[API] Electron API detected. Using ElectronApiAdapter regardless of app mode.');
    return new ElectronApiAdapter();
  }
  
  // window.electron이 없는 경우에만 아래 로직 실행
  console.warn('[API] No window.electron found. Trying to recover...');
  
  // IPC/Electron API가 없는 경우 처리
  if (useMockApiInDevelopment && currentAppMode === 'development') {
    console.log('[API] Development mode. Using basic implementation as fallback.');
    return new MockApiAdapter();
  }
  
  // 최후의 수단으로 경고를 표시하고 기본 어댑터 사용
  console.error('[API] Failed to initialize ElectronApiAdapter. window.electron is undefined.');
  console.warn('[API] Using basic implementation as last resort. Application functionality will be limited.');
  return new MockApiAdapter();
}

// API 인스턴스 초기화 및 공개
export function initPlatformApi(): void { // 반환 타입을 void로 변경
  if (typeof window !== 'undefined') {
    const initialize = () => {
      console.log('[API] Running initialize function...');
      console.log('[API] window.electron exists:', !!window.electron);
      currentPlatformAPI = detectPlatformAndInitApi();
      console.log('[API] currentPlatformAPI set to:', currentPlatformAPI instanceof ElectronApiAdapter ? 'ElectronApiAdapter' : 'MockApiAdapter');
      // 개발 환경에서 디버깅을 위해 window 객체에 노출
      if (import.meta.env.DEV) {
        // @ts-ignore
        window.platformAPI = currentPlatformAPI;
      }
    };

    if (document.readyState === 'loading') {
      console.log('[API] DOM is loading. Adding DOMContentLoaded listener.');
      document.addEventListener('DOMContentLoaded', () => {
        // DOMContentLoaded 이후에도 window.electron 로딩 시간이 필요할 수 있음
        // 지연 시간을 늘려 안정성 확보
        setTimeout(() => {
          console.log('[API] Delayed initialization after DOMContentLoaded (500ms).');
          initialize();
        }, 500); // 지연 시간 증가
      });
      
      // 임시 어댑터 설정 안함
      console.log('[API] Waiting for DOMContentLoaded event...');
    } else {
      // 이미 DOM이 로드된 경우 약간의 지연 후 초기화
      console.log('[API] DOM already loaded. Scheduling delayed initialization (500ms).');
      setTimeout(() => {
        console.log('[API] Running delayed initialization as DOM was already loaded.');
        initialize();
      }, 500); // 지연 시간 증가
    }
  } else {
    // window 객체가 없는 환경 (예: 서버 사이드)
    console.warn('[API] No window object available. Using MockApiAdapter.');
    currentPlatformAPI = new MockApiAdapter();
  }
}

// 플랫폼 API 싱글톤 인스턴스 얻기
export function getPlatformApi(): IPlatformAPI {
  if (!currentPlatformAPI) {
    console.warn('[API] getPlatformApi called before API was initialized');
    
    // 즉시 초기화 시도 (window.electron이 있는지 확인)
    if (window.electron) {
      console.log('[API] window.electron is available. Creating ElectronApiAdapter directly.');
      currentPlatformAPI = new ElectronApiAdapter();
    } else {
      console.warn('[API] window.electron not available. Using basic implementation temporarily.');
      currentPlatformAPI = new MockApiAdapter();
      
      // API가 나중에 초기화될 수 있음을 대비해 지연된 체크 추가
      setTimeout(() => {
        if (window.electron && currentPlatformAPI instanceof MockApiAdapter) {
          console.log('[API] window.electron now available. Replacing basic implementation with ElectronApiAdapter.');
          currentPlatformAPI = new ElectronApiAdapter();
          
          if (import.meta.env.DEV) {
            // @ts-ignore
            window.platformAPI = currentPlatformAPI;
          }
        }
      }, 1000);
    }
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