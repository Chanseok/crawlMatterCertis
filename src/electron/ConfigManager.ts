import fs from 'fs';
import path from 'path';
import { electronResourcePaths } from './resourceManager.js';
import type { CrawlerConfig, MutableCrawlerConfig } from '../../types.js';
import { ConfigurationValidator } from '../shared/domain/ConfigurationValue.js';
import { configManagerLogger } from './utils/logger.js';

// 기본 설정 값 (Consolidated DEFAULT_CONFIG)
const DEFAULT_CONFIG: MutableCrawlerConfig = {
  // Fields from original ConfigManager's DEFAULT_CONFIG, reconciled
  pageRangeLimit: 10, // Default within validated range 1-100
  productListRetryCount: 9, // Default within validated range 3-20
  productDetailRetryCount: 9, // Default within validated range 3-20
  productsPerPage: 12, // Default within validated range 1-100 (example)
  autoAddToLocalDB: true,
  autoStatusCheck: true,    // 기본값: 자동 상태 체크 활성화
  crawlerType: 'axios', // Default crawler type is axios/cheerio
  
  // Batch processing defaults
  batchSize: 30,
  batchDelayMs: 2000,
  enableBatchProcessing: true,
  batchRetryLimit: 3, // Default batch retry limit

  // Fields previously in core/config.ts's defaultConfig
  baseUrl: 'https://csa-iot.org/csa-iot_products/',
  matterFilterUrl: 'https://csa-iot.org/csa-iot_products/?p_keywords=&p_type%5B%5D=14&p_program_type%5B%5D=1049&p_certificate=&p_family=&p_firmware_ver=',
  pageTimeoutMs: 90000, // 개선: 45초에서 90초(1분 30초)로 증가하여 타임아웃 문제 해결
  productDetailTimeoutMs: 90000, // 개선: 45초에서 90초(1분 30초)로 증가
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
  private config: MutableCrawlerConfig;

  constructor() {
    this.configPath = path.join(electronResourcePaths.dataPath, 'crawler-config.json');
    configManagerLogger.info('Initializing ConfigManager', {
      data: {
        configPath: this.configPath,
        dataPath: electronResourcePaths.dataPath
      }
    });
    this.config = this.loadConfig();
  }

  /**
   * 설정 파일을 로드합니다.
   */
  private loadConfig(): MutableCrawlerConfig {
    try {
      configManagerLogger.debug('Attempting to load config file', { data: { path: this.configPath } });
      
      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, 'utf-8');
        const loadedConfig = JSON.parse(configData);
        configManagerLogger.info('Config file loaded successfully');
        
        // 기본값과 병합하여 빠진 설정이 있으면 기본값으로 채움
        return { ...DEFAULT_CONFIG, ...loadedConfig };
      } else {
        configManagerLogger.info('Config file does not exist, using default values');
      }
    } catch (error) {
      configManagerLogger.error('Error loading config file', { data: { error } });
    }

    // 설정 파일이 없거나 로드에 실패하면 기본값 반환
    return { ...DEFAULT_CONFIG };
  }

  /**
   * 현재 설정을 저장합니다.
   */
  private saveConfig(): void {
    try {
      configManagerLogger.debug('Attempting to save config', { 
        data: { 
          path: this.configPath,
          config: this.config
        } 
      });
      
      // 데이터 디렉토리가 없으면 생성
      const configDir = path.dirname(this.configPath);
      if (!fs.existsSync(configDir)) {
        configManagerLogger.info('Creating config directory', { data: { dir: configDir } });
        fs.mkdirSync(configDir, { recursive: true });
      }
      
      // 설정 데이터를 JSON 문자열로 변환
      const configData = JSON.stringify(this.config, null, 2);
      configManagerLogger.debug('Config data prepared for saving', { data: { size: configData.length } });
      
      // 파일 쓰기 전 파일 접근 권한 확인
      try {
        fs.accessSync(path.dirname(this.configPath), fs.constants.W_OK);
        configManagerLogger.debug('Directory write permissions verified', { 
          data: { dir: path.dirname(this.configPath) } 
        });
      } catch (accessErr) {
        configManagerLogger.error('Directory write permission denied', { data: { error: accessErr } });
      }
      
      // 파일 쓰기
      fs.writeFileSync(this.configPath, configData);
      configManagerLogger.debug('writeFileSync completed');
      
      // 저장 후 파일 존재 여부 확인
      if (fs.existsSync(this.configPath)) {
        const stats = fs.statSync(this.configPath);
        configManagerLogger.info('Config saved successfully', { data: { fileSize: stats.size } });
      } else {
        configManagerLogger.error('Config file does not exist after save', { data: { path: this.configPath } });
      }
    } catch (error) {
      configManagerLogger.error('Error saving config file', {
        data: {
          error,
          configPath: this.configPath,
          cwd: process.cwd()
        }
      });
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
   * Clean Code 원칙을 따른 견고한 검증 로직 적용
   * readonly 제약을 안전하게 처리하는 타입 안전 구현
   */
  updateConfig(partialConfig: Partial<CrawlerConfig>): CrawlerConfig {
    configManagerLogger.info('Config update request started', {
      data: {
        fieldsToUpdate: Object.keys(partialConfig),
        currentConfig: this.config,
        incomingConfig: partialConfig
      }
    });
    
    // 호출 스택 추적을 위한 에러 객체 생성
    const callStack = new Error().stack;
    configManagerLogger.debug('Call stack trace', { data: { callStack } });
    
    // 특별히 중요한 필드들의 값 변화 추적
    const criticalFields = ['pageRangeLimit', 'productListRetryCount', 'productDetailRetryCount'];
    for (const field of criticalFields) {
      if (field in partialConfig) {
        configManagerLogger.debug(`Critical field change detected: ${field}`, {
          data: {
            field,
            from: this.config[field as keyof CrawlerConfig],
            to: partialConfig[field as keyof CrawlerConfig]
          }
        });
      }
    }
    
    // 1. 부분 업데이트 검증 (기존 설정 컨텍스트 포함)
    const validationResult = ConfigurationValidator.validatePartialUpdate(
      this.config, 
      partialConfig
    );
    
    if (!validationResult.isValid) {
      const errorDetails = Object.entries(validationResult.errors)
        .map(([field, errors]) => `${field}: ${errors.join(', ')}`)
        .join('; ');
      
      console.error(`[ConfigManager] 설정 검증 실패:`, errorDetails);
      throw new Error(`Configuration validation failed: ${errorDetails}`);
    }
    
    // 2. 경고 로그 출력
    if (Object.keys(validationResult.warnings).length > 0) {
      const warningDetails = Object.entries(validationResult.warnings)
        .map(([field, warnings]) => `${field}: ${warnings.join(', ')}`)
        .join('; ');
      console.warn(`[ConfigManager] 설정 경고:`, warningDetails);
    }
    
    // 3. readonly 제약을 우회하여 안전한 설정 병합
    // 타입 시스템의 readonly 보장을 유지하면서 내부적으로는 가변성 허용
    const validatedConfig: Record<string, any> = {};
    
    // 4. 검증된 필드만 추출
    for (const [key, value] of Object.entries(partialConfig)) {
      if (value !== undefined && value !== null) {
        validatedConfig[key] = value;
      }
    }
    
    // 5. 타입 안전 설정 병합
    const newConfig: CrawlerConfig = {
      ...this.config,
      ...validatedConfig
    } as CrawlerConfig;
    
    // 6. 내부 상태 업데이트
    this.config = newConfig;
    
    console.log(`[ConfigManager] 병합 후 설정:`, JSON.stringify(this.config, null, 2));
    
    // 7. 설정 저장
    try {
      this.saveConfig();
      console.log(`[ConfigManager] 설정 업데이트 및 저장 완료`);
    } catch (error) {
      console.error(`[ConfigManager] 설정 저장 실패:`, error);
      console.error(`[ConfigManager] 저장 실패한 설정:`, JSON.stringify(this.config, null, 2));
      // 저장 실패 시에도 메모리의 설정은 유지하지만 에러를 로그에 남김
    }
    
    // 6. 불변 복사본 반환 (structured clone 안전성)
    return JSON.parse(JSON.stringify(this.config));
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