import { toJS } from 'mobx';

/**
 * Base ViewModel Class
 * 
 * Provides common functionality for all ViewModel classes including:
 * - Safe data conversion for service calls
 * - Error handling
 * - Lifecycle management
 * 
 * Note: Subclasses must call makeObservable(this) in their constructor
 * instead of makeAutoObservable to work with inheritance.
 */
export abstract class BaseViewModel {
  constructor() {
    // Note: MobX observability is handled by subclasses
    // Each subclass must call makeObservable(this) with appropriate configuration
  }
  
  /**
   * Initialize the ViewModel (called after construction)
   * Subclasses should override this for async initialization
   */
  async initialize(): Promise<void> {
    // Default implementation does nothing
  }

  /**
   * Cleanup resources when ViewModel is disposed
   * Subclasses should override this for cleanup
   */
  dispose(): void {
    // Default implementation does nothing
  }

  /**
   * Observable 데이터를 서비스로 안전하게 전달하기 위한 변환
   */
  protected toPlainObject<T>(data: T): T {
    if (data && typeof data === 'object') {
      try {
        return toJS(data);
      } catch (error) {
        console.warn(`${this.constructor.name}: Failed to convert MobX observable, using JSON fallback:`, error);
        return JSON.parse(JSON.stringify(data));
      }
    }
    return data;
  }
  
  /**
   * 서비스 호출 시 자동 변환을 적용하는 헬퍼
   */
  protected async callService<T>(
    serviceCall: (data: any) => Promise<T>, 
    data?: any
  ): Promise<T> {
    const plainData = this.toPlainObject(data);
    return serviceCall(plainData);
  }
  
  /**
   * 여러 데이터를 배치로 변환
   */
  protected toPlainObjects<T extends Record<string, any>>(data: T): T {
    const result = {} as T;
    for (const [key, value] of Object.entries(data)) {
      result[key as keyof T] = this.toPlainObject(value);
    }
    return result;
  }
  
  /**
   * 에러 처리 헬퍼
   */
  protected handleError(method: string, error: any, context?: any): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`${this.constructor.name}.${method}:`, errorMessage, context);
    
    // 서브클래스에서 오버라이드 가능한 에러 처리
    this.onError(method, error, context);
  }

  /**
   * 에러 처리 헬퍼 (레거시 호환성)
   */
  protected logError(method: string, error: any, context?: any): void {
    this.handleError(method, error, context);
  }
  
  /**
   * 에러 발생 시 호출되는 훅 (서브클래스에서 오버라이드)
   */
  protected onError(_method: string, _error: any, _context?: any): void {
    // 기본 구현은 비어있음 - 서브클래스에서 필요에 따라 구현
  }
  
  /**
   * 디버그 로깅 헬퍼
   */
  protected logDebug(method: string, message: string, data?: any): void {
    console.log(`🔧 ${this.constructor.name}.${method}: ${message}`, data);
  }
  
  /**
   * 상태 검증 헬퍼
   */
  protected validateState(condition: boolean, message: string): void {
    if (!condition) {
      throw new Error(`${this.constructor.name}: ${message}`);
    }
  }
}
