
import { BaseService } from '../base/BaseService';
import { ServiceResult } from '../base/BaseService';
import { serviceFactory } from '../ServiceFactory';
import type { CrawlerConfig, CrawlingStatus } from '../../../../types';

/**
 * Crawling Workflow Service
 * 
 * Composite service that orchestrates complex crawling workflows involving
 * multiple domain services. This service handles:
 * - Complete crawling lifecycle management
 * - Configuration validation and updates
 * - Progress monitoring and coordination
 * - Error recovery and retry mechanisms
 * - Data persistence after crawling completion
 * 
 * This follows the Composite Service pattern where complex operations
 * that span multiple domains are handled by dedicated workflow services.
 */
export class CrawlingWorkflowService extends BaseService {
  private static instance: CrawlingWorkflowService;

  private constructor() {
    super('CrawlingWorkflowService');
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): CrawlingWorkflowService {
    if (!CrawlingWorkflowService.instance) {
      CrawlingWorkflowService.instance = new CrawlingWorkflowService();
    }
    return CrawlingWorkflowService.instance;
  }

  /**
   * Execute complete crawling workflow with configuration validation
   */
  public async executeCrawlingWorkflow(
    config?: Partial<CrawlerConfig>
  ): Promise<ServiceResult<{
    status: CrawlingStatus;
    totalItems: number;
    config: CrawlerConfig;
  }>> {
    return this.executeOperation(async () => {
      const configService = serviceFactory.getConfigurationService();
      const crawlingService = serviceFactory.getCrawlingService();
      const databaseService = serviceFactory.getDatabaseService();

      // Step 1: Validate and update configuration if provided
      let finalConfig: CrawlerConfig;
      if (config) {
        finalConfig = await configService.updateConfig(config);
      } else {
        finalConfig = await configService.getConfig();
      }

      // Step 2: Validate configuration
      configService.validateConfigComplete(finalConfig);

      // Step 3: Start crawling with validated configuration
      const startResult = await crawlingService.startCrawling();
      if (!startResult.success) {
        throw new Error(`Failed to start crawling: ${startResult.error?.message || 'Unknown error'}`);
      }

      // Step 4: Monitor progress and wait for completion
      const completionResult = await this.monitorCrawlingProgress();
      if (!completionResult.success) {
        throw new Error(`Crawling monitoring failed: ${completionResult.error?.message || 'Unknown error'}`);
      }

      // Step 5: Verify data was saved (if auto-save enabled)
      if (finalConfig.autoAddToLocalDB) {
        const summaryResult = await databaseService.getSummary();
        if (summaryResult.success && summaryResult.data && completionResult.data) {
          return {
            status: completionResult.data.status,
            totalItems: summaryResult.data.totalProducts,
            config: finalConfig,
          };
        }
      }

      if (!completionResult.data) {
        throw new Error('Crawling completion data is missing');
      }

      return {
        status: completionResult.data.status,
        totalItems: completionResult.data.totalItems,
        config: finalConfig,
      };
    }, 'executeCrawlingWorkflow');
  }

  /**
   * Monitor crawling progress and return when completed
   */
  private async monitorCrawlingProgress(): Promise<ServiceResult<{
    status: CrawlingStatus;
    totalItems: number;
  }>> {
    return this.executeOperation(async () => {
      const crawlingService = serviceFactory.getCrawlingService();
      
      return new Promise((resolve, reject) => {
        let progressCheckInterval: number;
        let timeout: number;

        const checkProgress = async () => {
          try {
            const statusResult = await crawlingService.getStatus();
            if (!statusResult.success) {
              clearInterval(progressCheckInterval);
              clearTimeout(timeout);
              reject(new Error(`Failed to get crawling status: ${statusResult.error?.message || 'Unknown error'}`));
              return;
            }

            if (!statusResult.data) {
              clearInterval(progressCheckInterval);
              clearTimeout(timeout);
              reject(new Error('Status result data is missing'));
              return;
            }

            const status = statusResult.data.status;
            
            if (status === 'completed') {
              clearInterval(progressCheckInterval);
              clearTimeout(timeout);
              resolve({
                status,
                totalItems: statusResult.data.progress?.totalItems || 0,
              });
            } else if (status === 'error') {
              clearInterval(progressCheckInterval);
              clearTimeout(timeout);
              reject(new Error('Crawling failed with error status'));
            }
          } catch (error) {
            clearInterval(progressCheckInterval);
            clearTimeout(timeout);
            reject(error);
          }
        };

        // Check progress every 2 seconds
        progressCheckInterval = setInterval(checkProgress, 2000);
        
        // Initial check
        checkProgress();

        // Timeout after 30 minutes
        timeout = setTimeout(() => {
          clearInterval(progressCheckInterval);
          reject(new Error('Crawling monitoring timeout (30 minutes)'));
        }, 30 * 60 * 1000);
      });
    }, 'monitorCrawlingProgress');
  }

