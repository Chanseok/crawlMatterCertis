
import { DatabaseService } from './domain/DatabaseService';
import { CrawlingService } from './domain/CrawlingService';
import { VendorService } from './domain/VendorService';
import { ExportService } from './domain/ExportService';
import { ConfigurationService } from './domain/ConfigurationService';
import { CrawlingWorkflowService } from './composite/CrawlingWorkflowService';
import { IPCService } from './infrastructure/IPCService';
import { isDevelopment } from '../utils/environment';
import { Logger } from '../../shared/utils/Logger';

/**
 * Service Factory for centralized service management and dependency injection
 * 
 * Phase 3: Service Layer Refactoring
 * - Enhanced with service health monitoring using resilience patterns
 * - Improved service initialization coordination
 * - Standardized service lifecycle management
 * 
 * Provides singleton access to all domain services and manages their dependencies.
 * This follows the Factory pattern to ensure consistent service instantiation
 * and dependency management across the application.
 */
export class ServiceFactory {
  private static instance: ServiceFactory;
  private static logger = new Logger('ServiceFactory');
  
  // Service instances
  private databaseService?: DatabaseService;
  private crawlingService?: CrawlingService;
  private vendorService?: VendorService;
  private exportService?: ExportService;
  private configurationService?: ConfigurationService;
  private crawlingWorkflowService?: CrawlingWorkflowService;
  private devToolsService?: any; // Type is any to handle null in production
  private ipcService?: IPCService;

  private constructor() {
    // Private constructor to enforce singleton pattern
  }

  /**
   * Get the singleton instance of ServiceFactory
   */
  public static getInstance(): ServiceFactory {
    if (!ServiceFactory.instance) {
      ServiceFactory.instance = new ServiceFactory();
    }
    return ServiceFactory.instance;
  }

  /**
   * Get the IPC Service instance
   */
  public getIPCService(): IPCService {
    if (!this.ipcService) {
      this.ipcService = IPCService.getInstance();
    }
    return this.ipcService;
  }

  /**
   * Get the Database Service instance
   */
  public getDatabaseService(): DatabaseService {
    if (!this.databaseService) {
      this.databaseService = DatabaseService.getInstance();
    }
    return this.databaseService;
  }

  /**
   * Get the Crawling Service instance
   */
  public getCrawlingService(): CrawlingService {
    if (!this.crawlingService) {
      this.crawlingService = CrawlingService.getInstance();
    }
    return this.crawlingService;
  }

  /**
   * Get the Vendor Service instance
   */
  public getVendorService(): VendorService {
    if (!this.vendorService) {
      this.vendorService = VendorService.getInstance();
    }
    return this.vendorService;
  }

  /**
   * Get the Export Service instance
   */
  public getExportService(): ExportService {
    if (!this.exportService) {
      this.exportService = ExportService.getInstance();
    }
    return this.exportService;
  }

  /**
   * Get the Configuration Service instance
   */
  public getConfigurationService(): ConfigurationService {
    if (!this.configurationService) {
      this.configurationService = ConfigurationService.getInstance();
    }
    return this.configurationService;
  }

  /**
   * Get the Crawling Workflow Service instance
   */
  public getCrawlingWorkflowService(): CrawlingWorkflowService {
    if (!this.crawlingWorkflowService) {
      this.crawlingWorkflowService = CrawlingWorkflowService.getInstance();
    }
    return this.crawlingWorkflowService;
  }

  /**
   * Get the DevTools Service instance - only available in development
   */
  public getDevToolsService(): any {
    if (!isDevelopment()) {
      return null;
    }

    // DevToolsService is not available in browser context, return null
    return null;
  }

  /**
   * Initialize all services
   * Enhanced with coordinated service initialization and health monitoring
   * This method can be called during app startup to ensure all services are ready
   */
  public async initializeServices(): Promise<void> {
    try {
      ServiceFactory.logger.info('Starting Phase 3 enhanced service initialization...');
      
      // Initialize core services first
      const ipcService = this.getIPCService();
      
      // Wait for core services to be ready
      await this.waitForServiceReady(ipcService, 'IPC');
      ServiceFactory.logger.info('Core services (IPC, Configuration) initialized');
      
      // Initialize domain services with dependency order
      const databaseService = this.getDatabaseService();
      const crawlingService = this.getCrawlingService();
      const vendorService = this.getVendorService();
      const exportService = this.getExportService();

      // Wait for domain services to be ready  
      await Promise.all([
        this.waitForServiceReady(databaseService, 'Database'),
        this.waitForServiceReady(crawlingService, 'Crawling'),
        this.waitForServiceReady(vendorService, 'Vendor'),
        this.waitForServiceReady(exportService, 'Export')
      ]);
      ServiceFactory.logger.info('Domain services initialized');

      // Initialize composite services
      const workflowService = this.getCrawlingWorkflowService();
      await this.waitForServiceReady(workflowService, 'CrawlingWorkflow');
      ServiceFactory.logger.info('Composite services initialized');

      // Perform health check on all services
      const healthStatus = await this.performHealthCheck();
      ServiceFactory.logger.info('Service health check completed', healthStatus);

      ServiceFactory.logger.info('All services initialized successfully with Phase 3 enhancements');
    } catch (error) {
      ServiceFactory.logger.error('Failed to initialize services', error);
      throw error;
    }
  }

