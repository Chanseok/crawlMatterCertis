import React from 'react';

/**
 * Environment Utilities for UI Components
 * 
 * Provides environment detection for conditional loading of development-only
 * components and features.
 */

/**
 * Check if the application is running in development mode
 * This can be used by UI components to conditionally render development tools
 */
export function isDevelopment(): boolean {
  // Check multiple indicators for development mode
  const isLocalhost = typeof window !== 'undefined' && 
                     (window.location.hostname === 'localhost' || 
                      window.location.hostname === '127.0.0.1');
  
  const isDevPort = typeof window !== 'undefined' && 
                   window.location.port === '5173'; // Vite dev server default port
  
  const isNodeDev = typeof process !== 'undefined' && 
                   process.env.NODE_ENV === 'development';
  
  // In Electron context, we can also check if DevTools are available
  const hasDevTools = typeof window !== 'undefined' && 
                     window.electron && 
                     'isDev' in window.electron;
  
  return isLocalhost || isDevPort || isNodeDev || hasDevTools;
}

/**
 * Check if the application is running in production mode
 */
export function isProduction(): boolean {
  return !isDevelopment();
}

/**
 * Check if we're running in Electron environment
 */
export function isElectron(): boolean {
  return typeof window !== 'undefined' && !!window.electron;
}

/**
 * Get current environment string
 */
export function getEnvironment(): 'development' | 'production' {
  return isDevelopment() ? 'development' : 'production';
}

/**
 * Conditional component wrapper for development-only components
 * Returns component in development, null in production
 */
export function DevOnly<T extends React.ComponentType<any>>(
  Component: T
): React.ComponentType<React.ComponentProps<T>> {
  return (props: React.ComponentProps<T>) => {
    if (!isDevelopment()) {
      return null;
    }
    return React.createElement(Component, props);
  };
}

/**
 * Higher-order component for conditional rendering based on environment
 */
export function withEnvironmentGuard<P extends object>(
  Component: React.ComponentType<P>,
  allowedEnvironments: ('development' | 'production')[]
): React.ComponentType<P> {
  return (props: P) => {
    const currentEnv = getEnvironment();
    
    if (!allowedEnvironments.includes(currentEnv)) {
      return null;
    }
    
    return React.createElement(Component, props);
  };
}
