/**
 * Resilience Manager
 * 
 * Combines circuit breaker and retry policy for robust error handling.
 * Provides a unified interface for applying resilience patterns to service operations.
 */

import { CircuitBreaker, CircuitBreakerConfig, CircuitBreakerState } from './CircuitBreaker';
import { RetryPolicy, RetryConfig, RetryStrategy } from './RetryPolicy';

export interface ResilienceConfig {
  circuitBreaker?: CircuitBreakerConfig;
  retry?: RetryConfig;
  enableCircuitBreaker?: boolean;
  enableRetry?: boolean;
}

export interface ResilienceMetrics {
  circuitBreaker?: any;
  retry?: any;
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  averageExecutionTime: number;
  lastOperationTime?: number;
}

export class ResilienceManager {
  private circuitBreaker?: CircuitBreaker;
  private retryPolicy?: RetryPolicy;
  private metrics: ResilienceMetrics;

  constructor(
    name: string,
    config: ResilienceConfig = {}
  ) {
    // Initialize circuit breaker if enabled
    if (config.enableCircuitBreaker !== false && config.circuitBreaker) {
      this.circuitBreaker = new CircuitBreaker(
        `${name}-circuit-breaker`,
        config.circuitBreaker
      );
    }

    // Initialize retry policy if enabled
    if (config.enableRetry !== false && config.retry) {
      this.retryPolicy = new RetryPolicy(
        `${name}-retry-policy`,
        config.retry
      );
    }

    this.metrics = {
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0,
      averageExecutionTime: 0
    };
  }

  /**
   * Execute operation with resilience patterns
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    const startTime = Date.now();
    this.metrics.totalOperations++;

    try {
      let result: T;

      // Apply circuit breaker if available
      if (this.circuitBreaker) {
        result = await this.circuitBreaker.execute(async () => {
          // Apply retry policy if available
          if (this.retryPolicy) {
            return await this.retryPolicy.execute(operation);
          } else {
            return await operation();
          }
        });
      } else if (this.retryPolicy) {
        // Only retry policy available
        result = await this.retryPolicy.execute(operation);
      } else {
        // No resilience patterns, execute directly
        result = await operation();
      }

      this.recordSuccess(startTime);
      return result;

    } catch (error) {
      this.recordFailure(startTime);
      throw error;
    }
  }

  /**
   * Record successful operation
   */
  private recordSuccess(startTime: number): void {
    const executionTime = Date.now() - startTime;
    this.metrics.successfulOperations++;
    this.updateAverageExecutionTime(executionTime);
    this.metrics.lastOperationTime = Date.now();
  }

  /**
   * Record failed operation
   */
  private recordFailure(startTime: number): void {
    const executionTime = Date.now() - startTime;
    this.metrics.failedOperations++;
    this.updateAverageExecutionTime(executionTime);
    this.metrics.lastOperationTime = Date.now();
  }

  /**
   * Update average execution time
   */
  private updateAverageExecutionTime(executionTime: number): void {
    const totalOps = this.metrics.totalOperations;
    const currentAvg = this.metrics.averageExecutionTime;
    
    // Calculate new average using incremental approach
    this.metrics.averageExecutionTime = 
      ((currentAvg * (totalOps - 1)) + executionTime) / totalOps;
  }

  /**
   * Get comprehensive metrics
   */
  getMetrics(): ResilienceMetrics {
    return {
      ...this.metrics,
      circuitBreaker: this.circuitBreaker?.getMetrics(),
      retry: this.retryPolicy?.getMetrics()
    };
  }

  /**
   * Check if the service is healthy
   */
  isHealthy(): boolean {
    // Check circuit breaker health
    if (this.circuitBreaker && !this.circuitBreaker.isHealthy()) {
      return false;
    }

    // Check overall success rate
    const totalOps = this.metrics.totalOperations;
    if (totalOps === 0) {
      return true; // No operations yet, considered healthy
    }

    const successRate = this.metrics.successfulOperations / totalOps;
    return successRate >= 0.9; // 90% success rate considered healthy
  }

  /**
   * Get current circuit breaker state
   */
  getCircuitBreakerState(): CircuitBreakerState | undefined {
    return this.circuitBreaker?.getState();
  }

  /**
   * Force circuit breaker state (for manual intervention)
   */
  forceCircuitBreakerState(state: CircuitBreakerState, reason?: string): void {
    if (this.circuitBreaker) {
      this.circuitBreaker.forceState(state, reason);
    }
  }

  /**
   * Reset all metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0,
      averageExecutionTime: 0
    };

    this.retryPolicy?.resetMetrics();
    // Circuit breaker metrics are not resettable by design
  }

  /**
   * Create resilience manager with default configuration for API calls
   */
  static createForApi(name: string, overrides?: Partial<ResilienceConfig>): ResilienceManager {
    const defaultConfig: ResilienceConfig = {
      enableCircuitBreaker: true,
      enableRetry: true,
      circuitBreaker: {
        failureThreshold: 5,
        successThreshold: 3,
        timeout: 60000, // 1 minute
        monitoringWindow: 120000 // 2 minutes
      },
      retry: {
        maxAttempts: 3,
        baseDelayMs: 1000,
        maxDelayMs: 10000,
        strategy: RetryStrategy.EXPONENTIAL_BACKOFF,
        backoffMultiplier: 2,
        jitter: true
      }
    };

    return new ResilienceManager(name, { ...defaultConfig, ...overrides });
  }

  /**
   * Create resilience manager with default configuration for database operations
   */
  static createForDatabase(name: string, overrides?: Partial<ResilienceConfig>): ResilienceManager {
    const defaultConfig: ResilienceConfig = {
      enableCircuitBreaker: true,
      enableRetry: true,
      circuitBreaker: {
        failureThreshold: 3,
        successThreshold: 2,
        timeout: 30000, // 30 seconds
        monitoringWindow: 60000 // 1 minute
      },
      retry: {
        maxAttempts: 3,
        baseDelayMs: 500,
        maxDelayMs: 5000,
        strategy: RetryStrategy.EXPONENTIAL_BACKOFF,
        backoffMultiplier: 1.5,
        jitter: false
      }
    };

    return new ResilienceManager(name, { ...defaultConfig, ...overrides });
  }

  /**
   * Create resilience manager with minimal configuration for fast operations
   */
  static createMinimal(name: string, overrides?: Partial<ResilienceConfig>): ResilienceManager {
    const defaultConfig: ResilienceConfig = {
      enableCircuitBreaker: false,
      enableRetry: true,
      retry: {
        maxAttempts: 2,
        baseDelayMs: 100,
        maxDelayMs: 1000,
        strategy: RetryStrategy.FIXED,
        backoffMultiplier: 1,
        jitter: false
      }
    };

    return new ResilienceManager(name, { ...defaultConfig, ...overrides });
  }
}
