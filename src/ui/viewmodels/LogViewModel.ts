import { makeObservable, computed, action, runInAction } from 'mobx';
import { BaseViewModel } from './core/BaseViewModel';
import { LogStore } from '../stores/domain/LogStore';
import type { LogEntry } from '../types';

// Define LogLevel based on LogEntry type
type LogLevel = LogEntry['type'];

/**
 * Log view state for filtering and display
 */
export interface LogViewState {
  currentPage: number;
  pageSize: number;
  maxLogs: number;
  autoScroll: boolean;
  levelFilter: LogLevel[];
  sourceFilter: string[];
  searchText: string;
  isExpanded: boolean;
  showTimestamps: boolean;
  wordWrap: boolean;
}

/**
 * Log display preferences
 */
export interface LogDisplayPreferences {
  fontSize: number;
  theme: 'light' | 'dark' | 'auto';
  density: 'compact' | 'comfortable' | 'spacious';
  showIcons: boolean;
}

/**
 * LogViewModel
 * 
 * Manages log display, filtering, and user interactions.
 * Provides UI-specific logic for log management while delegating
 * data operations to LogStore.
 */
export class LogViewModel extends BaseViewModel {
  // Domain Store reference
  private logStore: LogStore;

  // Observable view state
  private _viewState: LogViewState = {
    currentPage: 1,
    pageSize: 100,
    maxLogs: 1000,
    autoScroll: true,
    levelFilter: ['error', 'warning', 'info', 'success'],
    sourceFilter: [],
    searchText: '',
    isExpanded: true,
    showTimestamps: true,
    wordWrap: false
  };

  private _displayPreferences: LogDisplayPreferences = {
    fontSize: 12,
    theme: 'auto',
    density: 'comfortable',
    showIcons: true
  };

  private _filteredLogs: LogEntry[] = [];
  private _isAutoScrolling: boolean = false;

  constructor(logStore: LogStore) {
    super();
    this.logStore = logStore;

    makeObservable(this, {
      viewState: computed,
      displayPreferences: computed,
      allLogs: computed,
      filteredLogs: computed,
      paginatedLogs: computed,
      totalPages: computed,
      availableLevels: computed,
      availableSources: computed,
      logCounts: computed,
      hasLogs: computed,
      hasFilteredLogs: computed,
      isFiltered: computed,
      canExport: computed,
      isAutoScrolling: computed,
      setPage: action,
      setPageSize: action,
      setMaxLogs: action,
      toggleAutoScroll: action,
      setAutoScroll: action,
      setExpanded: action,
      toggleExpanded: action,
      toggleTimestamps: action,
      toggleWordWrap: action,
      setLevelFilter: action,
      toggleLevelFilter: action,
      setSourceFilter: action,
      toggleSourceFilter: action,
      setSearchText: action,
      clearFilters: action,
      setFontSize: action,
      setTheme: action,
      setDensity: action,
      toggleIcons: action,
      clearLogs: action,
      exportLogs: action
    });
    
    // Load preferences from localStorage first
    this.loadPreferences();
    
    // Initialize filtered logs after MobX setup is complete
    // Use setTimeout to ensure MobX observables are fully initialized
    setTimeout(() => {
      this.applyFilters();
    }, 0);
  }

  /**
   * Public method to add a log entry via the ViewModel (prevents direct access to private logStore)
   */
  addLog(message: string, type: LogLevel = 'info', source?: string): void {
    this.logStore.addLog(message, type, source);
  }

  // ================================
  // Computed Properties
  // ================================

  @computed get viewState(): LogViewState {
    return { ...this._viewState };
  }

  @computed get displayPreferences(): LogDisplayPreferences {
    return { ...this._displayPreferences };
  }

  @computed get allLogs(): LogEntry[] {
    return this.logStore.logs;
  }

  @computed get filteredLogs(): LogEntry[] {
    return this._filteredLogs;
  }

  @computed get paginatedLogs(): LogEntry[] {
    if (!this._viewState.autoScroll) {
      const startIndex = (this._viewState.currentPage - 1) * this._viewState.pageSize;
      const endIndex = startIndex + this._viewState.pageSize;
      return this._filteredLogs.slice(startIndex, endIndex);
    }
    
    // For auto-scroll, show the most recent logs
    return this._filteredLogs.slice(-this._viewState.pageSize);
  }

  @computed get totalPages(): number {
    return Math.ceil(this._filteredLogs.length / this._viewState.pageSize);
  }

  @computed get availableLevels(): LogLevel[] {
    const levels = new Set<LogLevel>();
    this.logStore.logs.forEach(log => levels.add(log.type));
    return Array.from(levels).sort((a, b) => {
      const order = ['error', 'warning', 'info', 'success'];
      return order.indexOf(a) - order.indexOf(b);
    });
  }

