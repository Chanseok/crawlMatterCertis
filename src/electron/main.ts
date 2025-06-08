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
    getVendors,
    getBasicProducts
} from './database.js';
import { startCrawling, stopCrawling, checkCrawlingStatus } from './crawler/index.js';
import { crawlerEvents } from './crawler/utils/progress.js';
// 진행 상황 관리자 추가
import { ProgressManager } from './progress/ProgressManager.js';
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
    IMPORT_FROM_EXCEL: 'importFromExcel',
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
    TEST_BATCH_UI: 'testBatchUI',
    
    // Gap Detection 관련 채널 추가
    DETECT_GAPS: 'detectGaps',
    COLLECT_GAPS: 'collectGaps',
    EXECUTE_GAP_BATCH_COLLECTION: 'executeGapBatchCollection',
    
    // Missing Product 관련 채널 추가
    ANALYZE_MISSING_PRODUCTS: 'analyzeMissingProducts',
    CRAWL_MISSING_PRODUCTS: 'crawlMissingProducts',
    CALCULATE_PAGE_RANGES: 'calculatePageRanges'
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
            sandbox: false
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
            const defaultFileName = `matter-localdb_${dateStr}.xlsx`;
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
                title: 'LocalDB Excel로 내보내기',
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

            // 워크북 생성
            const workbook = XLSX.utils.book_new();
            
            // 1. Product Details 시트 생성
            log.info('[Excel Export] Fetching product details data...');
            const { products } = await getProductsFromDb(1, 10000);
            
            if (products && products.length > 0) {
                console.log(`총 ${products.length}개의 제품 상세 데이터를 내보냅니다.`);
                
                // 모든 제품 데이터의 키 결합 (일부 제품에만 있는 필드도 포함하기 위해)
                const allKeys = new Set<string>();
                products.forEach(product => {
                    Object.keys(product).forEach(key => allKeys.add(key));
                });

                // 정렬된 헤더 배열 생성 (중요 필드가 앞에 오도록)
                const priorityFields = ['manufacturer', 'model', 'deviceType', 'certificateId', 'certificationDate', 'url', 'pageId', 'vid', 'pid'];
                const productDetailsHeaders = Array.from(allKeys).sort((a, b) => {
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
                const productDetailsData: any[][] = [];
                
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
                
                productDetailsData.push(productDetailsHeaders.map(header => headerMap[header] || header));
                
                // 데이터 행 추가 (타입 안전성을 고려한 방식)
                products.forEach(product => {
                    const row: any[] = [];
                    
                    productDetailsHeaders.forEach(header => {
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
                    
                    productDetailsData.push(row);
                });

                const productDetailsWorksheet = XLSX.utils.aoa_to_sheet(productDetailsData);
                
                // 헤더에 볼드체 스타일 적용
                const productDetailsRange = XLSX.utils.decode_range(productDetailsWorksheet['!ref'] || "A1");
                productDetailsRange.e.r = 0; // 첫 행만
                for (let col = productDetailsRange.s.c; col <= productDetailsRange.e.c; col++) {
                    const cellRef = XLSX.utils.encode_cell({ r: 0, c: col });
                    if (productDetailsWorksheet[cellRef]) {
                        productDetailsWorksheet[cellRef].s = { font: { bold: true } };
                    }
                }
                
                // 열 너비 자동 조정
                const productDetailsWscols = productDetailsHeaders.map(header => {
                    const headerLength = (headerMap[header] || header).length;
                    return { wch: Math.min(Math.max(headerLength * 1.5, 8), 30) };
                });
                productDetailsWorksheet['!cols'] = productDetailsWscols;
                
                XLSX.utils.book_append_sheet(workbook, productDetailsWorksheet, 'Product Details');
            }

            // 2. Products 시트 생성 (기본 제품 정보)
            log.info('[Excel Export] Fetching basic products data...');
            try {
                const basicProducts = await getBasicProducts();

                if (basicProducts.length > 0) {
                    console.log(`총 ${basicProducts.length}개의 기본 제품 데이터를 내보냅니다.`);
                    
                    const basicProductsData: any[][] = [];
                    const basicProductsHeaders = ['URL', '제조사', '모델명', '인증 ID', '페이지', '페이지 내 인덱스'];
                    basicProductsData.push(basicProductsHeaders);
                    
                    basicProducts.forEach(product => {
                        basicProductsData.push([
                            product.url || '',
                            product.manufacturer || '',
                            product.model || '',
                            product.certificateId || '',
                            (product.pageId || 0) + 1, // UI와 일관되게 페이지 번호 표시
                            product.indexInPage || 0
                        ]);
                    });

                    const basicProductsWorksheet = XLSX.utils.aoa_to_sheet(basicProductsData);
                    
                    // 헤더에 볼드체 스타일 적용
                    const basicProductsRange = XLSX.utils.decode_range(basicProductsWorksheet['!ref'] || "A1");
                    basicProductsRange.e.r = 0;
                    for (let col = basicProductsRange.s.c; col <= basicProductsRange.e.c; col++) {
                        const cellRef = XLSX.utils.encode_cell({ r: 0, c: col });
                        if (basicProductsWorksheet[cellRef]) {
                            basicProductsWorksheet[cellRef].s = { font: { bold: true } };
                        }
                    }
                    
                    // 열 너비 조정
                    basicProductsWorksheet['!cols'] = [
                        { wch: 50 }, // URL
                        { wch: 20 }, // 제조사
                        { wch: 25 }, // 모델명
                        { wch: 15 }, // 인증 ID
                        { wch: 8 },  // 페이지
                        { wch: 12 }  // 페이지 내 인덱스
                    ];
                    
                    XLSX.utils.book_append_sheet(workbook, basicProductsWorksheet, 'Products');
                }
            } catch (error) {
                log.warn('[Excel Export] Failed to fetch basic products:', error);
            }

            // 3. Vendors 시트 생성
            log.info('[Excel Export] Fetching vendors data...');
            try {
                const vendors = await getVendors();
                
                if (vendors.length > 0) {
                    console.log(`총 ${vendors.length}개의 벤더 데이터를 내보냅니다.`);
                    
                    const vendorsData: any[][] = [];
                    const vendorsHeaders = ['벤더 ID', '벤더명', '회사 법적 명칭'];
                    vendorsData.push(vendorsHeaders);
                    
                    vendors.forEach(vendor => {
                        vendorsData.push([
                            vendor.vendorId || '',
                            vendor.vendorName || '',
                            vendor.companyLegalName || ''
                        ]);
                    });

                    const vendorsWorksheet = XLSX.utils.aoa_to_sheet(vendorsData);
                    
                    // 헤더에 볼드체 스타일 적용
                    const vendorsRange = XLSX.utils.decode_range(vendorsWorksheet['!ref'] || "A1");
                    vendorsRange.e.r = 0;
                    for (let col = vendorsRange.s.c; col <= vendorsRange.e.c; col++) {
                        const cellRef = XLSX.utils.encode_cell({ r: 0, c: col });
                        if (vendorsWorksheet[cellRef]) {
                            vendorsWorksheet[cellRef].s = { font: { bold: true } };
                        }
                    }
                    
                    // 열 너비 조정
                    vendorsWorksheet['!cols'] = [
                        { wch: 10 }, // 벤더 ID
                        { wch: 25 }, // 벤더명
                        { wch: 30 }  // 회사 법적 명칭
                    ];
                    
                    XLSX.utils.book_append_sheet(workbook, vendorsWorksheet, 'Vendors');
                }
            } catch (error) {
                log.warn('[Excel Export] Failed to fetch vendors:', error);
            }
            
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

    ipcMain.handle(IPC_CHANNELS.IMPORT_FROM_EXCEL, async (_event, args) => {
        log.info('[IPC] importFromExcel called with args:', args);
        try {
            // 파일 선택 대화상자 표시
            const { canceled, filePaths } = await dialog.showOpenDialog({
                title: 'Excel 파일 가져오기',
                defaultPath: app.getPath('downloads'),
                filters: [{ name: 'Excel 파일', extensions: ['xlsx', 'xls'] }],
                properties: ['openFile']
            });

            if (canceled || !filePaths || filePaths.length === 0) {
                return { success: false, message: '사용자가 가져오기를 취소했습니다.' };
            }

            const filePath = filePaths[0];
            
            if (!fs.existsSync(filePath)) {
                throw new Error('선택된 파일이 존재하지 않습니다.');
            }

            log.info(`[Excel Import] Reading file: ${filePath}`);
            
            // 엑셀 파일 읽기
            const workbook = XLSX.readFile(filePath);
            const sheetNames = workbook.SheetNames;
            
            log.info(`[Excel Import] Found sheets: ${sheetNames.join(', ')}`);
            
            let importedCount = 0;
            let errors: string[] = [];

            // Product Details 시트 처리 (우선순위)
            if (sheetNames.includes('Product Details')) {
                try {
                    const worksheet = workbook.Sheets['Product Details'];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                    
                    if (jsonData.length > 1) { // 헤더 제외하고 데이터가 있는지 확인
                        const headers = jsonData[0] as string[];
                        const rows = jsonData.slice(1) as any[][];
                        
                        // 헤더 매핑 (한글 -> 영문)
                        const headerMap: Record<string, string> = {
                            '제조사': 'manufacturer',
                            '모델명': 'model',
                            '장치 유형': 'deviceType',
                            '인증 ID': 'certificateId',
                            '인증 날짜': 'certificationDate',
                            'URL': 'url',
                            '페이지': 'pageId',
                            '페이지 내 인덱스': 'indexInPage',
                            'VID': 'vid',
                            'PID': 'pid',
                            '제품군 SKU': 'familySku',
                            '제품 변형 SKU': 'familyVariantSku',
                            '펌웨어 버전': 'firmwareVersion',
                            '제품군 ID': 'familyId',
                            'TIS/TRP 테스트': 'tisTrpTested',
                            '규격 버전': 'specificationVersion',
                            '전송 인터페이스': 'transportInterface',
                            '기본 장치 유형 ID': 'primaryDeviceTypeId',
                            '소프트웨어 버전': 'softwareVersion',
                            '하드웨어 버전': 'hardwareVersion',
                            '신규 제품 여부': 'isNewProduct'
                        };
                        
                        // 제품 데이터 변환
                        const products = rows.map((row, rowIndex) => {
                            const product: any = {};
                            
                            headers.forEach((header, colIndex) => {
                                const englishKey = headerMap[header] || header;
                                let value = row[colIndex];
                                
                                // 데이터 타입 변환
                                if (englishKey === 'pageId' && typeof value === 'number') {
                                    value = value - 1; // UI에서는 1부터 시작하지만 DB에서는 0부터 시작
                                } else if (englishKey === 'certificationDate' && value) {
                                    // 날짜 형식 정규화
                                    if (typeof value === 'string') {
                                        const date = new Date(value);
                                        if (!isNaN(date.getTime())) {
                                            value = date.toISOString();
                                        }
                                    }
                                } else if (englishKey === 'isNewProduct') {
                                    value = value === '예' || value === true;
                                } else if (englishKey === 'applicationCategories' && typeof value === 'string') {
                                    value = value.split(',').map(s => s.trim()).filter(s => s);
                                }
                                
                                if (value !== undefined && value !== null && value !== '') {
                                    product[englishKey] = value;
                                }
                            });
                            
                            // 필수 필드 검증
                            if (!product.url || !product.manufacturer || !product.model) {
                                errors.push(`Row ${rowIndex + 2}: 필수 필드 누락 (URL, 제조사, 모델명)`);
                                return null;
                            }
                            
                            // ID 및 타임스탬프 추가
                            product.id = product.id || crypto.randomUUID();
                            product.createdAt = new Date().toISOString();
                            product.updatedAt = new Date().toISOString();
                            
                            return product;
                        }).filter(p => p !== null);
                        
                        // 데이터베이스에 저장
                        if (products.length > 0) {
                            log.info(`[Excel Import] Saving ${products.length} products to database`);
                            const { saveProductsToDb } = await import('./database.js');
                            const saveResult = await saveProductsToDb(products);
                            
                            importedCount += saveResult.added + saveResult.updated;
                            log.info(`[Excel Import] Successfully saved ${products.length} products - Added: ${saveResult.added}, Updated: ${saveResult.updated}`);
                        }
                    }
                } catch (sheetError) {
                    log.error('[Excel Import] Error processing Product Details sheet:', sheetError);
                    errors.push(`Product Details 시트 처리 중 오류: ${String(sheetError)}`);
                }
            }
            // Products 시트 처리 (fallback)
            else if (sheetNames.includes('Products')) {
                try {
                    const worksheet = workbook.Sheets['Products'];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                    
                    if (jsonData.length > 1) { // 헤더 제외하고 데이터가 있는지 확인
                        const headers = jsonData[0] as string[];
                        const rows = jsonData.slice(1) as any[][];
                        
                        const headerMap: Record<string, string> = {
                            'URL': 'url',
                            '제조사': 'manufacturer',
                            '모델명': 'model',
                            '인증 ID': 'certificateId',
                            '페이지': 'pageId',
                            '페이지 내 인덱스': 'indexInPage'
                        };
                        
                        const products = rows.map((row, rowIndex) => {
                            const product: any = {};
                            
                            headers.forEach((header, colIndex) => {
                                const englishKey = headerMap[header] || header;
                                let value = row[colIndex];
                                
                                if (englishKey === 'pageId' && typeof value === 'number') {
                                    value = value - 1; // UI에서는 1부터 시작하지만 DB에서는 0부터 시작
                                }
                                
                                if (value !== undefined && value !== null && value !== '') {
                                    product[englishKey] = value;
                                }
                            });
                            
                            if (!product.url || !product.manufacturer || !product.model) {
                                errors.push(`Row ${rowIndex + 2}: 필수 필드 누락 (URL, 제조사, 모델명)`);
                                return null;
                            }
                            
                            product.id = product.id || crypto.randomUUID();
                            product.createdAt = new Date().toISOString();
                            product.updatedAt = new Date().toISOString();
                            
                            return product;
                        }).filter(p => p !== null);
                        
                        if (products.length > 0) {
                            log.info(`[Excel Import] Saving ${products.length} basic products to database`);
                            const { saveBasicProductsToDb } = await import('./database.js');
                            const savedCount = await saveBasicProductsToDb(products);
                            
                            importedCount += savedCount;
                            log.info(`[Excel Import] Successfully saved ${savedCount} basic products`);
                        }
                    }
                } catch (sheetError) {
                    log.error('[Excel Import] Error processing Products sheet:', sheetError);
                    errors.push(`Products 시트 처리 중 오류: ${String(sheetError)}`);
                }
            } else {
                errors.push('Product Details 또는 Products 시트를 찾을 수 없습니다.');
            }

            // 결과 반환
            const result = {
                success: importedCount > 0,
                importedCount,
                errors,
                message: importedCount > 0 
                    ? `${importedCount}개의 제품을 성공적으로 가져왔습니다.`
                    : '가져온 제품이 없습니다.'
            };
            
            if (errors.length > 0) {
                result.message += ` (${errors.length}개의 오류 발생)`;
                log.warn('[Excel Import] Errors occurred:', errors);
            }
            
            log.info(`[Excel Import] Import completed: ${JSON.stringify(result)}`);
            return result;
            
        } catch (error) {
            log.error('[IPC] Error importing from Excel:', error);
            return { 
                success: false, 
                error: String(error), 
                importedCount: 0,
                errors: [String(error)]
            };
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
    
    // Gap Detection 핸들러
    ipcMain.handle(IPC_CHANNELS.DETECT_GAPS, async (_event, args) => {
        log.info('[IPC] detectGaps called with args:', args);
        try {
            const { GapDetector } = await import('./crawler/gap-detector.js');
            const { config } = args || {};
            
            const result = await GapDetector.detectMissingProducts(config);
            
            log.info(`[IPC] Gap detection complete - ${result.totalMissingProducts} missing products found`);
            
            return {
                success: true,
                result
            };
        } catch (error) {
            log.error('[IPC] Error detecting gaps:', error);
            return {
                success: false,
                error: String(error)
            };
        }
    });
    
    ipcMain.handle(IPC_CHANNELS.COLLECT_GAPS, async (_event, args) => {
        log.info('[IPC] collectGaps called with args:', args);
        try {
            const { GapCollector } = await import('./crawler/gap-collector.js');
            const { BrowserManager } = await import('./crawler/browser/BrowserManager.js');
            const { PageCrawler } = await import('./crawler/tasks/page-crawler.js');
            const { gapResult, options } = args || {};
            
            if (!gapResult) {
                throw new Error('Gap detection result is required for collection');
            }
            
            // 실제 크롤러 시스템 초기화
            const config = configManager.getConfig();
            const browserManager = new BrowserManager(config);
            
            try {
                await browserManager.initialize();
                
                if (!await browserManager.isValid()) {
                    throw new Error('Failed to initialize browser manager for gap collection');
                }
                
                // PageCrawler 인스턴스 생성 (실제 크롤링 수행을 위해)
                const pageCrawler = new PageCrawler(browserManager, config);
                
                log.info(`[IPC] Starting gap collection with ${gapResult.totalMissingProducts} missing products`);
                
                // 확장된 갭 수집 옵션 확인
                const useExtendedCollection = options?.useExtendedCollection || false;
                
                let result;
                if (useExtendedCollection) {
                    log.info('[IPC] Using extended gap collection (with context pages)');
                    result = await GapCollector.collectMissingProductsWithContext(gapResult, pageCrawler, options);
                } else {
                    log.info('[IPC] Using standard gap collection');
                    result = await GapCollector.collectMissingProducts(gapResult, pageCrawler, options);
                }
                
                log.info(`[IPC] Gap collection complete - ${result.collected} products collected, ${result.failed} failed`);
                
                return {
                    success: true,
                    result
                };
                
            } finally {
                // 브라우저 리소스 정리
                await browserManager.close();
            }
            
        } catch (error) {
            log.error('[IPC] Error collecting gaps:', error);
            return {
                success: false,
                error: {
                    message: error instanceof Error ? error.message : String(error),
                    code: 'GAP_COLLECTION_FAILED'
                }
            };
        }
    });
    
    // Gap Batch Collection 핸들러 - 새로운 배치 처리 시스템 사용
    ipcMain.handle(IPC_CHANNELS.EXECUTE_GAP_BATCH_COLLECTION, async (_event, args) => {
        log.info('[IPC] executeGapBatchCollection called with args:', args);
        try {
            const GapBatchProcessor = (await import('./crawler/gap-batch-processor.js')).default;
            const { config } = args || {};
            
            // 크롤러 설정 가져오기 (인자로 전달된 설정이 없으면 기본 설정 사용)
            const crawlerConfig = config || configManager.getConfig();
            
            // Ensure matterFilterUrl is explicitly set in the config
            if (!crawlerConfig.matterFilterUrl) {
                crawlerConfig.matterFilterUrl = 'https://csa-iot.org/csa-iot_products/?p_keywords=&p_type%5B%5D=14&p_program_type%5B%5D=1049&p_certificate=&p_family=&p_firmware_ver=';
            }
            
            // Gap Batch Processor 인스턴스 생성
            const gapBatchProcessor = new GapBatchProcessor();
            
            log.info('[IPC] Starting Gap Batch Collection with derived crawling ranges...');
            
            // 배치 처리 실행 전 설정 로깅
            log.info(`[IPC] Gap Batch Collection starting with config:`, {
                baseUrl: crawlerConfig.baseUrl,
                matterFilterUrl: crawlerConfig.matterFilterUrl,
                pageRangeLimit: crawlerConfig.pageRangeLimit
            });
            
            // 배치 처리 실행 (내부에서 Gap Detection + 파생된 범위로 Gap Collection 수행)
            const batchResult = await gapBatchProcessor.executeGapCollectionInBatches(crawlerConfig);
            
            if (batchResult.success) {
                log.info(`[IPC] Gap Batch Collection complete - Detection: ${batchResult.gapResult?.totalMissingProducts || 0} missing, Collection: ${batchResult.collectionResult?.collected || 0} collected`);
                
                // If we detected gaps but collected 0 products, log a warning
                if (batchResult.gapResult?.totalMissingProducts && batchResult.gapResult.totalMissingProducts > 0 && 
                    batchResult.collectionResult?.collected === 0) {
                    log.warn(`[IPC] Warning: Detected ${batchResult.gapResult.totalMissingProducts} missing products but collected 0. This may indicate an issue with the crawler configuration or page structure.`);
                }
            } else {
                log.error(`[IPC] Gap Batch Collection failed: ${batchResult.error}`);
            }
            
            return {
                success: batchResult.success,
                gapResult: batchResult.gapResult,
                collectionResult: batchResult.collectionResult,
                error: batchResult.error
            };
            
        } catch (error) {
            log.error('[IPC] Error executing gap batch collection:', error);
            return {
                success: false,
                error: {
                    message: error instanceof Error ? error.message : String(error),
                    code: 'GAP_BATCH_COLLECTION_FAILED'
                }
            };
        }
    });
    
    // Missing Product Analysis 핸들러
    ipcMain.handle(IPC_CHANNELS.ANALYZE_MISSING_PRODUCTS, async (_event) => {
        log.info('[IPC] analyzeMissingProducts called');
        try {
            const { MissingDataAnalyzer } = await import('./services/MissingDataAnalyzer.js');
            
            log.info('[IPC] Starting missing product analysis...');
            
            // 누락 데이터 분석 실행 - 올바른 메서드명 사용
            const analyzer = new MissingDataAnalyzer();
            const analysis = await analyzer.analyzeTableDifferences();
            
            log.info(`[IPC] Missing product analysis complete - Total missing details: ${analysis.totalMissingDetails}, Total incomplete pages: ${analysis.totalIncompletePages}`);
            
            return {
                success: true,
                data: analysis
            };
            
        } catch (error) {
            log.error('[IPC] Error analyzing missing products:', error);
            return {
                success: false,
                error: {
                    message: error instanceof Error ? error.message : String(error),
                    code: 'MISSING_ANALYSIS_FAILED'
                }
            };
        }
    });
    
    // Page Range Calculation 핸들러
    ipcMain.handle(IPC_CHANNELS.CALCULATE_PAGE_RANGES, async (_event, incompletePageIds) => {
        log.info('[IPC] calculatePageRanges called with page IDs:', incompletePageIds);
        try {
            const { MissingPageCalculator } = await import('./services/MissingPageCalculator.js');
            const calculator = new MissingPageCalculator();
            
            // 페이지 범위 계산 (매개변수 없이 호출)
            const result = await calculator.calculateCrawlingRanges();
            
            // 사용자 친화적인 텍스트로 변환
            const formattedText = calculator.formatRangesForDisplay(result.pageRanges);
            
            log.info(`[IPC] Page ranges calculated: ${result.pageRanges.length} ranges, total incomplete pages: ${result.totalIncompletePages}`);
            
            return {
                success: true,
                data: {
                    ...result,
                    formattedText
                }
            };
            
        } catch (error) {
            log.error('[IPC] Error calculating page ranges:', error);
            return {
                success: false,
                error: {
                    message: error instanceof Error ? error.message : String(error),
                    code: 'PAGE_RANGE_CALCULATION_FAILED'
                }
            };
        }
    });
    
    // Missing Product Crawling 핸들러
    ipcMain.handle(IPC_CHANNELS.CRAWL_MISSING_PRODUCTS, async (_event, args) => {
        log.info('[IPC] crawlMissingProducts called with args:', args);
        try {
            const { analysisResult, config: userConfig } = args || {};
            
            if (!analysisResult) {
                throw new Error('Analysis result is required for missing product crawling');
            }
            
            log.info(`[IPC] Starting missing product collection for ${analysisResult.missingDetails?.length || 0} missing details and ${analysisResult.incompletePages?.length || 0} incomplete pages`);
            
            // Get crawler configuration
            const config = userConfig || configManager.getConfig();
            
            let results = {
                success: true,
                missingDetailsCollected: 0,
                pageRangesCrawled: 0,
                message: ''
            };
            
            // Part 1: Collect missing product details (Stage 3 crawling for specific products)
            if (analysisResult.missingDetails && analysisResult.missingDetails.length > 0) {
                log.info(`[IPC] Collecting details for ${analysisResult.missingDetails.length} missing products`);
                
                const { ProductDetailCollector } = await import('./crawler/tasks/productDetail.js');
                const { CrawlerState } = await import('./crawler/core/CrawlerState.js');
                const { BrowserManager } = await import('./crawler/browser/BrowserManager.js');
                
                // Convert missing products to Product objects that ProductDetailCollector expects
                const productsToCollect = analysisResult.missingDetails.map(missing => ({
                    url: missing.url,
                    manufacturer: missing.manufacturer || 'Unknown',
                    model: missing.model || 'Unknown',
                    productName: missing.productName || '',
                    imageUrl: missing.imageUrl || '',
                    categories: missing.categories || [],
                    dbPageId: missing.dbPageId || 0,
                    sitePageNumber: missing.sitePageNumber || 0
                }));
                
                // Initialize crawler state and browser manager
                const crawlerState = new CrawlerState();
                const abortController = new AbortController();
                const browserManager = new BrowserManager(config);
                
                // Create ProductDetailCollector instance
                const detailCollector = new ProductDetailCollector(
                    crawlerState,
                    abortController,
                    config,
                    browserManager
                );
                
                try {
                    log.info(`[IPC] Starting detail collection for ${productsToCollect.length} products`);
                    const collectedProducts = await detailCollector.collect(productsToCollect);
                    
                    results.missingDetailsCollected = collectedProducts.length;
                    log.info(`[IPC] Successfully collected details for ${collectedProducts.length} products`);
                    
                    // Save collected products to database if auto-save is enabled
                    if (config.autoAddToLocalDB && collectedProducts.length > 0) {
                        const { saveProductsToDb } = await import('./database.js');
                        const saveResult = await saveProductsToDb(collectedProducts);
                        log.info(`[IPC] Saved to database: ${saveResult.added} new, ${saveResult.updated} updated`);
                    }
                    
                } catch (detailError) {
                    const errorMessage = detailError instanceof Error ? detailError.message : String(detailError);
                    log.error('[IPC] Error collecting missing product details:', detailError);
                    results.success = false;
                    results.message += `Detail collection failed: ${errorMessage}. `;
                } finally {
                    // Cleanup resources
                    if (browserManager) {
                        await browserManager.close();
                    }
                }
            }
            
            // Part 2: Crawl incomplete pages (if any)
            if (analysisResult.incompletePages && analysisResult.incompletePages.length > 0) {
                log.info(`[IPC] Processing ${analysisResult.incompletePages.length} incomplete pages`);
                
                const { MissingPageCalculator } = await import('./services/MissingPageCalculator.js');
                const { CrawlerEngine } = await import('./crawler/core/CrawlerEngine.js');
                
                // Use provided incompletePages data instead of recalculating from database
                const calculator = new MissingPageCalculator();
                const rangeCalculationResult = calculator.convertIncompletePagesToRanges(analysisResult.incompletePages);
                
                if (rangeCalculationResult.pageRanges.length > 0) {
                    log.info(`[IPC] Converted ${rangeCalculationResult.pageRanges.length} crawling ranges from provided incomplete pages`);
                    
                    const crawlerEngine = new CrawlerEngine();
                    const pageSuccess = await crawlerEngine.crawlMissingProductPages(rangeCalculationResult.pageRanges, config);
                    
                    results.pageRangesCrawled = rangeCalculationResult.pageRanges.length;
                    
                    if (!pageSuccess) {
                        results.success = false;
                        results.message += 'Page range crawling failed. ';
                    }
                } else {
                    log.info(`[IPC] No crawling ranges generated from ${analysisResult.incompletePages.length} incomplete pages`);
                }
            }
            
            // Construct final message
            if (results.success) {
                const parts: string[] = [];
                if (results.missingDetailsCollected > 0) {
                    parts.push(`${results.missingDetailsCollected} missing product details collected`);
                }
                if (results.pageRangesCrawled > 0) {
                    parts.push(`${results.pageRangesCrawled} page ranges crawled`);
                }
                results.message = parts.length > 0 ? `Successfully completed: ${parts.join(', ')}` : 'No missing data to collect';
            }
            
            log.info(`[IPC] Missing product collection completed: ${results.message}`);
            
            return results;
            
        } catch (error) {
            log.error('[IPC] Error crawling missing products:', error);
            return {
                success: false,
                missingDetailsCollected: 0,
                pageRangesCrawled: 0,
                error: {
                    message: error instanceof Error ? error.message : String(error),
                    code: 'MISSING_CRAWLING_FAILED'
                }
            };
        }
    });
});

/**
 * 크롤러 이벤트를 UI로 전달하는 함수
 */
function setupCrawlerEvents(mainWindow: BrowserWindow): void {
    console.log(`[MAIN] Setting up crawler events...`);
    console.log(`[MAIN] crawlerEvents object:`, crawlerEvents);
    console.log(`[MAIN] crawlerEvents listeners count:`, crawlerEvents.listenerCount('crawlingProgress'));
    
    // 진행 관리자 인스턴스 생성
    const progressManager = new ProgressManager((progress: CrawlingProgress) => {
        if (mainWindow && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
            mainWindow.webContents.send('crawlingProgress', progress);
        }
    });
    
    // 크롤링 진행 상태 이벤트
    crawlerEvents.on('crawlingProgress', (progress: CrawlingProgress) => {
        const logMessage = `[MAIN] Received crawlingProgress event: stage=${progress.currentStage}, step="${progress.currentStep}", message="${progress.message}", progress=${progress.current}/${progress.total}`;
        log.info(logMessage);
        console.log(logMessage); // 콘솔에도 출력
        
        // ProgressManager를 통한 업데이트 전송
        progressManager.throttledSend('crawlingProgress', progress);
    });
    
    console.log(`[MAIN] crawlingProgress listener registered. Total listeners:`, crawlerEvents.listenerCount('crawlingProgress'));
    
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
