
import { BaseService } from '../base/BaseService';
import { ServiceResult } from '../base/BaseService';
import { serviceFactory } from '../ServiceFactory';

/**
 * Development Tools Service
 * 
 * Provides debugging and development utilities for the application.
 * This service is primarily intended for development mode and debugging
 * purposes, supporting Phase 2-4 development tools implementation.
 */
export class DevToolsService extends BaseService {
  private static instance: DevToolsService;
  private performanceMetrics: Map<string, number[]> = new Map();
  private debugLogs: Array<{ timestamp: string; service: string; operation: string; data: any }> = [];

  private constructor() {
    super('DevToolsService');
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): DevToolsService {
    if (!DevToolsService.instance) {
      DevToolsService.instance = new DevToolsService();
    }
    return DevToolsService.instance;
  }

  /**
   * Record performance metric
   */
  public recordPerformanceMetric(operation: string, durationMs: number): void {
    if (!this.performanceMetrics.has(operation)) {
      this.performanceMetrics.set(operation, []);
    }
    
    const metrics = this.performanceMetrics.get(operation)!;
    metrics.push(durationMs);
    
    // Keep only last 100 measurements
    if (metrics.length > 100) {
      metrics.shift();
    }
    
    this.log(`Performance metric recorded: ${operation} took ${durationMs}ms`);
  }

  /**
   * Get performance statistics
   */
  public async getPerformanceStats(): Promise<ServiceResult<Record<string, {
    count: number;
    average: number;
    min: number;
    max: number;
    latest: number;
  }>>> {
    return this.executeOperation(async () => {
      const stats: Record<string, any> = {};
      
      for (const [operation, measurements] of this.performanceMetrics.entries()) {
        if (measurements.length > 0) {
          const sorted = [...measurements].sort((a, b) => a - b);
          stats[operation] = {
            count: measurements.length,
            average: measurements.reduce((sum, val) => sum + val, 0) / measurements.length,
            min: sorted[0],
            max: sorted[sorted.length - 1],
            latest: measurements[measurements.length - 1],
          };
        }
      }
      
      return stats;
    }, 'getPerformanceStats');
  }

