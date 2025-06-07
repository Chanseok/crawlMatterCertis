import React from 'react';
import { StatusBadge, Button, ProgressIndicator } from '../../common';
import type { CrawlingProgress } from '../../../../../types.d';

interface CrawlingStatusProps {
  status: string;
  progress: CrawlingProgress;
  onToggle: () => void;
  loading?: boolean;
}

export const CrawlingStatus: React.FC<CrawlingStatusProps> = ({
  status,
  progress,
  onToggle,
  loading = false
}) => {
  const getStatusType = (status: string) => {
    switch (status) {
      case 'running': return 'running';
      case 'completed': return 'completed';
      case 'error': return 'error';
      case 'paused': return 'paused';
      case 'stopped': return 'stopped';
      default: return 'idle';
    }
  };

  const getProgressVariant = () => {
    if (progress.percentage >= 100) return 'success';
    if (status === 'error') return 'danger';
    if (status === 'paused') return 'warning';
    return 'default';
  };

  const formatElapsedTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="mb-6">
      <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">Crawling Status</h3>
      <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-md space-y-4">
        {/* Status Header */}
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <StatusBadge status={getStatusType(status)} />
            {progress.currentStep && (
              <span className="text-sm text-gray-600 dark:text-gray-300">
                {progress.currentStep}
              </span>
            )}
          </div>
          <Button
            onClick={onToggle}
            variant={status === 'running' ? 'danger' : 'success'}
            loading={loading}
            size="sm"
          >
            {status === 'running' ? 'Stop' : 'Start'} Crawling
          </Button>
        </div>
        
        {/* Progress Information */}
        {(status === 'running' || status === 'paused' || progress.percentage > 0) && (
          <div className="space-y-3">
            {/* Main Progress Bar */}
            <ProgressIndicator
              value={progress.percentage}
              variant={getProgressVariant()}
              label={`Overall Progress (${progress.currentPage}/${progress.totalPages} pages)`}
            />
            
            {/* Detailed Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div className="text-center">
                <div className="font-medium text-gray-900 dark:text-white">
                  {progress.processedItems || 0}
                </div>
                <div className="text-gray-500 dark:text-gray-400">Processed</div>
              </div>
              <div className="text-center">
                <div className="font-medium text-gray-900 dark:text-white">
                  {progress.newItems || 0}
                </div>
                <div className="text-gray-500 dark:text-gray-400">New Items</div>
              </div>
              <div className="text-center">
                <div className="font-medium text-gray-900 dark:text-white">
                  {progress.updatedItems || 0}
                </div>
                <div className="text-gray-500 dark:text-gray-400">Updated</div>
              </div>
              <div className="text-center">
                <div className="font-medium text-gray-900 dark:text-white">
                  {progress.elapsedTime ? formatElapsedTime(progress.elapsedTime) : '--:--'}
                </div>
                <div className="text-gray-500 dark:text-gray-400">Elapsed</div>
              </div>
            </div>
            
            {/* Current Message */}
            {progress.message && (
              <div className="text-xs text-gray-600 dark:text-gray-300 p-2 bg-gray-100 dark:bg-gray-600 rounded">
                💬 {progress.message}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CrawlingStatus;
