import { app, BrowserWindow, ipcMain, IpcMainInvokeEvent } from 'electron';
import path from 'path';
import { ipcMainHandle, isDev } from './util.js';
import { getStaticData, pollResources } from './resourceManager.js';
import { getPreloadPath, getUIPath } from './pathResolver.js';
import {
    initializeDatabase,
    getProductsFromDb,
    getProductByIdFromDb,
    searchProductsInDb,
    getDatabaseSummaryFromDb,
    markLastUpdatedInDb
} from './database.js';
import type { AppMode } from '../ui/types.js';

// Define proper types for the IPC handlers with generic function to avoid repetition
function typedIpcMainHandle<T, R>(
    channel: string,
    listener: (event: IpcMainInvokeEvent, arg: T) => Promise<R> | R
): void {
    ipcMain.handle(channel, listener);
}

app.on('ready', async () => {
    // Initialize the database first
    try {
        await initializeDatabase();
        console.log('Database initialized successfully.');
    } catch (error) {
        console.error('Failed to initialize database:', error);
        app.quit();
        return;
    }

    // 디버깅을 위해 preload 경로 로깅
    const preloadPath = getPreloadPath();
    console.log('Using preload script path:', preloadPath);
    console.log('File exists check will be in main process logs');

    const mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: preloadPath,
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false // preload 스크립트가 제대로 로드되지 않을 때는 sandbox를 비활성화해볼 수 있습니다
        }
    });

    // getUIPath 함수 반환값에 따라 loadURL 또는 loadFile 호출
    const uiPath = getUIPath();
    if (uiPath.startsWith('http')) {
        console.log('Loading URL:', uiPath);
        mainWindow.loadURL(uiPath);
    } else {
        console.log('Loading file:', uiPath);
        mainWindow.loadFile(uiPath);
    }

    if (isDev()) {
        // 개발 모드에서는 DevTools를 자동으로 열어 디버깅을 용이하게 함
        mainWindow.webContents.openDevTools();
    }

    pollResources(mainWindow);

    // --- IPC Handlers --- 
    typedIpcMainHandle('getStaticData', () => {
        return getStaticData();
    });

    // Database IPC Handlers
    typedIpcMainHandle<{ page?: number, limit?: number }, any>(
        'getProducts', 
        (_, { page, limit }) => getProductsFromDb(page, limit)
    );

    typedIpcMainHandle<string, any>(
        'getProductById', 
        (_, id) => getProductByIdFromDb(id)
    );

    typedIpcMainHandle<{ query: string, page?: number, limit?: number }, any>(
        'searchProducts', 
        (_, { query, page, limit }) => searchProductsInDb(query, page, limit)
    );

    typedIpcMainHandle(
        'getDatabaseSummary', 
        () => getDatabaseSummaryFromDb()
    );

    typedIpcMainHandle<number, void>(
        'markLastUpdated', 
        (_, count) => markLastUpdatedInDb(count)
    );

    // Other IPC handlers
    typedIpcMainHandle<{ mode: AppMode }, { success: boolean }>(
        'startCrawling',
        async (_, { mode }) => {
            console.log(`Start crawling requested in ${mode} mode.`);
            // Placeholder: Implement actual crawling logic here
            return { success: true };
        }
    );

    typedIpcMainHandle<void, { success: boolean }>(
        'stopCrawling',
        async () => {
            console.log('Stop crawling requested.');
            return { success: true };
        }
    );

    typedIpcMainHandle<{ path?: string }, { success: boolean, path?: string }>(
        'exportToExcel',
        async (_, { path }) => {
            console.log('Export to Excel requested.', { path });
            const defaultPath = '/path/to/exported/file.xlsx';
            return { success: true, path: path || defaultPath };
        }
    );
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        // Re-create the main window on macOS when app icon is clicked and no windows are open
    }
});
