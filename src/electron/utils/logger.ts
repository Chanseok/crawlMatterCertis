/**
 * Electron-side Logging Utility
 * 
 * Provides consistent logging for the main Electron process,
 * with conditional development-only logging.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  module?: string;
  action?: string;
  data?: any;
}

class ElectronLogger {
  private prefix: string;
  private enabled: boolean;

  constructor(prefix: string = '[ELECTRON]') {
    this.prefix = prefix;
    // In Electron main process, check NODE_ENV
    this.enabled = process.env.NODE_ENV === 'development';
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
      console.debug(this.formatMessage('debug', message, context), context?.data || '');
    }
  }

  info(message: string, context?: LogContext): void {
    if (this.enabled) {
      console.info(this.formatMessage('info', message, context), context?.data || '');
    }
  }

  warn(message: string, context?: LogContext): void {
    if (this.enabled) {
      console.warn(this.formatMessage('warn', message, context), context?.data || '');
    }
  }

  error(message: string, context?: LogContext): void {
    // Errors are always logged, even in production
    console.error(this.formatMessage('error', message, context), context?.data || '');
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
}

// Factory function to create module-specific loggers
export function createElectronLogger(moduleName: string): ElectronLogger {
  return new ElectronLogger(`[${moduleName}]`);
}

// Default logger for general use
export const electronLogger = new ElectronLogger();

// Pre-configured loggers for common modules
export const configManagerLogger = createElectronLogger('ConfigManager');
export const resourceLogger = createElectronLogger('ResourceManager');
export const hexUtilsLogger = createElectronLogger('HexUtils');
