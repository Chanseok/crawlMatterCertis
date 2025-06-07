/**
 * UIStore.ts
 * Domain Store for UI State Management
 * 
 * Manages UI-specific state including search queries, user preferences,
 * view states, and user interface interactions.
 */

import { makeObservable, observable, action } from 'mobx';
import type { AppMode } from '../../types';

/**
 * UI preferences and settings
 */
export interface UIPreferences {
  theme: 'light' | 'dark' | 'system';
  sidebarCollapsed: boolean;
  autoRefresh: boolean;
  pageSize: number;
  showAdvancedOptions: boolean;
}

/**
 * View state for different sections
 */
export interface ViewState {
  // Section expansion states
  dbSectionExpanded: boolean;
  productsSectionExpanded: boolean;
  logsSectionExpanded: boolean;
  settingsSectionExpanded: boolean;
  
  // Modal states
  deleteModalVisible: boolean;
  settingsModalVisible: boolean;
  exportModalVisible: boolean;
  
  // Loading states
  isRefreshing: boolean;
  isExporting: boolean;
}

/**
 * Search and filter state
 */
export interface SearchFilterState {
  searchQuery: string;
  filterBy: string;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  currentPage: number;
}

/**
 * Search state interface
 */
export interface SearchState {
  query: string;
  category: string;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  filters: Record<string, any>;
}

/**
 * UI Domain Store
 * Manages all UI-specific state and user interface interactions
 */
export class UIStore {
  // App mode management
  public appMode: AppMode = 'development';

  // Search and filtering
  public searchQuery: string = '';
  public filterBy: string = 'all';
  public sortBy: string = 'pageId';
  public sortOrder: 'asc' | 'desc' = 'desc';
  public currentPage: number = 1;

  // UI preferences
  public preferences: UIPreferences = {
    theme: 'system',
    sidebarCollapsed: false,
    autoRefresh: false,
    pageSize: 100,
    showAdvancedOptions: false
  };

  // View states
  public viewState: ViewState = {
    dbSectionExpanded: true,
    productsSectionExpanded: true,
    logsSectionExpanded: true,
    settingsSectionExpanded: true,
    deleteModalVisible: false,
    settingsModalVisible: false,
    exportModalVisible: false,
    isRefreshing: false,
    isExporting: false
  };

  // Delete modal specific state
  public deleteRange: {
    startPageId: number;
    endPageId: number;
  } = {
    startPageId: 0,
    endPageId: 0
  };

  // Notification state
  public notifications: Array<{
    id: string;
    type: 'info' | 'success' | 'warning' | 'error';
    message: string;
    timestamp: Date;
    dismissed: boolean;
  }> = [];

  // Event emitters for UI coordination
  public onUIChange: { type: string; data?: any } | null = null;

  /**
   * UI state management for ViewModels
   */
  private uiStateStorage: Map<string, any> = new Map();

  constructor() {
    makeObservable(this, {
      // Observable state
      appMode: observable,
      searchQuery: observable,
      filterBy: observable,
      sortBy: observable,
      sortOrder: observable,
      currentPage: observable,
      preferences: observable,
      viewState: observable,
      deleteRange: observable,
      notifications: observable,
      onUIChange: observable,

      // Actions
      setSearchQuery: action,
      setFilter: action,
      setSorting: action,
      setCurrentPage: action,
      toggleSection: action,
      showModal: action,
      hideModal: action,
      setRefreshing: action,
      setExporting: action,
      setDeleteRange: action,
      openDeleteModal: action,
      closeDeleteModal: action,
      updatePreferences: action,
      toggleSidebar: action,
      setTheme: action,
      setPageSize: action,
      addNotification: action,
      dismissNotification: action,
      clearAllNotifications: action,
      resetSearchAndFilters: action,
      toggleAppMode: action,
      cleanup: action,
      setUIState: action,
      getUIState: action

      // Computed properties - none currently
    });

    this.loadUIPreferences();
  }

