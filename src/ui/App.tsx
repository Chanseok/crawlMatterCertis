console.log('[APP] 🚀 App.tsx module loaded');

import React, { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { AppLayout } from './components/AppLayout';
import { CrawlingSettings } from './components/CrawlingSettings';
import { StatusTab } from './components/tabs/StatusTab';
import { LocalDBTab } from './components/LocalDBTab';
import { AnalysisTab } from './components/tabs/AnalysisTab';
import { ViewModelProvider, useUIStateViewModel, useCrawlingWorkflowViewModel, useLogViewModel } from './providers/ViewModelProvider';
import { useApiInitialization } from './hooks/useApiInitialization';

/**
 * Main App Content Component - separated for clean ViewModel usage
 */
const AppContent: React.FC = observer(() => {
  console.log('[APP] 🎨 AppContent component rendering...');
  console.log('[APP] Rendering App component with ViewModel pattern');
  
  // API Initialization
  const { isInitialized } = useApiInitialization();
  console.log('[APP] 🔧 API initialization status:', isInitialized);
  
  // ViewModels
  const uiStateViewModel = useUIStateViewModel();
  const crawlingWorkflowViewModel = useCrawlingWorkflowViewModel();
  const logViewModel = useLogViewModel();
  console.log('[APP] ✅ ViewModels obtained successfully');
  
  // Initialize app and log initial message
  useEffect(() => {
    logViewModel.addLog('App component loaded successfully with ViewModel pattern!', 'info', 'APP');
  }, [logViewModel]);
  
  // Tab change handler
  const handleTabChange = (tab: string) => {
    console.log(`[App] handleTabChange called with: ${tab}`);
    console.log(`[App] Current activeTab before change: ${uiStateViewModel.activeTab}`);
    uiStateViewModel.setActiveTab(tab);
    console.log(`[App] Current activeTab after change: ${uiStateViewModel.activeTab}`);
    logViewModel.addLog(`Switched to tab: ${tab}`, 'info', 'APP');
  };

  // Crawling control handlers
  // const handleCheckStatus = async () => {
  //   uiStateViewModel.showLoading('Checking status...');
  //   try {
  //     await crawlingWorkflowViewModel.checkWorkflowStatus();
  //     logViewModel.addLog('Status check completed', 'info', 'APP');
  //   } catch (error) {
  //     const errorMessage = error instanceof Error ? error.message : String(error);
  //     logViewModel.addLog(`Status check failed: ${errorMessage}`, 'error', 'APP');
  //   } finally {
  //     uiStateViewModel.hideLoading();
  //   }
  // };

  // const handleCrawlToggle = async () => {
  //   try {
  //     if (crawlingWorkflowViewModel.workflowState.isRunning) {
  //       await crawlingWorkflowViewModel.stopWorkflow();
  //       logViewModel.addLog('Crawling workflow stopped', 'info', 'APP');
  //     } else {
  //       await crawlingWorkflowViewModel.startWorkflow();
  //       logViewModel.addLog('Crawling workflow started', 'info', 'APP');
  //     }
  //   } catch (error) {
  //     const errorMessage = error instanceof Error ? error.message : String(error);
  //     logViewModel.addLog(`Crawling toggle failed: ${errorMessage}`, 'error', 'APP');
  //   }
  // };

  // const handleExport = async () => {
  //   uiStateViewModel.showLoading('Exporting data...');
  //   try {
  //     // Use DatabaseViewModel for export operations
  //     // await databaseViewModel.exportProducts('json');
  //     logViewModel.addLog('Export completed successfully', 'info', 'APP');
  //   } catch (error) {
  //     const errorMessage = error instanceof Error ? error.message : String(error);
  //     logViewModel.addLog(`Export failed: ${errorMessage}`, 'error', 'APP');
  //   } finally {
  //     uiStateViewModel.hideLoading();
  //   }
  // };

  const renderTabContent = () => {
    const activeTab = uiStateViewModel.activeTab;
    console.log(`[App] renderTabContent called with activeTab: ${activeTab}`);
    
    switch (activeTab) {
      case 'settings':
        return <CrawlingSettings />;
      case 'status':
        return (
          <StatusTab
            compareExpandedInApp={uiStateViewModel.isSectionExpanded('database-view')}
            setCompareExpandedInApp={(expanded: boolean) => 
              uiStateViewModel.setSectionVisibility('database-view', expanded)
            }
            crawlingStatus={crawlingWorkflowViewModel.workflowState.stage}
            productsLength={crawlingWorkflowViewModel.workflowState.productCount}
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

  // Show loading screen during API initialization
  if (!isInitialized) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mb-4"></div>
          <p className="font-medium text-blue-700">설정을 로드하는 중...</p>
        </div>
      </div>
    );
  }

  // Show loading overlay when ViewModels are processing
  const LoadingOverlay = () => {
    if (!uiStateViewModel.isLoading) return null;
    
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 shadow-lg">
          <div className="flex items-center space-x-3">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-500 border-t-transparent"></div>
            <span className="text-gray-700">{uiStateViewModel.loadingMessage}</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <AppLayout 
        activeTab={uiStateViewModel.activeTab} 
        onTabChange={handleTabChange}
        isDevelopment={true}
      >
        <div className="p-6 max-w-7xl mx-auto">
          {renderTabContent()}
        </div>
      </AppLayout>
      <LoadingOverlay />
    </>
  );
});

/**
 * Main App Component with ViewModel Provider
 */
const App: React.FC = () => {
  return (
    <ViewModelProvider>
      <AppContent />
    </ViewModelProvider>
  );
};

export default App;
