import React, { useState, useEffect } from 'react';
import type { DevToolsService } from '../../services/development/DevToolsService';

interface ApplicationStateProps {
  devToolsService: DevToolsService;
}

/**
 * Application State Component
 * 
 * Provides a comprehensive view of the application's current state including
 * service status, configuration, and runtime information for debugging.
 */
export const ApplicationState: React.FC<ApplicationStateProps> = ({ devToolsService }) => {
  const [applicationState, setApplicationState] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['services']));

  const loadApplicationState = async () => {
    setLoading(true);
    try {
      const result = await devToolsService.getApplicationState();
      if (result.success) {
        setApplicationState(result.data);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadApplicationState();
  }, [devToolsService]);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(section)) {
        newSet.delete(section);
      } else {
        newSet.add(section);
      }
      return newSet;
    });
  };

  const formatValue = (value: any): string => {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'string') return `"${value}"`;
    if (typeof value === 'number') return value.toString();
    return JSON.stringify(value, null, 2);
  };

  const renderSection = (title: string, data: any, sectionKey: string) => {
    const isExpanded = expandedSections.has(sectionKey);
    
    return (
      <div key={sectionKey} className="bg-white border border-gray-200 rounded-lg shadow-sm">
        <button
          onClick={() => toggleSection(sectionKey)}
          className="w-full px-4 py-3 text-left flex items-center justify-between hover:bg-gray-50"
        >
          <h4 className="font-medium text-gray-800">{title}</h4>
          <span className={`text-gray-500 transform transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
            ▶
          </span>
        </button>
        
        {isExpanded && (
          <div className="px-4 pb-4 border-t border-gray-100">
            {typeof data === 'object' && data !== null ? (
              <div className="space-y-2 mt-3">
                {Object.entries(data).map(([key, value]) => (
                  <div key={key} className="grid grid-cols-3 gap-4 py-2 border-b border-gray-100 last:border-b-0">
                    <div className="font-medium text-sm text-gray-700 truncate" title={key}>
                      {key}
                    </div>
                    <div className="col-span-2">
                      {typeof value === 'object' && value !== null ? (
                        <details className="group">
                          <summary className="cursor-pointer text-sm text-blue-600 hover:text-blue-700">
                            {Array.isArray(value) ? `Array(${value.length})` : 'Object'} ▼
                          </summary>
                          <pre className="mt-2 text-xs bg-gray-50 border border-gray-200 rounded p-2 overflow-x-auto">
                            {formatValue(value)}
                          </pre>
                        </details>
                      ) : (
                        <div className="text-sm text-gray-600 font-mono">
                          {formatValue(value)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <pre className="mt-3 text-sm bg-gray-50 border border-gray-200 rounded p-3 overflow-x-auto">
                {formatValue(data)}
              </pre>
            )}
          </div>
        )}
      </div>
    );
  };

  const exportState = () => {
    if (applicationState) {
      const blob = new Blob([JSON.stringify(applicationState, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `app-state-${new Date().toISOString().slice(0, 19)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!applicationState) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-gray-400 text-lg mb-2">🔍</div>
          <h4 className="text-gray-600 font-medium">Unable to Load Application State</h4>
          <button
            onClick={loadApplicationState}
            className="mt-2 px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-800">Application State</h3>
        <div className="flex items-center space-x-2">
          <span className="text-sm text-gray-500">
            Updated: {new Date(applicationState.timestamp).toLocaleString()}
          </span>
          <button
            onClick={exportState}
            className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
          >
            Export
          </button>
          <button
            onClick={loadApplicationState}
            className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* State Sections */}
      <div className="space-y-4">
        {/* Services Section */}
        {applicationState.services && renderSection(
          'Services',
          applicationState.services,
          'services'
        )}

        {/* Performance Section */}
        {applicationState.performance && renderSection(
          'Performance Metrics',
          applicationState.performance,
          'performance'
        )}

        {/* Debug Info Section */}
        {applicationState.debugInfo && renderSection(
          'Debug Information',
          applicationState.debugInfo,
          'debugInfo'
        )}

        {/* Additional sections for any other top-level properties */}
        {Object.entries(applicationState)
          .filter(([key]) => !['services', 'performance', 'debugInfo', 'timestamp'].includes(key))
          .map(([key, value]) => renderSection(
            key.charAt(0).toUpperCase() + key.slice(1),
            value,
            key
          ))
        }
      </div>

      {/* Quick Actions */}
      <div className="mt-8 bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h4 className="font-medium text-gray-800 mb-3">Quick Actions</h4>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => toggleSection('services')}
            className="px-3 py-1 bg-blue-100 text-blue-700 rounded text-sm hover:bg-blue-200"
          >
            Toggle Services
          </button>
          <button
            onClick={() => toggleSection('performance')}
            className="px-3 py-1 bg-green-100 text-green-700 rounded text-sm hover:bg-green-200"
          >
            Toggle Performance
          </button>
          <button
            onClick={() => setExpandedSections(new Set(Object.keys(applicationState)))}
            className="px-3 py-1 bg-purple-100 text-purple-700 rounded text-sm hover:bg-purple-200"
          >
            Expand All
          </button>
          <button
            onClick={() => setExpandedSections(new Set())}
            className="px-3 py-1 bg-gray-100 text-gray-700 rounded text-sm hover:bg-gray-200"
          >
            Collapse All
          </button>
        </div>
      </div>

      {/* State Summary */}
      <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-medium text-blue-800 mb-2">State Summary</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-blue-600 font-medium">Services</div>
            <div className="text-blue-800">
              {applicationState.services?.serviceStatus ? 
                Object.keys(applicationState.services.serviceStatus).length : 0
              }
            </div>
          </div>
          <div>
            <div className="text-blue-600 font-medium">Performance Metrics</div>
            <div className="text-blue-800">
              {applicationState.performance ? Object.keys(applicationState.performance).length : 0}
            </div>
          </div>
          <div>
            <div className="text-blue-600 font-medium">Debug Logs</div>
            <div className="text-blue-800">
              {applicationState.debugInfo?.totalLogs || 0}
            </div>
          </div>
          <div>
            <div className="text-blue-600 font-medium">Recent Errors</div>
            <div className="text-blue-800">
              {applicationState.debugInfo?.recentErrors?.length || 0}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
