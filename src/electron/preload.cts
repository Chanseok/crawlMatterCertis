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
    console.log(`[Preload] Invoking method: ${methodName}`, params);
    return ipcRenderer.invoke(methodName, params);
  }
};

// contextBridge를 통해 renderer 프로세스에서 접근 가능한 API 노출
contextBridge.exposeInMainWorld('electron', electronAPI);

// TypeScript 타입 내보내기
export { IElectronAPI };