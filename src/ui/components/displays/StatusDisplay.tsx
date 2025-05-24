/**
 * StatusDisplay.tsx
 * Clean Component: 크롤링 상태 표시 전용 컴포넌트
 * 
 * 책임:
 * - 크롤링 상태의 일관된 표시
 * - ViewModel에서 데이터 직접 참조
 * - 오류/완료/진행 상태에 따른 정확한 UI 표시
 */

import { observer } from 'mobx-react-lite';
import { useProgressViewModel } from '../../hooks/useProgressViewModel';

/**
 * 크롤링 상태 표시 컴포넌트
 * ViewModel의 statusDisplay를 기반으로 일관된 UI 제공
 */
export const StatusDisplay = observer(() => {
  const viewModel = useProgressViewModel();
  const { text, className, iconType, isError, isComplete, showErrorButton } = viewModel.statusDisplay;
  
  // 아이콘 렌더링
  const renderIcon = () => {
    const iconClass = "w-5 h-5 mr-2";
    
    switch (iconType) {
      case 'success':
        return (
          <svg className={`${iconClass} text-green-600 dark:text-green-400`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'error':
        return (
          <svg className={`${iconClass} text-red-600 dark:text-red-400`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        );
      case 'loading':
        return (
          <svg className={`${iconClass} text-blue-600 dark:text-blue-400 animate-spin`} fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        );
      case 'idle':
      default:
        return (
          <svg className={`${iconClass} text-gray-600 dark:text-gray-400`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
        );
    }
  };

  // 오류 상세 버튼 핸들러
  const handleErrorDetails = () => {
    console.log('[StatusDisplay] Show error details clicked');
    // TODO: 오류 상세 모달 또는 로그 표시
  };

  return (
    <div className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
      isError ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' :
      isComplete ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' :
      'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
    }`}>
      {/* 상태 표시 */}
      <div className="flex items-center">
        {renderIcon()}
        <span className={`font-medium ${className}`}>
          {text}
        </span>
      </div>
      
      {/* 액션 버튼 */}
      {showErrorButton && (
        <button 
          onClick={handleErrorDetails}
          className="text-xs px-3 py-1 bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-900/70 transition-colors"
        >
          상세 정보
        </button>
      )}
      
      {/* 완료 배지 */}
      {isComplete && !isError && (
        <div className="text-xs px-2 py-1 bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 rounded">
          ✓ 완료
        </div>
      )}
    </div>
  );
});

StatusDisplay.displayName = 'StatusDisplay';
