/**
 * ValidationResultsPanel.tsx
 * 1.5단계에서 수행된 로컬DB 중복 검증 결과를 표시하는 컴포넌트
 */

import React, { useMemo } from 'react';
import type { ValidationSummary } from '../../../types.js';

interface ValidationResultsPanelProps {
  validationSummary?: ValidationSummary;
  recommendations?: string[];
  isVisible: boolean;
  isInProgress?: boolean;
  isCompleted?: boolean;
  hasErrors?: boolean;
}

/**
 * 제품 검증 결과 패널 컴포넌트
 * 1.5/3단계에서 수행된 로컬DB 중복 검증 결과를 표시
 */
export const ValidationResultsPanel: React.FC<ValidationResultsPanelProps> = ({
  validationSummary,
  recommendations,
  isVisible,
  isInProgress = false,
  isCompleted = false,
  hasErrors = false
}) => {
  if (!isVisible) return null;

  // 검증이 진행 중인 경우 로딩 상태 표시
  if (isInProgress) {
    return (
      <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-md border border-blue-100 dark:border-blue-800 animate-fade-in">
        <div className="font-medium text-gray-800 dark:text-gray-200 mb-3 flex items-center">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mr-2"></div>
          <span className="text-blue-700 dark:text-blue-300">1.5단계: 제품 검증 진행 중...</span>
        </div>
        <div className="text-sm text-gray-600 dark:text-gray-400">
          로컬 데이터베이스와 비교하여 중복 제품을 확인하고 있습니다.
        </div>
      </div>
    );
  }

  // 검증 결과가 없는 경우
  if (!validationSummary) return null;

  const metrics = useMemo(() => {
    const skipRatio = validationSummary.skipRatio || 0;
    const newRatio = 100 - skipRatio;
    const duplicateRatio = validationSummary.duplicateRatio || 0;
    const processingEfficiency = validationSummary.totalProducts > 0 ? 
      ((validationSummary.newProducts + validationSummary.existingProducts) / validationSummary.totalProducts) * 100 : 0;

    return {
      skipRatio,
      newRatio,
      duplicateRatio,
      processingEfficiency
    };
  }, [validationSummary]);

  // 위험도에 따른 색상과 아이콘 결정
  const getStatusIndicator = (ratio: number, isReverse = false) => {
    const threshold = isReverse ? ratio : 100 - ratio;
    
    if (threshold >= 75) {
      return {
        color: 'text-green-600 dark:text-green-400',
        bgColor: 'bg-green-50 dark:bg-green-900/20',
        icon: (
          <svg className="w-4 h-4 text-green-500 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ),
        status: 'excellent'
      };
    }
    
    if (threshold >= 50) {
      return {
        color: 'text-yellow-600 dark:text-yellow-400',
        bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
        icon: (
          <svg className="w-4 h-4 text-yellow-500 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        ),
        status: 'warning'
      };
    }
    
    return {
      color: 'text-red-600 dark:text-red-400',
      bgColor: 'bg-red-50 dark:bg-red-900/20',
      icon: (
        <svg className="w-4 h-4 text-red-500 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      ),
      status: 'critical'
    };
  };

  const newProductsIndicator = getStatusIndicator(metrics.newRatio);
  const duplicateIndicator = getStatusIndicator(metrics.duplicateRatio, true);

  return (
    <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800 animate-fade-in">
      {/* 헤더 */}
      <div className="font-medium text-gray-800 dark:text-gray-200 mb-4 flex items-center">
        {hasErrors ? (
          <>
            <svg className="w-5 h-5 mr-2 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="text-red-700 dark:text-red-300">크롤링 중 오류 발생</span>
            <button 
              onClick={() => console.log('Show error details')}
              className="ml-auto text-xs px-2 py-1 bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-900/70 transition-colors"
            >
              상세 정보
            </button>
          </>
        ) : isCompleted ? (
          <>
            <svg className="w-5 h-5 mr-2 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-green-700 dark:text-green-300">크롤링 완료</span>
          </>
        ) : (
          <>
            <svg className="w-5 h-5 mr-2 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-blue-700 dark:text-blue-300">1.5단계: 제품 검증 완료</span>
          </>
        )}
        <div className="ml-auto flex items-center text-xs text-gray-500 dark:text-gray-400">
          <span className="mr-2">처리 효율:</span>
          <span className={`font-semibold ${metrics.processingEfficiency >= 95 ? 'text-green-600' : metrics.processingEfficiency >= 80 ? 'text-yellow-600' : 'text-red-600'}`}>
            {metrics.processingEfficiency.toFixed(1)}%
          </span>
        </div>
      </div>
      
      {/* 주요 지표 그리드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {/* 총 수집 제품 */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm border border-gray-100 dark:border-gray-700 transition-all hover:shadow-md">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1 flex items-center">
            <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            총 수집 제품
          </div>
          <div className="text-xl font-bold text-gray-800 dark:text-gray-200 flex items-baseline">
            {validationSummary.totalProducts.toLocaleString()}
            <span className="text-xs ml-1 font-normal text-gray-500 dark:text-gray-400">개</span>
          </div>
        </div>
        
        {/* 신규 제품 */}
        <div className={`rounded-lg p-3 shadow-sm border transition-all hover:shadow-md ${newProductsIndicator.bgColor} ${newProductsIndicator.status === 'excellent' ? 'border-green-200 dark:border-green-800' : newProductsIndicator.status === 'warning' ? 'border-yellow-200 dark:border-yellow-800' : 'border-red-200 dark:border-red-800'}`}>
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1 flex items-center">
            {newProductsIndicator.icon}
            신규 제품
          </div>
          <div className={`text-xl font-bold ${newProductsIndicator.color} flex items-baseline`}>
            {validationSummary.newProducts.toLocaleString()}
            <span className="text-xs ml-1 font-normal text-gray-500 dark:text-gray-400">개 ({metrics.newRatio.toFixed(1)}%)</span>
          </div>
        </div>
        
        {/* 기존 제품 */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm border border-gray-100 dark:border-gray-700 transition-all hover:shadow-md">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1 flex items-center">
            <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
            기존 제품
          </div>
          <div className="text-xl font-bold text-blue-600 dark:text-blue-400 flex items-baseline">
            {validationSummary.existingProducts.toLocaleString()}
            <span className="text-xs ml-1 font-normal text-gray-500 dark:text-gray-400">개</span>
          </div>
        </div>
        
        {/* 중복 제품 */}
        <div className={`rounded-lg p-3 shadow-sm border transition-all hover:shadow-md ${duplicateIndicator.bgColor} ${duplicateIndicator.status === 'excellent' ? 'border-green-200 dark:border-green-800' : duplicateIndicator.status === 'warning' ? 'border-yellow-200 dark:border-yellow-800' : 'border-red-200 dark:border-red-800'}`}>
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1 flex items-center">
            {duplicateIndicator.icon}
            중복 제품
          </div>
          <div className={`text-xl font-bold ${duplicateIndicator.color} flex items-baseline`}>
            {validationSummary.duplicateProducts.toLocaleString()}
            <span className="text-xs ml-1 font-normal text-gray-500 dark:text-gray-400">개 ({metrics.duplicateRatio.toFixed(1)}%)</span>
          </div>
        </div>
      </div>

      {/* 진행 단계 시각화 */}
      <div className="mb-4">
        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-2">
          <span className="flex items-center">
            <span className="w-2 h-2 bg-blue-500 rounded-full mr-1"></span>
            1단계: 목록 수집
          </span>
          <span className="flex items-center">
            <span className="w-2 h-2 bg-purple-500 rounded-full mr-1"></span>
            1.5단계: 검증 완료
          </span>
          <span className="flex items-center text-gray-400">
            <span className="w-2 h-2 bg-gray-300 rounded-full mr-1"></span>
            2단계: 상세 수집
          </span>
        </div>
        <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full relative overflow-hidden">
          {/* 1단계 완료 */}
          <div className="absolute left-0 w-1/2 h-2 bg-blue-500 dark:bg-blue-600 rounded-l-full"></div>
          {/* 1.5단계 완료 */}
          <div className="absolute left-[50%] w-1/4 h-2 bg-purple-500 dark:bg-purple-600"></div>
          {/* 현재 위치 마커 */}
          <div className="absolute left-[75%] transform -translate-x-1/2 top-0 w-3 h-3 bg-purple-500 dark:bg-purple-600 border-2 border-white dark:border-gray-800 rounded-full animate-pulse"></div>
        </div>
      </div>

      {/* 권장사항 */}
      {recommendations && recommendations.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg border border-amber-200 dark:border-amber-800 mb-3">
          <div className="text-sm font-medium text-amber-800 dark:text-amber-300 mb-2 flex items-center">
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            권장사항
          </div>
          <ul className="text-xs text-amber-700 dark:text-amber-200 space-y-1">
            {recommendations.map((recommendation, index) => (
              <li key={index} className="flex items-start">
                <span className="w-1 h-1 bg-amber-500 rounded-full mt-2 mr-2 flex-shrink-0"></span>
                <span className="flex-1">{recommendation}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      
      {/* 추가 정보 */}
      <div className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2">
        <div className="flex items-center">
          <svg className="w-3 h-3 mr-1 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="font-medium">검증 정보:</span>
          <span className="ml-1">신규/기존 제품 정보는 로컬 데이터베이스와 비교한 결과입니다.</span>
        </div>
        {metrics.duplicateRatio > 10 && (
          <div className="flex items-center mt-1 text-amber-600 dark:text-amber-400">
            <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="font-medium">주의:</span>
            <span className="ml-1">중복률이 높습니다. 크롤링 범위를 조정하는 것을 고려해보세요.</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default ValidationResultsPanel;
