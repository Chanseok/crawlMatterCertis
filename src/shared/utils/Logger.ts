/**
 * Logger.ts
 * CrawlerConf  setComponentLogLevel(component: string, level: LogLevel): void {
    this.componentLogLevels.set(component, level);
  }
  
  getComponentLogLevel(component: string): LogLevel {
    return this.componentLogLevels.get(component) || this.globalLogLevel;
  }

  setGlobalLogLevel(level: LogLevel): void {
    this.globalLogLevel = level;
  }

  getGlobalLogLevel(): LogLevel {
    return this.globalLogLevel;
  }

  setEnableStackTrace(enable: boolean): void {
    this.enableStackTrace = enable;
  }

  getEnableStackTrace(): boolean {
    return this.enableStackTrace;
  }

  setEnableTimestamp(enable: boolean): void {
    this.enableTimestamp = enable;
  }

  getEnableTimestamp(): boolean {
    return this.enableTimestamp;
  }

  getAllComponentLogLevels(): Map<string, LogLevel> {
    return new Map(this.componentLogLevels);
  } 통합된 로깅 시스템
 */

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  VERBOSE = 4
}

export class Logger {
  private static instance: Logger;
  private globalLogLevel: LogLevel = LogLevel.INFO;
  private componentLevels: Map<string, LogLevel> = new Map();
  private enableStackTrace: boolean = false;
  private enableTimestamp: boolean = true;
  private componentName?: string;
  
