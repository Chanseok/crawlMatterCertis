/**
 * useUIStore.ts
 * React hook for accessing the UIStore domain store
 * 
 * Provides access to UI state and actions with proper React integration
 */

import { useStore } from '@nanostores/react';
import { useEffect } from 'react';
import { uiStore } from '../stores/domain/UIStore';
import type { UIPreferences, ViewState } from '../stores/domain/UIStore';

/**
 * UI state hook using Domain Store pattern
 * Provides UI state and actions with proper React integration
 */
export function useUIStore() {
  const searchQuery = useStore(uiStore.searchQuery);
  const filterBy = useStore(uiStore.filterBy);
  const sortBy = useStore(uiStore.sortBy);
  const sortOrder = useStore(uiStore.sortOrder);
  const currentPage = useStore(uiStore.currentPage);
  const preferences = useStore(uiStore.preferences);
  const viewState = useStore(uiStore.viewState);
  const deleteRange = useStore(uiStore.deleteRange);
  const notifications = useStore(uiStore.notifications);
  const onUIChange = useStore(uiStore.onUIChange);
  const appMode = useStore(uiStore.appMode);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Optional cleanup if needed
    };
  }, []);

  return {
    // State
    searchQuery,
    filterBy,
    sortBy,
    sortOrder,
    currentPage,
    preferences,
    viewState,
    deleteRange,
    notifications,
    onUIChange,
    appMode,

    // App mode actions
    toggleAppMode: () => uiStore.toggleAppMode(),

    // Search and filter actions
    setSearchQuery: (query: string) => uiStore.setSearchQuery(query),
    setFilter: (filterBy: string) => uiStore.setFilter(filterBy),
    setSorting: (sortBy: string, sortOrder: 'asc' | 'desc' = 'desc') => 
      uiStore.setSorting(sortBy, sortOrder),
    setCurrentPage: (page: number) => uiStore.setCurrentPage(page),

    // View state actions
    toggleSection: (section: keyof Pick<ViewState, 
      'dbSectionExpanded' | 'productsSectionExpanded' | 'logsSectionExpanded' | 'settingsSectionExpanded'>) => 
      uiStore.toggleSection(section),
    showModal: (modal: keyof Pick<ViewState, 
      'deleteModalVisible' | 'settingsModalVisible' | 'exportModalVisible'>) => 
      uiStore.showModal(modal),
    hideModal: (modal: keyof Pick<ViewState, 
      'deleteModalVisible' | 'settingsModalVisible' | 'exportModalVisible'>) => 
      uiStore.hideModal(modal),
    setRefreshing: (isRefreshing: boolean) => uiStore.setRefreshing(isRefreshing),
    setExporting: (isExporting: boolean) => uiStore.setExporting(isExporting),
    
    // Delete modal actions
    setDeleteRange: (startPageId: number, endPageId: number) => 
      uiStore.setDeleteRange(startPageId, endPageId),
    openDeleteModal: (startPageId: number, endPageId: number) => 
      uiStore.openDeleteModal(startPageId, endPageId),
    
    // Preference actions
    updatePreferences: (newPreferences: Partial<UIPreferences>) => 
      uiStore.updatePreferences(newPreferences),
    setTheme: (theme: UIPreferences['theme']) => uiStore.setTheme(theme),
    toggleSidebar: () => uiStore.toggleSidebar(),
    toggleAdvancedOptions: () => {
      const current = uiStore.preferences.get();
      uiStore.updatePreferences({ showAdvancedOptions: !current.showAdvancedOptions });
    },
    
    // Notification actions
    addNotification: (type: 'info' | 'success' | 'warning' | 'error', message: string) => 
      uiStore.addNotification(type, message),
    dismissNotification: (id: string) => uiStore.dismissNotification(id),
    clearNotifications: () => uiStore.clearAllNotifications(),
  };
}
