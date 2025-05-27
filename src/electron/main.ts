import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { isDev } from './util.js';
import path from 'path';
import fs from 'fs';
import XLSX from 'xlsx';
import { getStaticData, pollResources } from './resourceManager.js';
import { getPreloadPath, getUIPath } from './pathResolver.js';
import log from './logger.js';
import {
    initializeDatabase,
    getProductsFromDb,
    getProductByIdFromDb,
    searchProductsInDb,
    getDatabaseSummaryFromDb,
    markLastUpdatedInDb,
    deleteProductsByPageRange,
    getMaxPageIdFromDb,
    fetchAndUpdateVendors,
    getVendors
} from './database.js';
import { startCrawling, stopCrawling, checkCrawlingStatus } from './crawler/index.js';
import { crawlerEvents } from './crawler/utils/progress.js';
// UI 타입이 아닌 공유 타입 사용
import type { AppMode, CrawlingProgress } from '../../types.js';
import type { FailedPageReport, CrawlingResultReport } from './crawler/utils/types.js';
import { configManager } from './ConfigManager.js';
// 배치 UI 테스트용 모듈 추가
import { simulateBatchProcessing } from './crawler/test/batch-ui-test.js';
// 배치 UI 테스트 기능 추가
import { setupBatchUITestHandlers } from './test/batch-ui-test-integrator.js';

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
    GET_CONFIG_PATH: 'crawler:get-config-path',
    UPDATE_CONFIG: 'crawler:update-config',
    RESET_CONFIG: 'crawler:reset-config',
    
    // 레코드 삭제 채널 추가
    DELETE_RECORDS_BY_PAGE_RANGE: 'deleteRecordsByPageRange',
    
    // 제품 수동 저장 채널 추가
    SAVE_PRODUCTS_TO_DB: 'saveProductsToDB',
    
    // Vendor 관련 채널 추가
    FETCH_AND_UPDATE_VENDORS: 'fetchAndUpdateVendors',
    GET_VENDORS: 'getVendors',
    
    // 배치 처리 UI 테스트 채널 추가
    TEST_BATCH_UI: 'testBatchUI'
};

