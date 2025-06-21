import React, { useEffect, useState, useRef, useCallback, useMemo, Dispatch, SetStateAction } from 'react';
import { observer } from 'mobx-react-lite';
import { toJS } from 'mobx';
import { CrawlingUtils } from '../../shared/utils/CrawlingUtils';
import type { CrawlingStatusSummary, MissingDataAnalysis } from '../../../types';

// Clean Architecture - Display Components (Single Responsibility)
import { CrawlingStageDisplay } from './displays/CrawlingStageDisplay';
import { CrawlingControlsDisplay } from './displays/CrawlingControlsDisplay';
import { CrawlingMetricsDisplay } from './displays/CrawlingMetricsDisplay';
import { TimeEstimationDisplay } from './displays/TimeEstimationDisplay';

// Legacy Components (to be migrated)
import { ExpandableSection } from './ExpandableSection';
import StatusCheckLoadingAnimation from './StatusCheckLoadingAnimation';
import { RetryStatusIndicator } from './RetryStatusIndicator';
import { StageTransitionIndicator } from './StageTransitionIndicator';
import { ValidationResultsPanel } from './ValidationResultsPanel';
import { StoppingOverlay } from './StoppingOverlay';
import { ConcurrentTasksVisualizer } from '../Charts';

// Domain Store Hooks (Primary State Management)
import { useCrawlingStore } from '../hooks/useCrawlingStore';
import { useTaskStore } from '../hooks/useTaskStore';

// ViewModel for Complex UI Logic (Secondary Helper)
import { CrawlingDashboardViewModel } from '../viewmodels/CrawlingDashboardViewModel';
import { StatusTabViewModel } from '../viewmodels/StatusTabViewModel';

// Configuration and Page Range Utilities
import { useConfigurationViewModel } from '../providers/ViewModelProvider';

