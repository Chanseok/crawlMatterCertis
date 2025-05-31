import { makeObservable, computed, action, observable } from 'mobx';
import { BaseViewModel } from './core/BaseViewModel';
import { UIStore } from '../stores/domain/UIStore';

/**
 * Tab configuration
 */
export interface TabConfig {
  id: string;
  label: string;
  icon?: string;
  closable?: boolean;
  disabled?: boolean;
}

/**
 * Section state for collapsible panels
 */
export interface SectionState {
  id: string;
  isExpanded: boolean;
  isVisible: boolean;
  height?: number;
}

/**
 * Layout configuration
 */
export interface LayoutConfig {
  sidebarWidth: number;
  bottomPanelHeight: number;
  rightPanelWidth: number;
  showSidebar: boolean;
  showBottomPanel: boolean;
  showRightPanel: boolean;
  theme: 'light' | 'dark' | 'auto';
  density: 'compact' | 'comfortable' | 'spacious';
}

/**
 * Navigation state
 */
export interface NavigationState {
  currentRoute: string;
  previousRoute: string | null;
  breadcrumbs: string[];
  canGoBack: boolean;
  canGoForward: boolean;
}

/**
 * Modal state
 */
export interface ModalState {
  id: string;
  isOpen: boolean;
  title: string;
  size: 'small' | 'medium' | 'large' | 'fullscreen';
  closable: boolean;
  data?: any;
}

/**
 * Notification state
 */
export interface NotificationState {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  duration?: number;
  persistent?: boolean;
  actions?: Array<{ label: string; action: () => void }>;
}

/**
 * UIStateViewModel
 * 
 * Manages UI state, layout, navigation, and user interactions.
 * Provides centralized state management for UI components while
 * delegating persistence to UIStore.
 */
export class UIStateViewModel extends BaseViewModel {
  // Domain Store reference
  private uiStore: UIStore;

  // Observable state - made public for MobX observability
  public _activeTab: string = 'status';
  public _tabs: TabConfig[] = [
    { id: 'settings', label: '설정', icon: 'settings' },
    { id: 'status', label: '상태 & 제어', icon: 'status' },
    { id: 'localDB', label: '로컬DB', icon: 'database' },
    { id: 'analysis', label: '분석', icon: 'chart' }
  ];

  public _sections: Map<string, SectionState> = new Map([
    ['configuration', { id: 'configuration', isExpanded: true, isVisible: true }],
    ['progress', { id: 'progress', isExpanded: false, isVisible: true }],
    ['controls', { id: 'controls', isExpanded: true, isVisible: true }],
    ['database-view', { id: 'database-view', isExpanded: true, isVisible: true }],
    ['log-viewer', { id: 'log-viewer', isExpanded: true, isVisible: true }]
  ]);

  public _layout: LayoutConfig = {
    sidebarWidth: 250,
    bottomPanelHeight: 300,
    rightPanelWidth: 350,
    showSidebar: true,
    showBottomPanel: true,
    showRightPanel: false,
    theme: 'auto',
    density: 'comfortable'
  };

  public _navigation: NavigationState = {
    currentRoute: '/',
    previousRoute: null,
    breadcrumbs: [],
    canGoBack: false,
    canGoForward: false
  };

  public _modals: Map<string, ModalState> = new Map();
  public _notifications: Map<string, NotificationState> = new Map();
  public _isLoading: boolean = false;
  public _loadingMessage: string = '';

  constructor(uiStore: UIStore) {
    super();
    this.uiStore = uiStore;

    // Make specific fields and methods observable/computed/action
    makeObservable(this, {
      // Observable state fields (now public)
      _activeTab: observable,
      _tabs: observable,
      _sections: observable,
      _layout: observable,
      _navigation: observable,
      _modals: observable,
      _notifications: observable,
      _isLoading: observable,
      _loadingMessage: observable,
      
      // Computed properties (getters)
      activeTab: computed,
      tabs: computed,
      activeTabConfig: computed,
      availableTabs: computed,
      sections: computed,
      expandedSections: computed,
      visibleSections: computed,
      layout: computed,
      effectiveTheme: computed,
      layoutClasses: computed,
      navigation: computed,
      modals: computed,
      openModals: computed,
      hasOpenModals: computed,
      notifications: computed,
      hasNotifications: computed,
      isLoading: computed,
      loadingMessage: computed,
      
      // Actions (methods that modify state)
      setActiveTab: action,
      addTab: action,
      removeTab: action,
      updateTab: action,
      expandSection: action,
      collapseSection: action,
      toggleSection: action,
      setSectionVisibility: action,
      setSectionHeight: action,
      setSidebarWidth: action,
      setBottomPanelHeight: action,
      setRightPanelWidth: action,
      toggleSidebar: action,
      toggleBottomPanel: action,
      toggleRightPanel: action,
      setTheme: action,
      setDensity: action,
      openModal: action,
      closeModal: action,
      closeAllModals: action,
      removeModal: action,
      addNotification: action,
      removeNotification: action,
      clearAllNotifications: action,
      setLoading: action,
      showLoading: action,
      hideLoading: action
    }, {
      // Options for makeObservable - make all fields deep observables by default
      deep: true
    });
    
    // Load persisted state
    this.loadPersistedState();
  }

