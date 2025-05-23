/**
 * page-crawler.ts
 * 제품 목록 페이지 크롤링을 담당하는 클래스
 * 전략 패턴을 사용하여 다양한 크롤링 방식 지원
 * 
 * 개선사항:
 * - 타입 임포트 방식 개선
 * - 에러 핸들링 강화
 * - 설정 관리 개선
 * - 리소스 해제 및 정리 과정 최적화
 */

import type { CrawlerConfig } from '../../../../types.js';
import { debugLog } from '../../util.js';
import { BrowserManager } from '../browser/BrowserManager.js';
import { 
  PageOperationError, 
  PageInitializationError, 
  PageTimeoutError, 
  PageNavigationError 
} from '../utils/page-errors.js';
import type { RawProductData, SitePageInfo } from './product-list-types.js';
import type { ICrawlerStrategy } from '../strategies/crawler-strategy.js';
import { CrawlerStrategyFactory, type CrawlerType } from '../strategies/crawler-strategy-factory.js';

/**
 * 페이지 크롤링 결과
 */
export interface PageCrawlResult {
  rawProducts: RawProductData[];
  url: string;
  pageNumber: number;
  attempt: number;
}

/**
 * 페이지 크롤러 클래스
 * 전략 패턴을 사용하여 다양한 크롤링 방식 지원
 */
export class PageCrawler {
  private crawlerStrategy: ICrawlerStrategy;
  private readonly config: CrawlerConfig;
  private readonly browserManager?: BrowserManager;
  private crawlerType: CrawlerType;

  /**
   * 페이지 크롤러 생성
   * @param browserManager 브라우저 매니저 인스턴스 (Playwright 전략에만 필요)
   * @param config 크롤러 설정
   * @throws {Error} 필수 매개변수가 누락된 경우 또는 전략 생성 실패 시
   */
  constructor(browserManager: BrowserManager, config: CrawlerConfig) {
    // 필수 매개변수 검증 및 오류 메시지 개선
    if (!browserManager) {
      const error = new Error('[PageCrawler] BrowserManager는 필수 매개변수입니다.');
      debugLog(`[PageCrawler] 초기화 실패: ${error.message}`);
      throw error;
    }
    
    if (!config) {
      const error = new Error('[PageCrawler] CrawlerConfig는 필수 매개변수입니다.');
      debugLog(`[PageCrawler] 초기화 실패: ${error.message}`);
      throw error;
    }
    
    // 필수 설정 값 검증
    if (!config.matterFilterUrl) {
      debugLog('[PageCrawler] 경고: matterFilterUrl이 설정되지 않았습니다. 크롤링이 실패할 수 있습니다.');
    }
    
    this.config = config;
    this.browserManager = browserManager;
    
    // config에서 crawlerType 가져오기 (기본값은 'axios')
    this.crawlerType = this.config.crawlerType || 'axios';
    
    debugLog(`[PageCrawler] 생성 중... 선택된 크롤링 전략: ${this.crawlerType}`);
    
    try {
      // 설정된 크롤러 전략 초기화
      this.crawlerStrategy = CrawlerStrategyFactory.createStrategy(
        this.crawlerType, 
        this.config, 
        this.browserManager
      );
      
      debugLog('[PageCrawler] 생성 완료');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      debugLog(`[PageCrawler] 전략 생성 실패: ${errorMessage}, 기본 전략(axios)으로 대체합니다.`);
      
      // 실패 시 기본 전략(axios)으로 대체
      this.crawlerType = 'axios';
      this.crawlerStrategy = CrawlerStrategyFactory.createStrategy(
        'axios',
        this.config,
        this.browserManager
      );
    }
  }
  
