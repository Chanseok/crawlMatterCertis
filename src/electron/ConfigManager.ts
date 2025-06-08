import fs from 'fs';
import path from 'path';
import { electronResourcePaths } from './resourceManager.js';
import type { CrawlerConfig, MutableCrawlerConfig } from '../../types.js';
import { ConfigUtils, DEFAULT_CONFIG } from '../shared/utils/ConfigUtils.js';
import { configManagerLogger } from './utils/logger.js';

/**
 * ConfigManager.ts
 * Backend configuration management for Electron main process
 * 
 * REFACTORED: Now uses centralized ConfigUtils for:
 * - Default configuration values (ConfigUtils.DEFAULT_CONFIG)
 * - Configuration validation (ConfigUtils.validateConfig)
 * - Safe configuration merging (ConfigUtils.mergeConfig)
 * - Immutable configuration copying (ConfigUtils.cloneConfig)
 * 
 * This eliminates code duplication and standardizes configuration
 * patterns across the entire application.
 */

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
    
    // ConfigUtils를 사용한 안전한 설정 병합
    const mergeResult = ConfigUtils.mergeConfig(this.config, partialConfig);
    
    if (!mergeResult.success) {
      configManagerLogger.error('설정 병합 실패', { data: mergeResult.error });
      throw new Error(mergeResult.error || 'Configuration merge failed');
    }
    
    // 경고 로그 출력
    if (mergeResult.warnings && mergeResult.warnings.length > 0) {
      mergeResult.warnings.forEach(warning => {
        configManagerLogger.warn('설정 경고', { data: warning });
      });
    }
    
    // 내부 상태 업데이트
    this.config = mergeResult.data!;
    
    configManagerLogger.info('병합 후 설정', { data: JSON.stringify(this.config, null, 2) });
    
    // 설정 저장
    try {
      this.saveConfig();
      configManagerLogger.info('설정 업데이트 및 저장 완료');
    } catch (error) {
      configManagerLogger.error('설정 저장 실패', { data: error });
      configManagerLogger.error('저장 실패한 설정', { data: JSON.stringify(this.config, null, 2) });
      // 저장 실패 시에도 메모리의 설정은 유지하지만 에러를 로그에 남김
    }
    
    // 불변 복사본 반환
    return ConfigUtils.cloneConfig(this.config);
  }

  /**
   * 설정을 기본값으로 리셋합니다.
   */
  resetConfig(): CrawlerConfig {
    this.config = ConfigUtils.cloneConfig(DEFAULT_CONFIG) as MutableCrawlerConfig;
    this.saveConfig();
    return ConfigUtils.cloneConfig(this.config);
  }
}

// ConfigManager 싱글턴 인스턴스
export const configManager = new ConfigManager();