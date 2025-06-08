/**
 * Debug Components Export Module - Development Only
 * 
 * Exports all debug panel components for Phase 2-4 development tools.
 * These components provide comprehensive debugging and monitoring capabilities.
 * They are conditionally loaded only in development mode.
 */

import { isDevelopment } from '../../utils/environment';

// Safe conditional loading using require when needed
let DebugPanel: any = null;
let PerformanceMetrics: any = null;
let ServiceStatusPanel: any = null;
let DebugLogs: any = null;
let ApplicationState: any = null;
let ProgressDebugPanel: any = null;

if (isDevelopment()) {
  try {
    const debugModule = require('./DebugPanel');
    DebugPanel = debugModule.DebugPanel;
    
    const performanceModule = require('./PerformanceMetrics');
    PerformanceMetrics = performanceModule.PerformanceMetrics;
    
    const serviceModule = require('./ServiceStatusPanel');
    ServiceStatusPanel = serviceModule.ServiceStatusPanel;
    
    const logsModule = require('./DebugLogs');
    DebugLogs = logsModule.DebugLogs;
    
    const appStateModule = require('./ApplicationState');
    ApplicationState = appStateModule.ApplicationState;
    
    const progressModule = require('./ProgressDebugPanel');
    ProgressDebugPanel = progressModule.ProgressDebugPanel;
  } catch (error) {
    console.warn('Debug components could not be loaded:', error);
  }
}

export { DebugPanel, PerformanceMetrics, ServiceStatusPanel, DebugLogs, ApplicationState, ProgressDebugPanel };
