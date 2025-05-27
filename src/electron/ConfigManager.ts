import fs from 'fs';
import path from 'path';
import { electronResourcePaths } from './resourceManager.js';
import { CrawlerConfig } from '../../types.js';

// Define constants for validation limits
const MIN_RETRY_COUNT = 3;
const MAX_RETRY_COUNT = 20;
const MIN_PAGE_RANGE_LIMIT = 1;
const MAX_PAGE_RANGE_LIMIT = 500;
const MIN_PRODUCTS_PER_PAGE = 1;
const MAX_PRODUCTS_PER_PAGE = 100; // Example: Max 100 products per page for sanity
const MIN_BATCH_RETRY_LIMIT = 1;
const MAX_BATCH_RETRY_LIMIT = 10;

// 기본 설정 값 (Consolidated DEFAULT_CONFIG)
const DEFAULT_CONFIG: CrawlerConfig = {
  // Fields from original ConfigManager's DEFAULT_CONFIG, reconciled
  pageRangeLimit: 10, // Default within validated range 1-100
  productListRetryCount: 9, // Default within validated range 3-20
  productDetailRetryCount: 9, // Default within validated range 3-20
  productsPerPage: 12, // Default within validated range 1-100 (example)
  autoAddToLocalDB: true,
  crawlerType: 'axios', // Default crawler type is axios/cheerio
  
  // Batch processing defaults
  batchSize: 30,
  batchDelayMs: 2000,
  enableBatchProcessing: true,
  batchRetryLimit: 3, // Default batch retry limit

  // Fields previously in core/config.ts's defaultConfig
  baseUrl: 'https://csa-iot.org/csa-iot_products/',
  matterFilterUrl: 'https://csa-iot.org/csa-iot_products/?p_keywords=&p_type%5B%5D=14&p_program_type%5B%5D=1049&p_certificate=&p_family=&p_firmware_ver=',
  pageTimeoutMs: 20000,
  productDetailTimeoutMs: 20000,
  initialConcurrency: 16,
  detailConcurrency: 16,
  retryConcurrency: 9,
  minRequestDelayMs: 100,
  maxRequestDelayMs: 2200,
  retryStart: 2, 
  retryMax: 10, // Max total attempts for a single item (e.g. 1 initial + 9 retries)
  cacheTtlMs: 300000, // 5 * 60 * 1000

  // Other fields from CrawlerConfig in types.d.ts, with defaults
  headlessBrowser: true, // Default to true for crawler
  maxConcurrentTasks: 16, // Default to initialConcurrency
  requestDelay: 100,      // Default to minRequestDelayMs
  customUserAgent: undefined, // Let browser/crawler decide by default
  lastExcelExportPath: undefined, // No default path initially
};

/**
 * 애플리케이션 설정을 관리하는 클래스
 */
export class ConfigManager {
  private configPath: string;
  private config: CrawlerConfig;

  constructor() {
    this.configPath = path.join(electronResourcePaths.dataPath, 'crawler-config.json');
    console.log(`[ConfigManager] 설정 파일 경로: ${this.configPath}`);
    console.log(`[ConfigManager] 데이터 경로: ${electronResourcePaths.dataPath}`);
    this.config = this.loadConfig();
  }

