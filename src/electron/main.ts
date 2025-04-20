import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { isDev } from './util.js';
import { getStaticData, pollResources } from './resourceManager.js';
import { getPreoladPath } from './pathResolver.js';



app.on('ready', () => {
    const mainWindow = new BrowserWindow({
        webPreferences: {
            preload: getPreoladPath(),
        }
    });
    if (isDev()) {
        mainWindow.loadURL('http://localhost:5123');
    } else {
        mainWindow.loadFile(path.join(app.getAppPath(), '/dist-react/index.html'));
    }

    pollResources(mainWindow);

    ipcMain.handle('getStaticData', () => {
        return getStaticData();
    });
});
