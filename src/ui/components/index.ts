import { isDevelopment } from '../utils/environment';

// Main components exports
export { BatchProcessingSettings } from './BatchProcessingSettings';
export { CrawlingCompleteView } from './CrawlingCompleteView';
export { default as CrawlingDashboard } from './CrawlingDashboard';
export { CrawlingSettings } from './CrawlingSettings';
export { ExpandableSection } from './ExpandableSection';
export { LocalDBTab } from './LocalDBTab';
export { PageProgressDisplay } from './PageProgressDisplay';
export { RetryStatusIndicator } from './RetryStatusIndicator';
export { StageTransitionIndicator } from './StageTransitionIndicator';
export { StatusCheckAnimation } from './StatusCheckAnimation';
export { default as StatusCheckLoadingAnimation } from './StatusCheckLoadingAnimation';
export { TaskProgressIndicator } from './TaskProgressIndicator';
export { ValidationResultsPanel } from './ValidationResultsPanel';


// Conditional exports based on environment
// Import and conditionally re-export debug and demo components
import * as debugComponents from './debug';
import * as demoComponents from './demo';

// Re-export debug components
export const {
  DebugPanel,
  PerformanceMetrics,
  ServiceStatusPanel,
  DebugLogs,
  ApplicationState,
  ProgressDebugPanel
} = debugComponents;

// Re-export demo components
export const {
  SearchSection,
  ProductsTable,
  CrawlingStatus,
  TasksOverview,
  LogsViewer
} = demoComponents;

// Export DomainStoreDemo conditionally
export const DomainStoreDemo = isDevelopment() 
  ? (function() {
      try {
        return require('./DomainStoreDemo').DomainStoreDemo;
      } catch {
        return null;
      }
    })()
  : null;

// Always export these components
export * from './displays';
export * from './layout';
export * from './logs';
export * from './tabs';
