
// Base service and types
export { BaseService } from './base/BaseService';
export type { ServiceResult, ServiceError } from './base/BaseService';

// Domain services
export { DatabaseService } from './domain/DatabaseService';
export { CrawlingService } from './domain/CrawlingService';
export { VendorService } from './domain/VendorService';
export { ExportService } from './domain/ExportService';
export { ConfigurationService } from './domain/ConfigurationService';

// Composite services
export { CrawlingWorkflowService } from './composite/CrawlingWorkflowService';

// Core services
export { IPCService } from './IPCService';

// Service factory
export { ServiceFactory, serviceFactory } from './ServiceFactory';

// Service initialization
export {
  initializeServices,
  getServiceInitializationStatus,
  reinitializeServices,
  performServiceHealthChecks,
  shutdownServices,
} from './initialization';

// Legacy services (for backward compatibility)
export { devDatabaseService } from './devDatabaseService';
