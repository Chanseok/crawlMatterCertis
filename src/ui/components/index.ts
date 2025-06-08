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
// Import and conditionally re-export debug components
import * as debugComponents from './debug';

// Re-export debug components
export const {
  DebugPanel,
  PerformanceMetrics,
  ServiceStatusPanel,
  DebugLogs,
  ApplicationState,
  ProgressDebugPanel
} = debugComponents;

// Always export these components
export * from './displays';
export * from './layout';
export * from './logs';
export * from './tabs';
