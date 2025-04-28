import { contextBridge, ipcRenderer } from 'electron';

// 구독 기반 이벤트 처리를 위한 유틸리티 함수
function createSubscriptionHandler(channel: string) {
    return (callback: (data: any) => void) => {
        // 이벤트 리스너 등록
        const subscription = (_event: Electron.IpcRendererEvent, data: any) => callback(data);
        ipcRenderer.on(channel, subscription);
        
        // 구독 해제 함수 반환
        return () => {
            ipcRenderer.removeListener(channel, subscription);
        };
    };
}

// 메서드 호출을 위한 유틸리티 함수
function createMethodHandler(channel: string) {
    return (params?: any) => {
        return ipcRenderer.invoke(channel, params);
    };
}

// API 객체 정의
const electronAPI = {
    // 구독 기반 API
    subscribeToEvent: (eventName: string, callback: (data: any) => void) => {
        const subscription = (_event: Electron.IpcRendererEvent, data: any) => callback(data);
        ipcRenderer.on(eventName, subscription);
        return () => {
            ipcRenderer.removeListener(eventName, subscription);
        };
    },
    
    // 각 이벤트 채널 구독 핸들러
    subscribeStatistics: createSubscriptionHandler('statistics'),
    subscribeCrawlingProgress: createSubscriptionHandler('crawlingProgress'),
    subscribeCrawlingComplete: createSubscriptionHandler('crawlingComplete'),
    subscribeCrawlingError: createSubscriptionHandler('crawlingError'),
    subscribeDbSummary: createSubscriptionHandler('dbSummary'),
    subscribeProducts: createSubscriptionHandler('products'),
    
    // 메서드 호출 API
    invokeMethod: (methodName: string, params?: any) => {
        console.log(`[Preload] Invoking method: ${methodName}`, params);
        return ipcRenderer.invoke(methodName, params);
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