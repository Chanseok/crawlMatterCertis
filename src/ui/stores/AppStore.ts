/**
 * AppStore.ts
 * Top-level Application Store Coordinator
 * 
 * Centralizes access to all domain stores and provides unified state management
 * for the entire application. Acts as the single entry point for components
 * to access domain-specific stores and coordinated actions.
 */

import { makeObservable, observable, action, reaction } from 'mobx';
import type { AppMode } from '../types';

// Domain Store Imports
import { CrawlingStore, crawlingStore } from './domain/CrawlingStore';

import { UIStore, uiStore } from './domain/UIStore';
import { LogStore, logStore } from './domain/LogStore';
import { TaskStore, taskStore } from './domain/TaskStore';
import { databaseStore, DatabaseStore } from './domain/DatabaseStore';


/**
 * Top-level Application Store
 * Coordinates all domain stores and provides unified application state management
 */
export class AppStore {
  private static _instance: AppStore;
  
  // Core app state
  @observable appMode: AppMode = 'development';
  
  // Domain stores
  public readonly crawling: CrawlingStore;
  public readonly database: DatabaseStore;
  public readonly ui: UIStore;
  public readonly logs: LogStore;
  public readonly tasks: TaskStore;

  constructor() {
    makeObservable(this, {
      appMode: observable,
      toggleAppMode: action,
    });

    this.crawling = crawlingStore;
    this.database = databaseStore;
    this.ui = uiStore;
    this.logs = logStore;
    this.tasks = taskStore;
    
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
      () => this.database.products.get().length,
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
   * Graceful shutdown - cleanup all stores
   */
  async shutdown(): Promise<void> {
    await this.crawling.cleanup();
    // DatabaseStore doesn't have cleanup method
    await this.ui.cleanup();
    await this.logs.cleanup();
    await this.tasks.cleanup();
  }

  /**
   * Debug info for all stores
   */
  getDebugInfo(): object {
    return {
      appMode: this.appMode,
      stores: {
        crawling: this.crawling.getDebugInfo(),
        database: (this.database as any).getDebugInfo?.() || 'getDebugInfo not implemented',
        ui: this.ui.getDebugInfo(),
        logs: this.logs.getDebugInfo(),
        tasks: this.tasks.getDebugInfo()
      }
    };
  }
}

// Singleton instance export
export const appStore = AppStore.getInstance();
