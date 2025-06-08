// Types for Matter Certification Collection Application
// Modern TypeScript Type System - Phase 1 Consolidated

/**
 * =====================================================
 * CORE DOMAIN TYPES (Modern TypeScript)
 * =====================================================
 */

/**
 * System resource usage statistics
 */
export interface Statistics {
    readonly timestamp: number;
    readonly cpuUsage: number;
    readonly memoryUsage: number;
    readonly ramUsage?: number; // Legacy compatibility
    readonly storageUsage?: number; // Legacy compatibility
}

/**
 * Static application data
 */
export interface StaticData {
    readonly totalStorage: number;
    readonly cpuModel: string;
    readonly totalMemoryGB: number;
}

/**
 * Application mode
 */
export type AppMode = 'development' | 'production';

/**
 * =====================================================
 * CRAWLING DOMAIN TYPES (Consolidated & Modern)
 * =====================================================
 */

/**
 * Crawling status - consolidated from all duplicates
 * Used across: CrawlerState, CrawlingStore, shared types
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
 * Crawling stage identifiers - modern enum approach
 * Replaces multiple inconsistent definitions across files
 */
export type CrawlingStage = 
    // Legacy numeric stages (for compatibility)
    | number  
    // Modern stage identifiers
    | 'idle' 
    | 'preparation'
    | 'productList:init' 
    | 'productList:fetching'
    | 'productList:collecting' 
    | 'productList:processing'
    | 'productList:retrying' 
    | 'productList:complete'
    | 'validation:init'
    | 'validation:processing'
    | 'validation:complete'
    | 'productDetail:init' 
    | 'productDetail:fetching'
    | 'productDetail:collecting' 
    | 'productDetail:processing'
    | 'productDetail:retrying' 
    | 'productDetail:complete'
    | 'completed'
    | 'failed'
    | 'complete' 
    | 'error';

/**
 * Enhanced stage identifiers for new type system
 */
export type CrawlingStageId = 
    | 'ready'             
    | 'initialization'    
    | 'category-extraction' 
    | 'product-search'    
    | 'completion'        
    | 'status-check'      
    | 'product-list'      // Stage 1
    | 'db-comparison'     // Stage 1.5
    | 'product-detail';   // Stage 2

/**
 * Stage progress status
 */
export type StageStatus = 
    | 'pending'    
    | 'running'    
    | 'completed'  
    | 'failed'     
    | 'skipped';

/**
 * Page processing status values
 */
export type PageProcessingStatusValue = 
    | 'waiting' 
    | 'attempting' 
    | 'success' 
    | 'failed' 
    | 'incomplete';

/**
 * Individual page processing status
 */
export interface PageProcessingStatusItem {
    readonly pageNumber: number;
    readonly status: PageProcessingStatusValue;
    readonly attempt?: number;
}

/**
 * Crawling error information
 */
export interface CrawlingError {
    readonly name: string;
    readonly message: string;
    readonly stack?: string;
    readonly details?: any;
}

/**
 * =====================================================
 * PROGRESS TRACKING TYPES (Consolidated)
 * =====================================================
 */

/**
 * Legacy crawling progress interface (for compatibility)
 * Consolidated from multiple duplicate definitions
 */
export interface CrawlingProgress {
    // Core progress fields
    readonly current: number; 
    readonly total: number;   
    readonly percentage: number;
    readonly currentStep: string;
    readonly elapsedTime: number;
    
    // Status and timing
    readonly status?: CrawlingStatus;
    readonly remainingTime?: number;
    readonly startTime?: number;
    readonly estimatedEndTime?: number;
    
    // Stage information
    readonly currentStage?: number; 
    readonly stage?: CrawlingStage;
    readonly message?: string; 
    
    // Progress tracking
    readonly currentPage?: number;      
    readonly totalPages?: number;
    readonly processedItems?: number; 
    readonly totalItems?: number;     
    readonly newItems?: number;
    readonly updatedItems?: number;
    readonly errors?: number;
    
    // Error handling
    readonly criticalError?: string; 
    readonly retryCount?: number;      
    readonly maxRetries?: number;      
    readonly retryItem?: string; 

    // Batch processing
    readonly currentBatch?: number;     
    readonly totalBatches?: number;     
    readonly batchRetryCount?: number;  
    readonly batchRetryLimit?: number;  

    // Stage 1 specific
    readonly stage1PageStatuses?: PageProcessingStatusItem[];
    
    // Validation (Stage 1.5)
    readonly validationSummary?: ValidationSummary;
    readonly rangeRecommendations?: string[];
}

/**
 * Modern stage progress interface (Phase 1 enhanced)
 */
