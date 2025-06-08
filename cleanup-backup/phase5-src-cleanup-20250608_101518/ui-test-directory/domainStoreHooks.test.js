import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react-hooks';
import { useDatabaseStore } from '../hooks/useDatabaseStore';
import { useTaskStore } from '../hooks/useTaskStore';
import { useLogStore } from '../hooks/useLogStore';
import { useUIStore } from '../hooks/useUIStore';
import { useCrawlingStore } from '../hooks/useCrawlingStore';

// Mock the RootStore and domain stores for MobX
vi.mock('../stores/RootStore', () => ({
  RootStore: vi.fn().mockImplementation(() => ({
    databaseStore: {
      summary: null,
      products: [],
      loading: false,
      saving: false,
      lastSaveResult: null,
      searchQuery: '',
      currentPage: 1,
      totalPages: 1,
      loadSummary: vi.fn(),
      loadProducts: vi.fn(),
      saveProducts: vi.fn(),
      searchProducts: vi.fn(),
      deleteRecordsByPageRange: vi.fn(),
      clearSaveResult: vi.fn(),
      resetSearch: vi.fn(),
    },
    taskStore: {
      activeTasks: {},
      recentTasks: [],
      taskHistory: [],
      statistics: {
        total: 0,
        pending: 0,
        running: 0,
        success: 0,
        error: 0,
        stopped: 0,
        attempting: 0,
        successRate: 0,
        averageTime: 0
      },
      isProcessingTasks: false,
      lastTaskUpdate: null,
      updateTaskStatus: vi.fn(),
      updateMultipleTaskStatuses: vi.fn(),
      completeTask: vi.fn(),
      errorTask: vi.fn(),
      markAllActiveTasksAsCompleted: vi.fn(),
      getTaskById: vi.fn(),
      getTasksByStatus: vi.fn(),
      getActiveTaskCount: vi.fn(),
      getRecentSuccessRate: vi.fn(),
      clearActiveTasks: vi.fn(),
      clearRecentTasks: vi.fn(),
      clearTaskHistory: vi.fn(),
      clearAllTasks: vi.fn(),
    },
    logStore: {
      logs: [],
      filteredLogs: [],
      filterState: {
        showInfo: true,
        showSuccess: true,
        showWarning: true,
        showError: true,
        searchQuery: '',
        maxEntries: 1000,
        autoScroll: true
      },
      addLog: vi.fn(),
      clearLogs: vi.fn(),
      setSearchQuery: vi.fn(),
      setFilter: vi.fn(),
      setMaxEntries: vi.fn(),
      setAutoScroll: vi.fn(),
    },
    uiStore: {
      searchQuery: '',
      filterBy: 'all',
      viewState: {
        dbSectionExpanded: true,
        productsSectionExpanded: true,
        logsSectionExpanded: true,
        settingsSectionExpanded: true,
        deleteModalVisible: false,
        settingsModalVisible: false,
        exportModalVisible: false,
        isRefreshing: false,
        isExporting: false
      },
      setSearchQuery: vi.fn(),
      showModal: vi.fn(),
      hideModal: vi.fn(),
      toggleSection: vi.fn(),
    },
    crawlingStore: {
      config: {},
      isRunning: false,
      currentUrl: null,
      progress: { current: 0, total: 0 },
      lastResult: null,
      loadConfig: vi.fn(),
      saveConfig: vi.fn(),
      startCrawling: vi.fn(),
      stopCrawling: vi.fn(),
      updateProgress: vi.fn(),
    }
  }))
}));

// Mock individual domain stores directly
vi.mock('../stores/domain/DatabaseStore', () => ({
  databaseStore: {
    summary: { totalProducts: 100 },
    products: [],
    loading: false,
    loadSummary: vi.fn(),
    loadProducts: vi.fn(),
  }
}));

