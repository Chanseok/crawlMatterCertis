import { useStore } from '@nanostores/react'
import { crawlingProgressStore, crawlingStatusStore } from '../stores';
import { format } from 'date-fns';

/**
 * 크롤링 진행 상황을 시각적으로 보여주는 대시보드 컴포넌트
 */
export function CrawlingDashboard() {
  const progress = useStore(crawlingProgressStore);
  const status = useStore(crawlingStatusStore);
  
  // 시간 형식 변환 함수
  const formatDuration = (milliseconds: number | undefined): string => {
    if (!milliseconds) return '0초';
    
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}시간 ${minutes % 60}분 ${seconds % 60}초`;
    } else if (minutes > 0) {
      return `${minutes}분 ${seconds % 60}초`;
    } else {
      return `${seconds}초`;
    }
  };
  
  // 상태에 따른 배지 컬러 선택
  const getStatusBadgeColor = () => {
    switch (status) {
      case 'running':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'completed':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'error':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      case 'paused':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  };
  
  // 단계별 표시 헬퍼 함수
  const getStageBadge = () => {
    if (progress.currentStage === 1) {
      return (
        <span className="px-2 py-1 text-xs font-medium rounded-md bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300">
          1단계: 제품 목록 수집
        </span>
      );
    } else if (progress.currentStage === 2) {
      return (
        <span className="px-2 py-1 text-xs font-medium rounded-md bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300">
          2단계: 제품 상세 정보 수집
        </span>
      );
    }
    return (
      <span className="px-2 py-1 text-xs font-medium rounded-md bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
        대기 중
      </span>
    );
  };
  
  // 재시도 정보 표시
  const getRetryInfo = () => {
    const hasRetryInfo = progress && 
      (progress.retryCount !== undefined || 
       progress.retryItem !== undefined);
       
    if (!hasRetryInfo) return null;
    
    return (
      <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/30 rounded-md border border-yellow-200 dark:border-yellow-800">
        <div className="text-sm text-yellow-800 dark:text-yellow-300 flex justify-between">
          <span>재시도:</span>
          <span>{progress.retryCount || 0}/{progress.maxRetries || '?'}</span>
        </div>
        {progress.retryItem && (
          <div className="text-sm text-yellow-700 dark:text-yellow-400 mt-1 truncate">
            항목: {progress.retryItem}
          </div>
        )}
      </div>
    );
  };
  
  // 추정 시간 계산
  const getEstimatedEndTime = () => {
    if (!progress.estimatedEndTime) return null;
    
    const endTime = new Date(progress.estimatedEndTime);
    return (
      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        예상 완료 시간: {format(endTime, 'HH:mm:ss')}
      </div>
    );
  };
  
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-gray-800 dark:text-white">크롤링 상태</h2>
        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusBadgeColor()}`}>
          {status === 'idle' && '대기중'}
          {status === 'running' && '실행중'}
          {status === 'paused' && '일시정지'}
          {status === 'completed' && '완료'}
          {status === 'error' && '오류'}
          {status === 'stopped' && '중단됨'}
          {status === 'initializing' && '초기화중'}
        </span>
      </div>
      
      {/* 현재 단계 표시 */}
      <div className="mb-4 flex justify-between items-center">
        <span className="text-sm text-gray-600 dark:text-gray-400">현재 단계:</span>
        {getStageBadge()}
      </div>
      
      <div className="mb-2">
        <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
          <span>{progress.currentStep || '대기 중...'}</span>
          <span>{progress.percentage !== undefined ? `${progress.percentage.toFixed(1)}%` : '0%'}</span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mt-1">
          <div
            className="bg-blue-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress.percentage || 0}%` }}
          ></div>
        </div>
      </div>
      
      {/* 정보 그리드 */}
      <div className="grid grid-cols-2 gap-2 mt-4">
        {/* 페이지 정보 */}
        <div className="p-2 bg-gray-50 dark:bg-gray-700 rounded-md">
          <div className="text-xs text-gray-500 dark:text-gray-400">페이지</div>
          <div className="text-sm font-medium mt-1">
            {progress.currentPage || 0} / {progress.totalPages || 0}
          </div>
        </div>
        
        {/* 항목 정보 */}
        <div className="p-2 bg-gray-50 dark:bg-gray-700 rounded-md">
          <div className="text-xs text-gray-500 dark:text-gray-400">처리 항목</div>
          <div className="text-sm font-medium mt-1">
            {progress.processedItems || 0} / {progress.totalItems || 0}
          </div>
        </div>
        
        {/* 소요 시간 */}
        <div className="p-2 bg-gray-50 dark:bg-gray-700 rounded-md">
          <div className="text-xs text-gray-500 dark:text-gray-400">소요 시간</div>
          <div className="text-sm font-medium mt-1">
            {formatDuration(progress.elapsedTime)}
          </div>
        </div>
        
        {/* 예상 남은 시간 */}
        <div className="p-2 bg-gray-50 dark:bg-gray-700 rounded-md">
          <div className="text-xs text-gray-500 dark:text-gray-400">예상 남은 시간</div>
          <div className="text-sm font-medium mt-1">
            {formatDuration(progress.remainingTime)}
          </div>
        </div>
      </div>
      
      {/* 수집 결과 요약 */}
      {(progress.newItems !== undefined || progress.updatedItems !== undefined) && (
        <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-md">
          <div className="text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">수집 결과</div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">신규 항목</div>
              <div className="text-sm font-medium text-green-600 dark:text-green-400">
                {progress.newItems || 0}개
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">업데이트 항목</div>
              <div className="text-sm font-medium text-blue-600 dark:text-blue-400">
                {progress.updatedItems || 0}개
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* 재시도 정보 */}
      {getRetryInfo()}
      
      {/* 예상 완료 시간 */}
      {getEstimatedEndTime()}
      
      {/* 상태 메시지 */}
      {progress.message && (
        <div className="mt-4 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-md border border-blue-100 dark:border-blue-800 text-sm text-blue-800 dark:text-blue-300">
          {progress.message}
        </div>
      )}
      
      {progress.criticalError && (
        <div className="mt-4 p-2 bg-red-50 dark:bg-red-900/20 rounded-md border border-red-100 dark:border-red-800 text-sm text-red-800 dark:text-red-300">
          오류: {progress.criticalError}
        </div>
      )}
    </div>
  );
}