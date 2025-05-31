/**
 * LogStore.ts
 * Domain Store for Log Management
 * 
 * Manages application logs, log filtering, log export,
 * and log-related UI state.
 */

import { makeObservable, action, reaction } from 'mobx';
import type { LogEntry } from '../../types';

/**
 * Log filtering and display options
 */
export interface LogFilterState {
  showInfo: boolean;
  showSuccess: boolean;
  showWarning: boolean;
  showError: boolean;
  searchQuery: string;
  maxEntries: number;
  autoScroll: boolean;
}

/**
 * Log export options
 */
export interface LogExportOptions {
  format: 'txt' | 'json' | 'csv';
  includeTimestamp: boolean;
  includeType: boolean;
  filterTypes: LogEntry['type'][];
  dateRange?: {
    start: Date;
    end: Date;
  };
}

/**
 * Log Domain Store
 * Manages all application logs and log-related operations
 */
export class LogStore {
  // Core log data
  public logs: LogEntry[] = [];
  public filteredLogs: LogEntry[] = [];

  // Log filtering and display
  public filterState: LogFilterState = {
    showInfo: true,
    showSuccess: true,
    showWarning: true,
    showError: true,
    searchQuery: '',
    maxEntries: 1000,
    autoScroll: true
  };

  // Log statistics
  public statistics: {
    total: number;
    info: number;
    success: number;
    warning: number;
    error: number;
    todayCount: number;
  } = {
    total: 0,
    info: 0,
    success: 0,
    warning: 0,
    error: 0,
    todayCount: 0
  };

  // Export state
  public isExporting: boolean = false;
  public exportProgress: number = 0;

  // Event emitters for coordination
  public onNewLog: LogEntry | null = null;
  public onLogsClear: boolean = false;

  // Log change listeners
  private logChangeListeners: Array<() => void> = [];

  private maxLogEntries: number = 1000;

  constructor() {
    // When using decorators, makeObservable should not have a second argument
    makeObservable(this);

    this.loadLogPreferences();
    this.setupLogFiltering();
  }

  /**
   * Load log preferences from localStorage
   */
  private loadLogPreferences(): void {
    try {
      const saved = localStorage.getItem('log-preferences');
      if (saved) {
        const prefs = JSON.parse(saved);
        this.filterState = { ...this.filterState, ...prefs };
      }
    } catch (error) {
      console.warn('Failed to load log preferences:', error);
    }
  }

  /**
   * Save log preferences to localStorage
   */
  private saveLogPreferences(): void {
    try {
      localStorage.setItem('log-preferences', JSON.stringify(this.filterState));
    } catch (error) {
      console.warn('Failed to save log preferences:', error);
    }
  }

  /**
   * Setup reactive log filtering
   */
  private setupLogFiltering(): void {
    // Use MobX reaction to update filtered logs when logs or filter state changes
    reaction(
      () => ({ logs: this.logs, filter: this.filterState }),
      () => this.updateFilteredLogs()
    );
  }

  /**
   * Update filtered logs based on current filter state
   */
  @action
  updateFilteredLogs(): void {
    const allLogs = this.logs;
    const filter = this.filterState;
    
    let filtered = allLogs.filter((log: LogEntry) => {
      // Type filtering
      const typeVisible = (
        (log.type === 'info' && filter.showInfo) ||
        (log.type === 'success' && filter.showSuccess) ||
        (log.type === 'warning' && filter.showWarning) ||
        (log.type === 'error' && filter.showError)
      );

      if (!typeVisible) return false;

      // Search filtering
      if (filter.searchQuery) {
        return log.message.toLowerCase().includes(filter.searchQuery.toLowerCase());
      }

      return true;
    });

    // Limit entries
    if (filtered.length > filter.maxEntries) {
      filtered = filtered.slice(-filter.maxEntries);
    }

    this.filteredLogs = filtered;
    this.updateStatistics();
  }

