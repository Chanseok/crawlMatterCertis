import React, { useState, useEffect } from 'react';
import type { DevToolsService } from '../../services/development/DevToolsService';
import { serviceFactory } from '../../services/ServiceFactory';

interface ServiceStatusPanelProps {
  devToolsService: DevToolsService;
}

/**
 * Service Status Panel Component
 * 
 * Displays real-time status of all application services including
 * connectivity tests, health checks, and diagnostic information.
 */
export const ServiceStatusPanel: React.FC<ServiceStatusPanelProps> = React.memo(({ devToolsService }) => {
  const [serviceStatus, setServiceStatus] = useState<Record<string, boolean>>({});
  const [diagnostics, setDiagnostics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [runningDiagnostics, setRunningDiagnostics] = useState(false);

  const loadServiceStatus = () => {
    const status = serviceFactory.getServiceStatus();
    setServiceStatus(status);
    setLoading(false);
  };

  const runDiagnostics = async () => {
    setRunningDiagnostics(true);
    try {
      const result = await devToolsService.runDiagnostics();
      if (result.success) {
        setDiagnostics(result.data);
      }
    } finally {
      setRunningDiagnostics(false);
    }
  };

  useEffect(() => {
    loadServiceStatus();
    runDiagnostics();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      loadServiceStatus();
    }, 30000);
    
    return () => clearInterval(interval);
  }, [devToolsService]);

  const getStatusColor = (status: boolean): string => {
    return status ? 'text-green-600' : 'text-red-600';
  };

  const getStatusIcon = (status: boolean): string => {
    return status ? '✅' : '❌';
  };

  const formatPerformance = (ms: number): string => {
    if (ms < 100) return `${ms.toFixed(0)}ms`;
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
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
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-800">Service Status</h3>
        <div className="flex items-center space-x-2">
          <button
            onClick={runDiagnostics}
            disabled={runningDiagnostics}
            className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {runningDiagnostics ? 'Running...' : 'Run Diagnostics'}
          </button>
          <button
            onClick={loadServiceStatus}
            className="px-3 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-700"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Service Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {Object.entries(serviceStatus).map(([serviceName, initialized]) => (
          <div key={serviceName} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-gray-800 capitalize">
                {serviceName.replace('Service', '')}
              </h4>
              <div className="flex items-center space-x-2">
                <span className="text-lg">{getStatusIcon(initialized)}</span>
                <span className={`text-sm font-medium ${getStatusColor(initialized)}`}>
                  {initialized ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
            
            {diagnostics?.connectivity && (
              <div className="mt-2 pt-2 border-t border-gray-100">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Connectivity:</span>
                  <span className={getStatusColor(diagnostics.connectivity[serviceName.toLowerCase()] ?? false)}>
                    {diagnostics.connectivity[serviceName.toLowerCase()] ? 'Connected' : 'Disconnected'}
                  </span>
                </div>
                
                {diagnostics?.performance && diagnostics.performance[`${serviceName.toLowerCase()}Ms`] && (
                  <div className="flex items-center justify-between text-sm mt-1">
                    <span className="text-gray-600">Response Time:</span>
                    <span className="font-medium">
                      {formatPerformance(diagnostics.performance[`${serviceName.toLowerCase()}Ms`])}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Diagnostic Results */}
      {diagnostics && (
        <div className="space-y-6">
          {/* Performance Summary */}
          <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
            <h4 className="font-medium text-gray-800 mb-3">Performance Overview</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(diagnostics.performance || {}).map(([metric, value]: [string, any]) => (
                <div key={metric} className="text-center">
                  <div className="text-lg font-semibold text-gray-800">
                    {formatPerformance(value)}
                  </div>
                  <div className="text-sm text-gray-600 capitalize">
                    {metric.replace('Ms', '').replace(/([A-Z])/g, ' $1').trim()}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recommendations */}
          {diagnostics.recommendations && diagnostics.recommendations.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h4 className="font-medium text-yellow-800 mb-3 flex items-center">
                <span className="mr-2">⚠️</span>
                Recommendations
              </h4>
              <ul className="space-y-1">
                {diagnostics.recommendations.map((recommendation: string, index: number) => (
                  <li key={index} className="text-sm text-yellow-700 flex items-start">
                    <span className="mr-2 mt-0.5">•</span>
                    {recommendation}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Connectivity Details */}
          <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
            <h4 className="font-medium text-gray-800 mb-3">Connectivity Status</h4>
            <div className="space-y-2">
              {Object.entries(diagnostics.connectivity || {}).map(([service, connected]: [string, any]) => (
                <div key={service} className="flex items-center justify-between py-1">
                  <span className="text-sm text-gray-600 capitalize">{service}</span>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm">{getStatusIcon(connected)}</span>
                    <span className={`text-sm font-medium ${getStatusColor(connected)}`}>
                      {connected ? 'Connected' : 'Failed'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Health Monitoring Control */}
      <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-medium text-blue-800 mb-2">Health Monitoring</h4>
        <p className="text-sm text-blue-700 mb-3">
          Continuous health monitoring tracks service performance automatically.
        </p>
        <button
          onClick={() => {
            devToolsService.startHealthMonitoring(30000);
            alert('Health monitoring started (30s intervals)');
          }}
          className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
        >
          Start Health Monitoring
        </button>
      </div>
    </div>
  );
});

ServiceStatusPanel.displayName = 'ServiceStatusPanel';
