/**
 * TaskStore.ts
 * Domain Store for Task Management
 * 
 * Manages active tasks, recent task history, task status tracking,
 * and task-related operations for concurrent crawling activities.
 */

import { makeObservable, observable, action, reaction } from 'mobx';
import { getPlatformApi } from '../../platform/api';
import { storeEventBus, STORE_EVENTS } from '../../services/EventBus';
import { CrawlingUtils } from '../../../shared/utils/CrawlingUtils';
import type { ConcurrentCrawlingTask } from '../../types';

/**
 * Task status detail information
 */
export interface TaskStatusDetail {
  id: string | number;
  status: 'pending' | 'running' | 'success' | 'error' | 'stopped' | 'attempting';
  details?: any;
  startTime?: number;
  endTime?: number;
  message?: string;
  progress?: number;
  errorDetails?: string;
}

/**
 * Task summary statistics
 */
export interface TaskStatistics {
  total: number;
  pending: number;
  running: number;
  success: number;
  error: number;
  stopped: number;
  attempting: number;
  successRate: number;
  averageTime: number;
}

/**
 * Task Domain Store
 * Manages all task-related state and operations
 */
export class TaskStore {
  // Concurrent crawling tasks (for page-by-page progress tracking)
  public concurrentTasks: ConcurrentCrawlingTask[] = [];
  
  // Active tasks currently running
  public activeTasks: Record<string | number, TaskStatusDetail> = {};
  
  // Recent completed tasks (max 50 entries)
  public recentTasks: TaskStatusDetail[] = [];
  
  // Task history for current session
  public taskHistory: TaskStatusDetail[] = [];

  // Task statistics
  public statistics: TaskStatistics = {
    total: 0,
    pending: 0,
    running: 0,
    success: 0,
    error: 0,
    stopped: 0,
    attempting: 0,
    successRate: 0,
    averageTime: 0
  };

  // Task operation state
  public isProcessingTasks: boolean = false;
  public lastTaskUpdate: Date | null = null;

  // Event emitters for coordination
  public onTaskStatusChange: TaskStatusDetail | null = null;
  public onTaskComplete: TaskStatusDetail | null = null;
  public onTaskError: TaskStatusDetail | null = null;

  private platformApi: any = null;
  private unsubscribeFunctions: (() => void)[] = [];
  private maxRecentTasks: number = 50;
  private maxTaskHistory: number = 1000;

  constructor() {
    makeObservable(this, {
      // Observable state
      concurrentTasks: observable,
      activeTasks: observable,
      recentTasks: observable,
      taskHistory: observable,
      statistics: observable,
      isProcessingTasks: observable,
      lastTaskUpdate: observable,
      onTaskStatusChange: observable,
      onTaskComplete: observable,
      onTaskError: observable,

      // Actions
      updateTaskStatus: action,
      updateMultipleTaskStatuses: action,
      completeTask: action,
      errorTask: action,
      markAllActiveTasksAsCompleted: action,
      clearActiveTasks: action,
      clearRecentTasks: action,
      clearTaskHistory: action,
      clearAllTasks: action,
      updateConcurrentTasks: action,
      updateConcurrentTasksFromTaskStatus: action,
      updateStatistics: action
    });

    this.setupTaskStatistics();
    this.initializeApiSafely();
  }

  /**
   * Safely initialize platform API with retry logic
   */
  private initializeApiSafely(): void {
    const tryInitialize = () => {
      try {
        this.platformApi = getPlatformApi();
        if (this.platformApi) {
          // API 타입 체크 및 경고
          const apiType = this.platformApi.constructor.name;
          console.log(`[TaskStore] Initialized with API: ${apiType}`);
          
          if (apiType === 'MockApiAdapter') {
            console.warn('⚠️ [TaskStore] MockApiAdapter detected - Settings will NOT persist!');
            console.warn('⚠️ [TaskStore] Check if window.electron is properly initialized');
          } else {
            console.log('✅ [TaskStore] Using real Electron API - settings will persist.');
          }
          
          this.initializeEventSubscriptions();
          return;
        }
      } catch (error) {
        console.log('[TaskStore] API not ready yet, retrying in 200ms...');
      }
      
      setTimeout(tryInitialize, 200);
    };

    tryInitialize();
  }