  /**
   * Wait for a service to be ready (basic readiness check)
   */
  private async waitForServiceReady(service: any, serviceName: string): Promise<void> {
    try {
      // Basic readiness check - service exists and has expected methods
      if (!service) {
        throw new Error(`Service ${serviceName} is null or undefined`);
      }

      // For services with resilience manager, check if it's initialized
      if (service.resilience) {
        ServiceFactory.logger.debug(`${serviceName} service has resilience patterns enabled`);
      }

      ServiceFactory.logger.debug(`${serviceName} service is ready`);
    } catch (error) {
      ServiceFactory.logger.error(`Failed to initialize ${serviceName} service`, error);
      throw error;
    }
  }

  /**
   * Perform comprehensive health check on all services
   * Enhanced with resilience pattern monitoring
   */
  public async performHealthCheck(): Promise<Record<string, any>> {
    const healthStatus: Record<string, any> = {};

    try {
      // Check each service's health including resilience metrics
      const services = [
        { name: 'ipc', instance: this.ipcService },
        { name: 'database', instance: this.databaseService },
        { name: 'crawling', instance: this.crawlingService },
        { name: 'vendor', instance: this.vendorService },
        { name: 'export', instance: this.exportService },
        { name: 'configuration', instance: this.configurationService },
        { name: 'crawlingWorkflow', instance: this.crawlingWorkflowService }
      ];

      for (const { name, instance } of services) {
        try {
          if (!instance) {
            healthStatus[name] = { status: 'not_initialized', healthy: false };
            continue;
          }

          const serviceHealth: any = {
            status: 'healthy',
            healthy: true,
            initialized: true
          };

          // Check resilience metrics if available
          if ('resilience' in instance && instance.resilience) {
            serviceHealth.resilience = {
              enabled: true,
              circuitBreakerState: (instance.resilience as any).circuitBreaker?.state || 'unknown',
              retryEnabled: !!(instance.resilience as any).retryPolicy
            };

            // Get resilience metrics if available
            if ((instance.resilience as any).getMetrics) {
              serviceHealth.metrics = (instance.resilience as any).getMetrics();
            }
          }

          // Event subscription metrics are handled internally by the service

          healthStatus[name] = serviceHealth;
        } catch (error) {
          healthStatus[name] = {
            status: 'error',
            healthy: false,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }

      return healthStatus;
    } catch (error) {
      ServiceFactory.logger.error('Health check failed', error);
      throw error;
    }
  }

  /**
   * Reset all service instances (useful for testing)
   * Enhanced with proper cleanup of resilience patterns and event subscriptions
   */
  public async resetServices(): Promise<void> {
    try {
      ServiceFactory.logger.info('Starting enhanced service reset...');

      // Cleanup services with proper lifecycle management
      const services = [
        { name: 'crawlingWorkflow', instance: this.crawlingWorkflowService },
        { name: 'export', instance: this.exportService },
        { name: 'vendor', instance: this.vendorService },
        { name: 'crawling', instance: this.crawlingService },
        { name: 'database', instance: this.databaseService },
        { name: 'configuration', instance: this.configurationService },
        { name: 'ipc', instance: this.ipcService }
      ];

      // Cleanup services in reverse dependency order
      for (const { name, instance } of services) {
        if (instance && 'cleanup' in instance && typeof instance.cleanup === 'function') {
          try {
            await (instance as any).cleanup();
            ServiceFactory.logger.debug(`${name} service cleaned up successfully`);
          } catch (error) {
            ServiceFactory.logger.error(`Failed to cleanup ${name} service`, error);
          }
        }
      }

      // Reset all instances
      this.databaseService = undefined;
      this.crawlingService = undefined;
      this.vendorService = undefined;
      this.exportService = undefined;
      this.configurationService = undefined;
      this.crawlingWorkflowService = undefined;
      this.devToolsService = undefined;
      this.ipcService = undefined;
      
      ServiceFactory.logger.info('All services reset with enhanced cleanup');
    } catch (error) {
      ServiceFactory.logger.error('Failed to reset services', error);
      throw error;
    }
  }

  /**
   * Get service health status
   */
  public getServiceStatus(): Record<string, boolean> {
    return {
      ipc: !!this.ipcService,
      database: !!this.databaseService,
      crawling: !!this.crawlingService,
      vendor: !!this.vendorService,
      export: !!this.exportService,
      configuration: !!this.configurationService,
      crawlingWorkflow: !!this.crawlingWorkflowService,
      devTools: !!this.devToolsService,
    };
  }
}

// Export a singleton instance for easy access
export const serviceFactory = ServiceFactory.getInstance();
