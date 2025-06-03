/**
 * EventBus.ts
 * Centralized Event Bus for Store Communication
 * 
 * Provides a clean way to communicate between stores without direct dependencies,
 * preventing circular imports and improving bundle optimization.
 */

export type EventType = string;
export type EventHandler<T = any> = (data: T) => void;

interface EventMap {
  [eventType: string]: EventHandler[];
}

/**
 * Simple Event Bus implementation for decoupled store communication
 */
class EventBus {
  private events: EventMap = {};

  /**
   * Subscribe to an event
   */
  on<T = any>(eventType: EventType, handler: EventHandler<T>): () => void {
    if (!this.events[eventType]) {
      this.events[eventType] = [];
    }
    
    this.events[eventType].push(handler);
    
    // Return unsubscribe function
    return () => this.off(eventType, handler);
  }

  /**
   * Unsubscribe from an event
   */
  off<T = any>(eventType: EventType, handler: EventHandler<T>): void {
    if (!this.events[eventType]) return;
    
    const index = this.events[eventType].indexOf(handler);
    if (index > -1) {
      this.events[eventType].splice(index, 1);
    }
  }

  /**
   * Emit an event
   */
  emit<T = any>(eventType: EventType, data?: T): void {
    if (!this.events[eventType]) return;
    
    this.events[eventType].forEach(handler => {
      try {
        handler(data);
      } catch (error) {
        console.error(`[EventBus] Error in event handler for ${eventType}:`, error);
      }
    });
  }

  /**
   * Remove all listeners for an event type
   */
  removeAllListeners(eventType?: EventType): void {
    if (eventType) {
      delete this.events[eventType];
    } else {
      this.events = {};
    }
  }

  /**
   * Get the count of listeners for an event type
   */
  listenerCount(eventType: EventType): number {
    return this.events[eventType]?.length || 0;
  }
}

// Singleton instance for store communication
export const storeEventBus = new EventBus();

// Event types for type safety
export const STORE_EVENTS = {
  CRAWLING_TASK_STATUS: 'crawling:task-status',
  CRAWLING_PROGRESS_UPDATE: 'crawling:progress-update',
  TASK_STATUS_CHANGE: 'task:status-change',
} as const;

export type StoreEventType = typeof STORE_EVENTS[keyof typeof STORE_EVENTS];
