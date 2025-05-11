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

// 기본 설정 값 (Consolidated DEFAULT_CONFIG)
const DEFAULT_CONFIG: CrawlerConfig = {
  // Fields from original ConfigManager's DEFAULT_CONFIG, reconciled
  pageRangeLimit: 10, // Default within validated range 1-100
  productListRetryCount: 9, // Default within validated range 3-20
  productDetailRetryCount: 9, // Default within validated range 3-20
  productsPerPage: 12, // Default within validated range 1-100 (example)
  autoAddToLocalDB: true,

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
    this.config = this.loadConfig();
  }

  /**
   * 설정 파일을 로드합니다.
   */
  private loadConfig(): CrawlerConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, 'utf-8');
        const loadedConfig = JSON.parse(configData);
        
        // 기본값과 병합하여 빠진 설정이 있으면 기본값으로 채움
        return { ...DEFAULT_CONFIG, ...loadedConfig };
      }
    } catch (error) {
      console.error('설정 파일 로드 중 오류 발생:', error);
    }

    // 설정 파일이 없거나 로드에 실패하면 기본값 반환
    return { ...DEFAULT_CONFIG };
  }

  /**
   * 현재 설정을 저장합니다.
   */
  private saveConfig(): void {
    try {
      // 데이터 디렉토리가 없으면 생성
      if (!fs.existsSync(path.dirname(this.configPath))) {
        fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
      }
      
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error('설정 파일 저장 중 오류 발생:', error);
    }
  }

  /**
   * 전체 설정을 가져옵니다.
   */
  getConfig(): CrawlerConfig {
    return { ...this.config };
  }

  /**
   * 설정 일부를 업데이트합니다.
   */
  updateConfig(partialConfig: Partial<CrawlerConfig>): CrawlerConfig {
    this.config = {
      ...this.config,
      ...partialConfig
    };
    
    // 값 범위 검증
    if (this.config.productListRetryCount < MIN_RETRY_COUNT) this.config.productListRetryCount = MIN_RETRY_COUNT;
    if (this.config.productListRetryCount > MAX_RETRY_COUNT) this.config.productListRetryCount = MAX_RETRY_COUNT;
    
    if (this.config.productDetailRetryCount < MIN_RETRY_COUNT) this.config.productDetailRetryCount = MIN_RETRY_COUNT;
    if (this.config.productDetailRetryCount > MAX_RETRY_COUNT) this.config.productDetailRetryCount = MAX_RETRY_COUNT;
    
    if (this.config.pageRangeLimit < MIN_PAGE_RANGE_LIMIT) this.config.pageRangeLimit = MIN_PAGE_RANGE_LIMIT;
    if (this.config.pageRangeLimit > MAX_PAGE_RANGE_LIMIT) this.config.pageRangeLimit = MAX_PAGE_RANGE_LIMIT;

    if (this.config.productsPerPage < MIN_PRODUCTS_PER_PAGE) this.config.productsPerPage = MIN_PRODUCTS_PER_PAGE;
    if (this.config.productsPerPage > MAX_PRODUCTS_PER_PAGE) this.config.productsPerPage = MAX_PRODUCTS_PER_PAGE;
    
    this.saveConfig();
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