// Centralized Logging and Utilities
import { Logger } from '../../shared/utils';

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
const CrawlingDashboard: React.FC<CrawlingDashboardProps> = ({ appCompareExpanded, setAppCompareExpanded }) => {
  // Logger instance for this component
  const dashboardLogger = useMemo(() => new Logger('CrawlingDashboard'), []);

  // === PRIMARY: Domain Store Hooks (Main State Management) ===
  const { 
    status,
    progress, 
    config,
    statusSummary, 
    startCrawling,
    stopCrawling,
    checkStatus,
    error,
    clearError,
    isStopping
  } = useCrawlingStore();

  // === Configuration for Page Range Info ===
  const configurationViewModel = useConfigurationViewModel();

  // === Auto-recalculate page range when component mounts or config changes ===
  useEffect(() => {
    dashboardLogger.debug('Component mounted or config changed, checking page range calculation...', {
      data: {
        hasPageRangeCalculation: !!configurationViewModel.lastPageRangeCalculation,
        hasStatusSummary: !!statusSummary,
        statusSummaryKeys: statusSummary ? Object.keys(statusSummary) : null,
        configPageRangeLimit: configurationViewModel.config?.pageRangeLimit,
        configProductsPerPage: configurationViewModel.config?.productsPerPage,
        siteTotalPages: statusSummary?.siteTotalPages,
        siteProductCount: statusSummary?.siteProductCount,
        lastPageRangeCalculation: configurationViewModel.lastPageRangeCalculation
      }
    });
    
    // statusSummary가 있고 페이지 정보가 있으면 항상 재계산 (설정 변경 시 반영)
    const shouldRecalculate = statusSummary && (statusSummary.siteTotalPages || statusSummary.totalPages);
    
    dashboardLogger.debug('Should recalculate check result', { data: { shouldRecalculate } });
    
    if (shouldRecalculate) {
      dashboardLogger.info('Triggering page range recalculation...');
      // 비동기로 재계산하고 강제 리렌더링
      setTimeout(() => {
        configurationViewModel.recalculatePageRangeManually();
        setForceUpdateCounter(prev => prev + 1);
      }, 0);
    } else {
      dashboardLogger.debug('Skipping recalculation', {
        data: {
          shouldRecalculate,
          hasStatusSummary: !!statusSummary,
          hasTotalPages: !!(statusSummary?.siteTotalPages || statusSummary?.totalPages)
        }
      });
    }
  }, [configurationViewModel, statusSummary?.siteTotalPages, statusSummary?.siteProductCount, configurationViewModel.config]);

  // === Watch for config changes specifically to trigger page range recalculation ===
  useEffect(() => {
    const pageRangeLimit = configurationViewModel.config?.pageRangeLimit;
    dashboardLogger.debug('pageRangeLimit changed', { data: { pageRangeLimit } });
    
    if (pageRangeLimit && statusSummary && (statusSummary.siteTotalPages || statusSummary.totalPages)) {
      dashboardLogger.info('Config change triggered page range recalculation');
      // 설정 변경 시 즉시 재계산 및 강제 리렌더링
      setTimeout(() => {
        configurationViewModel.recalculatePageRangeManually();
        setForceUpdateCounter(prev => prev + 1);
      }, 100); // 약간의 지연으로 설정 적용 완료 대기
    }
  }, [configurationViewModel.config?.pageRangeLimit, configurationViewModel, statusSummary]);

  // === Force re-render when lastPageRangeCalculation changes ===
  const [, forceRender] = useState({});
  useEffect(() => {
    dashboardLogger.debug('Page range calculation updated', { 
      data: { lastPageRangeCalculation: configurationViewModel.lastPageRangeCalculation } 
    });
    // 강제 리렌더링 트리거
    forceRender({});
    setForceUpdateCounter(prev => prev + 1);
  }, [configurationViewModel.lastPageRangeCalculation]);

  // === DEBUG: Log statusSummary changes ===
  useEffect(() => {
    dashboardLogger.debug('statusSummary changed', {
      data: {
        statusSummary,
        keys: statusSummary ? Object.keys(statusSummary) : 'null/undefined',
        dbProductCount: statusSummary?.dbProductCount,
        siteProductCount: statusSummary?.siteProductCount,
        diff: statusSummary?.diff,
        needCrawling: statusSummary?.needCrawling
      }
    });
  }, [statusSummary]);
  
  // === DEBUG: Log isStopping state changes ===
  useEffect(() => {
    dashboardLogger.debug('isStopping state changed', { data: { isStopping } });
  }, [isStopping]);
  
  const { concurrentTasks } = useTaskStore();

  // === SECONDARY: ViewModel for Complex UI Logic (Helper) ===
  const viewModel = useMemo(() => new CrawlingDashboardViewModel(), []);
  const statusTabViewModel = useMemo(() => new StatusTabViewModel(), []);
  
  // === LOCAL UI STATE (Component-specific only) ===
  const [isStatusChecking, setIsStatusChecking] = useState(false);
  const [showCompletion, setShowCompletion] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [localTime, setLocalTime] = useState({ elapsedTime: 0, remainingTime: 0 });
  const [flipTimer, setFlipTimer] = useState(0);
  const [crawlingStartTime, setCrawlingStartTime] = useState<number | null>(null);
  const [initialDbProductCount, setInitialDbProductCount] = useState<number | null>(null);
  
  // === 누락 제품 수집 관련 상태 ===
  const [isMissingAnalyzing, setIsMissingAnalyzing] = useState(false);
  const [isMissingProductCrawling, setIsMissingProductCrawling] = useState(false);
  const [missingProductsInfo, setMissingProductsInfo] = useState<{
    missingCount: number;
    analysisResult?: any;
  } | null>(null);
  
  // === Manual Crawling 관련 상태 ===
  const [isManualCrawling, setIsManualCrawling] = useState(false);
  const [forceUpdateCounter, setForceUpdateCounter] = useState(0); // 강제 리렌더링용
  
  // === Computed Values ===
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

  // 배치 진행률 표시 여부 계산
  const shouldShowBatchProgress = useMemo(() => {
    const hasCurrentBatch = progress.currentBatch !== undefined && progress.currentBatch !== null;
    const hasTotalBatches = progress.totalBatches !== undefined && progress.totalBatches !== null;
    const totalBatchesGreaterThan1 = (progress.totalBatches || 0) > 1;
    // 더 넓은 범위의 상태에서 배치 UI 표시 (initializing은 배치 처리 시작 시 나타남)
    const statusMatches = status === 'running' || status === 'initializing' || status === 'idle' || status === 'paused';
    
    // 🔧 배치 UI 조건을 더 유연하게 수정
    // Stage 3에서 제품 상세정보 수집 중인 경우 또는 배치 정보가 있는 경우 배치 UI 표시
    const isStage3Running = viewModel.currentStage === 3 && statusMatches;
    
    // 원본 배치 UI 조건: 명확한 배치 정보가 있는 경우
    const hasValidBatchData = hasCurrentBatch && hasTotalBatches && totalBatchesGreaterThan1;
    
    // 최종 조건: 유효한 배치 데이터가 있거나 Stage 3 실행 중인 경우
    return (hasValidBatchData && statusMatches) || isStage3Running;
  }, [progress.currentBatch, progress.totalBatches, status, viewModel.currentStage]);

  // DEBUG: Add real-time progress monitoring (with optimization)
  useEffect(() => {
    // 상태가 변경될 때나 중요한 값이 바뀔 때만 로깅하여 콘솔 부담 감소
    if (
      !hasLoggedDebugInfo.current || 
      progress.currentPage !== prevProgress.current?.currentPage ||
      progress.processedItems !== prevProgress.current?.processedItems ||
      status !== prevProgress.current?.status ||
      viewModel.currentStage !== prevProgress.current?.currentStage
    ) {
      dashboardLogger.debug('Progress Data Debug', {
        data: {
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
        }
      });
      
      // 중요 값들 업데이트 (다음 비교를 위해)
      prevProgress.current = {
        ...progress,
        status,
        currentStage: viewModel.currentStage
      };
      
      hasLoggedDebugInfo.current = true;
    }
  }, [
    status, 
    viewModel.currentStage, 
    viewModel.currentStep, 
    progress.currentPage,
    progress.totalPages,
    progress.processedItems,
    progress.totalItems, 
    progress.percentage,
    progress.message,
    calculatedPercentage, 
    targetPageCount, 
    concurrentTasks?.length
  ]);
  
  // 디버그 정보를 한번만 로깅하기 위한 변수
  const hasLoggedDebugInfo = useRef(false);

  // === EVENT HANDLERS (Clean Code Pattern) ===
  const toggleCompareSection = useCallback(() => {
    setAppCompareExpanded(!appCompareExpanded);
  }, [appCompareExpanded, setAppCompareExpanded]);

  const isValueChanged = useCallback((key: keyof CrawlingStatusSummary): boolean => {
    return viewModel.isValueChanged(key);
  }, [viewModel]);

  // 크롤링 범위 표시 계산 - MobX 반응성을 위한 개선
  const crawlingRangeDisplay = useMemo(() => {
    dashboardLogger.debug('crawlingRangeDisplay useMemo recalculating...', {
      data: {
        lastPageRangeCalculation: configurationViewModel.lastPageRangeCalculation,
        crawlingRange: statusSummary?.crawlingRange
      }
    });
    
    const hasRange = statusSummary?.crawlingRange || configurationViewModel.lastPageRangeCalculation;
    if (!hasRange) {
      dashboardLogger.debug('No range data available');
      return null;
    }
    
    return (
      <div className="flex justify-between items-center">
        <span className="text-gray-600 dark:text-gray-400">
          {configurationViewModel.lastPageRangeCalculation 
            ? '크롤링 범위:' 
            : statusSummary?.crawlingRange 
              ? '서버 크롤링 범위:' 
              : '크롤링 범위:'}
        </span>
        <span className={`font-medium ${
          configurationViewModel.lastPageRangeCalculation 
            ? 'text-blue-600 dark:text-blue-400 animate-pulse'
            : statusSummary?.crawlingRange 
              ? (isValueChanged('crawlingRange') ? 'text-yellow-600 dark:text-yellow-400 animate-pulse' : 'text-gray-800 dark:text-gray-200')
              : 'text-gray-500'
        }`}>
          {(() => {
            // 🔧 페이지 범위 계산 정보가 있으면 항상 우선 사용
            if (configurationViewModel.lastPageRangeCalculation) {
              const info = configurationViewModel.lastPageRangeCalculation;
              dashboardLogger.info('Displaying calculated range', info);
              return `${info.pageRangeStart} ~ ${info.pageRangeEnd} 페이지 (예상: ${info.estimatedProducts}개)`;
            }
            // 서버의 실제 크롤링 범위가 있는 경우 (fallback)
            else if (statusSummary?.crawlingRange) {
              const startPage = statusSummary.crawlingRange.startPage;
              const endPage = statusSummary.crawlingRange.endPage;
              const totalPages = Math.abs(startPage - endPage) + 1;
              return `${startPage} ~ ${endPage} 페이지 (${totalPages}페이지)`;
            }
            return '범위 계산 중...';
          })()}
        </span>
      </div>
    );
  }, [
    statusSummary?.crawlingRange, 
    configurationViewModel.lastPageRangeCalculation?.pageRangeStart,
    configurationViewModel.lastPageRangeCalculation?.pageRangeEnd,
    configurationViewModel.lastPageRangeCalculation?.estimatedProducts,
    configurationViewModel.lastPageRangeCalculation?.actualCrawlPages,
    isValueChanged, 
    forceUpdateCounter
  ]);

  // === 누락 제품 수집 관련 함수들 ===
  const handleAnalyzeMissingProducts = useCallback(async () => {
    if (isMissingAnalyzing || status === 'running') {
      dashboardLogger.debug('Skipping missing product analysis: already analyzing or crawling in progress', {
        isMissingAnalyzing,
        status
      });
      return;
    }
    
    setIsMissingAnalyzing(true);
    try {
      dashboardLogger.info('Starting missing product analysis');
      
      // MissingDataAnalyzer 서비스 호출
      const result = await window.electron.analyzeMissingProducts();
      
      if (result.success) {
        const analysisResult = {
          missingCount: result.data.totalMissingDetails || 0,
          analysisResult: result.data
        };
        
        setMissingProductsInfo(analysisResult);
        dashboardLogger.info('Missing product analysis completed', {
          totalMissingDetails: result.data.totalMissingDetails,
          totalIncompletePages: result.data.totalIncompletePages,
          missingCount: analysisResult.missingCount
        });
      } else {
        dashboardLogger.error('Missing product analysis failed', result.error);
        // Error is now properly displayed to user via domain store error state
      }
    } catch (error) {
      dashboardLogger.error('Error analyzing missing products', error);
      // Error handling is managed by the domain store and displayed in UI
    } finally {
      setIsMissingAnalyzing(false);
    }
  }, [isMissingAnalyzing, status]);

  // === Enhanced Auto-refresh callback for missing data analysis ===
  const handleAutoRefreshMissingData = useCallback(() => {
    dashboardLogger.info('Auto-refreshing missing data analysis', {
      currentStatus: status,
      hasMissingProductsInfo: !!missingProductsInfo,
      statusSummary: statusSummary ? 'present' : 'null'
    });
    
    // Reset missing data info to trigger re-analysis with updated data
    setMissingProductsInfo(null);
    
    // Enhanced auto-analysis trigger with multiple retry attempts
    const triggerAnalysisWithRetry = (attempt = 1, maxAttempts = 3) => {
      const delay = attempt * 1000; // 1s, 2s, 3s delays
      
      setTimeout(() => {
        // Check if we have status data and not currently analyzing
        if (statusSummary && !isMissingAnalyzing) {
          dashboardLogger.info(`Triggering automatic missing data re-analysis (attempt ${attempt}/${maxAttempts})`);
          try {
            handleAnalyzeMissingProducts();
            dashboardLogger.info(`Missing data re-analysis triggered successfully (attempt ${attempt})`);
          } catch (error) {
            dashboardLogger.error(`Failed to trigger missing data re-analysis (attempt ${attempt})`, error);
            
            // Retry if not at max attempts
            if (attempt < maxAttempts) {
              dashboardLogger.info(`Retrying missing data re-analysis (attempt ${attempt + 1})`);
              triggerAnalysisWithRetry(attempt + 1, maxAttempts);
            } else {
              dashboardLogger.error('All missing data re-analysis attempts failed');
            }
          }
        } else {
          dashboardLogger.warn(`Skipping missing data re-analysis (attempt ${attempt})`, {
            hasStatusSummary: !!statusSummary,
            isMissingAnalyzing
          });
          
          // Retry if conditions aren't met yet and we haven't exceeded attempts
          if (attempt < maxAttempts) {
            triggerAnalysisWithRetry(attempt + 1, maxAttempts);
          }
        }
      }, delay);
    };
    
    // Start the retry process
    triggerAnalysisWithRetry();
  }, [statusSummary, missingProductsInfo, status, handleAnalyzeMissingProducts, isMissingAnalyzing]);

  const handleCheckStatus = useCallback(async () => {
    try {
      dashboardLogger.info('Status check started');
      setIsStatusChecking(true);
      setAppCompareExpanded(true);
      
      // StatusTabViewModel과 동기화하여 애니메이션 시작
      statusTabViewModel.setStatusChecking(true);
      
      await checkStatus();
      dashboardLogger.info('Status check completed');
      
      // 🔧 ENHANCED: Auto-refresh missing data analysis after status check
      dashboardLogger.info('Status check completed, auto-refreshing missing data analysis');
      
      // Reset missing data analysis to trigger re-analysis with updated status
      setMissingProductsInfo(null);
      
      // Trigger auto-refresh with delay to ensure status data is updated
      setTimeout(() => {
        dashboardLogger.info('Triggering handleAutoRefreshMissingData after status check');
        handleAutoRefreshMissingData();
      }, 800); // Delay to ensure status data propagation
      
    } catch (error) {
      dashboardLogger.error('Status check failed', error);
    } finally {
      setTimeout(() => {
        setIsStatusChecking(false);
        statusTabViewModel.setStatusChecking(false);
      }, 1500);
    }
  }, [checkStatus, setAppCompareExpanded, statusTabViewModel, handleAutoRefreshMissingData]);

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



  // 크롤링 상태 변경 시 시작 시간 설정
  useEffect(() => {
    if (status === 'running' && !crawlingStartTime) {
      // 크롤링이 시작되었고 아직 시작 시간이 설정되지 않은 경우
      const startTime = Date.now();
      setCrawlingStartTime(startTime);
      setLocalTime({ elapsedTime: 0, remainingTime: 0 });
      dashboardLogger.info('크롤링 시작 시간 설정', { startTime });
    } else if (status !== 'running' && status !== 'initializing') {
      // 크롤링이 완료되었거나 중단된 경우
      if (status === 'completed') {
        setLocalTime(prev => ({ ...prev, remainingTime: 0 }));
      }
    }
  }, [status, crawlingStartTime, dashboardLogger]);

  // 안정적인 타이머 effect - 1초마다 정확히 업데이트
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    if (status === 'running' && crawlingStartTime) {
      // 즉시 한 번 업데이트
      const updateTimer = () => {
        const now = Date.now();
        const elapsedTime = now - crawlingStartTime;
        
        setLocalTime(() => {
          // 백엔드에서 제공하는 시간 정보와 로컬 계산 비교
          let finalElapsedTime = elapsedTime;
          let finalRemainingTime = 0;
          
          if (progress.elapsedTime !== undefined && progress.elapsedTime > 0) {
            // 백엔드 시간이 있으면 참고하되, 로컬 시간이 더 안정적
            const timeDiff = Math.abs(progress.elapsedTime - elapsedTime);
            if (timeDiff < 3000) { // 3초 이내 차이면 백엔드 시간 우선
              finalElapsedTime = progress.elapsedTime;
              finalRemainingTime = progress.remainingTime || 0;
            } else {
              // 차이가 크면 로컬 계산 사용
              finalElapsedTime = elapsedTime;
              finalRemainingTime = calculateRemainingTime(elapsedTime);
            }
          } else {
            // 백엔드 시간이 없으면 로컬에서 계산
            finalElapsedTime = elapsedTime;
            finalRemainingTime = calculateRemainingTime(elapsedTime);
          }

          return {
            elapsedTime: finalElapsedTime,
            remainingTime: finalRemainingTime
          };
        });
      };

      // 즉시 업데이트
      updateTimer();
      
      // 500ms마다 업데이트 (더 빈번한 UI 업데이트)
      timer = setInterval(updateTimer, 500);
      
      setFlipTimer(prev => prev + 1);
    } else if (status !== 'running' && crawlingStartTime) {
      // 크롤링이 완료되었거나 중단된 경우 최종 시간 설정
      const finalElapsedTime = progress.elapsedTime || (Date.now() - crawlingStartTime);
      setLocalTime(prev => ({
        elapsedTime: finalElapsedTime,
        remainingTime: status === 'completed' ? 0 : prev.remainingTime
      }));
    }

    return () => {
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [status, crawlingStartTime, progress.elapsedTime, progress.remainingTime]);

  // 남은 시간 계산 함수 - 더 안정적이고 신뢰할 만한 계산
  const calculateRemainingTime = useCallback((elapsedTime: number): number => {
    const elapsedSeconds = elapsedTime / 1000;
    
    // 최소 30초 경과 후에만 예측 시작 (더 빠른 피드백)
    if (elapsedSeconds < 30) return 0;
    
    // 전체 진행률 기반 계산
    const stage1Progress = progress.currentPage || 0;
    const stage1Total = progress.totalPages || 0;
    const stage2Progress = progress.processedItems || 0;
    const stage2Total = progress.totalItems || 0;
    
    const totalWork = stage1Total + stage2Total;
    const completedWork = stage1Progress + stage2Progress;
    
    if (totalWork > 0 && completedWork > 0) {
      const progressRatio = completedWork / totalWork;
      
      // 최소 2% 이상 진행된 경우에만 예측 (더 빠른 예측)
      if (progressRatio > 0.02) {
        const estimatedTotalTime = elapsedSeconds / progressRatio;
        const remainingSeconds = Math.max(0, estimatedTotalTime - elapsedSeconds);
        
        // 급격한 변화를 방지하기 위한 스무딩
        return Math.round(remainingSeconds * 1000);
      }
    }
    
    return 0;
  }, [progress.currentPage, progress.totalPages, progress.processedItems, progress.totalItems]);

  // Track crawling start and store initial dbProductCount
  useEffect(() => {
    // 크롤링이 시작될 때 초기 dbProductCount 저장
    if (status === 'running' && initialDbProductCount === null && statusSummary?.dbProductCount !== undefined) {
      setInitialDbProductCount(statusSummary.dbProductCount);
      dashboardLogger.info('Crawling started - storing initial dbProductCount', {
        initialDbProductCount: statusSummary.dbProductCount
      });
    }
    
    // 크롤링이 idle로 돌아갔을 때 초기화
    if (status === 'idle' && initialDbProductCount !== null) {
      setInitialDbProductCount(null);
      dashboardLogger.info('Crawling session ended - reset initial dbProductCount');
    }
  }, [status, statusSummary?.dbProductCount, initialDbProductCount]);

  // Enhanced completion status handling with robust auto-refresh
  const lastProcessedCompletion = useRef<string | null>(null);
  const completionProcessedRef = useRef<boolean>(false);
  
  useEffect(() => {
    // Enhanced completion detection - check multiple conditions
    const isReallyCompleted = status === 'completed' || 
                             (status === 'idle' && viewModel.currentStage >= 2 && progress.percentage >= 100) ||
                             (progress.status === 'completed' && progress.percentage >= 100);
    
    // Create a unique completion ID without timestamp to prevent duplicate processing
    const completionId = `${status}-${viewModel.currentStage}-${Math.floor(progress.percentage)}-${progress.status}`;
    
    dashboardLogger.debug('Completion check', {
      status,
      currentStage: viewModel.currentStage,
      percentage: progress.percentage,
      progressStatus: progress.status,
      isReallyCompleted,
      completionId,
      lastProcessedCompletion: lastProcessedCompletion.current,
      completionProcessed: completionProcessedRef.current
    });

    if (isReallyCompleted && !completionProcessedRef.current) {
      // Prevent duplicate processing of the same completion event
      if (lastProcessedCompletion.current === completionId) {
        dashboardLogger.debug('Completion already processed, skipping duplicate');
        return;
      }
      
      lastProcessedCompletion.current = completionId;
      completionProcessedRef.current = true;
      
      const totalItems = progress.totalItems || statusSummary?.siteProductCount || (targetPageCount * (config.productsPerPage || 12));
      const processedItems = progress.processedItems || 0;
      const isCompleteSuccess = processedItems >= totalItems * 0.9; // 90% 이상 수집하면 성공으로 간주

      setIsSuccess(isCompleteSuccess);
      setShowCompletion(true);

      // 🔧 ENHANCED: Auto status update after crawling completion
      dashboardLogger.info('Crawling completed, triggering automatic status update for site comparison and missing data analysis', {
        completionId,
        isCompleteSuccess,
        processedItems,
        totalItems,
        progressStatus: progress.status,
        currentStage: viewModel.currentStage
      });
      
      // Trigger automatic status check to refresh site-local comparison section
      statusTabViewModel.performAutoStatusCheck()
        .then(() => {
          dashboardLogger.info('Auto status check completed after crawling completion');
          // Ensure the site comparison section is expanded to show updated data
          setAppCompareExpanded(true);
          
          // 🔧 ENHANCED: Auto-refresh missing data analysis after crawling completion
          dashboardLogger.info('Triggering missing data analysis auto-refresh after crawling completion');
          
          // Add a delay to ensure all status data is fully updated before refreshing missing data
          setTimeout(() => {
            try {
              handleAutoRefreshMissingData();
              dashboardLogger.info('Missing data auto-refresh triggered successfully after crawling completion');
            } catch (error) {
              dashboardLogger.error('Error during missing data auto-refresh', error);
            }
          }, 1500); // Increased delay to ensure data consistency
        })
        .catch((error) => {
          dashboardLogger.error('Auto status check failed after crawling completion', error);
          
          // Even if status check fails, still try to refresh missing data analysis
          dashboardLogger.info('Attempting missing data auto-refresh despite status check failure');
          setTimeout(() => {
            try {
              handleAutoRefreshMissingData();
              dashboardLogger.info('Fallback missing data auto-refresh completed');
            } catch (refreshError) {
              dashboardLogger.error('Error during fallback missing data auto-refresh', refreshError);
            }
          }, 2500); // Longer delay when status check fails
        });

      if (completionTimerRef.current) {
        clearTimeout(completionTimerRef.current);
        completionTimerRef.current = null;
      }

      completionTimerRef.current = window.setTimeout(() => {
        setShowCompletion(false);
        completionTimerRef.current = null;
        // 완료 애니메이션 종료 후 상태 초기화
        completionProcessedRef.current = false;
        lastProcessedCompletion.current = null;
      }, isCompleteSuccess ? 10000 : 5000);
    } else {
      // 크롤링이 진행 중이거나 초기 상태일 때만 completion 상태 초기화
      if (status === 'running' || status === 'initializing' || status === 'idle') {
        setShowCompletion(false);
        // Reset completion tracking when not completed
        if (status === 'running' || status === 'initializing') {
          lastProcessedCompletion.current = null;
          completionProcessedRef.current = false;
        }
      }
    }

    return () => {
      if (completionTimerRef.current) {
        clearTimeout(completionTimerRef.current);
        completionTimerRef.current = null;
      }
    };
  }, [status, viewModel.currentStage, progress.processedItems, progress.totalItems, progress.percentage, targetPageCount, config.productsPerPage, statusSummary?.siteProductCount, statusTabViewModel, setAppCompareExpanded]);

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
      // cleanup 호출하지 않음 - 이벤트 구독 유지
      // viewModel.cleanup();
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
      statusTabViewModel.dispose();
      if (completionTimerRef.current) {
        clearTimeout(completionTimerRef.current);
        completionTimerRef.current = null;
      }
    };
  }, [viewModel]);

  const handleStartMissingProductCrawling = useCallback(async () => {
    if (isMissingProductCrawling || status === 'running' || !missingProductsInfo?.analysisResult) return;
    
    setIsMissingProductCrawling(true);
    try {
      dashboardLogger.info('Starting missing product crawling');
      
      // Create a clean, serializable version of the analysis result
      const analysisResult = missingProductsInfo.analysisResult as MissingDataAnalysis;
      
      // Create a completely clean object with only primitive values
      const cleanAnalysisResult: MissingDataAnalysis = {
        missingDetails: (analysisResult.missingDetails || []).map(d => ({
          url: String(d.url),
          pageId: Number(d.pageId),
          indexInPage: Number(d.indexInPage)
        })),
        incompletePages: (analysisResult.incompletePages || []).map(p => ({
          pageId: Number(p.pageId),
          missingIndices: Array.isArray(p.missingIndices) ? p.missingIndices.map(i => Number(i)) : [],
          expectedCount: Number(p.expectedCount),
          actualCount: Number(p.actualCount)
        })),
        totalMissingDetails: Number(analysisResult.totalMissingDetails || 0),
        totalIncompletePages: Number(analysisResult.totalIncompletePages || 0),
        summary: {
          productsCount: Number(analysisResult.summary?.productsCount || 0),
          productDetailsCount: Number(analysisResult.summary?.productDetailsCount || 0),
          difference: Number(analysisResult.summary?.difference || 0)
        }
      };

      dashboardLogger.info('Sending clean analysis result', {
        missingDetailsCount: cleanAnalysisResult.missingDetails.length,
        incompletePagesCount: cleanAnalysisResult.incompletePages.length,
        totalMissingDetails: cleanAnalysisResult.totalMissingDetails
      });

      // Also clean the config object
      const currentConfig = toJS(configurationViewModel.config);
      const cleanConfig = JSON.parse(JSON.stringify(currentConfig));

      const result = await window.electron.crawlMissingProducts({
        analysisResult: cleanAnalysisResult,
        config: cleanConfig
      });
      
      if (result.success) {
        dashboardLogger.info('Missing product crawling completed successfully');
        // 상태 체크를 다시 실행하여 최신 정보 업데이트
        await handleCheckStatus();
        // 분석 결과 초기화 (재분석 필요)
        setMissingProductsInfo(null);
      } else {
        dashboardLogger.error('Missing product crawling failed', result.error);
        // Error is now properly displayed to user via domain store error state
      }
    } catch (error) {
      dashboardLogger.error('Error during missing product crawling', error);
      // Error handling is managed by the domain store and displayed in UI
    } finally {
      setIsMissingProductCrawling(false);
    }
  }, [isMissingProductCrawling, status, missingProductsInfo, configurationViewModel.config, handleCheckStatus]);



  // === Manual Crawling 관련 함수들 ===
  const handleStartManualCrawling = useCallback(async (ranges: Array<{
    startPage: number;
    endPage: number;
    reason: string;
    priority: number;
    estimatedProducts: number;
  }>) => {
    if (isManualCrawling || status === 'running') return;
    setIsManualCrawling(true);
    try {
      dashboardLogger.info('Starting manual page range crawling', ranges);
      
      // Convert site page ranges to pageId-based incompletePages structure
      // Each site page corresponds to pageId = Math.floor((sitePage - 1) / 2)
      const incompletePages: Array<{
        pageId: number;
        missingIndices: number[];
        expectedCount: number;
        actualCount: number;
      }> = [];
      
      dashboardLogger.debug('Processing ranges for manual crawling', { rangeCount: ranges.length });
      
      ranges.forEach(range => {
        dashboardLogger.debug('Processing range', range);
        for (let sitePage = range.startPage; sitePage <= range.endPage; sitePage++) {
          // For manual crawling, use site page numbers directly without conversion
          // The crawling system should handle site pages as they are entered by the user
          const pageId = sitePage; // Use site page number directly
          
          // Check if this pageId is already added
          const existingPage = incompletePages.find(p => p.pageId === pageId);
          if (!existingPage) {
            // Add as incomplete page with all products missing
            const newPage = {
              pageId,
              missingIndices: Array.from({ length: configurationViewModel.config.productsPerPage || 12 }, (_, i) => i),
              expectedCount: configurationViewModel.config.productsPerPage || 12,
              actualCount: 0
            };
            incompletePages.push(newPage);
            dashboardLogger.debug('Added manual crawling page (direct site page)', { pageId, sitePage });
          }
        }
      });
      
      dashboardLogger.debug('Generated incompletePages array', { pageCount: incompletePages.length });
      
      // Create proper analysis result structure for Stage 1-3 workflow
      const analysisResult = {
        missingDetails: [], // No specific missing details for manual crawling
        incompletePages: incompletePages,
        totalMissingDetails: 0,
        totalIncompletePages: incompletePages.length,
        summary: {
          productsCount: 0,
          productDetailsCount: 0,
          difference: 0
        }
      };
      
      dashboardLogger.debug('Before serialization', { incompletePagesCount: analysisResult.incompletePages.length });
      
      // Ensure clean serializable objects
      const cleanAnalysisResult = JSON.parse(JSON.stringify(analysisResult));
      const cleanConfig = JSON.parse(JSON.stringify(toJS(configurationViewModel.config)));
      
      dashboardLogger.debug('After serialization', { incompletePagesCount: cleanAnalysisResult.incompletePages.length });
      dashboardLogger.info('Manual crawling analysis result', cleanAnalysisResult);
      
      const result = await window.electron.crawlMissingProducts({
        analysisResult: cleanAnalysisResult,
        config: cleanConfig
      });
      if (result.success) {
        dashboardLogger.info('Manual crawling completed successfully');
        await handleCheckStatus();
        setMissingProductsInfo(null); // Reset analysis data
      } else {
        dashboardLogger.error('Manual crawling failed', result.error);
      }
    } catch (error) {
      dashboardLogger.error('Error during manual crawling', error);
    } finally {
      setIsManualCrawling(false);
    }
  }, [isManualCrawling, status, configurationViewModel.config, handleCheckStatus]);

  const handleStartTargetedCrawling = useCallback(async (pageIds: number[]) => {
    if (isManualCrawling || status === 'running') return;
    setIsManualCrawling(true);
    try {
      dashboardLogger.info('Starting targeted page crawling with pageIds', pageIds);
      
      // pageIds는 이제 원본 DB pageId 값들임 (UI에서 변환하지 않고 전달)
      // 이 pageId들을 그대로 사용하여 incompletePages 구조 생성
      const pageIdSet = new Set<number>();
      pageIds.forEach(pageId => {
        pageIdSet.add(pageId); // 원본 pageId 사용
      });
      
      dashboardLogger.debug('Targeted crawling with original pageIds', { 
        originalPageIds: pageIds,
        uniquePageIds: pageIdSet.size 
      });
      
      const incompletePages: Array<{
        pageId: number;
        missingIndices: number[];
        expectedCount: number;
        actualCount: number;
      }> = Array.from(pageIdSet).map(pageId => ({
        pageId, // 원본 pageId 사용
        missingIndices: Array.from({ length: configurationViewModel.config.productsPerPage || 12 }, (_, i) => i),
        expectedCount: configurationViewModel.config.productsPerPage || 12,
        actualCount: 0
      }));
      
      dashboardLogger.debug('Generated targeted incompletePages from pageIds', { 
        pageCount: incompletePages.length,
        pageIds: incompletePages.map(p => p.pageId)
      });
      
      // Create proper analysis result structure for Stage 1-3 workflow
      const analysisResult = {
        missingDetails: [], // No specific missing details for targeted crawling
        incompletePages: incompletePages,
        totalMissingDetails: 0,
        totalIncompletePages: incompletePages.length,
        summary: {
          productsCount: 0,
          productDetailsCount: 0,
          difference: 0
        }
      };
      
      dashboardLogger.debug('Before serialization - targeted analysis', { 
        incompletePagesCount: analysisResult.incompletePages.length 
      });
      
      // Ensure clean serializable objects
      const cleanAnalysisResult = JSON.parse(JSON.stringify(analysisResult));
      const cleanConfig = JSON.parse(JSON.stringify(toJS(configurationViewModel.config)));
      
      dashboardLogger.debug('After serialization - targeted analysis', { 
        incompletePagesCount: cleanAnalysisResult.incompletePages.length 
      });
      dashboardLogger.info('Targeted crawling analysis result', cleanAnalysisResult);
      
      const result = await window.electron.crawlMissingProducts({
        analysisResult: cleanAnalysisResult,
        config: cleanConfig
      });
      if (result.success) {
        dashboardLogger.info('Targeted crawling completed successfully');
        await handleCheckStatus();
        setMissingProductsInfo(null);
      } else {
        dashboardLogger.error('Targeted crawling failed', result.error);
      }
    } catch (error) {
      dashboardLogger.error('Error during targeted crawling', error);
    } finally {
      setIsManualCrawling(false);
    }
  }, [isManualCrawling, status, configurationViewModel.config, handleCheckStatus]);

  // === 크롤링 시작 시 시간 초기화 ===
  useEffect(() => {
    if (status === 'running' && localTime.elapsedTime === 0) {
      // 크롤링이 시작되었지만 localTime이 아직 초기화되지 않은 경우
      dashboardLogger.info('크롤링 시작 - 시간 추적 초기화');
      setLocalTime({ elapsedTime: 0, remainingTime: 0 });
    } else if (status === 'completed' || status === 'error' || status === 'idle') {
      // 크롤링이 완료되었거나 중단된 경우 타이머 정지 (남은 시간은 0으로)
      if (status === 'completed' || status === 'error') {
        setLocalTime(prev => ({ ...prev, remainingTime: 0 }));
      }
    }
  }, [status, localTime.elapsedTime, dashboardLogger]);

  // === RENDER ===
  return (
    <>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-4">

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

        {/* Stage Information */}
        <CrawlingStageDisplay 
          getStageBadge={getStageBadge}
          currentStep={viewModel.currentStep}
        />

        {/* Metrics Display */}
        <CrawlingMetricsDisplay 
          progress={progress}
          animatedValues={viewModel.animatedValues}
          animatedDigits={animatedDigits}
        />

        {/* Clean Architecture: Time Estimation Display */}
        <TimeEstimationDisplay
          elapsedTimeSeconds={Math.floor(localTime.elapsedTime / 1000)}
          remainingTimeSeconds={progress.remainingTimeSeconds || 0}
          confidence={progress.confidence || 'low'}
          isRunning={status === 'running'}
          showConfidenceIndicator={true}
          className="mb-6"
        />

        {/* Redesigned Batch Progress Section */}
        {shouldShowBatchProgress && (
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

        {/* Page-by-Page Status Visualization for Stage 1 - Using original ConcurrentTasksVisualizer */}
        {status !== 'idle' && viewModel.currentStage === 1 && Array.isArray(concurrentTasks) && concurrentTasks.length > 0 && (
          <div className="mt-4 space-y-4">
            <h3 className="text-md font-semibold text-gray-700 dark:text-gray-200 mb-2">
              1단계: 제품 목록 페이지 읽기
            </h3>
            
            {/* Page Progress Display */}
            <div className="flex justify-between items-center mb-2 px-3 py-1 bg-gray-50 dark:bg-gray-800 rounded">
              <span className="text-sm text-gray-600 dark:text-gray-400">페이지 진행 상황:</span>
              <div className="flex items-center">
                <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                  {(() => {
                    const successfulPages = concurrentTasks.filter(task => task.status === 'success').length;
                    return successfulPages;
                  })()}
                </span>
                <span className="text-sm text-gray-500 dark:text-gray-500 mx-1">/</span>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {concurrentTasks.length} 페이지
                </span>
              </div>
            </div>
            
            {/* Original ConcurrentTasksVisualizer */}
            <div className="relative">
              <ConcurrentTasksVisualizer />
            </div>
          </div>
        )}

        {/* Enhanced Progress Display - Shows product progress for stage 2 only */}
        {status !== 'idle' && viewModel.currentStage === 2 && (
          <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <div className="flex justify-between items-center mb-2">
              <span className="font-medium text-gray-900 dark:text-gray-100">
                제품 데이터 검증 중...
              </span>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {(() => {
                  const processedItems = progress.processedItems || 0;
                  const totalItems = progress.totalItems || 0;
                  return `${processedItems} / ${totalItems} 제품`;
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
                    const processedItems = progress.processedItems || 0;
                    const totalItems = progress.totalItems || 0;
                    const percentage = totalItems > 0 ? (processedItems / totalItems) * 100 : 0;
                    return Math.min(100, Math.max(0, percentage));
                  })()}%` 
                }}
              />
            </div>
            
            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
              <span>
                {(() => {
                  const processedItems = progress.processedItems || 0;
                  const totalItems = progress.totalItems || 0;
                  const percentage = totalItems > 0 ? (processedItems / totalItems) * 100 : 0;
                  return `${Math.round(percentage)}% 완료`;
                })()}
              </span>
              <span>
                {(() => {
                  const processedItems = progress.processedItems || 0;
                  const totalItems = progress.totalItems || 0;
                  const remaining = totalItems - processedItems;
                  return remaining > 0 ? `${remaining}개 남음` : '완료';
                })()}
              </span>
            </div>
          </div>
        )}

        {/* 수집 결과 블록 제거 - CrawlingMetricsDisplay에서 통합 표시 */}
        
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

        {/* Simplified Stage 3 Progress Panel */}
        {viewModel.currentStage === 3 && status === 'running' && (
          <div className="mt-4 p-3 bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 rounded-lg border border-purple-200 dark:border-purple-700">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium text-purple-800 dark:text-purple-300 flex items-center">
                <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm0 4a1 1 0 011-1h12a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1V8zm2 2a1 1 0 000 2h.01a1 1 0 100-2H5zm3 0a1 1 0 000 2h.01a1 1 0 100-2H8zm3 0a1 1 0 000 2h.01a1 1 0 100-2H11z" clipRule="evenodd" />
                </svg>
                3단계: 제품 상세정보 수집
              </h3>
              <div className="text-sm text-purple-600 dark:text-purple-400 font-medium">
                {(() => {
                  const processed = progress.processedItems || progress.current || 0;
                  const total = progress.totalItems || progress.total || 0;
                  const percentage = CrawlingUtils.safePercentage(processed, total);
                  return `${percentage.toFixed(1)}% 완료`;
                })()}
              </div>
            </div>

            {/* Simplified Progress Bar */}
            <div className="mb-2">
              <div className="flex justify-between items-center text-sm mb-1">
                <span className="text-gray-700 dark:text-gray-300">진행률</span>
                <span className="text-gray-600 dark:text-gray-400">
                  {(() => {
                    const processed = progress.processedItems || progress.current || 0;
                    const total = progress.totalItems || progress.total || 0;
                    return `${processed.toLocaleString()} / ${total.toLocaleString()}`;
                  })()}
                </span>
              </div>

              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-indigo-600 transition-all duration-500 ease-out"
                  style={{ 
                    width: `${(() => {
                      const processed = progress.processedItems || progress.current || 0;
                      const total = progress.totalItems || progress.total || 0;
                      const percentage = total > 0 ? (processed / total) * 100 : 0;
                      return Math.min(100, Math.max(0, percentage));
                    })()}%`
                  }}
                />
              </div>
            </div>

            {/* Compact Status Indicators */}
            {((progress.newItems ?? 0) > 0 || (progress.updatedItems ?? 0) > 0 || (progress.errors && progress.errors > 0)) && (
              <div className="flex gap-3 text-xs">
                {(progress.newItems ?? 0) > 0 && (
                  <span className="text-green-600 dark:text-green-400">
                    신규: {(progress.newItems ?? 0).toLocaleString()}개
                  </span>
                )}
                {(progress.updatedItems ?? 0) > 0 && (
                  <span className="text-blue-600 dark:text-blue-400">
                    업데이트: {(progress.updatedItems ?? 0).toLocaleString()}개
                  </span>
                )}
                {progress.errors && progress.errors > 0 && (
                  <span className="text-red-600 dark:text-red-400">
                    오류: {progress.errors.toLocaleString()}개
                  </span>
                )}
              </div>
            )}
          </div>
        )}

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
              <li>• 설정된 재시도 횟수: {config.productListRetryCount}회</li>
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
                  {(() => {
                    // Calculate total products collected across all batches
                    // Use dbProductCount difference if available (most accurate for cross-batch totals)
                    const currentDbCount = statusSummary?.dbProductCount || 0;
                    const totalCollectedAcrossBatches = initialDbProductCount !== null && currentDbCount > 0 
                      ? Math.max(0, currentDbCount - initialDbProductCount)
                      : Math.round(progress.processedItems || 0);
                    
                    // Calculate correct target count - priority order:
                    // 1. progress.totalItems (most accurate - actual items to process)
                    // 2. If progress is available, calculate based on percentage
                    // 3. statusSummary.estimatedProductCount (from crawler config)
                    // 4. Fall back to page-based calculation only as last resort
                    let actualTargetCount = 0;
                    
                    if (progress.totalItems && progress.totalItems > 0) {
                      // Use the actual totalItems from progress (most reliable)
                      actualTargetCount = progress.totalItems;
                    } else if ((progress.processedItems || 0) > 0 && progress.percentage > 0) {
                      // Calculate based on current progress percentage
                      actualTargetCount = Math.round((progress.processedItems || 0) / (progress.percentage / 100));
                    } else if (statusSummary?.estimatedProductCount && statusSummary.estimatedProductCount > 0) {
                      // Use estimated product count from status summary
                      actualTargetCount = statusSummary.estimatedProductCount;
                    } else {
                      // Last resort: use page-based calculation
                      actualTargetCount = targetPageCount * (config.productsPerPage || 12);
                    }
                    
                    // CRITICAL FIX: Ensure denominator is never smaller than numerator
                    // This prevents cases like "72 / 12" where we collected more than expected
                    if (totalCollectedAcrossBatches > actualTargetCount) {
                      // If we collected more than expected, use the collected amount as the target
                      // This can happen when multiple batches are processed or when estimates were low
                      actualTargetCount = totalCollectedAcrossBatches;
                    }
                    
                    return `${totalCollectedAcrossBatches.toLocaleString()} / ${actualTargetCount.toLocaleString()} 제품 수집 완료`;
                  })()}
                </div>
                
                {/* Show additional batch information if available */}
                {initialDbProductCount !== null && statusSummary?.dbProductCount && (
                  <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    전체 배치 누적: {(statusSummary.dbProductCount - initialDbProductCount).toLocaleString()}개 신규 수집
                  </div>
                )}
                
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
        additionalClasses="site-local-compare-section border-blue-200 dark:border-blue-800 shadow-sm"
        headerBgColor="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/30 dark:to-purple-900/30"
        contentBgColor="bg-gradient-to-br from-blue-50/50 to-purple-50/50 dark:from-blue-950/10 dark:to-purple-950/10"
        headerTextColor="text-blue-700 dark:text-blue-300 font-semibold"
        isLoading={isStatusChecking}
        loadingContent={
          <div>
            <p>상태 확인 중...</p>
            <StatusCheckLoadingAnimation 
              isActive={statusTabViewModel.isStatusChecking}
              onAnimationStart={() => {
                dashboardLogger.debug('Site-local comparison animation started');
              }}
              onAnimationEnd={() => {
                dashboardLogger.debug('Site-local comparison animation ended');
              }}
            />
          </div>
        }
      >
        {(() => {
          const showLoadingState = !statusSummary || (statusSummary.dbProductCount === undefined && statusSummary.siteProductCount === undefined);
          return showLoadingState;
        })() ? (
          <div className="flex flex-col items-center justify-center h-20">
            <p className="text-center text-gray-600 dark:text-gray-400">
              사이트와 로컬 DB 정보를 비교하려면<br/>"상태 체크" 버튼을 클릭하세요.
            </p>
          </div>
        ) : statusSummary ? (
          <div className="space-y-3">
            {/* 🔧 NEW: Visual feedback for status updates */}
            {isStatusChecking && (
              <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-md border border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-blue-700 dark:text-blue-300 text-sm font-medium">
                    사이트 비교 정보 업데이트 중...
                  </span>
                </div>
              </div>
            )}
            
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

            {/* 크롤링 범위 표시 - 실제 범위가 있으면 우선, 없으면 예상 범위 표시 */}
            {crawlingRangeDisplay}

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

      {/* Control Buttons - Moved below site comparison section */}
      <div className="mt-6">
        <CrawlingControlsDisplay 
          status={status}
          isStatusChecking={isStatusChecking}
          onCheckStatus={handleCheckStatus}
          onStartCrawling={startCrawling}
          onStopCrawling={stopCrawling}
          isStopping={isStopping}
          // 누락 제품 수집 관련 props
          isMissingProductCrawling={isMissingProductCrawling}
          isMissingAnalyzing={isMissingAnalyzing}
          onStartMissingProductCrawling={handleStartMissingProductCrawling}
          onAnalyzeMissingProducts={handleAnalyzeMissingProducts}
          // Manual crawling props
          totalSitePages={statusSummary?.siteTotalPages}
          onStartManualCrawling={handleStartManualCrawling}
          // Missing data analysis props
          statusSummary={statusSummary || undefined}
          missingProductsInfo={missingProductsInfo || undefined}
          onStartTargetedCrawling={handleStartTargetedCrawling}
          // Auto-refresh callback
          onAutoRefreshMissingData={handleAutoRefreshMissingData}
        />
      </div>

      {/* Stopping Overlay */}
      <StoppingOverlay isVisible={isStopping} />
    </>
  );
};

CrawlingDashboard.displayName = 'CrawlingDashboard';

// MobX observer for automatic Domain Store reactivity
export default React.memo(observer(CrawlingDashboard));