/**
 * LogStore.ts
 * Domain Store for Log Management
 * 
 * Manages application logs, log filtering, log export,
 * and log-related UI state.
 */

import { atom, map } from 'nanostores';
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
  public readonly logs = atom<LogEntry[]>([]);
  public readonly filteredLogs = atom<LogEntry[]>([]);

  // Log filtering and display
  public readonly filterState = map<LogFilterState>({
    showInfo: true,
    showSuccess: true,
    showWarning: true,
    showError: true,
    searchQuery: '',
    maxEntries: 1000,
    autoScroll: true
  });

  // Log statistics
  public readonly statistics = map<{
    total: number;
    info: number;
    success: number;
    warning: number;
    error: number;
    todayCount: number;
  }>({
    total: 0,
    info: 0,
    success: 0,
    warning: 0,
    error: 0,
    todayCount: 0
  });

  // Export state
  public readonly isExporting = atom<boolean>(false);
  public readonly exportProgress = atom<number>(0);

  // Event emitters for coordination
  public readonly onNewLog = atom<LogEntry | null>(null);
  public readonly onLogsClear = atom<boolean>(false);

  private maxLogEntries: number = 1000;

  constructor() {
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
        this.filterState.set({ ...this.filterState.get(), ...prefs });
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
      localStorage.setItem('log-preferences', JSON.stringify(this.filterState.get()));
    } catch (error) {
      console.warn('Failed to save log preferences:', error);
    }
  }

  /**
   * Setup reactive log filtering
   */
  private setupLogFiltering(): void {
    // Update filtered logs when logs or filter state changes
    const updateFilteredLogs = () => {
      const allLogs = this.logs.get();
      const filter = this.filterState.get();
      
      let filtered = allLogs.filter(log => {
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

      this.filteredLogs.set(filtered);
      this.updateStatistics();
    };

    this.logs.listen(updateFilteredLogs);
    this.filterState.listen(updateFilteredLogs);
  }

  /**
   * Update log statistics
   */
  private updateStatistics(): void {
    const allLogs = this.logs.get();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const stats = allLogs.reduce(
      (acc, log) => {
        acc.total++;
        acc[log.type]++;
        
        if (log.timestamp >= today) {
          acc.todayCount++;
        }
        
        return acc;
      },
      { total: 0, info: 0, success: 0, warning: 0, error: 0, todayCount: 0 }
    );

    this.statistics.set(stats);
  }

  /**
   * Add a new log entry
   */
  addLog(message: string, type: LogEntry['type'] = 'info'): void {
    const logEntry: LogEntry = {
      timestamp: new Date(),
      message,
      type
    };

    const currentLogs = this.logs.get();
    let updatedLogs = [...currentLogs, logEntry];

    // Maintain maximum log entries
    if (updatedLogs.length > this.maxLogEntries) {
      updatedLogs = updatedLogs.slice(-this.maxLogEntries);
    }

    this.logs.set(updatedLogs);
    this.onNewLog.set(logEntry);
  }

  /**
   * Add multiple log entries
   */
  addLogs(entries: Array<{ message: string; type: LogEntry['type'] }>): void {
    const timestamp = new Date();
    const newEntries: LogEntry[] = entries.map(entry => ({
      ...entry,
      timestamp: new Date(timestamp.getTime() + Math.random() * 1000) // Slight offset for ordering
    }));

    const currentLogs = this.logs.get();
    let updatedLogs = [...currentLogs, ...newEntries];

    // Maintain maximum log entries
    if (updatedLogs.length > this.maxLogEntries) {
      updatedLogs = updatedLogs.slice(-this.maxLogEntries);
    }

    this.logs.set(updatedLogs);
    
    // Emit last added log
    if (newEntries.length > 0) {
      this.onNewLog.set(newEntries[newEntries.length - 1]);
    }
  }

  /**
   * Clear all logs
   */
  clearLogs(): void {
    this.logs.set([]);
    this.onLogsClear.set(true);
    setTimeout(() => this.onLogsClear.set(false), 100);
  }

  /**
   * Clear logs by type
   */
  clearLogsByType(type: LogEntry['type']): void {
    const currentLogs = this.logs.get();
    const filteredLogs = currentLogs.filter(log => log.type !== type);
    this.logs.set(filteredLogs);
  }

  /**
   * Clear logs older than specified time
   */
  clearOldLogs(olderThan: Date): void {
    const currentLogs = this.logs.get();
    const filteredLogs = currentLogs.filter(log => log.timestamp >= olderThan);
    this.logs.set(filteredLogs);
  }

  /**
   * Filter operations
   */
  setTypeFilter(type: keyof Pick<LogFilterState, 'showInfo' | 'showSuccess' | 'showWarning' | 'showError'>, visible: boolean): void {
    this.filterState.setKey(type, visible);
    this.saveLogPreferences();
  }

  setSearchQuery(query: string): void {
    this.filterState.setKey('searchQuery', query);
    this.saveLogPreferences();
  }

  setMaxEntries(max: number): void {
    this.maxLogEntries = max;
    this.filterState.setKey('maxEntries', max);
    this.saveLogPreferences();
  }

  setAutoScroll(autoScroll: boolean): void {
    this.filterState.setKey('autoScroll', autoScroll);
    this.saveLogPreferences();
  }

  /**
   * Reset all filters
   */
  resetFilters(): void {
    this.filterState.set({
      showInfo: true,
      showSuccess: true,
      showWarning: true,
      showError: true,
      searchQuery: '',
      maxEntries: 1000,
      autoScroll: true
    });
    this.saveLogPreferences();
  }

  /**
   * Export logs
   */
  async exportLogs(options: LogExportOptions): Promise<string> {
    this.isExporting.set(true);
    this.exportProgress.set(0);

    try {
      let logsToExport = this.logs.get();

      // Apply type filters
      if (options.filterTypes && options.filterTypes.length > 0) {
        logsToExport = logsToExport.filter(log => options.filterTypes.includes(log.type));
      }

      // Apply date range filter
      if (options.dateRange) {
        logsToExport = logsToExport.filter(log => 
          log.timestamp >= options.dateRange!.start && 
          log.timestamp <= options.dateRange!.end
        );
      }

      this.exportProgress.set(30);

      let exportContent: string;

      switch (options.format) {
        case 'json':
          exportContent = JSON.stringify(logsToExport, null, 2);
          break;

        case 'csv':
          const headers = ['Timestamp', 'Type', 'Message'].join(',');
          const rows = logsToExport.map(log => [
            options.includeTimestamp ? log.timestamp.toISOString() : '',
            options.includeType ? log.type : '',
            `"${log.message.replace(/"/g, '""')}"`
          ].filter(Boolean).join(','));
          exportContent = [headers, ...rows].join('\n');
          break;

        case 'txt':
        default:
          exportContent = logsToExport.map(log => {
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

      this.exportProgress.set(100);
      return exportContent;

    } finally {
      setTimeout(() => {
        this.isExporting.set(false);
        this.exportProgress.set(0);
      }, 500);
    }
  }

  /**
   * Get logs by type
   */
  getLogsByType(type: LogEntry['type']): LogEntry[] {
    return this.logs.get().filter(log => log.type === type);
  }

  /**
   * Get recent logs (last N entries)
   */
  getRecentLogs(count: number): LogEntry[] {
    const allLogs = this.logs.get();
    return allLogs.slice(-count);
  }

  /**
   * Get logs in date range
   */
  getLogsInRange(start: Date, end: Date): LogEntry[] {
    return this.logs.get().filter(log => 
      log.timestamp >= start && log.timestamp <= end
    );
  }

  /**
   * Search logs
   */
  searchLogs(query: string): LogEntry[] {
    const searchTerm = query.toLowerCase();
    return this.logs.get().filter(log => 
      log.message.toLowerCase().includes(searchTerm)
    );
  }

  /**
   * Cleanup
   */
  async cleanup(): Promise<void> {
    this.saveLogPreferences();
  }

  /**
   * Debug information
   */
  getDebugInfo(): object {
    return {
      totalLogs: this.logs.get().length,
      filteredLogs: this.filteredLogs.get().length,
      statistics: this.statistics.get(),
      filterState: this.filterState.get(),
      isExporting: this.isExporting.get(),
      exportProgress: this.exportProgress.get()
    };
  }
}

// Singleton instance
export const logStore = new LogStore();
