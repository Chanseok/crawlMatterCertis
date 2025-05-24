/**
 * ProgressBarDisplay.tsx
 * Clean Component: 진행 상태바 표시 전용 컴포넌트
 * 
 * 책임:
 * - 진행 상태바의 일관된 표시
 * - ViewModel에서 데이터 직접 참조
 * - 완료/오류 상태에 따른 정확한 색상 표시
 */

import { observer } from 'mobx-react-lite';
import { useProgressViewModel } from '../../hooks/useProgressViewModel';

/**
 * 진행 상태바 표시 컴포넌트
 * ViewModel의 progressDisplay를 기반으로 일관된 UI 제공
 */
export const ProgressBarDisplay = observer(() => {
  const viewModel = useProgressViewModel();
  const { percentage, barColor, isComplete } = viewModel.progressDisplay;
  const { text, iconType } = viewModel.statusDisplay;
  
  // 아이콘 렌더링
  const renderIcon = () => {
    switch (iconType) {
      case 'success':
        return (
          <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        );
      case 'error':
        return (
          <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        );
      case 'loading':
        return (
          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        );
      case 'idle':
      default:
        return (
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
        );
    }
  };

  return (
    <div className="space-y-3">
      {/* 상태 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          {renderIcon()}
          <span className={`text-sm font-medium ${
            isComplete ? 'text-green-600 dark:text-green-400' :
            iconType === 'error' ? 'text-red-600 dark:text-red-400' :
            'text-blue-600 dark:text-blue-400'
          }`}>
            {text}
          </span>
        </div>
        
        <div className="text-sm text-gray-500 dark:text-gray-400">
          {percentage.toFixed(1)}%
        </div>
      </div>
      
      {/* 진행 상태바 */}
      <div className="relative">
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
          <div 
            className={`h-2.5 rounded-full transition-all duration-500 ease-out ${barColor}`}
            style={{ width: `${Math.min(percentage, 100)}%` }}
          />
        </div>
        
        {/* 진행률 텍스트 오버레이 (옵션) */}
        {percentage > 10 && (
          <div 
            className="absolute inset-0 flex items-center justify-center"
            style={{ left: `${Math.min(percentage / 2, 45)}%` }}
          >
            <span className="text-xs font-medium text-white drop-shadow-sm">
              {percentage.toFixed(0)}%
            </span>
          </div>
        )}
      </div>
      
      {/* 완료 메시지 */}
      {isComplete && (
        <div className="text-xs text-green-600 dark:text-green-400 font-medium">
          ✓ 크롤링이 성공적으로 완료되었습니다
        </div>
      )}
    </div>
  );
});

ProgressBarDisplay.displayName = 'ProgressBarDisplay';
