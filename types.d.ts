// Statistics 타입 정의 업데이트
type Statistics = {
    timestamp: number;
    cpuUsage: number;
    memoryUsage: number;
    ramUsage?: number; // 이전 호환성을 위해 선택적으로 유지
    storageUsage?: number; // 이전 호환성을 위해 선택적으로 유지
};

// Matter 제품 정보 타입
type MatterProduct = {
    url: string;
    pageId?: number;
    indexInPage?: number;
    id?: string;
    manufacturer?: string;
    model?: string;
    deviceType?: string;
    certificationId?: string;
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
};

type Product = {
    url: string;
    manufacturer?: string;
    model?: string;
    certificateId?: string;
    pageId?: number;
    indexInPage?: number;
};

// 크롤링 진행 상태 타입
type CrawlingProgress = {
    current: number;
    total: number;
    percentage: number;
    currentStep: string;
    remainingTime?: number;
    elapsedTime: number;
};

// 크롤링 상태 요약 정보 타입
type CrawlingStatusSummary = {
    dbLastUpdated: Date | null;
    dbProductCount: number;
    siteTotalPages: number;
    siteProductCount: number;
    diff: number;
    needCrawling: boolean;
    crawlingRange: { startPage: number; endPage: number };
};

// 데이터베이스 요약 정보 타입
type DatabaseSummary = {
    totalProducts: number;
    lastUpdated: Date | null;
    newlyAddedCount: number;
};

// 앱 모드 타입
type AppMode = 'development' | 'production';

type StaticData = {
    totalStorage: number;
    cpuModel: string;
    totalMemoryGB: number;
};

// 이벤트 페이로드 맵핑 확장
type EventPayloadMapping = {
    statistics: Statistics;
    getStaticData: StaticData;
    crawlingProgress: CrawlingProgress;
    crawlingComplete: { success: boolean; count: number };
    crawlingError: { message: string; details?: string };
    dbSummary: DatabaseSummary;
    products: MatterProduct[];
};

// 메서드 매개변수 맵핑
type MethodParamsMapping = {
    'startCrawling': { mode: AppMode };
    'stopCrawling': void;
    'exportToExcel': { path?: string };
    'getProducts': { search?: string; page?: number; limit?: number };
    'getProductById': string;
    'searchProducts': { query: string; page?: number; limit?: number };
    'getDatabaseSummary': void;
    'getStaticData': void;
    'markLastUpdated': number;
    'checkCrawlingStatus': void;
};

// 메서드 반환값 맵핑
type MethodReturnMapping = {
    'startCrawling': { success: boolean };
    'stopCrawling': { success: boolean };
    'exportToExcel': { success: boolean; path?: string };
    'getProducts': { products: MatterProduct[]; total: number };
    'getProductById': MatterProduct | null;
    'searchProducts': { products: MatterProduct[]; total: number };
    'getDatabaseSummary': DatabaseSummary;
    'getStaticData': StaticData;
    'markLastUpdated': void;
    'checkCrawlingStatus': { success: boolean; status?: CrawlingStatusSummary; error?: string };
};

type UnsubscribeFunction = () => void;

// 플랫폼 독립적인 API 인터페이스
interface IPlatformAPI {
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
interface IElectronAPI extends IPlatformAPI {
    // 구독 메서드
    subscribeStatistics: (callback: (statistics: Statistics) => void) => UnsubscribeFunction;
    subscribeCrawlingProgress: (callback: (progress: CrawlingProgress) => void) => UnsubscribeFunction;
    subscribeCrawlingComplete: (callback: (data: EventPayloadMapping['crawlingComplete']) => void) => UnsubscribeFunction;
    subscribeCrawlingError: (callback: (data: EventPayloadMapping['crawlingError']) => void) => UnsubscribeFunction;
    subscribeDbSummary: (callback: (data: DatabaseSummary) => void) => UnsubscribeFunction;
    subscribeProducts: (callback: (products: MatterProduct[]) => void) => UnsubscribeFunction;
    
    // 호출 메서드
    getStaticData: () => Promise<StaticData>;
    startCrawling: (params: MethodParamsMapping['startCrawling']) => Promise<MethodReturnMapping['startCrawling']>;
    stopCrawling: () => Promise<MethodReturnMapping['stopCrawling']>;
    exportToExcel: (params: MethodParamsMapping['exportToExcel']) => Promise<MethodReturnMapping['exportToExcel']>;
    getProducts: (params: MethodParamsMapping['getProducts']) => Promise<MethodReturnMapping['getProducts']>;
    getDatabaseSummary: () => Promise<MethodReturnMapping['getDatabaseSummary']>;
}

// 미래의 Tauri 구현을 위한 인터페이스 (주석 처리)
// interface ITauriAPI extends IPlatformAPI {
//     // Tauri 특화 메서드가 필요한 경우 여기에 추가
// }

interface Window {
    electron: IElectronAPI;
    // 미래에 Tauri로 전환 시 다음과 같이 확장 가능
    // tauri?: ITauriAPI;
    // platformAPI: IPlatformAPI; // 플랫폼 독립적 접근을 위한 참조
}