export interface StageProgress {
    readonly stageId: CrawlingStageId;
    readonly status: StageStatus;
    readonly current: number;
    readonly total: number;
    readonly percentage: number;
    readonly currentStep: string;
    readonly startTime?: Date;
    readonly endTime?: Date;
    readonly elapsedTime: number;
    readonly remainingTime?: number;
    readonly retryCount?: number;
    readonly maxRetries?: number;
    readonly error?: CrawlingError;
    readonly metadata?: Readonly<Record<string, any>>;
}

/**
 * Modern session progress interface (Phase 1 enhanced)
 */
export interface CrawlingSessionProgress {
    readonly sessionId: string;
    readonly overallStatus: CrawlingStatus;
    readonly stages: Readonly<Record<CrawlingStageId, StageProgress>>;
    readonly currentStage: CrawlingStageId | null;
    readonly startTime: Date;
    readonly endTime?: Date;
    readonly totalElapsedTime: number;
    readonly totalRemainingTime?: number;
}

/**
 * Batch processing progress
 */
export interface BatchProgress {
    readonly currentBatch: number;
    readonly totalBatches: number;
    readonly currentInBatch: number;
    readonly totalInBatch: number;
    readonly batchRetryCount?: number;
    readonly batchRetryLimit?: number;
    readonly pageStatuses?: ReadonlyArray<PageProcessingStatusItem>;
}

/**
 * =====================================================
 * PRODUCT DOMAIN TYPES
 * =====================================================
 */

/**
 * Matter product basic information (for listing)
 */
export interface Product {
    readonly url: string;
    readonly manufacturer?: string;
    readonly model?: string;
    readonly certificateId?: string;
    readonly pageId?: number;
    readonly indexInPage?: number;
}

/**
 * Complete Matter product information
 */
export interface MatterProduct {
    readonly url: string;
    readonly pageId?: number;
    readonly indexInPage?: number;
    readonly id?: string;
    readonly manufacturer?: string;
    readonly model?: string;
    readonly deviceType?: string;
    readonly certificateId?: string;
    readonly certificationDate?: string | Date;
    readonly softwareVersion?: string;
    readonly hardwareVersion?: string;
    readonly vid?: string;
    readonly pid?: string;
    readonly familySku?: string;
    readonly familyVariantSku?: string;
    readonly firmwareVersion?: string;
    readonly familyId?: string;
    readonly tisTrpTested?: string;
    readonly specificationVersion?: string;
    readonly transportInterface?: string;
    readonly primaryDeviceTypeId?: string;
    readonly applicationCategories?: ReadonlyArray<string>;
    readonly createdAt?: string;
    readonly updatedAt?: string;
}

/**
 * Vendor information
 */
export interface Vendor {
    readonly vendorId: string;
    readonly vendorNumber: number;
    readonly vendorName: string;
    readonly companyLegalName: string;
}

/**
 * =====================================================
 * VALIDATION & SUMMARY TYPES
 * =====================================================
 */

/**
 * Local DB validation results (Stage 1.5)
 */
export interface ValidationSummary {
    readonly totalProducts: number;
    readonly newProducts: number;
    readonly existingProducts: number;
    readonly duplicateProducts: number;
    readonly skipRatio: number;
    readonly duplicateRatio: number;
}

/**
 * Crawling status summary with server comparison
 */
export interface CrawlingStatusSummary {
    readonly dbLastUpdated: Date | null;
    readonly dbProductCount: number;
    readonly siteTotalPages?: number;
    readonly siteProductCount: number;
    readonly diff: number;
    readonly needCrawling: boolean;
    readonly crawlingRange?: { 
        readonly startPage: number; 
        readonly endPage: number; 
    };
    readonly actualTargetPageCountForStage1?: number;
    readonly isRecrawling?: boolean;
    readonly lastCrawlTimestamp?: number | null;
    readonly lastPageProductCount?: number;
    readonly [key: string]: any; // Index signature for flexibility
}

/**
 * Database summary information
 */
export interface DatabaseSummary {
    readonly totalProducts: number;
    readonly productCount: number;
    readonly lastUpdated: Date | null;
    readonly newlyAddedCount: number;
}

/**
 * Final crawling results
 */
export interface FinalCrawlingResult {
    readonly collected: number;
    readonly newItems: number;
    readonly updatedItems: number;
    readonly unchangedItems?: number;
    readonly failedItems?: number;
}

/**
 * =====================================================
 * CONFIGURATION TYPES (Modern TypeScript)
 * =====================================================
 */

/**
 * Crawler configuration interface
 * Consolidated from multiple config definitions
 */
