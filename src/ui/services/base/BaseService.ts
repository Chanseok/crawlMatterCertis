/**
 * BaseService.ts
 * 모든 서비스 클래스의 기본 클래스
 * 
 * 공통 기능과 표준화된 에러 처리, 로깅을 제공
 * 
 * Phase 3: Service Layer Refactoring
 * - Integrated EventSubscriptionManager for consistent event handling
 * - Enhanced resilience patterns integration
 * - Standardized service lifecycle management
 */

import { IPCService } from '../infrastructure/IPCService';
import { ResilienceManager } from '../resilience/ResilienceManager';
import { EventSubscriptionManager, UnsubscribeFunction, EventHandler } from './EventSubscriptionManager';
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
 * 
 * Phase 3 Enhanced Features:
 * - Integrated event subscription management
 * - Resilience patterns support
 * - Standardized lifecycle management
 */
export abstract class BaseService {
  protected readonly serviceName: string;
  protected readonly ipcService: IPCService;
  protected readonly logger: Logger;
  protected resilienceManager?: ResilienceManager;
  protected readonly eventManager: EventSubscriptionManager;

  constructor(serviceName: string) {
    this.serviceName = serviceName;
    this.ipcService = IPCService.getInstance();
    this.logger = new Logger(serviceName);
    this.eventManager = new EventSubscriptionManager(serviceName);
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
   * Enhanced with resilience patterns support
   */
  protected async executeOperation<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<ServiceResult<T>> {
    try {
      this.log(`Starting operation: ${operationName}`);
      
      let result: T;
      
      // Execute with resilience patterns if available
      if (this.resilienceManager) {
        result = await this.resilienceManager.execute(operation);
      } else {
        result = await operation();
      }
      
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

  // ================================
  // Event Subscription Management (Phase 3 Enhancement)
  // ================================

  /**
   * Subscribe to an event with standardized management
   */
  protected subscribeToEvent<T>(
    eventName: string,
    handler: EventHandler<T>,
    subscriptionFunction: (handler: EventHandler<T>) => UnsubscribeFunction | boolean
  ): UnsubscribeFunction {
    try {
      const result = subscriptionFunction(handler);
      
      if (typeof result === 'function') {
        // Direct unsubscribe function returned
        return this.eventManager.addSubscription(eventName, handler, result);
      } else if (result === true) {
        // Boolean success - create a placeholder unsubscribe (legacy compatibility)
        const unsubscribe = () => {
          this.log(`Legacy subscription cleanup for ${eventName}`);
        };
        return this.eventManager.addSubscription(eventName, handler, unsubscribe);
      } else {
        // Subscription failed
        throw new Error(`Failed to subscribe to ${eventName}`);
      }
    } catch (error) {
      this.logError(`Failed to subscribe to event: ${eventName}`, 
        this.createError('SUBSCRIPTION_ERROR', `Event subscription failed: ${eventName}`, error));
      
      // Return a no-op function for failed subscriptions
      return () => {};
    }
  }

  /**
   * Unsubscribe from an event
   */
  protected unsubscribeFromEvent(eventName: string): boolean {
    return this.eventManager.removeSubscription(eventName);
  }

  /**
   * Check if subscribed to an event
   */
  protected isSubscribedToEvent(eventName: string): boolean {
    return this.eventManager.isSubscribed(eventName);
  }

  /**
   * Get all active event subscriptions
   */
  protected getActiveSubscriptions(): string[] {
    return this.eventManager.getActiveSubscriptions();
  }

  // ================================
  // Service Lifecycle Management (Phase 3 Enhancement)
  // ================================

  /**
   * Initialize resilience manager with service-specific configuration
   */
  protected initializeResilience(config?: {
    enableCircuitBreaker?: boolean;
    enableRetry?: boolean;
    serviceType?: 'api' | 'database' | 'minimal';
  }): void {
    if (this.resilienceManager) {
      return; // Already initialized
    }

    const serviceType = config?.serviceType || 'minimal';
    
    switch (serviceType) {
      case 'api':
        this.resilienceManager = ResilienceManager.createForApi(this.serviceName, config);
        break;
      case 'database':
        this.resilienceManager = ResilienceManager.createForDatabase(this.serviceName, config);
        break;
      case 'minimal':
      default:
        this.resilienceManager = ResilienceManager.createMinimal(this.serviceName, config);
        break;
    }

    this.log(`Resilience manager initialized: ${serviceType} profile`);
  }

  /**
   * 서비스 초기화 (필요시 하위 클래스에서 구현)
   */
  public async initialize?(): Promise<void>;

  /**
   * 서비스 리소스 정리 (필요시 하위 클래스에서 구현)
   * Enhanced to include automatic event cleanup
   */
  public async cleanup(): Promise<void> {
    this.log('Starting service cleanup');
    
    // Clean up all event subscriptions
    this.eventManager.cleanup();
    
    // Log metrics before cleanup
    const resilienceMetrics = this.getResilienceMetrics();
    if (resilienceMetrics) {
      this.log('Final resilience metrics', resilienceMetrics);
    }
    
    const subscriptionMetrics = this.eventManager.getMetrics();
    this.log('Final subscription metrics', subscriptionMetrics);
    
    this.log('Service cleanup completed');
  }
}
