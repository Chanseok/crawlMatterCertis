/**
 * UIStore.ts
 * Domain Store for UI State Management
 * 
 * Manages UI-specific state including search queries, user preferences,
 * view states, and user interface interactions.
 */

import { atom, map } from 'nanostores';
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
  public readonly appMode = atom<AppMode>('development');

  // Search and filtering
  public readonly searchQuery = atom<string>('');
  public readonly filterBy = atom<string>('all');
  public readonly sortBy = atom<string>('pageId');
  public readonly sortOrder = atom<'asc' | 'desc'>('desc');
  public readonly currentPage = atom<number>(1);

  // UI preferences
  public readonly preferences = map<UIPreferences>({
    theme: 'system',
    sidebarCollapsed: false,
    autoRefresh: false,
    pageSize: 100,
    showAdvancedOptions: false
  });

  // View states
  public readonly viewState = map<ViewState>({
    dbSectionExpanded: true,
    productsSectionExpanded: true,
    logsSectionExpanded: true,
    settingsSectionExpanded: true,
    deleteModalVisible: false,
    settingsModalVisible: false,
    exportModalVisible: false,
    isRefreshing: false,
    isExporting: false
  });

  // Delete modal specific state
  public readonly deleteRange = map<{
    startPageId: number;
    endPageId: number;
  }>({
    startPageId: 0,
    endPageId: 0
  });

  // Notification state
  public readonly notifications = atom<Array<{
    id: string;
    type: 'info' | 'success' | 'warning' | 'error';
    message: string;
    timestamp: Date;
    dismissed: boolean;
  }>>([]);

  // Event emitters for UI coordination
  public readonly onUIChange = atom<{ type: string; data?: any } | null>(null);

  constructor() {
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
        this.preferences.set({ ...this.preferences.get(), ...prefs });
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
      localStorage.setItem('ui-preferences', JSON.stringify(this.preferences.get()));
    } catch (error) {
      console.warn('Failed to save UI preferences:', error);
    }
  }

  /**
   * Search operations
   */
  setSearchQuery(query: string): void {
    this.searchQuery.set(query);
    this.currentPage.set(1); // Reset to first page when searching
    this.onUIChange.set({ type: 'search', data: { query } });
  }

  setFilter(filterBy: string): void {
    this.filterBy.set(filterBy);
    this.currentPage.set(1);
    this.onUIChange.set({ type: 'filter', data: { filterBy } });
  }

  setSorting(sortBy: string, sortOrder: 'asc' | 'desc' = 'desc'): void {
    this.sortBy.set(sortBy);
    this.sortOrder.set(sortOrder);
    this.onUIChange.set({ type: 'sort', data: { sortBy, sortOrder } });
  }

  setCurrentPage(page: number): void {
    this.currentPage.set(page);
    this.onUIChange.set({ type: 'pagination', data: { page } });
  }

  /**
   * View state operations
   */
  toggleSection(section: keyof Pick<ViewState, 'dbSectionExpanded' | 'productsSectionExpanded' | 'logsSectionExpanded' | 'settingsSectionExpanded'>): void {
    const currentState = this.viewState.get();
    this.viewState.setKey(section, !currentState[section]);
    this.onUIChange.set({ type: 'sectionToggle', data: { section, expanded: !currentState[section] } });
  }

  showModal(modal: keyof Pick<ViewState, 'deleteModalVisible' | 'settingsModalVisible' | 'exportModalVisible'>): void {
    this.viewState.setKey(modal, true);
    this.onUIChange.set({ type: 'modalShow', data: { modal } });
  }

  hideModal(modal: keyof Pick<ViewState, 'deleteModalVisible' | 'settingsModalVisible' | 'exportModalVisible'>): void {
    this.viewState.setKey(modal, false);
    this.onUIChange.set({ type: 'modalHide', data: { modal } });
  }

  setRefreshing(isRefreshing: boolean): void {
    this.viewState.setKey('isRefreshing', isRefreshing);
    this.onUIChange.set({ type: 'refreshing', data: { isRefreshing } });
  }

  setExporting(isExporting: boolean): void {
    this.viewState.setKey('isExporting', isExporting);
    this.onUIChange.set({ type: 'exporting', data: { isExporting } });
  }

  /**
   * Delete modal operations
   */
  setDeleteRange(startPageId: number, endPageId: number): void {
    this.deleteRange.set({ startPageId, endPageId });
    this.onUIChange.set({ type: 'deleteRange', data: { startPageId, endPageId } });
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
    this.preferences.set({ ...this.preferences.get(), ...updates });
    this.saveUIPreferences();
    this.onUIChange.set({ type: 'preferences', data: updates });
  }

  toggleSidebar(): void {
    const current = this.preferences.get();
    this.updatePreferences({ sidebarCollapsed: !current.sidebarCollapsed });
  }

  setTheme(theme: UIPreferences['theme']): void {
    this.updatePreferences({ theme });
  }

  setPageSize(pageSize: number): void {
    this.updatePreferences({ pageSize });
    this.currentPage.set(1); // Reset pagination when page size changes
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

    const current = this.notifications.get();
    this.notifications.set([notification, ...current]);

    // Auto-dismiss after 5 seconds for non-error notifications
    if (type !== 'error') {
      setTimeout(() => {
        this.dismissNotification(notification.id);
      }, 5000);
    }

    this.onUIChange.set({ type: 'notification', data: notification });
  }

  dismissNotification(id: string): void {
    const current = this.notifications.get();
    const updated = current.map(n => 
      n.id === id ? { ...n, dismissed: true } : n
    );
    this.notifications.set(updated);

    // Remove dismissed notifications after animation
    setTimeout(() => {
      const filtered = this.notifications.get().filter(n => !n.dismissed);
      this.notifications.set(filtered);
    }, 300);

    this.onUIChange.set({ type: 'notificationDismiss', data: { id } });
  }

  clearAllNotifications(): void {
    this.notifications.set([]);
    this.onUIChange.set({ type: 'notificationsClear' });
  }

  /**
   * Reset UI state
   */
  resetSearchAndFilters(): void {
    this.searchQuery.set('');
    this.filterBy.set('all');
    this.sortBy.set('pageId');
    this.sortOrder.set('desc');
    this.currentPage.set(1);
    this.onUIChange.set({ type: 'reset' });
  }

  /**
   * Get current search/filter state
   */
  getSearchFilterState(): SearchFilterState {
    return {
      searchQuery: this.searchQuery.get(),
      filterBy: this.filterBy.get(),
      sortBy: this.sortBy.get(),
      sortOrder: this.sortOrder.get(),
      currentPage: this.currentPage.get()
    };
  }

  /**
   * App mode management
   */
  toggleAppMode(): void {
    const currentMode = this.appMode.get();
    const newMode = currentMode === 'development' ? 'production' : 'development';
    
    this.appMode.set(newMode);
    
    // API 재초기화 및 로그 추가는 외부에서 처리하도록 이벤트 발생
    this.onUIChange.set({ 
      type: 'appModeChanged', 
      data: { previousMode: currentMode, newMode } 
    });
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
      searchQuery: this.searchQuery.get(),
      filterBy: this.filterBy.get(),
      sortBy: this.sortBy.get(),
      sortOrder: this.sortOrder.get(),
      currentPage: this.currentPage.get(),
      preferences: this.preferences.get(),
      viewState: this.viewState.get(),
      deleteRange: this.deleteRange.get(),
      notificationsCount: this.notifications.get().length
    };
  }
}

// Singleton instance
export const uiStore = new UIStore();
