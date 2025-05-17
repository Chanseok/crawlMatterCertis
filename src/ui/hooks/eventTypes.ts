import type { EventPayloadMapping } from '../../../types';

// Extended version of EventPayloadMapping that allows string keys
export type ExtendedEventKey = keyof EventPayloadMapping | string;

// Type utility to get the payload type from either a known key or a custom string event
export type EventPayload<T extends ExtendedEventKey> = 
  T extends keyof EventPayloadMapping 
    ? EventPayloadMapping[T] 
    : any; // For custom events, use 'any' as fallback
