import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { isDev } from './util.js';
import path from 'path';
import fs from 'fs';
import XLSX from 'xlsx';
import { getStaticData, pollResources } from './resourceManager.js';
import { getPreloadPath, getUIPath } from './pathResolver.js';
import {
    initializeDatabase,
    getProductsFromDb,
    getProductByIdFromDb,
    searchProductsInDb,
    getDatabaseSummaryFromDb,
    markLastUpdatedInDb,
    deleteProductsByPageRange,
    getMaxPageIdFromDb
} from './database.js';
import { startCrawling, stopCrawling, checkCrawlingStatus } from './crawler/index.js';
import { crawlerEvents } from './crawler/utils/progress.js';
// UI 타입이 아닌 공유 타입 사용
import type { AppMode, CrawlingProgress } from '../../types.js';
import type { FailedPageReport, CrawlingResultReport } from './crawler/utils/types.js';
import { configManager } from './ConfigManager.js';

// 로컬에서 필요한 타입 정의
interface CrawlingTaskStatus {
    taskId: number | string;
    status: 'pending' | 'running' | 'success' | 'error' | 'stopped';
    message?: string;
}

interface CrawlingError {
    message: string;
    details: string;
}

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
    EXPORT_TO_EXCEL: 'exportToExcel',
    CHECK_CRAWLING_STATUS: 'checkCrawlingStatus',
    
    // 설정 관련 채널 추가
    GET_CONFIG: 'crawler:get-config',
    UPDATE_CONFIG: 'crawler:update-config',
    RESET_CONFIG: 'crawler:reset-config',
    
    // 레코드 삭제 채널 추가
    DELETE_RECORDS_BY_PAGE_RANGE: 'deleteRecordsByPageRange',
    
    // 제품 수동 저장 채널 추가
    SAVE_PRODUCTS_TO_DB: 'saveProductsToDB'
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
    mainWindow.on('close', (_e) => {
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
    ipcMain.handle(IPC_CHANNELS.GET_STATIC_DATA, (_event) => {
        return getStaticData();
    });

    // 데이터베이스 핸들러
    ipcMain.handle(IPC_CHANNELS.GET_PRODUCTS, async (_event, args) => {
        console.log('[IPC] getProducts called with args:', args);
        const { page, limit } = args || {};
        return await getProductsFromDb(page, limit);
    });

    ipcMain.handle(IPC_CHANNELS.GET_PRODUCT_BY_ID, async (_event, id) => {
        console.log('[IPC] getProductById called with id:', id);
        return await getProductByIdFromDb(id);
    });

    ipcMain.handle(IPC_CHANNELS.SEARCH_PRODUCTS, async (_event, args) => {
        console.log('[IPC] searchProducts called with args:', args);
        const { query, page, limit } = args || {};
        return await searchProductsInDb(query, page, limit);
    });

    ipcMain.handle(IPC_CHANNELS.GET_DATABASE_SUMMARY, async (_event) => {
        console.log('[IPC] getDatabaseSummary called');
        return await getDatabaseSummaryFromDb();
    });

    ipcMain.handle(IPC_CHANNELS.MARK_LAST_UPDATED, async (_event, count) => {
        console.log('[IPC] markLastUpdated called with count:', count);
        return await markLastUpdatedInDb(count);
    });

    // 크롤링 핸들러
    ipcMain.handle(IPC_CHANNELS.START_CRAWLING, async (_event, args) => {
        // 매개변수 디버깅 로깅 추가
        console.log('[IPC] startCrawling called with args (raw):', args);
        console.log('[IPC] startCrawling args type:', typeof args);
        console.log('[IPC] startCrawling JSON args:', JSON.stringify(args));
        
        // 안전한 매개변수 처리
        let mode: AppMode = 'development'; // 기본값
        let config = null; // 설정 추가
        
        try {
            if (args && typeof args === 'object') {
                if ('mode' in args) {
                    mode = args.mode as AppMode;
                }
                // 설정 데이터 추출
                if ('config' in args && args.config) {
                    config = args.config;
                    // 설정 업데이트
                    if (config.pageRangeLimit) {
                        configManager.updateConfig({
                            pageRangeLimit: config.pageRangeLimit
                        });
                    }
                    console.log('[IPC] Using config from UI:', JSON.stringify(config));
                }
            }
        } catch (err) {
            console.error('[IPC] Error parsing startCrawling args:', err);
        }
        
        console.log(`[IPC] Start crawling requested in ${mode} mode with pageLimit: ${config?.pageRangeLimit || 'default'}`);
        
        try {
            // 설정 전달하여 크롤링 시작
            const success = await startCrawling(config);
            return { success };
        } catch (error) {
            console.error('[IPC] Error during crawling:', error);
            return { success: false, error: String(error) };
        }
    });

    ipcMain.handle(IPC_CHANNELS.STOP_CRAWLING, async (_event) => {
        console.log('[IPC] stopCrawling called');
        try {
            const success = stopCrawling();
            return { success };
        } catch (error) {
            console.error('[IPC] Error stopping crawling:', error);
            return { success: false, error: String(error) };
        }
    });

    ipcMain.handle(IPC_CHANNELS.EXPORT_TO_EXCEL, async (_event, args) => {
        console.log('[IPC] exportToExcel called with args:', args);
        try {
            // 다운로드 폴더 기본 경로 가져오기
            const userDownloadFolder = app.getPath('downloads');
            const currentDate = new Date();
            const dateStr = currentDate.toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const defaultFileName = `matter-products_${dateStr}.xlsx`;
            const defaultPath = path.join(userDownloadFolder, defaultFileName);
            
            // 설정에 저장된 경로 사용(있는 경우)
            const config = configManager.getConfig();
            let initialPath = defaultPath;
            
            if (config.lastExcelExportPath) {
                const lastDir = path.dirname(config.lastExcelExportPath);
                if (fs.existsSync(lastDir)) {
                    initialPath = path.join(lastDir, defaultFileName);
                }
            }
            
            // 저장 대화상자 표시
            const { canceled, filePath } = await dialog.showSaveDialog({
                title: 'Excel로 내보내기',
                defaultPath: initialPath,
                filters: [{ name: 'Excel 파일', extensions: ['xlsx'] }]
            });

            if (canceled) {
                return { success: false, message: '사용자가 내보내기를 취소했습니다.' };
            }

            if (!filePath) {
                throw new Error('유효하지 않은 파일 경로입니다.');
            }
            
            // 이 경로를 설정에 저장하여 다음에 사용
            configManager.updateConfig({ lastExcelExportPath: filePath });

            // 데이터베이스에서 모든 제품 가져오기
            const { products } = await getProductsFromDb(1, 10000); // 대량의 제품을 가져오기 위해 높은 limit 설정
            
            if (!products || products.length === 0) {
                throw new Error('내보낼 제품이 없습니다.');
            }

            console.log(`총 ${products.length}개의 제품 데이터 내보내기를 시작합니다.`);

            // 모든 제품 데이터의 키 결합 (일부 제품에만 있는 필드도 포함하기 위해)
            const allKeys = new Set<string>();
            products.forEach(product => {
                Object.keys(product).forEach(key => allKeys.add(key));
            });

            // 정렬된 헤더 배열 생성 (중요 필드가 앞에 오도록)
            const priorityFields = ['manufacturer', 'model', 'deviceType', 'certificateId', 'certificationDate', 'url', 'pageId', 'vid', 'pid'];
            const headers = Array.from(allKeys).sort((a, b) => {
                const aIndex = priorityFields.indexOf(a);
                const bIndex = priorityFields.indexOf(b);
                
                // 둘 다 우선 필드에 있으면 우선 필드 내 순서대로 정렬
                if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
                // a만 우선 필드에 있으면 a가 먼저
                if (aIndex !== -1) return -1;
                // b만 우선 필드에 있으면 b가 먼저
                if (bIndex !== -1) return 1;
                // 둘 다 우선 필드가 아니면 알파벳 순서대로
                return a.localeCompare(b);
            });
            
            // 엑셀용 배열 형식으로 제품 데이터 변환
            const worksheetData: any[][] = [];
            
            // 헤더 행 추가 (한글 번역 사용)
            const headerMap: Record<string, string> = {
                'manufacturer': '제조사',
                'model': '모델명',
                'deviceType': '장치 유형',
                'certificateId': '인증 ID',
                'certificationDate': '인증 날짜',
                'url': 'URL',
                'pageId': '페이지',
                'indexInPage': '페이지 내 인덱스',
                'vid': 'VID',
                'pid': 'PID',
                'familySku': '제품군 SKU',
                'familyVariantSku': '제품 변형 SKU',
                'firmwareVersion': '펌웨어 버전',
                'familyId': '제품군 ID',
                'tisTrpTested': 'TIS/TRP 테스트',
                'specificationVersion': '규격 버전',
                'transportInterface': '전송 인터페이스',
                'primaryDeviceTypeId': '기본 장치 유형 ID',
                'softwareVersion': '소프트웨어 버전',
                'hardwareVersion': '하드웨어 버전',
                'isNewProduct': '신규 제품 여부'
            };
            
            worksheetData.push(headers.map(header => headerMap[header] || header));
            
            // 데이터 행 추가 (타입 안전성을 고려한 방식)
            products.forEach(product => {
                const row: any[] = [];
                
                headers.forEach(header => {
                    let value: any = '';
                    
                    // 타입 안전하게 처리
                    if (header in product) {
                        value = (product as any)[header];
                        
                        // 특수 처리
                        if (header === 'certificationDate' && value) {
                            value = new Date(value).toISOString().split('T')[0];
                        } else if (header === 'pageId' && typeof value === 'number') {
                            value = value + 1; // UI와 일관되게 페이지 번호 표시
                        } else if (header === 'isNewProduct' && typeof value === 'boolean') {
                            value = value ? '예' : '아니오';
                        } else if (header === 'applicationCategories' && Array.isArray(value)) {
                            value = value.join(', ');
                        }
                    }
                    
                    row.push(value);
                });
                
                worksheetData.push(row);
            });

            // xlsx 패키지로 엑셀 파일 생성
            const workbook = XLSX.utils.book_new();
            const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
            
            // 헤더에 볼드체 스타일 적용
            const headerRange = XLSX.utils.decode_range(worksheet['!ref'] || "A1");
            headerRange.e.r = 0; // 첫 행만
            for (let col = headerRange.s.c; col <= headerRange.e.c; col++) {
                const cellRef = XLSX.utils.encode_cell({ r: 0, c: col });
                if (worksheet[cellRef]) {
                    worksheet[cellRef].s = { font: { bold: true } };
                }
            }
            
            // 열 너비 자동 조정 (컨텐츠에 따라 조정)
            const wscols = headers.map(header => {
                const headerLength = (headerMap[header] || header).length;
                // 헤더 길이를 기준으로 최소 너비 설정 (최소 8, 최대 30)
                return { wch: Math.min(Math.max(headerLength * 1.5, 8), 30) };
            });
            worksheet['!cols'] = wscols;
            
            XLSX.utils.book_append_sheet(workbook, worksheet, '제품 데이터');
            
            try {
                XLSX.writeFile(workbook, filePath);
                console.log(`Excel 파일이 성공적으로 내보내졌습니다: ${filePath}`);
                return { success: true, path: filePath };
            } catch (writeError) {
                console.error('[IPC] Error writing Excel file:', writeError);
                return { success: false, error: `파일 저장 중 오류 발생: ${String(writeError)}` };
            }
        } catch (error) {
            console.error('[IPC] Error exporting to Excel:', error);
            return { success: false, error: String(error) };
        }
    });

    ipcMain.handle(IPC_CHANNELS.CHECK_CRAWLING_STATUS, async (_event) => {
        console.log('[IPC] checkCrawlingStatus called');
        try {
            const status = await checkCrawlingStatus(); // await 추가하여 Promise가 resolve되도록 수정
            return { success: true, status };
        } catch (error) {
            console.error('[IPC] Error checking crawling status:', error);
            return { success: false, error: String(error) };
        }
    });

    // 설정 관련 핸들러 등록
    ipcMain.handle(IPC_CHANNELS.GET_CONFIG, async () => {
        console.log('[IPC] getConfig called');
        try {
            const config = configManager.getConfig();
            return { success: true, config };
        } catch (error) {
            console.error('[IPC] Error getting config:', error);
            return { success: false, error: String(error) };
        }
    });

    ipcMain.handle(IPC_CHANNELS.UPDATE_CONFIG, async (_event, partialConfig) => {
        console.log('[IPC] updateConfig called with:', partialConfig);
        try {
            const updatedConfig = configManager.updateConfig(partialConfig);
            return { success: true, config: updatedConfig };
        } catch (error) {
            console.error('[IPC] Error updating config:', error);
            return { success: false, error: String(error) };
        }
    });

    ipcMain.handle(IPC_CHANNELS.RESET_CONFIG, async () => {
        console.log('[IPC] resetConfig called');
        try {
            const resetConfig = configManager.resetConfig();
            return { success: true, config: resetConfig };
        } catch (error) {
            console.error('[IPC] Error resetting config:', error);
            return { success: false, error: String(error) };
        }
    });
    
    // 페이지 범위로 레코드 삭제 핸들러 추가
    ipcMain.handle(IPC_CHANNELS.DELETE_RECORDS_BY_PAGE_RANGE, async (_event, args) => {
        console.log('[BACKEND-IPC] deleteRecordsByPageRange 호출됨, args:', JSON.stringify(args));
        try {
            const { startPageId, endPageId } = args || {};
            
            if (typeof startPageId !== 'number' || typeof endPageId !== 'number') {
                console.error('[BACKEND-IPC] 오류: 시작 및 종료 페이지 ID가 숫자가 아님');
                throw new Error('시작 및 종료 페이지 ID가 숫자로 제공되어야 합니다.');
            }
            
            console.log(`[BACKEND-IPC] 삭제 범위 검증: startPageId=${startPageId}, endPageId=${endPageId}`);
            
            if (startPageId < endPageId) {
                console.error('[BACKEND-IPC] 오류: 시작 페이지가 종료 페이지보다 작음');
                throw new Error('시작 페이지 ID는 종료 페이지 ID보다 크거나 같아야 합니다.');
            }
            
            // 특별 케이스: 마지막 한 페이지 남은 경우 (startPageId === endPageId) 로그 추가
            if (startPageId === endPageId) {
                console.log(`[BACKEND-IPC] 마지막 한 페이지 삭제 시도 감지: pageId=${startPageId}`);
            }
            
            // 데이터베이스에서 페이지 범위로 레코드 삭제 함수 호출
            const deletedCount = await deleteProductsByPageRange(startPageId, endPageId);
            console.log(`[BACKEND-IPC] 데이터베이스에서 ${deletedCount}개 레코드 삭제됨`);
            
            // 삭제 후 최대 페이지 ID 조회
            const maxPageIdResult = await getMaxPageIdFromDb();
            console.log(`[BACKEND-IPC] 삭제 후 최대 페이지 ID: ${maxPageIdResult}`);
            
            return {
                success: true,
                deletedCount,
                maxPageId: maxPageIdResult
            };
        } catch (error) {
            console.error(`[BACKEND-IPC] deleteRecordsByPageRange 오류:`, error);
            return {
                success: false,
                deletedCount: 0,
                error: String(error)
            };
        }
    });

    // 제품 수동 저장 핸들러 추가
    ipcMain.handle(IPC_CHANNELS.SAVE_PRODUCTS_TO_DB, async (_event, products) => {
        console.log('[IPC] saveProductsToDB called with products count:', products?.length || 0);
        try {
            if (!products || !Array.isArray(products) || products.length === 0) {
                return {
                    success: false,
                    error: '저장할 제품이 없습니다.'
                };
            }
            
            const { saveProductsToDb } = await import('./database.js');
            const saveResult = await saveProductsToDb(products);
            
            console.log(`[IPC] Products saved to DB - Added: ${saveResult.added}, Updated: ${saveResult.updated}, Unchanged: ${saveResult.unchanged}, Failed: ${saveResult.failed}`);
            
            // 저장 결과 이벤트 발생 (UI 로 전달)
            return {
                success: true,
                ...saveResult
            };
        } catch (error) {
            console.error('[IPC] Error saving products to DB:', error);
            return {
                success: false,
                error: String(error)
            };
        }
    });
});

