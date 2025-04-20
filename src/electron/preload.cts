const electron = require('electron');

electron.contextBridge.exposeInMainWorld('electron', {
    subscribeStatistics: (callback: (statistics: any) => void) => {
        // @ts-ignore
        electron.ipcRenderer.on("statistics", (_, stats: any)=> {
            callback(stats)
        })
        
    },
    getStaticData: () => electron.ipcRenderer.invoke('getStaticData'),
})