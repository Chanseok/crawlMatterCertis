// Types for Matter Certification Collection Application
// 이 파일을 모듈로 만들기 위해 export 키워드를 추가합니다.

// Statistics 타입 정의 업데이트
export type Statistics = {
    timestamp: number;
    cpuUsage: number;
    memoryUsage: number;
    ramUsage?: number; // 이전 호환성을 위해 선택적으로 유지
    storageUsage?: number; // 이전 호환성을 위해 선택적으로 유지
};

// Matter 제품 정보 타입
export type MatterProduct = {
    url: string;
    pageId?: number;
    indexInPage?: number;
    id?: string;
    manufacturer?: string;
    model?: string;
    deviceType?: string;
    certificateId?: string;
    certificationDate?: string | Date;
    softwareVersion?: string;
    hardwareVersion?: string;
    vid?: string;
    pid?: string;
    familySku?: string;
    familyVariantSku?: string;
    firmwareVersion?: string;
    familyId?: string;
    tisTrpTested?: string;
    specificationVersion?: string;
    transportInterface?: string;
    primaryDeviceTypeId?: string;
    applicationCategories?: string[];
    // isNewProduct 필드 삭제됨
};

export type Product = {
    url: string;
    manufacturer?: string;
    model?: string;
    certificateId?: string;
    pageId?: number;
    indexInPage?: number;
};

// 크롤링 상태 타입 (통합)
export type CrawlingStatus = 
    | 'idle' 
    | 'running' 
    | 'paused' 
    | 'completed' 
    | 'error' 
    | 'initializing' 
    | 'stopped' 
    | 'completed_stage_1';

// 1단계 각 페이지 처리 상태
export type PageProcessingStatusValue = 'waiting' | 'attempting' | 'success' | 'failed' | 'incomplete';

export type PageProcessingStatusItem = {
    pageNumber: number;
    status: PageProcessingStatusValue;
    attempt?: number; // 현재 시도 횟수 (해당 페이지에 대해)
    
    // 시간 추적 관련 필드
    startTime?: number; // 페이지 처리 시작 시간
    endTime?: number;   // 페이지 처리 완료 시간
    processingTimeMs?: number; // 처리에 소요된 시간(밀리초)
};

// 크롤링 진행 상태 타입 (통합)
export type CrawlingProgress = {
    current: number; // 전체 진행률의 현재 값 (예: 총 처리 항목 수)
    total: number;   // 전체 진행률의 총 값 (예: 총 수집 대상 항목 수)
    percentage: number;
    currentStep: string;
    remainingTime?: number;
    elapsedTime: number;
    status?: CrawlingStatus;
    currentPage?: number;      // 1단계: 현재 처리/완료된 페이지 수, 2단계: 현재 처리/완료된 제품 수
    totalPages?: number;       // 1단계: 수집 대상 총 페이지 수, 2단계: 수집 대상 총 제품 수
    processedItems?: number; // 전체 단계에서 총 처리된 아이템 수 (페이지 또는 제품)
    totalItems?: number;     // 전체 단계에서 총 아이템 수 (페이지 또는 제품)
    startTime?: number;
    estimatedEndTime?: number;
    newItems?: number;
    updatedItems?: number;
    currentStage?: number; // 1=목록 수집, 2=상세정보 수집
    message?: string; 
    criticalError?: string; 
    
    retryCount?: number;      // 현재 스테이지의 총 재시도 횟수
    maxRetries?: number;      // 현재 스테이지의 최대 재시도 횟수
    retryItem?: string; 

    // 1단계 제품 목록 페이지 읽기 현황
    stage1PageStatuses?: PageProcessingStatusItem[];
};

// 크롤링 상태 요약 정보 타입
export type CrawlingStatusSummary = {
    dbLastUpdated: Date | null;
    dbProductCount: number;
    siteTotalPages: number;
    siteProductCount: number;
    diff: number;
    needCrawling: boolean;
    crawlingRange: { startPage: number; endPage: number };
    lastPageProductCount?: number; 
    selectedPageCount?: number; 
    estimatedProductCount?: number; 
    estimatedTotalTime?: number; 
    userPageLimit?: number; 
    error?: string; 
};

// 데이터베이스 요약 정보 타입
export type DatabaseSummary = {
    totalProducts: number;
    productCount: number;
    lastUpdated: Date | null;
    newlyAddedCount: number;
};

// 앱 모드 타입
export type AppMode = 'development' | 'production';