/**
 * 크롤러 이벤트를 UI로 전달하는 함수
 */
function setupCrawlerEvents(mainWindow: BrowserWindow): void {
    // 크롤링 진행 상태 이벤트
    crawlerEvents.on('crawlingProgress', (progress: CrawlingProgress) => {
        mainWindow.webContents.send('crawlingProgress', progress);
    });
    
    // 페이지별 병렬 작업 상태 이벤트 (추가)
    crawlerEvents.on('crawlingTaskStatus', (taskStatus: CrawlingTaskStatus) => {
        mainWindow.webContents.send('crawlingTaskStatus', taskStatus);
    });
    
    // 크롤링 중단 이벤트 (추가)
    crawlerEvents.on('crawlingStopped', (taskStatus: CrawlingTaskStatus) => {
        mainWindow.webContents.send('crawlingStopped', taskStatus);
    });
    
    // 크롤링 실패한 페이지 이벤트 (추가)
    crawlerEvents.on('crawlingFailedPages', (failedPages: FailedPageReport[]) => {
        mainWindow.webContents.send('crawlingFailedPages', failedPages);
    });
    
    // 크롤링 완료 이벤트
    crawlerEvents.on('crawlingComplete', (data: CrawlingResultReport) => {
        mainWindow.webContents.send('crawlingComplete', data);
    });
    
    // 크롤링 오류 이벤트
    crawlerEvents.on('crawlingError', (error: CrawlingError) => {
        mainWindow.webContents.send('crawlingError', error);
    });
    
    // DB 저장 완료 이벤트 (추가)
    crawlerEvents.on('dbSaveComplete', (data: any) => {
        console.log('[MAIN] DB Save Complete event received:', data);
        mainWindow.webContents.send('dbSaveComplete', data);
    });
    
    // DB 저장 스킵 이벤트 (추가)
    crawlerEvents.on('dbSaveSkipped', (data: any) => {
        console.log('[MAIN] DB Save Skipped event received:', data);
        mainWindow.webContents.send('dbSaveSkipped', data);
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
app.on('before-quit', (_event) => {
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
