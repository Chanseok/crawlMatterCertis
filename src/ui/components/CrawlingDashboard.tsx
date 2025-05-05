import { useStore } from '@nanostores/react'
import { crawlingProgressStore, crawlingStatusStore, configStore, crawlingStatusSummaryStore } from '../stores';
import { format } from 'date-fns';
import { useEffect, useState, useRef } from 'react';

/**
 * 크롤링 진행 상황을 시각적으로 보여주는 대시보드 컴포넌트
 */
export function CrawlingDashboard() {
  const progress = useStore(crawlingProgressStore);
  const status = useStore(crawlingStatusStore);
  const config = useStore(configStore);
  const statusSummary = useStore(crawlingStatusSummaryStore);
  
  // 실제 수집 대상 페이지 수 계산 (상태 요약 정보에서 가져옴)
  const targetPageCount = statusSummary?.crawlingRange?.endPage || config.pageRangeLimit || progress.totalPages || 0;
  
  // 애니메이션을 위한 상태
  const [animatedValues, setAnimatedValues] = useState({
    percentage: 0,
    currentPage: 0,
    processedItems: 0,
    newItems: 0,
    updatedItems: 0,
    retryCount: 0
  });

  // 1초 단위 타이머를 위한 상태
  const [localTime, setLocalTime] = useState({
    elapsedTime: progress.elapsedTime || 0,
    remainingTime: progress.remainingTime || 0
  });
  
  // 모래시계 애니메이션을 위한 상태
  const [flipTimer, setFlipTimer] = useState(0);
  
  // 완료 상태 표시를 위한 상태
  const [showCompletion, setShowCompletion] = useState(false);
  const [isSuccess, setIsSuccess] = useState(true);
  
  // 완료 상태 애니메이션을 위한 타이머
  const completionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // 1초 단위로 시간 업데이트
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    
    if (status === 'running') {
      // 타이머 시작
      timer = setInterval(() => {
        setLocalTime(prev => {
          // 현재 진행률에 따라 남은 시간 재계산
          let newRemainingTime = prev.remainingTime;
          
          if (progress.currentStage === 1) {
            // 1단계에서 페이지 기준 예상 계산
            const totalPages = targetPageCount || 1;
            const currentPage = progress.currentPage || 0;
            const remainingPages = totalPages - currentPage;
            
            if (currentPage > 0 && prev.elapsedTime > 0) {
              // 현재까지 처리한 페이지 당 평균 소요 시간 계산
              const avgTimePerPage = prev.elapsedTime / currentPage;
              // 남은 페이지에 예상 소요 시간 계산
              newRemainingTime = Math.max(0, remainingPages * avgTimePerPage);
            }
          } else if (progress.currentStage === 2) {
            // 2단계에서 제품 기준 예상 계산
            const totalItems = progress.totalItems || 
                             statusSummary?.siteProductCount || 
                             (targetPageCount * (config.productsPerPage || 12));
            const processedItems = progress.processedItems || 0;
            const remainingItems = totalItems - processedItems;
            
            if (processedItems > 0 && prev.elapsedTime > 0) {
              // 현재까지 처리한 제품 당 평균 소요 시간 계산
              const avgTimePerItem = prev.elapsedTime / processedItems;
              // 남은 제품에 예상 소요 시간 계산
              newRemainingTime = Math.max(0, remainingItems * avgTimePerItem);
            }
          }
          
          return {
            elapsedTime: prev.elapsedTime + 1000,
            remainingTime: newRemainingTime
          };
        });
        
        // 10초 간격으로 모래시계 뒤집기
        setFlipTimer(prev => {
          const newValue = prev + 1;
          return newValue;
        });
      }, 1000);
    }
    
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [status, progress.currentPage, progress.currentStage, progress.processedItems, progress.totalItems, targetPageCount, config.productsPerPage, statusSummary]);
  
  // 진행 상태가 업데이트되면 로컬 타이머 동기화
  useEffect(() => {
    if (progress.elapsedTime !== undefined) {
      setLocalTime(prev => ({
        ...prev,
        elapsedTime: progress.elapsedTime
      }));
    }
    if (progress.remainingTime !== undefined) {
      setLocalTime(prev => ({
        ...prev,
        // 명시적으로 타입 체크 후 할당
        remainingTime: progress.remainingTime || 0
      }));
    }
  }, [progress.elapsedTime, progress.remainingTime]);
  
  // 상태 완료/실패 감지 및 애니메이션 처리
  useEffect(() => {
    // 상태가 완료로 변경된 경우
    if (status === 'completed' && progress.currentStage === 2) {
      // 실제 데이터로 성공/실패 여부 판단
      const totalItems = progress.totalItems || statusSummary?.siteProductCount || (targetPageCount * (config.productsPerPage || 12));
      const processedItems = progress.processedItems || 0;
      const isCompleteSuccess = processedItems >= totalItems;
      
      setIsSuccess(isCompleteSuccess);
      setShowCompletion(true);
      
      // 애니메이션 표시를 위한 타이머 설정
      if (completionTimerRef.current) {
        clearTimeout(completionTimerRef.current);
      }
      
      // 성공 시 10초, 실패 시 5초 동안 표시
      completionTimerRef.current = setTimeout(() => {
        setShowCompletion(false);
      }, isCompleteSuccess ? 10000 : 5000);
    } else {
      setShowCompletion(false);
    }
    
    return () => {
      if (completionTimerRef.current) {
        clearTimeout(completionTimerRef.current);
      }
    };
  }, [status, progress.currentStage, progress.processedItems, progress.totalItems]);

  const [animatedDigits, setAnimatedDigits] = useState({
    currentPage: false,
    retryCount: false,
    newItems: false,
    updatedItems: false
  });

  // 단계 전환 애니메이션을 위한 상태
  const [prevStage, setPrevStage] = useState<number | null>(null);
  const [stageTransition, setStageTransition] = useState(false);
  
  // 단계 변경 감지 및 애니메이션 처리
  useEffect(() => {
    if (prevStage !== null && prevStage !== progress.currentStage) {
      // 단계 전환 애니메이션 시작
      setStageTransition(true);
      
      // 애니메이션 종료 후 상태 리셋
      setTimeout(() => {
        setStageTransition(false);
      }, 1000); // 애니메이션 시간과 맞춤
    }
    
    // 명시적으로 타입 체크 후 할당
    if (progress.currentStage !== undefined) {
      setPrevStage(progress.currentStage);
    }
  }, [progress.currentStage]);

  // 애니메이션 효과를 위한 useEffect
  const prevProgress = useRef(progress);
  useEffect(() => {
    // 값이 변경되었을 때만 애니메이션 적용
    if (prevProgress.current) {
      // 1단계: 페이지 수집 진행 상태
      if (progress.currentPage !== prevProgress.current.currentPage) {
        setAnimatedDigits(prev => ({ ...prev, currentPage: true }));
        setTimeout(() => setAnimatedDigits(prev => ({ ...prev, currentPage: false })), 300);
      }
      
      // 2단계: 제품 상세 수집 진행 상태
      if (progress.processedItems !== prevProgress.current.processedItems) {
        setAnimatedDigits(prev => ({ ...prev, processedItems: true }));
        setTimeout(() => setAnimatedDigits(prev => ({ ...prev, processedItems: false })), 300);
      }

      if (progress.retryCount !== prevProgress.current.retryCount) {
        setAnimatedDigits(prev => ({ ...prev, retryCount: true }));
        setTimeout(() => setAnimatedDigits(prev => ({ ...prev, retryCount: false })), 300);
      }
      
      if (progress.elapsedTime !== prevProgress.current.elapsedTime) {
        setAnimatedDigits(prev => ({ ...prev, elapsedTime: true }));
        setTimeout(() => setAnimatedDigits(prev => ({ ...prev, elapsedTime: false })), 300);
      }
      
      if (progress.remainingTime !== prevProgress.current.remainingTime) {
        setAnimatedDigits(prev => ({ ...prev, remainingTime: true }));
        setTimeout(() => setAnimatedDigits(prev => ({ ...prev, remainingTime: false })), 300);
      }
    }
    
    prevProgress.current = progress;
  }, [progress]);

  // 애니메이션을 위한 참조
  const animationRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // 계산된 진행률 - 수집한 페이지 / 실제 수집 대상 총 페이지 수
  const calculatedPercentage = targetPageCount > 0 ? 
    (progress.currentPage || 0) / targetPageCount * 100 : 
    progress.percentage || 0;
  
  // 애니메이션 효과
  useEffect(() => {
    // 이전 애니메이션 정리
    if (animationRef.current) {
      clearInterval(animationRef.current);
    }
    
    // 목표값 설정
    const targetValues = {
      percentage: progress.currentStage === 1 ? calculatedPercentage : (progress.percentage || 0),
      currentPage: progress.currentPage || 0,
      processedItems: progress.processedItems || 0,
      newItems: progress.newItems || 0,
      updatedItems: progress.updatedItems || 0,
      retryCount: progress.retryCount || 0
    };
    
    // 애니메이션 시작값
    const startValues = {...animatedValues};
    
    // 애니메이션 단계 설정
    const steps = 8;
    let step = 0;
    
    // 애니메이션 시작
    animationRef.current = setInterval(() => {
      step++;
      if (step >= steps) {
        setAnimatedValues(targetValues);
        clearInterval(animationRef.current!);
        return;
      }
      
      // 값 보간 (부드러운 전환을 위한 ease-out 효과 적용)
      const progress = 1 - Math.pow(1 - step / steps, 2); // ease-out 효과
      
      const newValues = {
        percentage: startValues.percentage + (targetValues.percentage - startValues.percentage) * progress,
        currentPage: startValues.currentPage + (targetValues.currentPage - startValues.currentPage) * progress,
        processedItems: startValues.processedItems + Math.round((targetValues.processedItems - startValues.processedItems) * progress),
        newItems: startValues.newItems + Math.round((targetValues.newItems - startValues.newItems) * progress),
        updatedItems: startValues.updatedItems + Math.round((targetValues.updatedItems - startValues.updatedItems) * progress),
        retryCount: startValues.retryCount + Math.round((targetValues.retryCount - startValues.retryCount) * progress)
      };
      
      setAnimatedValues(newValues);
    }, 40); // 더 부드러운 애니메이션을 위해 간격 축소
    
    return () => {
      if (animationRef.current) {
        clearInterval(animationRef.current);
      }
    };
  }, [progress.percentage, progress.currentPage, progress.processedItems, progress.newItems, progress.updatedItems, progress.retryCount, calculatedPercentage]);
  
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
        <span className={`px-2 py-1 text-xs font-medium rounded-md bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300 ${stageTransition ? 'animate-stage-transition' : ''}`}>
          1/2단계: 제품 목록 수집
        </span>
      );
    } else if (progress.currentStage === 2) {
      return (
        <span className={`px-2 py-1 text-xs font-medium rounded-md bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300 ${stageTransition ? 'animate-stage-transition' : ''}`}>
          2/2단계: 제품 상세 정보 수집
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
          <span className={`${animatedDigits.retryCount ? 'animate-pulse' : ''}`}>
            {animatedValues.retryCount || 0}/{progress.maxRetries || config.productListRetryCount || '?'}
          </span>
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

  // 페이지 정보 컴포넌트
  const getPageInfoComponent = () => {
    const currentStage = progress.currentStage;
    const isCompleted = status === 'completed';
    
    // 2단계가 완료되었을 때 레이블 특별히 처리
    if (currentStage === 2 && isCompleted) {
      const totalItems = progress.totalItems || 
                        statusSummary?.siteProductCount || 
                        (targetPageCount * (config.productsPerPage || 12));
      const processedItems = progress.processedItems || 0;
      const isSuccessful = processedItems >= totalItems;
      
      return (
        <div className="p-2 bg-gray-50 dark:bg-gray-700 rounded-md">
          <div className={`text-xs ${isSuccessful ? 'text-green-500 dark:text-green-400' : 'text-red-500 dark:text-red-400'} font-medium`}>
            {isSuccessful ? "제품 상세 수집 완료" : "제품 상세 수집 실패"}
          </div>
          <div className={`text-2xl font-digital font-medium mt-1 transition-all transform duration-300 ${animatedDigits.currentPage ? 'animate-flip' : ''}`} style={{
            color: isSuccessful ? '#10b981' : '#ef4444'
          }}>
            {Math.round(processedItems)} <span className="text-sm text-gray-500">/ {totalItems}</span>
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {isSuccessful 
              ? `모든 제품 정보가 성공적으로 수집되었습니다.` 
              : `일부 제품 정보를 수집하지 못했습니다.`}
          </div>
        </div>
      );
    }
    
    // 일반적인 상황 (진행 중이거나 1단계)
    return (
      <div className="p-2 bg-gray-50 dark:bg-gray-700 rounded-md">
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {progress.currentStage === 1 ? "페이지 수집 현황(Buggy)" : "제품 상세 수집 현황"}
        </div>
        <div className={`text-2xl font-bold font-digital mt-1 transition-all transform duration-300 ${animatedDigits.currentPage ? 'animate-flip' : ''}`} style={{
          color: animatedValues.currentPage > 0 ? '#3b82f6' : '#6b7280'
        }}>
          {progress.currentStage === 1 
            ? Math.round(animatedValues.currentPage) 
            : Math.round(animatedValues.processedItems)}
          <span className="text-sm text-gray-500"> / {
            progress.currentStage === 2 
              ? progress.totalItems || statusSummary?.siteProductCount || (targetPageCount * (config.productsPerPage || 12)) 
              : targetPageCount
          }</span>
        </div>
        {progress.currentStage === 1 && progress.totalPages && progress.totalPages > 0 && targetPageCount !== progress.totalPages && (
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            사이트 전체: {progress.totalPages}페이지
          </div>
        )}
        {progress.currentStage === 2 && (
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            예상 제품 수: {statusSummary?.siteProductCount || (targetPageCount * (config.productsPerPage || 12))}개
          </div>
        )}
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
          <span className="font-medium transition-all duration-300">
            {animatedValues.percentage !== undefined ? `${animatedValues.percentage.toFixed(1)}%` : '0%'}
          </span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 mt-1">
          <div
            className="bg-blue-500 h-3 rounded-full transition-all duration-300 relative overflow-hidden"
            style={{ width: `${animatedValues.percentage || 0}%` }}
          >
            {/* 프로그레스바 내부에 움직이는 애니메이션 효과 */}
            <div className="absolute inset-0 overflow-hidden">
              <div className="animate-pulse-light bg-white/30 h-full w-1/4 skew-x-12 transform -translate-x-full animate-progress-wave"></div>
            </div>
          </div>
        </div>
        
        {/* 단계별 부가 정보 */}
        {progress.currentStage === 1 && (
          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
            <span>
              {progress.currentPage || 0}번 페이지 ({Math.round((progress.currentPage || 0) / targetPageCount * 100)}%)
            </span>
            <span>
              범위: 1~{targetPageCount}
            </span>
          </div>
        )}
      </div>
      
      {/* 정보 그리드 */}
      <div className="grid grid-cols-2 gap-2 mt-4">
        {/* 페이지 정보 */}
        {getPageInfoComponent()}
        
        {/* 재시도 정보 */}
        <div className="p-2 bg-gray-50 dark:bg-gray-700 rounded-md">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {progress.currentStage === 1 ? "재시도 진행 상태" : "제품 상세 재시도"}
          </div>
          <div className={`text-2xl font-bold font-digital mt-1 transition-all transform duration-300 ${animatedDigits.retryCount ? 'animate-flip' : ''}`} style={{
            color: animatedValues.retryCount > 0 ? '#f59e0b' : '#6b7280'
          }}>
            {animatedValues.retryCount} <span className="text-sm text-gray-500">/ {
              progress.currentStage === 1 
                ? config.productListRetryCount || progress.maxRetries || 0
                : config.productDetailRetryCount || progress.maxRetries || 0
            }회</span>
          </div>
          {progress.retryItem && (
            <div className="text-xs text-amber-600 dark:text-amber-400 mt-1 truncate">
              현재: {progress.retryItem.substring(0, 20)}{progress.retryItem.length > 20 ? '...' : ''}
            </div>
          )}
        </div>
        
        {/* 소요 시간 */}
        <div className="p-2 bg-gray-50 dark:bg-gray-700 rounded-md">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {progress.currentStage === 1 ? "1단계 소요 시간" : progress.currentStage === 2 ? "2단계 소요 시간" : "소요 시간"}
          </div>
          <div className="text-xl font-bold mt-1 text-gray-700 dark:text-gray-300 font-digital flex items-center justify-center">
            {formatDuration(localTime.elapsedTime)}
            <div className={`ml-2 ${flipTimer % 2 === 0 ? 'opacity-100' : 'opacity-0'} transition-opacity duration-500`}>
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>
        
        {/* 예상 남은 시간 */}
        <div className="p-2 bg-gray-50 dark:bg-gray-700 rounded-md">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {progress.currentStage === 1 ? "1단계 예상 남은 시간" : progress.currentStage === 2 ? "2단계 예상 남은 시간" : "예상 남은 시간"}
          </div>
          <div className="text-xl font-bold mt-1 text-gray-700 dark:text-gray-300 font-digital flex items-center justify-center">
            {formatDuration(localTime.remainingTime)}
            <div className={`ml-2 ${flipTimer % 2 === 0 ? 'opacity-100 rotate-0' : 'opacity-70 rotate-180'} transition-all duration-500`}>
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>
      </div>
      
      {/* 수집 결과 요약 - 2단계(제품 상세 정보 수집)에서만 표시 */}
      {progress.currentStage === 2 && (progress.newItems !== undefined || progress.updatedItems !== undefined) && (
        <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-md">
          <div className="text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">수집 결과</div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">신규 항목</div>
              <div className={`font-digital text-2xl font-bold text-green-600 dark:text-green-400 transition-all duration-300 ${animatedDigits.newItems ? 'animate-flip' : ''}`}>
                {Math.round(animatedValues.newItems)}
                <span className="text-sm text-gray-500">개</span>
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">업데이트 항목</div>
              <div className={`font-digital text-2xl font-bold text-blue-600 dark:text-blue-400 transition-all duration-300 ${animatedDigits.updatedItems ? 'animate-flip' : ''}`}>
                {Math.round(animatedValues.updatedItems)}
                <span className="text-sm text-gray-500">개</span>
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
          {progress.currentStage === 1 && targetPageCount ? 
            `${progress.message} (목표 페이지: ${targetPageCount}페이지)` : 
            progress.message
          }
        </div>
      )}
      
      {progress.criticalError && (
        <div className="mt-4 p-2 bg-red-50 dark:bg-red-900/20 rounded-md border border-red-100 dark:border-red-800 text-sm text-red-800 dark:text-red-300">
          오류: {progress.criticalError}
        </div>
      )}
      
      {/* 모래시계 애니메이션 */}
      {status === 'running' && (
        <div className="mt-4 flex justify-center items-center">
          <div className={`relative w-8 h-12 ${flipTimer % 10 === 0 ? 'animate-flip-hourglass' : ''}`}>
            <div className="absolute top-0 left-0 right-0 h-1/2 bg-amber-200 dark:bg-amber-700 overflow-hidden rounded-t-lg">
              <div className="absolute bottom-0 left-1/4 right-1/4 border-l-transparent border-r-transparent border-t-amber-400 dark:border-t-amber-500" 
                   style={{ borderWidth: '8px 8px 0 8px', height: 0, width: 0 }}></div>
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-amber-200 dark:bg-amber-700 overflow-hidden rounded-b-lg">
              <div className="absolute top-0 left-1/4 right-1/4 border-l-transparent border-r-transparent border-b-amber-400 dark:border-b-amber-500" 
                   style={{ borderWidth: '0 8px 8px 8px', height: 0, width: 0 }}></div>
              <div className="absolute top-1/3 left-0 right-0 bottom-0 bg-amber-300 dark:bg-amber-600 animate-sand-fall"></div>
            </div>
            <div className="absolute inset-0 border-2 border-amber-500 dark:border-amber-400 rounded-lg"></div>
          </div>
        </div>
      )}
      
      {/* 2단계 완료 상태 애니메이션 */}
      {showCompletion && (
        <div className={`relative mt-4 p-4 rounded-md text-center ${isSuccess ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
          {/* 성공 시 꽃가루 효과 */}
          {isSuccess && (
            <div className="confetti-container">
              {[...Array(50)].map((_, i) => {
                const randomX = Math.random() * 100;
                const randomDelay = Math.random() * 3;
                const randomColor = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'][Math.floor(Math.random() * 6)];
                const randomSize = Math.random() * 10 + 5;
                
                return (
                  <div
                    key={i}
                    className="confetti absolute animate-confetti"
                    style={{
                      left: `${randomX}%`,
                      top: '-20px',
                      width: `${randomSize}px`,
                      height: `${randomSize}px`,
                      backgroundColor: randomColor,
                      animationDelay: `${randomDelay}s`,
                      transform: `rotate(${Math.random() * 360}deg)`
                    }}
                  />
                );
              })}
            </div>
          )}
          
          <div className={isSuccess ? 'success-message animate-bounce-small' : 'failure-message animate-shake'}>
            <div className="text-lg font-bold mb-2 flex justify-center items-center">
              {isSuccess ? (
                <>
                  <svg className="w-6 h-6 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  수집 완료!
                </>
              ) : (
                <>
                  <svg className="w-6 h-6 text-red-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  수집 실패!
                </>
              )}
            </div>
            <div className={`text-base ${isSuccess ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
              {isSuccess ? 
                <span>제품 상세 수집이 성공적으로 완료되었습니다.</span> : 
                <span>일부 제품 정보를 수집하지 못했습니다.</span>
              }
            </div>
            <div className="mt-4 inline-block px-4 py-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
              <div className="text-lg font-bold">
                {Math.round(progress.processedItems || 0)} / {
                  progress.totalItems || 
                  statusSummary?.siteProductCount || 
                  (targetPageCount * (config.productsPerPage || 12))
                } 제품 수집 완료
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}