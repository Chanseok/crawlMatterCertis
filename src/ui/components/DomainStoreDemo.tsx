import React, { useEffect } from 'react';
import { 
  useDatabaseStore, 
  useLogStore, 
  useTaskStore, 
  useUIStore, 
  useCrawlingStore 
} from '../hooks';

/**
 * Demo component showcasing the use of all domain store hooks
 * This component demonstrates how to use the domain store hooks in a React component
 */
export const DomainStoreDemo: React.FC = () => {
  // Use the hooks to access domain store state and actions
  const { 
    products, 
    isSaving, 
    saveResult, 
    loadProducts 
  } = useDatabaseStore();

  const { 
    // logs,
    filteredLogs, 
    // filterState,
    addLog, 
    clearLogs 
  } = useLogStore();

  const { 
    activeTasks, 
    statistics, 
    // getActiveTaskCount,
    // completeTask
  } = useTaskStore();

  const { 
    // viewState,
    searchQuery, 
    setSearchQuery, 
    // showModal
  } = useUIStore();

  const { 
    status, 
    progress, 
    startCrawling, 
    stopCrawling 
  } = useCrawlingStore();
  
  // Load products when component mounts
  useEffect(() => {
    // Add a log entry to show component mounted
    addLog('DomainStoreDemo component mounted', 'info');
    
    // Load products
    loadProducts({ page: 1, limit: 50 })
      .catch((error: Error) => {
        addLog(`Error loading products: ${error.message}`, 'error');
      });
      
    // Cleanup function
    return () => {
      addLog('DomainStoreDemo component unmounted', 'info');
    };
  }, []);

  // Handle search input
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  // Handle search button click
  // Handle search button click
  const handleSearch = () => {
    if (searchQuery.trim()) {
      addLog(`Searching for: ${searchQuery}`, 'info');
      // Search functionality would need to be implemented in the store
      loadProducts({ page: 1, limit: 50 });
    }
  };
  // Handle crawl button click
  const handleCrawlToggle = () => {
    if (status === 'idle' || status === 'paused') {
      addLog('Starting crawling process', 'info');
      startCrawling().catch(error => {
        addLog(`Failed to start crawling: ${error}`, 'error');
      });
    } else {
      addLog('Stopping crawling process', 'info');
      stopCrawling().catch(error => {
        addLog(`Failed to stop crawling: ${error}`, 'error');
      });
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
      <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-4">Domain Store Hooks Demo</h2>
      
      {/* Search Section */}
      <div className="mb-6">
        <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">Search Products</h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={handleSearchChange}
            placeholder="Search products..."
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
          />
          <button
            onClick={handleSearch}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md"
          >
            Search
          </button>
        </div>
      </div>
      
      {/* Products Section */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300">Products</h3>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {isSaving && <span>Saving...</span>}
            {saveResult?.success && <span className="text-green-500">Saved successfully!</span>}
            {saveResult?.success === false && <span className="text-red-500">Save failed!</span>}
          </div>
        </div>
        <div className="border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">ID</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Model</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Manufacturer</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
              {products.length > 0 ? (
                products.map((product: any) => (
                  <tr key={product.id || product.url}>
                    <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100">{product.id || 'N/A'}</td>
                    <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100">{product.model || 'N/A'}</td>
                    <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100">{product.manufacturer || 'N/A'}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className="px-4 py-2 text-center text-sm text-gray-500 dark:text-gray-400">
                    No products found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Crawling Section */}
      <div className="mb-6">
        <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">Crawling Status</h3>
        <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-md">
          <div className="flex justify-between items-center mb-2">
            <div className="text-sm font-medium">
              Status: <span className={`${status === 'running' ? 'text-green-500' : 'text-amber-500'}`}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </span>
            </div>
            <button
              onClick={handleCrawlToggle}
              className={`px-4 py-1 rounded-md text-white ${
                status === 'running' ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'
              }`}
            >
              {status === 'running' ? 'Stop' : 'Start'} Crawling
            </button>
          </div>
          
          {status === 'running' && (
            <div className="space-y-2">
              <div className="text-sm text-gray-600 dark:text-gray-300">
                Progress: {progress.percentage}% ({progress.currentPage}/{progress.totalPages})
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2.5">
                <div 
                  className="bg-blue-600 h-2.5 rounded-full" 
                  style={{ width: `${progress.percentage}%` }}
                ></div>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {progress.message || 'Processing...'}
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Tasks Section */}
      <div className="mb-6">
        <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">Tasks</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-md">
            <div className="text-xs text-blue-500 dark:text-blue-400">Active</div>
            <div className="text-xl font-bold text-blue-700 dark:text-blue-300">{Object.keys(activeTasks).length}</div>
          </div>
          <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-md">
            <div className="text-xs text-green-500 dark:text-green-400">Success</div>
            <div className="text-xl font-bold text-green-700 dark:text-green-300">{statistics.success}</div>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-md">
            <div className="text-xs text-red-500 dark:text-red-400">Failed</div>
            <div className="text-xl font-bold text-red-700 dark:text-red-300">{statistics.error}</div>
          </div>
          <div className="bg-purple-50 dark:bg-purple-900/20 p-3 rounded-md">
            <div className="text-xs text-purple-500 dark:text-purple-400">Success Rate</div>
            <div className="text-xl font-bold text-purple-700 dark:text-purple-300">{statistics.successRate}%</div>
          </div>
        </div>
      </div>
      
      {/* Logs Section */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300">Logs</h3>
          <button
            onClick={() => clearLogs()}
            className="px-3 py-1 text-xs bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-md"
          >
            Clear
          </button>
        </div>
        <div className="bg-gray-50 dark:bg-gray-700 p-2 rounded-md h-40 overflow-y-auto text-sm">
          {filteredLogs.length > 0 ? (
            <div className="space-y-1">
              {filteredLogs.map((log, index) => (
                <div key={index} className={`
                  ${log.type === 'error' ? 'text-red-600 dark:text-red-400' :
                    log.type === 'warning' ? 'text-amber-600 dark:text-amber-400' :
                    log.type === 'success' ? 'text-green-600 dark:text-green-400' :
                    'text-gray-600 dark:text-gray-300'}
                `}>
                  <span className="text-xs opacity-75">[{log.timestamp.toLocaleTimeString()}]</span> {log.message}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-gray-500 dark:text-gray-400 py-4">
              No logs to display
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DomainStoreDemo;
