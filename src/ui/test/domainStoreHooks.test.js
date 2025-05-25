import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react-hooks';
import { useDatabaseStore } from '../hooks/useDatabaseStore';
import { useTaskStore } from '../hooks/useTaskStore';
import { useLogStore } from '../hooks/useLogStore';
import { useUIStore } from '../hooks/useUIStore';
import { useCrawlingStore } from '../hooks/useCrawlingStore';
import { databaseStore } from '../stores/domain/DatabaseStore';
import { taskStore } from '../stores/domain/TaskStore';
import { logStore } from '../stores/domain/LogStore';
import { uiStore } from '../stores/domain/UIStore';
import { crawlingStore } from '../stores/domain/CrawlingStore';

// Mock the domain stores
vi.mock('../stores/domain/DatabaseStore', () => ({
  databaseStore: {
    summary: { get: vi.fn(), subscribe: vi.fn() },
    products: { get: vi.fn(), subscribe: vi.fn() },
    loading: { get: vi.fn(), subscribe: vi.fn() },
    saving: { get: vi.fn(), subscribe: vi.fn() },
    lastSaveResult: { get: vi.fn(), subscribe: vi.fn() },
    searchQuery: { get: vi.fn(), subscribe: vi.fn() },
    currentPage: { get: vi.fn(), subscribe: vi.fn() },
    totalPages: { get: vi.fn(), subscribe: vi.fn() },
    loadSummary: vi.fn(),
    loadProducts: vi.fn(),
    saveProducts: vi.fn(),
    searchProducts: vi.fn(),
    deleteRecordsByPageRange: vi.fn(),
    clearSaveResult: vi.fn(),
    resetSearch: vi.fn(),
  }
}));

vi.mock('../stores/domain/TaskStore', () => ({
  taskStore: {
    activeTasks: { get: vi.fn(), subscribe: vi.fn() },
    recentTasks: { get: vi.fn(), subscribe: vi.fn() },
    taskHistory: { get: vi.fn(), subscribe: vi.fn() },
    statistics: { get: vi.fn(), subscribe: vi.fn() },
    isProcessingTasks: { get: vi.fn(), subscribe: vi.fn() },
    lastTaskUpdate: { get: vi.fn(), subscribe: vi.fn() },
    onTaskStatusChange: { get: vi.fn(), subscribe: vi.fn() },
    onTaskComplete: { get: vi.fn(), subscribe: vi.fn() },
    onTaskError: { get: vi.fn(), subscribe: vi.fn() },
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
  }
}));

vi.mock('@nanostores/react', () => ({
  useStore: vi.fn().mockImplementation((store) => store.get ? store.get() : store)
}));

describe('Domain Store Hooks', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('useDatabaseStore', () => {
    beforeEach(() => {
      databaseStore.loading.get.mockReturnValue(false);
      databaseStore.saving.get.mockReturnValue(false);
      databaseStore.products.get.mockReturnValue([]);
      databaseStore.summary.get.mockReturnValue(null);
      databaseStore.lastSaveResult.get.mockReturnValue(null);
    });

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
      
      expect(databaseStore.saveProducts).toHaveBeenCalledWith(mockProducts);
    });
  });

  describe('useTaskStore', () => {
    beforeEach(() => {
      taskStore.activeTasks.get.mockReturnValue({});
      taskStore.recentTasks.get.mockReturnValue([]);
      taskStore.statistics.get.mockReturnValue({
        total: 0,
        pending: 0,
        running: 0,
        success: 0,
        error: 0,
        stopped: 0,
        attempting: 0,
        successRate: 0,
        averageTime: 0
      });
    });

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
      
      expect(taskStore.completeTask).toHaveBeenCalledWith('task-1', { message: 'Test completed' });
    });
  });

  describe('useLogStore', () => {
    beforeEach(() => {
      logStore.logs.get.mockReturnValue([]);
      logStore.filteredLogs.get.mockReturnValue([]);
      logStore.filterState.get.mockReturnValue({
        showInfo: true,
        showSuccess: true,
        showWarning: true,
        showError: true,
        searchQuery: '',
        maxEntries: 1000,
        autoScroll: true
      });
    });

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
      
      expect(logStore.addLog).toHaveBeenCalledWith('Test log message', 'info');
    });
  });

  describe('useUIStore', () => {
    beforeEach(() => {
      uiStore.searchQuery.get.mockReturnValue('');
      uiStore.filterBy.get.mockReturnValue('all');
      uiStore.viewState.get.mockReturnValue({
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
    });

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
      
      expect(uiStore.setSearchQuery).toHaveBeenCalledWith('test query');
    });
  });
});
