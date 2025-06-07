/**
 * Retry Policy Implementation
 * 
 * Provides configurable retry mechanisms with different strategies:
 * - Fixed delay
 * - Exponential backoff
 * - Linear backoff
 * - Custom delay function
 */

export enum RetryStrategy {
  FIXED = 'FIXED',
  EXPONENTIAL_BACKOFF = 'EXPONENTIAL_BACKOFF',
  LINEAR_BACKOFF = 'LINEAR_BACKOFF',
  CUSTOM = 'CUSTOM'
}

export interface RetryConfig {
  maxAttempts: number;                    // Maximum number of retry attempts
  baseDelayMs: number;                   // Base delay between retries
  maxDelayMs: number;                    // Maximum delay cap
  strategy: RetryStrategy;               // Retry strategy
  backoffMultiplier: number;             // Multiplier for backoff strategies
  jitter: boolean;                       // Add random jitter to delays
  retryCondition?: (error: any) => boolean; // Custom condition for retrying
  customDelayFn?: (attempt: number, baseDelay: number) => number; // Custom delay function
}

export interface RetryMetrics {
  totalAttempts: number;
  successfulRetries: number;
  failedRetries: number;
  totalDelayTime: number;
  averageDelayPerRetry: number;
  retryReasons: Array<{
    attempt: number;
    error: string;
    delay: number;
    timestamp: number;
  }>;
}

export class RetryPolicy {
  private metrics: RetryMetrics;

  constructor(
    _name: string,
    private readonly config: RetryConfig
  ) {
    this.metrics = {
      totalAttempts: 0,
      successfulRetries: 0,
      failedRetries: 0,
      totalDelayTime: 0,
      averageDelayPerRetry: 0,
      retryReasons: []
    };
  }

  /**
   * Execute operation with retry logic
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: any;
    
    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      try {
        this.metrics.totalAttempts++;
        const result = await operation();
        
        if (attempt > 1) {
          this.metrics.successfulRetries++;
        }
        
        return result;
      } catch (error) {
        lastError = error;
        
        // Check if we should retry this error
        if (!this.shouldRetry(error, attempt)) {
          this.metrics.failedRetries++;
          throw error;
        }
        
        // Don't delay after the last attempt
        if (attempt < this.config.maxAttempts) {
          const delay = this.calculateDelay(attempt);
          
          this.recordRetryAttempt(attempt, error, delay);
          
          if (delay > 0) {
            await this.sleep(delay);
          }
        }
      }
    }
    
    this.metrics.failedRetries++;
    throw new Error(`Operation failed after ${this.config.maxAttempts} attempts. Last error: ${lastError?.message || 'Unknown error'}`);
  }

  /**
   * Determine if the operation should be retried
   */
  private shouldRetry(error: any, attempt: number): boolean {
    // Don't retry if we've reached max attempts
    if (attempt >= this.config.maxAttempts) {
      return false;
    }

    // Use custom retry condition if provided
    if (this.config.retryCondition) {
      return this.config.retryCondition(error);
    }

    // Default retry conditions
    if (error?.name === 'AbortError') {
      return false; // Don't retry aborted operations
    }

    // Retry on network errors, timeouts, and 5xx status codes
    const retryableErrors = [
      'NetworkError',
      'TimeoutError',
      'ECONNRESET',
      'ECONNREFUSED',
      'ENOTFOUND',
      'ETIMEDOUT'
    ];

    const errorString = error?.toString() || '';
    const isRetryableError = retryableErrors.some(retryableError => 
      errorString.includes(retryableError)
    );

    // Check for HTTP status codes
    const statusCode = error?.response?.status || error?.status;
    const isRetryableStatus = statusCode >= 500 || statusCode === 429; // 5xx or rate limit

    return isRetryableError || isRetryableStatus;
  }

