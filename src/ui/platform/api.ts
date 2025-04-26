/**
 * 플랫폼 독립적인 API 인터페이스
 * 이 파일은 Electron, Tauri 등 다양한 백엔드 통신을 추상화합니다.
 */

// 현재 활성화된 플랫폼 API
let currentPlatformAPI: IPlatformAPI;

// Electron API 어댑터
class ElectronApiAdapter implements IPlatformAPI {
  subscribeToEvent<K extends keyof EventPayloadMapping>(
    eventName: K,
    callback: (data: EventPayloadMapping[K]) => void
  ): UnsubscribeFunction {
    // Electron 특화 구현
    if (eventName === 'statistics') {
      return window.electron.subscribeStatistics(callback as (stats: Statistics) => void);
    }
    
    // 일반적인 구독 메커니즘은 현재 구현되어 있지 않음
    console.warn(`Subscription to ${String(eventName)} is not implemented`);
    return () => {};
  }

  async invokeMethod<K extends keyof EventPayloadMapping>(
    methodName: K
  ): Promise<EventPayloadMapping[K]> {
    // Electron 특화 구현
    if (methodName === 'getStaticData') {
      return await window.electron.getStaticData() as EventPayloadMapping[K];
    }
    
    // 일반적인 호출 메커니즘은 현재 구현되어 있지 않음
    throw new Error(`Method ${String(methodName)} is not implemented`);
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

  async invokeMethod<K extends keyof EventPayloadMapping>(
    methodName: K
  ): Promise<EventPayloadMapping[K]> {
    // Tauri 특화 구현은 추후 추가
    throw new Error(`Method ${String(methodName)} is not implemented yet for Tauri`);
  }
}
*/

// 플랫폼 감지 및 적절한 API 어댑터 초기화
function detectPlatformAndInitApi(): IPlatformAPI {
  // 현재는 Electron만 지원
  if (window.electron) {
    return new ElectronApiAdapter();
  }
  
  // 미래의 Tauri 지원
  // if (window.tauri) {
  //   return new TauriApiAdapter();
  // }
  
  // 알 수 없는 플랫폼
  throw new Error('Unsupported platform: No known API detected');
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

// 이 API를 window 객체에도 노출하여 개발 과정에서 디버깅 용이하게 함
// 실제 배포 환경에서는 제거 고려
if (import.meta.env.DEV) {
  // @ts-ignore - 개발 환경에서만 사용되는 코드
  window.platformAPI = initPlatformApi();
}