  /**
   * Initialize platform API event subscriptions for task events
   */
  private initializeEventSubscriptions(): void {
    // Batch task status updates (for concurrent crawling) - this is the main event we get
    const unsubConcurrentTasks = this.platformApi.subscribeToEvent('crawlingTaskStatus', (taskStatus: any) => {
      console.log('[TaskStore] Received crawlingTaskStatus event:', taskStatus);
      
      // Forward the event to CrawlingStore via EventBus
      try {
        console.log('[TaskStore] Forwarding crawlingTaskStatus to CrawlingStore via EventBus...');
        storeEventBus.emit(STORE_EVENTS.CRAWLING_TASK_STATUS, taskStatus);
        console.log('[TaskStore] Successfully forwarded crawlingTaskStatus via EventBus');
      } catch (error) {
        console.error('[TaskStore] Error forwarding crawlingTaskStatus via EventBus:', error);
      }
      
      if (Array.isArray(taskStatus)) {
        console.log(`[TaskStore] Processing array of ${taskStatus.length} task statuses`);
        this.updateMultipleTaskStatuses(taskStatus);
        // Also update concurrentTasks array for ConcurrentTasksVisualizer
        this.updateConcurrentTasksFromTaskStatus(taskStatus);
      } else if (taskStatus && typeof taskStatus === 'object') {
        console.log('[TaskStore] Processing single task status:', taskStatus);
        this.updateTaskStatus(taskStatus.taskId || taskStatus.pageNumber || taskStatus.id, taskStatus);
        // Also update concurrentTasks array for single task update
        this.updateConcurrentTasksFromTaskStatus([taskStatus]);
      }
    });
    this.unsubscribeFunctions.push(unsubConcurrentTasks);

    // Crawling completion events
    const unsubCrawlingComplete = this.platformApi.subscribeToEvent('crawlingComplete', (data: any) => {
      if (data) {
        // Mark all active tasks as completed
        this.markAllActiveTasksAsCompleted(data);
      }
    });
    this.unsubscribeFunctions.push(unsubCrawlingComplete);

    // Crawling stopped events 
    const unsubCrawlingStopped = this.platformApi.subscribeToEvent('crawlingStopped', (taskStatus: any) => {
      if (Array.isArray(taskStatus)) {
        this.updateMultipleTaskStatuses(taskStatus);
      } else if (taskStatus && typeof taskStatus === 'object') {
        this.updateTaskStatus(taskStatus.taskId || taskStatus.pageNumber || taskStatus.id, taskStatus);
      }
    });
    this.unsubscribeFunctions.push(unsubCrawlingStopped);

    // Crawling error events
    const unsubCrawlingError = this.platformApi.subscribeToEvent('crawlingError', (data: any) => {
      if (data?.message) {
        // Create an error task entry
        this.errorTask('crawling-error', data);
      }
    });
    this.unsubscribeFunctions.push(unsubCrawlingError);
  }

  /**
   * Setup reactive task statistics calculation
   */
  private setupTaskStatistics(): void {
    reaction(
      () => ({ activeTasks: this.activeTasks, recentTasks: this.recentTasks }),
      () => this.updateStatistics()
    );
  }

  /**
   * Update task statistics
   */
  @action
  updateStatistics(): void {
    const activeTasks = Object.values(this.activeTasks);
    const recentTasks = this.recentTasks;
    const allTasks = [...activeTasks, ...recentTasks];

    const stats = allTasks.reduce(
      (acc, task) => {
        acc.total++;
        acc[task.status]++;
        return acc;
      },
      { 
        total: 0, 
        pending: 0, 
        running: 0, 
        success: 0, 
        error: 0, 
        stopped: 0, 
        attempting: 0,
        successRate: 0,
        averageTime: 0
      }
    );

    // Calculate success rate
    if (stats.total > 0) {
      stats.successRate = CrawlingUtils.safePercentage(stats.success, stats.total);
    }

    // Calculate average completion time
    const completedTasks = allTasks.filter(task => 
      task.status === 'success' && task.startTime && task.endTime
    );
    
    if (completedTasks.length > 0) {
      const totalTime = completedTasks.reduce((sum, task) => 
        sum + (task.endTime! - task.startTime!), 0
      );
      stats.averageTime = Math.round(totalTime / completedTasks.length);
    }

    this.statistics = stats;
  }

  /**
   * Update status of a single task
   */
  @action
  updateTaskStatus(taskId: string | number, statusData: any): void {
    const validStatus = this.validateTaskStatus(statusData.status);
    const timestamp = Date.now();

    const taskDetail: TaskStatusDetail = {
      id: taskId,
      status: validStatus,
      details: statusData.details || statusData,
      startTime: statusData.startTime || timestamp,
      endTime: statusData.endTime,
      message: statusData.message || '',
      progress: statusData.progress,
      errorDetails: statusData.error || statusData.errorDetails
    };

    // Update active tasks
    if (this.isTaskActive(validStatus)) {
      // Preserve original start time if task already exists
      if (this.activeTasks[taskId]) {
        taskDetail.startTime = this.activeTasks[taskId].startTime || taskDetail.startTime;
      }
      
      this.activeTasks[taskId] = taskDetail;
    } else {
      // Task is complete, move to recent tasks
      this.completeTask(taskId, taskDetail);
    }

    this.lastTaskUpdate = new Date();
    this.onTaskStatusChange = taskDetail;

    // Add to task history
    this.addToTaskHistory(taskDetail);
  }

