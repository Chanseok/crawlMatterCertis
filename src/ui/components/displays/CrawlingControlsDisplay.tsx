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
  hasMissingProducts?: boolean;
  isMissingProductCrawling?: boolean;
  isMissingAnalyzing?: boolean;
  onStartMissingProductCrawling?: () => void;
  onAnalyzeMissingProducts?: () => void;
  // Manual crawling props
  totalSitePages?: number;
  isManualCrawling?: boolean;
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
  hasMissingProducts = false,
  isMissingProductCrawling = false,
  isMissingAnalyzing = false,
  onStartMissingProductCrawling,
  onAnalyzeMissingProducts,
  // Manual crawling props
  totalSitePages,
  isManualCrawling = false,
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
  return (
    <div className="space-y-6">
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
          {status === 'running' ? (
            <button
              onClick={onStopCrawling}
              disabled={isStopping}
              className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 shadow-sm ${
                isStopping 
                  ? 'bg-gray-400 text-gray-200 cursor-not-allowed animate-pulse'
                  : 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white shadow-red-200 hover:shadow-red-300'
              }`}
            >
              {isStopping ? '중지 중...' : '중지'}
            </button>
          ) : (
            <button
              onClick={onStartCrawling}
              disabled={status === 'running' || isStopping}
              className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 shadow-sm ${
                status === 'running' || isStopping
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
          isManualCrawling={isManualCrawling}
          onStartManualCrawling={onStartManualCrawling}
        />
      )}

      {/* Enhanced Missing Data Analysis Section */}
      <ExpandableSection
        title="⚠️ Missing Data Analysis"
        isExpanded={isMissingAnalysisExpanded}
        onToggle={toggleMissingAnalysis}
        additionalClasses="border border-orange-200 dark:border-orange-700 bg-orange-50 dark:bg-orange-900/20"
      >
        <EnhancedMissingDataDisplay
          statusSummary={statusSummary}
          missingProductsInfo={missingProductsInfo}
          isMissingAnalyzing={isMissingAnalyzing}
          isMissingProductCrawling={isMissingProductCrawling}
          onAnalyzeMissingProducts={onAnalyzeMissingProducts}
          onStartMissingProductCrawling={onStartMissingProductCrawling}
          onStartTargetedCrawling={onStartTargetedCrawling}
          onAutoRefresh={onAutoRefreshMissingData}
        />
      </ExpandableSection>

      {/* Legacy Missing Product Collection Section (for backwards compatibility) */}
      {(hasMissingProducts || onAnalyzeMissingProducts) && !statusSummary && (
        <div className="border-t pt-4">
          <div className="flex items-center space-x-2 mb-2">
            <svg className="w-5 h-5 text-orange-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">누락 제품 수집</h3>
          </div>
          
          <div className="flex space-x-2">
            {/* Analyze Missing Products Button */}
            {onAnalyzeMissingProducts && (
              <button
                onClick={onAnalyzeMissingProducts}
                disabled={status === 'running' || isMissingProductCrawling || isMissingAnalyzing}
                className={`px-3 py-2 text-sm rounded-lg font-medium transition-all duration-200 shadow-sm ${
                  status === 'running' || isMissingProductCrawling || isMissingAnalyzing
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white shadow-orange-200 hover:shadow-orange-300'
                }`}
              >
                {isMissingAnalyzing ? '분석 중...' : '누락 데이터 분석'}
              </button>
            )}

            {/* Start Missing Product Crawling Button */}
            {hasMissingProducts && onStartMissingProductCrawling && (
              <button
                onClick={onStartMissingProductCrawling}
                disabled={status === 'running' || isMissingProductCrawling}
                className={`px-3 py-2 text-sm rounded-lg font-medium transition-all duration-200 shadow-sm ${
                  status === 'running' || isMissingProductCrawling
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white shadow-purple-200 hover:shadow-purple-300'
                }`}
              >
                {isMissingProductCrawling ? '누락 제품 수집 중...' : '누락 제품 수집 시작'}
              </button>
            )}
          </div>
          
          {hasMissingProducts && (
            <p className="mt-2 text-xs text-orange-600 dark:text-orange-400">
              ⚠️ 사이트와 로컬 DB 간에 누락된 제품이 발견되었습니다.
            </p>
          )}
        </div>
      )}
    </div>
  );
};