export type StaticData = {
    totalStorage: number;
    cpuModel: string;
    totalMemoryGB: number;
};

// 크롤러 설정 타입
export interface CrawlerConfig {
    // 기본 설정
    pageRangeLimit: number;
    productListRetryCount: number;
    productDetailRetryCount: number;
    headlessBrowser?: boolean; // Added headlessBrowser property
    
    // UI 관련 추가 설정
    maxConcurrentTasks?: number;
    requestDelay?: number;
    customUserAgent?: string;
    productsPerPage: number;
    
    // 엑셀 내보내기 관련 설정
    lastExcelExportPath?: string;  // 마지막으로 내보낸 엑셀 파일 경로
    
    // DB 관련 설정
    autoAddToLocalDB: boolean;  // 수집 성공 시 자동으로 로컬DB에 추가 여부
    
    // 크롤러 코어 관련 설정 (선택적으로 만들어 호환성 유지)
    baseUrl?: string;
    matterFilterUrl?: string;
    pageTimeoutMs?: number;
    productDetailTimeoutMs?: number;
    
    // 성능 측정 및 예측 관련 설정
    averagePageProcessingTimeMs?: number; // 평균 페이지 처리 시간 (밀리초)
    initialConcurrency?: number;
    detailConcurrency?: number;
    retryConcurrency?: number;
    minRequestDelayMs?: number;
    maxRequestDelayMs?: number;
    retryStart?: number;
    retryMax?: number;
    cacheTtlMs?: number;
}

// 동시 처리 작업 상태 타입
export type ConcurrentTaskStatus = 'pending' | 'running' | 'success' | 'error' | 'stopped' | 'waiting' | 'attempting' | 'failed' | 'incomplete';
export type ConcurrentCrawlingTask = {
    pageNumber: number;
    status: ConcurrentTaskStatus;
    startedAt?: number;
    finishedAt?: number;
    error?: string;
};

// 이벤트 페이로드 맵핑 확장
export type EventPayloadMapping = {
    statistics: Statistics;
    getStaticData: StaticData;
    crawlingProgress: CrawlingProgress;
    crawlingComplete: { success: boolean; count: number };
    crawlingError: { message: string; details?: string };
    dbSummary: DatabaseSummary;
    products: MatterProduct[];
    crawlingTaskStatus: ConcurrentCrawlingTask[];
    crawlingStopped: ConcurrentCrawlingTask[];
    crawlingFailedPages: { pageNumber: number; errors: string[] }[];
    dbSaveError: { error?: string }; 
    dbSaveComplete: { success: boolean }; // <-- Add this line
    dbSaveSkipped: any; // <-- Add this if you use 'dbSaveSkipped' elsewhere
};

// 메서드 매개변수 맵핑
export type MethodParamsMapping = {
    'startCrawling': { mode: AppMode; config?: CrawlerConfig };
    'stopCrawling': void;
    'exportToExcel': { path?: string };
    'getProducts': { search?: string; page?: number; limit?: number };
    'getProductById': string;
    'searchProducts': { query: string; page?: number; limit?: number };
    'getDatabaseSummary': void;
    'getStaticData': void;
    'markLastUpdated': number;
    'checkCrawlingStatus': void;
    // 설정 관련 메서드 추가
    'crawler:get-config': void;
    'crawler:update-config': Partial<CrawlerConfig>;
    'crawler:reset-config': void;
    // 페이지 범위로 레코드 삭제 기능 추가
    'deleteRecordsByPageRange': { startPageId: number; endPageId: number };
    // 제품 수동 저장 메서드 추가
    'saveProductsToDB': MatterProduct[];
};

// 메서드 반환값 맵핑
export type MethodReturnMapping = {
    'startCrawling': { success: boolean };
    'stopCrawling': { success: boolean };
    'exportToExcel': { success: boolean; path?: string };
    'getProducts': { products: MatterProduct[]; total: number; maxPageId?: number };
    'getProductById': MatterProduct | null;
    'searchProducts': { products: MatterProduct[]; total: number };
    'getDatabaseSummary': DatabaseSummary;
    'getStaticData': StaticData;
    'markLastUpdated': void;
    'checkCrawlingStatus': { success: boolean; status?: CrawlingStatusSummary; error?: string };
    // 설정 관련 메서드 반환 타입 추가
    'crawler:get-config': { success: boolean; config?: CrawlerConfig; error?: string };
    'crawler:update-config': { success: boolean; config?: CrawlerConfig; error?: string };
    'crawler:reset-config': { success: boolean; config?: CrawlerConfig; error?: string };
    // 페이지 범위로 레코드 삭제 기능 반환 타입 추가
    'deleteRecordsByPageRange': { success: boolean; deletedCount: number; maxPageId?: number; error?: string };
    // 제품 수동 저장 메서드 반환 타입 추가
    'saveProductsToDB': { 
        success: boolean; 
        added?: number; 
        updated?: number; 
        unchanged?: number; 
        failed?: number; 
        error?: string;
        duplicateInfo?: any;
    };
};

