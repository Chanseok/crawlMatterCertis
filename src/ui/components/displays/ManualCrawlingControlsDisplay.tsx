/**
 * ManualCrawlingControlsDisplay.tsx
 * Clean Architecture Display Component
 * Single Responsibility: Manual page range input and crawling controls
 */

import React, { useState, useCallback, useMemo } from 'react';
import { PageRangeParser } from '../../../shared/utils/PageRangeParser';

interface ManualCrawlingControlsDisplayProps {
  status: string;
  totalSitePages?: number;
  isManualCrawling?: boolean;
  onStartManualCrawling?: (ranges: Array<{
    startPage: number;
    endPage: number;
    reason: string;
    priority: number;
    estimatedProducts: number;
  }>) => void;
}

export const ManualCrawlingControlsDisplay: React.FC<ManualCrawlingControlsDisplayProps> = ({
  status,
  totalSitePages = 1000,
  isManualCrawling = false,
  onStartManualCrawling
}) => {
  const [pageRangeInput, setPageRangeInput] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Parse and validate page ranges in real-time
  const parseResult = useMemo(() => {
    if (!pageRangeInput.trim()) {
      return {
        success: false,
        ranges: [],
        errors: [],
        totalPages: 0,
        estimatedProducts: 0
      };
    }
    
    return PageRangeParser.parsePageRanges(pageRangeInput, totalSitePages);
  }, [pageRangeInput, totalSitePages]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setPageRangeInput(e.target.value);
  }, []);

  const handleStartManualCrawling = useCallback(() => {
    if (parseResult.success && parseResult.ranges.length > 0 && onStartManualCrawling) {
      onStartManualCrawling(parseResult.ranges);
      setPageRangeInput(''); // Clear input after successful start
    }
  }, [parseResult, onStartManualCrawling]);

  const canStartCrawling = parseResult.success && 
                           parseResult.ranges.length > 0 && 
                           status !== 'running' && 
                           !isManualCrawling;

  return (
    <div className="space-y-4">
      {/* Manual Page Range Input Section */}
      <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-4 bg-blue-50 dark:bg-blue-900/20">
        <div className="flex items-center space-x-2 mb-3">
          <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
          </svg>
          <h3 className="text-sm font-medium text-blue-800 dark:text-blue-300">
            Manual Page Range Crawling
          </h3>
        </div>

        <div className="space-y-3">
          {/* Input Field */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Page Ranges
            </label>
            <input
              type="text"
              value={pageRangeInput}
              onChange={handleInputChange}
              placeholder="예: 1~12, 34, 72~85"
              className={`w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 transition-colors ${
                pageRangeInput && !parseResult.success
                  ? 'border-red-300 focus:ring-red-500 focus:border-red-500 bg-red-50 dark:bg-red-900/20'
                  : parseResult.success && parseResult.ranges.length > 0
                  ? 'border-green-300 focus:ring-green-500 focus:border-green-500 bg-green-50 dark:bg-green-900/20'
                  : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700'
              } dark:border-gray-600 dark:text-gray-100`}
              disabled={status === 'running' || isManualCrawling}
            />
            
            {/* Help Text */}
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Format: Single pages (34), ranges (1~12), or combinations (1~12, 34, 72~85)
            </p>
          </div>

          {/* Validation Results */}
          {pageRangeInput && (
            <div className="space-y-2">
              {/* Success Message */}
              {parseResult.success && parseResult.ranges.length > 0 && (
                <div className="p-2 bg-green-100 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded text-sm">
                  <div className="flex items-center space-x-2 text-green-800 dark:text-green-300">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="font-medium">Valid Input</span>
                  </div>
                  <div className="mt-1 text-green-700 dark:text-green-400 space-y-1">
                    <div>• Total Pages: {parseResult.totalPages}</div>
                    <div>• Estimated Products: {parseResult.estimatedProducts}</div>
                    <div>• Ranges: {parseResult.ranges.length}</div>
                  </div>
                </div>
              )}

              {/* Error Messages */}
              {parseResult.errors.length > 0 && (
                <div className="p-2 bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded text-sm">
                  <div className="flex items-center space-x-2 text-red-800 dark:text-red-300 mb-1">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <span className="font-medium">Validation Errors</span>
                  </div>
                  <ul className="text-red-700 dark:text-red-400 space-y-1">
                    {parseResult.errors.map((error: string, index: number) => (
                      <li key={index}>• {error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Advanced Options Toggle */}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 underline"
          >
            {showAdvanced ? 'Hide' : 'Show'} Advanced Options
          </button>

          {/* Advanced Options */}
          {showAdvanced && (
            <div className="p-3 bg-gray-100 dark:bg-gray-700 rounded border">
              <h4 className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Advanced Settings</h4>
              <div className="space-y-2 text-xs text-gray-600 dark:text-gray-400">
                <div>• Total Site Pages: {totalSitePages.toLocaleString()}</div>
                <div>• Supported Delimiters: ~ (tilde), - (dash), : (colon)</div>
                <div>• Automatic range optimization enabled</div>
                <div>• Duplicate page removal enabled</div>
              </div>
            </div>
          )}

          {/* Start Button */}
          <button
            onClick={handleStartManualCrawling}
            disabled={!canStartCrawling}
            className={`w-full px-4 py-2 rounded font-medium transition-colors ${
              canStartCrawling
                ? 'bg-blue-500 hover:bg-blue-600 text-white'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            {isManualCrawling 
              ? 'Manual Crawling in Progress...' 
              : status === 'running' 
              ? 'Cannot Start (Crawling Active)' 
              : !parseResult.success 
              ? 'Fix Input to Start' 
              : `Start Manual Crawling (${parseResult.totalPages} pages)`}
          </button>
        </div>
      </div>
    </div>
  );
};