  /**
   * Calculate delay based on retry strategy
   */
  private calculateDelay(attempt: number): number {
    let delay: number;

    switch (this.config.strategy) {
      case RetryStrategy.FIXED:
        delay = this.config.baseDelayMs;
        break;

      case RetryStrategy.EXPONENTIAL_BACKOFF:
        delay = this.config.baseDelayMs * Math.pow(this.config.backoffMultiplier, attempt - 1);
        break;

      case RetryStrategy.LINEAR_BACKOFF:
        delay = this.config.baseDelayMs * attempt * this.config.backoffMultiplier;
        break;

      case RetryStrategy.CUSTOM:
        if (this.config.customDelayFn) {
          delay = this.config.customDelayFn(attempt, this.config.baseDelayMs);
        } else {
          delay = this.config.baseDelayMs;
        }
        break;

      default:
        delay = this.config.baseDelayMs;
    }

    // Apply maximum delay cap
    delay = Math.min(delay, this.config.maxDelayMs);

    // Add jitter if enabled
    if (this.config.jitter) {
      const jitterRange = delay * 0.1; // 10% jitter
      const jitter = (Math.random() - 0.5) * 2 * jitterRange;
      delay = Math.max(0, delay + jitter);
    }

    return Math.floor(delay);
  }

  /**
   * Record retry attempt for metrics
   */
  private recordRetryAttempt(attempt: number, error: any, delay: number): void {
    this.metrics.totalDelayTime += delay;
    
    this.metrics.retryReasons.push({
      attempt,
      error: error?.message || error?.toString() || 'Unknown error',
      delay,
      timestamp: Date.now()
    });

    // Keep only last 100 retry reasons for memory efficiency
    if (this.metrics.retryReasons.length > 100) {
      this.metrics.retryReasons = this.metrics.retryReasons.slice(-100);
    }

    // Update average delay
    const totalRetries = this.metrics.retryReasons.length;
    this.metrics.averageDelayPerRetry = totalRetries > 0 
      ? this.metrics.totalDelayTime / totalRetries 
      : 0;
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get retry metrics
   */
  getMetrics(): RetryMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalAttempts: 0,
      successfulRetries: 0,
      failedRetries: 0,
      totalDelayTime: 0,
      averageDelayPerRetry: 0,
      retryReasons: []
    };
  }

  /**
   * Create a retry policy with common configurations
   */
  static createDefault(name: string, overrides?: Partial<RetryConfig>): RetryPolicy {
    const defaultConfig: RetryConfig = {
      maxAttempts: 3,
      baseDelayMs: 1000,
      maxDelayMs: 10000,
      strategy: RetryStrategy.EXPONENTIAL_BACKOFF,
      backoffMultiplier: 2,
      jitter: true
    };

    return new RetryPolicy(name, { ...defaultConfig, ...overrides });
  }

  /**
   * Create a retry policy for network operations
   */
  static createForNetwork(name: string, overrides?: Partial<RetryConfig>): RetryPolicy {
    const networkConfig: RetryConfig = {
      maxAttempts: 5,
      baseDelayMs: 1000,
      maxDelayMs: 30000,
      strategy: RetryStrategy.EXPONENTIAL_BACKOFF,
      backoffMultiplier: 2,
      jitter: true,
      retryCondition: (error: any) => {
        // Retry on network errors and 5xx status codes
        const networkErrors = ['NetworkError', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT'];
        const errorString = error?.toString() || '';
        const hasNetworkError = networkErrors.some(ne => errorString.includes(ne));
        
        const statusCode = error?.response?.status || error?.status;
        const isServerError = statusCode >= 500 || statusCode === 429;
        
        return hasNetworkError || isServerError;
      }
    };

    return new RetryPolicy(name, { ...networkConfig, ...overrides });
  }

  /**
   * Create a retry policy for database operations
   */
  static createForDatabase(name: string, overrides?: Partial<RetryConfig>): RetryPolicy {
    const dbConfig: RetryConfig = {
      maxAttempts: 3,
      baseDelayMs: 500,
      maxDelayMs: 5000,
      strategy: RetryStrategy.EXPONENTIAL_BACKOFF,
      backoffMultiplier: 2,
      jitter: false, // Database operations prefer consistent timing
      retryCondition: (error: any) => {
        // Retry on connection errors and lock timeouts
        const dbErrors = ['SQLITE_BUSY', 'SQLITE_LOCKED', 'ECONNRESET', 'connection'];
        const errorString = error?.toString() || '';
        
        return dbErrors.some(dbError => errorString.includes(dbError));
      }
    };

    return new RetryPolicy(name, { ...dbConfig, ...overrides });
  }
}
