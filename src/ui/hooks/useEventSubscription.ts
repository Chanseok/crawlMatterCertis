import { useEffect, useRef } from 'react';
import { getPlatformApi } from '../platform/api';
import { addLog } from '../stores';

type EventCallback<T> = (data: T) => void;

/**
 * 단일 이벤트 구독을 위한 훅
 */
export function useEventSubscription<T>(
  eventName: string, 
  callback: EventCallback<T>, 
  errorHandler?: (error: unknown) => void
) {
  useEffect(() => {
    try {
      const api = getPlatformApi();
      const unsubscribe = api.subscribeToEvent(eventName, callback);
      
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
export interface EventSubscription<T = any> {
  eventName: string;
  callback: EventCallback<T>;
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
        const unsubscribe = api.subscribeToEvent(eventName, callback);
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
