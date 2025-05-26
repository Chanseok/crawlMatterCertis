import { useEffect, useState, useRef, useCallback, useMemo, Dispatch, SetStateAction } from 'react';
import { observer } from 'mobx-react-lite';
import { ExpandableSection } from './ExpandableSection';
import StatusCheckLoadingAnimation from './StatusCheckLoadingAnimation';
import { format } from 'date-fns';
import { RetryStatusIndicator } from './RetryStatusIndicator';
import { StageTransitionIndicator } from './StageTransitionIndicator';
import { ValidationResultsPanel } from './ValidationResultsPanel';

// New Unified Components
import { CollectionStatusDisplay } from './displays/CollectionStatusDisplay';
import { ProgressBarDisplay } from './displays/ProgressBarDisplay';
import { StatusDisplay } from './displays/StatusDisplay';

import { PageProgressDisplay } from './displays/PageProgressDisplay';
import { useCrawlingStore } from '../hooks/useCrawlingStore';
import { useTaskStore } from '../hooks/useTaskStore';
import { TimeDisplay } from './displays/TimeDisplay';
import type { CrawlingStatusSummary } from '../stores/domain/CrawlingStore';


interface CrawlingDashboardProps {
  appCompareExpanded: boolean;
  setAppCompareExpanded: Dispatch<SetStateAction<boolean>>;
}

interface AnimatedValues {
  percentage: number;
  currentPage: number;
  processedItems: number;
  newItems: number;
  updatedItems: number;
  retryCount: number;
}

/**
 * 크롤링 진행 상황을 시각적으로 보여주는 대시보드 컴포넌트
 */
