import { contextBridge, ipcRenderer } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { 
    EventPayloadMapping, 
    MethodParamsMapping,
    MethodReturnMapping,
    IElectronAPI
} from '../../types.js' with { "resolution-mode": "require" };

// 브라우저 콘솔 로그를 파일로 저장하는 기능
const LOG_FILE = path.join(process.cwd(), 'dist-output', 'browser.log');

// 기존 console 메서드들을 저장
const originalConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  info: console.info,
  debug: console.debug
};

// 로그를 파일에 저장하는 함수
function writeToLogFile(level: string, args: any[]) {
  try {
    const timestamp = new Date().toISOString();
    const message = args.map(arg => {
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg, null, 2);
        } catch (e) {
          return String(arg);
        }
      }
      return String(arg);
    }).join(' ');
    
    const logEntry = `${timestamp} [${level.toUpperCase()}] ${message}\n`;
    
    // 비동기로 파일에 추가
    fs.appendFile(LOG_FILE, logEntry, (err: any) => {
      if (err && err.code !== 'ENOENT') {
        originalConsole.error('[BrowserLogger] Failed to write to browser.log:', err);
      }
    });
  } catch (error) {
    originalConsole.error('[BrowserLogger] Error in writeToLogFile:', error);
  }
}

// User Agent 정보를 로그에 추가하는 함수
function updateBrowserInfo() {
  try {
    const userAgent = navigator.userAgent;
    const timestamp = new Date().toISOString();
    const browserInfo = `${timestamp} [INFO] User Agent: ${userAgent}\n`;
    
    fs.appendFile(LOG_FILE, browserInfo, (err: any) => {
      if (err && err.code !== 'ENOENT') {
        originalConsole.error('[BrowserLogger] Failed to update browser info:', err);
      }
    });
  } catch (error) {
    originalConsole.error('[BrowserLogger] Error updating browser info:', error);
  }
}

// console 메서드들을 오버라이드하여 브라우저 로그를 파일에 기록
console.log = (...args: any[]) => {
  originalConsole.log(...args);
  writeToLogFile('LOG', args);
};

console.error = (...args: any[]) => {
  originalConsole.error(...args);
  writeToLogFile('ERROR', args);
};

console.warn = (...args: any[]) => {
  originalConsole.warn(...args);
  writeToLogFile('WARN', args);
};

console.info = (...args: any[]) => {
  originalConsole.info(...args);
  writeToLogFile('INFO', args);
};

console.debug = (...args: any[]) => {
  originalConsole.debug(...args);
  writeToLogFile('DEBUG', args);
};

console.log('[Preload] Console logging to browser.log enabled');

// 초기화 로그
setTimeout(() => {
  updateBrowserInfo();
  console.log('[BrowserLogger] Console logging to dist-output/browser.log initialized');
}, 1000);

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
    // 이벤트 리스너 메서드 (IElectronAPI 확장 인터페이스용)
    on: (channel: string, listener: (...args: any[]) => void) => {
        ipcRenderer.on(channel, (_event, ...args) => listener(...args));
    },
    removeAllListeners: (channel: string) => {
        ipcRenderer.removeAllListeners(channel);
    },

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
    
    // 각 이벤트 채널 구독 핸들러 - 기존 방식
    subscribeStatistics: createSubscriptionHandler('statistics'),
    subscribeCrawlingProgress: createSubscriptionHandler('crawlingProgress'),
    
    // 새로운 방식의 구독 핸들러
    subscribeToCrawlingProgress: (callback: (data: EventPayloadMapping['crawlingProgress']) => void) => {
        ipcRenderer.on('crawlingProgress', (_event, data) => callback(data));
        return true;
    },
    subscribeToCrawlingComplete: (callback: (data: EventPayloadMapping['crawlingComplete']) => void) => {
        ipcRenderer.on('crawlingComplete', (_event, data) => callback(data));
        return true;
    },
    subscribeToCrawlingError: (callback: (data: EventPayloadMapping['crawlingError']) => void) => {
        ipcRenderer.on('crawlingError', (_event, data) => callback(data));
        return true;
    },
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
    importFromExcel: createMethodHandler('importFromExcel'),
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
        ipcRenderer.invoke('testBatchUI', args),
    
    // Gap Detection API 추가
    detectGaps: createMethodHandler('detectGaps'),
    collectGaps: createMethodHandler('collectGaps'),
    executeGapBatchCollection: createMethodHandler('executeGapBatchCollection'),
    
    // 누락 제품 수집 API 추가
    analyzeMissingProducts: () => ipcRenderer.invoke('analyzeMissingProducts'),
    crawlMissingProducts: (params: any) => ipcRenderer.invoke('crawlMissingProducts', params),
    calculatePageRanges: () => ipcRenderer.invoke('calculatePageRanges'),
    
    // 일반적인 invoke 메서드 (유연성을 위해)
    invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args)
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