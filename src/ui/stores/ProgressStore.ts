import { CrawlingProgressViewModel } from '../viewModels/UnifiedCrawlingProgressViewModel.js';
import type { CrawlingProgress } from '../../../types.js';

/**
 * Clean Architecture 기반 통합 Progress Store
 * 단일 ViewModel 인스턴스 전역 관리
 */
class ProgressStore {
  private _viewModel: CrawlingProgressViewModel;

  constructor() {
    this._viewModel = new CrawlingProgressViewModel();
    console.log('[ProgressStore] Unified ViewModel initialized');
    
    // 개발 환경에서 디버깅 용도
    if (typeof window !== 'undefined') {
      (window as any).__progressStore = this;
    }
  }

  /**
   * 단일 ViewModel 인스턴스 반환
   */
  get viewModel(): CrawlingProgressViewModel {
    return this._viewModel;
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
export function useProgressViewModel(): CrawlingProgressViewModel {
  return progressStore.viewModel;
}

export type { ProgressStore };