describe('Domain Store Hooks', () => {
  let mockStores;

  beforeEach(() => {
    // Create mock stores object for test compatibility
    mockStores = {
      database: require('../stores/domain/DatabaseStore').databaseStore,
      crawling: require('../stores/domain/CrawlingStore').crawlingStore,
      log: require('../stores/domain/LogStore').logStore,
      ui: require('../stores/domain/UIStore').uiStore,
      task: require('../stores/domain/TaskStore').taskStore,
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('useDatabaseStore', () => {
    it('should return the correct state and actions', () => {
      const { result } = renderHook(() => useDatabaseStore());
      
      expect(result.current).toHaveProperty('products');
      expect(result.current).toHaveProperty('isLoading');
      expect(result.current).toHaveProperty('isSaving');
      expect(result.current).toHaveProperty('saveResult');
      expect(result.current).toHaveProperty('summary');
      expect(result.current).toHaveProperty('saveProducts');
      expect(result.current).toHaveProperty('loadSummary');
      expect(result.current).toHaveProperty('loadProducts');
      expect(result.current).toHaveProperty('clearSaveResult');
    });

    it('should call saveProducts with correct parameters', () => {
      const mockProducts = [{ id: '1', name: 'Test Product' }];
      const { result } = renderHook(() => useDatabaseStore());
      
      act(() => {
        result.current.saveProducts(mockProducts);
      });
      
      expect(mockStores.databaseStore.saveProducts).toHaveBeenCalledWith(mockProducts);
    });
  });

  describe('useTaskStore', () => {
    it('should return the correct state and actions', () => {
      const { result } = renderHook(() => useTaskStore());
      
      expect(result.current).toHaveProperty('activeTasks');
      expect(result.current).toHaveProperty('recentTasks');
      expect(result.current).toHaveProperty('taskHistory');
      expect(result.current).toHaveProperty('statistics');
      expect(result.current).toHaveProperty('completeTask');
      expect(result.current).toHaveProperty('errorTask');
      expect(result.current).toHaveProperty('markAllActiveTasksAsCompleted');
    });

    it('should call completeTask with correct parameters', () => {
      const { result } = renderHook(() => useTaskStore());
      
      act(() => {
        result.current.completeTask('task-1', { message: 'Test completed' });
      });
      
      expect(mockStores.taskStore.completeTask).toHaveBeenCalledWith('task-1', { message: 'Test completed' });
    });
  });

  describe('useLogStore', () => {
    it('should return the correct state and actions', () => {
      const { result } = renderHook(() => useLogStore());
      
      expect(result.current).toHaveProperty('logs');
      expect(result.current).toHaveProperty('filteredLogs');
      expect(result.current).toHaveProperty('filterState');
      expect(result.current).toHaveProperty('addLog');
      expect(result.current).toHaveProperty('clearLogs');
      expect(result.current).toHaveProperty('setSearchQuery');
    });

    it('should call addLog with correct parameters', () => {
      const { result } = renderHook(() => useLogStore());
      
      act(() => {
        result.current.addLog('Test log message', 'info');
      });
      
      expect(mockStores.logStore.addLog).toHaveBeenCalledWith('Test log message', 'info');
    });
  });

  describe('useUIStore', () => {
    it('should return the correct state and actions', () => {
      const { result } = renderHook(() => useUIStore());
      
      expect(result.current).toHaveProperty('searchQuery');
      expect(result.current).toHaveProperty('filterBy');
      expect(result.current).toHaveProperty('viewState');
      expect(result.current).toHaveProperty('setSearchQuery');
      expect(result.current).toHaveProperty('showModal');
      expect(result.current).toHaveProperty('hideModal');
    });

    it('should call setSearchQuery with correct parameters', () => {
      const { result } = renderHook(() => useUIStore());
      
      act(() => {
        result.current.setSearchQuery('test query');
      });
      
      expect(mockStores.uiStore.setSearchQuery).toHaveBeenCalledWith('test query');
    });
  });
});