export type UnsubscribeFunction = () => void;

// 플랫폼 독립적인 API 인터페이스
export interface IPlatformAPI {
    // 구독 기반 API
    subscribeToEvent<K extends keyof EventPayloadMapping>(
        eventName: K, 
        callback: (data: EventPayloadMapping[K]) => void
    ): UnsubscribeFunction;
    
    // 요청-응답 기반 API
    invokeMethod<K extends keyof MethodParamsMapping, R = MethodReturnMapping[K]>(
        methodName: K,
        params?: MethodParamsMapping[K]
    ): Promise<R>;
}

// 구현체는 실제 구현에서 각 플랫폼별 API로 연결됩니다
export interface IElectronAPI extends IPlatformAPI {
    // 구독 메서드
    subscribeStatistics: (callback: (statistics: Statistics) => void) => UnsubscribeFunction;
    subscribeCrawlingProgress: (callback: (progress: CrawlingProgress) => void) => UnsubscribeFunction;
    subscribeCrawlingComplete: (callback: (data: EventPayloadMapping['crawlingComplete']) => void) => UnsubscribeFunction;
    subscribeCrawlingError: (callback: (data: EventPayloadMapping['crawlingError']) => void) => UnsubscribeFunction;
    subscribeCrawlingTaskStatus: (callback: (tasks: ConcurrentCrawlingTask[]) => void) => UnsubscribeFunction;
    subscribeCrawlingStopped: (callback: (tasks: ConcurrentCrawlingTask[]) => void) => UnsubscribeFunction;
    subscribeCrawlingFailedPages: (callback: (failedPages: EventPayloadMapping['crawlingFailedPages']) => void) => UnsubscribeFunction;
    subscribeDbSummary: (callback: (data: DatabaseSummary) => void) => UnsubscribeFunction;
    subscribeProducts: (callback: (products: MatterProduct[]) => void) => UnsubscribeFunction;
    
    // 호출 메서드
    getStaticData: () => Promise<StaticData>;
    startCrawling: (params: MethodParamsMapping['startCrawling']) => Promise<MethodReturnMapping['startCrawling']>;
    stopCrawling: () => Promise<MethodReturnMapping['stopCrawling']>;
    exportToExcel: (params: MethodParamsMapping['exportToExcel']) => Promise<MethodReturnMapping['exportToExcel']>;
    getProducts: (params: MethodParamsMapping['getProducts']) => Promise<MethodReturnMapping['getProducts']>;
    getProductById: (id: MethodParamsMapping['getProductById']) => Promise<MethodReturnMapping['getProductById']>;
    getDatabaseSummary: () => Promise<MethodReturnMapping['getDatabaseSummary']>;
    checkCrawlingStatus: () => Promise<MethodReturnMapping['checkCrawlingStatus']>;
    searchProducts: (params: MethodParamsMapping['searchProducts']) => Promise<MethodReturnMapping['searchProducts']>;
    markLastUpdated: (timestamp: MethodParamsMapping['markLastUpdated']) => Promise<MethodReturnMapping['markLastUpdated']>;
    
    // 설정 관련 메서드 추가
    getConfig: () => Promise<MethodReturnMapping['crawler:get-config']>;
    updateConfig: (config: MethodParamsMapping['crawler:update-config']) => Promise<MethodReturnMapping['crawler:update-config']>;
    resetConfig: (config: MethodParamsMapping['crawler:reset-config']) => Promise<MethodReturnMapping['crawler:reset-config']>;
    
    // 페이지 범위로 레코드 삭제 메서드 추가
    deleteRecordsByPageRange: (params: MethodParamsMapping['deleteRecordsByPageRange']) => Promise<MethodReturnMapping['deleteRecordsByPageRange']>;
}

// Window 인터페이스 확장은 글로벌로 유지
declare global {
    interface Window {
        electron: IElectronAPI;
    }
}

// 모듈로서 이 파일을 다루도록 빈 export 추가
export {};