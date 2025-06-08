import React, { useState, useEffect } from 'react';
import { TimeUtils } from '../../../shared/utils';
import type { DevToolsService } from '../../services/development/DevToolsService';

interface DebugLogsProps {
  devToolsService: DevToolsService;
}

/**
 * Debug Logs Component
 * 
 * Displays debug logs with filtering, search, and real-time updates.
 * Provides detailed debugging information for development and troubleshooting.
 */
export const DebugLogs: React.FC<DebugLogsProps> = ({ devToolsService }) => {
  const [logs, setLogs] = useState<any[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [filters, setFilters] = useState({
    service: '',
    operation: '',
    search: '',
    level: 'all'
  });

  const loadLogs = async () => {
    const result = await devToolsService.getDebugLogs();
    if (result.success && result.data) {
      setLogs(result.data);
    }
    setLoading(false);
  };

  // Apply filters to logs
  useEffect(() => {
    let filtered = [...logs];

    if (filters.service) {
      filtered = filtered.filter(log => log.service === filters.service);
    }

    if (filters.operation) {
      filtered = filtered.filter(log => log.operation === filters.operation);
    }

    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(log => 
        log.service.toLowerCase().includes(searchLower) ||
        log.operation.toLowerCase().includes(searchLower) ||
        JSON.stringify(log.data).toLowerCase().includes(searchLower)
      );
    }

    if (filters.level !== 'all') {
      filtered = filtered.filter(log => {
        if (filters.level === 'error') {
          return log.operation.includes('error') || log.data?.error;
        }
        if (filters.level === 'warning') {
          return log.operation.includes('warn') || log.data?.warning;
        }
        return true;
      });
    }

    // Sort by timestamp (newest first)
    filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    setFilteredLogs(filtered);
  }, [logs, filters]);

  useEffect(() => {
    loadLogs();
    
    if (autoRefresh) {
      const interval = setInterval(loadLogs, 3000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, devToolsService]);

  const getUniqueServices = (): string[] => {
    return [...new Set(logs.map(log => log.service))].sort();
  };

  const getUniqueOperations = (): string[] => {
    const filtered = filters.service ? logs.filter(log => log.service === filters.service) : logs;
    return [...new Set(filtered.map(log => log.operation))].sort();
  };

  const formatTimestamp = (timestamp: string): string => {
    return TimeUtils.formatTimestamp(new Date(timestamp));
  };

  const getLogLevelColor = (log: any): string => {
    if (log.operation.includes('error') || log.data?.error) return 'border-l-red-500 bg-red-50';
    if (log.operation.includes('warn') || log.data?.warning) return 'border-l-yellow-500 bg-yellow-50';
    return 'border-l-blue-500 bg-blue-50';
  };

  const exportLogs = () => {
    const blob = new Blob([JSON.stringify(filteredLogs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `debug-logs-${new Date().toISOString().slice(0, 19)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header and Controls */}
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800">Debug Logs</h3>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600">{filteredLogs.length} / {logs.length} logs</span>
            <button
              onClick={exportLogs}
              className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
            >
              Export
            </button>
            <button
              onClick={loadLogs}
              className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Service</label>
            <select
              value={filters.service}
              onChange={(e) => setFilters(prev => ({ ...prev, service: e.target.value, operation: '' }))}
              className="w-full text-sm border border-gray-300 rounded px-2 py-1"
            >
              <option value="">All Services</option>
              {getUniqueServices().map(service => (
                <option key={service} value={service}>{service}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Operation</label>
            <select
              value={filters.operation}
              onChange={(e) => setFilters(prev => ({ ...prev, operation: e.target.value }))}
              className="w-full text-sm border border-gray-300 rounded px-2 py-1"
            >
              <option value="">All Operations</option>
              {getUniqueOperations().map(operation => (
                <option key={operation} value={operation}>{operation}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Level</label>
            <select
              value={filters.level}
              onChange={(e) => setFilters(prev => ({ ...prev, level: e.target.value }))}
              className="w-full text-sm border border-gray-300 rounded px-2 py-1"
            >
              <option value="all">All Levels</option>
              <option value="error">Errors</option>
              <option value="warning">Warnings</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Search</label>
            <input
              type="text"
              value={filters.search}
              onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
              placeholder="Search logs..."
              className="w-full text-sm border border-gray-300 rounded px-2 py-1"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Auto Refresh</label>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span className="ml-2 text-sm text-gray-600">3s</span>
            </label>
          </div>
        </div>
      </div>

      {/* Logs List */}
      <div className="flex-1 overflow-auto p-4">
        {filteredLogs.length > 0 ? (
          <div className="space-y-2">
            {filteredLogs.map((log, index) => (
              <div
                key={index}
                className={`border-l-4 p-3 rounded-r-lg ${getLogLevelColor(log)}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="font-medium text-sm text-gray-800">{log.service}</span>
                      <span className="text-xs text-gray-500">•</span>
                      <span className="text-sm text-gray-600">{log.operation}</span>
                      <span className="text-xs text-gray-500">•</span>
                      <span className="text-xs text-gray-500">{formatTimestamp(log.timestamp)}</span>
                    </div>
                    
                    <div className="text-sm">
                      <pre className="whitespace-pre-wrap bg-white border border-gray-200 rounded p-2 text-xs overflow-x-auto">
                        {JSON.stringify(log.data, null, 2)}
                      </pre>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="text-gray-400 text-lg mb-2">📝</div>
            <h4 className="text-gray-600 font-medium">
              {logs.length === 0 ? 'No Debug Logs' : 'No Matching Logs'}
            </h4>
            <p className="text-gray-500 text-sm mt-1">
              {logs.length === 0 
                ? 'Debug logs will appear as you use the application'
                : 'Try adjusting your filters to see more logs'
              }
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