  /**
   * 설정 정보를 갱신합니다.
   * @param newConfig 새 설정 객체
   * @returns 갱신된 설정이 성공적으로 적용되었는지 여부
   */
  refreshConfig(newConfig: CrawlerConfig): boolean {
    if (!newConfig) {
      debugLog('[PageCrawler] 경고: 갱신할 설정 객체가 제공되지 않았습니다.');
      return false;
    }

    debugLog('[PageCrawler] 설정 갱신 시작...');
    
    try {
      // 기존 config와 병합하여 새로운 객체 생성 (Object.assign 대신 안전한 스프레드 연산자와 깊은 복사 사용)
      const updatedConfig = { 
        ...this.config, 
        ...JSON.parse(JSON.stringify(newConfig)) // 깊은 복사로 참조 문제 방지
      };
      
      // 잘못된 값 필터링 (undefined, null 제외)
      Object.keys(updatedConfig).forEach(key => {
        if (updatedConfig[key as keyof CrawlerConfig] === undefined || 
            updatedConfig[key as keyof CrawlerConfig] === null) {
          delete updatedConfig[key as keyof CrawlerConfig];
        }
      });
      
      // config 참조를 업데이트 (readonly가 아닌 경우)
      if (!Object.isFrozen(this.config)) {
        Object.keys(updatedConfig).forEach(key => {
          (this.config as any)[key] = (updatedConfig as any)[key];
        });
      }
      
      // 크롤러 타입이 변경되었으면 전략 객체 재생성
      const newCrawlerType = newConfig.crawlerType || this.crawlerType;
      if (newCrawlerType !== this.crawlerType) {
        const prevType = this.crawlerType;
        this.crawlerType = newCrawlerType;
        debugLog(`[PageCrawler] 크롤러 타입이 '${prevType}'에서 '${newCrawlerType}'으로 변경되었습니다. 전략 객체를 재생성합니다.`);
        
        try {
          // 새 전략 객체 생성
          this.crawlerStrategy = CrawlerStrategyFactory.createStrategy(
            this.crawlerType,
            this.config,
            this.browserManager
          );
          debugLog(`[PageCrawler] 새 전략(${this.crawlerType}) 생성 성공`);
        } catch (strategyError) {
          const errorMessage = strategyError instanceof Error ? 
            strategyError.message : String(strategyError);
          debugLog(`[PageCrawler] 새 전략 생성 실패: ${errorMessage}, 이전 전략(${prevType})으로 복구합니다.`);
          
          // 오류 발생 시 원래 타입으로 복구
          this.crawlerType = prevType;
          return false;
        }
      } else {
        debugLog(`[PageCrawler] 설정이 업데이트되었습니다. 크롤러 타입: ${this.crawlerType}`);
      }
      
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      debugLog(`[PageCrawler] 설정 갱신 중 오류 발생: ${errorMessage}`);
      return false;
    }
  }

