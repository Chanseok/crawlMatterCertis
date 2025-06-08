/**
 * Centralized Logging Utility
 * 
 * Provides a consistent logging interface that can be conditionally disabled
 * in production builds to improve performance and reduce bundle size.
 */

import { isDevelopment } from './environment';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  component?: string;
  action?: string;
  data?: any;
}

class Logger {
  private prefix: string;
  private enabled: boolean;

  constructor(prefix: string = '[APP]') {
    this.prefix = prefix;
    this.enabled = isDevelopment();
  }

  private formatMessage(level: LogLevel, message: string, _context?: LogContext): string {
    const timestamp = new Date().toISOString().slice(11, 23); // HH:mm:ss.SSS
    const emoji = this.getLevelEmoji(level);
    return `${emoji} ${this.prefix} [${timestamp}] ${message}`;
  }

  private getLevelEmoji(level: LogLevel): string {
    switch (level) {
      case 'debug': return '🔍';
      case 'info': return 'ℹ️';
      case 'warn': return '⚠️';
      case 'error': return '❌';
      default: return '📝';
    }
  }

  debug(message: string, context?: LogContext): void {
    if (this.enabled) {
      console.debug(this.formatMessage('debug', message, context), context?.data);
    }
  }

  info(message: string, context?: LogContext): void {
    if (this.enabled) {
      console.info(this.formatMessage('info', message, context), context?.data);
    }
  }

  warn(message: string, context?: LogContext): void {
    if (this.enabled) {
      console.warn(this.formatMessage('warn', message, context), context?.data);
    }
  }

  error(message: string, context?: LogContext): void {
    // Errors are always logged, even in production
    console.error(this.formatMessage('error', message, context), context?.data);
  }

  group(label: string): void {
    if (this.enabled) {
      console.group(`${this.prefix} ${label}`);
    }
  }

  groupEnd(): void {
    if (this.enabled) {
      console.groupEnd();
    }
  }

  time(label: string): void {
    if (this.enabled) {
      console.time(`${this.prefix} ${label}`);
    }
  }

  timeEnd(label: string): void {
    if (this.enabled) {
      console.timeEnd(`${this.prefix} ${label}`);
    }
  }
}

// Factory function to create component-specific loggers
export function createLogger(componentName: string): Logger {
  return new Logger(`[${componentName}]`);
}

// Default logger for general use
export const logger = new Logger();

// Pre-configured loggers for common components
export const dashboardLogger = createLogger('DASHBOARD');
export const configLogger = createLogger('CONFIG');
export const crawlingLogger = createLogger('CRAWLING');
export const dbLogger = createLogger('DATABASE');
export const uiLogger = createLogger('UI');

// Legacy compatibility - 개발 환경에서만 로그를 출력하는 유틸리티 함수
export const debugLog = isDevelopment() 
  ? console.log 
  : () => {};
