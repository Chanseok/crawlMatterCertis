import React, { useEffect } from 'react';
import { 
  useDatabaseStore, 
  useLogStore, 
  useTaskStore, 
  useUIStore, 
  useCrawlingStore 
} from '../hooks';
import {
  SearchSection,
  ProductsTable,
  CrawlingStatus,
  TasksOverview,
  LogsViewer
} from './demo';

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
    loadAllProducts 
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
    loadAllProducts(1, 50)
      .catch((error: Error) => {
        addLog(`Error loading products: ${error.message}`, 'error');
      });
      
    // Cleanup function
    return () => {
      addLog('DomainStoreDemo component unmounted', 'info');
    };
  }, []);

  // Handle search input change and search action
  const handleSearch = () => {
    if (searchQuery.trim()) {
      addLog(`Searching for: ${searchQuery}`, 'info');
      // Search functionality would need to be implemented in the store
      loadAllProducts(1, 50);
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
      
      <SearchSection
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSearch={handleSearch}
      />
      
      <ProductsTable
        products={products}
        isSaving={isSaving}
        saveResult={saveResult}
      />
      
      <CrawlingStatus
        status={status}
        progress={progress}
        onToggle={handleCrawlToggle}
      />
      
      <TasksOverview
        activeTasks={activeTasks}
        statistics={statistics}
      />
      
      <LogsViewer
        logs={filteredLogs}
        onClearLogs={clearLogs}
      />
    </div>
  );
};

export default DomainStoreDemo;
