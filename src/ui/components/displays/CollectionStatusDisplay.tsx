/**
 * CollectionStatusDisplay.tsx
 * Clean Component: 제품 수집 현황 표시 전용 컴포넌트
 * 
 * 책임:
 * - 제품 수집 현황의 일관된 표시
 * - ViewModel에서 데이터 직접 참조
 * - UI 렌더링만 담당
 */

import { observer } from 'mobx-react-lite';
import { useProgressViewModel } from '../../hooks/useProgressViewModel';

/**
 * 제품 수집 현황 표시 컴포넌트
 * ViewModel의 collectionDisplay를 기반으로 일관된 UI 제공
 */
export const CollectionStatusDisplay = observer(() => {
  const viewModel = useProgressViewModel();
  const { processed, total, displayText, isComplete, phaseText } = viewModel.collectionDisplay;
  
  // 상태에 따른 스타일 결정
  const getStatusStyle = () => {
    if (isComplete) {
      return {
        textColor: 'text-green-600 dark:text-green-400',
        bgColor: 'bg-green-50 dark:bg-green-900/20',
        borderColor: 'border-green-200 dark:border-green-800'
      };
    } else if (processed > 0) {
      return {
        textColor: 'text-blue-600 dark:text-blue-400',
        bgColor: 'bg-blue-50 dark:bg-blue-900/20',
        borderColor: 'border-blue-200 dark:border-blue-800'
      };
    } else {
      return {
        textColor: 'text-gray-600 dark:text-gray-400',
        bgColor: 'bg-gray-50 dark:bg-gray-900/20',
        borderColor: 'border-gray-200 dark:border-gray-800'
      };
    }
  };

  const style = getStatusStyle();

  return (
    <div className={`p-3 rounded-lg border ${style.bgColor} ${style.borderColor} transition-colors`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          {/* 아이콘 */}
          <div className={`w-8 h-8 rounded-full ${style.bgColor} flex items-center justify-center mr-3`}>
            {isComplete ? (
              <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            )}
          </div>
          
          {/* 텍스트 정보 */}
          <div>
            <div className={`text-lg font-semibold ${style.textColor}`}>
              {displayText}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {phaseText} 수집 현황
            </div>
          </div>
        </div>
        
        {/* 완료 표시 */}
        {isComplete && (
          <div className="text-xs px-2 py-1 bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 rounded">
            완료
          </div>
        )}
      </div>
      
      {/* 진행률 바 (옵션) */}
      {total > 0 && (
        <div className="mt-2">
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
            <div 
              className={`h-1.5 rounded-full transition-all duration-300 ${
                isComplete ? 'bg-green-500' : 'bg-blue-500'
              }`}
              style={{ width: `${Math.min((processed / total) * 100, 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
});

CollectionStatusDisplay.displayName = 'CollectionStatusDisplay';
