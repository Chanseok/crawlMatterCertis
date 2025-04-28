// 일반적인 CommonJS 요구 구문 사용
const { contextBridge, ipcRenderer } = require('electron');

// 타입 정의(개발 시에만 사용되고 빌드 시 제거됨)
interface IElectronAPI {
  subscribeToEvent: <T = any>(eventName: string, callback: (data: T) => void) => () => void;
  invokeMethod: <T = any, R = any>(methodName: string, params?: T) => Promise<R>;
}

// 간결하고 안정적인 preload API 정의 (window.electron 객체로 노출됨)
const electronAPI: IElectronAPI = {
  subscribeToEvent: function<T = any>(eventName: string, callback: (data: T) => void): () => void {
    console.log(`[Preload] Setting up event subscription: ${eventName}`);
    const handler = (_: Electron.IpcRendererEvent, data: T): void => callback(data);
    ipcRenderer.on(eventName, handler);
    return (): void => ipcRenderer.removeListener(eventName, handler);
  },
  
  invokeMethod: function<T = any, R = any>(methodName: string, params?: T): Promise<R> {
    // 명시적으로 파라미터 처리 강화
    console.log(`[Preload] Invoking method directly: ${methodName}`, params);
    
    // 특별히 startCrawling 호출에 대한 매개변수 검사 추가
    if (methodName === 'startCrawling') {
      console.log(`[Preload] startCrawling params type: ${typeof params}`);
      console.log(`[Preload] startCrawling JSON params: ${JSON.stringify(params)}`);
      
      // 매개변수가 없으면 기본값 제공
      if (!params) {
        console.warn(`[Preload] startCrawling called with no params, using default`);
        return ipcRenderer.invoke(methodName, { mode: 'development' });
      }
    }
    
    // 항상 명시적인 객체로 매개변수 전달
    return ipcRenderer.invoke(methodName, params);
  }
};

// contextBridge를 통해 renderer 프로세스에서 접근 가능한 API 노출
contextBridge.exposeInMainWorld('electron', electronAPI);

// TypeScript 타입 내보내기
export { IElectronAPI };