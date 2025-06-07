/**
 * EnhancedMissingDataDisplay.tsx
 * Clean Architecture Display Component
 * Single Responsibility: Enhanced missing data analysis visualization and controls
 */

import React, { useState, useCallback, useMemo } from 'react';

interface MissingDataDetails {
  totalMissingDetails: number;
  missingProductPages: Array<{
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
}

export const EnhancedMissingDataDisplay: React.FC<EnhancedMissingDataDisplayProps> = ({
  statusSummary,
  missingProductsInfo,
  isMissingAnalyzing = false,
  isMissingProductCrawling = false,
  onAnalyzeMissingProducts,
  onStartMissingProductCrawling,
  onStartTargetedCrawling
}) => {
  const [showDetailedAnalysis, setShowDetailedAnalysis] = useState(false);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [pageRangeData, setPageRangeData] = useState<any>(null);
  const [isCalculatingRanges, setIsCalculatingRanges] = useState(false);
  const [showPageRanges, setShowPageRanges] = useState(false);

  // Determine if there are missing products
  const hasMissingProducts = useMemo(() => {
    if (statusSummary?.diff && statusSummary.diff > 0) return true;
    if (missingProductsInfo && missingProductsInfo.missingCount > 0) return true;
    return false;
  }, [statusSummary, missingProductsInfo]);

  // Get analysis data
  const analysisData = missingProductsInfo?.analysisResult;

  const handlePageSelection = useCallback((pageNumber: number, selected: boolean) => {
    setSelectedPages(prev => {
      const newSet = new Set(prev);
      if (selected) {
        newSet.add(pageNumber);
      } else {
        newSet.delete(pageNumber);
      }
      return newSet;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (!analysisData?.missingProductPages) return;
    
    const allPages = analysisData.missingProductPages.map(p => p.pageNumber);
    setSelectedPages(new Set(allPages));
  }, [analysisData]);

  const handleClearSelection = useCallback(() => {
    setSelectedPages(new Set());
  }, []);

  const handleStartTargetedCrawling = useCallback(() => {
    if (selectedPages.size > 0 && onStartTargetedCrawling) {
      onStartTargetedCrawling(Array.from(selectedPages));
      setSelectedPages(new Set()); // Clear selection after starting
    }
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

        {/* Summary Statistics */}
        <div className="grid grid-cols-2 gap-4 mb-3">
          <div className="text-center p-2 bg-white dark:bg-gray-800 rounded">
            <div className="text-lg font-bold text-orange-600 dark:text-orange-400">
              {statusSummary?.diff || missingProductsInfo?.missingCount || 0}
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400">Missing Products</div>
          </div>
          
          {analysisData && (
            <div className="text-center p-2 bg-white dark:bg-gray-800 rounded">
              <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
                {analysisData.missingProductPages?.length || 0}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">Affected Pages</div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex space-x-2">
          {/* Analyze Button */}
          {onAnalyzeMissingProducts && (
            <button
              onClick={onAnalyzeMissingProducts}
              disabled={isMissingAnalyzing || isMissingProductCrawling}
              className={`px-3 py-2 text-sm rounded-lg font-medium transition-all duration-200 shadow-sm flex-1 ${
                isMissingAnalyzing || isMissingProductCrawling
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white shadow-orange-200 hover:shadow-orange-300'
              }`}
            >
              {isMissingAnalyzing ? (
                <>
                  <svg className="w-4 h-4 inline mr-1 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Analyzing...
                </>
              ) : (
                'Analyze Missing Data'
              )}
            </button>
          )}

          {/* Start Collection Button */}
          {hasMissingProducts && onStartMissingProductCrawling && (
            <button
              onClick={onStartMissingProductCrawling}
              disabled={isMissingProductCrawling || !analysisData}
              className={`px-3 py-2 text-sm rounded-lg font-medium transition-all duration-200 shadow-sm flex-1 ${
                isMissingProductCrawling || !analysisData
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white shadow-purple-200 hover:shadow-purple-300'
              }`}
            >
              {isMissingProductCrawling ? (
                <>
                  <svg className="w-4 h-4 inline mr-1 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Collecting...
                </>
              ) : (
                'Collect All Missing'
              )}
            </button>
          )}
        </div>

        {/* Calculate Page Ranges Button */}
        {analysisData && (
          <div className="mt-3 flex space-x-2">
            <button
              onClick={handleCalculatePageRanges}
              disabled={isCalculatingRanges || isMissingProductCrawling}
              className={`px-3 py-2 text-sm rounded-lg font-medium transition-all duration-200 shadow-sm flex-1 ${
                isCalculatingRanges || isMissingProductCrawling
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white shadow-blue-200 hover:shadow-indigo-300'
              }`}
            >
              {isCalculatingRanges ? (
                <>
                  <svg className="w-4 h-4 inline mr-1 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Calculating...
                </>
              ) : (
                'Calculate Page Ranges'
              )}
            </button>
          </div>
        )}

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

      {/* Detailed Analysis */}
      {showDetailedAnalysis && analysisData && (
        <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-4 bg-white dark:bg-gray-800">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            Detailed Missing Data Analysis
          </h4>

          {/* Gap Analysis Summary */}
          {analysisData.gapAnalysis && (
            <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-700">
              <h5 className="text-xs font-medium text-blue-800 dark:text-blue-300 mb-2">Gap Analysis</h5>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="text-center">
                  <div className="font-bold text-blue-600 dark:text-blue-400">
                    {analysisData.gapAnalysis.consecutiveGaps.length}
                  </div>
                  <div className="text-gray-600 dark:text-gray-400">Consecutive Gaps</div>
                </div>
                <div className="text-center">
                  <div className="font-bold text-blue-600 dark:text-blue-400">
                    {analysisData.gapAnalysis.scatteredMissing.length}
                  </div>
                  <div className="text-gray-600 dark:text-gray-400">Scattered Missing</div>
                </div>
                <div className="text-center">
                  <div className="font-bold text-blue-600 dark:text-blue-400">
                    {analysisData.gapAnalysis.totalGaps}
                  </div>
                  <div className="text-gray-600 dark:text-gray-400">Total Gaps</div>
                </div>
              </div>
            </div>
          )}

          {/* Page Selection Controls */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex space-x-2">
              <button
                onClick={handleSelectAll}
                className="px-2 py-1 text-xs bg-gradient-to-r from-blue-100 to-blue-200 hover:from-blue-200 hover:to-blue-300 text-blue-800 rounded-lg font-medium transition-all duration-200"
              >
                Select All
              </button>
              <button
                onClick={handleClearSelection}
                className="px-2 py-1 text-xs bg-gradient-to-r from-gray-100 to-gray-200 hover:from-gray-200 hover:to-gray-300 text-gray-800 rounded-lg font-medium transition-all duration-200"
              >
                Clear
              </button>
            </div>
            
            {selectedPages.size > 0 && onStartTargetedCrawling && (
              <button
                onClick={handleStartTargetedCrawling}
                className="px-3 py-1 text-xs bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-lg font-medium transition-all duration-200 shadow-sm"
              >
                Crawl Selected ({selectedPages.size} pages)
              </button>
            )}
          </div>

          {/* Missing Pages List */}
          <div className="max-h-60 overflow-y-auto">
            <div className="space-y-2">
              {analysisData.missingProductPages?.map((page) => (
                <div
                  key={page.pageNumber}
                  className="flex items-center justify-between p-2 border border-gray-200 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  <div className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={selectedPages.has(page.pageNumber)}
                      onChange={(e) => handlePageSelection(page.pageNumber, e.target.checked)}
                      className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        Page {page.pageNumber}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        ~{page.estimatedProducts} products • {page.reason}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <span className={`px-2 py-1 text-xs font-medium rounded ${getPriorityColor(page.priority)}`}>
                      {page.priority.toUpperCase()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Selection Summary */}
          {selectedPages.size > 0 && (
            <div className="mt-3 p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded text-sm">
              <div className="flex items-center space-x-2 text-green-800 dark:text-green-300">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>
                  {selectedPages.size} pages selected for targeted crawling
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Status Messages */}
      {hasMissingProducts && (
        <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded text-sm">
          <div className="flex items-center space-x-2 text-yellow-800 dark:text-yellow-300">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span>
              Missing products detected between site and local database. 
              {!analysisData && ' Run analysis to identify specific missing pages.'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
