import { contextBridge, ipcRenderer } from 'electron';
import type { 
    EventPayloadMapping, 
    MethodParamsMapping,
    MethodReturnMapping,
    IElectronAPI
} from '../../types.js' with { "resolution-mode": "require" };

// 구독 기반 이벤트 처리를 위한 유틸리티 함수
function createSubscriptionHandler<K extends keyof EventPayloadMapping>(channel: K) {
    return (callback: (data: EventPayloadMapping[K]) => void) => {
        // 이벤트 리스너 등록
        const subscription = (_event: Electron.IpcRendererEvent, data: EventPayloadMapping[K]) => {
            if (String(channel) === 'crawlingProgress') {
              console.log(`[Preload] Received IPC event: ${String(channel)}. Data:`, JSON.stringify(data));
            } else {
              console.log(`[Preload] Received IPC event: ${String(channel)}`, data);
            }
            console.log(`[Preload] About to call callback for ${String(channel)}`);
            console.log(`[Preload] Callback type:`, typeof callback);
            console.log(`[Preload] Callback function:`, callback);
            try {
                callback(data);
                console.log(`[Preload] Callback called successfully for ${String(channel)}`);
            } catch (error) {
                console.error(`[Preload] Error calling callback for ${String(channel)}:`, error);
                if (error instanceof Error) {
                    console.error(`[Preload] Error stack:`, error.stack);
                }
            }
        };
        ipcRenderer.on(channel as string, subscription);
        console.log(`[Preload] Subscribed to IPC channel: ${String(channel)}`);
        
        // 구독 해제 함수 반환
        return () => {
            ipcRenderer.removeListener(channel as string, subscription);
            console.log(`[Preload] Unsubscribed from IPC channel: ${String(channel)}`);
        };
    };
}

// 메서드 호출을 위한 유틸리티 함수
function createMethodHandler<K extends keyof MethodParamsMapping>(
    channel: K
) {
    return (params?: MethodParamsMapping[K]) => {
        return ipcRenderer.invoke(channel as string, params) as Promise<MethodReturnMapping[K]>;
    };
}

// API 객체 정의
const electronAPI: IElectronAPI = {
    // 구독 기반 API
    subscribeToEvent: <K extends keyof EventPayloadMapping>(
        eventName: K,
        callback: (data: EventPayloadMapping[K]) => void
    ) => {
        const subscription = (_event: Electron.IpcRendererEvent, data: EventPayloadMapping[K]) => callback(data);
        ipcRenderer.on(eventName as string, subscription);
        return () => {
            ipcRenderer.removeListener(eventName as string, subscription);
        };
    },
    
    // 각 이벤트 채널 구독 핸들러
    subscribeStatistics: createSubscriptionHandler('statistics'),
    subscribeCrawlingProgress: createSubscriptionHandler('crawlingProgress'),
    subscribeCrawlingComplete: createSubscriptionHandler('crawlingComplete'),
    subscribeCrawlingError: createSubscriptionHandler('crawlingError'),
    subscribeCrawlingTaskStatus: createSubscriptionHandler('crawlingTaskStatus'),
    subscribeCrawlingStopped: createSubscriptionHandler('crawlingStopped'),
    subscribeCrawlingFailedPages: createSubscriptionHandler('crawlingFailedPages'),
    subscribeDbSummary: createSubscriptionHandler('dbSummary'),
    subscribeProducts: createSubscriptionHandler('products'),
    subscribeCrawlingStatusSummary: createSubscriptionHandler('crawlingStatusSummary'),
    
    // 메서드 호출 API
    invokeMethod: <K extends keyof MethodParamsMapping, R = MethodReturnMapping[K]>(
        methodName: K,
        params?: MethodParamsMapping[K]
    ) => {
        console.log(`[Preload] Invoking method: ${String(methodName)}`, params);
        return ipcRenderer.invoke(methodName as string, params) as Promise<R>;
    },
    
    // 특화된 메서드 호출 (직관적인 API 제공)
    getStaticData: createMethodHandler('getStaticData'),
    startCrawling: createMethodHandler('startCrawling'),
    stopCrawling: createMethodHandler('stopCrawling'),
    exportToExcel: createMethodHandler('exportToExcel'),
    getProducts: createMethodHandler('getProducts'),
    getProductById: createMethodHandler('getProductById'),
    searchProducts: createMethodHandler('searchProducts'),
    getDatabaseSummary: createMethodHandler('getDatabaseSummary'),
    markLastUpdated: createMethodHandler('markLastUpdated'),
    checkCrawlingStatus: createMethodHandler('checkCrawlingStatus'),
    
    // 설정 관련 API 추가
    getConfig: () => ipcRenderer.invoke('crawler:get-config'),
    updateConfig: (config: any) => {
        console.log('[Preload] Invoking updateConfig with:', config);
        return ipcRenderer.invoke('crawler:update-config', config);
    },
    resetConfig: () => ipcRenderer.invoke('crawler:reset-config'),
    getConfigPath: () => ipcRenderer.invoke('crawler:get-config-path'),
    
    // 레코드 삭제 API 추가
    deleteRecordsByPageRange: createMethodHandler('deleteRecordsByPageRange'),
    
    // Vendor 관련 API 추가
    fetchAndUpdateVendors: createMethodHandler('fetchAndUpdateVendors'),
    getVendors: createMethodHandler('getVendors'),
    
    // 배치 UI 테스트 API 추가
    testBatchUI: (args: { batchCount?: number; delayMs?: number }) => 
        ipcRenderer.invoke('testBatchUI', args)
};

// contextBridge를 통해 안전하게 API 노출
try {
    contextBridge.exposeInMainWorld('electron', electronAPI);
    console.log('[Preload] Electron API exposed successfully');
} catch (error) {
    console.error('[Preload] Failed to expose Electron API:', error);
}

// 디버깅용 로그
console.log('[Preload] Script loaded successfully');

// IPC 메시지 수신 시 일반적인 로그 추가

/*
// PROBLEMATIC OVERRIDE - Commenting out as it caused compile errors and may interfere
// with createSubscriptionHandler which is the primary mechanism for these events.
ipcRenderer.on = ((originalOn) => {
  return function(channel: string, callback: (...args: any[]) => void) {
    // console.log(`[Preload] Registering listener for channel: ${channel}`);
    if (validChannels.includes(channel)) {
      originalOn(channel, (event, ...args) => { // Should use originalOn
        // console.log(`[Preload] Received IPC message on channel: ${channel}`);
        if (channel === 'crawlingProgress') {
          console.log(`[Preload] OVERRIDE: Received 'crawlingProgress' event. Data:`, JSON.stringify(args[0]));
        } else if (channel === 'crawlingTaskStatus') {
          // console.log(`[Preload] OVERRIDE: Received 'crawlingTaskStatus' event. Data:`, JSON.stringify(args[0]));
        }
        try {
          callback(...args);
        } catch (error) {
          console.error(`[Preload] OVERRIDE: Error in listener for ${String(channel)}:`, error);
          if (error instanceof Error) {
            console.error(`[Preload] OVERRIDE: Error stack:`, error.stack);
          }
        }
      });
    }
    // This wrapper didn't return IpcRenderer, causing type errors.
    // And it might conflict with listeners set by createSubscriptionHandler.
  };
})(ipcRenderer.on);
*/