  /**
   * Load UI preferences from localStorage
   */
  private loadUIPreferences(): void {
    try {
      const saved = localStorage.getItem('ui-preferences');
      if (saved) {
        const prefs = JSON.parse(saved);
        this.preferences = { ...this.preferences, ...prefs };
      }
    } catch (error) {
      console.warn('Failed to load UI preferences:', error);
    }
  }

  /**
   * Save UI preferences to localStorage
   */
  private saveUIPreferences(): void {
    try {
      localStorage.setItem('ui-preferences', JSON.stringify(this.preferences));
    } catch (error) {
      console.warn('Failed to save UI preferences:', error);
    }
  }

  /**
   * Search operations
   */
  setSearchQuery(query: string): void {
    this.searchQuery = query;
    this.currentPage = 1; // Reset to first page when searching
    this.onUIChange = { type: 'search', data: { query } };
  }

  setFilter(filterBy: string): void {
    this.filterBy = filterBy;
    this.currentPage = 1;
    this.onUIChange = { type: 'filter', data: { filterBy } };
  }

  setSorting(sortBy: string, sortOrder: 'asc' | 'desc' = 'desc'): void {
    this.sortBy = sortBy;
    this.sortOrder = sortOrder;
    this.onUIChange = { type: 'sort', data: { sortBy, sortOrder } };
  }

  setCurrentPage(page: number): void {
    this.currentPage = page;
    this.onUIChange = { type: 'pagination', data: { page } };
  }

  /**
   * View state operations
   */
  toggleSection(section: keyof Pick<ViewState, 'dbSectionExpanded' | 'productsSectionExpanded' | 'logsSectionExpanded' | 'settingsSectionExpanded'>): void {
    const currentState = this.viewState;
    this.viewState = { ...this.viewState, [section]: !currentState[section] };
    this.onUIChange = { type: 'sectionToggle', data: { section, expanded: !currentState[section] } };
  }

  showModal(modal: keyof Pick<ViewState, 'deleteModalVisible' | 'settingsModalVisible' | 'exportModalVisible'>): void {
    this.viewState = { ...this.viewState, [modal]: true };
    this.onUIChange = { type: 'modalShow', data: { modal } };
  }

  hideModal(modal: keyof Pick<ViewState, 'deleteModalVisible' | 'settingsModalVisible' | 'exportModalVisible'>): void {
    this.viewState = { ...this.viewState, [modal]: false };
    this.onUIChange = { type: 'modalHide', data: { modal } };
  }

  setRefreshing(isRefreshing: boolean): void {
    this.viewState = { ...this.viewState, isRefreshing };
    this.onUIChange = { type: 'refreshing', data: { isRefreshing } };
  }

  setExporting(isExporting: boolean): void {
    this.viewState = { ...this.viewState, isExporting };
    this.onUIChange = { type: 'exporting', data: { isExporting } };
  }

  /**
   * Delete modal operations
   */
  setDeleteRange(startPageId: number, endPageId: number): void {
    this.deleteRange = { startPageId, endPageId };
    this.onUIChange = { type: 'deleteRange', data: { startPageId, endPageId } };
  }

  openDeleteModal(startPageId: number, endPageId: number): void {
    this.setDeleteRange(startPageId, endPageId);
    this.showModal('deleteModalVisible');
  }

  closeDeleteModal(): void {
    this.hideModal('deleteModalVisible');
    this.setDeleteRange(0, 0);
  }

  /**
   * Preferences operations
   */
  updatePreferences(updates: Partial<UIPreferences>): void {
    this.preferences = { ...this.preferences, ...updates };
    this.saveUIPreferences();
    this.onUIChange = { type: 'preferences', data: updates };
  }

  toggleSidebar(): void {
    const current = this.preferences;
    this.updatePreferences({ sidebarCollapsed: !current.sidebarCollapsed });
  }

  setTheme(theme: UIPreferences['theme']): void {
    this.updatePreferences({ theme });
  }

