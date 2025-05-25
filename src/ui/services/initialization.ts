
import { serviceFactory } from './ServiceFactory';

/**
 * Service Initialization Module
 * 
 * Handles the initialization of all services during application startup.
 * This ensures all services are properly configured and ready before
 * the UI components start using them.
 */

/**
 * Initialize all services during application startup
 */
export async function initializeServices(): Promise<void> {
  try {
    console.log('[ServiceInit] Initializing application services...');
    
    // Initialize all services through the factory
    await serviceFactory.initializeServices();
    
    // Verify service initialization
    const serviceStatus = serviceFactory.getServiceStatus();
    const failedServices = Object.entries(serviceStatus)
      .filter(([, initialized]) => !initialized)
      .map(([name]) => name);
    
    if (failedServices.length > 0) {
      console.warn('[ServiceInit] Some services failed to initialize:', failedServices);
    } else {
      console.log('[ServiceInit] All services initialized successfully');
    }
    
    // Load initial configuration
    const configService = serviceFactory.getConfigurationService();
    const configResult = await configService.getConfig();
    
    if (configResult.success) {
      console.log('[ServiceInit] Initial configuration loaded successfully');
    } else {
      console.warn('[ServiceInit] Failed to load initial configuration:', configResult.error?.message || 'Unknown error');
    }
    
  } catch (error) {
    console.error('[ServiceInit] Failed to initialize services:', error);
    throw error;
  }
}

/**
 * Get service initialization status
 */
export function getServiceInitializationStatus(): {
  allInitialized: boolean;
  services: Record<string, boolean>;
  timestamp: string;
} {
  const services = serviceFactory.getServiceStatus();
  const allInitialized = Object.values(services).every(initialized => initialized);
  
  return {
    allInitialized,
    services,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Reinitialize services (useful for error recovery)
 */
export async function reinitializeServices(): Promise<void> {
  console.log('[ServiceInit] Reinitializing services...');
  
  // Reset all services
  serviceFactory.resetServices();
  
  // Initialize again
  await initializeServices();
}

/**
 * Perform service health checks
 */
export async function performServiceHealthChecks(): Promise<{
  healthy: boolean;
  checks: Record<string, { status: 'healthy' | 'unhealthy'; message?: string }>;
}> {
  const checks: Record<string, { status: 'healthy' | 'unhealthy'; message?: string }> = {};
  
  try {
    // Check configuration service
    const configService = serviceFactory.getConfigurationService();
    const configResult = await configService.getConfig();
    checks.configuration = {
      status: configResult.success ? 'healthy' : 'unhealthy',
      message: configResult.success ? undefined : configResult.error?.message || 'Unknown error',
    };
    
    // Check database service
    const databaseService = serviceFactory.getDatabaseService();
    const dbResult = await databaseService.checkConnection();
    checks.database = {
      status: dbResult.success ? 'healthy' : 'unhealthy',
      message: dbResult.success ? undefined : dbResult.error?.message || 'Unknown error',
    };
    
    // Check crawling service
    const crawlingService = serviceFactory.getCrawlingService();
    const crawlingResult = await crawlingService.getStatus();
    checks.crawling = {
      status: crawlingResult.success ? 'healthy' : 'unhealthy',
      message: crawlingResult.success ? undefined : crawlingResult.error?.message || 'Unknown error',
    };
    
    // Check IPC service
    checks.ipc = {
      status: 'healthy', // IPC service doesn't have async health checks
    };
    
  } catch (error) {
    console.error('[ServiceInit] Health check failed:', error);
  }
  
  const healthy = Object.values(checks).every(check => check.status === 'healthy');
  
  return {
    healthy,
    checks,
  };
}

/**
 * Graceful service shutdown
 */
export async function shutdownServices(): Promise<void> {
  try {
    console.log('[ServiceInit] Shutting down services...');
    
    // Get all services and perform cleanup if they have cleanup methods
    const services = [
      serviceFactory.getCrawlingService(),
      serviceFactory.getDatabaseService(),
      // Add other services that might need cleanup
    ];
    
    await Promise.all(
      services.map(async (service) => {
        try {
          // Call cleanup method if it exists
          if ('cleanup' in service && typeof service.cleanup === 'function') {
            await (service as any).cleanup();
          }
        } catch (error) {
          console.warn('[ServiceInit] Error during service cleanup:', error);
        }
      })
    );
    
    // Reset the factory
    serviceFactory.resetServices();
    
    console.log('[ServiceInit] Services shutdown completed');
  } catch (error) {
    console.error('[ServiceInit] Error during service shutdown:', error);
    throw error;
  }
}
