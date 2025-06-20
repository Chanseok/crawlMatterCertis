/**
 * CrawlingControlsDisplay.tsx
 * Clean Architecture Display Component
 * Single Responsibility: Display control buttons (start/stop/check status)
 */

import React, { useState } from 'react';
import { ManualCrawlingControlsDisplay } from './ManualCrawlingControlsDisplay';
import { EnhancedMissingDataDisplay } from './EnhancedMissingDataDisplay';
import { ExpandableSection } from '../ExpandableSection';

interface CrawlingControlsDisplayProps {
  status: string;
  isStatusChecking: boolean;
  isStopping?: boolean; // 중지 중 상태 추가
  onCheckStatus: () => void;
  onStartCrawling: () => void;
  onStopCrawling: () => void;
  // 누락 제품 수집 관련 props
  isMissingProductCrawling?: boolean;
  isMissingAnalyzing?: boolean;
  onStartMissingProductCrawling?: () => void;
  onAnalyzeMissingProducts?: () => void;
  // Manual crawling props
  totalSitePages?: number;
  onStartManualCrawling?: (ranges: Array<{
    startPage: number;
    endPage: number;
    reason: string;
    priority: number;
    estimatedProducts: number;
  }>) => void;
  // Missing data analysis props
  statusSummary?: {
    dbProductCount?: number;
    siteProductCount?: number;
    diff?: number;
    needCrawling?: boolean;
    selectedPageCount?: number;
  };
  missingProductsInfo?: {
    missingCount: number;
    analysisResult?: any;
  };
  onStartTargetedCrawling?: (pages: number[]) => void;
  // NEW: Auto-refresh callback for missing data analysis
  onAutoRefreshMissingData?: () => void;
}

export const CrawlingControlsDisplay: React.FC<CrawlingControlsDisplayProps> = ({
  status,
  isStatusChecking,
  isStopping = false, // 기본값 false
  onCheckStatus,
  onStartCrawling,
  onStopCrawling,
  // 누락 제품 수집 관련 props with defaults
  isMissingProductCrawling = false,
  isMissingAnalyzing = false,
  onStartMissingProductCrawling,
  onAnalyzeMissingProducts,
  // Manual crawling props
  totalSitePages,
  onStartManualCrawling,
  // Missing data analysis props
  statusSummary,
  missingProductsInfo,
  onStartTargetedCrawling,
  onAutoRefreshMissingData
}) => {
  // Missing Data Analysis 섹션의 확장/축소 상태 관리
  const [isMissingAnalysisExpanded, setIsMissingAnalysisExpanded] = useState(false);

  const toggleMissingAnalysis = () => {
    setIsMissingAnalysisExpanded(!isMissingAnalysisExpanded);
  };

  // 크롤링 완료 후 차이가 있는 상황인지 확인
  const hasDataDiscrepancy = statusSummary && 
    statusSummary.dbProductCount !== undefined && 
    statusSummary.siteProductCount !== undefined && 
    statusSummary.diff !== undefined && 
    Math.abs(statusSummary.diff) > 0 && 
    (
      !statusSummary.needCrawling || // 더 이상 크롤링할 페이지가 없거나
      (statusSummary.selectedPageCount && statusSummary.selectedPageCount <= 3) // 크롤링할 페이지가 3페이지 이하
    );

  // 크롤링 시작 전 Missing Data Analysis 추천
  const handleStartCrawling = () => {
    if (hasDataDiscrepancy) {
      const confirmMessage = `Missing Data Analysis를 먼저 사용하는 것이 더 효율적일 수 있습니다.\n그래도 전체 크롤링을 시작하시겠습니까?`;
      if (window.confirm(confirmMessage)) {
        onStartCrawling();
      }
    } else {
      onStartCrawling();
    }
  };

  return (
    <div className="space-y-6">
      {/* Data Discrepancy Warning */}
      {hasDataDiscrepancy && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-medium text-amber-800 dark:text-amber-200">
                데이터 차이 감지
              </h3>
              <div className="mt-1 text-sm text-amber-700 dark:text-amber-300">
                <p>사이트 제품수({statusSummary!.siteProductCount!.toLocaleString()}개)와 로컬 DB 제품수({statusSummary!.dbProductCount!.toLocaleString()}개) 간에 {Math.abs(statusSummary!.diff!)}개의 차이가 있습니다.</p>
              </div>
              <div className="mt-3">
                <button
                  onClick={() => setIsMissingAnalysisExpanded(true)}
                  className="text-sm bg-amber-100 hover:bg-amber-200 dark:bg-amber-800 dark:hover:bg-amber-700 text-amber-800 dark:text-amber-200 px-3 py-1 rounded-md transition-colors duration-200"
                >
                  Missing Data Analysis 사용하기 →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Control Buttons */}
      <div className="space-y-4">
        <div className="flex space-x-2 mb-4">
          {/* Check Status Button */}
          <button
            onClick={onCheckStatus}
            disabled={isStatusChecking || status === 'running'}
            className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 shadow-sm ${
              isStatusChecking || status === 'running'
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-blue-200 hover:shadow-blue-300'
            }`}
          >
            {isStatusChecking ? '확인 중...' : '상태 체크'}
          </button>

          {/* Start/Stop Buttons */}
          {status === 'running' || status === 'initializing' ? (
            <button
              onClick={onStopCrawling}
              disabled={isStopping || status === 'initializing'}
              className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 shadow-sm ${
                isStopping || status === 'initializing'
                  ? 'bg-gray-400 text-gray-200 cursor-not-allowed animate-pulse'
                  : 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white shadow-red-200 hover:shadow-red-300'
              }`}
            >
              {status === 'initializing' ? '초기화 중...' : (isStopping ? '중지 중...' : '중지')}
            </button>
          ) : (
            <button
              onClick={handleStartCrawling}
              disabled={status === 'running' || status === 'initializing' || isStopping}
              className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 shadow-sm ${
                status === 'running' || status === 'initializing' || isStopping
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white shadow-green-200 hover:shadow-green-300'
              }`}
            >
              시작
            </button>
          )}
        </div>
      </div>

      {/* Manual Page Range Crawling Section */}
      {onStartManualCrawling && (
        <ManualCrawlingControlsDisplay
          status={status}
          totalSitePages={totalSitePages}
          onStartManualCrawling={onStartManualCrawling}
        />
      )}

      {/* Missing Data Analysis Section */}
      <ExpandableSection 
        title="Missing Data Analysis" 
        isExpanded={isMissingAnalysisExpanded}
        onToggle={toggleMissingAnalysis}
        additionalClasses="bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-800"
        headerTextColor="text-orange-700 dark:text-orange-300"
      >
        <EnhancedMissingDataDisplay
          isMissingProductCrawling={isMissingProductCrawling}
          isMissingAnalyzing={isMissingAnalyzing}
          onStartMissingProductCrawling={onStartMissingProductCrawling}
          onAnalyzeMissingProducts={onAnalyzeMissingProducts}
          statusSummary={statusSummary}
          missingProductsInfo={missingProductsInfo}
          onStartTargetedCrawling={onStartTargetedCrawling}
          onAutoRefresh={onAutoRefreshMissingData}
        />
      </ExpandableSection>
    </div>
  );
};