  @computed get availableSources(): string[] {
    const sources = new Set<string>();
    this.logStore.logs.forEach(log => {
      if (log.source) sources.add(log.source);
    });
    return Array.from(sources).sort();
  }

  @computed get logCounts() {
    const counts = {
      total: this.logStore.logs.length,
      filtered: this._filteredLogs.length,
      error: 0,
      warning: 0,
      info: 0,
      success: 0
    };

    this._filteredLogs.forEach(log => {
      counts[log.type]++;
    });

    return counts;
  }

  @computed get hasLogs(): boolean {
    return this.allLogs.length > 0;
  }

  @computed get hasFilteredLogs(): boolean {
    return this._filteredLogs.length > 0;
  }

  @computed get isFiltered(): boolean {
    return this._viewState.levelFilter.length < this.availableLevels.length ||
           this._viewState.sourceFilter.length > 0 ||
           this._viewState.searchText.length > 0;
  }

  @computed get canExport(): boolean {
    return this.hasFilteredLogs;
  }

  @computed get isAutoScrolling(): boolean {
    return this._isAutoScrolling;
  }

  // ================================
  // Actions - View State Management
  // ================================

  @action
  setPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this._viewState.currentPage = page;
      this._viewState.autoScroll = false;
    }
  }

  @action
  setPageSize(size: number): void {
    if (size > 0 && size <= 500) {
      this._viewState.pageSize = size;
      this._viewState.currentPage = 1;
    }
  }

  @action
  setMaxLogs(maxLogs: number): void {
    if (maxLogs > 0 && maxLogs <= 10000) {
      this._viewState.maxLogs = maxLogs;
      this.logStore.setMaxLogs(maxLogs);
      this.applyFilters();
    }
  }

  @action
  toggleAutoScroll(): void {
    this._viewState.autoScroll = !this._viewState.autoScroll;
    if (this._viewState.autoScroll) {
      this.scrollToBottom();
    }
  }

  @action
  setAutoScroll(enabled: boolean): void {
    this._viewState.autoScroll = enabled;
    if (enabled) {
      this.scrollToBottom();
    }
  }

  @action
  toggleExpanded(): void {
    this._viewState.isExpanded = !this._viewState.isExpanded;
  }

  @action
  setExpanded(expanded: boolean): void {
    this._viewState.isExpanded = expanded;
  }

  @action
  toggleTimestamps(): void {
    this._viewState.showTimestamps = !this._viewState.showTimestamps;
    this.savePreferences();
  }

  @action
  toggleWordWrap(): void {
    this._viewState.wordWrap = !this._viewState.wordWrap;
    this.savePreferences();
  }

  // ================================
  // Actions - Filtering
  // ================================

  @action
  setLevelFilter(levels: LogLevel[]): void {
    this._viewState.levelFilter = [...levels];
    this._viewState.currentPage = 1;
    this.applyFilters();
  }

  @action
  toggleLevelFilter(level: LogLevel): void {
    const currentFilters = [...this._viewState.levelFilter];
    const index = currentFilters.indexOf(level);
    
    if (index > -1) {
      currentFilters.splice(index, 1);
    } else {
      currentFilters.push(level);
    }
    
    this.setLevelFilter(currentFilters);
  }

  @action
  setSourceFilter(sources: string[]): void {
    this._viewState.sourceFilter = [...sources];
    this._viewState.currentPage = 1;
    this.applyFilters();
  }

  @action
  toggleSourceFilter(source: string): void {
    const currentFilters = [...this._viewState.sourceFilter];
    const index = currentFilters.indexOf(source);
    
    if (index > -1) {
      currentFilters.splice(index, 1);
    } else {
      currentFilters.push(source);
    }
    
    this.setSourceFilter(currentFilters);
  }

  @action
  setSearchText(text: string): void {
    this._viewState.searchText = text;
    this._viewState.currentPage = 1;
    this.applyFilters();
  }

  @action
  clearFilters(): void {
    this._viewState.levelFilter = ['error', 'warning', 'info', 'success'];
    this._viewState.sourceFilter = [];
    this._viewState.searchText = '';
    this._viewState.currentPage = 1;
    this.applyFilters();
  }

  // ================================
  // Actions - Display Preferences
  // ================================

  @action
  setFontSize(size: number): void {
    if (size >= 8 && size <= 24) {
      this._displayPreferences.fontSize = size;
      this.savePreferences();
    }
  }

  @action
  setTheme(theme: 'light' | 'dark' | 'auto'): void {
    this._displayPreferences.theme = theme;
    this.savePreferences();
  }

  @action
  setDensity(density: 'compact' | 'comfortable' | 'spacious'): void {
    this._displayPreferences.density = density;
    this.savePreferences();
  }

  @action
  toggleIcons(): void {
    this._displayPreferences.showIcons = !this._displayPreferences.showIcons;
    this.savePreferences();
  }

  // ================================
  // Actions - Log Operations
  // ================================

  @action
  clearLogs(): void {
    this.logStore.clearLogs();
    this.applyFilters();
  }

  @action
  scrollToBottom(): void {
    // Calculate total pages directly to avoid cycle with computed property
    const totalPages = Math.ceil(this._filteredLogs.length / this._viewState.pageSize) || 1;
    this._viewState.currentPage = totalPages;
    this._isAutoScrolling = true;
    
    // Reset auto scrolling flag after a brief delay
    setTimeout(() => {
      runInAction(() => {
        this._isAutoScrolling = false;
      });
    }, 100);
  }

  @action
  async exportLogs(format: 'txt' | 'json' | 'csv' = 'txt'): Promise<void> {
    try {
      const logsToExport = this._filteredLogs.length > 0 ? this._filteredLogs : this.allLogs;
      
      let content: string;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      let filename: string;

      switch (format) {
        case 'json':
          content = JSON.stringify(logsToExport, null, 2);
          filename = `logs-${timestamp}.json`;
          break;
          
        case 'csv':
          const headers = 'Timestamp,Level,Message,Source\n';
          const csvRows = logsToExport.map(log => 
            `"${log.timestamp.toISOString()}","${log.type}","${log.message.replace(/"/g, '""')}","${log.source || ''}"`
          );
          content = headers + csvRows.join('\n');
          filename = `logs-${timestamp}.csv`;
          break;
          
        default: // txt
          content = logsToExport.map(log => 
            `[${log.timestamp.toISOString()}] ${log.type.toUpperCase()}: ${log.message}${log.source ? ` (${log.source})` : ''}`
          ).join('\n');
          filename = `logs-${timestamp}.txt`;
      }

      // Create and download file
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      this.logStore.addLog(`Exported ${logsToExport.length} logs as ${format.toUpperCase()}`, 'info', 'LOG_VIEWER');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logStore.addLog(`Failed to export logs: ${errorMessage}`, 'error', 'LOG_VIEWER');
    }
  }

  // ================================
  // Private Methods
  // ================================

  private applyFilters(): void {
    runInAction(() => {
      let filtered = [...this.logStore.logs];

      // Apply level filter
      if (this._viewState.levelFilter.length > 0) {
        filtered = filtered.filter(log => this._viewState.levelFilter.includes(log.type));
      }

      // Apply source filter
      if (this._viewState.sourceFilter.length > 0) {
        filtered = filtered.filter(log => 
          log.source && this._viewState.sourceFilter.includes(log.source)
        );
      }

      // Apply search text filter
      if (this._viewState.searchText) {
        const searchLower = this._viewState.searchText.toLowerCase();
        filtered = filtered.filter(log =>
          log.message.toLowerCase().includes(searchLower) ||
          (log.source && log.source.toLowerCase().includes(searchLower))
        );
      }

      this._filteredLogs = filtered;
    });

    // Auto-scroll to bottom if enabled
    if (this._viewState.autoScroll) {
      this.scrollToBottom();
    }
  }

  private savePreferences(): void {
    try {
      const preferences = {
        viewState: {
          showTimestamps: this._viewState.showTimestamps,
          wordWrap: this._viewState.wordWrap,
          pageSize: this._viewState.pageSize,
          maxLogs: this._viewState.maxLogs
        },
        displayPreferences: this._displayPreferences
      };
      
      localStorage.setItem('logViewerPreferences', JSON.stringify(preferences));
    } catch (error) {
      console.warn('Failed to save log viewer preferences:', error);
    }
  }

  private loadPreferences(): void {
    try {
      const saved = localStorage.getItem('logViewerPreferences');
      if (saved) {
        const preferences = JSON.parse(saved);
        
        if (preferences.viewState) {
          this._viewState.showTimestamps = preferences.viewState.showTimestamps ?? true;
          this._viewState.wordWrap = preferences.viewState.wordWrap ?? false;
          this._viewState.pageSize = preferences.viewState.pageSize ?? 100;
          this._viewState.maxLogs = preferences.viewState.maxLogs ?? 1000;
        }
        
        if (preferences.displayPreferences) {
          this._displayPreferences = { ...this._displayPreferences, ...preferences.displayPreferences };
        }
      }
    } catch (error) {
      console.warn('Failed to load log viewer preferences:', error);
    }
  }

  // ================================
  // BaseViewModel Implementation
  // ================================

  async initialize(): Promise<void> {
    await super.initialize();
    
    // Set up auto-refresh for new logs
    this.logStore.onLogsChanged(() => {
      this.applyFilters();
    });
  }

  dispose(): void {
    // Save preferences before disposing
    this.savePreferences();
    super.dispose();
  }
}