  // ================================
  // Computed Properties - Tabs
  // ================================

  get activeTab(): string {
    return this._activeTab;
  }

  get tabs(): TabConfig[] {
    return [...this._tabs];
  }

  get activeTabConfig(): TabConfig | undefined {
    return this._tabs.find(tab => tab.id === this._activeTab);
  }

  get availableTabs(): TabConfig[] {
    return this._tabs.filter(tab => !tab.disabled);
  }

  // ================================
  // Computed Properties - Sections
  // ================================

  get sections(): SectionState[] {
    return Array.from(this._sections.values());
  }

  get expandedSections(): SectionState[] {
    return this.sections.filter(section => section.isExpanded && section.isVisible);
  }

  get visibleSections(): SectionState[] {
    return this.sections.filter(section => section.isVisible);
  }

  // ================================
  // Computed Properties - Layout
  // ================================

  get layout(): LayoutConfig {
    return { ...this._layout };
  }

  get effectiveTheme(): 'light' | 'dark' {
    if (this._layout.theme === 'auto') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return this._layout.theme;
  }

  get layoutClasses(): string[] {
    const classes = [
      `theme-${this.effectiveTheme}`,
      `density-${this._layout.density}`
    ];

    if (this._layout.showSidebar) classes.push('sidebar-visible');
    if (this._layout.showBottomPanel) classes.push('bottom-panel-visible');
    if (this._layout.showRightPanel) classes.push('right-panel-visible');

    return classes;
  }

  // ================================
  // Computed Properties - Navigation
  // ================================

  get navigation(): NavigationState {
    return { ...this._navigation };
  }

  // ================================
  // Computed Properties - Modals & Notifications
  // ================================

  get modals(): ModalState[] {
    return Array.from(this._modals.values());
  }

  get openModals(): ModalState[] {
    return this.modals.filter(modal => modal.isOpen);
  }

  get hasOpenModals(): boolean {
    return this.openModals.length > 0;
  }

  get notifications(): NotificationState[] {
    return Array.from(this._notifications.values()).sort((a, b) => a.id.localeCompare(b.id));
  }

  get hasNotifications(): boolean {
    return this.notifications.length > 0;
  }

  // ================================
  // Computed Properties - Loading
  // ================================

  get isLoading(): boolean {
    return this._isLoading;
  }

  get loadingMessage(): string {
    return this._loadingMessage;
  }

  // ================================
  // Actions - Tab Management
  // ================================

  setActiveTab(tabId: string): void {
    console.log(`[UIStateViewModel] setActiveTab called with: ${tabId}`);
    console.log(`[UIStateViewModel] Current activeTab: ${this._activeTab}`);
    console.log(`[UIStateViewModel] Available tabs:`, this._tabs.map(t => t.id));
    
    const tab = this._tabs.find(t => t.id === tabId);
    if (tab && !tab.disabled) {
      console.log(`[UIStateViewModel] Tab found and enabled, switching from ${this._activeTab} to ${tabId}`);
      this._activeTab = tabId;
      this.persistState();
      console.log(`[UIStateViewModel] Tab switched successfully to: ${this._activeTab}`);
    } else {
      console.warn(`[UIStateViewModel] Tab not found or disabled:`, { tabId, tab, disabled: tab?.disabled });
    }
  }

  addTab(tab: TabConfig): void {
    const existingIndex = this._tabs.findIndex(t => t.id === tab.id);
    if (existingIndex > -1) {
      this._tabs[existingIndex] = tab;
    } else {
      this._tabs.push(tab);
    }
  }

  removeTab(tabId: string): void {
    const index = this._tabs.findIndex(t => t.id === tabId);
    if (index > -1) {
      const tab = this._tabs[index];
      if (tab.closable !== false) {
        this._tabs.splice(index, 1);
        
        // Switch to another tab if the active tab was removed
        if (this._activeTab === tabId && this._tabs.length > 0) {
          this._activeTab = this._tabs[Math.max(0, index - 1)].id;
        }
      }
    }
  }

  updateTab(tabId: string, updates: Partial<TabConfig>): void {
    const index = this._tabs.findIndex(t => t.id === tabId);
    if (index > -1) {
      this._tabs[index] = { ...this._tabs[index], ...updates };
    }
  }

  // ================================
  // Actions - Section Management
  // ================================

  expandSection(sectionId: string): void {
    const section = this._sections.get(sectionId);
    if (section) {
      section.isExpanded = true;
      this.persistState();
    }
  }

  collapseSection(sectionId: string): void {
    const section = this._sections.get(sectionId);
    if (section) {
      section.isExpanded = false;
      this.persistState();
    }
  }

  toggleSection(sectionId: string): void {
    const section = this._sections.get(sectionId);
    if (section) {
      section.isExpanded = !section.isExpanded;
      this.persistState();
    }
  }

