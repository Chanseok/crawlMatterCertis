/**
 * StatusTabViewModel.ts
 * ViewModel for StatusTab Component
 * 
 * Manages StatusTab-specific logic including status checking, control actions,
 * and UI state management following the established BaseService pattern.
 */

import { makeObservable, observable, computed, action } from 'mobx';
import { ServiceFactory } from '../services/ServiceFactory';
import type { CrawlingService } from '../services/domain/CrawlingService';
import type { ConfigurationService } from '../services/domain/ConfigurationService';
import type { ExportService } from '../services/domain/ExportService';

export class StatusTabViewModel {
  // Services (using BaseService pattern)
  private crawlingService: CrawlingService;
  private configurationService: ConfigurationService;
  private exportService: ExportService;

  // UI State
  @observable accessor isStatusChecking = false;
  @observable accessor showAnimation = false;
  @observable accessor hasAutoChecked = false;

  constructor() {
    makeObservable(this);
    
    // Initialize services using ServiceFactory singleton instance
    const serviceFactory = ServiceFactory.getInstance();
    this.crawlingService = serviceFactory.getCrawlingService();
    this.configurationService = serviceFactory.getConfigurationService();
    this.exportService = serviceFactory.getExportService();
  }

  // Observable state for computed properties
  @observable accessor isRunning = false;
  @observable accessor productsCount = 0;

  // Computed properties for UI state
  @computed
  get shouldShowStatusButton(): boolean {
    return !this.isRunning && !this.isStatusChecking && !this.showAnimation;
  }

  @computed
  get crawlButtonText(): string {
    return this.isRunning ? '크롤링 중지' : '크롤링 시작';
  }

  @computed
  get crawlButtonStyle(): string {
    return this.isRunning
      ? 'bg-red-500 hover:bg-red-600 border border-red-600 focus:ring-red-400'
      : 'bg-blue-500 hover:bg-blue-600 border border-blue-600 focus:ring-blue-400';
  }

  @computed
  get isExportDisabled(): boolean {
    return this.isRunning || this.productsCount === 0;
  }

  @computed
  get autoStatusCheckEnabled(): boolean {
    return this.configurationService.getConfigValue('autoStatusCheck') || false;
  }

  // State update methods
  @action
  updateCrawlingState(isRunning: boolean, productsCount: number = 0): void {
    this.isRunning = isRunning;
    this.productsCount = productsCount;
  }

  // Actions
  @action
  async checkStatus(): Promise<void> {
    if (this.isStatusChecking || this.showAnimation) return;

    try {
      this.setShowAnimation(true);
      const result = await this.crawlingService.checkCrawlingStatus();
      if (!result.success) {
        throw new Error(result.error?.message || 'Status check failed');
      }
      // Status summary is handled by the store subscriptions
    } catch (error) {
      console.error('Status check failed:', error);
      // Error is handled by the service layer
    }
  }

  @action
  async toggleCrawling(): Promise<void> {
    try {
      const isRunningResult = await this.crawlingService.isRunning();
      if (!isRunningResult.success) {
        throw new Error('Failed to check running status');
      }

      if (isRunningResult.data) {
        const result = await this.crawlingService.stopCrawling();
        if (!result.success) {
          throw new Error(result.error?.message || 'Failed to stop crawling');
        }
      } else {
        const result = await this.crawlingService.startCrawling();
        if (!result.success) {
          throw new Error(result.error?.message || 'Failed to start crawling');
        }
      }
    } catch (error) {
      console.error('Crawling toggle failed:', error);
      // Error is handled by the service layer
    }
  }

  @action
  async exportData(): Promise<void> {
    if (this.isExportDisabled) return;

    try {
      await this.exportService.exportToExcel();
    } catch (error) {
      console.error('Export failed:', error);
      // Error is handled by the service layer
    }
  }

  @action
  setStatusChecking(checking: boolean): void {
    this.isStatusChecking = checking;
  }

  @action
  setShowAnimation(show: boolean): void {
    this.showAnimation = show;
  }

  @action
  setHasAutoChecked(checked: boolean): void {
    this.hasAutoChecked = checked;
  }

  // Auto status check logic
  @action
  performAutoStatusCheck(): void {
    // Always fetch the latest config value directly
    const autoStatusCheck = this.configurationService.getConfigValue('autoStatusCheck');
    if (!autoStatusCheck) return;
    if (
      !this.hasAutoChecked &&
      !this.isRunning &&
      !this.isStatusChecking &&
      !this.showAnimation
    ) {
      this.setHasAutoChecked(true);
      // Small delay to ensure the tab is fully rendered
      setTimeout(() => {
        this.setShowAnimation(true);
      }, 500);
    }
  }

  // Animation completion handler
  @action
  onAnimationComplete(): void {
    this.checkStatus().then(() => {
      setTimeout(() => {
        this.setShowAnimation(false);
      }, 500);
    });
  }

  // Cleanup
  dispose(): void {
    // Clean up any subscriptions if needed
  }
}
