const electron = require('electron');

electron.contextBridge.exposeInMainWorld('electron', {
    subscribeStatistics: (callback) => {
        return ipcOn("statistics", (stats) => {
            callback(stats)
        })
    },
    getStaticData: () => ipcInvoke('getStaticData'),
    subscribeToEvent: (event, callback) => {
        return ipcOn(event, callback);
    },
    invokeMethod: (method, ...args) => {
        return ipcInvoke(method, ...args);
    }
} satisfies IElectronAPI);

function ipcInvoke<Key extends keyof EventPayloadMapping>(
    key: Key
): Promise<EventPayloadMapping[Key]> {
    return electron.ipcRenderer.invoke(key);
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