  setSectionVisibility(sectionId: string, visible: boolean): void {
    const section = this._sections.get(sectionId);
    if (section) {
      section.isVisible = visible;
      this.persistState();
    }
  }

  setSectionHeight(sectionId: string, height: number): void {
    const section = this._sections.get(sectionId);
    if (section && height > 0) {
      section.height = height;
    }
  }

  // ================================
  // Actions - Layout Management
  // ================================

  setSidebarWidth(width: number): void {
    if (width >= 200 && width <= 500) {
      this._layout.sidebarWidth = width;
      this.persistState();
    }
  }

  setBottomPanelHeight(height: number): void {
    if (height >= 150 && height <= 600) {
      this._layout.bottomPanelHeight = height;
      this.persistState();
    }
  }

  setRightPanelWidth(width: number): void {
    if (width >= 200 && width <= 500) {
      this._layout.rightPanelWidth = width;
      this.persistState();
    }
  }

  toggleSidebar(): void {
    this._layout.showSidebar = !this._layout.showSidebar;
    this.persistState();
  }

  toggleBottomPanel(): void {
    this._layout.showBottomPanel = !this._layout.showBottomPanel;
    this.persistState();
  }

  toggleRightPanel(): void {
    this._layout.showRightPanel = !this._layout.showRightPanel;
    this.persistState();
  }

  setTheme(theme: 'light' | 'dark' | 'auto'): void {
    this._layout.theme = theme;
    this.persistState();
  }

  setDensity(density: 'compact' | 'comfortable' | 'spacious'): void {
    this._layout.density = density;
    this.persistState();
  }

  // ================================
  // Actions - Modal Management
  // ================================

  openModal(modal: Omit<ModalState, 'isOpen'>): void {
    this._modals.set(modal.id, { ...modal, isOpen: true });
  }

  closeModal(modalId: string): void {
    const modal = this._modals.get(modalId);
    if (modal && modal.closable !== false) {
      modal.isOpen = false;
    }
  }

  closeAllModals(): void {
    this._modals.forEach(modal => {
      if (modal.closable !== false) {
        modal.isOpen = false;
      }
    });
  }

  removeModal(modalId: string): void {
    this._modals.delete(modalId);
  }

  // ================================
  // Actions - Notification Management
  // ================================

  addNotification(notification: Omit<NotificationState, 'id'>): string {
    const id = `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newNotification: NotificationState = { ...notification, id };
    
    this._notifications.set(id, newNotification);

    // Auto-remove non-persistent notifications
    if (!notification.persistent) {
      const duration = notification.duration || 5000;
      setTimeout(() => {
        this.removeNotification(id);
      }, duration);
    }

    return id;
  }

  removeNotification(notificationId: string): void {
    this._notifications.delete(notificationId);
  }

  clearAllNotifications(): void {
    this._notifications.clear();
  }

  // ================================
  // Actions - Loading State
  // ================================

  setLoading(loading: boolean, message: string = ''): void {
    this._isLoading = loading;
    this._loadingMessage = message;
  }

  showLoading(message: string = 'Loading...'): void {
    this.setLoading(true, message);
  }

  hideLoading(): void {
    this.setLoading(false, '');
  }

  // ================================
  // Helper Methods
  // ================================

  getSectionState(sectionId: string): SectionState | undefined {
    return this._sections.get(sectionId);
  }

  isSectionExpanded(sectionId: string): boolean {
    const section = this._sections.get(sectionId);
    return section ? section.isExpanded : false;
  }

  isSectionVisible(sectionId: string): boolean {
    const section = this._sections.get(sectionId);
    return section ? section.isVisible : false;
  }

  // ================================
  // Private Methods
  // ================================

  private persistState(): void {
    try {
      const state = {
        activeTab: this._activeTab,
        sections: Array.from(this._sections.entries()),
        layout: this._layout
      };
      
      this.uiStore.setUIState('layout', state);
    } catch (error) {
      console.warn('Failed to persist UI state:', error);
    }
  }

  private loadPersistedState(): void {
    try {
      const state = this.uiStore.getUIState('layout');
      if (state) {
        this._activeTab = state.activeTab || this._activeTab;
        
        if (state.sections) {
          this._sections = new Map(state.sections);
        }
        
        if (state.layout) {
          this._layout = { ...this._layout, ...state.layout };
        }
      }
    } catch (error) {
      console.warn('Failed to load persisted UI state:', error);
    }
  }

  // ================================
  // BaseViewModel Implementation
  // ================================

  async initialize(): Promise<void> {
    await super.initialize();
    
    // Listen for theme changes
    if (this._layout.theme === 'auto') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      mediaQuery.addEventListener('change', () => {
        // Trigger a re-computation of effectiveTheme
        this._layout = { ...this._layout };
      });
    }
  }

  dispose(): void {
    this.persistState();
    this.clearAllNotifications();
    this.closeAllModals();
    super.dispose();
  }
}
