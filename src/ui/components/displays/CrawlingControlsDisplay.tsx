/**
 * CrawlingControlsDisplay.tsx
 * Clean Architecture Display Component
 * Single Responsibility: Display control buttons (start/stop/check status)
 */

import React from 'react';
import { ManualCrawlingControlsDisplay } from './ManualCrawlingControlsDisplay';
import { EnhancedMissingDataDisplay } from './EnhancedMissingDataDisplay';

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
  onStartTargetedCrawling
}) => {
  return (
    <div className="space-y-6">
      {/* Main Control Buttons */}
      <div className="space-y-4">
        <div className="flex space-x-2 mb-4">
          {/* Check Status Button */}
          <button
            onClick={onCheckStatus}
            disabled={isStatusChecking || status === 'running'}
            className={`px-4 py-2 rounded font-medium transition-colors ${
              isStatusChecking || status === 'running'
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-blue-500 hover:bg-blue-600 text-white'
            }`}
          >
            {isStatusChecking ? '확인 중...' : '상태 체크'}
          </button>

          {/* Start/Stop Buttons */}
          {status === 'running' ? (
            <button
              onClick={onStopCrawling}
              disabled={isStopping}
              className={`px-4 py-2 rounded font-medium transition-colors ${
                isStopping 
                  ? 'bg-gray-400 text-gray-200 cursor-not-allowed animate-pulse'
                  : 'bg-red-500 hover:bg-red-600 text-white'
              }`}
            >
              {isStopping ? '중지 중...' : '중지'}
            </button>
          ) : (
            <button
              onClick={onStartCrawling}
              disabled={status === 'running' || isStopping}
              className={`px-4 py-2 rounded font-medium transition-colors ${
                status === 'running' || isStopping
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-green-500 hover:bg-green-600 text-white'
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
      <EnhancedMissingDataDisplay
        statusSummary={statusSummary}
        missingProductsInfo={missingProductsInfo}
        isMissingAnalyzing={isMissingAnalyzing}
        isMissingProductCrawling={isMissingProductCrawling}
        onAnalyzeMissingProducts={onAnalyzeMissingProducts}
        onStartMissingProductCrawling={onStartMissingProductCrawling}
        onStartTargetedCrawling={onStartTargetedCrawling}
      />

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
                className={`px-3 py-2 text-sm rounded font-medium transition-colors ${
                  status === 'running' || isMissingProductCrawling || isMissingAnalyzing
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-orange-500 hover:bg-orange-600 text-white'
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
                className={`px-3 py-2 text-sm rounded font-medium transition-colors ${
                  status === 'running' || isMissingProductCrawling
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-purple-500 hover:bg-purple-600 text-white'
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