  /**
   * Update multiple task statuses (for batch updates)
   */
  @action
  updateMultipleTaskStatuses(taskStatuses: any[]): void {
    let hasChanges = false;

    taskStatuses.forEach(taskData => {
      const taskId = taskData.id || taskData.pageNumber || taskData.taskId;
      if (!taskId) return;

      const validStatus = this.validateTaskStatus(taskData.status);
      const timestamp = Date.now();

      const taskDetail: TaskStatusDetail = {
        id: taskId,
        status: validStatus,
        details: taskData,
        startTime: taskData.startTime || timestamp,
        endTime: taskData.endTime,
        message: taskData.message || '',
        progress: taskData.progress,
        errorDetails: taskData.error
      };

      if (this.isTaskActive(validStatus)) {
        // Preserve original start time
        if (this.activeTasks[taskId]) {
          taskDetail.startTime = this.activeTasks[taskId].startTime || taskDetail.startTime;
        }
        
        this.activeTasks[taskId] = taskDetail;
        hasChanges = true;
      } else {
        // Remove from active and add to recent
        if (this.activeTasks[taskId]) {
          delete this.activeTasks[taskId];
          hasChanges = true;
          this.addToRecentTasks(taskDetail);
        }
      }

      this.addToTaskHistory(taskDetail);
    });

    if (hasChanges) {
      this.lastTaskUpdate = new Date();
    }
  }

  /**
   * Mark task as completed
   */
  @action
  completeTask(taskId: string | number, taskData?: any): void {
    const existingTask = this.activeTasks[taskId];

    const completedTask: TaskStatusDetail = {
      id: taskId,
      status: taskData?.status || 'success',
      details: taskData?.details || taskData,
      startTime: existingTask?.startTime || taskData?.startTime || Date.now() - 1000,
      endTime: taskData?.endTime || Date.now(),
      message: taskData?.message || 'Task completed',
      progress: 100,
      errorDetails: taskData?.error
    };

    // Remove from active tasks
    delete this.activeTasks[taskId];

    // Add to recent tasks
    this.addToRecentTasks(completedTask);
    this.addToTaskHistory(completedTask);

    this.lastTaskUpdate = new Date();
    this.onTaskComplete = completedTask;
  }

  /**
   * Mark task as errored
   */
  @action
  errorTask(taskId: string | number, errorData?: any): void {
    const existingTask = this.activeTasks[taskId];

    const erroredTask: TaskStatusDetail = {
      id: taskId,
      status: 'error',
      details: errorData?.details || errorData,
      startTime: existingTask?.startTime || errorData?.startTime || Date.now() - 1000,
      endTime: errorData?.endTime || Date.now(),
      message: errorData?.message || 'Task failed',
      progress: errorData?.progress || 0,
      errorDetails: errorData?.error || errorData?.message || 'Unknown error'
    };

    // Remove from active tasks
    delete this.activeTasks[taskId];

    // Add to recent tasks
    this.addToRecentTasks(erroredTask);
    this.addToTaskHistory(erroredTask);

    this.lastTaskUpdate = new Date();
    this.onTaskError = erroredTask;
  }

  /**
   * Add task to recent tasks list
   */
  private addToRecentTasks(task: TaskStatusDetail): void {
    this.recentTasks.unshift(task);

    // Maintain maximum recent tasks
    if (this.recentTasks.length > this.maxRecentTasks) {
      this.recentTasks.splice(this.maxRecentTasks);
    }
  }

  /**
   * Add task to task history
   */
  private addToTaskHistory(task: TaskStatusDetail): void {
    // Check if task already exists in history (update instead of duplicate)
    const existingIndex = this.taskHistory.findIndex(t => t.id === task.id);
    if (existingIndex >= 0) {
      this.taskHistory[existingIndex] = task;
    } else {
      this.taskHistory.push(task);
    }

    // Maintain maximum history size
    if (this.taskHistory.length > this.maxTaskHistory) {
      this.taskHistory.splice(0, this.taskHistory.length - this.maxTaskHistory);
    }
  }

  /**
   * Check if task status represents an active task
   */
  private isTaskActive(status: TaskStatusDetail['status']): boolean {
    return ['pending', 'running', 'attempting'].includes(status);
  }