  /**
   * Log debug information
   */
  public logDebugInfo(service: string, operation: string, data: any): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      service,
      operation,
      data,
    };
    
    this.debugLogs.push(logEntry);
    
    // Keep only last 1000 logs
    if (this.debugLogs.length > 1000) {
      this.debugLogs.shift();
    }
    
    console.debug(`[DevTools] ${service}.${operation}:`, data);
  }

  /**
   * Get debug logs
   */
  public async getDebugLogs(filter?: {
    service?: string;
    operation?: string;
    since?: string;
  }): Promise<ServiceResult<typeof this.debugLogs>> {
    return this.executeOperation(async () => {
      let filteredLogs = this.debugLogs;
      
      if (filter) {
        filteredLogs = this.debugLogs.filter(log => {
          if (filter.service && log.service !== filter.service) return false;
          if (filter.operation && log.operation !== filter.operation) return false;
          if (filter.since && log.timestamp < filter.since) return false;
          return true;
        });
      }
      
      return filteredLogs;
    }, 'getDebugLogs');
  }

  /**
   * Get comprehensive application state
   */
  public async getApplicationState(): Promise<ServiceResult<{
    services: Record<string, any>;
    performance: Record<string, any>;
    debugInfo: {
      totalLogs: number;
      recentErrors: any[];
    };
    timestamp: string;
  }>> {
    return this.executeOperation(async () => {
      const serviceStatus = serviceFactory.getServiceStatus();
      
      // Get status from all services
      const services: Record<string, any> = {};
      
      // Configuration service
      const configService = serviceFactory.getConfigurationService();
      const configStatus = configService.getStatus(); // getStatus() returns plain object
      services.configuration = configStatus; // configStatus is already a plain object
      
      // Database service
      const databaseService = serviceFactory.getDatabaseService();
      const dbSummary = await databaseService.getSummary();
      services.database = dbSummary.success ? dbSummary.data : { error: dbSummary.error?.message };
      
      // Crawling service
      const crawlingService = serviceFactory.getCrawlingService();
      const crawlingStatus = await crawlingService.getStatus();
      services.crawling = crawlingStatus.success ? crawlingStatus.data : { error: crawlingStatus.error?.message };
      
      // Performance metrics
      const performanceResult = await this.getPerformanceStats();
      const performance = performanceResult.success ? performanceResult.data : ({} as Record<string, any>);
      
      // Recent errors from debug logs
      const recentErrors = this.debugLogs
        .filter(log => log.data?.error || log.operation.includes('error'))
        .slice(-10);
      
      return {
        services: {
          ...services,
          serviceStatus,
        },
        performance: performance || {},
        debugInfo: {
          totalLogs: this.debugLogs.length,
          recentErrors,
        },
        timestamp: new Date().toISOString(),
      };
    }, 'getApplicationState');
  }

  /**
   * Export debug data for analysis
   */
  public async exportDebugData(): Promise<ServiceResult<{
    performanceMetrics: Record<string, number[]>;
    debugLogs: Array<{ timestamp: string; service: string; operation: string; data: any }>;
    applicationState: any;
    exportedAt: string;
  }>> {
    return this.executeOperation(async () => {
      const performanceMetrics: Record<string, number[]> = {};
      for (const [operation, measurements] of this.performanceMetrics.entries()) {
        performanceMetrics[operation] = [...measurements];
      }
      
      return {
        performanceMetrics,
        debugLogs: [...this.debugLogs],
        applicationState: {
          serviceStatus: serviceFactory.getServiceStatus(),
        },
        exportedAt: new Date().toISOString(),
      };
    }, 'exportDebugData');
  }

  /**
   * Clear debug data
   */
  public async clearDebugData(): Promise<ServiceResult<boolean>> {
    return this.executeOperation(async () => {
      this.performanceMetrics.clear();
      this.debugLogs = [];
      this.log('Debug data cleared');
      return true;
    }, 'clearDebugData');
  }

  /**
   * Test service connectivity and performance
   */
  public async runDiagnostics(): Promise<ServiceResult<{
    connectivity: Record<string, boolean>;
    performance: Record<string, number>;
    recommendations: string[];
  }>> {
    return this.executeOperation(async () => {
      const connectivity: Record<string, boolean> = {};
      const performance: Record<string, number> = {};
      const recommendations: string[] = [];
      
      // Test configuration service
      const startConfig = Date.now();
      try {
        const configService = serviceFactory.getConfigurationService();
        await configService.getConfig(); // getConfig() returns CrawlerConfig directly
        connectivity.configuration = true;
        performance.configurationMs = Date.now() - startConfig;
        
        if (performance.configurationMs > 1000) {
          recommendations.push('Configuration service is slow (>1s response time)');
        }
      } catch (error) {
        connectivity.configuration = false;
        performance.configurationMs = Date.now() - startConfig;
      }
      
      // Test database service
      const startDb = Date.now();
      try {
        const databaseService = serviceFactory.getDatabaseService();
        const dbResult = await databaseService.checkConnection();
        connectivity.database = dbResult.success;
        performance.databaseMs = Date.now() - startDb;
        
        if (performance.databaseMs > 2000) {
          recommendations.push('Database service is slow (>2s response time)');
        }
      } catch (error) {
        connectivity.database = false;
        performance.databaseMs = Date.now() - startDb;
      }
      
      // Test crawling service
      const startCrawling = Date.now();
      try {
        const crawlingService = serviceFactory.getCrawlingService();
        const crawlingResult = await crawlingService.getStatus();
        connectivity.crawling = crawlingResult.success;
        performance.crawlingMs = Date.now() - startCrawling;
      } catch (error) {
        connectivity.crawling = false;
        performance.crawlingMs = Date.now() - startCrawling;
      }
      
      // General recommendations
      const failedServices = Object.entries(connectivity)
        .filter(([, connected]) => !connected)
        .map(([service]) => service);
      
      if (failedServices.length > 0) {
        recommendations.push(`Services not responding: ${failedServices.join(', ')}`);
      }
      
      return {
        connectivity,
        performance,
        recommendations,
      };
    }, 'runDiagnostics');
  }

  /**
   * Monitor service health continuously
   */
  public startHealthMonitoring(intervalMs: number = 30000): void {
    setInterval(async () => {
      try {
        const diagnostics = await this.runDiagnostics();
        if (diagnostics.success && diagnostics.data) {
          this.logDebugInfo('DevToolsService', 'healthCheck', {
            connectivity: diagnostics.data.connectivity,
            performance: diagnostics.data.performance,
          });
          
          // Record performance metrics
          for (const [service, time] of Object.entries(diagnostics.data.performance || {})) {
            this.recordPerformanceMetric(`healthCheck_${service}`, time);
          }
        }
      } catch (error) {
        this.logDebugInfo('DevToolsService', 'healthCheckError', { error });
      }
    }, intervalMs);
    
    this.log(`Health monitoring started with ${intervalMs}ms interval`);
  }
}
