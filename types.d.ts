// Types for Matter Certification Collection Application
// 이 파일을 모듈로 만들기 위해 export 키워드를 추가합니다.

/**
 * 시스템 자원 사용 통계를 나타내는 타입
 * 
 * @typedef {Object} Statistics
 * @property {number} timestamp - 통계 데이터가 생성된 시간(밀리초 단위 Unix timestamp)
 * @property {number} cpuUsage - CPU 사용량(백분율, 0-100)
 * @property {number} memoryUsage - 메모리 사용량(바이트)
 * @property {number} [ramUsage] - 이전 버전 호환성을 위한 RAM 사용량(백분율)
 * @property {number} [storageUsage] - 이전 버전 호환성을 위한 스토리지 사용량(바이트)
 */
export type Statistics = {
    timestamp: number;
    cpuUsage: number;
    memoryUsage: number;
    ramUsage?: number; // 이전 호환성을 위해 선택적으로 유지
    storageUsage?: number; // 이전 호환성을 위해 선택적으로 유지
};

/**
 * Matter 인증 제품의 상세 정보를 나타내는 타입
 * 
 * @typedef {Object} MatterProduct
 * @property {string} url - 제품 상세 페이지의 고유 URL (식별자로 사용)
 * @property {number} [pageId] - 제품이 위치한 목록 페이지 번호
 * @property {number} [indexInPage] - 페이지 내에서의 제품 인덱스
 * @property {string} [id] - 제품 고유 식별자
 * @property {string} [manufacturer] - 제조사 이름
 * @property {string} [model] - 모델명
 * @property {string} [deviceType] - 장치 유형
 * @property {string} [certificateId] - Matter 인증 ID
 * @property {string|Date} [certificationDate] - 인증 날짜
 * @property {string} [softwareVersion] - 소프트웨어 버전
 * @property {string} [hardwareVersion] - 하드웨어 버전
 * @property {string} [vid] - 벤더 ID
 * @property {string} [pid] - 제품 ID
 * @property {string} [familySku] - 제품군 SKU
 * @property {string} [familyVariantSku] - 제품군 변형 SKU
 * @property {string} [firmwareVersion] - 펌웨어 버전
 * @property {string} [familyId] - 제품군 ID
 * @property {string} [tisTrpTested] - Thread/TRP 테스트 여부
 * @property {string} [specificationVersion] - Matter 스펙 버전
 * @property {string} [transportInterface] - 지원하는 전송 인터페이스
 * @property {string} [primaryDeviceTypeId] - 주 장치 유형 ID
 * @property {string[]} [applicationCategories] - 적용 카테고리 목록
 */
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

/**
 * Matter 인증 제품의 기본 정보(목록용)를 나타내는 타입
 * 주로 제품 목록 페이지에서 수집되는 기본 정보를 포함
 * 
 * @typedef {Object} Product
 * @property {string} url - 제품 상세 페이지의 고유 URL (식별자로 사용)
 * @property {string} [manufacturer] - 제조사 이름
 * @property {string} [model] - 모델명
 * @property {string} [certificateId] - Matter 인증 ID
 * @property {number} [pageId] - 제품이 위치한 목록 페이지 번호
 * @property {number} [indexInPage] - 페이지 내에서의 제품 인덱스
 */
export type Product = {
    url: string;
    manufacturer?: string;
    model?: string;
    certificateId?: string;
    pageId?: number;
    indexInPage?: number;
};

/**
 * 크롤링 작업의 전체 상태를 나타내는 열거형 타입
 * 
 * @typedef {string} CrawlingStatus
 * @property {'idle'} idle - 대기 상태, 작업이 시작되지 않음
 * @property {'running'} running - 실행 중 상태
 * @property {'paused'} paused - 일시 정지 상태
 * @property {'completed'} completed - 작업 완료 상태
 * @property {'error'} error - 오류 발생 상태
 * @property {'initializing'} initializing - 초기화 중 상태
 * @property {'stopped'} stopped - 사용자 요청 또는 오류로 중지됨
 * @property {'completed_stage_1'} completed_stage_1 - 1단계(목록 수집) 완료 상태
 */
