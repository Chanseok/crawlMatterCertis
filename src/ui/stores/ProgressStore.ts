import { CrawlingProgressViewModel } from '../viewModels/CrawlingProgressViewModel.js';
import type { CrawlingProgress } from '../../../types.js';

/**
 * 전역 진행 상태 Store
 * 애플리케이션 전체에서 하나의 ViewModel 인스턴스를 공유
 */
class ProgressStore {
  private _viewModel: CrawlingProgressViewModel;

  constructor() {
    this._viewModel = new CrawlingProgressViewModel();
    
    // 개발 환경에서 디버깅 용도
    if (typeof window !== 'undefined') {
      (window as any).__progressStore = this;
    }
  }

  /**
   * ViewModel 인스턴스 반환
   */
  get viewModel(): CrawlingProgressViewModel {
    return this._viewModel;
  }

  /**
   * 진행 상태 업데이트
   */
  updateProgress(progress: Partial<CrawlingProgress>): void {
    this._viewModel.updateProgress(progress);
  }

  /**
   * 현재 진행 상태의 디버그 정보 반환
   */
  getDebugInfo(): object {
    return this._viewModel.debugInfo;
  }
}

// 싱글톤 인스턴스 생성 및 내보내기
export const progressStore = new ProgressStore();
export type { ProgressStore };
