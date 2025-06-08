/**
 * EventSubscriptionManager.ts
 * Standardized Event Subscription Management for Services
 * 
 * Phase 3: Service Layer Refactoring
 * - Provides consistent event subscription patterns
 * - Centralized subscription/unsubscription handling
 * - Type-safe event management
 * - Automatic cleanup on service destruction
 */

export type UnsubscribeFunction = () => void;
export type EventHandler<T = any> = (data: T) => void;

export interface EventSubscription<T = any> {
  eventName: string;
  handler: EventHandler<T>;
  unsubscribe: UnsubscribeFunction;
  isActive: boolean;
  createdAt: Date;
}

/**
 * Standardized Event Subscription Manager
 * 
 * Provides consistent subscription management across all services
 */
export class EventSubscriptionManager {
  private subscriptions: Map<string, EventSubscription> = new Map();
  private readonly serviceName: string;

  constructor(serviceName: string) {
    this.serviceName = serviceName;
  }

  /**
   * Add a subscription to management
   */
  public addSubscription<T>(
    eventName: string,
    handler: EventHandler<T>,
    unsubscribe: UnsubscribeFunction
  ): UnsubscribeFunction {
    // If already subscribed, unsubscribe first
    if (this.subscriptions.has(eventName)) {
      this.removeSubscription(eventName);
    }

    const subscription: EventSubscription<T> = {
      eventName,
      handler,
      unsubscribe,
      isActive: true,
      createdAt: new Date()
    };

    this.subscriptions.set(eventName, subscription);

    // Return a wrapper that also removes from our management
    return () => {
      this.removeSubscription(eventName);
    };
  }

  /**
   * Remove a specific subscription
   */
  public removeSubscription(eventName: string): boolean {
    const subscription = this.subscriptions.get(eventName);
    if (!subscription) {
      return false;
    }

    try {
      if (subscription.isActive) {
        subscription.unsubscribe();
        subscription.isActive = false;
      }
      this.subscriptions.delete(eventName);
      return true;
    } catch (error) {
      console.error(`[${this.serviceName}] Error unsubscribing from ${eventName}:`, error);
      // Still remove from our tracking even if unsubscribe failed
      this.subscriptions.delete(eventName);
      return false;
    }
  }

  /**
   * Check if subscribed to an event
   */
  public isSubscribed(eventName: string): boolean {
    const subscription = this.subscriptions.get(eventName);
    return subscription?.isActive === true;
  }

  /**
   * Get all active subscriptions
   */
  public getActiveSubscriptions(): string[] {
    return Array.from(this.subscriptions.entries())
      .filter(([, subscription]) => subscription.isActive)
      .map(([eventName]) => eventName);
  }

  /**
   * Get subscription information
   */
  public getSubscriptionInfo(eventName: string): EventSubscription | undefined {
    return this.subscriptions.get(eventName);
  }

  /**
   * Clean up all subscriptions
   */
  public cleanup(): void {
    const activeSubscriptions = Array.from(this.subscriptions.keys());
    
    for (const eventName of activeSubscriptions) {
      this.removeSubscription(eventName);
    }

    console.log(`[${this.serviceName}] Cleaned up ${activeSubscriptions.length} event subscriptions`);
  }

  /**
   * Get subscription metrics
   */
  public getMetrics(): {
    totalSubscriptions: number;
    activeSubscriptions: number;
    oldestSubscription?: Date;
    newestSubscription?: Date;
  } {
    const active = Array.from(this.subscriptions.values()).filter(s => s.isActive);
    const dates = active.map(s => s.createdAt);

    return {
      totalSubscriptions: this.subscriptions.size,
      activeSubscriptions: active.length,
      oldestSubscription: dates.length > 0 ? new Date(Math.min(...dates.map(d => d.getTime()))) : undefined,
      newestSubscription: dates.length > 0 ? new Date(Math.max(...dates.map(d => d.getTime()))) : undefined,
    };
  }
}
