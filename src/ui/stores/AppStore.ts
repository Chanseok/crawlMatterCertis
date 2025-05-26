/**
 * AppStore.ts
 * Top-level Application Store Coordinator
 * 
 * Centralizes access to all domain stores through RootStore and provides 
 * unified state management for the entire application. Acts as the coordination
 * layer between RootStore and the UI.
 */

import { makeObservable, observable, action, reaction } from 'mobx';
import type { AppMode } from '../types';
import { rootStore, RootStore } from './RootStore';

/**
 * Top-level Application Store
 * Coordinates RootStore and provides application-level state management
 */
export class AppStore {
  private static _instance: AppStore;
  
  // Core app state
  @observable accessor appMode: AppMode = 'development';
  
  // Root store instance (provides access to all domain stores)
  public readonly rootStore: RootStore;

  constructor() {
    makeObservable(this, {
      appMode: observable,
      toggleAppMode: action,
    });

    this.rootStore = rootStore;
    
    // Initialize store coordination
    this.initializeStoreCoordination();
    
    AppStore._instance = this;
  }

  /**
   * Get singleton instance
   */
  static getInstance(): AppStore {
    if (!AppStore._instance) {
      AppStore._instance = new AppStore();
    }
    return AppStore._instance;
  }

  /**
   * Convenience getters for domain stores (through RootStore)
   */
  get crawling() { return this.rootStore.crawling; }
  get database() { return this.rootStore.database; }
  get ui() { return this.rootStore.ui; }
  get logs() { return this.rootStore.log; }
  get tasks() { return this.rootStore.task; }

  /**
   * Initialize coordination between stores
   */
  private initializeStoreCoordination(): void {
    // React to app mode changes
    reaction(
      () => this.appMode,
      (mode) => {
        this.logs.addLog(`앱 모드가 ${mode === 'development' ? '개발' : '실사용'} 모드로 변경되었습니다.`, 'info');
      }
    );
    
    // React to crawling progress changes
    reaction(
      () => this.crawling.progress,
      (progress) => {
        // Log important stage transitions
        if (progress?.message) {
          if (progress.message.includes('1단계 완료') || 
              progress.message.includes('2단계 완료') ||
              progress.message.includes('크롤링 완료')) {
            this.logs.addLog(progress.message, 'success');
          }
        }
      }
    );

    // React to database changes (when products are updated)
    reaction(
      () => this.database.products.length,
      () => {
        this.logs.addLog('데이터베이스가 업데이트되었습니다.', 'info');
      }
    );
  }

  /**
   * App-wide actions that coordinate multiple stores
   */
  @action
  async toggleAppMode(): Promise<void> {
    const newMode = this.appMode === 'development' ? 'production' : 'development';
    this.appMode = newMode;
    
    // Reload initial data for new mode
    await this.loadInitialData();
  }

  /**
   * Initialize application data
   */
  async loadInitialData(): Promise<void> {
    try {
      // Load data in proper order
      await this.database.loadSummary();
      await this.database.loadProducts(undefined, 1, 100);
      
      this.logs.addLog('초기 데이터 로드 완료', 'success');
    } catch (error) {
      this.logs.addLog(`초기 데이터 로드 중 오류: ${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  }

  /**
   * Graceful shutdown - cleanup all stores through RootStore
   */
  async shutdown(): Promise<void> {
    await this.rootStore.cleanup();
  }

  /**
   * Debug info for all stores through RootStore
   */
  getDebugInfo(): object {
    return {
      appMode: this.appMode,
      rootStore: this.rootStore.getDebugInfo()
    };
  }
}

// Singleton instance export
export const appStore = AppStore.getInstance();
