/**
 * useTaskStore.ts
 * React hook for accessing the TaskStore domain store
 * 
 * Provides access to task management operations and state with proper React integration
 * Uses consistent patterns with other hooks for better maintainability
 */

import { useStore } from '@nanostores/react';
import { useEffect } from 'react';
import { taskStore } from '../stores/domain/TaskStore';
import type { TaskStatusDetail } from '../stores/domain/TaskStore';

/**
 * Task management hook using Domain Store pattern
 * Provides task state and actions with proper React integration
 */
export function useTaskStore() {
  // Core task data
  const activeTasks = useStore(taskStore.activeTasks);
  const recentTasks = useStore(taskStore.recentTasks);
  const taskHistory = useStore(taskStore.taskHistory);
  const concurrentTasks = useStore(taskStore.concurrentTasks);
  
  // Task statistics and status
  const statistics = useStore(taskStore.statistics);
  const isProcessingTasks = useStore(taskStore.isProcessingTasks);
  const lastTaskUpdate = useStore(taskStore.lastTaskUpdate);
  
  // Event data
  const onTaskStatusChange = useStore(taskStore.onTaskStatusChange);
  const onTaskComplete = useStore(taskStore.onTaskComplete);
  const onTaskError = useStore(taskStore.onTaskError);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Optional cleanup if needed
      // taskStore.cleanup();
    };
  }, []);

  return {
    // State
    activeTasks,
    recentTasks,
    taskHistory,
    concurrentTasks,
    statistics,
    isProcessingTasks,
    lastTaskUpdate,
    onTaskStatusChange,
    onTaskComplete,
    onTaskError,

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
