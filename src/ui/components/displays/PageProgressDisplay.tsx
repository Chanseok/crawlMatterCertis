/**
 * PageProgressDisplay.tsx
 * Clean Component: 페이지 진행 상태 표시 전용 컴포넌트
 * 
 * 책임:
 * - 페이지 진행 상태의 일관된 표시
 * - ViewModel에서 데이터 직접 참조
 * - 문제 #3 해결: 페이지/제품 수 혼합 표시 방지
 */

import { observer } from 'mobx-react-lite';
import { useProgressViewModel } from '../../hooks/useProgressViewModel';

/**
 * 페이지 진행 표시 컴포넌트
 * ViewModel의 pageDisplay를 기반으로 일관된 UI 제공
 */
export const PageProgressDisplay = observer(() => {
  const viewModel = useProgressViewModel();
  const { current, total, displayText } = viewModel.pageDisplay;
  
  // 페이지가 없는 경우 렌더링 생략
  if (total <= 0) {
    return null;
  }
  
  // 상태에 따른 스타일 결정
  const getStatusStyle = () => {
    if (current >= total) {
      return {
        textColor: 'text-green-600 dark:text-green-400',
        bgColor: 'bg-green-50 dark:bg-green-900/20',
        borderColor: 'border-green-200 dark:border-green-800'
      };
    } else if (current > 0) {
      return {
        textColor: 'text-blue-600 dark:text-blue-400',
        bgColor: 'bg-blue-50 dark:bg-blue-900/20',
        borderColor: 'border-blue-200 dark:border-blue-800'
      };
    } else {
      return {
        textColor: 'text-gray-600 dark:text-gray-400',
        bgColor: 'bg-gray-50 dark:bg-gray-800/20',
        borderColor: 'border-gray-200 dark:border-gray-700'
      };
    }
  };
  
  const style = getStatusStyle();
  
  return (
    <div className="rounded-md border px-3 py-2 shadow-sm mb-3">
      <div className="flex items-center justify-between">
        {/* 아이콘 */}
        <div className="flex items-center space-x-3">
          <div className={`p-1.5 rounded-full ${style.bgColor} ${style.borderColor} border`}>
            <svg className={`w-4 h-4 ${style.textColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          
          {/* 텍스트 정보 */}
          <div>
            <div className={`text-lg font-semibold ${style.textColor}`}>
              {displayText}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              페이지 진행 상태
            </div>
          </div>
        </div>
        
        {/* 완료 표시 */}
        {current >= total && (
          <div className="text-xs px-2 py-1 bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 rounded">
            완료
          </div>
        )}
      </div>
      
      {/* 진행률 바 */}
      {total > 0 && (
        <div className="mt-2">
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
            <div 
              className={`h-1.5 rounded-full transition-all duration-300 ${
                current >= total ? 'bg-green-500' : 'bg-blue-500'
              }`}
              style={{ width: `${Math.min((current / total) * 100, 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
});

PageProgressDisplay.displayName = 'PageProgressDisplay';
