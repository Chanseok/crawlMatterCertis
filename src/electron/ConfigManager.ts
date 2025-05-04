import fs from 'fs';
import path from 'path';
import { electronResourcePaths } from './resourceManager.js';
import { CrawlerConfig } from '../../types.js';


// 기본 설정 값
const DEFAULT_CONFIG: CrawlerConfig = {
  pageRangeLimit: 10,
  productListRetryCount: 9,
  productDetailRetryCount: 9,
  productsPerPage: 12,
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
    if (this.config.productListRetryCount < 3) this.config.productListRetryCount = 3;
    if (this.config.productListRetryCount > 20) this.config.productListRetryCount = 20;
    
    if (this.config.productDetailRetryCount < 3) this.config.productDetailRetryCount = 3;
    if (this.config.productDetailRetryCount > 20) this.config.productDetailRetryCount = 20;
    
    if (this.config.pageRangeLimit < 1) this.config.pageRangeLimit = 1;
    if (this.config.pageRangeLimit > 100) this.config.pageRangeLimit = 100;
    
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