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
        const subscription = (_event: Electron.IpcRendererEvent, data: EventPayloadMapping[K]) => callback(data);
        ipcRenderer.on(channel as string, subscription);
        
        // 구독 해제 함수 반환
        return () => {
            ipcRenderer.removeListener(channel as string, subscription);
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
    updateConfig: (config: any) => ipcRenderer.invoke('crawler:update-config', config),
    resetConfig: () => ipcRenderer.invoke('crawler:reset-config'),
    
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