/**
 * TimeDisplay.tsx
 * Clean Component: 시간 정보 표시 전용 컴포넌트
 * 
 * 책임:
 * - 경과/남은 시간의 일관된 표시
 * - ViewModel에서 데이터 직접 참조
 * - 완료 상태에 따른 정확한 시간 표시
 */

import { observer } from 'mobx-react-lite';
import { useProgressViewModel } from '../../stores/ProgressStore';

/**
 * 시간 정보 표시 컴포넌트
 * ViewModel의 timeDisplay를 기반으로 일관된 UI 제공
 */
export const TimeDisplay = observer(() => {
  const viewModel = useProgressViewModel();
  const { elapsed, remainingDisplay } = viewModel.timeDisplay;
  const { isComplete, isIdle } = viewModel.statusDisplay;
  
  // 경과 시간 포맷
  const formatElapsed = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}시간 ${minutes % 60}분`;
    } else if (minutes > 0) {
      return `${minutes}분 ${seconds % 60}초`;
    } else {
      return `${seconds}초`;
    }
  };

  const elapsedDisplay = formatElapsed(elapsed);

  return (
    <div className="space-y-2">
      {/* 경과 시간 */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-600 dark:text-gray-400">
          경과 시간:
        </span>
        <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
          {elapsedDisplay}
        </span>
      </div>
      
      {/* 남은 시간 */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-600 dark:text-gray-400">
          예상 남은 시간:
        </span>
        <span className={`text-sm font-medium ${
          isComplete ? 'text-green-600 dark:text-green-400' :
          isIdle ? 'text-gray-500 dark:text-gray-400' :
          'text-blue-600 dark:text-blue-400'
        }`}>
          {remainingDisplay}
        </span>
      </div>
      
      {/* 완료 시간 정보 */}
      {isComplete && (
        <div className="pt-1 border-t border-gray-200 dark:border-gray-700">
          <div className="text-xs text-green-600 dark:text-green-400">
            총 소요 시간: {elapsedDisplay}
          </div>
        </div>
      )}
    </div>
  );
});

TimeDisplay.displayName = 'TimeDisplay';
