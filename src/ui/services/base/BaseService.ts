/**
 * BaseService.ts
 * 모든 서비스 클래스의 기본 클래스
 * 
 * 공통 기능과 표준화된 에러 처리, 로깅을 제공
 */

import { IPCService } from '../infrastructure/IPCService';
import { ResilienceManager } from '../resilience/ResilienceManager';
import { Logger } from '../../../shared/utils/Logger';

export interface ServiceError {
  code: string;
  message: string;
  details?: unknown;
  timestamp: Date;
}

export interface ServiceResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: ServiceError;
}

/**
 * 서비스 기본 클래스
 * 모든 도메인 서비스는 이 클래스를 상속받아 구현
 */
export abstract class BaseService {
  protected readonly serviceName: string;
  protected readonly ipcService: IPCService;
  protected readonly logger: Logger;
  protected resilienceManager?: ResilienceManager;

  constructor(serviceName: string) {
    this.serviceName = serviceName;
    this.ipcService = IPCService.getInstance();
    this.logger = new Logger(serviceName);
  }

  /**
   * 서비스 에러 생성
   */
  protected createError(code: string, message: string, details?: unknown): ServiceError {
    return {
      code,
      message,
      details,
      timestamp: new Date()
    };
  }

  /**
   * 성공 결과 생성
   */
  protected createSuccess<T>(data: T): ServiceResult<T> {
    return {
      success: true,
      data
    };
  }

  /**
   * 실패 결과 생성
   */
  protected createFailure<T = unknown>(error: ServiceError): ServiceResult<T> {
    return {
      success: false,
      error
    };
  }

  /**
   * 비동기 작업 래퍼 - 에러 처리와 로깅을 표준화
   */
  protected async executeOperation<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<ServiceResult<T>> {
    try {
      this.log(`Starting operation: ${operationName}`);
      const result = await operation();
      this.log(`Operation completed successfully: ${operationName}`);
      return this.createSuccess(result);
    } catch (error) {
      const serviceError = this.createError(
        'OPERATION_FAILED',
        `${operationName} failed: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
      this.logError(`Operation failed: ${operationName}`, serviceError);
      return this.createFailure(serviceError);
    }
  }

  /**
   * 서비스 로깅
   */
  protected log(message: string, data?: unknown): void {
    this.logger.info(message, data);
  }

  /**
   * 에러 로깅
   */
  protected logError(message: string, error: ServiceError): void {
    this.logger.error(message, error);
  }

  /**
   * IPC 연결 상태 확인
   */
  protected isIPCAvailable(): boolean {
    return this.ipcService.isAvailable;
  }

  /**
   * 회복력 관리자 상태 확인
   */
  protected getResilienceMetrics() {
    return this.resilienceManager?.getMetrics();
  }

  /**
   * 서비스 건강 상태 확인
   */
  protected isServiceHealthy(): boolean {
    return this.resilienceManager?.isHealthy() ?? true;
  }

  /**
   * 서비스 초기화 (필요시 하위 클래스에서 구현)
   */
  public async initialize?(): Promise<void>;

  /**
   * 서비스 리소스 정리 (필요시 하위 클래스에서 구현)
   */
  public async cleanup?(): Promise<void>;
}
