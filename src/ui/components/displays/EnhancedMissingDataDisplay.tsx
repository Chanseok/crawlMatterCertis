/**
 * EnhancedMissingDataDisplay.tsx
 * Clean Architecture Display Component
 * Single Responsibility: Enhanced missing data analysis visualization and controls
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useCrawlingStore } from '../../hooks/useCrawlingStore';

interface MissingDataDetails {
  totalMissingDetails: number;
  totalIncompletePages: number;
  missingDetails?: Array<{
    url: string;
    pageId: number;
    indexInPage: number;
  }>;
  incompletePages?: Array<{
    pageId: number;
    missingIndices: number[];
    expectedCount: number;
    actualCount: number;
  }>;
  missingProductPages?: Array<{
    pageNumber: number;
    estimatedProducts: number;
    priority: 'high' | 'medium' | 'low';
    reason: string;
  }>;
  gapAnalysis?: {
    consecutiveGaps: Array<{
      startPage: number;
      endPage: number;
      gapSize: number;
    }>;
    scatteredMissing: number[];
    totalGaps: number;
  };
}

interface EnhancedMissingDataDisplayProps {
  statusSummary?: {
    dbProductCount?: number;
    siteProductCount?: number;
    diff?: number;
    needCrawling?: boolean;
  };
  missingProductsInfo?: {
    missingCount: number;
    analysisResult?: MissingDataDetails;
  };
  isMissingAnalyzing?: boolean;
  isMissingProductCrawling?: boolean;
  onAnalyzeMissingProducts?: () => void;
  onStartMissingProductCrawling?: () => void;
  onStartTargetedCrawling?: (pages: number[]) => void;
  // NEW: Auto-refresh callback
  onAutoRefresh?: () => void;
}

export const EnhancedMissingDataDisplay: React.FC<EnhancedMissingDataDisplayProps> = ({
  statusSummary,
  missingProductsInfo,
  isMissingAnalyzing = false,
  isMissingProductCrawling = false,
  onAnalyzeMissingProducts,
  onStartMissingProductCrawling,
  onStartTargetedCrawling,
  onAutoRefresh
}) => {
  const [showDetailedAnalysis, setShowDetailedAnalysis] = useState(false);
  const [pageRangeData, setPageRangeData] = useState<any>(null);
  const [isCalculatingRanges, setIsCalculatingRanges] = useState(false);
  const [showPageRanges, setShowPageRanges] = useState(false);

  // Legacy state for backward compatibility
  const [selectedPages] = useState<Set<number>>(new Set());

  // Hook into crawling store for auto-refresh functionality
  const { status } = useCrawlingStore();
  const prevStatusRef = React.useRef(status);
  const lastProcessedTransition = React.useRef<string | null>(null);

  // Enhanced auto-refresh when crawling completes
  useEffect(() => {
    const wasRunning = prevStatusRef.current === 'running';
    const isNowCompleted = status === 'completed';
    const isNowIdle = status === 'idle' && prevStatusRef.current === 'running'; // Also detect running -> idle transition
    
    // Create a unique transition ID to prevent duplicate processing
    const transitionId = `${prevStatusRef.current}->${status}`;
    
    console.log('[EnhancedMissingDataDisplay] Status change detected:', {
      previousStatus: prevStatusRef.current,
      currentStatus: status,
      wasRunning,
      isNowCompleted,
      isNowIdle,
      transitionId,
      lastProcessedTransition: lastProcessedTransition.current,
      hasAutoRefreshCallback: !!onAutoRefresh
    });
    
    // Enhanced completion detection - trigger on both 'completed' and 'running -> idle' transitions
    if (wasRunning && (isNowCompleted || isNowIdle) && onAutoRefresh) {
      // Prevent duplicate processing of the same transition
      if (lastProcessedTransition.current === transitionId) {
        console.log('[EnhancedMissingDataDisplay] Transition already processed, skipping duplicate');
        prevStatusRef.current = status; // Update ref here to prevent re-processing
        return;
      }
      
      lastProcessedTransition.current = transitionId;
      
      console.log('[EnhancedMissingDataDisplay] Crawling completed, triggering auto-refresh for missing data analysis');
      
      // Enhanced auto-refresh with multiple delayed attempts to ensure success
      const triggerAutoRefresh = (attemptNumber = 1, maxAttempts = 3) => {
        const delay = attemptNumber * 1500; // 1.5s, 3s, 4.5s delays
        
        setTimeout(() => {
          try {
            console.log(`[EnhancedMissingDataDisplay] Auto-refresh attempt ${attemptNumber}/${maxAttempts}`);
            onAutoRefresh();
            console.log(`[EnhancedMissingDataDisplay] Auto-refresh attempt ${attemptNumber} completed successfully`);
          } catch (error) {
            console.error(`[EnhancedMissingDataDisplay] Auto-refresh attempt ${attemptNumber} failed:`, error);
            
            // Try again if we haven't reached max attempts
            if (attemptNumber < maxAttempts) {
              console.log(`[EnhancedMissingDataDisplay] Retrying auto-refresh (attempt ${attemptNumber + 1})`);
              triggerAutoRefresh(attemptNumber + 1, maxAttempts);
            } else {
              console.error('[EnhancedMissingDataDisplay] All auto-refresh attempts failed');
            }
          }
        }, delay);
      };
      
      // Start the auto-refresh process
      triggerAutoRefresh();
    }
    
    // Update previous status reference
    prevStatusRef.current = status;
    
    // Reset transition tracking when status changes to running or initializing
    if (status === 'running' || status === 'initializing') {
      lastProcessedTransition.current = null;
    }
  }, [status, onAutoRefresh]);

  // Determine if there are missing products
  const hasMissingProducts = useMemo(() => {
    if (statusSummary?.diff && statusSummary.diff > 0) return true;
    if (missingProductsInfo && missingProductsInfo.missingCount > 0) return true;
    return false;
  }, [statusSummary, missingProductsInfo]);

  // Get analysis data
  const analysisData = missingProductsInfo?.analysisResult;

  const handlePageSelection = useCallback((pageNumber: number, selected: boolean) => {
    // Legacy functionality - maintained for backward compatibility
  }, []);

  const handleSelectAll = useCallback(() => {
    // Legacy functionality - maintained for backward compatibility
  }, []);

  const handleClearSelection = useCallback(() => {
    // Legacy functionality - maintained for backward compatibility
  }, []);

  const handleStartTargetedCrawling = useCallback(() => {
    // Legacy functionality - maintained for backward compatibility
  }, [selectedPages, onStartTargetedCrawling]);

  // 페이지 범위 계산 함수
  const handleCalculatePageRanges = useCallback(async () => {
    setIsCalculatingRanges(true);
    try {
      const result = await window.electron.calculatePageRanges();
      if (result.success) {
        setPageRangeData(result.data);
        setShowPageRanges(true);
      } else {
        console.error('Failed to calculate page ranges:', result.error);
      }
    } catch (error) {
      console.error('Error calculating page ranges:', error);
    } finally {
      setIsCalculatingRanges(false);
    }
  }, []);

  // Re-crawl Incomplete Pages 함수 - 실제 크롤링 인터페이스로 전달
  const handleReCrawlIncompletePages = useCallback(() => {
    if (!analysisData?.incompletePages || analysisData.incompletePages.length === 0) {
      console.error('No incomplete pages to re-crawl');
      return;
    }

    if (!onStartTargetedCrawling) {
      console.error('onStartTargetedCrawling not provided');
      return;
    }

    // Convert pageIds to page numbers for targeted crawling
    const pageIds = analysisData.incompletePages.map(page => page.pageId);
    console.log('Starting targeted crawling for incomplete pages:', pageIds);
    
    // Call the targeted crawling function with incomplete page IDs
    onStartTargetedCrawling(pageIds);
  }, [analysisData, onStartTargetedCrawling]);



  // Priority color mapping
  const getPriorityColor = (priority: 'high' | 'medium' | 'low') => {
    switch (priority) {
      case 'high': return 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30';
      case 'medium': return 'text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-900/30';
      case 'low': return 'text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/30';
      default: return 'text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-900/30';
    }
  };

  if (!hasMissingProducts && !missingProductsInfo) {
    return null; // Don't render if no missing data detected
  }

  return (
    <div className="space-y-4">
      {/* Missing Data Overview */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          {analysisData && (
            <button
              onClick={() => setShowDetailedAnalysis(!showDetailedAnalysis)}
              className="text-xs text-orange-600 dark:text-orange-400 hover:text-orange-800 dark:hover:text-orange-200 underline ml-auto"
            >
              {showDetailedAnalysis ? 'Hide Details' : 'Show Details'}
            </button>
          )}
        </div>

        {/* Summary Statistics with Categorization */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          {/* Total Missing Products */}
          <div className="text-center p-3 bg-white dark:bg-gray-800 rounded-lg border border-orange-200 dark:border-orange-600">
            <div className="text-lg font-bold text-orange-600 dark:text-orange-400">
              {statusSummary?.diff || missingProductsInfo?.missingCount || 0}
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400">Total Missing Products</div>
          </div>
          
          {/* Missing Pages (Site vs Local DB) */}
          {analysisData && statusSummary && (
            <div className="text-center p-3 bg-white dark:bg-gray-800 rounded-lg border border-blue-200 dark:border-blue-600">
              <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
                {(() => {
                  const siteTotalPages = statusSummary.siteTotalPages || 0;
                  const dbProductCount = statusSummary.dbProductCount || 0;
                  const productsPerPage = 12; // Standard products per page
                  const localDbPages = Math.ceil(dbProductCount / productsPerPage);
                  const missingPages = Math.max(0, siteTotalPages - localDbPages);
                  return missingPages;
                })()}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">Missing Pages</div>
              <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                Site: {statusSummary.siteTotalPages || 0} vs Local: {Math.ceil((statusSummary.dbProductCount || 0) / 12)} pages
              </div>
            </div>
          )}
          
          {/* Incomplete Pages with Site Page Range */}
          {analysisData && (
            <div className="text-center p-3 bg-white dark:bg-gray-800 rounded-lg border border-purple-200 dark:border-purple-600">
              <div className="text-lg font-bold text-purple-600 dark:text-purple-400">
                {analysisData.totalIncompletePages || 0}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">Incomplete Pages</div>
              <div className="text-xs text-purple-600 dark:text-purple-400 mt-1">
                ~{(analysisData.totalIncompletePages || 0) * 12} products affected
              </div>
            </div>
          )}
        </div>



        {/* Categorized Action Buttons */}
        <div className="space-y-3">
          {/* Analysis Button */}
          {onAnalyzeMissingProducts && (
            <button
              onClick={onAnalyzeMissingProducts}
              disabled={isMissingAnalyzing || isMissingProductCrawling}
              className={`w-full px-4 py-3 text-sm rounded-lg font-medium transition-all duration-200 shadow-sm ${
                isMissingAnalyzing || isMissingProductCrawling
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white shadow-orange-200 hover:shadow-orange-300'
              }`}
            >
              {isMissingAnalyzing ? (
                <>
                  <svg className="w-4 h-4 inline mr-2 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Analyzing Missing Data...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  Analyze Missing Data
                </>
              )}
            </button>
          )}

          {/* Main Action Buttons - Side by Side */}
          {analysisData && (analysisData.totalMissingDetails > 0 || analysisData.totalIncompletePages > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Collect All Missing Button */}
              {onStartMissingProductCrawling && (
                <button
                  onClick={onStartMissingProductCrawling}
                  disabled={isMissingProductCrawling || isMissingAnalyzing}
                  className={`px-4 py-3 text-sm rounded-lg font-medium transition-all duration-200 shadow-sm ${
                    isMissingProductCrawling || isMissingAnalyzing
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-emerald-200 hover:shadow-emerald-300'
                  }`}
                >
                  {isMissingProductCrawling ? (
                    <>
                      <svg className="w-4 h-4 inline mr-2 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Collecting All...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                      </svg>
                      Collect All  ({(analysisData.totalMissingDetails || 0) + (analysisData.totalIncompletePages || 0)})
                    </>
                  )}
                </button>
              )}

              {/* Re-crawl Incomplete Pages Button */}
              {analysisData.totalIncompletePages > 0 && (
                <button
                  onClick={handleReCrawlIncompletePages}
                  disabled={isCalculatingRanges || isMissingProductCrawling}
                  className={`px-4 py-3 text-sm rounded-lg font-medium transition-all duration-200 shadow-sm ${
                    isCalculatingRanges || isMissingProductCrawling
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white shadow-purple-200 hover:shadow-purple-300'
                  }`}
                >
                  {isCalculatingRanges ? (
                    <>
                      <svg className="w-4 h-4 inline mr-2 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Preparing Re-crawl...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Re-crawl Incompletes ({analysisData.totalIncompletePages})
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          {/* Categorized Collection Buttons */}
          {analysisData && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Missing Details Collection */}
              {analysisData.totalMissingDetails > 0 && onStartMissingProductCrawling && (
                <button
                  onClick={onStartMissingProductCrawling}
                  disabled={isMissingProductCrawling}
                  className={`px-4 py-3 text-sm rounded-lg font-medium transition-all duration-200 shadow-sm ${
                    isMissingProductCrawling
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-blue-200 hover:shadow-blue-300'
                  }`}
                >
                  {isMissingProductCrawling ? (
                    <>
                      <svg className="w-4 h-4 inline mr-2 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Collecting Details...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Collect Missing Details ({analysisData.totalMissingDetails})
                    </>
                  )}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Page Ranges Display */}
        {showPageRanges && pageRangeData && (
          <div className="mt-4 border border-blue-200 dark:border-blue-600 rounded-lg p-4 bg-blue-50 dark:bg-blue-900/20">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-blue-700 dark:text-blue-300">
                📊 Page Range Analysis
              </h4>
              <button
                onClick={() => setShowPageRanges(false)}
                className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-3">
              {/* Summary */}
              <div className="text-sm text-blue-600 dark:text-blue-400">
                <div>Total Incomplete Pages: <span className="font-semibold">{pageRangeData.totalIncompletePages}</span></div>
                <div>Site Pages to Crawl: <span className="font-semibold">{pageRangeData.totalIncompletePages * 2}</span></div>
                <div>Continuous Ranges: <span className="font-semibold">{pageRangeData.continuousRanges?.length || 0}</span></div>
                <div>Non-continuous Ranges: <span className="font-semibold">{pageRangeData.nonContinuousRanges?.length || 0}</span></div>
              </div>

              {/* Formatted Range Display */}
              {pageRangeData.formattedText && (
                <div className="bg-white dark:bg-gray-800 rounded p-3 border">
                  <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Suggested Crawling Ranges (Copy & Paste Ready):
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 font-mono bg-gray-50 dark:bg-gray-700 p-2 rounded border select-all">
                    {pageRangeData.formattedText}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    💡 Click to select all, then Cmd+C to copy
                  </div>
                </div>
              )}

            </div>
          </div>
        )}
      </div>

      {/* Detailed Analysis with Categorization */}
      {showDetailedAnalysis && analysisData && (
        <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-4 bg-white dark:bg-gray-800">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
            📋 Detailed Missing Data Analysis
          </h4>

          {/* Missing Data Categories Tabs */}
          <div className="space-y-4">
            {/* Missing Product Details Section */}
            {analysisData.totalMissingDetails > 0 && (
              <div className="border border-blue-200 dark:border-blue-600 rounded-lg p-3 bg-blue-50 dark:bg-blue-900/20">
                <div className="flex items-center justify-between mb-3">
                  <h5 className="text-sm font-medium text-blue-800 dark:text-blue-300 flex items-center">
                    <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 0v12h8V4H6z" clipRule="evenodd" />
                    </svg>
                    Missing Product Details ({analysisData.totalMissingDetails})
                  </h5>
                </div>
                <div className="text-xs text-blue-700 dark:text-blue-300 mb-2">
                  These products exist in the basic listing but are missing detailed information. They need individual detail collection.
                </div>
                
                {/* Show sample missing details */}
                {analysisData.missingDetails && analysisData.missingDetails.length > 0 && (
                  <div className="mt-3">
                    <div className="text-xs font-medium text-blue-800 dark:text-blue-300 mb-2">
                      Sample Missing Details (showing first 5):
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded border p-2 max-h-32 overflow-y-auto">
                      {analysisData.missingDetails.slice(0, 5).map((detail, index) => (
                        <div key={index} className="text-xs text-gray-600 dark:text-gray-400 py-1 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
                          <span className="font-mono text-blue-600 dark:text-blue-400">Page {detail.pageId}</span>
                          <span className="mx-2">•</span>
                          <span className="font-mono text-purple-600 dark:text-purple-400">Index {detail.indexInPage}</span>
                          <span className="mx-2">•</span>
                          <span className="text-gray-500 dark:text-gray-400 truncate">{detail.url}</span>
                        </div>
                      ))}
                      {analysisData.missingDetails.length > 5 && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 pt-1 text-center">
                          ... and {analysisData.missingDetails.length - 5} more
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Incomplete Pages Section */}
            {analysisData.totalIncompletePages > 0 && (
              <div className="border border-purple-200 dark:border-purple-600 rounded-lg p-3 bg-purple-50 dark:bg-purple-900/20">
                <div className="flex items-center justify-between mb-3">
                  <h5 className="text-sm font-medium text-purple-800 dark:text-purple-300 flex items-center">
                    <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z" clipRule="evenodd" />
                    </svg>
                    Incomplete Pages ({analysisData.totalIncompletePages})
                  </h5>
                </div>
                <div className="text-xs text-purple-700 dark:text-purple-300 mb-2">
                  These pages are missing entire products (gaps in page coverage). They need full page re-crawling.
                </div>
                
                {/* Show sample incomplete pages */}
                {analysisData.incompletePages && analysisData.incompletePages.length > 0 && (
                  <div className="mt-3">
                    <div className="text-xs font-medium text-purple-800 dark:text-purple-300 mb-2">
                      Sample Incomplete Pages (showing first 5):
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded border p-2 max-h-32 overflow-y-auto">
                      {analysisData.incompletePages.slice(0, 5).map((page, index) => (
                        <div key={index} className="text-xs text-gray-600 dark:text-gray-400 py-1 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
                          <span className="font-mono text-purple-600 dark:text-purple-400">Page {page.pageId}</span>
                          <span className="mx-2">•</span>
                          <span className="text-red-600 dark:text-red-400">{page.missingIndices.length} missing</span>
                          <span className="mx-2">•</span>
                          <span className="text-gray-500 dark:text-gray-400">{page.actualCount}/{page.expectedCount} products</span>
                          <span className="mx-2">•</span>
                          <span className="text-xs text-gray-400 font-mono">Missing indices: [{page.missingIndices.slice(0, 3).join(', ')}{page.missingIndices.length > 3 ? '...' : ''}]</span>
                        </div>
                      ))}
                      {analysisData.incompletePages.length > 5 && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 pt-1 text-center">
                          ... and {analysisData.incompletePages.length - 5} more
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Gap Analysis Summary */}
          {analysisData.gapAnalysis && (
            <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-900/20 rounded border border-gray-200 dark:border-gray-700">
              <h5 className="text-xs font-medium text-gray-800 dark:text-gray-300 mb-2">📊 Gap Analysis Summary</h5>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="text-center">
                  <div className="font-bold text-gray-600 dark:text-gray-400">
                    {analysisData.gapAnalysis.consecutiveGaps.length}
                  </div>
                  <div className="text-gray-600 dark:text-gray-400">Consecutive Gaps</div>
                </div>
                <div className="text-center">
                  <div className="font-bold text-gray-600 dark:text-gray-400">
                    {analysisData.gapAnalysis.scatteredMissing.length}
                  </div>
                  <div className="text-gray-600 dark:text-gray-400">Scattered Missing</div>
                </div>
                <div className="text-center">
                  <div className="font-bold text-gray-600 dark:text-gray-400">
                    {analysisData.gapAnalysis.totalGaps}
                  </div>
                  <div className="text-gray-600 dark:text-gray-400">Total Gaps</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}


    </div>
  );
};
