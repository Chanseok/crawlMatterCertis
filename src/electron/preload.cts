const electron = require('electron');

// 기본 API 구현
const baseApi = {
    subscribeStatistics: (callback: (statistics: Statistics) => void) => {
        return ipcOn("statistics", (stats) => {
            callback(stats)
        });
    },
    getStaticData: () => ipcInvoke('getStaticData'),
    subscribeToEvent: <K extends keyof EventPayloadMapping>(
        event: K,
        callback: (data: EventPayloadMapping[K]) => void
    ) => {
        return ipcOn(event, callback);
    },
    invokeMethod: <K extends keyof MethodParamsMapping>(
        methodName: K,
        params?: MethodParamsMapping[K]
    ) => {
        return ipcInvoke(methodName, params);
    }
};

// 프록시 객체를 생성하여 누락된 API 메서드를 동적으로 처리
const electronApi = new Proxy(baseApi, {
    get(target, prop: string | symbol) {
        // 이미 구현된 메서드는 그대로 반환
        if (prop in target) {
            return (target as any)[prop];
        }
        
        // subscribe로 시작하는 메서드는 subscribeToEvent로 처리
        if (typeof prop === 'string' && prop.startsWith('subscribe') && prop !== 'subscribeToEvent') {
            const eventName = prop.replace('subscribe', '');
            const eventNameLower = eventName.charAt(0).toLowerCase() + eventName.slice(1);
            return (callback: any) => target.subscribeToEvent(eventNameLower as any, callback);
        }
        
        // 그 외 메서드는 invokeMethod로 처리
        return (params?: any) => target.invokeMethod(prop as any, params);
    }
});

// 타입 검사를 우회하기 위해 as any 사용 후 IElectronAPI로 타입 단언
electron.contextBridge.exposeInMainWorld('electron', electronApi as any as IElectronAPI);

function ipcInvoke<Key extends keyof EventPayloadMapping | keyof MethodParamsMapping>(
    key: Key,
    params?: any
): Promise<any> {
    return electron.ipcRenderer.invoke(key, params);
}

function ipcOn<Key extends keyof EventPayloadMapping>(
    key: Key,
    callback: (payload: EventPayloadMapping[Key]) => void
) {
    const cb = (_: Electron.IpcRendererEvent, payload: any) => callback(payload);
    // @ts-ignore
    electron.ipcRenderer.on(key, cb);
    return () => electron.ipcRenderer.off(key, cb);
}