export interface CrawlerConfig {
    // Core settings
    readonly pageRangeLimit: number;
    readonly productListRetryCount: number;
    readonly productDetailRetryCount: number;
    readonly productsPerPage: number;
    readonly autoAddToLocalDB: boolean;
    readonly autoStatusCheck: boolean;
    
    // Browser settings
    readonly headlessBrowser?: boolean;
    readonly crawlerType?: 'playwright' | 'axios';
    readonly customUserAgent?: string;
    readonly userAgent?: string;
    
    // Performance settings
    readonly maxConcurrentTasks?: number;
    readonly requestDelay?: number;
    readonly requestTimeout?: number;
    readonly validateSSL?: boolean;
    
    // Batch processing
    readonly enableBatchProcessing?: boolean;
    readonly batchSize?: number;
    readonly batchDelayMs?: number;
    readonly maxBatchRetries?: number;
    readonly batchRetryLimit?: number;
    
    // Advanced crawler settings
    readonly baseUrl?: string;
    readonly matterFilterUrl?: string;
    readonly pageTimeoutMs?: number;
    readonly productDetailTimeoutMs?: number;
    readonly initialConcurrency?: number;
    readonly detailConcurrency?: number;
    readonly retryConcurrency?: number;
    readonly minRequestDelayMs?: number;
    readonly maxRequestDelayMs?: number;
    readonly retryStart?: number;
    readonly retryMax?: number;
    readonly cacheTtlMs?: number;
    
    // Strategy settings
    readonly useHybridStrategy?: boolean;
    readonly adaptiveConcurrency?: boolean;
    readonly maxRetryDelayMs?: number;
    readonly baseRetryDelayMs?: number;
    readonly axiosTimeoutMs?: number;
    
    // Export settings
    readonly lastExcelExportPath?: string;
    
    // Logging configuration
    readonly logging?: {
        readonly level?: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'VERBOSE';
        readonly components?: {
            readonly CrawlerState?: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'VERBOSE';
            readonly CrawlerEngine?: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'VERBOSE';
            readonly ProductListCollector?: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'VERBOSE';
            readonly ProductDetailCollector?: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'VERBOSE';
            readonly PageCrawler?: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'VERBOSE';
            readonly BrowserManager?: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'VERBOSE';
        };
        readonly enableStackTrace?: boolean;
        readonly enableTimestamp?: boolean;
    };
}

/**
 * =====================================================
 * CONCURRENT PROCESSING TYPES
 * =====================================================
 */

/**
 * Concurrent task status
 */
export type ConcurrentTaskStatus = 
    | 'pending' 
    | 'running' 
    | 'success' 
    | 'error' 
    | 'stopped' 
    | 'waiting' 
    | 'attempting' 
    | 'failed' 
    | 'incomplete';

/**
 * Concurrent crawling task
 */
export interface ConcurrentCrawlingTask {
    readonly pageNumber: number;
    readonly status: ConcurrentTaskStatus;
    readonly startedAt?: number;
    readonly finishedAt?: number;
    readonly error?: string;
}

/**
 * =====================================================
 * PLATFORM API TYPES (Modern Interface Design)
 * =====================================================
 */

/**
 * Event payload mapping for type-safe event handling
 */
export interface EventPayloadMapping {
    readonly statistics: Statistics;
    readonly getStaticData: StaticData;
    readonly crawlingProgress: CrawlingProgress;
    readonly crawlingComplete: { readonly success: boolean; readonly count: number };
    readonly crawlingError: { readonly message: string; readonly details?: string };
    readonly dbSummary: DatabaseSummary;
    readonly products: ReadonlyArray<MatterProduct>;
    readonly crawlingTaskStatus: ReadonlyArray<ConcurrentCrawlingTask>;
    readonly crawlingStopped: ReadonlyArray<ConcurrentCrawlingTask>;
    readonly crawlingFailedPages: ReadonlyArray<{ readonly pageNumber: number; readonly errors: ReadonlyArray<string> }>;
    readonly dbSaveError: { readonly error?: string }; 
    readonly dbSaveComplete: { 
        readonly success: boolean; 
        readonly added?: number; 
        readonly updated?: number; 
        readonly unchanged?: number; 
        readonly failed?: number; 
    }; 
    readonly dbSaveSkipped: any;
    readonly finalCrawlingResult: FinalCrawlingResult;
    readonly crawlingStatusSummary: CrawlingStatusSummary;
}

/**
 * Method parameter mapping for type-safe method calls
 */