  /**
   * 설정 파일을 로드합니다.
   */
  private loadConfig(): CrawlerConfig {
    try {
      console.log(`[ConfigManager] 설정 파일 로드 시도: ${this.configPath}`);
      
      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, 'utf-8');
        const loadedConfig = JSON.parse(configData);
        console.log(`[ConfigManager] 설정 파일 로드 완료`);
        
        // 기본값과 병합하여 빠진 설정이 있으면 기본값으로 채움
        return { ...DEFAULT_CONFIG, ...loadedConfig };
      } else {
        console.log(`[ConfigManager] 설정 파일이 존재하지 않음. 기본값 사용.`);
      }
    } catch (error) {
      console.error(`[ConfigManager] 설정 파일 로드 중 오류 발생:`, error);
    }

    // 설정 파일이 없거나 로드에 실패하면 기본값 반환
    return { ...DEFAULT_CONFIG };
  }

  /**
   * 현재 설정을 저장합니다.
   */
  private saveConfig(): void {
    try {
      console.log(`[ConfigManager] 설정 저장 시도: ${this.configPath}`);
      console.log(`[ConfigManager] 저장할 설정 내용:`, JSON.stringify(this.config, null, 2));
      
      // 데이터 디렉토리가 없으면 생성
      const configDir = path.dirname(this.configPath);
      if (!fs.existsSync(configDir)) {
        console.log(`[ConfigManager] 디렉토리 생성: ${configDir}`);
        fs.mkdirSync(configDir, { recursive: true });
      }
      
      // 설정 데이터를 JSON 문자열로 변환
      const configData = JSON.stringify(this.config, null, 2);
      console.log(`[ConfigManager] 저장할 설정 크기: ${configData.length} bytes`);
      
      // 파일 쓰기 전 파일 접근 권한 확인
      try {
        fs.accessSync(path.dirname(this.configPath), fs.constants.W_OK);
        console.log(`[ConfigManager] 디렉토리 쓰기 권한 확인 완료: ${path.dirname(this.configPath)}`);
      } catch (accessErr) {
        console.error(`[ConfigManager] 디렉토리 쓰기 권한 부족:`, accessErr);
      }
      
      // 파일 쓰기
      fs.writeFileSync(this.configPath, configData);
      console.log(`[ConfigManager] writeFileSync 호출 완료`);
      
      // 저장 후 파일 존재 여부 확인
      if (fs.existsSync(this.configPath)) {
        const stats = fs.statSync(this.configPath);
        console.log(`[ConfigManager] 설정 저장 완료. 파일 크기: ${stats.size} bytes`);
      } else {
        console.error(`[ConfigManager] 설정 파일 저장 후 파일이 존재하지 않음: ${this.configPath}`);
      }
    } catch (error) {
      console.error(`[ConfigManager] 설정 파일 저장 중 오류 발생:`, error);
      console.error(`[ConfigManager] 설정 경로: ${this.configPath}`);
      console.error(`[ConfigManager] 현재 작업 디렉토리: ${process.cwd()}`);
      throw error; // 오류를 다시 던져서 상위에서 처리할 수 있도록 함
    }
  }

  /**
   * 전체 설정을 가져옵니다.
   */
  getConfig(): CrawlerConfig {
    return { ...this.config };
  }
  
  /**
   * 설정 파일 경로를 가져옵니다.
   */
  getConfigPath(): string {
    return this.configPath;
  }
  
  /**
   * 크롤러 타입 가져오기
   * @returns crawler 타입 ('playwright' 또는 'axios')
   */
  getCrawlerType(): 'playwright' | 'axios' {
    return this.config.crawlerType || 'axios'; // 기본값은 axios
  }
  
  /**
   * 크롤러 타입 설정하기
   * @param type 크롤러 타입 ('playwright' 또는 'axios')
   */
  setCrawlerType(type: 'playwright' | 'axios'): void {
    this.config.crawlerType = type;
    this.saveConfig(); // 설정 저장
  }

  /**
   * 설정 일부를 업데이트합니다.
   */
  updateConfig(partialConfig: Partial<CrawlerConfig>): CrawlerConfig {
    console.log(`[ConfigManager] 설정 업데이트 요청:`, Object.keys(partialConfig));
    console.log(`[ConfigManager] 현재 설정:`, JSON.stringify(this.config, null, 2));
    console.log(`[ConfigManager] 들어온 설정:`, JSON.stringify(partialConfig, null, 2));
    
    // 기존 설정과 들어온 설정을 병합
    this.config = {
      ...this.config,
      ...partialConfig
    };
    
    console.log(`[ConfigManager] 병합 후 설정:`, JSON.stringify(this.config, null, 2));
    
    // 값 범위 검증
    if (this.config.productListRetryCount < MIN_RETRY_COUNT) this.config.productListRetryCount = MIN_RETRY_COUNT;
    if (this.config.productListRetryCount > MAX_RETRY_COUNT) this.config.productListRetryCount = MAX_RETRY_COUNT;
    
    if (this.config.productDetailRetryCount < MIN_RETRY_COUNT) this.config.productDetailRetryCount = MIN_RETRY_COUNT;
    if (this.config.productDetailRetryCount > MAX_RETRY_COUNT) this.config.productDetailRetryCount = MAX_RETRY_COUNT;
    
    if (this.config.pageRangeLimit < MIN_PAGE_RANGE_LIMIT) this.config.pageRangeLimit = MIN_PAGE_RANGE_LIMIT;
    if (this.config.pageRangeLimit > MAX_PAGE_RANGE_LIMIT) this.config.pageRangeLimit = MAX_PAGE_RANGE_LIMIT;

    if (this.config.productsPerPage < MIN_PRODUCTS_PER_PAGE) this.config.productsPerPage = MIN_PRODUCTS_PER_PAGE;
    if (this.config.productsPerPage > MAX_PRODUCTS_PER_PAGE) this.config.productsPerPage = MAX_PRODUCTS_PER_PAGE;
    
    // 배치 재시도 횟수 검증
    if (this.config.batchRetryLimit !== undefined) {
      if (this.config.batchRetryLimit < MIN_BATCH_RETRY_LIMIT) this.config.batchRetryLimit = MIN_BATCH_RETRY_LIMIT;
      if (this.config.batchRetryLimit > MAX_BATCH_RETRY_LIMIT) this.config.batchRetryLimit = MAX_BATCH_RETRY_LIMIT;
    }
    
    try {
      this.saveConfig();
      console.log(`[ConfigManager] 설정 업데이트 및 저장 완료`);
    } catch (error) {
      console.error(`[ConfigManager] 설정 저장 실패:`, error);
      console.error(`[ConfigManager] 저장 실패한 설정:`, JSON.stringify(this.config, null, 2));
      // 저장 실패 시에도 메모리의 설정은 유지하지만 에러를 로그에 남김
    }
    
    return { ...this.config };
  }

  /**
   * 설정을 기본값으로 리셋합니다.
   */
  resetConfig(): CrawlerConfig {
    this.config = { ...DEFAULT_CONFIG };
    this.saveConfig();
    return { ...this.config };
  }
}

// ConfigManager 싱글턴 인스턴스
export const configManager = new ConfigManager();