import { UnifiedCrawlingProgressViewModel } from '../viewModels/UnifiedCrawlingProgressViewModel.js';
import type { CrawlingProgress } from '../../../types.js';
import { registerViewModelForTesting } from './TestAccessBridge';

/**
 * Clean Architecture 기반 통합 Progress Store
 * 단일 UnifiedViewModel 인스턴스 전역 관리
 */
export class ProgressStore {
  private static _instance: ProgressStore;
  private _viewModel: UnifiedCrawlingProgressViewModel;

  constructor() {
    this._viewModel = new UnifiedCrawlingProgressViewModel();
    console.log('[ProgressStore] Unified ViewModel initialized');
    
    // 개발 환경에서 디버깅 용도
    if (typeof window !== 'undefined') {
      (window as any).__progressStore = this;
      
      // 테스트용 ViewModel 등록
      registerViewModelForTesting(this._viewModel);
    }
    
    ProgressStore._instance = this;
  }

  /**
   * 단일 ViewModel 인스턴스 반환
   */
  get viewModel(): UnifiedCrawlingProgressViewModel {
    return this._viewModel;
  }
  
  /**
   * 테스트 환경에서 ViewModel 접근을 위한 정적 메서드
   */
  static getViewModel(): UnifiedCrawlingProgressViewModel | null {
    return this._instance ? this._instance._viewModel : null;
  }

  /**
   * 진행 상태 업데이트 (통합 메서드)
   */
  updateProgress(progress: Partial<CrawlingProgress>): void {
    this._viewModel.updateFromRawProgress(progress);
  }

  /**
   * 디버깅용 상태 조회
   */
  getDebugInfo(): object {
    return {
      store: 'ProgressStore',
      viewModel: this._viewModel.debugState
    };
  }
}

// 싱글톤 인스턴스 생성 및 내보내기
export const progressStore = new ProgressStore();

/**
 * React Hook: ViewModel 접근
 */
export function useProgressViewModel(): UnifiedCrawlingProgressViewModel {
  return progressStore.viewModel;
}