export type CrawlingStatus = 
    | 'idle' 
    | 'running' 
    | 'paused' 
    | 'completed' 
    | 'error' 
    | 'initializing' 
    | 'stopped' 
    | 'completed_stage_1';

/**
 * 크롤링 단계를 세부적으로 나타내는 열거형 타입
 * 
 * @typedef {string} CrawlingStage
 */
export type CrawlingStage = 
    | 'idle' 
    | 'productList:init' 
    | 'productList:collecting' 
    | 'productList:retrying' 
    | 'productList:complete'
    | 'validation:init'
    | 'validation:processing'
    | 'validation:complete'
    | 'productDetail:init' 
    | 'productDetail:collecting' 
    | 'productDetail:retrying' 
    | 'productDetail:complete'
    | 'complete' 
    | 'error';

/**
 * 개별 페이지 처리 상태 값을 나타내는 열거형 타입
 * 
 * @typedef {string} PageProcessingStatusValue
 * @property {'waiting'} waiting - 페이지가 처리 대기 중
 * @property {'attempting'} attempting - 페이지 처리 시도 중
 * @property {'success'} success - 페이지 처리 성공
 * @property {'failed'} failed - 페이지 처리 실패
 * @property {'incomplete'} incomplete - 페이지가 부분적으로 처리됨(예: 일부 제품만 처리됨)
 */
export type PageProcessingStatusValue = 'waiting' | 'attempting' | 'success' | 'failed' | 'incomplete';

/**
 * 개별 페이지의 처리 상태 정보를 나타내는 타입
 * 
 * @typedef {Object} PageProcessingStatusItem
 * @property {number} pageNumber - 페이지 번호
 * @property {PageProcessingStatusValue} status - 페이지 처리 상태
 * @property {number} [attempt] - 현재 시도 횟수 (해당 페이지에 대해)
 */
export type PageProcessingStatusItem = {
    pageNumber: number;
    status: PageProcessingStatusValue;
    attempt?: number; // 현재 시도 횟수 (해당 페이지에 대해)
};

/**
 * 크롤링 작업의 진행 상태를 나타내는 종합적인 타입
 * UI에 표시되는 진행 정보와 내부 상태 관리에 사용됨
 * 
 * @typedef {Object} CrawlingProgress
 * @property {number} current - 전체 진행률의 현재 값 (예: 총 처리 항목 수)
 * @property {number} total - 전체 진행률의 총 값 (예: 총 수집 대상 항목 수)
 * @property {number} percentage - 진행률 백분율 (0-100)
 * @property {string} currentStep - 현재 진행 중인 단계에 대한 설명
 * @property {number} [remainingTime] - 예상 남은 시간 (밀리초)
 * @property {number} elapsedTime - 경과 시간 (밀리초)
 * @property {CrawlingStatus} [status] - 현재 크롤링 상태
 * @property {number} [currentPage] - 1단계: 현재 처리/완료된 페이지 수, 2단계: 현재 처리/완료된 제품 수
 * @property {number} [totalPages] - 1단계: 수집 대상 총 페이지 수, 2단계: 수집 대상 총 제품 수
 * @property {number} [processedItems] - 전체 단계에서 총 처리된 아이템 수 (페이지 또는 제품)
 * @property {number} [totalItems] - 전체 단계에서 총 아이템 수 (페이지 또는 제품)
 * @property {number} [startTime] - 크롤링 시작 시간 (밀리초 단위 timestamp)
 * @property {number} [estimatedEndTime] - 예상 완료 시간 (밀리초 단위 timestamp)
 * @property {number} [newItems] - 새로 추가된 항목 수
 * @property {number} [updatedItems] - 업데이트된 항목 수
 * @property {number} [currentStage] - 현재 크롤링 단계 (1=목록 수집, 2=상세정보 수집)
 * @property {string} [message] - 현재 상태에 대한 메시지
 * @property {string} [criticalError] - 치명적 오류 메시지
 * @property {number} [retryCount] - 현재 스테이지의 총 재시도 횟수
 * @property {number} [maxRetries] - 현재 스테이지의 최대 재시도 횟수
 * @property {string} [retryItem] - 현재 재시도 중인 항목 식별자
 * @property {PageProcessingStatusItem[]} [stage1PageStatuses] - 1단계 제품 목록 페이지 읽기 현황
 * @property {number} [currentBatch] - 현재 처리 중인 배치 번호
 * @property {number} [totalBatches] - 총 배치 수
 * @property {number} [batchRetryCount] - 현재 배치의 재시도 횟수
 * @property {number} [batchRetryLimit] - 배치 최대 재시도 횟수
 */
