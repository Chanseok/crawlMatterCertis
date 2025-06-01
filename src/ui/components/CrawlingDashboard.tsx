console.log('[DASHBOARD] 🚀 CrawlingDashboard.tsx module loaded');

import { useEffect, useState, useRef, useCallback, useMemo, Dispatch, SetStateAction } from 'react';
import { observer } from 'mobx-react-lite';
import type { CrawlingStatusSummary } from '../../../types'; // Only import what's used

// Clean Architecture - Display Components (Single Responsibility)
import { CrawlingStageDisplay } from './displays/CrawlingStageDisplay';
import { CrawlingControlsDisplay } from './displays/CrawlingControlsDisplay';
import { CrawlingMetricsDisplay } from './displays/CrawlingMetricsDisplay';
import { TimeDisplay } from './displays/TimeDisplay';

// Legacy Components (to be migrated)
import { ExpandableSection } from './ExpandableSection';
import StatusCheckLoadingAnimation from './StatusCheckLoadingAnimation';
import { RetryStatusIndicator } from './RetryStatusIndicator';
import { StageTransitionIndicator } from './StageTransitionIndicator';
import { ValidationResultsPanel } from './ValidationResultsPanel';

// Domain Store Hooks (Primary State Management)
import { useCrawlingStore } from '../hooks/useCrawlingStore';
import { useTaskStore } from '../hooks/useTaskStore';

// ViewModel for Complex UI Logic (Secondary Helper)
import { CrawlingDashboardViewModel } from '../viewmodels/CrawlingDashboardViewModel';

import { format } from 'date-fns';

interface CrawlingDashboardProps {
  appCompareExpanded: boolean;
  setAppCompareExpanded: Dispatch<SetStateAction<boolean>>;
}

/**
 * CrawlingDashboard Component - Clean Architecture Implementation
 * 
 * Architecture Pattern:
 * - Primary: Domain Store (useCrawlingStore, useTaskStore) - Main state management
 * - Secondary: ViewModel (CrawlingDashboardViewModel) - Complex UI logic helper
 * - Tertiary: Display Components - Single responsibility UI elements
 * 
 * This maintains Domain Store architecture while adding Clean Code patterns
 */
