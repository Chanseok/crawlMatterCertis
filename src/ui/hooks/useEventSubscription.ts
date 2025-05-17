import { useEffect, useRef } from 'react';
import { getPlatformApi } from '../platform/api';
import { addLog } from '../stores';
import type { EventPayloadMapping } from '../../../types';

// Extended version of EventPayloadMapping that allows string keys
type ExtendedEventKey = keyof EventPayloadMapping | string;

// Type utility to get the payload type from either a known key or a custom string event
type EventPayload<T extends ExtendedEventKey> = 
  T extends keyof EventPayloadMapping 
    ? EventPayloadMapping[T] 
    : any;

type EventCallback<T> = (data: T) => void;

/**
 * 단일 이벤트 구독을 위한 훅
 */
export function useEventSubscription<K extends ExtendedEventKey>(
  eventName: K, 
  callback: EventCallback<EventPayload<K>>, 
  errorHandler?: (error: unknown) => void
) {
  useEffect(() => {
    try {
      const api = getPlatformApi();
      // Type assertion to allow string event names
      const unsubscribe = api.subscribeToEvent(eventName as any, callback);
      
      return () => {
        unsubscribe();
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      addLog(`이벤트 구독 중 오류 (${eventName}): ${errorMessage}`, 'error');
      
      if (errorHandler) {
        errorHandler(err);
      }
    }
  }, [eventName, callback, errorHandler]);
}

/**
 * 여러 이벤트 구독을 위한 훅
 */
export interface EventSubscription<K extends ExtendedEventKey = any> {
  eventName: K;
  callback: EventCallback<EventPayload<K>>;
}

export function useMultipleEventSubscriptions(
  subscriptions: EventSubscription[], 
  errorHandler?: (error: unknown) => void
) {
  const unsubscribeFunctions = useRef<(() => void)[]>([]);
  
  useEffect(() => {
    try {
      const api = getPlatformApi();
      
      // 기존 구독 해제
      unsubscribeFunctions.current.forEach(unsubscribe => unsubscribe());
      unsubscribeFunctions.current = [];
      
      // 새로운 구독 등록
      subscriptions.forEach(({ eventName, callback }) => {
        // Type assertion to allow string event names
        const unsubscribe = api.subscribeToEvent(eventName as any, callback);
        unsubscribeFunctions.current.push(unsubscribe);
      });
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      addLog(`이벤트 구독 중 오류: ${errorMessage}`, 'error');
      
      if (errorHandler) {
        errorHandler(err);
      }
    }
    
    return () => {
      // 모든 구독 해제
      unsubscribeFunctions.current.forEach(unsubscribe => unsubscribe());
      unsubscribeFunctions.current = [];
    };
  }, [subscriptions, errorHandler]);
}
