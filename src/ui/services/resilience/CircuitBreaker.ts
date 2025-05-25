/**
 * Circuit Breaker Pattern Implementation
 * 
 * Prevents cascading failures by failing fast when a service is experiencing issues.
 * The circuit breaker has three states:
 * - CLOSED: Normal operation, requests are allowed through
 * - OPEN: Service is failing, requests are immediately rejected
 * - HALF_OPEN: Testing if service has recovered
 */

export enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

export interface CircuitBreakerConfig {
  failureThreshold: number;      // Number of failures before opening circuit
  successThreshold: number;      // Number of successes in HALF_OPEN before closing
  timeout: number;              // Time in ms before attempting recovery (OPEN -> HALF_OPEN)
  monitoringWindow: number;     // Time window in ms for counting failures
}

export interface CircuitBreakerMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  circuitOpenCount: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
  currentState: CircuitBreakerState;
  stateChanges: Array<{
    state: CircuitBreakerState;
    timestamp: number;
    reason: string;
  }>;
}

export class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private lastSuccessTime = 0;
  private nextAttemptTime = 0;
  private metrics: CircuitBreakerMetrics;

  constructor(
    private readonly name: string,
    private readonly config: CircuitBreakerConfig
  ) {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      circuitOpenCount: 0,
      currentState: this.state,
      stateChanges: [{
        state: this.state,
        timestamp: Date.now(),
        reason: 'Circuit breaker initialized'
      }]
    };
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (!this.canExecute()) {
      throw new Error(`Circuit breaker [${this.name}] is OPEN. Operation rejected.`);
    }

    this.metrics.totalRequests++;

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Check if the circuit breaker allows execution
   */
  private canExecute(): boolean {
    const now = Date.now();

    switch (this.state) {
      case CircuitBreakerState.CLOSED:
        return true;

      case CircuitBreakerState.OPEN:
        if (now >= this.nextAttemptTime) {
          this.setState(CircuitBreakerState.HALF_OPEN, 'Timeout expired, attempting recovery');
          return true;
        }
        return false;

      case CircuitBreakerState.HALF_OPEN:
        return true;

      default:
        return false;
    }
  }

  /**
   * Handle successful operation
   */
  private onSuccess(): void {
    this.lastSuccessTime = Date.now();
    this.metrics.successfulRequests++;

    switch (this.state) {
      case CircuitBreakerState.HALF_OPEN:
        this.successCount++;
        if (this.successCount >= this.config.successThreshold) {
          this.setState(CircuitBreakerState.CLOSED, 'Sufficient successes in HALF_OPEN state');
          this.reset();
        }
        break;

      case CircuitBreakerState.CLOSED:
        this.reset();
        break;
    }
  }

  /**
   * Handle failed operation
   */
  private onFailure(): void {
    this.lastFailureTime = Date.now();
    this.failureCount++;
    this.metrics.failedRequests++;

    switch (this.state) {
      case CircuitBreakerState.HALF_OPEN:
        this.setState(CircuitBreakerState.OPEN, 'Failure in HALF_OPEN state');
        this.nextAttemptTime = Date.now() + this.config.timeout;
        this.successCount = 0;
        break;

      case CircuitBreakerState.CLOSED:
        if (this.shouldOpen()) {
          this.setState(CircuitBreakerState.OPEN, 'Failure threshold exceeded');
          this.nextAttemptTime = Date.now() + this.config.timeout;
          this.metrics.circuitOpenCount++;
        }
        break;
    }
  }

  /**
   * Determine if circuit should open based on failure count and time window
   */
  private shouldOpen(): boolean {
    if (this.failureCount < this.config.failureThreshold) {
      return false;
    }

    // Check if failures occurred within the monitoring window
    const now = Date.now();
    const windowStart = now - this.config.monitoringWindow;
    
    return this.lastFailureTime >= windowStart;
  }

  /**
   * Reset failure and success counts
   */
  private reset(): void {
    this.failureCount = 0;
    this.successCount = 0;
  }

  /**
   * Set circuit breaker state and record the change
   */
  private setState(newState: CircuitBreakerState, reason: string): void {
    if (this.state !== newState) {
      this.state = newState;
      this.metrics.currentState = newState;
      this.metrics.stateChanges.push({
        state: newState,
        timestamp: Date.now(),
        reason
      });

      // Keep only last 50 state changes for memory efficiency
      if (this.metrics.stateChanges.length > 50) {
        this.metrics.stateChanges = this.metrics.stateChanges.slice(-50);
      }
    }
  }

  /**
   * Get current circuit breaker metrics
   */
  getMetrics(): CircuitBreakerMetrics {
    return {
      ...this.metrics,
      lastFailureTime: this.lastFailureTime || undefined,
      lastSuccessTime: this.lastSuccessTime || undefined
    };
  }

  /**
   * Get current state
   */
  getState(): CircuitBreakerState {
    return this.state;
  }

  /**
   * Force circuit breaker to specific state (for testing/manual intervention)
   */
  forceState(state: CircuitBreakerState, reason: string = 'Manual intervention'): void {
    this.setState(state, reason);
    
    if (state === CircuitBreakerState.CLOSED) {
      this.reset();
    } else if (state === CircuitBreakerState.OPEN) {
      this.nextAttemptTime = Date.now() + this.config.timeout;
    }
  }

  /**
   * Check if circuit breaker is healthy (CLOSED state with low failure rate)
   */
  isHealthy(): boolean {
    if (this.state !== CircuitBreakerState.CLOSED) {
      return false;
    }

    const totalRequests = this.metrics.totalRequests;
    if (totalRequests === 0) {
      return true; // No requests yet, considered healthy
    }

    const failureRate = this.metrics.failedRequests / totalRequests;
    return failureRate < 0.1; // Less than 10% failure rate considered healthy
  }
}
