import { useStore } from '@nanostores/react';
import { crawlingProgressStore, crawlingStatusStore, configStore, crawlingStatusSummaryStore, lastCrawlingStatusSummaryStore, CrawlingStatusSummary } from '../stores';
import { useEffect, useState, useRef, Dispatch, SetStateAction } from 'react';
import { ExpandableSection } from './ExpandableSection';
import StatusCheckLoadingAnimation from './StatusCheckLoadingAnimation';
import { format } from 'date-fns';

interface CrawlingDashboardProps {
  isAppStatusChecking: boolean;
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
export function CrawlingDashboard({ isAppStatusChecking, appCompareExpanded, setAppCompareExpanded }: CrawlingDashboardProps) {
  const progress = useStore(crawlingProgressStore);
  const status = useStore(crawlingStatusStore);
  const config = useStore(configStore);
  const statusSummary = useStore(crawlingStatusSummaryStore);
  const lastStatusSummary = useStore(lastCrawlingStatusSummaryStore);

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

  const targetPageCount = progress.totalPages || statusSummary?.siteTotalPages || config.pageRangeLimit || 1;

  const toggleCompareSection = () => setAppCompareExpanded(!appCompareExpanded);

  const isValueChanged = (key: keyof CrawlingStatusSummary): boolean => {
    if (!statusSummary || !lastStatusSummary) return false;

    if (key === 'dbLastUpdated') {
      const current = statusSummary.dbLastUpdated ? new Date(statusSummary.dbLastUpdated).getTime() : null;
      const last = lastStatusSummary.dbLastUpdated ? new Date(lastStatusSummary.dbLastUpdated).getTime() : null;
      return current !== last;
    }

    return JSON.stringify(statusSummary[key]) !== JSON.stringify(lastStatusSummary[key]);
  };

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    if (status === 'running') {
      timer = setInterval(() => {
        if (status !== 'running') {
          if (timer) clearInterval(timer);
          return;
        }
        setLocalTime(prev => {
          let newRemainingTime = prev.remainingTime;

          // 서버에서 제공하는 남은 시간 추정치가 있으면 이를 우선 사용
          if (progress.remainingTime && progress.remainingTime > 0) {
            newRemainingTime = progress.remainingTime;
          } 
          // 서버 제공 시간 추정치가 없으면 클라이언트에서 계산
          else if (progress.currentStage === 1) {
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

        setFlipTimer(prev => {
          const newValue = prev + 1;
          return newValue;
        });
      }, 1000);
    } else {
      setLocalTime(prev => ({
        ...prev,
        elapsedTime: progress.elapsedTime || prev.elapsedTime
      }));
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [status, progress.currentPage, progress.currentStage, progress.processedItems, progress.totalItems, targetPageCount, config.productsPerPage, statusSummary, progress.elapsedTime]);

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
      }

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
  }, [status, progress.currentStage, progress.processedItems, progress.totalItems, targetPageCount, config.productsPerPage, statusSummary]);

  const [animatedDigits, setAnimatedDigits] = useState({
    currentPage: false,
    processedItems: false,
    retryCount: false,
    newItems: false,
    updatedItems: false,
    elapsedTime: false,
    remainingTime: false
  });

  const [prevStage, setPrevStage] = useState<number | null>(null);

  useEffect(() => {
    if (prevStage !== null && prevStage !== progress.currentStage) {
    }

    if (progress.currentStage !== undefined) {
      setPrevStage(progress.currentStage);
    }
  }, [progress.currentStage, prevStage]);

  const prevProgress = useRef(progress);
  useEffect(() => {
    if (prevProgress.current) {
      if (progress.currentPage !== prevProgress.current.currentPage) {
        setAnimatedDigits(prev => ({ ...prev, currentPage: true }));
        setTimeout(() => setAnimatedDigits(prev => ({ ...prev, currentPage: false })), 300);
      }
      if (progress.processedItems !== prevProgress.current.processedItems) {
        setAnimatedDigits(prev => ({ ...prev, processedItems: true }));
        setTimeout(() => setAnimatedDigits(prev => ({ ...prev, processedItems: false })), 300);
      }
      if (progress.retryCount !== prevProgress.current.retryCount) {
        setAnimatedDigits(prev => ({ ...prev, retryCount: true }));
        setTimeout(() => setAnimatedDigits(prev => ({ ...prev, retryCount: false })), 300);
      }
      if (progress.newItems !== prevProgress.current.newItems) {
        setAnimatedDigits(prev => ({ ...prev, newItems: true }));
        setTimeout(() => setAnimatedDigits(prev => ({ ...prev, newItems: false })), 300);
      }
      if (progress.updatedItems !== prevProgress.current.updatedItems) {
        setAnimatedDigits(prev => ({ ...prev, updatedItems: true }));
        setTimeout(() => setAnimatedDigits(prev => ({ ...prev, updatedItems: false })), 300);
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

  const animationRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const calculatedPercentage = targetPageCount > 0 ?
    (progress.currentPage || 0) / targetPageCount * 100 :
    progress.percentage || 0;

  useEffect(() => {
    if (animationRef.current) {
      clearInterval(animationRef.current);
    }

    const targetValues = {
      percentage: progress.currentStage === 1 ? calculatedPercentage : (progress.percentage || 0),
      currentPage: progress.currentPage || 0,
      processedItems: progress.processedItems || 0,
      newItems: progress.newItems || 0,
      updatedItems: progress.updatedItems || 0,
      retryCount: progress.retryCount || 0
    };

    const startValues = { ...animatedValues };

    const steps = 8;
    let step = 0;

    animationRef.current = setInterval(() => {
      step++;
      if (step >= steps) {
        setAnimatedValues(targetValues);
        clearInterval(animationRef.current!);
        return;
      }

      const progress = 1 - Math.pow(1 - step / steps, 2);

      const newValues = {
        percentage: startValues.percentage + (targetValues.percentage - startValues.percentage) * progress,
        currentPage: startValues.currentPage + (targetValues.currentPage - startValues.currentPage) * progress,
        processedItems: startValues.processedItems + Math.round((targetValues.processedItems - startValues.processedItems) * progress),
        newItems: startValues.newItems + Math.round((targetValues.newItems - startValues.newItems) * progress),
        updatedItems: startValues.updatedItems + Math.round((targetValues.updatedItems - startValues.updatedItems) * progress),
        retryCount: startValues.retryCount + Math.round((targetValues.retryCount - startValues.retryCount) * progress)
      };

      setAnimatedValues(newValues);
    }, 40);

    return () => {
      if (animationRef.current) {
        clearInterval(animationRef.current);
      }
    };
  }, [progress.percentage, progress.currentPage, progress.processedItems, progress.newItems, progress.updatedItems, progress.retryCount, calculatedPercentage]);

  const formatDuration = (milliseconds: number | undefined | null): string => {
    if (milliseconds === undefined || milliseconds === null || isNaN(milliseconds) || milliseconds <= 0) return '00:00:00';

    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const pad = (num: number) => String(num).padStart(2, '0');

    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  };

  const isInitialState = status === 'idle' || (
    (!progress.elapsedTime || progress.elapsedTime === 0) &&
    (!progress.currentPage || progress.currentPage === 0) &&
    (!progress.processedItems || progress.processedItems === 0)
  );

  let collectionStatusText = "제품 상세 수집 현황";
  let retryStatusText = "제품 상세 재시도";

  if (isInitialState) {
    collectionStatusText = "수집 현황 준비";
    retryStatusText = "재시도 준비";
  } else if (status === 'running' && (progress.currentStage === 1 || progress.currentStage === 2)) {
    collectionStatusText = "제품 정보 수집";
    retryStatusText = "제품 정보 재시도";
  }

  let remainingTimeDisplay: string;
  if (isInitialState || localTime.remainingTime === 0 || localTime.remainingTime === undefined || localTime.remainingTime === null || isNaN(localTime.remainingTime)) {
    remainingTimeDisplay = "-:--:--";
  } else {
    remainingTimeDisplay = formatDuration(localTime.remainingTime);
  }

  function getStatusBadgeColor() {
    switch (status) {
      case 'idle':
        return 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
      case 'running':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300 animate-pulse';
      case 'paused':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
      case 'completed':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'error':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      case 'stopped':
        return 'bg-red-200 text-red-900 dark:bg-red-800 dark:text-red-200';
      case 'initializing':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
      default:
        return 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  }

  function getStageBadge() {
    let stageText = '대기중';
    let stageColor = 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-300';

    if (status === 'running' || status === 'completed' || status === 'paused') {
      if (progress.currentStage === 1) {
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
  }

  function getRetryInfo() {
    if (progress.retryCount !== undefined && progress.retryCount > 0 ) {
      return (
        <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded-md border border-yellow-100 dark:border-yellow-800 text-sm text-yellow-800 dark:text-yellow-300">
          재시도 대기열: {config.productListRetryCount}개 항목 (현재 재시도: {progress.retryCount}회)
        </div>
      );
    }
    return null;
  }

  function getEstimatedEndTime() {
    if (status === 'running' && localTime.remainingTime > 0 && !isNaN(localTime.remainingTime)) {
      const endTime = new Date(Date.now() + localTime.remainingTime);
      return (
        <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 text-center">
          예상 완료 시각: {endTime.toLocaleTimeString()}
        </div>
      );
    }
    return null;
  }

  return (
    <>
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
              <div className="absolute inset-0 overflow-hidden">
                <div className="animate-pulse-light bg-white/30 h-full w-1/4 skew-x-12 transform -translate-x-full animate-progress-wave"></div>
              </div>
            </div>
          </div>

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

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 text-center mb-3 px-2">
          <div className="bg-gray-50 dark:bg-gray-700 p-2 rounded-md">
            <p className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap overflow-hidden text-ellipsis" title={collectionStatusText}>
              {collectionStatusText}
            </p>
            <p className={`text-lg sm:text-xl font-bold ${animatedDigits.processedItems ? 'animate-pulse-once' : ''}`}>
              {isInitialState ? `0 / ${targetPageCount}` :
                status === 'running' && progress.currentStage === 1 ? `${Math.round(animatedValues.currentPage)} / ${targetPageCount}` :
                  `${Math.round(animatedValues.processedItems)} / ${progress.totalItems || statusSummary?.siteProductCount || 0}`
              }
            </p>
          </div>

          <div className="bg-gray-50 dark:bg-gray-700 p-2 rounded-md">
            <p className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap overflow-hidden text-ellipsis" title={retryStatusText}>
              {retryStatusText}
            </p>
            <p className={`text-lg sm:text-xl font-bold ${animatedDigits.retryCount ? 'animate-pulse-once' : ''}`}>
              {isInitialState ? 
                `${config.productListRetryCount || 0}, ${config.productDetailRetryCount || 0}` :
                `${Math.round(animatedValues.retryCount)}${config.retryMax !== undefined ? ` / ${config.retryMax}` : '회'}`
              }
            </p>
          </div>

          <div className="p-2 bg-gray-50 dark:bg-gray-700 rounded-md">
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {progress.currentStage === 1 ? "1단계 소요 시간" : progress.currentStage === 2 ? "2단계 소요 시간" : "소요 시간"}
            </div>
            <div className="text-xl font-bold mt-1 text-gray-700 dark:text-gray-300 font-digital flex items-center justify-center">
              {formatDuration(localTime.elapsedTime)}
              {status === 'running' && (
                <div className={`ml-2 ${flipTimer % 2 === 0 ? 'opacity-100' : 'opacity-0'} transition-opacity duration-500`}>
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              )}
            </div>
          </div>

          <div className="bg-gray-50 dark:bg-gray-700 p-2 rounded-md">
            <p className="text-xs text-gray-500 dark:text-gray-400">예상 남은 시간</p>
            <p className={`text-lg sm:text-xl font-bold ${animatedDigits.remainingTime ? 'animate-pulse-once' : ''}`}>
              {remainingTimeDisplay}
            </p>
          </div>
        </div>

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

        {getRetryInfo()}

        {getEstimatedEndTime()}

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
                    (targetPageCount * (config.productsPerPage || 12))
                  } 제품 수집 완료
                </div>
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
        isLoading={isAppStatusChecking}
        loadingContent={<StatusCheckLoadingAnimation />}
      >
        {Object.keys(statusSummary || {}).length === 0 ? (
          <div className="flex flex-col items-center justify-center h-20">
            <p className="text-center text-gray-600 dark:text-gray-400">
              사이트와 로컬 DB 정보를 비교하려면<br/>"상태 체크" 버튼을 클릭하세요.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
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
    </>
  );
}