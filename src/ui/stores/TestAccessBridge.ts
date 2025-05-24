/**
 * TestAccessBridge.ts
 * 테스트 환경에서 내부 상태에 접근하기 위한 브릿지
 * 
 * 개발 또는 테스트 환경에서만 사용해야 합니다.
 */

import { UnifiedCrawlingProgressViewModel } from '../viewModels/UnifiedCrawlingProgressViewModel';
import { progressStore } from './ProgressStore';

// 전역 네임스페이스에 테스트용 상태 저장
declare global {
  interface Window {
    __APP_STATE__?: {
      progressViewModel?: UnifiedCrawlingProgressViewModel;
    };
  }
}

/**
 * ViewModel 인스턴스를 테스트에서 접근 가능하도록 등록
 * @param viewModel 테스트에 노출할 ViewModel 인스턴스
 */
export function registerViewModelForTesting(viewModel: UnifiedCrawlingProgressViewModel): void {
  // 브라우저 환경에서만 실행
  if (typeof window !== 'undefined') {
    if (!window.__APP_STATE__) {
      window.__APP_STATE__ = {};
    }
    window.__APP_STATE__.progressViewModel = viewModel;
    
    console.log('[TestAccessBridge] ViewModel registered for testing');
  }
}

/**
 * Node.js 테스트 환경에서 ViewModel에 접근하기 위한 정적 메서드들
 */
export class TestAccessBridge {
  /**
   * ViewModel 인스턴스 가져오기
   */
  static getViewModel(): UnifiedCrawlingProgressViewModel | null {
    return progressStore.viewModel;
  }
  
  /**
   * 테스트용 크롤링 진행 업데이트 전송
   */
  static updateProgress(data: any): void {
    const viewModel = this.getViewModel();
    if (viewModel) {
      viewModel.updateFromRawProgress(data);
    } else {
      console.error('[TestAccessBridge] ViewModel not available');
    }
  }
  
  /**
   * 테스트용 크롤링 완료 이벤트 전송
   */
  static markComplete(): void {
    const viewModel = this.getViewModel();
    if (viewModel) {
      viewModel.markComplete();
    } else {
      console.error('[TestAccessBridge] ViewModel not available');
    }
  }
}
