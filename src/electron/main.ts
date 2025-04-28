import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { isDev } from './util.js';
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
import { startCrawling, stopCrawling, crawlerEvents } from './crawler.js';
import type { AppMode } from '../ui/types.js';

// IPC 채널 상수 정의
const IPC_CHANNELS = {
    GET_STATIC_DATA: 'getStaticData',
    GET_PRODUCTS: 'getProducts',
    GET_PRODUCT_BY_ID: 'getProductById',
    SEARCH_PRODUCTS: 'searchProducts',
    GET_DATABASE_SUMMARY: 'getDatabaseSummary',
    MARK_LAST_UPDATED: 'markLastUpdated',
    START_CRAWLING: 'startCrawling',
    STOP_CRAWLING: 'stopCrawling',
    EXPORT_TO_EXCEL: 'exportToExcel'
};

app.on('ready', async () => {
    // 디버깅을 위해 preload 경로 로깅
    const preloadPath = getPreloadPath();
    console.log('Using preload script path:', preloadPath);
    console.log('File exists check will be in main process logs');

    const mainWindow = new BrowserWindow({
        width: 800,
        height: 1800,
        webPreferences: {
            preload: preloadPath,
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false // preload 스크립트가 제대로 로드되지 않을 때는 sandbox를 비활성화해볼 수 있습니다
        }
    });

    // 메인 윈도우 닫힘 이벤트 처리
    mainWindow.on('close', (e) => {
        console.log('Main window close event triggered');
        
        // 실행 중인 크롤링 작업이 있다면 중지 시도
        stopCrawling();
        
        // 메인 윈도우가 닫힐 때 앱 종료 준비
        prepareForAppTermination();
    });

    // Initialize the database first
    try {
        await initializeDatabase();
        console.log('Database initialized successfully.');
    } catch (error) {
        console.error('Failed to initialize database:', error);
        app.quit();
        return;
    }

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
    
    // 크롤러 이벤트 UI로 전달 설정
    setupCrawlerEvents(mainWindow);

    // --- 직접 네이티브 IPC 핸들러 등록 --- 
    // 기존의 typedIpcMainHandle 래퍼 함수를 사용하지 않고 
    // 직접 ipcMain.handle을 사용하여 더 안정적인 IPC 통신 구현
    
    // 기본 데이터 핸들러
    ipcMain.handle(IPC_CHANNELS.GET_STATIC_DATA, (event) => {
        return getStaticData();
    });

    // 데이터베이스 핸들러
    ipcMain.handle(IPC_CHANNELS.GET_PRODUCTS, async (event, args) => {
        console.log('[IPC] getProducts called with args:', args);
        const { page, limit } = args || {};
        return await getProductsFromDb(page, limit);
    });

    ipcMain.handle(IPC_CHANNELS.GET_PRODUCT_BY_ID, async (event, id) => {
        console.log('[IPC] getProductById called with id:', id);
        return await getProductByIdFromDb(id);
    });

    ipcMain.handle(IPC_CHANNELS.SEARCH_PRODUCTS, async (event, args) => {
        console.log('[IPC] searchProducts called with args:', args);
        const { query, page, limit } = args || {};
        return await searchProductsInDb(query, page, limit);
    });

    ipcMain.handle(IPC_CHANNELS.GET_DATABASE_SUMMARY, async (event) => {
        console.log('[IPC] getDatabaseSummary called');
        return await getDatabaseSummaryFromDb();
    });

    ipcMain.handle(IPC_CHANNELS.MARK_LAST_UPDATED, async (event, count) => {
        console.log('[IPC] markLastUpdated called with count:', count);
        return await markLastUpdatedInDb(count);
    });

    // 크롤링 핸들러
    ipcMain.handle(IPC_CHANNELS.START_CRAWLING, async (event, args) => {
        // 매개변수 디버깅 로깅 추가
        console.log('[IPC] startCrawling called with args (raw):', args);
        console.log('[IPC] startCrawling args type:', typeof args);
        console.log('[IPC] startCrawling JSON args:', JSON.stringify(args));
        
        // 안전한 매개변수 처리
        let mode: AppMode = 'development'; // 기본값
        
        try {
            if (args && typeof args === 'object' && 'mode' in args) {
                mode = args.mode as AppMode;
            }
        } catch (err) {
            console.error('[IPC] Error parsing startCrawling args:', err);
        }
        
        console.log(`[IPC] Start crawling requested in ${mode} mode.`);
        
        try {
            const success = await startCrawling();
            return { success };
        } catch (error) {
            console.error('[IPC] Error during crawling:', error);
            return { success: false, error: String(error) };
        }
    });

    ipcMain.handle(IPC_CHANNELS.STOP_CRAWLING, async (event) => {
        console.log('[IPC] stopCrawling called');
        try {
            const success = stopCrawling();
            return { success };
        } catch (error) {
            console.error('[IPC] Error stopping crawling:', error);
            return { success: false, error: String(error) };
        }
    });

    ipcMain.handle(IPC_CHANNELS.EXPORT_TO_EXCEL, async (event, args) => {
        console.log('[IPC] exportToExcel called with args:', args);
        try {
            const path = args?.path || '/path/to/exported/file.xlsx';
            return { success: true, path };
        } catch (error) {
            console.error('[IPC] Error exporting to Excel:', error);
            return { success: false, error: String(error) };
        }
    });
});

/**
 * 크롤러 이벤트를 UI로 전달하는 함수
 */
function setupCrawlerEvents(mainWindow: BrowserWindow): void {
    // 크롤링 진행 상태 이벤트
    crawlerEvents.on('crawlingProgress', (progress) => {
        mainWindow.webContents.send('crawlingProgress', progress);
    });
    
    // 크롤링 완료 이벤트
    crawlerEvents.on('crawlingComplete', (data) => {
        mainWindow.webContents.send('crawlingComplete', data);
    });
    
    // 크롤링 오류 이벤트
    crawlerEvents.on('crawlingError', (error) => {
        mainWindow.webContents.send('crawlingError', error);
    });
}

// 앱 종료 준비 함수
function prepareForAppTermination(): void {
    console.log('Preparing for app termination...');
    
    try {
        // 실행 중인 크롤링 작업 중지 시도
        stopCrawling();
        
        // 기타 실행 중인 프로세스나 리소스 정리
        // 예: 데이터베이스 연결 해제, 임시 파일 정리 등
        console.log('Cleanup completed successfully');
    } catch (error) {
        console.error('Error during app termination cleanup:', error);
    }
}

// 앱이 종료되기 직전 이벤트
app.on('before-quit', (event) => {
    console.log('Before-quit event triggered');
    
    // 종료 전 정리 작업 수행
    prepareForAppTermination();
});

// Quit when all windows are closed (modified to also quit on macOS)
app.on('window-all-closed', () => {
    // 모든 창이 닫힐 때 앱을 완전히 종료 (macOS에서도)
    console.log('All windows closed, quitting application');
    app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        // Re-create the main window on macOS when app icon is clicked and no windows are open
    }
});
