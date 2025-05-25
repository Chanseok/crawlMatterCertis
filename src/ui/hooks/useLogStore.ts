/**
 * useLogStore.ts
 * React hook for accessing the LogStore domain store
 * 
 * Provides access to log management operations and state with proper React integration
 * Consistent with other domain store hooks
 */

import { useStore } from '@nanostores/react';
import { useEffect } from 'react';
import { logStore } from '../stores/domain/LogStore';
import type { LogEntry } from '../types';
import type { LogFilterState, LogExportOptions } from '../stores/domain/LogStore';

/**
 * Log management hook using Domain Store pattern
 * Provides log state and actions with proper React integration
 */
export function useLogStore() {
  // Log data
  const logs = useStore(logStore.logs);
  const filteredLogs = useStore(logStore.filteredLogs);
  
  // Log filtering and display options
  const filterState = useStore(logStore.filterState);
  const statistics = useStore(logStore.statistics);
  
  // Log operation state
  const isExporting = useStore(logStore.isExporting);
  const exportProgress = useStore(logStore.exportProgress);
  
  // Event notifications
  const onNewLog = useStore(logStore.onNewLog);
  const onLogsClear = useStore(logStore.onLogsClear);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Optional cleanup if needed
    };
  }, []);

  return {
    // Log data
    logs,
    filteredLogs,
    filterState,
    statistics,
    isExporting,
    exportProgress,
    onNewLog,
    onLogsClear,

    // Log management actions
    addLog: (message: string, type: LogEntry['type'] = 'info') => 
      logStore.addLog(message, type),
    addLogs: (entries: Array<{ message: string; type: LogEntry['type'] }>) =>
      logStore.addLogs(entries),
    clearLogs: () => logStore.clearLogs(),
    clearLogsByType: (type: LogEntry['type']) => logStore.clearLogsByType(type),
    clearOldLogs: (olderThan: Date) => logStore.clearOldLogs(olderThan),
    
    // Log filtering actions
    setTypeFilter: (type: keyof Pick<LogFilterState, 'showInfo' | 'showSuccess' | 'showWarning' | 'showError'>, visible: boolean) =>
      logStore.setTypeFilter(type, visible),
    setSearchQuery: (query: string) => logStore.setSearchQuery(query),
    setMaxEntries: (max: number) => logStore.setMaxEntries(max),
    setAutoScroll: (autoScroll: boolean) => logStore.setAutoScroll(autoScroll),
    resetFilters: () => logStore.resetFilters(),
    
    // Log export and retrieval
    exportLogs: (options: LogExportOptions) => logStore.exportLogs(options),
    getLogsByType: (type: LogEntry['type']) => logStore.getLogsByType(type),
    getRecentLogs: (count: number) => logStore.getRecentLogs(count),
    getLogsInRange: (start: Date, end: Date) => logStore.getLogsInRange(start, end),
    searchLogs: (query: string) => logStore.searchLogs(query),
  };
}