  /**
   * Update log statistics
   */
  @action
  updateStatistics(): void {
    const allLogs = this.logs;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const stats = allLogs.reduce(
      (acc, log: LogEntry) => {
        acc.total++;
        acc[log.type]++;
        
        if (log.timestamp >= today) {
          acc.todayCount++;
        }
        
        return acc;
      },
      { total: 0, info: 0, success: 0, warning: 0, error: 0, todayCount: 0 }
    );

    this.statistics = stats;
  }

  /**
   * Add a new log entry
   */
  @action
  addLog(message: string, type: LogEntry['type'] = 'info', source?: string): void {
    const logEntry: LogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      message,
      type,
      source
    };

    let updatedLogs = [...this.logs, logEntry];

    // Maintain maximum log entries
    if (updatedLogs.length > this.maxLogEntries) {
      updatedLogs = updatedLogs.slice(-this.maxLogEntries);
    }

    this.logs = updatedLogs;
    this.onNewLog = logEntry;
    
    // Notify listeners of log change
    this.notifyLogChange();
  }

  /**
   * Add multiple log entries
   */
  @action
  addLogs(entries: Array<{ message: string; type: LogEntry['type']; source?: string }>): void {
    const timestamp = new Date();
    const newEntries: LogEntry[] = entries.map((entry, index) => ({
      id: crypto.randomUUID(),
      message: entry.message,
      type: entry.type,
      timestamp: new Date(timestamp.getTime() + index), // Slight offset for ordering
      source: entry.source
    }));

    let updatedLogs = [...this.logs, ...newEntries];

    // Maintain maximum log entries
    if (updatedLogs.length > this.maxLogEntries) {
      updatedLogs = updatedLogs.slice(-this.maxLogEntries);
    }

    this.logs = updatedLogs;
    
    // Emit last added log
    if (newEntries.length > 0) {
      this.onNewLog = newEntries[newEntries.length - 1];
    }
    
    // Notify listeners of log change
    this.notifyLogChange();
  }

  /**
   * Clear all logs
   */
  @action
  clearLogs(): void {
    this.logs = [];
    this.onLogsClear = true;
    setTimeout(() => { this.onLogsClear = false; }, 100);
    
    // Notify listeners of log change
    this.notifyLogChange();
  }

  /**
   * Clear logs by type
   */
  @action
  clearLogsByType(type: LogEntry['type']): void {
    const filteredLogs = this.logs.filter((log: LogEntry) => log.type !== type);
    this.logs = filteredLogs;
  }

  /**
   * Clear logs older than specified time
   */
  @action
  clearOldLogs(olderThan: Date): void {
    const filteredLogs = this.logs.filter((log: LogEntry) => log.timestamp >= olderThan);
    this.logs = filteredLogs;
  }

  /**
   * Filter operations
   */
  @action
  setTypeFilter(type: keyof Pick<LogFilterState, 'showInfo' | 'showSuccess' | 'showWarning' | 'showError'>, visible: boolean): void {
    this.filterState = { ...this.filterState, [type]: visible };
    this.saveLogPreferences();
  }

  @action
  setSearchQuery(query: string): void {
    this.filterState = { ...this.filterState, searchQuery: query };
    this.saveLogPreferences();
  }

  @action
  setMaxEntries(max: number): void {
    this.maxLogEntries = max;
    this.filterState = { ...this.filterState, maxEntries: max };
    this.saveLogPreferences();
  }

  @action
  setAutoScroll(autoScroll: boolean): void {
    this.filterState = { ...this.filterState, autoScroll };
    this.saveLogPreferences();
  }

  /**
   * Set maximum log entries
   */
  @action
  setMaxLogs(maxLogs: number): void {
    if (maxLogs > 0 && maxLogs <= 10000) {
      this.maxLogEntries = maxLogs;
      this.filterState = { ...this.filterState, maxEntries: maxLogs };
      this.saveLogPreferences();
      
      // Trim existing logs if needed
      if (this.logs.length > maxLogs) {
        this.logs = this.logs.slice(-maxLogs);
      }
    }
  }

  /**
   * Reset all filters
   */
  @action
  resetFilters(): void {
    this.filterState = {
      showInfo: true,
      showSuccess: true,
      showWarning: true,
      showError: true,
      searchQuery: '',
      maxEntries: 1000,
      autoScroll: true
    };
    this.saveLogPreferences();
  }

  /**
   * Export logs
   */
  @action
  async exportLogs(options: LogExportOptions): Promise<string> {
    this.isExporting = true;
    this.exportProgress = 0;

    try {
      let logsToExport = this.logs;

      // Apply type filters
      if (options.filterTypes && options.filterTypes.length > 0) {
        logsToExport = logsToExport.filter((log: LogEntry) => options.filterTypes.includes(log.type));
      }

      // Apply date range filter
      if (options.dateRange) {
        logsToExport = logsToExport.filter((log: LogEntry) => 
          log.timestamp >= options.dateRange!.start && 
          log.timestamp <= options.dateRange!.end
        );
      }

      this.exportProgress = 30;

      let exportContent: string;

      switch (options.format) {
        case 'json':
          exportContent = JSON.stringify(logsToExport, null, 2);
          break;

        case 'csv':
          const headers = ['Timestamp', 'Type', 'Message'].join(',');
          const rows = logsToExport.map((log: LogEntry) => [
            options.includeTimestamp ? log.timestamp.toISOString() : '',
            options.includeType ? log.type : '',
            `"${log.message.replace(/"/g, '""')}"`
          ].filter(Boolean).join(','));
          exportContent = [headers, ...rows].join('\n');
          break;

        case 'txt':
        default:
          exportContent = logsToExport.map((log: LogEntry) => {
            const parts = [];
            if (options.includeTimestamp) {
              parts.push(`[${log.timestamp.toLocaleString()}]`);
            }
            if (options.includeType) {
              parts.push(`[${log.type.toUpperCase()}]`);
            }
            parts.push(log.message);
            return parts.join(' ');
          }).join('\n');
          break;
      }

      this.exportProgress = 100;
      return exportContent;

    } finally {
      setTimeout(() => {
        this.isExporting = false;
        this.exportProgress = 0;
      }, 500);
    }
  }

  /**
   * Get logs by type
   */
  getLogsByType(type: LogEntry['type']): LogEntry[] {
    return this.logs.filter((log: LogEntry) => log.type === type);
  }

  /**
   * Get recent logs (last N entries)
   */
  getRecentLogs(count: number): LogEntry[] {
    const allLogs = this.logs;
    return allLogs.slice(-count);
  }

  /**
   * Get logs in date range
   */
  getLogsInRange(start: Date, end: Date): LogEntry[] {
    return this.logs.filter((log: LogEntry) => 
      log.timestamp >= start && log.timestamp <= end
    );
  }

  /**
   * Search logs
   */
  searchLogs(query: string): LogEntry[] {
    const searchTerm = query.toLowerCase();
    return this.logs.filter((log: LogEntry) => 
      log.message.toLowerCase().includes(searchTerm)
    );
  }

  /**
   * Register a listener for log changes
   */
  onLogsChanged(callback: () => void): () => void {
    this.logChangeListeners.push(callback);
    
    // Return unsubscribe function
    return () => {
      const index = this.logChangeListeners.indexOf(callback);
      if (index > -1) {
        this.logChangeListeners.splice(index, 1);
      }
    };
  }

  /**
   * Notify all log change listeners
   */
  private notifyLogChange(): void {
    this.logChangeListeners.forEach(callback => {
      try {
        callback();
      } catch (error) {
        console.warn('Error in log change listener:', error);
      }
    });
  }





  /**
   * Cleanup
   */
  async cleanup(): Promise<void> {
    this.saveLogPreferences();
    this.logChangeListeners = [];
  }

  /**
   * Debug information
   */
  getDebugInfo(): object {
    return {
      totalLogs: this.logs.length,
      filteredLogs: this.filteredLogs.length,
      statistics: this.statistics,
      filterState: this.filterState,
      isExporting: this.isExporting,
      exportProgress: this.exportProgress
    };
  }
}

// Singleton instance
export const logStore = new LogStore();
