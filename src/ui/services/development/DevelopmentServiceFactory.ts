/**
 * Development Service Factory
 * 
 * Conditionally loads development services based on environment.
 * In production, returns null or minimal stubs to prevent loading
 * development-only code.
 */

import { isDevelopment } from '../../utils/environment';
import type { DevToolsService } from './DevToolsService';

/**
 * Factory for creating development services
 * Returns actual services in development, stubs in production
 */
export class DevelopmentServiceFactory {
  private static devToolsService: DevToolsService | null = null;

  /**
   * Get DevTools service - only available in development
   */
  public static getDevToolsService(): DevToolsService | null {
    if (!isDevelopment()) {
      return null;
    }

    // In browser context, DevToolsService is not available
    // Return null to prevent require errors
    return null;
  }

  /**
   * Check if development services are available
   */
  public static isDevModeEnabled(): boolean {
    return isDevelopment();
  }

  /**
   * Initialize development services
   * Only runs in development mode
   */
  public static async initialize(): Promise<void> {
    if (!isDevelopment()) {
      return;
    }

    try {
      const devToolsService = this.getDevToolsService();
      if (devToolsService) {
        // Start health monitoring in development
        devToolsService.startHealthMonitoring(30000);
        console.log('[DevFactory] Development services initialized');
      }
    } catch (error) {
      console.warn('[DevFactory] Failed to initialize development services:', error);
    }
  }

  /**
   * Cleanup development services
   */
  public static cleanup(): void {
    if (this.devToolsService) {
      // Cleanup logic if needed
      this.devToolsService = null;
    }
  }
}

/**
 * Hook for accessing development services in components
 */
export function useDevToolsService(): DevToolsService | null {
  if (!isDevelopment()) {
    return null;
  }

  return DevelopmentServiceFactory.getDevToolsService();
}
