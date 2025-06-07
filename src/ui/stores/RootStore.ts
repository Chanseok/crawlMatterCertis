/**
 * RootStore.ts
 * Central MobX Store Coordinator for Domain Stores
 * 
 * Coordinates all dom    // 3. Initialize database store
    try {
      await this.database.loadSummary();
      console.log('✅ RootStore: DatabaseStore initialized');
    } catch (error) {
      console.warn('⚠️ RootStore: DatabaseStore summary load failed:', error);
    }res and provides unified access patterns.
 * Implements clean dependency management and store composition.
 */

import { makeObservable, observable, action, computed } from 'mobx';
import { crawlingStore, CrawlingStore } from './domain/CrawlingStore';
import { databaseStore, DatabaseStore } from './domain/DatabaseStore';
import { uiStore, UIStore } from './domain/UIStore';
import { logStore, LogStore } from './domain/LogStore';
import { taskStore, TaskStore } from './domain/TaskStore';

/**
 * Root Store coordinating all domain stores
 * Provides unified access and cross-store orchestration
 */
export class RootStore {
  // Domain stores
  public readonly crawling: CrawlingStore;
  public readonly database: DatabaseStore;
  public readonly ui: UIStore;
  public readonly log: LogStore;
  public readonly task: TaskStore;

  // Application-level state
  public isInitialized: boolean = false;
  public initializationError: string | null = null;

  constructor() {
    // Use existing singleton instances
    this.crawling = crawlingStore;
    this.database = databaseStore;
    this.ui = uiStore;
    this.log = logStore;
    this.task = taskStore;

    makeObservable(this, {
      // Observable state
      isInitialized: observable,
      initializationError: observable,
      
      // Actions
      initialize: action,
      setInitialized: action,
      setInitializationError: action,
      cleanup: action,
      
      // Computed
      isReady: computed,
      hasErrors: computed
    });

    // Auto-initialize
    this.initialize();
  }

  /**
   * Initialize all stores and establish cross-store relationships
   */
  async initialize(): Promise<void> {
    try {
      this.setInitializationError(null);

      // Initialize stores in dependency order
      await this.initializeInOrder();

      // Establish cross-store reactions and dependencies
      this.setupCrossStoreCoordination();

      this.setInitialized(true);
      
      console.log('✅ RootStore: All stores initialized successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown initialization error';
      this.setInitializationError(errorMessage);
      console.error('❌ RootStore: Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Initialize stores in proper dependency order
   */
  private async initializeInOrder(): Promise<void> {
    // 1. Initialize core configuration stores first
    try {
      await this.crawling.loadConfig();
      console.log('✅ RootStore: CrawlingStore initialized');
    } catch (error) {
      console.warn('⚠️ RootStore: CrawlingStore config load failed, using defaults');
    }

    // 2. Initialize UI store (no dependencies)
    // UI store is already initialized via constructor

    // 3. Initialize database store
    try {
      await this.database.loadSummary();
      console.log('✅ RootStore: DatabaseStore initialized');
    } catch (error) {
      console.warn('⚠️ RootStore: DatabaseStore initialization failed:', error);
    }

    // 4. Initialize logging (depends on UI for filter preferences)
    // LogStore is already initialized and self-configuring

    // 5. Initialize task store (no async initialization needed)
    // TaskStore is already initialized via constructor
  }

  /**
   * Setup cross-store coordination and reactions
   */
  private setupCrossStoreCoordination(): void {
    // Example: Auto-refresh database summary when crawling completes
    // This could be implemented with MobX reactions if needed
    
    // Example: Log important crawling events
    // This could be implemented with MobX reactions if needed
    
    // Example: Update UI notifications based on store states
    // This could be implemented with MobX reactions if needed

    console.log('✅ RootStore: Cross-store coordination established');
  }

  // Action methods
  setInitialized = (initialized: boolean) => {
    this.isInitialized = initialized;
  };

  setInitializationError = (error: string | null) => {
    this.initializationError = error;
  };

  // Computed properties
  get isReady(): boolean {
    return this.isInitialized && !this.initializationError;
  }

  get hasErrors(): boolean {
    return !!this.initializationError;
  }

  /**
   * Cleanup all stores
   */
  async cleanup(): Promise<void> {
    try {
      await Promise.all([
        this.crawling.cleanup(),
        this.database.destroy(),
        this.ui.cleanup(),
        this.log.cleanup(),
        this.task.cleanup()
      ]);
      
      this.setInitialized(false);
      console.log('✅ RootStore: All stores cleaned up successfully');
    } catch (error) {
      console.error('❌ RootStore: Cleanup failed:', error);
      throw error;
    }
  }

  /**
   * Get debug information from all stores
   */
  getDebugInfo(): object {
    return {
      rootStore: {
        isInitialized: this.isInitialized,
        initializationError: this.initializationError,
        isReady: this.isReady,
        hasErrors: this.hasErrors
      },
      crawling: this.crawling.getDebugInfo(),
      database: this.database.getDebugInfo(),
      ui: this.ui.getDebugInfo(),
      log: this.log.getDebugInfo(),
      task: this.task.getDebugInfo()
    };
  }
}

// Singleton instance
export const rootStore = new RootStore();