function CrawlingDashboard({ appCompareExpanded, setAppCompareExpanded }: CrawlingDashboardProps) {
  console.log('[DASHBOARD] 🎨 CrawlingDashboard component rendering...');
  
  // === PRIMARY: Domain Store Hooks (Main State Management) ===
  console.log('[DASHBOARD] 🔧 Calling useCrawlingStore hook...');
  const { 
    status,
    progress, 
    config,
    statusSummary, 
    startCrawling,
    stopCrawling,
    checkStatus,
    error,
    clearError
  } = useCrawlingStore();

  // === DEBUG: Log statusSummary changes ===
  useEffect(() => {
    console.log('[CrawlingDashboard] 🔍 statusSummary changed:', statusSummary);
    console.log('[CrawlingDashboard] 🔍 statusSummary keys:', statusSummary ? Object.keys(statusSummary) : 'null/undefined');
    console.log('[CrawlingDashboard] 🔍 dbProductCount:', statusSummary?.dbProductCount);
    console.log('[CrawlingDashboard] 🔍 siteProductCount:', statusSummary?.siteProductCount);
    console.log('[CrawlingDashboard] 🔍 diff:', statusSummary?.diff);
    console.log('[CrawlingDashboard] 🔍 needCrawling:', statusSummary?.needCrawling);
  }, [statusSummary]);
  
  const { concurrentTasks } = useTaskStore();

  // === SECONDARY: ViewModel for Complex UI Logic (Helper) ===
  const viewModel = useMemo(() => new CrawlingDashboardViewModel(), []);
  
  // === LOCAL UI STATE (Component-specific only) ===
  const [isStatusChecking, setIsStatusChecking] = useState(false);
  const [showCompletion, setShowCompletion] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [localTime, setLocalTime] = useState({ elapsedTime: 0, remainingTime: 0 });
  const [flipTimer, setFlipTimer] = useState(0);
  const [animatedDigits, setAnimatedDigits] = useState({
    currentPage: false,
    processedItems: false,
    retryCount: false,
    newItems: false,
    updatedItems: false,
    elapsedTime: false,
    remainingTime: false
  });
  // --- NEW: Retain frozen concurrentTasks grid after stage 1 ---
  const [frozenConcurrentTasks, setFrozenConcurrentTasks] = useState<any[]>([]);
  const prevStageRef = useRef(viewModel.currentStage);

  // Watch for stage transition from 1 to 2 to freeze the grid
  useEffect(() => {
    if (prevStageRef.current === 1 && viewModel.currentStage === 2) {
      setFrozenConcurrentTasks(concurrentTasks ? [...concurrentTasks] : []);
    }
    prevStageRef.current = viewModel.currentStage;
  }, [viewModel.currentStage, concurrentTasks]);

  // Refs for cleanup
  const completionTimerRef = useRef<number | null>(null);
  const prevProgress = useRef(progress);

  // === COMPUTED VALUES (Clean Code Pattern) ===
  // Direct access to avoid MobX cycles - computed properties are already memoized by MobX
  const targetPageCount = viewModel.targetPageCount;
  const calculatedPercentage = viewModel.calculatedPercentage;

  // DEBUG: Add real-time progress monitoring
  useEffect(() => {
    console.log('[CrawlingDashboard] 🔍 Progress Data Debug:', {
      status,
      currentStage: viewModel.currentStage,
      currentStep: viewModel.currentStep,
      currentPage: progress.currentPage,
      totalPages: progress.totalPages,
      processedItems: progress.processedItems,
      totalItems: progress.totalItems,
      percentage: progress.percentage,
      calculatedPercentage,
      targetPageCount,
      concurrentTasksLength: concurrentTasks?.length || 0,
      message: progress.message
    });
  }, [status, viewModel.currentStage, viewModel.currentStep, progress, calculatedPercentage, targetPageCount, concurrentTasks]);

  const isBeforeStatusCheck = useMemo(() => 
    status === 'idle' && !statusSummary?.dbLastUpdated, 
    [status, statusSummary?.dbLastUpdated]
  );

  const isAfterStatusCheck = useMemo(() => 
    status === 'idle' && !!statusSummary?.dbLastUpdated, 
    [status, statusSummary?.dbLastUpdated]
  );

  // === EVENT HANDLERS (Clean Code Pattern) ===
  const toggleCompareSection = useCallback(() => {
    setAppCompareExpanded(!appCompareExpanded);
  }, [appCompareExpanded, setAppCompareExpanded]);

  const isValueChanged = useCallback((key: keyof CrawlingStatusSummary): boolean => {
    return viewModel.isValueChanged(key);
  }, [viewModel]);

  const handleCheckStatus = useCallback(async () => {
    try {
      console.log('=== 상태 체크 시작 ===');
      setIsStatusChecking(true);
      setAppCompareExpanded(true);
      
      await checkStatus();
      console.log('=== 상태 체크 완료 ===');
    } catch (error) {
      console.error('상태 체크 실패:', error);
    } finally {
      setTimeout(() => setIsStatusChecking(false), 1500);
    }
  }, [checkStatus, setAppCompareExpanded]);

  // === UI STATE METHODS (Using ViewModel) ===
  const getStageBadge = useCallback(() => {
    const stageInfo = viewModel.stageInfo;
    return (
      <span className={`px-3 py-1 rounded-full text-sm font-medium ${stageInfo.color}`}>
        {stageInfo.text}
      </span>
    );
  }, [viewModel]);

  const getRetryInfo = useCallback(() => {
    return <RetryStatusIndicator className="mt-2" />;
  }, []);

  const getEstimatedEndTime = useCallback(() => {
    if (status !== 'running' || !localTime.remainingTime) return null;
    
    const estimatedEndTime = new Date(Date.now() + localTime.remainingTime);
    return (
      <div className="mt-4 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-md border border-blue-100 dark:border-blue-800 text-sm text-blue-800 dark:text-blue-300">
        예상 완료 시간: {format(estimatedEndTime, 'HH:mm:ss')}
      </div>
    );
  }, [status, localTime.remainingTime]);

  const formatDuration = useCallback((ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    const remainingMinutes = minutes % 60;
    const remainingSeconds = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${remainingMinutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    return `${remainingMinutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }, []);

  // === EFFECTS (Lifecycle Management) ===
  
  // Timer effect for elapsed/remaining time
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    if (status === 'running') {
      timer = setInterval(() => {
        setLocalTime(prev => {
          // Simple remaining time calculation
          const elapsedSeconds = (prev.elapsedTime + 1000) / 1000;
          const currentPage = progress.currentPage || 0;
          const estimatedTotalTime = elapsedSeconds > 0 && currentPage > 0 ? 
            (elapsedSeconds / currentPage) * targetPageCount : 0;
          const newRemainingTime = Math.max(0, (estimatedTotalTime - elapsedSeconds) * 1000);

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

    return () => {
      if (timer) {
        clearInterval(timer);
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

  // Completion status handling
  useEffect(() => {
    if (status === 'completed' && viewModel.currentStage === 2) {
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
      }, isCompleteSuccess ? 10000 : 5000);
    } else {
      setShowCompletion(false);
    }

    return () => {
      if (completionTimerRef.current) {
        clearTimeout(completionTimerRef.current);
        completionTimerRef.current = null;
      }
    };
  }, [status, viewModel.currentStage, progress.processedItems, progress.totalItems, targetPageCount, config.productsPerPage, statusSummary?.siteProductCount]);

  // Animation effect for digit changes
  useEffect(() => {
    const timers: number[] = [];
    
    if (prevProgress.current) {
      // Simple field change detection
      const fieldsToCheck = ['currentPage', 'processedItems', 'retryCount', 'newItems', 'updatedItems'];
      
      fieldsToCheck.forEach(field => {
        const currentValue = progress[field as keyof typeof progress];
        const prevValue = prevProgress.current[field as keyof typeof progress];
        
        if (currentValue !== prevValue) {
          setAnimatedDigits(prev => ({ ...prev, [field]: true }));
          const timer = window.setTimeout(
            () => setAnimatedDigits(prev => ({ ...prev, [field]: false })), 
            300
          );
          timers.push(timer);
        }
      });
    }
    
    prevProgress.current = { ...progress };
    
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

  // Animated values effect using ViewModel
  useEffect(() => {
    // Use ViewModel's animation method
    viewModel.startValueAnimation();

    return () => {
      viewModel.cleanup();
    };
  }, [
    progress.percentage, 
    progress.currentPage, 
    progress.processedItems, 
    progress.newItems, 
    progress.updatedItems, 
    progress.retryCount,
    viewModel.currentStage,
    progress.stage1PageStatuses,
    calculatedPercentage,
    concurrentTasks,
    viewModel
  ]);

  // Component cleanup
  useEffect(() => {
    return () => {
      viewModel.cleanup();
      if (completionTimerRef.current) {
        clearTimeout(completionTimerRef.current);
        completionTimerRef.current = null;
      }
    };
  }, [viewModel]);

  // === TEMPORARY DEBUG: Auto-trigger status check to test the functionality and see debug output ===
  // useEffect(() => {
  //   const autoTriggerStatusCheck = async () => {
  //     console.log('[CrawlingDashboard] 🚀 Auto-triggering status check for debugging...');
  //     await handleCheckStatus();
  //   };

  //   // Auto-trigger after 2 seconds delay
  //   const timer = setTimeout(autoTriggerStatusCheck, 2000);
  //   return () => clearTimeout(timer);
  // }, []); // Only run once on mount

  // === RENDER ===
  return (
    <>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-white">수집 상태</h2>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
            <div className="flex justify-between items-center">
              <span>{error.message}</span>
              <button 
                onClick={clearError}
                className="text-red-500 hover:text-red-700 font-bold"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Control Buttons */}
        <CrawlingControlsDisplay 
          status={status}
          isStatusChecking={isStatusChecking}
          onCheckStatus={handleCheckStatus}
          onStartCrawling={startCrawling}
          onStopCrawling={stopCrawling}
        />



        {        /* Stage Information */}
        <CrawlingStageDisplay 
          getStageBadge={getStageBadge}
          currentStep={viewModel.currentStep}
        />

        {/* Metrics Display */}
        <CrawlingMetricsDisplay 
          progress={progress}
          calculatedPercentage={calculatedPercentage}
          animatedValues={viewModel.animatedValues}
          animatedDigits={animatedDigits}
        />

        {/* Time Information Display */}
        <TimeDisplay 
          localTime={localTime}
          formatDuration={formatDuration}
          isBeforeStatusCheck={isBeforeStatusCheck}
          isAfterStatusCheck={isAfterStatusCheck}
        />

        {/* Redesigned Batch Progress Section */}
        {(() => {
          const hasCurrentBatch = progress.currentBatch !== undefined && progress.currentBatch !== null;
          const hasTotalBatches = progress.totalBatches !== undefined && progress.totalBatches !== null;
          const totalBatchesGreaterThan1 = (progress.totalBatches || 0) > 1;
          // 더 넓은 범위의 상태에서 배치 UI 표시 (initializing은 배치 처리 시작 시 나타남)
          const statusMatches = status === 'running' || status === 'initializing' || status === 'idle' || status === 'paused';
          
          // 🔧 배치 UI 조건을 더 유연하게 수정
          // Stage 3에서 제품 상세정보 수집 중인 경우 배치 UI를 강제 표시
          const isStage3Running = viewModel.currentStage === 3 && statusMatches;
          
          // 원본 배치 UI 조건 또는 Stage 3 실행 중인 경우
          const batchUICondition = (hasCurrentBatch && hasTotalBatches && totalBatchesGreaterThan1 && statusMatches) || isStage3Running;
          
          console.log('[CrawlingDashboard] 🎯 배치 UI 조건 체크 (수정됨):', {
            originalData: {
              currentBatch: progress.currentBatch,
              hasCurrentBatch,
              totalBatches: progress.totalBatches,
              hasTotalBatches,
              totalBatchesGreaterThan1
            },
            stage3Fallback: {
              currentStage: viewModel.currentStage,
              isStage3Running
            },
            status: status,
            statusMatches,
            finalCondition: batchUICondition,
            progressKeys: Object.keys(progress),
            batchData: { 
              currentBatch: progress.currentBatch, 
              totalBatches: progress.totalBatches,
              batchRetryCount: progress.batchRetryCount,
              batchRetryLimit: progress.batchRetryLimit
            },
            renderTest: 'BATCH_UI_SHOULD_RENDER'
          });
          
          // 🚨 FORCE SHOW BATCH UI FOR DEBUGGING
          console.log('[CrawlingDashboard] 🚨 FORCE RENDERING BATCH UI FOR DEBUG');
          return true; // Force render for now to debug
        })() && (
          <div className="mt-6 mb-4 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-md border border-amber-200 dark:border-amber-700">
            {/* 1. 전체 배치 진행률 */}
            <div className="flex items-center mb-2">
              {(() => {
                // Stage 3에서는 기본값 사용, 그 외에는 progress 데이터 사용
                const displayCurrentBatch = progress.currentBatch ?? 1;
                const displayTotalBatches = progress.totalBatches ?? 1;
                return (
                  <>
                    <span className="font-semibold text-amber-700 dark:text-amber-300 mr-2">
                      총 {displayTotalBatches}회 중 {displayCurrentBatch}회차 진행 중
                    </span>
                    {progress.batchRetryCount !== undefined && progress.batchRetryCount > 0 && (
                      <span className="ml-2 text-xs text-amber-600 dark:text-amber-400 font-medium">(배치 재시도: {progress.batchRetryCount}/{progress.batchRetryLimit || 3})</span>
                    )}
                  </>
                );
              })()}
            </div>
            <div className="mb-3">
              <div className="flex justify-between items-center text-xs text-gray-600 dark:text-gray-400 mb-1">
                <span>전체 배치 진행률</span>
                <span>
                  {(() => {
                    const displayCurrentBatch = progress.currentBatch ?? 1;
                    const displayTotalBatches = progress.totalBatches ?? 1;
                    return `${displayCurrentBatch} / ${displayTotalBatches}`;
                  })()}
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                <div
                  className="h-2.5 rounded-full transition-all duration-300 bg-amber-400 animate-pulse"
                  style={{ 
                    width: `${(() => {
                      const displayCurrentBatch = progress.currentBatch ?? 1;
                      const displayTotalBatches = progress.totalBatches ?? 1;
                      return Math.min(100, Math.max(0, (displayCurrentBatch / displayTotalBatches) * 100));
                    })()}%` 
                  }}
                />
              </div>
            </div>

            {/* 2. 동시 페이지 수집 현황 grid/dot 시각화 (실제 병렬 작업 기준) */}
            {viewModel.currentStage === 1 && Array.isArray(concurrentTasks) && concurrentTasks.length > 0 && (
              <div className="mt-2">
                <div className="flex items-center mb-1 text-xs text-blue-700 dark:text-blue-300">
                  <span>동시 페이지 수집 현황</span>
                  <span className="ml-2 text-gray-500 dark:text-gray-400">(최대 {config.batchSize || config.pageRangeLimit || 12}개 동시)</span>
                </div>
                <div className="grid grid-cols-8 gap-1">
                  {concurrentTasks.slice(0, config.batchSize || config.pageRangeLimit || 12).map((task, idx) => {
                    let color = 'bg-gray-300 dark:bg-gray-700 text-gray-500';
                    let icon = '';
                    switch (task.status) {
                      case 'success':
                        color = 'bg-green-400 text-white';
                        icon = '✔';
                        break;
                      case 'error':
                      case 'failed':
                        color = 'bg-red-400 text-white animate-pulse';
                        icon = '!';
                        break;
                      case 'running':
                      case 'attempting':
                        color = 'bg-blue-400 text-white animate-pulse';
                        icon = '▶';
                        break;
                      case 'incomplete':
                        color = 'bg-yellow-400 text-white';
                        icon = '~';
                        break;
                      case 'pending':
                      case 'waiting':
                      default:
                        color = 'bg-gray-300 dark:bg-gray-700 text-gray-500';
                        icon = '';
                    }
                    return (
                      <div key={task.pageNumber || idx} className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold ${color}`}
                        title={`페이지 ${task.pageNumber}: ${task.status}`}
                      >
                        {icon}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {/* --- NEW: Show frozen grid in stage 2 --- */}
            {viewModel.currentStage === 2 && frozenConcurrentTasks.length > 0 && (
              <div className="mt-2">
                <div className="flex items-center mb-1 text-xs text-blue-700 dark:text-blue-300">
                  <span>동시 페이지 수집 현황 (1단계 결과)</span>
                  <span className="ml-2 text-gray-500 dark:text-gray-400">(최대 {config.batchSize || config.pageRangeLimit || 12}개 동시)</span>
                </div>
                <div className="grid grid-cols-8 gap-1">
                  {frozenConcurrentTasks.slice(0, config.batchSize || config.pageRangeLimit || 12).map((task, idx) => {
                    let color = 'bg-gray-300 dark:bg-gray-700 text-gray-500';
                    let icon = '';
                    switch (task.status) {
                      case 'success':
                        color = 'bg-green-400 text-white';
                        icon = '✔';
                        break;
                      case 'error':
                      case 'failed':
                        color = 'bg-red-400 text-white animate-pulse';
                        icon = '!';
                        break;
                      case 'running':
                      case 'attempting':
                        color = 'bg-blue-400 text-white animate-pulse';
                        icon = '▶';
                        break;
                      case 'incomplete':
                        color = 'bg-yellow-400 text-white';
                        icon = '~';
                        break;
                      case 'pending':
                      case 'waiting':
                      default:
                        color = 'bg-gray-300 dark:bg-gray-700 text-gray-500';
                        icon = '';
                    }
                    return (
                      <div key={task.pageNumber || idx} className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold ${color}`}
                        title={`페이지 ${task.pageNumber}: ${task.status}`}
                      >
                        {icon}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Stage Transition Indicator (Milestone Progress Bar) - Moved below batch progress */}
        <StageTransitionIndicator 
          currentStage={viewModel.currentStage}
          currentStep={viewModel.currentStep}
        />

        {/* Enhanced Progress Display - Shows page progress for stage 1, validation for stage 1.5, product progress for stage 2 */}
        {status !== 'idle' &&        (
          (viewModel.currentStage === 1 && ((progress.totalPages && progress.totalPages > 0) || (Array.isArray(concurrentTasks) && concurrentTasks.length > 0))) ||
          (viewModel.currentStage === 2) ||
          (viewModel.currentStage === 3 && (progress.totalItems && progress.totalItems > 0))
        ) && (
          <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <div className="flex justify-between items-center mb-2">
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {(() => {
                  const currentStage = viewModel.currentStage;
                  if (currentStage === 2) {
                    return '제품 데이터 검증 중...';
                  } else if (currentStage === 3) {
                    return '제품 상세정보 수집 진행률';
                  } else {
                    return `진행률 (${viewModel.currentStage}단계)`;
                  }
                })()}
              </span>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {(() => {
                  const currentStage = viewModel.currentStage;
                  if (currentStage === 2) {
                    // Stage 2: Show validation progress
                    return '검증 중...';
                  } else if (currentStage === 3) {
                    // Stage 3: Show product-based progress with improved calculation
                    const processedItems = progress.processedItems || progress.current || 0;
                    const totalItems = progress.totalItems || progress.total || 0;
                    
                    console.log('[CrawlingDashboard] Stage 3 Progress Data:', {
                      processedItems,
                      totalItems,
                      progressCurrent: progress.current,
                      progressTotal: progress.total,
                      progressProcessedItems: progress.processedItems,
                      progressTotalItems: progress.totalItems,
                      allProgressKeys: Object.keys(progress)
                    });
                    
                    return `${processedItems} / ${totalItems}`;
                  } else {
                    // Stage 1: Enhanced page detection using concurrentTasks data for more accurate progress
                    let currentPage = progress.currentPage || 0;
                    let totalPages = progress.totalPages || 0;
                    
                    // If we have concurrentTasks data, use it for better accuracy
                    if (Array.isArray(concurrentTasks) && concurrentTasks.length > 0) {
                      const successfulPages = concurrentTasks.filter(task => task.status === 'success').length;
                      currentPage = Math.max(currentPage, successfulPages);
                      
                      // If totalPages is not set but we have concurrent tasks, estimate from config
                      if (totalPages === 0) {
                        totalPages = config.batchSize || config.pageRangeLimit || 12;
                      }
                    }
                    
                    return `${currentPage} / ${totalPages}`;
                  }
                })()}
              </span>
            </div>
            
            <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all duration-300 ${
                  status === 'completed' ? 'bg-green-500' : 
                  status === 'error' ? 'bg-red-500' : 'bg-blue-500'
                }`}
                style={{ 
                  width: `${(() => {
                    if (viewModel.currentStage === 2) {
                      // Stage 2: Product-based percentage calculation
                      const processedItems = progress.processedItems || 0;
                      const totalItems = progress.totalItems || 0;
                      const percentage = totalItems > 0 ? (processedItems / totalItems) * 100 : 0;
                      return Math.min(100, Math.max(0, percentage));
                    } else if (viewModel.currentStage === 3) {
                      // Stage 3: Improved product detail progress calculation
                      const processedItems = progress.processedItems || progress.current || 0;
                      const totalItems = progress.totalItems || progress.total || 0;
                      const percentage = totalItems > 0 ? (processedItems / totalItems) * 100 : 0;
                      const safePercentage = Math.min(100, Math.max(0, percentage));
                      
                      console.log('[CrawlingDashboard] Stage 3 Progress Calculation:', {
                        processedItems,
                        totalItems,
                        percentage,
                        safePercentage
                      });
                      
                      return safePercentage;
                    } else {
                      // Stage 1: Enhanced page percentage calculation using concurrentTasks
                      let currentPage = progress.currentPage || 0;
                      let totalPages = progress.totalPages || 0;
                      
                      if (Array.isArray(concurrentTasks) && concurrentTasks.length > 0) {
                        const successfulPages = concurrentTasks.filter(task => task.status === 'success').length;
                        currentPage = Math.max(currentPage, successfulPages);
                        
                        if (totalPages === 0) {
                          totalPages = config.batchSize || config.pageRangeLimit || 12;
                        }
                      }
                      
                      const percentage = totalPages > 0 ? (currentPage / totalPages) * 100 : 0;
                      return Math.min(100, Math.max(0, percentage));
                    }
                  })()}%` 
                }}
              />
            </div>
            
            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
              <span>
                {(() => {
                  if (viewModel.currentStage === 3) {
                    // Stage 3: Product detail progress percentage
                    const processedItems = progress.processedItems || progress.current || 0;
                    const totalItems = progress.totalItems || progress.total || 0;
                    const percentage = totalItems > 0 ? (processedItems / totalItems) * 100 : 0;
                    return `${Math.round(percentage)}% 완료`;
                  } else {
                    // Stage 1: Page progress percentage
                    let currentPage = progress.currentPage || 0;
                    let totalPages = progress.totalPages || 0;
                    
                    if (Array.isArray(concurrentTasks) && concurrentTasks.length > 0) {
                      const successfulPages = concurrentTasks.filter(task => task.status === 'success').length;
                      currentPage = Math.max(currentPage, successfulPages);
                      
                      if (totalPages === 0) {
                        totalPages = config.batchSize || config.pageRangeLimit || 12;
                      }
                    }
                    
                    const percentage = totalPages > 0 ? (currentPage / totalPages) * 100 : 0;
                    return Math.round(percentage);
                  }
                })()}% 완료
              </span>
              <span>
                {(() => {
                  if (viewModel.currentStage === 3) {
                    // Stage 3: Remaining products
                    const processedItems = progress.processedItems || progress.current || 0;
                    const totalItems = progress.totalItems || progress.total || 0;
                    const remaining = totalItems - processedItems;
                    return remaining > 0 ? `${remaining}개 제품 남음` : '완료';
                  } else {
                    // Stage 1: Remaining pages
                    let currentPage = progress.currentPage || 0;
                    let totalPages = progress.totalPages || 0;
                    
                    if (Array.isArray(concurrentTasks) && concurrentTasks.length > 0) {
                      const successfulPages = concurrentTasks.filter(task => task.status === 'success').length;
                      currentPage = Math.max(currentPage, successfulPages);
                      
                      if (totalPages === 0) {
                        totalPages = config.batchSize || config.pageRangeLimit || 12;
                      }
                    }
                    
                    const remaining = totalPages - currentPage;
                    return remaining > 0 ? `${remaining}페이지 남음` : '완료';
                  }
                })()}
              </span>
            </div>
          </div>
        )}

        {/* Collection Results for Stage 2 */}
        {viewModel.currentStage === 2 && (progress.newItems !== undefined || progress.updatedItems !== undefined) && (
          <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-md">
            <div className="text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">수집 결과</div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400">신규 항목</div>
                <div className={`font-digital text-2xl font-bold text-green-600 dark:text-green-400 transition-all duration-300 ${animatedDigits.newItems ? 'animate-flip' : ''}`}>
                  {Math.round(viewModel.animatedValues.newItems)}
                  <span className="text-sm text-gray-500">개</span>
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400">업데이트 항목</div>
                <div className={`font-digital text-2xl font-bold text-blue-600 dark:text-blue-400 transition-all duration-300 ${animatedDigits.updatedItems ? 'animate-flip' : ''}`}>
                  {Math.round(viewModel.animatedValues.updatedItems)}
                  <span className="text-sm text-gray-500">개</span>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Validation Results Panel */}
        <ValidationResultsPanel 
          validationSummary={progress.validationSummary}
          recommendations={progress.rangeRecommendations}
          isVisible={
            (status === 'running' || status === 'completed' || status === 'paused') && 
            (progress.validationSummary !== undefined ||
             (viewModel.currentStep?.toLowerCase().includes('검증') || 
              viewModel.currentStep?.toLowerCase().includes('로컬db') ||
              viewModel.currentStep?.toLowerCase().includes('1.5/3') ||
              viewModel.currentStep?.toLowerCase().includes('db 중복')))
          }
          isInProgress={
            status === 'running' && 
            progress.validationSummary === undefined &&
            (viewModel.currentStep?.toLowerCase().includes('검증') || 
             viewModel.currentStep?.toLowerCase().includes('로컬db') ||
             viewModel.currentStep?.toLowerCase().includes('1.5/3') ||
             viewModel.currentStep?.toLowerCase().includes('db 중복'))
          }
          isCompleted={status === 'completed'}
          hasErrors={status === 'error'}
        />

        {getRetryInfo()}
        {getEstimatedEndTime()}

        {/* Progress Information for Stage 1 */}
        {status === 'running' && (viewModel.currentStage === 1 || 
          (viewModel.currentStep?.toLowerCase().includes('검증') || 
           viewModel.currentStep?.toLowerCase().includes('로컬db') ||
           viewModel.currentStep?.toLowerCase().includes('1.5/3'))) && (
          <div className="mt-3 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-md border border-blue-100 dark:border-blue-800 text-sm">
            <div className="font-medium text-blue-800 dark:text-blue-300 mb-1">진행 정보:</div>
            <ul className="text-xs text-gray-700 dark:text-gray-300">
              <li>• 총 페이지 수: {targetPageCount}페이지</li>
              <li>• 현재까지 성공한 페이지: {
                (() => {
                  if (status !== 'running' || viewModel.currentStage !== 1) {
                    return progress.currentPage || 0;
                  }
                  
                  let successPageCount = 0;
                  
                  if (progress.stage1PageStatuses && Array.isArray(progress.stage1PageStatuses)) {
                    const successStatusPages = progress.stage1PageStatuses.filter(p => p.status === 'success').length;
                    successPageCount = Math.max(successPageCount, successStatusPages);
                  }
                  
                  if (concurrentTasks && concurrentTasks.length > 0) {
                    const successTasksCount = concurrentTasks.filter((task) => task.status === 'success').length;
                    successPageCount = Math.max(successPageCount, successTasksCount);
                  }
                  
                  if (progress.currentPage !== undefined && progress.currentPage > 0) {
                    successPageCount = Math.max(successPageCount, progress.currentPage);
                  }
                  
                  return successPageCount;
                })()
              }페이지</li>
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
            </ul>
          </div>
        )}

        {/* Progress Message */}
        {progress.message && (
          <div className="mt-4 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-md border border-blue-100 dark:border-blue-800 text-sm text-blue-800 dark:text-blue-300">
            {progress.currentStage === 1 && targetPageCount ?
              `${progress.message} (목표 페이지: ${targetPageCount}페이지)` :
              progress.message
            }
          </div>
        )}

        {/* Critical Error */}
        {progress.criticalError && (
          <div className="mt-4 p-2 bg-red-50 dark:bg-red-900/20 rounded-md border border-red-100 dark:border-red-800 text-sm text-red-800 dark:text-red-300">
            오류: {progress.criticalError}
          </div>
        )}

        {/* Running Animation */}
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

        {/* Completion Celebration */}
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

      {/* Site-Local Comparison Section */}
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
        {(() => {
          const showLoadingState = !statusSummary || (statusSummary.dbProductCount === undefined && statusSummary.siteProductCount === undefined);
          console.log('[CrawlingDashboard] 🔍 Show loading state check:', {
            hasStatusSummary: !!statusSummary,
            dbProductCountUndefined: statusSummary?.dbProductCount === undefined,
            siteProductCountUndefined: statusSummary?.siteProductCount === undefined,
            showLoadingState
          });
          return showLoadingState;
        })() ? (
          <div className="flex flex-col items-center justify-center h-20">
            <p className="text-center text-gray-600 dark:text-gray-400">
              사이트와 로컬 DB 정보를 비교하려면<br/>"상태 체크" 버튼을 클릭하세요.
            </p>
          </div>
        ) : statusSummary ? (
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
                {statusSummary.dbProductCount !== undefined ? statusSummary.dbProductCount.toLocaleString() : '?'}개
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">사이트 페이지 수:</span>
              <span className={`font-medium ${isValueChanged('siteTotalPages') ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-800 dark:text-gray-200'}`}>
                {statusSummary.siteTotalPages !== undefined ? statusSummary.siteTotalPages.toLocaleString() : '?'}페이지
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">사이트 제품 수:</span>
              <span className={`font-medium ${isValueChanged('siteProductCount') ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-800 dark:text-gray-200'}`}>
                {statusSummary.siteProductCount !== undefined ? statusSummary.siteProductCount.toLocaleString() : '?'}개
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">차이:</span>
              <span className={`font-medium ${isValueChanged('diff') ? 'text-yellow-600 dark:text-yellow-400' : (statusSummary.diff !== undefined && statusSummary.diff > 0) ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                {statusSummary.diff !== undefined ? `${statusSummary.diff > 0 ? '+' : ''}${statusSummary.diff.toLocaleString()}개` : '?개'}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">크롤링 필요:</span>
              <span className={`font-medium ${isValueChanged('needCrawling') ? 'text-yellow-600 dark:text-yellow-400' : statusSummary.needCrawling ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                {statusSummary.needCrawling !== undefined ? (statusSummary.needCrawling ? '예' : '아니오') : '?'}
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
        ) : (
          <div className="p-4 text-center text-gray-500 dark:text-gray-400">
            상태 정보를 불러오는 중...
          </div>
        )}
      </ExpandableSection>
    </>
  );
}

// MobX observer for automatic Domain Store reactivity
export default observer(CrawlingDashboard);