/**
 * TaskStore.ts
 * Domain Store for Task Management
 * 
 * Manages active tasks, recent task history, task status tracking,
 * and task-related operations for concurrent crawling activities.
 */

import { atom, map } from 'nanostores';
import { getPlatformApi } from '../../platform/api';

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
  // Active tasks currently running
  public readonly activeTasks = map<Record<string | number, TaskStatusDetail>>({});
  
  // Recent completed tasks (max 50 entries)
  public readonly recentTasks = atom<TaskStatusDetail[]>([]);
  
  // Task history for current session
  public readonly taskHistory = atom<TaskStatusDetail[]>([]);

  // Task statistics
  public readonly statistics = map<TaskStatistics>({
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

  // Task operation state
  public readonly isProcessingTasks = atom<boolean>(false);
  public readonly lastTaskUpdate = atom<Date | null>(null);

  // Event emitters for coordination
  public readonly onTaskStatusChange = atom<TaskStatusDetail | null>(null);
  public readonly onTaskComplete = atom<TaskStatusDetail | null>(null);
  public readonly onTaskError = atom<TaskStatusDetail | null>(null);

  private platformApi = getPlatformApi();
  private unsubscribeFunctions: (() => void)[] = [];
  private maxRecentTasks: number = 50;
  private maxTaskHistory: number = 1000;

  constructor() {
    this.initializeEventSubscriptions();
    this.setupTaskStatistics();
  }

  /**
   * Initialize platform API event subscriptions for task events
   */
  private initializeEventSubscriptions(): void {
    // Batch task status updates (for concurrent crawling) - this is the main event we get
    const unsubConcurrentTasks = this.platformApi.subscribeToEvent('crawlingTaskStatus', (taskStatus: any) => {
      if (Array.isArray(taskStatus)) {
        this.updateMultipleTaskStatuses(taskStatus);
      } else if (taskStatus && typeof taskStatus === 'object') {
        this.updateTaskStatus(taskStatus.taskId || taskStatus.pageNumber || taskStatus.id, taskStatus);
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
    const updateStatistics = () => {
      const activeTasks = Object.values(this.activeTasks.get());
      const recentTasks = this.recentTasks.get();
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
        stats.successRate = Math.round((stats.success / stats.total) * 100);
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

      this.statistics.set(stats);
    };

    this.activeTasks.listen(updateStatistics);
    this.recentTasks.listen(updateStatistics);
  }

  /**
   * Update status of a single task
   */
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
      const activeTasks = { ...this.activeTasks.get() };
      
      // Preserve original start time if task already exists
      if (activeTasks[taskId]) {
        taskDetail.startTime = activeTasks[taskId].startTime || taskDetail.startTime;
      }
      
      activeTasks[taskId] = taskDetail;
      this.activeTasks.set(activeTasks);
    } else {
      // Task is complete, move to recent tasks
      this.completeTask(taskId, taskDetail);
    }

    this.lastTaskUpdate.set(new Date());
    this.onTaskStatusChange.set(taskDetail);

    // Add to task history
    this.addToTaskHistory(taskDetail);
  }

  /**
   * Update multiple task statuses (for batch updates)
   */
  updateMultipleTaskStatuses(taskStatuses: any[]): void {
    const activeTasks = { ...this.activeTasks.get() };
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
        if (activeTasks[taskId]) {
          taskDetail.startTime = activeTasks[taskId].startTime || taskDetail.startTime;
        }
        
        activeTasks[taskId] = taskDetail;
        hasChanges = true;
      } else {
        // Remove from active and add to recent
        if (activeTasks[taskId]) {
          delete activeTasks[taskId];
          hasChanges = true;
          this.addToRecentTasks(taskDetail);
        }
      }

      this.addToTaskHistory(taskDetail);
    });

    if (hasChanges) {
      this.activeTasks.set(activeTasks);
      this.lastTaskUpdate.set(new Date());
    }
  }

  /**
   * Mark task as completed
   */
  completeTask(taskId: string | number, taskData?: any): void {
    const activeTasks = { ...this.activeTasks.get() };
    const existingTask = activeTasks[taskId];

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
    delete activeTasks[taskId];
    this.activeTasks.set(activeTasks);

    // Add to recent tasks
    this.addToRecentTasks(completedTask);
    this.addToTaskHistory(completedTask);

    this.lastTaskUpdate.set(new Date());
    this.onTaskComplete.set(completedTask);
  }

  /**
   * Mark task as errored
   */
  errorTask(taskId: string | number, errorData?: any): void {
    const activeTasks = { ...this.activeTasks.get() };
    const existingTask = activeTasks[taskId];

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
    delete activeTasks[taskId];
    this.activeTasks.set(activeTasks);

    // Add to recent tasks
    this.addToRecentTasks(erroredTask);
    this.addToTaskHistory(erroredTask);

    this.lastTaskUpdate.set(new Date());
    this.onTaskError.set(erroredTask);
  }

  /**
   * Add task to recent tasks list
   */
  private addToRecentTasks(task: TaskStatusDetail): void {
    const recentTasks = [...this.recentTasks.get()];
    recentTasks.unshift(task);

    // Maintain maximum recent tasks
    if (recentTasks.length > this.maxRecentTasks) {
      recentTasks.splice(this.maxRecentTasks);
    }

    this.recentTasks.set(recentTasks);
  }

  /**
   * Add task to task history
   */
  private addToTaskHistory(task: TaskStatusDetail): void {
    const history = [...this.taskHistory.get()];
    
    // Check if task already exists in history (update instead of duplicate)
    const existingIndex = history.findIndex(t => t.id === task.id);
    if (existingIndex >= 0) {
      history[existingIndex] = task;
    } else {
      history.push(task);
    }

    // Maintain maximum history size
    if (history.length > this.maxTaskHistory) {
      history.splice(0, history.length - this.maxTaskHistory);
    }

    this.taskHistory.set(history);
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
  markAllActiveTasksAsCompleted(data?: any): void {
    const activeTasks = { ...this.activeTasks.get() };
    const timestamp = Date.now();

    Object.keys(activeTasks).forEach(taskId => {
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
  clearActiveTasks(): void {
    this.activeTasks.set({});
    this.lastTaskUpdate.set(new Date());
  }

  /**
   * Clear recent tasks
   */
  clearRecentTasks(): void {
    this.recentTasks.set([]);
  }

  /**
   * Clear task history
   */
  clearTaskHistory(): void {
    this.taskHistory.set([]);
  }

  /**
   * Clear all tasks
   */
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
    const activeTasks = this.activeTasks.get();
    if (activeTasks[taskId]) {
      return activeTasks[taskId];
    }

    // Check recent tasks
    const recentTasks = this.recentTasks.get();
    const recentTask = recentTasks.find(task => task.id === taskId);
    if (recentTask) {
      return recentTask;
    }

    // Check task history
    const history = this.taskHistory.get();
    const historyTask = history.find(task => task.id === taskId);
    return historyTask || null;
  }

  /**
   * Get tasks by status
   */
  getTasksByStatus(status: TaskStatusDetail['status']): TaskStatusDetail[] {
    const activeTasks = Object.values(this.activeTasks.get());
    const recentTasks = this.recentTasks.get();
    
    return [...activeTasks, ...recentTasks].filter(task => task.status === status);
  }

  /**
   * Get active task count
   */
  getActiveTaskCount(): number {
    return Object.keys(this.activeTasks.get()).length;
  }

  /**
   * Get success rate for recent tasks
   */
  getRecentSuccessRate(): number {
    const recentTasks = this.recentTasks.get();
    if (recentTasks.length === 0) return 0;

    const successCount = recentTasks.filter(task => task.status === 'success').length;
    return Math.round((successCount / recentTasks.length) * 100);
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
      activeTasksCount: Object.keys(this.activeTasks.get()).length,
      recentTasksCount: this.recentTasks.get().length,
      taskHistoryCount: this.taskHistory.get().length,
      statistics: this.statistics.get(),
      isProcessingTasks: this.isProcessingTasks.get(),
      lastTaskUpdate: this.lastTaskUpdate.get(),
      subscriptionsCount: this.unsubscribeFunctions.length
    };
  }
}

// Singleton instance
export const taskStore = new TaskStore();