  setPageSize(pageSize: number): void {
    this.updatePreferences({ pageSize });
    this.currentPage = 1; // Reset pagination when page size changes
  }

  /**
   * Notification operations
   */
  addNotification(type: 'info' | 'success' | 'warning' | 'error', message: string): void {
    const notification = {
      id: `notification-${Date.now()}-${Math.random()}`,
      type,
      message,
      timestamp: new Date(),
      dismissed: false
    };

    const current = this.notifications;
    this.notifications = [notification, ...current];

    // Auto-dismiss after 5 seconds for non-error notifications
    if (type !== 'error') {
      setTimeout(() => {
        this.dismissNotification(notification.id);
      }, 5000);
    }

    this.onUIChange = { type: 'notification', data: notification };
  }

  dismissNotification(id: string): void {
    const current = this.notifications;
    const updated = current.map((n: any) => 
      n.id === id ? { ...n, dismissed: true } : n
    );
    this.notifications = updated;

    // Remove dismissed notifications after animation
    setTimeout(() => {
      const filtered = this.notifications.filter((n: any) => !n.dismissed);
      this.notifications = filtered;
    }, 300);

    this.onUIChange = { type: 'notificationDismiss', data: { id } };
  }

  clearAllNotifications(): void {
    this.notifications = [];
    this.onUIChange = { type: 'notificationsClear' };
  }

  /**
   * Reset UI state
   */
  resetSearchAndFilters(): void {
    this.searchQuery = '';
    this.filterBy = 'all';
    this.sortBy = 'pageId';
    this.sortOrder = 'desc';
    this.currentPage = 1;
    this.onUIChange = { type: 'reset' };
  }

  /**
   * Get current search/filter state
   */
  getSearchFilterState(): SearchFilterState {
    return {
      searchQuery: this.searchQuery,
      filterBy: this.filterBy,
      sortBy: this.sortBy,
      sortOrder: this.sortOrder,
      currentPage: this.currentPage
    };
  }

  /**
   * UI state management for ViewModels
   */
  setUIState(key: string, state: any): void {
    this.uiStateStorage.set(key, state);
    
    // Optionally persist to localStorage
    try {
      localStorage.setItem(`ui-state-${key}`, JSON.stringify(state));
    } catch (error) {
      console.warn(`Failed to persist UI state for key ${key}:`, error);
    }
  }

  getUIState(key: string): any {
    // Try to get from memory first
    if (this.uiStateStorage.has(key)) {
      return this.uiStateStorage.get(key);
    }
    
    // Fallback to localStorage
    try {
      const stored = localStorage.getItem(`ui-state-${key}`);
      if (stored) {
        const state = JSON.parse(stored);
        this.uiStateStorage.set(key, state);
        return state;
      }
    } catch (error) {
      console.warn(`Failed to load UI state for key ${key}:`, error);
    }
    
    return null;
  }

  /**
   * App mode management
   */
  toggleAppMode(): void {
    const currentMode = this.appMode;
    const newMode = currentMode === 'development' ? 'production' : 'development';
    
    this.appMode = newMode;
    
    // API 재초기화 및 로그 추가는 외부에서 처리하도록 이벤트 발생
    this.onUIChange = { 
      type: 'appModeChanged', 
      data: { previousMode: currentMode, newMode } 
    };
  }

  /**
   * Cleanup
   */
  async cleanup(): Promise<void> {
    this.saveUIPreferences();
    this.clearAllNotifications();
  }

  /**
   * Debug information
   */
  getDebugInfo(): object {
    return {
      searchQuery: this.searchQuery,
      filterBy: this.filterBy,
      sortBy: this.sortBy,
      sortOrder: this.sortOrder,
      currentPage: this.currentPage,
      preferences: this.preferences,
      viewState: this.viewState,
      deleteRange: this.deleteRange,
      notificationsCount: this.notifications.length
    };
  }
}

// Singleton instance
export const uiStore = new UIStore();