export interface MethodParamsMapping {
    readonly 'startCrawling': { readonly mode: AppMode; readonly config?: CrawlerConfig };
    readonly 'stopCrawling': void;
    readonly 'exportToExcel': { readonly path?: string };
    readonly 'getProducts': { readonly search?: string; readonly page?: number; readonly limit?: number };
    readonly 'getProductById': string;
    readonly 'searchProducts': { readonly query: string; readonly page?: number; readonly limit?: number };
    readonly 'getDatabaseSummary': void;
    readonly 'getStaticData': void;
    readonly 'markLastUpdated': number;
    readonly 'checkCrawlingStatus': void;
    readonly 'crawler:get-config': void;
    readonly 'crawler:update-config': Partial<CrawlerConfig>;
    readonly 'crawler:reset-config': void;
    readonly 'deleteRecordsByPageRange': { readonly startPageId: number; readonly endPageId: number };
    readonly 'saveProductsToDB': ReadonlyArray<MatterProduct>;
    readonly 'fetchAndUpdateVendors': void;
    readonly 'getVendors': void;
    readonly 'getConfigPath': void;
}

/**
 * Method return mapping for type-safe return values
 */
export interface MethodReturnMapping {
    readonly 'startCrawling': { readonly success: boolean };
    readonly 'stopCrawling': { readonly success: boolean };
    readonly 'exportToExcel': { readonly success: boolean; readonly path?: string };
    readonly 'getProducts': { readonly products: ReadonlyArray<MatterProduct>; readonly total: number; readonly maxPageId?: number };
    readonly 'getProductById': MatterProduct | null;
    readonly 'searchProducts': { readonly products: ReadonlyArray<MatterProduct>; readonly total: number };
    readonly 'getDatabaseSummary': DatabaseSummary;
    readonly 'getStaticData': StaticData;
    readonly 'markLastUpdated': void;
    readonly 'checkCrawlingStatus': { readonly success: boolean; readonly status?: CrawlingStatusSummary; readonly error?: string };
    readonly 'crawler:get-config': { readonly success: boolean; readonly config?: CrawlerConfig; readonly error?: string };
    readonly 'crawler:update-config': { readonly success: boolean; readonly config?: CrawlerConfig; readonly error?: string };
    readonly 'crawler:reset-config': { readonly success: boolean; readonly config?: CrawlerConfig; readonly error?: string };
    readonly 'deleteRecordsByPageRange': { readonly success: boolean; readonly deletedCount: number; readonly maxPageId?: number; readonly error?: string };
    readonly 'saveProductsToDB': { 
        readonly success: boolean; 
        readonly added?: number; 
        readonly updated?: number; 
        readonly unchanged?: number; 
        readonly failed?: number; 
        readonly error?: string;
    };
    readonly 'fetchAndUpdateVendors': {
        readonly success?: boolean;
        readonly added: number;
        readonly updated: number;
        readonly total: number;
        readonly error?: string;
    };
    readonly 'getVendors': {
        readonly success: boolean;
        readonly vendors: ReadonlyArray<Vendor>;
        readonly error?: string;
    };
    readonly 'getConfigPath': {
        readonly success: boolean;
        readonly configPath?: string;
        readonly error?: string;
    };
}

/**
 * Unsubscribe function type
 */
export type UnsubscribeFunction = () => void;

/**
 * =====================================================
 * PLATFORM API INTERFACES (Modern & Type-Safe)
 * =====================================================
 */

/**
 * Platform-independent API interface
 */
export interface IPlatformAPI {
    subscribeToEvent<K extends keyof EventPayloadMapping>(
        eventName: K, 
        callback: (data: EventPayloadMapping[K]) => void
    ): UnsubscribeFunction;
    
    invokeMethod<K extends keyof MethodParamsMapping, R = MethodReturnMapping[K]>(
        methodName: K,
        params?: MethodParamsMapping[K]
    ): Promise<R>;
}

/**
 * Electron-specific API interface
 */
export interface IElectronAPI extends IPlatformAPI {
    // Event listeners
    readonly on: (channel: string, listener: (...args: any[]) => void) => void;
    readonly removeAllListeners: (channel: string) => void;
    