export type CrawlingProgress = {
    current: number; 
    total: number;   
    percentage: number;
    currentStep: string;
    remainingTime?: number;
    elapsedTime: number;
    status?: CrawlingStatus;
    currentPage?: number;      
    totalPages?: number;       
    processedItems?: number; 
    totalItems?: number;     
    startTime?: number;
    estimatedEndTime?: number;
    newItems?: number;
    updatedItems?: number;
    currentStage?: number; 
    message?: string; 
    criticalError?: string; 
    
    retryCount?: number;      
    maxRetries?: number;      
    retryItem?: string; 

    // 1단계 제품 목록 페이지 읽기 현황
    stage1PageStatuses?: PageProcessingStatusItem[];
    
    // 배치 처리 정보
    currentBatch?: number;     
    totalBatches?: number;     
    batchRetryCount?: number;  
    batchRetryLimit?: number;  

    // 1.5단계 검증 정보
    validationSummary?: ValidationSummary;
    rangeRecommendations?: string[];
    
    // 현재 크롤링 단계 (세분화된 상태)
    stage?: CrawlingStage;
};

/**
 * 로컬DB 상태 체크 결과를 나타내는 타입
 * 1.5단계에서 제품 검증 및 필터링 결과를 포함
 * 
 * @typedef {Object} ValidationSummary
 * @property {number} totalProducts - 1단계에서 수집한 총 제품 수
 * @property {number} newProducts - DB에 존재하지 않는 새로운 제품 수
 * @property {number} existingProducts - 이미 DB에 존재하는 제품 수
 * @property {number} duplicateProducts - 1단계 수집 중에 발견된 중복 제품 수
 * @property {number} skipRatio - 건너뛰게 될 제품의 비율 (백분율)
 * @property {number} duplicateRatio - 중복 제품의 비율 (백분율)
 */
export type ValidationSummary = {
    totalProducts: number;
    newProducts: number;
    existingProducts: number;
    duplicateProducts: number;
    skipRatio: number;
    duplicateRatio: number;
};

/**
 * 크롤링 상태 체크 결과를 요약하는 타입
 * 서버와 로컬 데이터 비교 분석 결과를 포함
 * 
 * @typedef {Object} CrawlingStatusSummary
 * @property {Date|null} dbLastUpdated - 로컬 DB의 마지막 업데이트 시간
 * @property {number} dbProductCount - 로컬 DB에 저장된 제품 수
 * @property {number} [siteTotalPages] - 사이트에서 가져온 총 페이지 수
 * @property {number} siteProductCount - 사이트에서 확인된 총 제품 수
 * @property {number} diff - 로컬 DB와 사이트 간의 제품 수 차이 (양수: 사이트에 더 많음, 음수: DB에 더 많음)
 * @property {boolean} needCrawling - 크롤링이 필요한지 여부
 * @property {{startPage: number, endPage: number}} crawlingRange - 크롤링이 필요한 페이지 범위
 * @property {number} [lastPageProductCount] - 마지막 페이지의 제품 수
 * @property {number} [selectedPageCount] - 사용자가 선택한 페이지 수
 * @property {number} [estimatedProductCount] - 예상 수집 제품 수
 * @property {number} [estimatedTotalTime] - 예상 총 소요 시간(밀리초)
 * @property {number} [userPageLimit] - 사용자가 설정한 페이지 제한
 * @property {string} [error] - 상태 체크 중 발생한 오류 메시지
 * @property {number} [actualTargetPageCountForStage1] - 1단계 실제 크롤링 대상 페이지 수
 */
