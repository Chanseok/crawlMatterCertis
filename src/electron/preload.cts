const electron = require('electron');

electron.contextBridge.exposeInMainWorld('electron', {
    subscribeStatistics: (callback) => {
        // @ts-ignore
        electron.ipcRenderer.on("statistics", (_, stats) => {
            callback(stats)
        })

    },
    getStaticData: () => electron.ipcRenderer.invoke('getStaticData'),
} satisfies Window['electron']);