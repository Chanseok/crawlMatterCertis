import { atom } from 'nanostores';
import { IPCService } from '../services/IPCService';
import type { CrawlerConfig } from '../../../types';

export interface ConfigViewModelState {
  config: CrawlerConfig | null;
  isUpdating: boolean;
  isRefreshingVendors: boolean;
  vendorRefreshResult: {
    success: boolean;
    added?: number;
    updated?: number;
    total?: number;
    message?: string;
  } | null;
  error: string | null;
}

const initialState: ConfigViewModelState = {
  config: null,
  isUpdating: false,
  isRefreshingVendors: false,
  vendorRefreshResult: null,
  error: null
};

/**
 * Configuration management ViewModel
 * Handles configuration updates and vendor information refresh
 */
export class ConfigViewModel {
  private ipcService: IPCService;
  private state = atom<ConfigViewModelState>(initialState);

  constructor() {
    this.ipcService = IPCService.getInstance();
    this.initializeConfig();
  }

  private async initializeConfig() {
    try {
      const response = await this.ipcService.getConfig();
      this.updateState({ config: response.config || response });
    } catch (error) {
      console.error('Failed to initialize config:', error);
      this.updateState({ 
        error: error instanceof Error ? error.message : 'Failed to load configuration' 
      });
    }
  }

  private updateState(updates: Partial<ConfigViewModelState>) {
    this.state.set({ ...this.state.get(), ...updates });
  }

  getState() {
    return this.state;
  }

  /**
   * Update configuration settings
   */
  async updateSettings(settings: Partial<CrawlerConfig>) {
    this.updateState({ isUpdating: true, error: null });

    try {
      const response = await this.ipcService.updateConfig(settings);
      
      // Update local state with new configuration
      this.updateState({ config: response.config || response });
    } catch (error) {
      console.error('Failed to update config settings:', error);
      this.updateState({ 
        error: error instanceof Error ? error.message : 'Failed to update settings' 
      });
      throw error;
    } finally {
      this.updateState({ isUpdating: false });
    }
  }

  /**
   * Refresh vendor information from external source
   */
  async refreshVendors() {
    this.updateState({ 
      isRefreshingVendors: true, 
      vendorRefreshResult: null, 
      error: null 
    });

    try {
      const result = await this.ipcService.fetchAndUpdateVendors();
      console.log('Vendor refresh result:', result);
      this.updateState({ vendorRefreshResult: result });
      return result;
    } catch (error) {
      console.error('Error refreshing vendors:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to refresh vendors';
      this.updateState({ 
        vendorRefreshResult: { success: false, message: errorMessage },
        error: errorMessage 
      });
      throw error;
    } finally {
      this.updateState({ isRefreshingVendors: false });
    }
  }

  /**
   * Clear vendor refresh result
   */
  clearVendorRefreshResult() {
    this.updateState({ vendorRefreshResult: null });
  }

  /**
   * Clear error state
   */
  clearError() {
    this.updateState({ error: null });
  }

  /**
   * Clean up resources
   */
  destroy() {
    // Clean up any subscriptions if needed
  }
}

// Singleton instance
let configViewModelInstance: ConfigViewModel | null = null;

export function getConfigViewModel(): ConfigViewModel {
  if (!configViewModelInstance) {
    configViewModelInstance = new ConfigViewModel();
  }
  return configViewModelInstance;
}
