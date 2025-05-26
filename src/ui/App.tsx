import React, { useState, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import { AppLayout } from './components/AppLayout';
import { CrawlingSettings } from './components/CrawlingSettings';
import { StatusTab } from './components/tabs/StatusTab';
import { LocalDBTab } from './components/LocalDBTab';
import { AnalysisTab } from './components/tabs/AnalysisTab';
import { useLogStore } from './hooks/useLogStore';
import { useCrawlingStore } from './hooks/useCrawlingStore';
import { useDatabaseStore } from './hooks/useDatabaseStore';

const App: React.FC = observer(() => {
  console.log('[App] Rendering App component');
  
  // Domain Store Hooks
  const { addLog } = useLogStore();
  const { 
    status: crawlingStatus, 
    startCrawling, 
    stopCrawling, 
    checkStatus 
  } = useCrawlingStore();
  const { products, exportToExcel } = useDatabaseStore();
  
  // Local state
  const [activeTab, setActiveTab] = useState('status');
  const [statusExpanded, setStatusExpanded] = useState(true);
  const [isStatusChecking, setIsStatusChecking] = useState(false);
  const [compareExpandedInApp, setCompareExpandedInApp] = useState(false);
  
  // Add a test log entry
  React.useEffect(() => {
    addLog('App component loaded successfully!', 'success');
  }, [addLog]);
  
  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab);
    addLog(`Switched to tab: ${tab}`, 'info');
  }, [addLog]);

  const handleToggleStatus = useCallback(() => {
    setStatusExpanded(!statusExpanded);
  }, [statusExpanded]);

  const handleCheckStatus = useCallback(async () => {
    setIsStatusChecking(true);
    try {
      await checkStatus();
      addLog('Status check completed', 'success');
    } catch (error) {
      addLog(`Status check failed: ${error}`, 'error');
    } finally {
      setIsStatusChecking(false);
    }
  }, [checkStatus, addLog]);

  const handleCrawlToggle = useCallback(async () => {
    try {
      if (crawlingStatus === 'running') {
        await stopCrawling();
        addLog('Crawling stopped', 'info');
      } else {
        await startCrawling();
        addLog('Crawling started', 'success');
      }
    } catch (error) {
      addLog(`Crawling toggle failed: ${error}`, 'error');
    }
  }, [crawlingStatus, startCrawling, stopCrawling, addLog]);

  const handleExport = useCallback(async () => {
    try {
      await exportToExcel();
      addLog('Export completed successfully', 'success');
    } catch (error) {
      addLog(`Export failed: ${error}`, 'error');
    }
  }, [exportToExcel, addLog]);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'settings':
        return <CrawlingSettings />;
      case 'status':
        return (
          <StatusTab
            statusExpanded={statusExpanded}
            onToggleStatus={handleToggleStatus}
            isStatusChecking={isStatusChecking}
            compareExpandedInApp={compareExpandedInApp}
            setCompareExpandedInApp={setCompareExpandedInApp}
            onCheckStatus={handleCheckStatus}
            onCrawlToggle={handleCrawlToggle}
            onExport={handleExport}
            crawlingStatus={crawlingStatus}
            productsLength={products.length}
          />
        );
      case 'localDB':
        return <LocalDBTab />;
      case 'analysis':
        return <AnalysisTab />;
      default:
        return <div>Tab not found</div>;
    }
  };

  return (
    <AppLayout 
      activeTab={activeTab} 
      onTabChange={handleTabChange}
      isDevelopment={true}
    >
      <div className="p-6">
        {renderTabContent()}
      </div>
    </AppLayout>
  );
});

export default App;
