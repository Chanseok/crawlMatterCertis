/**
 * useProgressViewModel.ts
 * ViewModel 접근을 위한 React Hook
 */

import { progressStore } from '../stores/ProgressStore';
import type { UnifiedCrawlingProgressViewModel } from '../viewModels/UnifiedCrawlingProgressViewModel';

/**
 * UnifiedCrawlingProgressViewModel에 접근하기 위한 Hook
 * @returns UnifiedCrawlingProgressViewModel 인스턴스
 */
export function useProgressViewModel(): UnifiedCrawlingProgressViewModel {
  return progressStore.viewModel;
}