export type CrawlingStatusSummary = {
    dbLastUpdated: Date | null;
    dbProductCount: number;
    siteTotalPages?: number;
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
    actualTargetPageCountForStage1?: number;
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

/**
 * 크롤러의 동작을 제어하는 설정 인터페이스
 * 
 * @typedef {Object} CrawlerConfig
 * @property {number} pageRangeLimit - 한 번에 크롤링할 최대 페이지 수 (권장: 1-50)
 * @property {number} productListRetryCount - 제품 목록 수집 실패 시 최대 재시도 횟수 (권장: 1-5)
 * @property {number} productDetailRetryCount - 제품 상세 정보 수집 실패 시 최대 재시도 횟수 (권장: 1-3)
 * @property {boolean} [headlessBrowser] - 헤드리스 모드로 브라우저 실행 여부 (true: 화면 표시 없음, false: 브라우저 표시)
 * @property {'playwright'|'axios'} [crawlerType] - 크롤러 전략 유형 ('playwright': 브라우저 기반, 'axios': HTTP 요청 기반)
 * @property {number} [maxConcurrentTasks] - 동시에 실행할 최대 크롤링 작업 수 (권장: 1-10)
 * @property {number} [requestDelay] - 요청 간 지연 시간(밀리초) (권장: 100-2000)
 * @property {string} [customUserAgent] - 사용자 정의 User-Agent 문자열
 * @property {number} [requestTimeout] - 요청 제한 시간(밀리초)
 * @property {boolean} [validateSSL] - SSL 인증서 유효성 검사 여부
 * @property {boolean} [enableBatchProcessing] - 배치 처리 활성화 여부
 * @property {number} [batchSize] - 배치당 처리할 항목 수
 * @property {number} [maxBatchRetries] - 배치 실패 시 최대 재시도 횟수
 */
export interface CrawlerConfig {
    // 기본 설정
    pageRangeLimit: number;
    productListRetryCount: number;
    productDetailRetryCount: number;
    headlessBrowser?: boolean;
    crawlerType?: 'playwright' | 'axios';
    
    // UI 관련 추가 설정
    maxConcurrentTasks?: number;
    requestDelay?: number;
    customUserAgent?: string;
    
    // 확장 속성 (새 필드 추가)
    requestTimeout?: number;
    validateSSL?: boolean;
    enableBatchProcessing?: boolean;
    batchSize?: number;
    maxBatchRetries?: number;
    productsPerPage: number;
    
    // 배치 처리 관련 설정
    batchSize?: number;          // 배치당 페이지 수 (기본값: 30)
    batchDelayMs?: number;       // 배치 간 지연 시간 (ms) (기본값: 2000)
    enableBatchProcessing?: boolean; // 배치 처리 활성화 여부 (기본값: true)
    batchRetryLimit?: number;    // 배치 실패 시 재시도 횟수 (기본값: 3)
    
    // 엑셀 내보내기 관련 설정
    lastExcelExportPath?: string;  // 마지막으로 내보낸 엑셀 파일 경로
    
    // DB 관련 설정
    autoAddToLocalDB: boolean;  // 수집 성공 시 자동으로 로컬DB에 추가 여부
    
    // 크롤러 코어 관련 설정 (선택적으로 만들어 호환성 유지)
    baseUrl?: string;
    matterFilterUrl?: string;
    pageTimeoutMs?: number;
    productDetailTimeoutMs?: number;
    initialConcurrency?: number;
    detailConcurrency?: number;
    retryConcurrency?: number;
    minRequestDelayMs?: number;
    maxRequestDelayMs?: number;
    retryStart?: number;
    retryMax?: number;
    cacheTtlMs?: number;
    userAgent?: string;  // 크롤링에 사용할 User-Agent 헤더
    
    // 하이브리드 크롤링 전략 관련 설정
    useHybridStrategy?: boolean;  // Playwright 실패 시 Axios/Cheerio로 대체 시도 여부
    adaptiveConcurrency?: boolean; // 동적으로 동시성 조절 여부
    maxRetryDelayMs?: number;  // 재시도 시 최대 지연 시간 (지수 백오프용)
    baseRetryDelayMs?: number; // 재시도 시 기본 지연 시간 (지수 백오프용)
    axiosTimeoutMs?: number;   // Axios 요청 타임아웃
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

/**
 * 데이터베이스 저장 결과를 나타내는 인터페이스
 * 크롤링 중 수집된 제품과 실제로 DB에 저장된 제품 간의 차이를 추적하기 위해 사용
 */
export interface FinalCrawlingResult {
    collected: number;      // 크롤링 엔진에서 수집된 총 제품 수
    newItems: number;       // DB에 새로 추가된 제품 수
    updatedItems: number;   // DB에서 업데이트된 제품 수
    unchangedItems?: number; // 변경되지 않은 제품 수
    failedItems?: number;    // 저장 실패한 제품 수
}

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
    dbSaveComplete: { success: boolean; added?: number; updated?: number; unchanged?: number; failed?: number; }; 
    dbSaveSkipped: any; // <-- Add this if you use 'dbSaveSkipped' elsewhere
    finalCrawlingResult: FinalCrawlingResult; // 최종 크롤링 결과 추가
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
    // Vendor 관련 메서드
    'fetchAndUpdateVendors': void;
    'getVendors': void;
    // 배치 UI 테스트 관련 메서드
    'testBatchUI': { batchCount?: number; delayMs?: number };
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
    };
    // Vendor 관련 메서드 반환 타입
    'fetchAndUpdateVendors': {
        success?: boolean;
        added: number;
        updated: number;
        total: number;
        error?: string;
    };
    'getVendors': {
        success: boolean;
        vendors: Vendor[];
        error?: string;
    };
    // 배치 UI 테스트 메서드 반환 타입
    'testBatchUI': {
        success: boolean;
        message?: string;
        error?: string;
    };
};