  /**
   * Validate and normalize task status
   */
  private validateTaskStatus(status: string): TaskStatusDetail['status'] {
    const validStatuses: TaskStatusDetail['status'][] = [
      'pending', 'running', 'success', 'error', 'stopped', 'attempting'
    ];
    
    return validStatuses.includes(status as any) 
      ? (status as TaskStatusDetail['status']) 
      : 'error';
  }

  /**
   * Mark all active tasks as completed
   */
  @action
  markAllActiveTasksAsCompleted(data?: any): void {
    const timestamp = Date.now();

    Object.keys(this.activeTasks).forEach(taskId => {
      this.completeTask(taskId, {
        ...data,
        status: 'success',
        endTime: timestamp,
        message: 'Completed with crawling session'
      });
    });
  }

  /**
   * Clear all active tasks
   */
  @action
  clearActiveTasks(): void {
    this.activeTasks = {};
    this.lastTaskUpdate = new Date();
  }

  /**
   * Clear recent tasks
   */
  @action
  clearRecentTasks(): void {
    this.recentTasks = [];
  }

  /**
   * Clear task history
   */
  @action
  clearTaskHistory(): void {
    this.taskHistory = [];
  }

  /**
   * Clear all tasks
   */
  @action
  clearAllTasks(): void {
    this.clearActiveTasks();
    this.clearRecentTasks();
    this.clearTaskHistory();
  }

  /**
   * Get task by ID
   */
  getTaskById(taskId: string | number): TaskStatusDetail | null {
    // Check active tasks first
    if (this.activeTasks[taskId]) {
      return this.activeTasks[taskId];
    }

    // Check recent tasks
    const recentTask = this.recentTasks.find((task: TaskStatusDetail) => task.id === taskId);
    if (recentTask) {
      return recentTask;
    }

    // Check task history
    const historyTask = this.taskHistory.find((task: TaskStatusDetail) => task.id === taskId);
    return historyTask || null;
  }

  /**
   * Get tasks by status
   */
  getTasksByStatus(status: TaskStatusDetail['status']): TaskStatusDetail[] {
    const activeTasks = Object.values(this.activeTasks);
    
    return [...activeTasks, ...this.recentTasks].filter((task: TaskStatusDetail) => task.status === status);
  }

  /**
   * Get active task count
   */
  getActiveTaskCount(): number {
    return Object.keys(this.activeTasks).length;
  }

  /**
   * Update concurrent crawling tasks
   */
  @action
  updateConcurrentTasks(tasks: ConcurrentCrawlingTask[]): void {
    this.concurrentTasks = tasks;
    this.lastTaskUpdate = new Date();
  }

  /**
   * Update concurrent tasks array from task status events
   * This bridges the gap between activeTasks and concurrentTasks for visualization
   */
  @action
  updateConcurrentTasksFromTaskStatus(taskStatusArray: any[]): void {
    const concurrentTasks: ConcurrentCrawlingTask[] = taskStatusArray
      .filter(taskData => taskData && (taskData.pageNumber || taskData.id || taskData.taskId))
      .map(taskData => ({
        pageNumber: taskData.pageNumber || taskData.id || taskData.taskId,
        status: this.validateTaskStatus(taskData.status) as any,
        error: taskData.error || taskData.errorDetails
      }));

    if (concurrentTasks.length > 0) {
      this.concurrentTasks = concurrentTasks;
      this.lastTaskUpdate = new Date();
      console.log(`[TaskStore] Updated concurrentTasks with ${concurrentTasks.length} tasks from crawlingTaskStatus event`);
    }
  }

  /**
   * Get success rate for recent tasks
   */
  getRecentSuccessRate(): number {
    if (this.recentTasks.length === 0) return 0;

    const successCount = this.recentTasks.filter((task: TaskStatusDetail) => task.status === 'success').length;
    return CrawlingUtils.safePercentage(successCount, this.recentTasks.length);
  }

  /**
   * Cleanup subscriptions
   */
  async cleanup(): Promise<void> {
    this.unsubscribeFunctions.forEach(unsubscribe => unsubscribe());
    this.unsubscribeFunctions = [];
  }

  /**
   * Debug information
   */
  getDebugInfo(): object {
    return {
      activeTasksCount: Object.keys(this.activeTasks).length,
      recentTasksCount: this.recentTasks.length,
      taskHistoryCount: this.taskHistory.length,
      statistics: this.statistics,
      isProcessingTasks: this.isProcessingTasks,
      lastTaskUpdate: this.lastTaskUpdate,
      subscriptionsCount: this.unsubscribeFunctions.length
    };
  }
}

// Singleton instance
export const taskStore = new TaskStore();
