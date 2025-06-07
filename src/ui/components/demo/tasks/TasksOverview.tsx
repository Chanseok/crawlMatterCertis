import React from 'react';
import { Badge, CircularProgress } from '../../common';
import type { TaskStatistics } from '../../../../shared/types';

interface TasksOverviewProps {
  activeTasks: Record<string, any>;
  statistics: TaskStatistics;
  showDetails?: boolean;
}

export const TasksOverview: React.FC<TasksOverviewProps> = ({
  activeTasks,
  statistics,
  showDetails = false
}) => {
  const activeTasksCount = Object.keys(activeTasks).length;
  const totalTasks = statistics.total || 0;
  
  return (
    <div className="mb-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300">Tasks Overview</h3>
        {activeTasksCount > 0 && (
          <Badge variant="primary" pulse>
            {activeTasksCount} active
          </Badge>
        )}
      </div>

      {/* Main Statistics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                Active
              </div>
              <div className="text-2xl font-bold text-blue-700 dark:text-blue-300 mt-1">
                {activeTasksCount}
              </div>
            </div>
            <div className="text-blue-500 text-2xl">🔄</div>
          </div>
        </div>

        <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg border border-green-200 dark:border-green-800">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-medium text-green-600 dark:text-green-400 uppercase tracking-wider">
                Success
              </div>
              <div className="text-2xl font-bold text-green-700 dark:text-green-300 mt-1">
                {statistics.success || 0}
              </div>
            </div>
            <div className="text-green-500 text-2xl">✅</div>
          </div>
        </div>

        <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg border border-red-200 dark:border-red-800">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-medium text-red-600 dark:text-red-400 uppercase tracking-wider">
                Failed
              </div>
              <div className="text-2xl font-bold text-red-700 dark:text-red-300 mt-1">
                {statistics.error || 0}
              </div>
            </div>
            <div className="text-red-500 text-2xl">❌</div>
          </div>
        </div>

        <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg border border-purple-200 dark:border-purple-800">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-medium text-purple-600 dark:text-purple-400 uppercase tracking-wider">
                Success Rate
              </div>
              <div className="text-2xl font-bold text-purple-700 dark:text-purple-300 mt-1">
                {Math.round(statistics.successRate || 0)}%
              </div>
            </div>
            <div className="text-purple-500 text-2xl">📊</div>
          </div>
        </div>
      </div>

      {/* Detailed View */}
      {showDetails && (
        <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-md font-medium text-gray-700 dark:text-gray-300">
              Task Performance
            </h4>
            <div className="flex space-x-2">
              <Badge variant="secondary" size="sm">
                Total: {totalTasks}
              </Badge>
              <Badge variant="info" size="sm">
                Avg: {Math.round(statistics.averageTime || 0)}s
              </Badge>
            </div>
          </div>

          <div className="flex items-center justify-center">
            <CircularProgress
              value={statistics.successRate || 0}
              size={100}
              variant={statistics.successRate > 80 ? 'success' : statistics.successRate > 60 ? 'warning' : 'danger'}
              showLabel
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default TasksOverview;
