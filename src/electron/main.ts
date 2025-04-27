import { app, BrowserWindow, ipcMain, IpcMainInvokeEvent } from 'electron';
import path from 'path';
import { ipcMainHandle, isDev } from './util.js';
import { getStaticData, pollResources } from './resourceManager.js';
import { getPreoladPath, getUIPath } from './pathResolver.js';
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

    const mainWindow = new BrowserWindow({
        webPreferences: {
            preload: getPreoladPath(),
        }
    });

    if (isDev()) {
        mainWindow.loadURL('http://localhost:5123');
    } else {
        mainWindow.loadFile(getUIPath());
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
