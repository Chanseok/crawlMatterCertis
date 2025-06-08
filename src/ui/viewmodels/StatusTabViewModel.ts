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

    this.setStatusChecking(true);
    this.setShowAnimation(true);
    try {
      await this.crawlingService.checkCrawlingStatus();
      // Status summary is handled by the store subscriptions
    } catch (error) {
      console.error('Status check failed:', error);
      // Error is handled by the service layer
    } finally {
      this.setStatusChecking(false);
      this.setShowAnimation(false);
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
  async performAutoStatusCheck(): Promise<void> {
    // 항상 최신 config를 비동기로 fetch해서 확인
    const config = await this.configurationService.getConfig();
    const autoStatusCheck = !!config?.autoStatusCheck; // boolean 강제 변환
    console.debug('[StatusTabViewModel] performAutoStatusCheck called', {
      config,
      autoStatusCheck,
      hasAutoChecked: this.hasAutoChecked,
      isRunning: this.isRunning,
      isStatusChecking: this.isStatusChecking,
      showAnimation: this.showAnimation
    });
    
    if (!autoStatusCheck) {
      // 디버깅 로그 추가
      console.debug('[StatusTabViewModel] 자동 상태 체크 비활성화 상태, performAutoStatusCheck 중단');
      return;
    }
    
    if (
      !this.hasAutoChecked &&
      !this.isRunning &&
      !this.isStatusChecking &&
      !this.showAnimation
    ) {
      console.debug('[StatusTabViewModel] 조건 만족: 자동 상태 체크 실행');
      this.setHasAutoChecked(true);
      
      // 애니메이션과 상태 체크를 동시에 시작하여 동기화 보장
      this.setShowAnimation(true);
      this.setStatusChecking(true);
      
      try {
        // 오버레이 애니메이션이 진행되는 동안 백그라운드에서 상태 체크 준비
        await this.crawlingService.checkCrawlingStatus();
        console.debug('[StatusTabViewModel] Background status check completed during animation');
      } catch (error) {
        console.error('[StatusTabViewModel] Background status check failed:', error);
      }
      // isStatusChecking은 onAnimationComplete에서 false로 설정됨
    } else {
      console.debug('[StatusTabViewModel] 조건 불충분: 자동 상태 체크 미실행', {
        hasAutoChecked: this.hasAutoChecked,
        isRunning: this.isRunning,
        isStatusChecking: this.isStatusChecking,
        showAnimation: this.showAnimation
      });
    }
  }

  // Animation completion handler
  @action
  onAnimationComplete(): void {
    // 오버레이 애니메이션 완료 후 상태 체크를 수행하고 애니메이션을 종료
    console.debug('[StatusTabViewModel] Overlay animation completed, starting status check...');
    this.checkStatus().then(() => {
      // 상태 체크 완료 후 애니메이션을 종료하여 사이트 로컬 비교 영역이 표시되도록 함
      console.debug('[StatusTabViewModel] Status check completed, hiding overlay animation...');
      setTimeout(() => {
        this.setShowAnimation(false);
      }, 500); // 약간의 딜레이로 자연스러운 전환
    }).catch((error) => {
      console.error('[StatusTabViewModel] Status check failed after animation completion:', error);
      // 오류가 발생해도 애니메이션은 종료
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
