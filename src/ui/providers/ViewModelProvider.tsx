import React, { createContext, useContext, ReactNode } from 'react';
import { CrawlingWorkflowViewModel } from '../viewmodels/CrawlingWorkflowViewModel';
import { ConfigurationViewModel } from '../viewmodels/ConfigurationViewModel';
import { DatabaseViewModel } from '../viewmodels/DatabaseViewModel';
import { LogViewModel } from '../viewmodels/LogViewModel';
import { UIStateViewModel } from '../viewmodels/UIStateViewModel';

import { logStore } from '../stores/domain/LogStore';
import { databaseStore } from '../stores/domain/DatabaseStore';
import { uiStore } from '../stores/domain/UIStore';

/**
 * ViewModels container for dependency injection
 */
export interface ViewModels {
  crawlingWorkflowViewModel: CrawlingWorkflowViewModel;
  configurationViewModel: ConfigurationViewModel;
  databaseViewModel: DatabaseViewModel;
  logViewModel: LogViewModel;
  uiStateViewModel: UIStateViewModel;
}

/**
 * Context for ViewModels
 */
const ViewModelContext = createContext<ViewModels | null>(null);

/**
 * Props for ViewModelProvider
 */
interface ViewModelProviderProps {
  children: ReactNode;
}

/**
 * Creates and provides ViewModels to the React component tree
 */
export const ViewModelProvider: React.FC<ViewModelProviderProps> = ({ children }) => {
  // Create ViewModels with Domain Store dependencies
  const viewModels: ViewModels = React.useMemo(() => {
    console.log('[ViewModelProvider] Creating ViewModels...');
    
    const crawlingWorkflowViewModel = new CrawlingWorkflowViewModel();
    const logViewModel = new LogViewModel(logStore);
    
    const configurationViewModel = new ConfigurationViewModel();
    const databaseViewModel = new DatabaseViewModel(
      databaseStore,
      logStore
    );
    const uiStateViewModel = new UIStateViewModel(uiStore);      return {
        crawlingWorkflowViewModel,
        configurationViewModel,
        databaseViewModel,
        logViewModel,
        uiStateViewModel
      };
    }, []); // Empty dependency array since stores are singletons

  // Initialize ViewModels
  React.useEffect(() => {
    console.log('[ViewModelProvider] Initializing ViewModels...');
    
    const initializeViewModels = async () => {
      try {
        await Promise.all([
          viewModels.crawlingWorkflowViewModel.initialize(),
          viewModels.configurationViewModel.initialize(),
          viewModels.databaseViewModel.initialize(),
          viewModels.logViewModel.initialize(),
          viewModels.uiStateViewModel.initialize()
        ]);
        
        console.log('[ViewModelProvider] All ViewModels initialized successfully');
      } catch (error) {
        console.error('[ViewModelProvider] Failed to initialize ViewModels:', error);
      }
    };

    initializeViewModels();

    // Cleanup on unmount
    return () => {
      console.log('[ViewModelProvider] Disposing ViewModels...');
      Object.values(viewModels).forEach(viewModel => {
        try {
          viewModel.dispose();
        } catch (error) {
          console.error('[ViewModelProvider] Error disposing ViewModel:', error);
        }
      });
    };
  }, [viewModels]);

  return (
    <ViewModelContext.Provider value={viewModels}>
      {children}
    </ViewModelContext.Provider>
  );
};

/**
 * Hook to access ViewModels
 */
export const useViewModels = (): ViewModels => {
  const viewModels = useContext(ViewModelContext);
  if (!viewModels) {
    throw new Error('useViewModels must be used within a ViewModelProvider');
  }
  return viewModels;
};

/**
 * Individual ViewModel hooks for convenience
 */
export const useCrawlingWorkflowViewModel = () => {
  const { crawlingWorkflowViewModel } = useViewModels();
  return crawlingWorkflowViewModel;
};

export const useConfigurationViewModel = () => {
  const { configurationViewModel } = useViewModels();
  return configurationViewModel;
};

export const useDatabaseViewModel = () => {
  const { databaseViewModel } = useViewModels();
  return databaseViewModel;
};

export const useLogViewModel = () => {
  const { logViewModel } = useViewModels();
  return logViewModel;
};

export const useUIStateViewModel = () => {
  const { uiStateViewModel } = useViewModels();
  return uiStateViewModel;
};