  /**
   * 크롤링 전략 변경
   * @param crawlerType 크롤링 전략 유형 ('playwright' 또는 'axios')
   * @param forceInitialize 강제로 전략을 초기화할지 여부 (기본값: true)
   * @throws {Error} 지원되지 않는 크롤링 전략을 요청했거나, 전략 전환 중 오류가 발생한 경우
   */
  public async switchCrawlerStrategy(crawlerType: CrawlerType, forceInitialize: boolean = true): Promise<void> {
    // 유효성 검사
    if (!crawlerType || (crawlerType !== 'axios' && crawlerType !== 'playwright')) {
      const error = new Error(`[PageCrawler] 유효하지 않은 크롤링 전략: '${crawlerType}'. 'playwright' 또는 'axios'만 지원됩니다.`);
      debugLog(error.message);
      throw error;
    }
    
    // 이미 같은 전략을 사용 중이면 불필요한 처리 방지
    if (this.crawlerType === crawlerType) {
      debugLog(`[PageCrawler] 이미 ${crawlerType} 전략을 사용 중입니다.`);
      
      // 강제 초기화가 요청된 경우에만 초기화 실행
      if (forceInitialize) {
        try {
          debugLog(`[PageCrawler] 기존 ${crawlerType} 전략 강제 재초기화 시작...`);
          await this.crawlerStrategy.initialize();
          debugLog(`[PageCrawler] ${crawlerType} 전략 재초기화 완료`);
        } catch (initError) {
          const errorMessage = initError instanceof Error ? initError.message : String(initError);
          debugLog(`[PageCrawler] 전략 재초기화 실패: ${errorMessage}`);
        }
      }
      return;
    }
    
    // 전환 시작
    const previousType = this.crawlerType;
    let previousStrategy = this.crawlerStrategy;
    
    debugLog(`[PageCrawler] 크롤링 전략 변경 시작: ${previousType} → ${crawlerType}`);
    
    try {
      // 기존 전략 리소스 정리
      try {
        debugLog(`[PageCrawler] 기존 전략(${previousType}) 리소스 정리 중...`);
        await previousStrategy.cleanup();
        debugLog(`[PageCrawler] 기존 전략(${previousType}) 리소스 정리 완료`);
      } catch (cleanupError) {
        // 정리 중 오류가 발생해도 계속 진행
        const errorMessage = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
        debugLog(`[PageCrawler] 기존 전략 정리 중 오류 발생 (무시됨): ${errorMessage}`);
      }
      
      // 새 전략으로 전환
      this.crawlerType = crawlerType;
      debugLog(`[PageCrawler] 새 전략(${crawlerType}) 인스턴스 생성 중...`);
      
      this.crawlerStrategy = CrawlerStrategyFactory.createStrategy(
        this.crawlerType, 
        this.config, 
        this.browserManager
      );
      
      // 새 전략 초기화
      if (forceInitialize) {
        debugLog(`[PageCrawler] 새 전략(${crawlerType}) 초기화 중...`);
        await this.crawlerStrategy.initialize();
      }
      
      debugLog(`[PageCrawler] 크롤링 전략을 ${crawlerType}로 성공적으로 변경했습니다.`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      debugLog(`[PageCrawler] 크롤링 전략 변경 중 오류 발생: ${errorMessage}`);
      
      // 이전 전략으로 복구 시도
      try {
        debugLog(`[PageCrawler] 이전 전략(${previousType})으로 복구 시도 중...`);
        this.crawlerType = previousType;
        this.crawlerStrategy = previousStrategy;
        
        // 이전 전략이 아직 초기화되지 않았다면 초기화
        if (forceInitialize) {
          await this.crawlerStrategy.initialize();
        }
        debugLog(`[PageCrawler] 이전 전략(${previousType})으로 복구 성공`);
      } catch (recoveryError) {
        // 복구 실패 시 기본 전략(axios)으로 추가 복구 시도
        const fallbackType = 'axios';
        try {
          debugLog(`[PageCrawler] 이전 전략 복구 실패. 기본 전략(${fallbackType})으로 2차 복구 시도 중...`);
          
          this.crawlerType = fallbackType;
          this.crawlerStrategy = CrawlerStrategyFactory.createStrategy(
            fallbackType,
            this.config,
            this.browserManager
          );
          
          if (forceInitialize) {
            await this.crawlerStrategy.initialize();
          }
          debugLog(`[PageCrawler] 기본 전략(${fallbackType})으로 2차 복구 성공`);
        } catch (secondRecoveryError) {
          const secondErrorMsg = secondRecoveryError instanceof Error ? 
            secondRecoveryError.message : String(secondRecoveryError);
          debugLog(`[PageCrawler] 모든 복구 시도 실패: ${secondErrorMsg}`);
        }
      }
      
      // 원래 오류 전파 (명확한 오류 메시지와 원인 포함)
      throw new Error(`크롤링 전략 변경 실패 (${previousType} → ${crawlerType}): ${errorMessage}`, { cause: error });
    }
  }
  
  /**
   * 현재 사용 중인 크롤링 전략 확인
   * @returns 현재 크롤링 전략 유형
   */
  public getCurrentStrategy(): CrawlerType {
    return this.crawlerType;
  }
  
  /**
   * 현재 사용 중인 크롤링 전략에 대한 상세 정보 가져오기
   * @returns 전략 정보 객체
   */
  public getStrategyInfo(): { 
    type: CrawlerType; 
    details: string;
    className: string;
    status: 'active' | 'initializing' | 'unknown';
    config: Record<string, any>;
  } {
    const strategyClassName = this.crawlerStrategy?.constructor?.name || 'Unknown';
    
    // 관련 설정만 추출하여 반환
    const relevantConfig = {
      headlessBrowser: this.config.headlessBrowser,
      pageTimeoutMs: this.config.pageTimeoutMs,
      requestDelay: this.config.requestDelay,
      minRequestDelayMs: this.config.minRequestDelayMs,
      maxRequestDelayMs: this.config.maxRequestDelayMs,
      userAgent: this.config.userAgent ? '설정됨' : '기본값',
      matterFilterUrl: this.config.matterFilterUrl ? '설정됨' : '설정안됨',
      customUserAgent: this.config.customUserAgent ? '설정됨' : '설정안됨'
    };
    
    return {
      type: this.crawlerType,
      className: strategyClassName,
      status: this.crawlerStrategy ? 'active' : 'unknown',
      details: `${strategyClassName} (타입: ${this.crawlerType})`,
      config: relevantConfig
    };
  }
  
  /**
   * 전략 객체에 현재 설정 상태 전달
   * @returns 설정 전달 성공 여부
   */
  public updateStrategyConfig(): boolean {
    try {
      // 전략 객체 재생성 (설정 반영)
      this.crawlerStrategy = CrawlerStrategyFactory.createStrategy(
        this.crawlerType,
        this.config,
        this.browserManager
      );
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      debugLog(`[PageCrawler] 전략 설정 갱신 실패: ${errorMessage}`);
      return false;
    }
  }

  /**
   * 크롤러 초기화 (선택적)
   * @param forceFallback 초기화 실패 시 fallback 전략 사용 여부
   * @returns 초기화 성공 여부
   * @throws {Error} 초기화 중 오류가 발생하고 fallback이 비활성화된 경우
   */
  public async initialize(forceFallback: boolean = true): Promise<boolean> {
    debugLog(`[PageCrawler] 초기화 시작 (전략: ${this.crawlerType})`);
    
    try {
      debugLog(`[PageCrawler] ${this.crawlerStrategy.constructor.name} 전략 초기화 중...`);
      await this.crawlerStrategy.initialize();
      debugLog(`[PageCrawler] 초기화 완료`);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error 
        ? `초기화 실패: ${error.message}`
        : '초기화 중 알 수 없는 오류 발생';
      
      debugLog(`[PageCrawler] ${errorMessage}`);
      
      // 현재 전략이 이미 기본 전략(axios)인 경우
      if (this.crawlerType === 'axios' || !forceFallback) {
        throw new PageInitializationError(errorMessage, 0, 1);
      }
      
      // fallback 활성화된 경우 기본 전략으로 전환 시도
      try {
        debugLog('[PageCrawler] 초기화 실패, fallback(axios) 전략으로 전환 시도...');
        await this.switchCrawlerStrategy('axios', true);
        return true;
      } catch (fallbackError) {
        const fallbackErrorMsg = fallbackError instanceof Error 
          ? fallbackError.message 
          : String(fallbackError);
          
        debugLog(`[PageCrawler] fallback 전략으로 전환 실패: ${fallbackErrorMsg}`);
        throw new PageInitializationError(
          `초기화 실패 및 fallback 전환 실패: ${errorMessage}. Fallback 오류: ${fallbackErrorMsg}`, 
          0, 1
        );
      }
    }
  }

  /**
   * 특정 페이지 번호의 제품 목록을 크롤링
   * @param pageNumber 페이지 번호
   * @param signal 중단 신호
   * @param attempt 시도 횟수
   * @param autoSwitchStrategy 실패 시 다른 전략으로 자동 전환 여부
   * @returns 크롤링 결과
   * @throws {PageOperationError} 크롤링 작업 중 오류가 발생한 경우
   */
  public async crawlPage(
    pageNumber: number, 
    signal: AbortSignal, 
    attempt: number = 1,
    autoSwitchStrategy: boolean = false
  ): Promise<PageCrawlResult> {
    const startTime = Date.now();
    const currentStrategy = this.crawlerType;
    
    try {
      // 시그널이 이미 중지 상태인지 확인
      if (signal?.aborted) {
        throw new PageOperationError(
          `페이지 크롤링이 중단 요청으로 취소됨`,
          pageNumber,
          attempt
        );
      }
      
      // 페이지 번호 유효성 검사
      if (isNaN(pageNumber) || pageNumber < 1) {
        throw new PageOperationError(
          `유효하지 않은 페이지 번호: ${pageNumber}`,
          pageNumber,
          attempt
        );
      }

      debugLog(`[PageCrawler] 페이지 ${pageNumber} 크롤링 시작 (시도: ${attempt}, 전략: ${this.crawlerType})`);
      
      // 중단 신호 모니터링 이벤트 리스너 설정
      const abortListener = () => {
        debugLog(`[PageCrawler] 페이지 ${pageNumber} 크롤링 중단 신호 감지됨 (시도: ${attempt})`);
      };
      
      if (signal && !signal.aborted) {
        signal.addEventListener('abort', abortListener);
      }
      
      try {
        const result = await this.crawlerStrategy.crawlPage(pageNumber, signal, attempt);
        
        // 결과 유효성 간단 검사
        if (!result) {
          throw new PageOperationError(
            `페이지 ${pageNumber}의 크롤링 결과가 유효하지 않음 (결과 객체가 null/undefined)`,
            pageNumber,
            attempt
          );
        }
        
        if (!Array.isArray(result.rawProducts)) {
          throw new PageOperationError(
            `페이지 ${pageNumber}의 크롤링 결과가 유효하지 않음 (rawProducts 배열이 아님)`,
            pageNumber,
            attempt
          );
        }
        
        const timeTaken = Date.now() - startTime;
        debugLog(`[PageCrawler] 페이지 ${pageNumber} 크롤링 완료: ${result.rawProducts.length}개 제품 정보 수집 (${timeTaken}ms)`);
        
        // 빈 제품 목록 경고 로깅
        if (result.rawProducts.length === 0) {
          debugLog(`[PageCrawler] 경고: 페이지 ${pageNumber}에서 수집된 제품이 없습니다.`);
        }
        
        return result;
      } finally {
        // 이벤트 리스너 제거하여 메모리 누수 방지
        if (signal) {
          signal.removeEventListener('abort', abortListener);
        }
      }
    } catch (error) {
      const timeTaken = Date.now() - startTime;
      
      // 이미 PageOperationError인 경우 그대로 전파
      if (error instanceof PageOperationError) {
        debugLog(`[PageCrawler] 페이지 ${pageNumber} 크롤링 실패 (${error.message}) (${timeTaken}ms)`);
        
        // 자동 전략 전환이 활성화되고 최대 시도 횟수를 초과하지 않은 경우
        if (autoSwitchStrategy && attempt <= 1) {
          try {
            const alternativeStrategy: CrawlerType = currentStrategy === 'axios' ? 'playwright' : 'axios';
            debugLog(`[PageCrawler] 페이지 ${pageNumber} 크롤링 실패 후 ${alternativeStrategy} 전략으로 자동 전환 시도`);
            
            // 전략 전환
            await this.switchCrawlerStrategy(alternativeStrategy, true);
            
            // 새 전략으로 다시 시도
            debugLog(`[PageCrawler] 페이지 ${pageNumber} 크롤링 ${alternativeStrategy} 전략으로 재시도 중...`);
            return await this.crawlPage(pageNumber, signal, attempt + 1, false); // 재귀 호출 시 자동 전환 비활성화
          } catch (switchError) {
            debugLog(`[PageCrawler] 전략 전환 실패: ${switchError instanceof Error ? switchError.message : String(switchError)}`);
          }
        }
        
        throw error;
      }
      
      // 알려진 Error 타입인 경우
      if (error instanceof Error) {
        const errorMessage = `페이지 ${pageNumber} 크롤링 중 오류: ${error.message} (시도: ${attempt})`;
        debugLog(`[PageCrawler] ${errorMessage} (${timeTaken}ms)`);
        
        const pageError = new PageOperationError(
          errorMessage,
          pageNumber,
          attempt
        );
        
        // 원본 에러 cause로 설정하여 디버깅 용이성 향상
        (pageError as any).cause = error;
        throw pageError;
      }
      
      // 기타 알 수 없는 오류
      const unknownErrorMessage = `페이지 ${pageNumber} 크롤링 중 알 수 없는 오류 발생 (시도: ${attempt})`;
      debugLog(`[PageCrawler] ${unknownErrorMessage} (${timeTaken}ms)`);
      
      throw new PageOperationError(
        unknownErrorMessage,
        pageNumber,
        attempt
      );
    }
  }

  /**
   * 사이트의 총 페이지 수와 마지막 페이지의 제품 수 조회
   * @param autoSwitchStrategy 실패 시 다른 전략으로 자동 전환 여부
   * @returns 페이지 정보 (총 페이지 수, 마지막 페이지 제품 수, 정보를 가져온 시간)
   * @throws {Error} 페이지 정보를 가져오는 중 오류가 발생한 경우
   */
  public async fetchTotalPages(autoSwitchStrategy: boolean = false): Promise<{
    totalPages: number; 
    lastPageProductCount: number; 
    fetchedAt?: number;
    source: CrawlerType;
  }> {
    const startTime = Date.now();
    const currentStrategy = this.crawlerType;
    
    debugLog(`[PageCrawler] 총 페이지 수 조회 시작 (전략: ${this.crawlerType})`);
    
    try {
      const sitePageInfo: SitePageInfo = await this.crawlerStrategy.fetchTotalPages();
      
      // 결과 유효성 검사 (더 엄격하게)
      if (!sitePageInfo) {
        throw new PageInitializationError('페이지 정보 조회 결과가 null/undefined입니다', 0, 1);
      }
      
      if (typeof sitePageInfo.totalPages !== 'number') {
        throw new PageInitializationError(
          `총 페이지 수가 숫자가 아닙니다: ${sitePageInfo.totalPages} (${typeof sitePageInfo.totalPages})`,
          0, 
          1
        );
      }
      
      if (sitePageInfo.totalPages <= 0) {
        debugLog(`[PageCrawler] 경고: 총 페이지 수가 0보다 작거나 같습니다: ${sitePageInfo.totalPages}`);
      }
      
      const timeTaken = Date.now() - startTime;
      debugLog(`[PageCrawler] 총 페이지 수 조회 완료: ${sitePageInfo.totalPages}페이지, 마지막 페이지 제품 수: ${sitePageInfo.lastPageProductCount} (${timeTaken}ms)`);
      
      return {
        totalPages: sitePageInfo.totalPages,
        lastPageProductCount: sitePageInfo.lastPageProductCount,
        fetchedAt: sitePageInfo.fetchedAt || Date.now(),
        source: this.crawlerType
      };
    } catch (error) {
      const timeTaken = Date.now() - startTime;
      const isPageError = error instanceof PageOperationError || 
                          error instanceof PageInitializationError ||
                          error instanceof PageTimeoutError ||
                          error instanceof PageNavigationError;
                          
      const errorMessage = error instanceof Error 
        ? `총 페이지 수 조회 실패: ${error.message}`
        : '총 페이지 수 조회 중 알 수 없는 오류 발생';
      
      debugLog(`[PageCrawler] ${errorMessage} (${timeTaken}ms)`);
      
      // 자동 전략 전환이 활성화된 경우 
      if (autoSwitchStrategy) {
        try {
          const alternativeStrategy: CrawlerType = currentStrategy === 'axios' ? 'playwright' : 'axios';
          debugLog(`[PageCrawler] 총 페이지 수 조회 실패 후 ${alternativeStrategy} 전략으로 자동 전환 시도`);
          
          // 전략 전환
          await this.switchCrawlerStrategy(alternativeStrategy, true);
          
          // 새 전략으로 다시 시도 (재귀 호출)
          debugLog(`[PageCrawler] 총 페이지 수 조회를 ${alternativeStrategy} 전략으로 재시도 중...`);
          return await this.fetchTotalPages(false); // 재귀 호출 시 자동 전환 비활성화
        } catch (switchError) {
          debugLog(`[PageCrawler] 전략 전환 실패: ${switchError instanceof Error ? switchError.message : String(switchError)}`);
        }
      }
      
      // 에러 스택 추적을 위해 원본 에러를 cause로 설정
      // 이미 PageError 타입이면 타입 유지, 아니면 적절한 에러 타입으로 변환
      if (isPageError) {
        throw error; // 원본 PageError 타입 그대로 전파
      } else {
        // 적절한 에러 타입으로 변환
        throw new PageInitializationError(
          errorMessage,
          0,
          1
        );
      }
    }
  }

  /**
   * 리소스 정리
   * 이 메서드는 항상 호출해야 하며, 오류가 발생하더라도 최대한 모든 리소스를 정리하려 시도합니다.
   * @param forced 강제 정리 모드 여부 (기본값: false)
   * @returns 정리 완료 여부 (true: 성공, false: 일부 실패)
   */
  public async cleanup(forced: boolean = false): Promise<boolean> {
    debugLog(`[PageCrawler] 리소스 정리 시작 (전략: ${this.crawlerType}, 강제모드: ${forced})`);
    
    let cleanupSuccess = true;
    const cleanupErrors: string[] = [];
    
    // 1. 크롤링 전략 정리
    try {
      if (this.crawlerStrategy) {
        debugLog('[PageCrawler] 크롤링 전략 리소스 정리 중...');
        await this.crawlerStrategy.cleanup();
        debugLog('[PageCrawler] 크롤링 전략 리소스 정리 완료');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      cleanupErrors.push(`크롤링 전략 정리 실패: ${errorMessage}`);
      cleanupSuccess = false;
      
      debugLog(`[PageCrawler] 크롤링 전략 정리 중 오류: ${errorMessage}`);
      
      // 강제 모드에서는 추가 정리 시도
      if (forced) {
        try {
          debugLog('[PageCrawler] 강제 모드: 크롤링 전략 강제 정리 시도 중...');
          // 모든 전략에 공통적으로 적용되는 cleanup 메서드만 사용
          await this.crawlerStrategy.cleanup();
          debugLog('[PageCrawler] 크롤링 전략 강제 정리 완료');
        } catch (forceError) {
          const forceErrorMessage = forceError instanceof Error ? forceError.message : String(forceError);
          cleanupErrors.push(`강제 정리도 실패: ${forceErrorMessage}`);
          debugLog(`[PageCrawler] 강제 정리도 실패: ${forceErrorMessage}`);
        }
      }
    }
    
    // 2. 브라우저 매니저 정리 (있는 경우)
    try {
      if (this.browserManager && typeof this.browserManager.close === 'function') {
        debugLog('[PageCrawler] 브라우저 매니저 리소스 정리 중...');
        await this.browserManager.close();
        debugLog('[PageCrawler] 브라우저 매니저 리소스 정리 완료');
      } else if (this.browserManager && typeof this.browserManager.cleanupResources === 'function') {
        debugLog('[PageCrawler] 브라우저 매니저 cleanupResources 호출 중...');
        await this.browserManager.cleanupResources();
        debugLog('[PageCrawler] 브라우저 매니저 cleanupResources 완료');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      cleanupErrors.push(`브라우저 매니저 정리 실패: ${errorMessage}`);
      cleanupSuccess = false;
      debugLog(`[PageCrawler] 브라우저 매니저 정리 중 오류: ${errorMessage}`);
    }
    
    // 3. 강제 모드에서는 추가적인 메모리 해제 로직만 수행
    if (forced) {
      try {
        debugLog('[PageCrawler] 강제 모드: 내부 참조 정리 중...');
        // 내부 참조 정리 (가능한 범위에서)
        debugLog('[PageCrawler] 내부 참조 정리 완료');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        cleanupErrors.push(`내부 참조 정리 실패: ${errorMessage}`);
        cleanupSuccess = false;
        debugLog(`[PageCrawler] 내부 참조 정리 중 오류: ${errorMessage}`);
      }
    }
    
    // 4. 정리 결과 로깅
    if (cleanupSuccess) {
      debugLog('[PageCrawler] 모든 리소스 정리 완료');
    } else {
      debugLog(`[PageCrawler] 리소스 정리 중 일부 오류 발생 (${cleanupErrors.length}개): ${cleanupErrors.join(', ')}`);
    }
    
    return cleanupSuccess;
  }
}