// Vendor 타입 정의
export type Vendor = {
    vendorId: string;
    vendorNumber: number;
    vendorName: string;
    companyLegalName: string;
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
    searchProducts: (params: MethodParamsMapping['searchProducts']) => Promise<MethodReturnMapping['searchProducts']>;
    markLastUpdated: (count: MethodParamsMapping['markLastUpdated']) => Promise<MethodReturnMapping['markLastUpdated']>;
    checkCrawlingStatus: () => Promise<MethodReturnMapping['checkCrawlingStatus']>;
    
    // 설정 관련 API
    getConfig: () => Promise<MethodReturnMapping['crawler:get-config']>;
    updateConfig: (config: MethodParamsMapping['crawler:update-config']) => Promise<MethodReturnMapping['crawler:update-config']>;
    resetConfig: () => Promise<MethodReturnMapping['crawler:reset-config']>;
    
    // 레코드 삭제 API
    deleteRecordsByPageRange: (params: MethodParamsMapping['deleteRecordsByPageRange']) => Promise<MethodReturnMapping['deleteRecordsByPageRange']>;
    
    // Vendor 관련 API
    fetchAndUpdateVendors: () => Promise<MethodReturnMapping['fetchAndUpdateVendors']>;
    getVendors: () => Promise<MethodReturnMapping['getVendors']>;
    
    // 배치 UI 테스트 API
    testBatchUI: (params: MethodParamsMapping['testBatchUI']) => Promise<MethodReturnMapping['testBatchUI']>;
}

// Window 인터페이스 확장은 글로벌로 유지
declare global {
    interface Window {
        electron: IElectronAPI;
    }
}

// 모듈로서 이 파일을 다루도록 빈 export 추가
export {};