  constructor(componentName?: string) {
    this.componentName = componentName;
  }
  
  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }
  
  setGlobalLogLevel(level: LogLevel): void {
    this.globalLogLevel = level;
  }
  
  setComponentLogLevel(component: string, level: LogLevel): void {
    this.componentLevels.set(component, level);
  }
  
  setEnableStackTrace(enable: boolean): void {
    this.enableStackTrace = enable;
  }
  
  setEnableTimestamp(enable: boolean): void {
    this.enableTimestamp = enable;
  }
  
  private shouldLog(level: LogLevel, component?: string): boolean {
    // 글로벌 레벨 체크
    if (level > this.globalLogLevel) {
      return false;
    }
    
    // 컴포넌트별 레벨 체크
    if (component && this.componentLevels.has(component)) {
      const componentLevel = this.componentLevels.get(component)!;
      if (level > componentLevel) {
        return false;
      }
    }
    
    return true;
  }
  
  private formatMessage(level: string, message: string, component?: string): string {
    const timestamp = this.enableTimestamp ? 
      `${new Date().toLocaleTimeString()} › ` : '';
    const effectiveComponent = component || this.componentName;
    const componentTag = effectiveComponent ? `[${effectiveComponent}] ` : '';
    return `${timestamp}[${level}] ${componentTag}${message}`;
  }
  
  private formatData(data: any): string {
    if (data === undefined || data === null) return '';
    if (typeof data === 'string') return ` - ${data}`;
    if (typeof data === 'object') {
      try {
        return ` - ${JSON.stringify(data, null, 2)}`;
      } catch {
        return ` - [Object]`;
      }
    }
    return ` - ${String(data)}`;
  }
  
  error(message: string, componentOrData?: string | any, errorOrComponent?: Error | string): void {
    let component: string | undefined;
    let data: any;
    let error: Error | undefined;
    
    if (typeof componentOrData === 'string' && typeof errorOrComponent === 'object') {
      component = componentOrData;
      error = errorOrComponent as Error;
    } else if (typeof componentOrData === 'object' || typeof componentOrData === 'undefined') {
      data = componentOrData;
      if (typeof errorOrComponent === 'string') {
        component = errorOrComponent;
      }
    } else {
      component = componentOrData;
    }
    
    if (this.shouldLog(LogLevel.ERROR, component)) {
      const formattedData = this.formatData(data);
      console.error(this.formatMessage('ERROR', message, component) + formattedData);
      if (error && this.enableStackTrace) {
        console.error(error);
      }
    }
  }
  
  warn(message: string, componentOrData?: string | any): void {
    let component: string | undefined;
    let data: any;
    
    if (typeof componentOrData === 'string') {
      component = componentOrData;
    } else {
      data = componentOrData;
    }
    
    if (this.shouldLog(LogLevel.WARN, component)) {
      const formattedData = this.formatData(data);
      console.warn(this.formatMessage('WARN', message, component) + formattedData);
    }
  }
  
  info(message: string, componentOrData?: string | any): void {
    let component: string | undefined;
    let data: any;
    
    if (typeof componentOrData === 'string') {
      component = componentOrData;
    } else {
      data = componentOrData;
    }
    
    if (this.shouldLog(LogLevel.INFO, component)) {
      const formattedData = this.formatData(data);
      console.log(this.formatMessage('INFO', message, component) + formattedData);
    }
  }
  
  debug(message: string, componentOrData?: string | any): void {
    let component: string | undefined;
    let data: any;
    
    if (typeof componentOrData === 'string') {
      component = componentOrData;
    } else {
      data = componentOrData;
    }
    
    if (this.shouldLog(LogLevel.DEBUG, component)) {
      const formattedData = this.formatData(data);
      console.log(this.formatMessage('DEBUG', message, component) + formattedData);
    }
  }
  
  verbose(message: string, componentOrData?: string | any): void {
    let component: string | undefined;
    let data: any;
    
    if (typeof componentOrData === 'string') {
      component = componentOrData;
    } else {
      data = componentOrData;
    }
    
    if (this.shouldLog(LogLevel.VERBOSE, component)) {
      const formattedData = this.formatData(data);
      console.log(this.formatMessage('VERBOSE', message, component) + formattedData);
    }
  }
  
  log(message: string, componentOrData?: string | any): void {
    this.info(message, componentOrData);
  }
  
  trace(message: string, componentOrData?: string | any): void {
    let component: string | undefined;
    let data: any;
    
    if (typeof componentOrData === 'string') {
      component = componentOrData;
    } else {
      data = componentOrData;
    }
    
    if (this.shouldLog(LogLevel.VERBOSE, component) && this.enableStackTrace) {
      const formattedData = this.formatData(data);
      console.log(this.formatMessage('TRACE', message, component) + formattedData);
      console.trace();
    }
  }
  
  /**
   * CrawlerConfig로부터 로깅 설정을 초기화
   */
  initializeFromConfig(config: any): void {
    if (!config.logging) return;
    
    // 글로벌 로그 레벨 설정
    if (config.logging.level) {
      const levelMap: Record<string, LogLevel> = {
        'ERROR': LogLevel.ERROR,
        'WARN': LogLevel.WARN,
        'INFO': LogLevel.INFO,
        'DEBUG': LogLevel.DEBUG,
        'VERBOSE': LogLevel.VERBOSE
      };
      
      const globalLevel = levelMap[config.logging.level];
      if (globalLevel !== undefined) {
        this.setGlobalLogLevel(globalLevel);
      }
    }
    
    // 컴포넌트별 로그 레벨 설정
    if (config.logging.components) {
      const componentLevels = config.logging.components;
      
      // 각 컴포넌트별 레벨 설정
      if (componentLevels.CrawlerState) {
        this.setComponentLogLevel('CrawlerState', this.parseLogLevel(componentLevels.CrawlerState));
      }
      if (componentLevels.CrawlerEngine) {
        this.setComponentLogLevel('CrawlerEngine', this.parseLogLevel(componentLevels.CrawlerEngine));
      }
      if (componentLevels.ProductListCollector) {
        this.setComponentLogLevel('ProductListCollector', this.parseLogLevel(componentLevels.ProductListCollector));
      }
      if (componentLevels.ProductDetailCollector) {
        this.setComponentLogLevel('ProductDetailCollector', this.parseLogLevel(componentLevels.ProductDetailCollector));
      }
      if (componentLevels.PageCrawler) {
        this.setComponentLogLevel('PageCrawler', this.parseLogLevel(componentLevels.PageCrawler));
      }
      if (componentLevels.BrowserManager) {
        this.setComponentLogLevel('BrowserManager', this.parseLogLevel(componentLevels.BrowserManager));
      }
    }
    
    // 기타 설정
    if (config.logging.enableStackTrace !== undefined) {
      this.setEnableStackTrace(config.logging.enableStackTrace);
    }
    
    if (config.logging.enableTimestamp !== undefined) {
      this.setEnableTimestamp(config.logging.enableTimestamp);
    }
  }
  
  private parseLogLevel(level: string): LogLevel {
    const levelMap: Record<string, LogLevel> = {
      'ERROR': LogLevel.ERROR,
      'WARN': LogLevel.WARN,
      'INFO': LogLevel.INFO,
      'DEBUG': LogLevel.DEBUG,
      'VERBOSE': LogLevel.VERBOSE
    };
    
    return levelMap[level] || LogLevel.INFO;
  }
}

// 전역 로거 인스턴스
export const logger = Logger.getInstance();

// 기본 설정: CrawlerState는 WARN 레벨로 설정하여 verbose 출력 줄이기
logger.setComponentLogLevel('CrawlerState', LogLevel.WARN);
logger.setComponentLogLevel('BrowserManager', LogLevel.WARN);
logger.setEnableStackTrace(false);