app.on('ready', async () => {
    // 디버깅을 위해 preload 경로 로깅
    const preloadPath = getPreloadPath();
    log.info('Using preload script path:', preloadPath);
    log.info('File exists check will be in main process logs');

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
        log.info('Main window close event triggered');
        
        // 실행 중인 크롤링 작업이 있다면 중지 시도
        stopCrawling();
        
        // 메인 윈도우가 닫힐 때 앱 종료 준비
        prepareForAppTermination();
    });

    // Initialize the database first
    try {
        await initializeDatabase();
        log.info('Database initialized successfully.');
        
        // 배치 UI 테스트 핸들러 설정
        setupBatchUITestHandlers();
        log.info('Batch UI test handlers initialized.');
    } catch (error) {
        log.error('Failed to initialize database:', error);
        app.quit();
        return;
    }

    // getUIPath 함수 반환값에 따라 loadURL 또는 loadFile 호출
    const uiPath = getUIPath();
    if (uiPath.startsWith('http')) {
        log.info('Loading URL:', uiPath);
        mainWindow.loadURL(uiPath);
    } else {
        log.info('Loading file:', uiPath);
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
        log.info('[IPC] getProducts called with args:', args);
        const { page, limit } = args || {};
        return await getProductsFromDb(page, limit);
    });

    ipcMain.handle(IPC_CHANNELS.GET_PRODUCT_BY_ID, async (_event, id) => {
        log.info('[IPC] getProductById called with id:', id);
        return await getProductByIdFromDb(id);
    });

    ipcMain.handle(IPC_CHANNELS.SEARCH_PRODUCTS, async (_event, args) => {
        log.info('[IPC] searchProducts called with args:', args);
        const { query, page, limit } = args || {};
        return await searchProductsInDb(query, page, limit);
    });

    ipcMain.handle(IPC_CHANNELS.GET_DATABASE_SUMMARY, async (_event) => {
        log.info('[IPC] getDatabaseSummary called');
        return await getDatabaseSummaryFromDb();
    });

    ipcMain.handle(IPC_CHANNELS.MARK_LAST_UPDATED, async (_event, count) => {
        log.info('[IPC] markLastUpdated called with count:', count);
        return await markLastUpdatedInDb(count);
    });

    // 크롤링 핸들러
    ipcMain.handle(IPC_CHANNELS.START_CRAWLING, async (_event, args) => {
        // 매개변수 디버깅 로깅 추가
        log.info('[IPC] startCrawling called with args (raw):', args);
        log.info('[IPC] startCrawling args type:', typeof args);
        
        // 안전한 매개변수 처리
        let mode: AppMode = 'development'; // 기본값
        
        try {
            if (args && typeof args === 'object') {
                if ('mode' in args) {
                    mode = args.mode as AppMode;
                }
                // 설정 데이터 추출 및 업데이트
                if ('config' in args && args.config) {
                    const newConfig = args.config;
                    log.info('[IPC] Updating config from UI:', JSON.stringify(newConfig));
                    
                    // autoAddToLocalDB 값 명시적 로깅
                    if (newConfig.autoAddToLocalDB !== undefined) {
                        log.info(`[IPC] autoAddToLocalDB setting from UI: ${newConfig.autoAddToLocalDB}`);
                    }
                    configManager.updateConfig(newConfig); // Update central config store
                }
            }
        } catch (err) {
            log.error('[IPC] Error parsing startCrawling args or updating config:', err);
            // Optionally, return an error if config update itself fails critically
        }
        
        // 항상 최신 설정 적용 보장
        const currentConfigForCrawling = configManager.getConfig();
        log.info(`[IPC] Start crawling requested in ${mode} mode with effective config:`, currentConfigForCrawling);
        
        try {
            // 항상 시작 전 상태 확인 수행
            // '상태 체크'를 누르지 않고 '크롤링'을 누르는 경우에도
            // 사이트 로컬 비교 패널에 올바른 정보를 표시하기 위함
            log.info('[IPC] Performing mandatory status check before crawling...');
            let statusSummary;
            try {
                statusSummary = await checkCrawlingStatus();
                log.info('[IPC] Pre-crawling status check completed successfully');
                // 상태 정보가 UI로 전송될 수 있도록 이벤트 발생
                // 이 이벤트는 UI에서 사이트 로컬 비교 패널 업데이트에 사용됨
                crawlerEvents.emit('crawlingStatusSummary', statusSummary);
            } catch (statusError) {
                log.error('[IPC] Error during mandatory pre-crawling status check:', statusError);
                // 상태 체크에 실패해도 크롤링 자체는 진행시킴
                // 하지만 이런 경우는 크롤링 범위 파악에 오류가 발생할 수 있음
            }
            
            // 크롤링 시작 - 내부에서도 checkCrawlingStatus 호출하지만
            // 이미 위에서 호출했으므로 내부에서는 캐시된 정보를 활용할 것임
            const currentConfig = configManager.getConfig();
            const success = await startCrawling(currentConfig);
            // 상태 체크 결과를 함께 반환
            return { success, status: statusSummary };
        } catch (error) {
            log.error('[IPC] Error during crawling:', error);
            return { success: false, error: String(error) };
        }
    });

    ipcMain.handle(IPC_CHANNELS.STOP_CRAWLING, async (_event) => {
        log.info('[IPC] stopCrawling called');
        try {
            const success = stopCrawling();
            return { success };
        } catch (error) {
            log.error('[IPC] Error stopping crawling:', error);
            return { success: false, error: String(error) };
        }
    });

    ipcMain.handle(IPC_CHANNELS.EXPORT_TO_EXCEL, async (_event, args) => {
        log.info('[IPC] exportToExcel called with args:', args);
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
                log.info(`Excel 파일이 성공적으로 내보내졌습니다: ${filePath}`);
                return { success: true, path: filePath };
            } catch (writeError) {
                log.error('[IPC] Error writing Excel file:', writeError);
                return { success: false, error: `파일 저장 중 오류 발생: ${String(writeError)}` };
            }
        } catch (error) {
            log.error('[IPC] Error exporting to Excel:', error);
            return { success: false, error: String(error) };
        }
    });

    ipcMain.handle(IPC_CHANNELS.CHECK_CRAWLING_STATUS, async (_event) => {
        log.info('[IPC] checkCrawlingStatus called');
        try {
            const status = await checkCrawlingStatus(); // await 추가하여 Promise가 resolve되도록 수정
            
            // 상태 정보가 UI로 전송될 수 있도록 이벤트 발생
            // 이 이벤트는 UI에서 사이트 로컬 비교 패널 업데이트에 사용됨
            crawlerEvents.emit('crawlingStatusSummary', status);
            log.info('[IPC] crawlingStatusSummary event emitted with status:', JSON.stringify(status));
            
            return { success: true, status };
        } catch (error) {
            log.error('[IPC] Error checking crawling status:', error);
            return { success: false, error: String(error) };
        }
    });

    // 설정 관련 핸들러 등록
    ipcMain.handle(IPC_CHANNELS.GET_CONFIG, async () => {
        log.info('[IPC] getConfig called');
        try {
            const config = configManager.getConfig();
            return { success: true, config };
        } catch (error) {
            log.error('[IPC] Error getting config:', error);
            return { success: false, error: String(error) };
        }
    });

    ipcMain.handle(IPC_CHANNELS.UPDATE_CONFIG, async (_event, partialConfig) => {
        log.info('[IPC] updateConfig called with:', JSON.stringify(partialConfig, null, 2));
        try {
            // 입력 검증
            if (!partialConfig || typeof partialConfig !== 'object') {
                throw new Error('Invalid config data: must be an object');
            }
            
            // 설정 업데이트 전에 현재 설정 로깅
            const beforeConfig = configManager.getConfig();
            log.info('[IPC] Current config before update:', JSON.stringify(beforeConfig, null, 2));
            
            // 설정 업데이트 수행
            const updatedConfig = configManager.updateConfig(partialConfig);
            
            // 업데이트 후 설정 로깅
            log.info('[IPC] Config updated successfully:', JSON.stringify(updatedConfig, null, 2));
            
            // 특정 중요 설정 변경사항 로깅
            const changedKeys = Object.keys(partialConfig);
            log.info(`[IPC] Changed config keys: ${changedKeys.join(', ')}`);
            
            // autoAddToLocalDB 설정 변경 시 특별 로깅
            if ('autoAddToLocalDB' in partialConfig) {
                log.info(`[IPC] autoAddToLocalDB setting updated: ${beforeConfig.autoAddToLocalDB} -> ${updatedConfig.autoAddToLocalDB}`);
            }
            
            return { success: true, config: updatedConfig };
        } catch (error) {
            log.error('[IPC] Error updating config:', error);
            log.error('[IPC] Partial config that caused error:', JSON.stringify(partialConfig, null, 2));
            return { success: false, error: String(error) };
        }
    });

    ipcMain.handle(IPC_CHANNELS.RESET_CONFIG, async () => {
        log.info('[IPC] resetConfig called');
        try {
            const resetConfig = configManager.resetConfig();
            return { success: true, config: resetConfig };
        } catch (error) {
            log.error('[IPC] Error resetting config:', error);
            return { success: false, error: String(error) };
        }
    });

    ipcMain.handle(IPC_CHANNELS.GET_CONFIG_PATH, async () => {
        log.info('[IPC] getConfigPath called');
        try {
            const configPath = configManager.getConfigPath();
            return { success: true, configPath };
        } catch (error) {
            log.error('[IPC] Error getting config path:', error);
            return { success: false, error: String(error) };
        }
    });
    
    // 페이지 범위로 레코드 삭제 핸들러 추가
    ipcMain.handle(IPC_CHANNELS.DELETE_RECORDS_BY_PAGE_RANGE, async (_event, args) => {
        log.info('[BACKEND-IPC] deleteRecordsByPageRange 호출됨, args:', JSON.stringify(args));
        try {
            const { startPageId, endPageId } = args || {};
            
            if (typeof startPageId !== 'number' || typeof endPageId !== 'number') {
                log.error('[BACKEND-IPC] 오류: 시작 및 종료 페이지 ID가 숫자가 아님');
                throw new Error('시작 및 종료 페이지 ID가 숫자로 제공되어야 합니다.');
            }
            
            log.info(`[BACKEND-IPC] 삭제 범위 검증: startPageId=${startPageId}, endPageId=${endPageId}`);
            
            if (startPageId < endPageId) {
                log.error('[BACKEND-IPC] 오류: 시작 페이지가 종료 페이지보다 작음');
                throw new Error('시작 페이지 ID는 종료 페이지 ID보다 크거나 같아야 합니다.');
            }
            
            // 특별 케이스: 마지막 한 페이지 남은 경우 (startPageId === endPageId) 로그 추가
            if (startPageId === endPageId) {
                log.info(`[BACKEND-IPC] 마지막 한 페이지 삭제 시도 감지: pageId=${startPageId}`);
            }
            
            // 데이터베이스에서 페이지 범위로 레코드 삭제 함수 호출
            const deletedCount = await deleteProductsByPageRange(startPageId, endPageId);
            log.info(`[BACKEND-IPC] 데이터베이스에서 ${deletedCount}개 레코드 삭제됨`);
            
            // 삭제 후 최대 페이지 ID 조회
            const maxPageIdResult = await getMaxPageIdFromDb();
            log.info(`[BACKEND-IPC] 삭제 후 최대 페이지 ID: ${maxPageIdResult}`);
            
            return {
                success: true,
                deletedCount,
                maxPageId: maxPageIdResult
            };
        } catch (error) {
            log.error(`[BACKEND-IPC] deleteRecordsByPageRange 오류:`, error);
            return {
                success: false,
                deletedCount: 0,
                error: String(error)
            };
        }
    });

    // 제품 수동 저장 핸들러 추가
    ipcMain.handle(IPC_CHANNELS.SAVE_PRODUCTS_TO_DB, async (_event, products) => {
        log.info('[IPC] saveProductsToDB called with products count:', products?.length || 0);
        try {
            if (!products || !Array.isArray(products) || products.length === 0) {
                return {
                    success: false,
                    error: '저장할 제품이 없습니다.'
                };
            }
            
            const { saveProductsToDb } = await import('./database.js');
            const saveResult = await saveProductsToDb(products);
            
            log.info(`[IPC] Products saved to DB - Added: ${saveResult.added}, Updated: ${saveResult.updated}, Unchanged: ${saveResult.unchanged}, Failed: ${saveResult.failed}`);
            
            // 저장 결과 이벤트 발생 (UI 로 전달)
            return {
                success: true,
                ...saveResult
            };
        } catch (error) {
            log.error('[IPC] Error saving products to DB:', error);
            return {
                success: false,
                error: String(error)
            };
        }
    });

    // Vendor 관련 IPC 핸들러
    ipcMain.handle(IPC_CHANNELS.FETCH_AND_UPDATE_VENDORS, async (_event) => {
        log.info('[IPC] fetchAndUpdateVendors called');
        try {
            const result = await fetchAndUpdateVendors();
            log.info(`[IPC] fetchAndUpdateVendors result: ${result.added} added, ${result.updated} updated, total ${result.total}`);
            return result;
        } catch (error) {
            log.error('[IPC] Error fetching and updating vendors:', error);
            return {
                success: false,
                added: 0,
                updated: 0,
                total: 0,
                error: String(error)
            };
        }
    });

    ipcMain.handle(IPC_CHANNELS.GET_VENDORS, async (_event) => {
        log.info('[IPC] getVendors called');
        try {
            const vendors = await getVendors();
            log.info(`[IPC] getVendors returned ${vendors.length} vendors`);
            return { 
                success: true, 
                vendors 
            };
        } catch (error) {
            log.error('[IPC] Error getting vendors:', error);
            return { 
                success: false, 
                vendors: [],
                error: String(error)
            };
        }
    });
    
    // 배치 처리 UI 테스트 핸들러
    ipcMain.handle(IPC_CHANNELS.TEST_BATCH_UI, async (_event, args) => {
        log.info('[IPC] testBatchUI called with args:', args);
        try {
            const { batchCount = 5, delayMs = 2000 } = args || {};
            
            // 배치 처리 UI 테스트 시작 (비동기 실행)
            simulateBatchProcessing(batchCount, delayMs)
                .catch(err => log.error('[IPC] Error during batch UI test:', err));
                
            return {
                success: true,
                message: `배치 처리 UI 테스트가 시작되었습니다. (${batchCount}개 배치, ${delayMs}ms 지연)`
            };
        } catch (error) {
            log.error('[IPC] Error starting batch UI test:', error);
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
        log.info('[MAIN] DB Save Complete event received:', data);
        mainWindow.webContents.send('dbSaveComplete', data);
    });
    
    // DB 저장 스킵 이벤트 (추가)
    crawlerEvents.on('dbSaveSkipped', (data: any) => {
        log.info('[MAIN] DB Save Skipped event received:', data);
        mainWindow.webContents.send('dbSaveSkipped', data);
    });
    
    // 크롤링 상태 요약 이벤트 (사이트 로컬 비교 패널용)
    crawlerEvents.on('crawlingStatusSummary', (statusSummary: any) => {
        log.info('[MAIN] Crawling Status Summary event received:', statusSummary);
        mainWindow.webContents.send('crawlingStatusSummary', statusSummary);
    });
}

// 앱 종료 준비 함수
function prepareForAppTermination(): void {
    log.info('Preparing for app termination...');
    
    try {
        // 실행 중인 크롤링 작업 중지 시도
        stopCrawling();
        
        // 기타 실행 중인 프로세스나 리소스 정리
        // 예: 데이터베이스 연결 해제, 임시 파일 정리 등
        log.info('Cleanup completed successfully');
    } catch (error) {
        log.error('Error during app termination cleanup:', error);
    }
}

// 앱이 종료되기 직전 이벤트
app.on('before-quit', (_event) => {
    log.info('Before-quit event triggered');
    
    // 종료 전 정리 작업 수행
    prepareForAppTermination();
});

// Quit when all windows are closed (modified to also quit on macOS)
app.on('window-all-closed', () => {
    // 모든 창이 닫힐 때 앱을 완전히 종료 (macOS에서도)
    log.info('All windows closed, quitting application');
    app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        // Re-create the main window on macOS when app icon is clicked and no windows are open
    }
});