  /**
   * Execute configuration update workflow with validation
   */
  public async updateConfigurationWorkflow(
    config: Partial<CrawlerConfig>
  ): Promise<ServiceResult<{
    config: CrawlerConfig;
    validated: boolean;
    applied: boolean;
  }>> {
    return this.executeOperation(async () => {
      const configService = serviceFactory.getConfigurationService();
      const crawlingService = serviceFactory.getCrawlingService();

      // Step 1: Update configuration (returns config directly)
      const updatedConfig = await configService.updateConfig(config);

      // Step 2: Validate the updated configuration (already done in updateConfig)
      // Just verify it's valid again
      configService.validateConfigComplete(updatedConfig);

      // Step 3: Apply configuration to crawling service
      const applyResult = await crawlingService.updateConfig({
        config: updatedConfig,
        applyImmediately: true
      });
      if (!applyResult.success) {
        throw new Error(`Failed to apply configuration to crawling service: ${applyResult.error?.message || 'Apply failed'}`);
      }

      return {
        config: updatedConfig,
        validated: true,
        applied: true,
      };
    }, 'updateConfigurationWorkflow');
  }

  /**
   * Execute data export workflow with validation
   */
  public async exportDataWorkflow(
    format: 'xlsx' | 'csv',
    options?: {
      searchQuery?: string;
      includeMetadata?: boolean;
      customFilename?: string;
    }
  ): Promise<ServiceResult<{
    filename: string;
    totalRecords: number;
    fileSize: number;
  }>> {
    return this.executeOperation(async () => {
      const databaseService = serviceFactory.getDatabaseService();
      const exportService = serviceFactory.getExportService();

      // Step 1: Check database connection and get summary
      const summaryResult = await databaseService.getSummary();
      if (!summaryResult.success) {
        throw new Error(`Database not accessible: ${summaryResult.error?.message || 'Database error'}`);
      }

      if (!summaryResult.data || summaryResult.data.totalProducts === 0) {
        throw new Error('No data available for export');
      }

      // Step 2: Fetch all products for export
      const productsResult = await databaseService.getAllProducts();
      if (!productsResult.success) {
        throw new Error(`Failed to fetch products: ${productsResult.error?.message || 'Fetch error'}`);
      }

      // Step 3: Filter products if search query provided
      let productsToExport: Array<any> = productsResult.data?.products || [];
      if (options?.searchQuery) {
        const searchResult = await databaseService.searchProducts({
          query: options.searchQuery,
          page: 1,
          limit: 1000 // Use a large limit to get all matching products
        });
        if (searchResult.success && searchResult.data) {
          productsToExport = searchResult.data.products;
        }
      }

      // Step 4: Export data
      const exportOptions = {
        format,
        filename: options?.customFilename
      };
      
      const exportResult = await exportService.exportToFile(
        productsToExport,
        options?.customFilename || `export_${Date.now()}.${format}`,
        exportOptions
      );

      if (!exportResult.success) {
        throw new Error(`Export failed: ${exportResult.error?.message || 'Export error'}`);
      }

      return {
        filename: exportResult.data?.filename || 'unknown',
        totalRecords: productsToExport.length,
        fileSize: exportResult.data?.recordCount || 0,
      };
    }, 'exportDataWorkflow');
  }

  /**
   * Execute database maintenance workflow
   */
  public async maintenanceWorkflow(): Promise<ServiceResult<{
    originalCount: number;
    finalCount: number;
    operationsPerformed: string[];
  }>> {
    return this.executeOperation(async () => {
      const databaseService = serviceFactory.getDatabaseService();
      const operations: string[] = [];

      // Step 1: Get initial count
      const initialSummary = await databaseService.getSummary();
      const originalCount = initialSummary.success ? (initialSummary.data?.totalProducts || 0) : 0;
      operations.push(`Initial record count: ${originalCount}`);

      // Step 2: Check database health
      const healthResult = await databaseService.checkConnection();
      if (!healthResult.success) {
        throw new Error(`Database health check failed: ${healthResult.error?.message || 'Health check error'}`);
      }
      operations.push('Database health check: PASSED');

      // Step 3: Validation could be added here
      // For now, just return the status
      const finalSummary = await databaseService.getSummary();
      const finalCount = finalSummary.success ? (finalSummary.data?.totalProducts || 0) : 0;
      operations.push(`Final record count: ${finalCount}`);

      return {
        originalCount,
        finalCount,
        operationsPerformed: operations,
      };
    }, 'maintenanceWorkflow');
  }

  /**
   * Get comprehensive status across all related services
   */
  public async getWorkflowStatus(): Promise<ServiceResult<{
    crawling: object;
    configuration: object;
    database: object;
    lastActivity: string;
  }>> {
    return this.executeOperation(async () => {
      const configService = serviceFactory.getConfigurationService();
      const crawlingService = serviceFactory.getCrawlingService();
      const databaseService = serviceFactory.getDatabaseService();

      // Get status from all services
      const [configStatus, crawlingStatus, databaseStatus] = await Promise.all([
        Promise.resolve(configService.getStatus()), // ConfigService.getStatus() returns plain object
        crawlingService.getStatus(),
        databaseService.getSummary(),
      ]);

      return {
        crawling: crawlingStatus.success ? (crawlingStatus.data || {}) : { error: crawlingStatus.error?.message || 'Unknown error' },
        configuration: configStatus, // configStatus is already a plain object
        database: databaseStatus.success ? (databaseStatus.data || {}) : { error: databaseStatus.error?.message || 'Unknown error' },
        lastActivity: new Date().toISOString(),
      };
    }, 'getWorkflowStatus');
  }
}
