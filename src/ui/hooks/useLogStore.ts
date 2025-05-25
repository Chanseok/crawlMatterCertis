/**
 * useLogStore.ts
 * React hook for accessing the LogStore domain store
 * 
 * Provides access to log management operations and state with proper React integration
 * Consistent with other domain store hooks
 */

import { useEffect } from 'react';
import { logStore } from '../stores/domain/LogStore';
import type { LogEntry } from '../types';
import type { LogFilterState, LogExportOptions } from '../stores/domain/LogStore';

/**
 * Log management hook using Domain Store pattern
 * Provides log state and actions with proper React integration
 */
export function useLogStore() {
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Optional cleanup if needed
    };
  }, []);

  return {
    // Log data
    logs: logStore.logs,
    filteredLogs: logStore.filteredLogs,
    filterState: logStore.filterState,
    statistics: logStore.statistics,
    isExporting: logStore.isExporting,
    exportProgress: logStore.exportProgress,
    onNewLog: logStore.onNewLog,
    onLogsClear: logStore.onLogsClear,

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
