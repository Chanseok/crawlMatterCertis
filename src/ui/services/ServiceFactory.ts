
import { DatabaseService } from './domain/DatabaseService';
import { CrawlingService } from './domain/CrawlingService';
import { VendorService } from './domain/VendorService';
import { ExportService } from './domain/ExportService';
import { ConfigurationService } from './domain/ConfigurationService';
import { CrawlingWorkflowService } from './composite/CrawlingWorkflowService';
import { IPCService } from './IPCService';
import { isDevelopment } from '../utils/environment';
import { Logger } from '../../shared/utils/Logger';

/**
 * Service Factory for centralized service management and dependency injection
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
   * This method can be called during app startup to ensure all services are ready
   */
  public async initializeServices(): Promise<void> {
    try {
      // Initialize core services first
      this.getIPCService();
      this.getConfigurationService();
      
      // Initialize domain services
      this.getDatabaseService();
      this.getCrawlingService();
      this.getVendorService();
      this.getExportService();

      // Initialize composite services
      this.getCrawlingWorkflowService();

      ServiceFactory.logger.info('All services initialized successfully');
    } catch (error) {
      ServiceFactory.logger.error('Failed to initialize services', error);
      throw error;
    }
  }

  /**
   * Reset all service instances (useful for testing)
   */
  public resetServices(): void {
    this.databaseService = undefined;
    this.crawlingService = undefined;
    this.vendorService = undefined;
    this.exportService = undefined;
    this.configurationService = undefined;
    this.crawlingWorkflowService = undefined;
    this.devToolsService = undefined;
    this.ipcService = undefined;
    ServiceFactory.logger.info('All services reset');
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
