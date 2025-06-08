/**
 * Demo Components - Development Only
 * 
 * These components are only available in development mode for testing
 * and demonstration purposes. They are excluded from production builds.
 */

import { isDevelopment } from '../../utils/environment';

// Safe conditional loading using require when needed
let SearchSection: any = null;
let ProductsTable: any = null;
let CrawlingStatus: any = null;
let TasksOverview: any = null;
let LogsViewer: any = null;

if (isDevelopment()) {
  try {
    const searchModule = require('./search');
    SearchSection = searchModule.SearchSection;
    
    const productsModule = require('./products');
    ProductsTable = productsModule.ProductsTable;
    
    const crawlingModule = require('./crawling');
    CrawlingStatus = crawlingModule.CrawlingStatus;
    
    const tasksModule = require('./tasks');
    TasksOverview = tasksModule.TasksOverview;
    
    const logsModule = require('./logs');
    LogsViewer = logsModule.LogsViewer;
  } catch (error) {
    console.warn('Demo components could not be loaded:', error);
  }
}

// Always export types (they don't affect bundle size significantly)
export type {
  Product,
  SaveResult,
  LogEntry,
  CrawlingProgress,
  TaskStatistics,
  CrawlingStatus as CrawlingStatusType
} from './types';

// Export components
export { SearchSection, ProductsTable, CrawlingStatus, TasksOverview, LogsViewer };

// Export development-guarded versions for backwards compatibility
export const SearchSectionDev = SearchSection;
export const ProductsTableDev = ProductsTable;
export const CrawlingStatusDev = CrawlingStatus;
export const TasksOverviewDev = TasksOverview;
export const LogsViewerDev = LogsViewer;
