/**
 * useTaskStore.ts
 * React hook for accessing the TaskStore domain store
 * 
 * Provides access to task management operations and state with proper React integration
 * Uses consistent patterns with other hooks for better maintainability
 */

import { useEffect } from 'react';
import { taskStore } from '../stores/domain/TaskStore';
import type { TaskStatusDetail } from '../stores/domain/TaskStore';

/**
 * Task management hook using Domain Store pattern
 * Provides task state and actions with proper React integration
 */
export function useTaskStore() {
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Optional cleanup if needed
      // taskStore.cleanup();
    };
  }, []);

  return {
    // State
    activeTasks: taskStore.activeTasks,
    recentTasks: taskStore.recentTasks,
    taskHistory: taskStore.taskHistory,
    concurrentTasks: taskStore.concurrentTasks,
    statistics: taskStore.statistics,
    isProcessingTasks: taskStore.isProcessingTasks,
    lastTaskUpdate: taskStore.lastTaskUpdate,
    onTaskStatusChange: taskStore.onTaskStatusChange,
    onTaskComplete: taskStore.onTaskComplete,
    onTaskError: taskStore.onTaskError,

    // Task management actions
    updateTaskStatus: (taskId: string | number, statusData: any) => 
      taskStore.updateTaskStatus(taskId, statusData),
    updateMultipleTaskStatuses: (taskStatuses: any[]) => 
      taskStore.updateMultipleTaskStatuses(taskStatuses),
    updateConcurrentTasks: (tasks: any[]) => 
      taskStore.updateConcurrentTasks(tasks),
    completeTask: (taskId: string | number, data?: any) => 
      taskStore.completeTask(taskId, data),
    errorTask: (taskId: string | number, errorData?: any) => 
      taskStore.errorTask(taskId, errorData),
    markAllActiveTasksAsCompleted: (data?: any) => 
      taskStore.markAllActiveTasksAsCompleted(data),
    
    // Task retrieval and management
    getTaskById: (taskId: string | number) => 
      taskStore.getTaskById(taskId),
    getTasksByStatus: (status: TaskStatusDetail['status']) => 
      taskStore.getTasksByStatus(status),
    getActiveTaskCount: () => 
      taskStore.getActiveTaskCount(),
    getRecentSuccessRate: () => 
      taskStore.getRecentSuccessRate(),
    
    // Task clearing actions
    clearActiveTasks: () => taskStore.clearActiveTasks(),
    clearRecentTasks: () => taskStore.clearRecentTasks(),
    clearTaskHistory: () => taskStore.clearTaskHistory(),
    clearAllTasks: () => taskStore.clearAllTasks(),
  };
}