function CrawlingDashboard({ appCompareExpanded, setAppCompareExpanded }: CrawlingDashboardProps) {
  // Domain Store Hook을 통한 통합 진행 상태 관리
  const { 
    status,
    progress, 
    config, 
    statusSummary, 
    lastStatusSummary,
    updateProgress,
    startCrawling,
    stopCrawling,
    checkStatus,
    error,
    clearError
  } = useCrawlingStore();
  
  // Task Store Hook을 통한 동시 작업 관리
  const { concurrentTasks } = useTaskStore();

  const [localTime, setLocalTime] = useState({ elapsedTime: 0, remainingTime: 0 });
  const [flipTimer, setFlipTimer] = useState(0);
  const [isSuccess, setIsSuccess] = useState(false);
  const [showCompletion, setShowCompletion] = useState(false);
  const completionTimerRef = useRef<number | null>(null); // Changed NodeJS.Timeout to number
  const [animatedValues, setAnimatedValues] = useState<AnimatedValues>({
    percentage: 0,
    currentPage: 0,
    processedItems: 0,
    newItems: 0,
    updatedItems: 0,
    retryCount: 0
  });
  const crawlingRange = statusSummary?.crawlingRange;
  
  // 페이지 카운트 계산 로직:
  // 1. statusStore의 targetPageCount가 있으면 먼저 사용 (체크 결과 반영됨)
  // 2. crawlingRange가 있으면 그 범위를 계산 (endPage - startPage + 1)
  // 3. 설정된 pageRangeLimit 사용
  // 4. API 응답의 totalPages 사용
  // 5. 기본값 1 사용
  const targetPageCount = useMemo(() => 
    (progress.currentStage === 1 && statusSummary?.actualTargetPageCountForStage1) || // 1단계일때 실제 크롤링 대상 페이지 사용
    progress.totalPages || 
    (crawlingRange ? (statusSummary.crawlingRange.startPage - statusSummary.crawlingRange.endPage + 1) : 0) ||
    config.pageRangeLimit || 
    statusSummary?.siteTotalPages || 
    1, 
  [
    progress.currentStage, 
    statusSummary?.actualTargetPageCountForStage1, 
    progress.totalPages, 
    crawlingRange, 
    statusSummary?.crawlingRange,
    config.pageRangeLimit,
    statusSummary?.siteTotalPages
  ]);

  const toggleCompareSection = useCallback(() => {
    setAppCompareExpanded(!appCompareExpanded);
  }, [appCompareExpanded, setAppCompareExpanded]);

  const isValueChanged = useCallback((key: keyof CrawlingStatusSummary): boolean => {
    if (!statusSummary || !lastStatusSummary) return false;

    if (key === 'dbLastUpdated') {
      const current = statusSummary.dbLastUpdated ? new Date(statusSummary.dbLastUpdated).getTime() : null;
      const last = lastStatusSummary.dbLastUpdated ? new Date(lastStatusSummary.dbLastUpdated).getTime() : null;
      return current !== last;
    }

    return JSON.stringify(statusSummary[key]) !== JSON.stringify(lastStatusSummary[key]);
  }, [statusSummary, lastStatusSummary]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    if (status === 'running') {
      timer = setInterval(() => {
        setLocalTime(prev => {
          let newRemainingTime = prev.remainingTime;

          if (progress.currentStage === 1) {
            const totalPages = targetPageCount || 1;
            const currentPage = progress.currentPage || 0;
            const remainingPages = totalPages - currentPage;

            if (currentPage > 0 && prev.elapsedTime > 0) {
              const avgTimePerPage = prev.elapsedTime / currentPage;
              newRemainingTime = Math.max(0, remainingPages * avgTimePerPage);
            }
          } else if (progress.currentStage === 2) {
            const totalItems = progress.totalItems ||
              statusSummary?.siteProductCount ||
              (targetPageCount * (config.productsPerPage || 12));
            const processedItems = progress.processedItems || 0;
            const remainingItems = totalItems - processedItems;

            if (processedItems > 0 && prev.elapsedTime > 0) {
              const avgTimePerItem = prev.elapsedTime / processedItems;
              newRemainingTime = Math.max(0, remainingItems * avgTimePerItem);
            }
          }

          return {
            elapsedTime: prev.elapsedTime + 1000,
            remainingTime: newRemainingTime
          };
        });

        setFlipTimer(prev => prev + 1);
      }, 1000);
    } else {
      setLocalTime(prev => ({
        ...prev,
        elapsedTime: progress.elapsedTime || prev.elapsedTime
      }));
    }

    // 컴포넌트 언마운트나 상태 변경 시 타이머 정리
    return () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
  }, [
    status, 
    progress.currentStage,
    progress.currentPage, 
    progress.processedItems, 
    progress.totalItems,
    progress.elapsedTime,
    targetPageCount,
    config.productsPerPage,
    statusSummary?.siteProductCount
  ]);

  useEffect(() => {
    if (status !== 'running') {
      if (progress.elapsedTime !== undefined) {
        setLocalTime(prev => ({
          ...prev,
          elapsedTime: progress.elapsedTime
        }));
      }
    }
  }, [progress.elapsedTime, status]);

  useEffect(() => {
    if (status === 'completed' && progress.currentStage === 2) {
      const totalItems = progress.totalItems || statusSummary?.siteProductCount || (targetPageCount * (config.productsPerPage || 12));
      const processedItems = progress.processedItems || 0;
      const isCompleteSuccess = processedItems >= totalItems;

      setIsSuccess(isCompleteSuccess);
      setShowCompletion(true);

      if (completionTimerRef.current) {
        clearTimeout(completionTimerRef.current);
        completionTimerRef.current = null;
      }

      completionTimerRef.current = window.setTimeout(() => {
        setShowCompletion(false);
        completionTimerRef.current = null;
      }, isCompleteSuccess ? 10000 : 5000) as unknown as number;
    } else {
      setShowCompletion(false);
    }

    // 컴포넌트 언마운트나 의존성 변경 시 타이머 정리
    return () => {
      if (completionTimerRef.current) {
        clearTimeout(completionTimerRef.current);
        completionTimerRef.current = null;
      }
    };
  }, [
    status, 
    progress.currentStage, 
    progress.processedItems, 
    progress.totalItems, 
    targetPageCount, 
    config.productsPerPage, 
    statusSummary?.siteProductCount
  ]);

  const [animatedDigits, setAnimatedDigits] = useState({
    currentPage: false,
    processedItems: false,
    retryCount: false,
    newItems: false,
    updatedItems: false,
    elapsedTime: false,
    remainingTime: false
  });

  const prevStageRef = useRef<number | null>(null);

  useEffect(() => {
    const prevStage = prevStageRef.current;
    
    if (prevStage !== null && prevStage !== progress.currentStage) {
      // 단계 전환 시 필요한 로직 추가 가능
    }

    if (progress.currentStage !== undefined) {
      prevStageRef.current = progress.currentStage;
    }
  }, [progress.currentStage]);

  const prevProgress = useRef(progress);
  useEffect(() => {
    const timers: number[] = [];
    
    if (prevProgress.current) {
      if (progress.currentPage !== prevProgress.current.currentPage) {
        setAnimatedDigits(prev => ({ ...prev, currentPage: true }));
        const timer = window.setTimeout(
          () => setAnimatedDigits(prev => ({ ...prev, currentPage: false })), 
          300
        );
        timers.push(timer);
      }
      if (progress.processedItems !== prevProgress.current.processedItems) {
        setAnimatedDigits(prev => ({ ...prev, processedItems: true }));
        const timer = window.setTimeout(
          () => setAnimatedDigits(prev => ({ ...prev, processedItems: false })), 
          300
        );
        timers.push(timer);
      }
      // Safely check retryCount with undefined check
      if ((progress.retryCount !== undefined && prevProgress.current.retryCount !== undefined && 
           progress.retryCount !== prevProgress.current.retryCount) ||
          (progress.retryCount !== undefined && prevProgress.current.retryCount === undefined) ||
          (progress.retryCount === undefined && prevProgress.current.retryCount !== undefined)) {
        setAnimatedDigits(prev => ({ ...prev, retryCount: true }));
        const timer = window.setTimeout(
          () => setAnimatedDigits(prev => ({ ...prev, retryCount: false })), 
          300
        );
        timers.push(timer);
      }
      if (progress.newItems !== prevProgress.current.newItems) {
        setAnimatedDigits(prev => ({ ...prev, newItems: true }));
        const timer = window.setTimeout(
          () => setAnimatedDigits(prev => ({ ...prev, newItems: false })), 
          300
        );
        timers.push(timer);
      }
      if (progress.updatedItems !== prevProgress.current.updatedItems) {
        setAnimatedDigits(prev => ({ ...prev, updatedItems: true }));
        const timer = window.setTimeout(
          () => setAnimatedDigits(prev => ({ ...prev, updatedItems: false })), 
          300
        );
        timers.push(timer);
      }
      if (progress.elapsedTime !== prevProgress.current.elapsedTime) {
        setAnimatedDigits(prev => ({ ...prev, elapsedTime: true }));
        const timer = window.setTimeout(
          () => setAnimatedDigits(prev => ({ ...prev, elapsedTime: false })), 
          300
        );
        timers.push(timer);
      }
      if (progress.remainingTime !== prevProgress.current.remainingTime) {
        setAnimatedDigits(prev => ({ ...prev, remainingTime: true }));
        const timer = window.setTimeout(
          () => setAnimatedDigits(prev => ({ ...prev, remainingTime: false })), 
          300
        );
        timers.push(timer);
      }
    }
    prevProgress.current = { ...progress };
    
    // 모든 타이머 정리
    return () => {
      timers.forEach(timer => clearTimeout(timer));
    };
  }, [
    progress.currentPage,
    progress.processedItems,
    progress.retryCount,
    progress.newItems,
    progress.updatedItems,
    progress.elapsedTime,
    progress.remainingTime
  ]);

  const animationRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 더 정확한 진행률 계산
  const calculatedPercentage = useMemo(() => {
    // 크롤링 단계에 따라 적절한 진행률 계산
    if (progress.currentStage === 1) {
      // 1단계: 성공한 페이지 수 / 총 페이지 수 비율
      // 가능한 모든 소스에서 최대 성공 페이지 수 탐색
      let successPageCount = 0;
      
      // 1. stage1PageStatuses에서 성공 상태인 페이지 수 확인
      if (progress.stage1PageStatuses && Array.isArray(progress.stage1PageStatuses)) {
        const successStatusPages = progress.stage1PageStatuses.filter(p => p.status === 'success').length;
        successPageCount = Math.max(successPageCount, successStatusPages);
      }
      
      // 2. tasks에서 성공 상태인 페이지 수 확인
      if (concurrentTasks && concurrentTasks.length > 0) {
        const successTasksCount = concurrentTasks.filter((task) => task.status === 'success').length;
        successPageCount = Math.max(successPageCount, successTasksCount);
      }
      
      // 3. currentPage 값 확인
      if (progress.currentPage !== undefined && progress.currentPage > 0) {
        successPageCount = Math.max(successPageCount, progress.currentPage);
      }
      
      return targetPageCount > 0 ? (successPageCount / targetPageCount * 100) : 0;
    } else {
      // 다른 단계들은 API에서 받은 진행률 그대로 사용
      return progress.percentage || 0;
    }
  }, [progress.currentStage, progress.stage1PageStatuses, progress.currentPage, progress.percentage, targetPageCount, concurrentTasks]);

  // 성공 상태의 페이지 수를 모니터링하기 위한 추가 effect
  const [successPagesCount, setSuccessPagesCount] = useState(0);
  
  // concurrentTasks의 변화를 감지하여 성공한 페이지 수 업데이트
  // 더 강력한 성공 페이지 수 추적을 위한 effect
  useEffect(() => {
    if (concurrentTasks && concurrentTasks.length > 0) {
      const successCount = concurrentTasks.filter(task => task.status === 'success').length;
      if (successCount > 0 && successCount !== successPagesCount) {
        setSuccessPagesCount(successCount);
        
        // 현재 성공한 페이지 수가 progress.currentPage보다 크면 업데이트
        if (successCount > (progress.currentPage || 0) && progress.currentStage === 1) {
          // 강제로 업데이트 트리거
          updateProgress({
            currentPage: successCount
          });
        }
      }
    }
  }, [
    // concurrentTasks 자체는 참조가 변하므로 필요 속성만 개별적으로 추적
    // 이 effect는 성공한 작업 수가 변경될 때만 실행되어야 함
    successPagesCount, 
    progress.currentPage, 
    progress.currentStage,
    concurrentTasks.length, 
    // 성공 상태 배열의 길이만 추적
    concurrentTasks.filter(task => task.status === 'success').length
  ]);

  useEffect(() => {
    if (animationRef.current) {
      clearInterval(animationRef.current);
      animationRef.current = null;
    }
    
    // 진행 중인 작업 단계에 따라 현재 페이지 값 결정
    let currentPageValue = progress.currentPage || 0;
    if (progress.currentStage === 1) {
      // 단계 1에서는 최대 성공 페이지 값 사용
      const fromStatuses = progress.stage1PageStatuses?.filter(p => p.status === 'success').length || 0;
      const fromTasks = concurrentTasks.filter(task => task.status === 'success').length;
      currentPageValue = Math.max(currentPageValue, fromStatuses, fromTasks, successPagesCount);
    }

    const targetValues = {
      percentage: progress.currentStage === 1 ? calculatedPercentage : (progress.percentage || 0),
      currentPage: currentPageValue,
      processedItems: progress.processedItems || 0,
      newItems: progress.newItems || 0,
      updatedItems: progress.updatedItems || 0,
      retryCount: progress.retryCount !== undefined ? progress.retryCount : 0
    };

    const startValues = { ...animatedValues };

    const steps = 8;
    let step = 0;

    animationRef.current = window.setInterval(() => {
      step++;
      if (step >= steps) {
        setAnimatedValues(targetValues);
        if (animationRef.current) {
          clearInterval(animationRef.current);
          animationRef.current = null;
        }
        return;
      }

      const progressEase = 1 - Math.pow(1 - step / steps, 2); // easing function for smoother animation

      const newValues = {
        percentage: startValues.percentage + (targetValues.percentage - startValues.percentage) * progressEase,
        currentPage: startValues.currentPage + (targetValues.currentPage - startValues.currentPage) * progressEase,
        processedItems: startValues.processedItems + Math.round((targetValues.processedItems - startValues.processedItems) * progressEase),
        newItems: startValues.newItems + Math.round((targetValues.newItems - startValues.newItems) * progressEase),
        updatedItems: startValues.updatedItems + Math.round((targetValues.updatedItems - startValues.updatedItems) * progressEase),
        retryCount: startValues.retryCount + Math.round((targetValues.retryCount - startValues.retryCount) * progressEase)
      };

      setAnimatedValues(newValues);
    }, 40);

    // 컴포넌트 언마운트 또는 의존성 변경 시 애니메이션 정리
    return () => {
      if (animationRef.current) {
        clearInterval(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [
    progress.percentage, 
    progress.currentPage, 
    progress.processedItems, 
    progress.newItems, 
    progress.updatedItems, 
    progress.retryCount,
    progress.currentStage,
    progress.stage1PageStatuses,
    calculatedPercentage,
    successPagesCount,
    animatedValues
  ]);



  // 이전 상태 체크 여부와 현재 상태를 구분하는 더 명확한 변수들
  const isBeforeStatusCheck = useMemo(() => status === 'idle' && !statusSummary?.dbLastUpdated, [status, statusSummary?.dbLastUpdated]);
  const isAfterStatusCheck = useMemo(() => status === 'idle' && !!statusSummary?.dbLastUpdated, [status, statusSummary?.dbLastUpdated]);
  
  let collectionStatusText = "제품 상세 수집 현황";
  let retryStatusText = "제품 상세 재시도";

  if (isBeforeStatusCheck) {
    collectionStatusText = "상태확인 전";
    retryStatusText = "재시도 준비";
  } else if (isAfterStatusCheck) {
    collectionStatusText = "수집 현황 준비";
    retryStatusText = "재시도 준비";
  } else if (status === 'running' && (progress.currentStage === 1 || progress.currentStage === 2)) {
    collectionStatusText = "제품 정보 수집";
    retryStatusText = "제품 정보 재시도";
  }

  // MobX Store에서 진행 상태를 직접 계산
  // let remainingTimeDisplay: string;
  // if (isBeforeStatusCheck) {
  //   remainingTimeDisplay = "상태확인 전";
  // } else if (isAfterStatusCheck || localTime.remainingTime === 0 || localTime.remainingTime === undefined || localTime.remainingTime === null || isNaN(localTime.remainingTime)) {
  //   remainingTimeDisplay = "-:--:--";
  // } else {
  //   remainingTimeDisplay = formatDuration(localTime.remainingTime);
  // }



  const getStageBadge = useCallback(() => {
    let stageText = '대기중';
    let stageColor = 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-300';

    if (isBeforeStatusCheck) {
      stageText = '상태확인 전';
      stageColor = 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    } else if (isAfterStatusCheck) {
      stageText = '상태확인 완료';
      stageColor = 'bg-blue-50 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
    } else if (status === 'running' || status === 'completed' || status === 'paused') {
      const currentStep = progress.currentStep?.toLowerCase() || '';
      
      // 1.5단계 검증 진행 상태 처리
      if (currentStep.includes('1.5/3단계') || currentStep.includes('로컬db') || 
          currentStep.includes('검증') || currentStep.includes('db 중복')) {
        stageText = '1.5단계: 제품 검증';
        stageColor = 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
      } else if (progress.currentStage === 1) {
        stageText = '1단계: 목록 수집';
        stageColor = 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300';
      } else if (progress.currentStage === 2) {
        stageText = '2단계: 상세 수집';
        stageColor = 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-300';
      } else if (status === 'completed' && !progress.currentStage) {
         stageText = '완료';
         stageColor = 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      }
    } else if (status === 'error') {
      stageText = '오류 발생';
      stageColor = 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
    } else if (status === 'stopped') {
      stageText = '중단됨';
      stageColor = 'bg-red-200 text-red-900 dark:bg-red-800 dark:text-red-200';
    } else if (status === 'initializing') {
      stageText = '초기화 중';
      stageColor = 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
    }

    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${stageColor}`}>
        {stageText}
      </span>
    );
  }, [isBeforeStatusCheck, isAfterStatusCheck, status, progress.currentStage, progress.currentStep]);

  const getRetryInfo = useCallback(() => {
    // RetryStatusIndicator 컴포넌트가 내부적으로 필요한 상태(재시도 중인지 여부)를 처리함
    return <RetryStatusIndicator className="mt-2" />;
  }, []);

  const getEstimatedEndTime = useCallback(() => {
    if (status === 'running' && localTime.remainingTime > 0 && !isNaN(localTime.remainingTime)) {
      const endTime = new Date(Date.now() + localTime.remainingTime);
      return (
        <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 text-center">
          예상 완료 시각: {endTime.toLocaleTimeString()}
        </div>
      );
    }
    return null;
  }, [status, localTime.remainingTime]);

  // 기존 state에 추가
  const [isStatusChecking, setIsStatusChecking] = useState(false);

  // 상태 체크 버튼 클릭 핸들러 수정
  const handleCheckStatus = async () => {
    try {
      console.log('=== 상태 체크 시작 ===');
      console.log('현재 statusSummary:', statusSummary);
      
      setIsStatusChecking(true);
      setAppCompareExpanded(true);
      
      console.log('checkStatus 호출 시작...');
      await checkStatus();
      console.log('checkStatus 호출 완료');
      
      // 강제 리렌더링을 위한 임시 방법
      setTimeout(() => {
        console.log('1초 후 statusSummary:', statusSummary);
        if (!statusSummary || Object.keys(statusSummary).length === 0) {
          console.warn('statusSummary가 아직 업데이트되지 않음 - 강제 새로고침 필요');
          // 임시 강제 업데이트
          setIsStatusChecking(false);
          setIsStatusChecking(true);
          setTimeout(() => setIsStatusChecking(false), 100);
        }
      }, 1000);
      
      console.log('=== 상태 체크 완료 ===');
    } catch (error) {
      console.error('상태 체크 실패:', error);
    } finally {
      setTimeout(() => {
        setIsStatusChecking(false);
        console.log('isStatusChecking 해제됨:', false);
      }, 1500);
    }
  };

  // CrawlingDashboard.tsx에서 statusSummary 감시 추가
  useEffect(() => {
    console.log('statusSummary가 업데이트됨:', statusSummary);
    console.log('statusSummary 키 개수:', statusSummary ? Object.keys(statusSummary).length : 0);
  }, [statusSummary]);

  return (
    <>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-white">크롤링 상태</h2>
          {/* 새로운 통합 상태 표시 컴포넌트 */}
          <StatusDisplay />
        </div>

        {/* 에러 표시 */}
        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
            <div className="flex justify-between items-center">
              <span>{error}</span>
              <button 
                onClick={clearError}
                className="text-red-500 hover:text-red-700 font-bold"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* 제어 버튼들 */}
        <div className="flex space-x-4 mb-6">
          {/* 상태 체크 버튼 */}
          <button
            onClick={handleCheckStatus}
            disabled={status === 'running' || isStatusChecking}
            className={`
              px-6 py-3 rounded-lg font-medium transition-colors flex items-center space-x-2
              ${status === 'running' || isStatusChecking
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                : 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800'
              }
            `}
          >
            {isStatusChecking ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                <span>상태 확인 중...</span>
              </>
            ) : (
              <>
                <span>🔍</span>
                <span>상태 체크</span>
              </>
            )}
          </button>

          {/* 크롤링 시작/중지 버튼 */}
          {status === 'idle' || status === 'completed' || status === 'error' ? (
            <button
              onClick={() => {
                console.log('크롤링 시작');
                startCrawling();
              }}
              className="px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 active:bg-green-800 transition-colors"
            >
              ▶️ 크롤링 시작
            </button>
          ) : (
            <button
              onClick={() => {
                console.log('크롤링 중지');
                stopCrawling();
              }}
              disabled={status !== 'running'}
              className={`
                px-6 py-3 rounded-lg font-medium transition-colors
                ${status === 'running' 
                  ? 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800' 
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }
              `}
            >
              ⏹️ 크롤링 중지
            </button>
          )}
        </div>

        {/* 현재 상태 표시 */}
        <div className="bg-gray-50 rounded p-4 mb-4">
          <div className="flex items-center space-x-2">
            <span className="font-medium">현재 상태:</span>
            <span className={`
              px-3 py-1 rounded-full text-sm font-medium
              ${status === 'running' ? 'bg-green-100 text-green-800' :
                status === 'error' ? 'bg-red-100 text-red-800' :
                status === 'completed' ? 'bg-blue-100 text-blue-800' :
                'bg-gray-100 text-gray-800'
              }
            `}>
              {status === 'running' ? '실행 중' :
               status === 'error' ? '오류' :
               status === 'completed' ? '완료' :
               status === 'paused' ? '일시정지' :
               '대기 중'}
            </span>
          </div>
        </div>

        <div className="mb-4 flex justify-between items-center">
          <span className="text-sm text-gray-600 dark:text-gray-400">현재 단계:</span>
          {getStageBadge()}
        </div>

        <div className="mb-2">
          <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
            <span>{progress.currentStep || '대기 중...'}</span>
          </div>
          
          {/* 새로운 통합 진행률 표시 컴포넌트 */}
          <ProgressBarDisplay />

          {/* 단계 전환 인디케이터 */}
          <StageTransitionIndicator 
            currentStage={progress.currentStage}
            currentStep={progress.currentStep}
          />

          {/* 배치 진행 상태 표시 (배치 처리가 활성화된 경우에만 표시) */}
          {progress.currentBatch !== undefined && progress.totalBatches !== undefined && progress.totalBatches > 1 && (
            <div className="mt-2">
              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                <span>배치 진행 상태</span>
                <span className="font-medium">
                  {progress.currentBatch}/{progress.totalBatches} 배치
                  {progress.batchRetryCount !== undefined && progress.batchRetryCount > 0 && (
                    <span className="ml-2 text-amber-600 dark:text-amber-400">
                      (재시도: {progress.batchRetryCount}/{progress.batchRetryLimit || 3})
                    </span>
                  )}
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mt-1">
                <div
                  className={`${progress.batchRetryCount ? 'bg-amber-500 dark:bg-amber-600' : 'bg-amber-400 dark:bg-amber-500'} h-2 rounded-full transition-all duration-300`}
                  style={{ width: `${Math.max(0.5, (progress.currentBatch / Math.max(progress.totalBatches, 1)) * 100)}%` }}
                >
                </div>
              </div>
            </div>
          )}

          {progress.currentStage === 1 && (
            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
              <span>
                처리 완료: <span className={`${animatedDigits.currentPage ? 'animate-numberChange' : ''} font-medium text-blue-600 dark:text-blue-400`}>
                  {(() => {
                    // 최종 표시될 성공한 페이지 수 계산
                    let displaySuccessCount = 0;
                    
                    // 1. stage1PageStatuses에서 성공 상태인 페이지 수 확인
                    if (progress.stage1PageStatuses && Array.isArray(progress.stage1PageStatuses)) {
                      const successStatusCount = progress.stage1PageStatuses.filter(p => p.status === 'success').length;
                      displaySuccessCount = Math.max(displaySuccessCount, successStatusCount);
                    }
                    
                    // 2. currentPage 값 확인
                    if (progress.currentPage !== undefined && progress.currentPage > 0) {
                      displaySuccessCount = Math.max(displaySuccessCount, progress.currentPage);
                    }
                    
                    // 3. concurrentTasks에서 성공 상태인 페이지 확인
                    if (concurrentTasks && concurrentTasks.length > 0) {
                      const successTasksCount = concurrentTasks.filter(task => task.status === 'success').length;
                      displaySuccessCount = Math.max(displaySuccessCount, successTasksCount);
                    }
                    
                    // 4. animatedValues에서의 값 (애니메이션 효과를 위해)
                    displaySuccessCount = Math.max(displaySuccessCount, animatedValues.currentPage || 0);
                    
                    return displaySuccessCount;
                  })()}
                </span>/{statusSummary?.crawlingRange ? 
                          (statusSummary.crawlingRange.startPage - statusSummary.crawlingRange.endPage + 1) : 
                          targetPageCount}
                {' '}페이지 ({Math.round(calculatedPercentage)}%)
              </span>
              <span>
                총 페이지 수: {statusSummary?.crawlingRange ? 
                          (statusSummary.crawlingRange.startPage - statusSummary.crawlingRange.endPage + 1) : 
                          targetPageCount}
              </span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 text-center mb-3 px-2">
          <div className="bg-gray-50 dark:bg-gray-700 p-2 rounded-md">
            <p className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap overflow-hidden text-ellipsis" title={collectionStatusText}>
              {collectionStatusText}
            </p>
            <p className={`text-lg sm:text-xl font-bold ${animatedDigits.processedItems ? 'animate-pulse-once' : ''}`}>
              {isBeforeStatusCheck ? `상태확인 전` :
                isAfterStatusCheck ? `0 / ${statusSummary?.crawlingRange ? 
                                       (statusSummary.crawlingRange.startPage - statusSummary.crawlingRange.endPage + 1) : 
                                       targetPageCount}` :
                status === 'running' && progress.currentStage === 1 ? 
                  (() => {
                    // 성공한 페이지 수 계산 - 개선된 알고리즘
                    let successCount = 0;
                    
                    // 1. stage1PageStatuses에서 성공 상태인 페이지 수 확인
                    if (progress.stage1PageStatuses && Array.isArray(progress.stage1PageStatuses)) {
                      const successStatusCount = progress.stage1PageStatuses.filter(p => p.status === 'success').length;
                      successCount = Math.max(successCount, successStatusCount);
                    }
                    
                    // 2. currentPage 값 확인
                    if (progress.currentPage !== undefined && progress.currentPage > 0) {
                      successCount = Math.max(successCount, progress.currentPage);
                    }
                    
                    // 3. concurrentTasks에서 성공 상태인 페이지 확인
                    if (concurrentTasks && concurrentTasks.length > 0) {
                      const successTasksCount = concurrentTasks.filter(task => task.status === 'success').length;
                      successCount = Math.max(successCount, successTasksCount);
                    }
                    
                    // 크롤링 중에는 최신 crawlingRange 기반으로 계산된 페이지 수 사용
                    const actualTargetPageCount = 
                      (progress.currentStage === 1 && statusSummary?.actualTargetPageCountForStage1) || // 1단계일때 실제 크롤링 대상 페이지 사용
                      statusSummary?.crawlingRange ? 
                      (statusSummary.crawlingRange.startPage - statusSummary.crawlingRange.endPage + 1) : 
                      targetPageCount;
                    
                    return `${successCount} / ${actualTargetPageCount}`;
                  })() :
                  `${Math.round(animatedValues.processedItems)} / ${progress.totalItems || statusSummary?.siteProductCount || 0}`
              }
            </p>
          </div>

          <div className="bg-gray-50 dark:bg-gray-700 p-2 rounded-md">
            <p className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap overflow-hidden text-ellipsis" title={retryStatusText}>
              {retryStatusText}
            </p>
            <p className={`text-lg sm:text-xl font-bold ${animatedDigits.retryCount ? 'animate-pulse-once' : ''}`}>
              {isBeforeStatusCheck ? 
                '상태확인 전' :
                isAfterStatusCheck ?
                `${config.productListRetryCount || 0}, ${config.productDetailRetryCount || 0}` :
                `${Math.round(animatedValues.retryCount)}${progress.maxRetries !== undefined ? ` / ${progress.maxRetries}` : 
                  config.productListRetryCount !== undefined && progress.currentStage === 1 ? ` / ${config.productListRetryCount}` : 
                  config.productDetailRetryCount !== undefined && progress.currentStage === 2 ? ` / ${config.productDetailRetryCount}` : '회'}`
              }
            </p>
          </div>

          {/* 배치 처리 정보 카드 - 배치 정보가 있을 때만 표시 */}
          {progress.currentBatch !== undefined && progress.totalBatches !== undefined && progress.totalBatches > 1 ? (
            <div className="bg-amber-50 dark:bg-amber-900/20 p-2 rounded-md border border-amber-100 dark:border-amber-800">
              <p className="text-xs text-amber-800 dark:text-amber-300 whitespace-nowrap overflow-hidden text-ellipsis">
                배치 처리 현황 {progress.batchRetryCount !== undefined && progress.batchRetryCount > 0 && 
                  <span className="text-amber-600 dark:text-amber-400">(재시도 {progress.batchRetryCount}/{progress.batchRetryLimit || 3})</span>}
              </p>
              <p className="text-lg sm:text-xl font-bold text-amber-700 dark:text-amber-400">
                {progress.currentBatch} / {progress.totalBatches}
                <span className="text-xs ml-1">배치</span>
              </p>
            </div>
          ) : (
            // 새로운 통합 시간 정보 표시 컴포넌트
            <TimeDisplay />
          )}
        </div>

        <div className="mt-4 inline-block px-4 py-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
          {/* 새로운 통합 제품 수집 현황 표시 컴포넌트 */}
          <CollectionStatusDisplay />
        </div>
        
        {/* 페이지 진행 상태 표시 컴포넌트 - 문제 #3 해결: 페이지/제품 수 혼합 표시 방지 */}
        <PageProgressDisplay />

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
        
        {/* 1.5단계 검증 결과 패널 */}
        <ValidationResultsPanel 
          validationSummary={progress.validationSummary}
          recommendations={progress.rangeRecommendations}
          isVisible={
            // 1.5단계 진행 중이거나 완료된 경우에 표시
            (status === 'running' || status === 'completed' || status === 'paused') && 
            (progress.validationSummary !== undefined ||
             (progress.currentStep?.toLowerCase().includes('검증') || 
              progress.currentStep?.toLowerCase().includes('로컬db') ||
              progress.currentStep?.toLowerCase().includes('1.5/3') ||
              progress.currentStep?.toLowerCase().includes('db 중복')))
          }
          isInProgress={
            // 검증이 진행 중인 경우 (validationSummary가 아직 없지만 검증 관련 step인 경우)
            status === 'running' && 
            progress.validationSummary === undefined &&
            (progress.currentStep?.toLowerCase().includes('검증') || 
             progress.currentStep?.toLowerCase().includes('로컬db') ||
             progress.currentStep?.toLowerCase().includes('1.5/3') ||
             progress.currentStep?.toLowerCase().includes('db 중복'))
          }
          isCompleted={status === 'completed'}
          hasErrors={status === 'error'}
        />

        {getRetryInfo()}

        {getEstimatedEndTime()}

        {/* 1단계 또는 검증 단계 중 중요 정보 표시 */}
        {status === 'running' && (progress.currentStage === 1 || 
          (progress.currentStep?.toLowerCase().includes('검증') || 
           progress.currentStep?.toLowerCase().includes('로컬db') ||
           progress.currentStep?.toLowerCase().includes('1.5/3'))) && (
          <div className="mt-3 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-md border border-blue-100 dark:border-blue-800 text-sm">
            <div className="font-medium text-blue-800 dark:text-blue-300 mb-1">진행 정보:</div>
            <ul className="text-xs text-gray-700 dark:text-gray-300">
              <li>• 총 페이지 수: {
                (progress.currentStage === 1 && statusSummary?.actualTargetPageCountForStage1) || 
                statusSummary?.crawlingRange ? 
                  (statusSummary.crawlingRange.startPage - statusSummary.crawlingRange.endPage + 1) : 
                  targetPageCount}페이지</li>
              <li>• 현재까지 성공한 페이지: {(() => {
                // 성공한 페이지 수 계산 - 모든 소스에서 가장 높은 값을 사용
                let successCount = 0;
                
                // 1. stage1PageStatuses에서 성공 상태인 페이지 수 확인 (가장 신뢰할 수 있는 소스)
                if (progress.stage1PageStatuses && Array.isArray(progress.stage1PageStatuses)) {
                  const successStatusPages = progress.stage1PageStatuses.filter(p => p.status === 'success').length;
                  successCount = Math.max(successCount, successStatusPages);
                }
                
                // 2. currentPage 값 확인 - 이전 버전과의 호환성
                if (progress.currentPage !== undefined && progress.currentPage > 0) {
                  successCount = Math.max(successCount, progress.currentPage);
                }
                
                // 3. concurrentTasks에서 성공 상태인 페이지 확인 - 실시간 UI 업데이트
                if (concurrentTasks && concurrentTasks.length > 0) {
                  const successTasksCount = concurrentTasks.filter(task => task.status === 'success').length;
                  successCount = Math.max(successCount, successTasksCount);
                }
                
                return successCount;
              })()}페이지</li>
              <li>• 설정된 재시도 횟수: {config.productListRetryCount || 3}회</li>
              {progress.retryCount !== undefined && progress.retryCount > 0 && (
                <li>• 현재 재시도 횟수: {progress.retryCount}회</li>
              )}
              {progress.validationSummary && (
                <li>• 중복검증: <span className="font-medium text-blue-800 dark:text-blue-300">
                  신규 {progress.validationSummary.newProducts}개, 
                  기존 {progress.validationSummary.existingProducts}개,
                  중복 {progress.validationSummary.duplicateProducts}개
                </span></li>
              )}
              {progress.currentBatch !== undefined && progress.totalBatches !== undefined && (
                <li>• 배치 처리: <span className="font-medium text-blue-800 dark:text-blue-300">{progress.currentBatch}/{progress.totalBatches} 배치</span>
                  {progress.batchRetryCount !== undefined && progress.batchRetryCount > 0 && (
                    <span className="ml-2 text-amber-600 dark:text-amber-400 font-medium"> (배치 재시도: {progress.batchRetryCount}/{progress.batchRetryLimit || 3})</span>
                  )}
                </li>
              )}
            </ul>
          </div>
        )}

        {progress.message && (
          <div className="mt-4 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-md border border-blue-100 dark:border-blue-800 text-sm text-blue-800 dark:text-blue-300">
            {progress.currentStage === 1 && targetPageCount ?
              `${progress.message} (목표 페이지: ${ 
                (progress.currentStage === 1 && statusSummary?.actualTargetPageCountForStage1) || // 1단계일때 실제 크롤링 대상 페이지 사용
                statusSummary?.crawlingRange ? 
                                       (statusSummary.crawlingRange.startPage - statusSummary.crawlingRange.endPage + 1) : 
                                       targetPageCount}페이지)` :
              progress.message
            }
          </div>
        )}

        {progress.criticalError && (
          <div className="mt-4 p-2 bg-red-50 dark:bg-red-900/20 rounded-md border border-red-100 dark:border-red-800 text-sm text-red-800 dark:text-red-300">
            오류: {progress.criticalError}
          </div>
        )}

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

        {showCompletion && (
          <div className={`relative mt-4 p-4 rounded-md text-center ${isSuccess ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
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
                    (((progress.currentStage === 1 && statusSummary?.actualTargetPageCountForStage1) || // 1단계일때 실제 크롤링 대상 페이지 사용
                      statusSummary?.crawlingRange ? 
                      (statusSummary.crawlingRange.startPage - statusSummary.crawlingRange.endPage + 1) : 
                      targetPageCount) * (config.productsPerPage || 12))
                  } 제품 수집 완료
                </div>
                
                {/* 2단계에서 새로운 항목과 업데이트 항목을 구분하여 표시 */}
                {progress.currentStage === 2 && (progress.newItems !== undefined || progress.updatedItems !== undefined) && (
                  <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    신규: {progress.newItems || 0}개, 업데이트: {progress.updatedItems || 0}개
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <ExpandableSection
        title="사이트 로컬 비교"
        isExpanded={appCompareExpanded}
        onToggle={toggleCompareSection}
        additionalClasses="site-local-compare-section"
        isLoading={isStatusChecking}
        loadingContent={
          <div>
            <p>상태 확인 중...</p>
            <StatusCheckLoadingAnimation />
          </div>
        }
      >
        {/* 디버깅을 위한 임시 표시 */}
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded mb-4">
          <h4 className="font-bold text-yellow-800">🔍 디버깅 정보:</h4>
          <div className="text-sm text-yellow-700 space-y-1">
            <p>statusSummary 존재: <strong>{statusSummary ? 'Yes' : 'No'}</strong></p>
            <p>statusSummary 타입: <strong>{typeof statusSummary}</strong></p>
            <p>statusSummary 키 개수: <strong>{statusSummary ? Object.keys(statusSummary).length : 0}</strong></p>
            <p>isStatusChecking: <strong>{isStatusChecking.toString()}</strong></p>
            <details className="mt-2">
              <summary className="cursor-pointer font-medium">📋 statusSummary 전체 내용 보기</summary>
              <pre className="mt-2 text-xs bg-gray-100 p-2 rounded overflow-auto max-h-40">
                {JSON.stringify(statusSummary, null, 2)}
              </pre>
            </details>
          </div>
        </div>

        {Object.keys(statusSummary || {}).length === 0 ? (
          <div className="flex flex-col items-center justify-center h-20">
            <p className="text-center text-gray-600 dark:text-gray-400">
              사이트와 로컬 DB 정보를 비교하려면<br/>"상태 체크" 버튼을 클릭하세요.
            </p>
          </div>
        ) : (
          // 기존 코드 유지
          <div className="space-y-3">
            <div className="p-2 bg-green-50 border border-green-200 rounded">
              <p className="text-green-800 font-semibold">✅ 상태 체크 완료!</p>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">마지막 DB 업데이트:</span>
              <span className={`font-medium ${isValueChanged('dbLastUpdated') ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-800 dark:text-gray-200'}`}>
                {statusSummary.dbLastUpdated
                  ? format(new Date(statusSummary.dbLastUpdated), 'yyyy-MM-dd HH:mm')
                  : '없음'}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">DB 제품 수:</span>
              <span className={`font-medium ${isValueChanged('dbProductCount') ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-800 dark:text-gray-200'}`}>
                {statusSummary.dbProductCount?.toLocaleString()}개
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">사이트 페이지 수:</span>
              <span className={`font-medium ${isValueChanged('siteTotalPages') ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-800 dark:text-gray-200'}`}>
                {statusSummary.siteTotalPages?.toLocaleString()}페이지
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">사이트 제품 수:</span>
              <span className={`font-medium ${isValueChanged('siteProductCount') ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-800 dark:text-gray-200'}`}>
                {statusSummary.siteProductCount?.toLocaleString()}개
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">차이:</span>
              <span className={`font-medium ${isValueChanged('diff') ? 'text-yellow-600 dark:text-yellow-400' : statusSummary.diff > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                {statusSummary.diff > 0 ? '+' : ''}{statusSummary.diff?.toLocaleString()}개
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">크롤링 필요:</span>
              <span className={`font-medium ${isValueChanged('needCrawling') ? 'text-yellow-600 dark:text-yellow-400' : statusSummary.needCrawling ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                {statusSummary.needCrawling ? '예' : '아니오'}
              </span>
            </div>

            {statusSummary.crawlingRange && (
              <div className="flex justify-between items-center">
                <span className="text-gray-600 dark:text-gray-400">크롤링 범위:</span>
                <span className={`font-medium ${isValueChanged('crawlingRange') ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-800 dark:text-gray-200'}`}>
                  {statusSummary.crawlingRange.startPage} ~ {statusSummary.crawlingRange.endPage} 페이지
                </span>
              </div>
            )}

            {statusSummary.dbProductCount !== undefined && statusSummary.siteProductCount !== undefined && statusSummary.diff !== undefined && (
            <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
              <div className="mb-2 flex justify-between text-xs">
                <span className="text-gray-500 dark:text-gray-400">DB</span>
                <span className="text-gray-500 dark:text-gray-400">사이트</span>
              </div>
              <div className="relative h-6 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="absolute top-0 left-0 h-full bg-blue-500"
                  style={{ width: `${Math.min(100, (statusSummary.dbProductCount / Math.max(statusSummary.siteProductCount, 1)) * 100)}%` }}
                ></div>
                {statusSummary.diff > 0 && (
                  <div
                    className="absolute top-0 right-0 h-full bg-red-400 opacity-70"
                    style={{ width: `${Math.min(100, (statusSummary.diff / Math.max(statusSummary.siteProductCount, 1)) * 100)}%` }}
                  ></div>
                )}
              </div>
              <div className="flex justify-between mt-1 text-xs">
                <span className="text-gray-500 dark:text-gray-400">{statusSummary.dbProductCount.toLocaleString()}</span>
                <span className="text-gray-500 dark:text-gray-400">{statusSummary.siteProductCount.toLocaleString()}</span>
              </div>
            </div>
            )}
          </div>
        )}
      </ExpandableSection>
      
      {/* BatchUITestButton removed - moved to Settings tab */}
    </>
  );
}

// MobX observer로 감싸서 Domain Store 변경사항을 자동으로 감지
export default observer(CrawlingDashboard);