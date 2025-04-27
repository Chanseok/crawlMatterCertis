// 일반적인 CommonJS 요구 구문 사용
const { contextBridge, ipcRenderer } = require('electron');

// 간결하고 안정적인 preload API 정의
const electronAPI = {
  subscribeToEvent: (eventName: string, callback: (data: any) => void) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on(eventName, handler);
    return () => ipcRenderer.removeListener(eventName, handler);
  },
  
  invokeMethod: (methodName: string, params?: any) => {
    return ipcRenderer.invoke(methodName, params);
  }
};

// contextBridge를 통해 renderer 프로세스에서 접근 가능한 API 노출
contextBridge.exposeInMainWorld('electron', electronAPI);

// 타입 정의(개발 시에만 사용되고 빌드 시 제거됨)
export interface IElectronAPI {
  subscribeToEvent: <T = any>(eventName: string, callback: (data: T) => void) => () => void;
  invokeMethod: <T = any, R = any>(methodName: string, params?: T) => Promise<R>;
}