    // Subscription methods
    readonly subscribeStatistics: (callback: (statistics: Statistics) => void) => UnsubscribeFunction;
    readonly subscribeCrawlingProgress: (callback: (progress: CrawlingProgress) => void) => UnsubscribeFunction;
    readonly subscribeToCrawlingProgress: (callback: (progress: CrawlingProgress) => void) => boolean;
    readonly subscribeCrawlingComplete: (callback: (data: EventPayloadMapping['crawlingComplete']) => void) => UnsubscribeFunction;
    readonly subscribeToCrawlingComplete: (callback: (data: EventPayloadMapping['crawlingComplete']) => void) => boolean;
    readonly subscribeCrawlingError: (callback: (data: EventPayloadMapping['crawlingError']) => void) => UnsubscribeFunction;
    readonly subscribeToCrawlingError: (callback: (data: EventPayloadMapping['crawlingError']) => void) => boolean;
    readonly subscribeCrawlingTaskStatus: (callback: (tasks: ReadonlyArray<ConcurrentCrawlingTask>) => void) => UnsubscribeFunction;
    readonly subscribeCrawlingStopped: (callback: (tasks: ReadonlyArray<ConcurrentCrawlingTask>) => void) => UnsubscribeFunction;
    readonly subscribeCrawlingFailedPages: (callback: (failedPages: EventPayloadMapping['crawlingFailedPages']) => void) => UnsubscribeFunction;
    readonly subscribeDbSummary: (callback: (data: DatabaseSummary) => void) => UnsubscribeFunction;
    readonly subscribeProducts: (callback: (products: ReadonlyArray<MatterProduct>) => void) => UnsubscribeFunction;
    readonly subscribeCrawlingStatusSummary: (callback: (data: EventPayloadMapping['crawlingStatusSummary']) => void) => UnsubscribeFunction;
    
    // Method calls
    readonly getStaticData: () => Promise<StaticData>;
    readonly startCrawling: (params: MethodParamsMapping['startCrawling']) => Promise<MethodReturnMapping['startCrawling']>;
    readonly stopCrawling: () => Promise<MethodReturnMapping['stopCrawling']>;
    readonly exportToExcel: (params: MethodParamsMapping['exportToExcel']) => Promise<MethodReturnMapping['exportToExcel']>;
    readonly getProducts: (params: MethodParamsMapping['getProducts']) => Promise<MethodReturnMapping['getProducts']>;
    readonly getProductById: (id: MethodParamsMapping['getProductById']) => Promise<MethodReturnMapping['getProductById']>;
    readonly getDatabaseSummary: () => Promise<MethodReturnMapping['getDatabaseSummary']>;
    readonly searchProducts: (params: MethodParamsMapping['searchProducts']) => Promise<MethodReturnMapping['searchProducts']>;
    readonly markLastUpdated: (count: MethodParamsMapping['markLastUpdated']) => Promise<MethodReturnMapping['markLastUpdated']>;
    readonly checkCrawlingStatus: () => Promise<MethodReturnMapping['checkCrawlingStatus']>;
    readonly getConfig: () => Promise<MethodReturnMapping['crawler:get-config']>;
    readonly updateConfig: (config: MethodParamsMapping['crawler:update-config']) => Promise<MethodReturnMapping['crawler:update-config']>;
    readonly resetConfig: () => Promise<MethodReturnMapping['crawler:reset-config']>;
    readonly getConfigPath: () => Promise<MethodReturnMapping['getConfigPath']>;
    readonly deleteRecordsByPageRange: (params: MethodParamsMapping['deleteRecordsByPageRange']) => Promise<MethodReturnMapping['deleteRecordsByPageRange']>;
    readonly fetchAndUpdateVendors: () => Promise<MethodReturnMapping['fetchAndUpdateVendors']>;
    readonly getVendors: () => Promise<MethodReturnMapping['getVendors']>;
}

/**
 * =====================================================
 * UI COMPONENT TYPES (Modern TypeScript Patterns)
 * =====================================================
 */

/**
 * Base component props with modern TypeScript patterns
 */
export interface ComponentProps<T = {}> {
    readonly className?: string;
    readonly testId?: string;
    readonly children?: React.ReactNode;
}

/**
 * Button component variants
 */
export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'success' | 'warning';
export type ButtonSize = 'sm' | 'md' | 'lg';

/**
 * Button component props with conditional types
 */
export interface ButtonProps extends ComponentProps {
    readonly variant?: ButtonVariant;
    readonly size?: ButtonSize;
    readonly disabled?: boolean;
    readonly loading?: boolean;
    readonly onClick?: () => void;
}

/**
 * Conditional props based on crawling status
 */
export type ConditionalCrawlingProps<T extends CrawlingStatus> = 
  T extends 'running' ? { readonly onStop: () => void } :
  T extends 'stopping' ? { readonly showOverlay: true } :
  { readonly onStart?: () => void };

/**
 * =====================================================
 * GLOBAL DECLARATIONS
 * =====================================================
 */

declare global {
    interface Window {
        electron: IElectronAPI;
    }
}

// Module marker to ensure this file is treated as a module
export {};
