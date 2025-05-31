import { IPCService } from './IPCService';

/**
 * Service operation result interface
 */
export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp?: Date;
}

/**
 * Base Service Class
 * 
 * Provides common functionality for all service classes including:
 * - Safe IPC communication
 * - Error handling
 * - Logging
 * - Consistent result patterns
 */
export abstract class BaseService {
  protected ipcService = IPCService.getInstance();
  
  /**
   * 안전한 IPC 호출을 위한 헬퍼 메서드
   */
  protected async callIPC<T>(channel: string, data?: any): Promise<T> {
    try {
      return await this.ipcService.call<T>(channel, data);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`BaseService: IPC call failed for channel ${channel}:`, error);
      throw new Error(`Service communication failed: ${errorMessage}`);
    }
  }
  
  /**
   * 여러 IPC 호출을 배치로 처리
   */
  protected async callIPCBatch<T>(calls: Array<{ channel: string; data?: any }>): Promise<T[]> {
    const promises = calls.map(({ channel, data }) => this.callIPC<T>(channel, data));
    return Promise.all(promises);
  }
  
  /**
   * IPC 호출 가능 여부 확인
   */
  protected isIPCAvailable(): boolean {
    return this.ipcService.isAvailable();
  }
  
  /**
   * 서비스 초기화 (서브클래스에서 오버라이드 가능)
   */
  protected async initialize(): Promise<void> {
    if (!this.isIPCAvailable()) {
      throw new Error(`${this.constructor.name}: IPC service not available`);
    }
  }
  
  /**
   * 에러 로깅 헬퍼
   */
  protected logError(method: string, error: any, context?: any): void {
    console.error(`${this.constructor.name}.${method}:`, error, context);
  }
  
  /**
   * 디버그 로깅 헬퍼
   */
  protected logDebug(method: string, message: string, data?: any): void {
    console.log(`🔧 ${this.constructor.name}.${method}: ${message}`, data);
  }
  
  /**
   * Execute operation with consistent result handling
   */
  protected async executeOperation<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<ServiceResult<T>> {
    try {
      this.logDebug(operationName, 'Starting operation');
      const result = await operation();
      this.logDebug(operationName, 'Operation completed successfully');
      
      return {
        success: true,
        data: result,
        timestamp: new Date()
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logError(operationName, error);
      
      return {
        success: false,
        error: errorMessage,
        timestamp: new Date()
      };
    }
  }
  
  /**
   * Execute operation without result wrapping (for internal use)
   */
  protected async executeOperationRaw<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    try {
      this.logDebug(operationName, 'Starting operation');
      const result = await operation();
      this.logDebug(operationName, 'Operation completed successfully');
      return result;
    } catch (error) {
      this.logError(operationName, error);
      throw error;
    }
  }
}
