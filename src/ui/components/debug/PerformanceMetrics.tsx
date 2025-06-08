import React, { useState, useEffect } from 'react';
// TimeUtils import available for future use - keeping specialized formatDuration for ms/s format
import type { DevToolsService } from '../../services/development/DevToolsService';

interface PerformanceMetricsProps {
  devToolsService: DevToolsService;
}

/**
 * Performance Metrics Component
 * 
 * Displays performance statistics and metrics collected by DevToolsService.
 * Shows operation timing, service performance, and trending data.
 */
export const PerformanceMetrics: React.FC<PerformanceMetricsProps> = React.memo(({ devToolsService }) => {
  const [performanceStats, setPerformanceStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const loadPerformanceStats = async () => {
    const result = await devToolsService.getPerformanceStats();
    if (result.success && result.data) {
      setPerformanceStats(result.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadPerformanceStats();
    
    if (autoRefresh) {
      const interval = setInterval(loadPerformanceStats, 5000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, devToolsService]);

  // Performance-specific formatting that extends TimeUtils
  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms.toFixed(1)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const getPerformanceColor = (avg: number): string => {
    if (avg < 100) return 'text-green-600';
    if (avg < 500) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-6">
      {/* Header Controls */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-800">Performance Metrics</h3>
        <div className="flex items-center space-x-4">
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-gray-300"
            />
            <span className="text-sm text-gray-600">Auto Refresh (5s)</span>
          </label>
          <button
            onClick={loadPerformanceStats}
            className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Performance Stats Grid */}
      {performanceStats && Object.keys(performanceStats).length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(performanceStats).map(([operation, stats]: [string, any]) => (
            <div key={operation} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
              <h4 className="font-medium text-gray-800 mb-3 truncate" title={operation}>
                {operation}
              </h4>
              
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Count:</span>
                  <span className="text-sm font-medium">{stats.count}</span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Average:</span>
                  <span className={`text-sm font-medium ${getPerformanceColor(stats.average)}`}>
                    {formatDuration(stats.average)}
                  </span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Min:</span>
                  <span className="text-sm font-medium text-green-600">
                    {formatDuration(stats.min)}
                  </span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Max:</span>
                  <span className="text-sm font-medium text-red-600">
                    {formatDuration(stats.max)}
                  </span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Latest:</span>
                  <span className={`text-sm font-medium ${getPerformanceColor(stats.latest)}`}>
                    {formatDuration(stats.latest)}
                  </span>
                </div>
              </div>

              {/* Performance Bar */}
              <div className="mt-3">
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-300 ${
                      stats.average < 100 ? 'bg-green-500' :
                      stats.average < 500 ? 'bg-yellow-500' : 'bg-red-500'
                    }`}
                    style={{
                      width: `${Math.min((stats.average / 1000) * 100, 100)}%`
                    }}
                  ></div>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Performance indicator (0-1s scale)
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <div className="text-gray-400 text-lg mb-2">📊</div>
          <h4 className="text-gray-600 font-medium">No Performance Data</h4>
          <p className="text-gray-500 text-sm mt-1">
            Performance metrics will appear as you use the application
          </p>
        </div>
      )}

      {/* Performance Tips */}
      <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-medium text-blue-800 mb-2">Performance Tips</h4>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• Operations under 100ms are considered fast (green)</li>
          <li>• Operations 100-500ms are moderate (yellow)</li>
          <li>• Operations over 500ms may need optimization (red)</li>
          <li>• Use the export feature to analyze trends over time</li>
        </ul>
      </div>
    </div>
  );
});

PerformanceMetrics.displayName = 'PerformanceMetrics';
