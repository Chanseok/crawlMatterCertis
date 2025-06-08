import React, { useState, useEffect } from 'react';
import { serviceFactory } from '../../services/ServiceFactory';
import { isDevelopment } from '../../utils/environment';
import { PerformanceMetrics } from './PerformanceMetrics';
import { ServiceStatusPanel } from './ServiceStatusPanel';
import { DebugLogs } from './DebugLogs';
import { ApplicationState } from './ApplicationState';

/**
 * Debug Panel Component - Development Only
 * 
 * Main debugging interface that provides comprehensive development tools
 * including performance monitoring, service status, logs, and application state.
 * This component uses the DevToolsService for all debugging operations.
 * Only available in development mode.
 */
export const DebugPanel: React.FC = React.memo(() => {
  const [activeTab, setActiveTab] = useState<'performance' | 'services' | 'logs' | 'state'>('performance');
  const [isVisible, setIsVisible] = useState(false);
  const [devToolsService, setDevToolsService] = useState<any>(null);

  // Only load in development mode
  useEffect(() => {
    if (!isDevelopment()) {
      return;
    }

    const service = serviceFactory.getDevToolsService();
    setDevToolsService(service);
  }, []);

  // Don't render in production
  if (!isDevelopment() || !devToolsService) {
    return null;
  }

  // Toggle debug panel visibility (can be controlled by keyboard shortcut)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ctrl+Shift+D (or Cmd+Shift+D on Mac) to toggle debug panel
      if (event.ctrlKey && event.shiftKey && event.key === 'D') {
        event.preventDefault();
        setIsVisible(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (!isVisible) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <button
          onClick={() => setIsVisible(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg shadow-lg text-sm font-medium"
          title="Open Debug Panel (Ctrl+Shift+D)"
        >
          Debug
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-6xl h-5/6 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-800">Development Tools</h2>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-500">Press Ctrl+Shift+D to toggle</span>
            <button
              onClick={() => setIsVisible(false)}
              className="text-gray-400 hover:text-gray-600 p-1"
              title="Close Debug Panel"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-200">
          {[
            { id: 'performance', label: 'Performance', icon: '📊' },
            { id: 'services', label: 'Services', icon: '⚙️' },
            { id: 'logs', label: 'Debug Logs', icon: '📝' },
            { id: 'state', label: 'App State', icon: '🔍' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600 bg-blue-50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span className="mr-2">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-hidden">
          {activeTab === 'performance' && <PerformanceMetrics devToolsService={devToolsService} />}
          {activeTab === 'services' && <ServiceStatusPanel devToolsService={devToolsService} />}
          {activeTab === 'logs' && <DebugLogs devToolsService={devToolsService} />}
          {activeTab === 'state' && <ApplicationState devToolsService={devToolsService} />}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>Development Mode - Debug Panel</span>
            <div className="flex items-center space-x-4">
              <button
                onClick={async () => {
                  const result = await devToolsService.clearDebugData();
                  if (result.success) {
                    alert('Debug data cleared successfully');
                  }
                }}
                className="text-red-600 hover:text-red-700 font-medium"
              >
                Clear Debug Data
              </button>
              <button
                onClick={async () => {
                  const result = await devToolsService.exportDebugData();
                  if (result.success && result.data) {
                    const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `debug-export-${new Date().toISOString().slice(0, 19)}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }
                }}
                className="text-blue-600 hover:text-blue-700 font-medium"
              >
                Export Debug Data
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

DebugPanel.displayName = 'DebugPanel';

export default DebugPanel;
