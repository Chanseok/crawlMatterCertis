import React, { useMemo } from 'react';

interface StageTransitionIndicatorProps {
  currentStage: number | string | undefined;
  currentStep?: string;
  isVertical?: boolean;
}

/**
 * 크롤링 단계 전환 표시 컴포넌트
 * 현재 크롤링 단계를 시각적으로 표시하는 컴포넌트
 */
export const StageTransitionIndicator: React.FC<StageTransitionIndicatorProps> = React.memo(({ 
  currentStage, 
  currentStep,
  isVertical = false
}) => {
  // 현재 단계에 따른 진행률 계산
  const progress = useMemo(() => {
    // 검증 단계 (2단계) 확인
    if (currentStep && (
      currentStep.toLowerCase().includes('검증') || 
      currentStep.toLowerCase().includes('로컬db') || 
      currentStep.toLowerCase().includes('2/3') || 
      currentStep.toLowerCase().includes('db 중복')
    )) {
      return 50; // 2단계 = 50% 진행
    }

    // 숫자로 된 단계 기반 진행률
    if (typeof currentStage === 'number') {
      if (currentStage === 1) return 33; // 1단계 = 33% 진행
      if (currentStage === 2) return 66; // 2단계 = 66% 진행 (상세 정보 수집)
      if (currentStage === 3) return 100; // 3단계 = 100% 완료
      return 0; // 기본값
    }

    // 문자열 단계명 기반 진행률
    if (typeof currentStage === 'string') {
      if (currentStage.includes('productList')) return 33;
      if (currentStage.includes('validation')) return 50;
      if (currentStage.includes('productDetail')) return 66;
      if (currentStage === 'complete' || currentStage === 'completed') return 100;
    }

    return 0;
  }, [currentStage, currentStep]);

  // 단계 레이블 계산
  const getStageLabel = (stageValue: number): string => {
    switch(stageValue) {
      case 33: return '1단계: 목록';
      case 50: return '2단계: 검증';
      case 66: return '3단계: 상세';
      case 100: return '완료';
      default: return '시작';
    }
  };

  // 단계 색상 계산
  const getStageColor = (stageValue: number): string => {
    switch(stageValue) {
      case 33: return 'bg-purple-500 dark:bg-purple-600'; // 1단계를 보라색으로 변경
      case 50: return 'bg-purple-500 dark:bg-purple-600';
      case 66: return 'bg-teal-500 dark:bg-teal-600';
      case 100: return 'bg-purple-500 dark:bg-purple-600'; // 3단계(완료)도 보라색으로 변경
      default: return 'bg-gray-300 dark:bg-gray-700';
    }
  };

  // 단계 마커 스타일 계산
  const getMarkerStyle = (stageValue: number): string => {
    const isActive = progress >= stageValue;
    const baseStyle = isActive 
      ? `${getStageColor(stageValue)} border-2 border-white dark:border-gray-800` 
      : 'bg-gray-300 dark:bg-gray-600';
    
    if (progress === stageValue) {
      return `${baseStyle} ring-4 ring-blue-300 dark:ring-blue-900 animate-pulse`;
    }
    
    return baseStyle;
  };

  if (isVertical) {
    // 세로형 인디케이터
    return (
      <div className="flex h-40 items-center mr-4">
        <div className="relative h-full">
          {/* 배경선 */}
          <div className="absolute left-1/2 transform -translate-x-1/2 h-full w-1 bg-gray-200 dark:bg-gray-700"></div>
          
          {/* 진행률 */}
          <div 
            className="absolute left-1/2 transform -translate-x-1/2 w-1 bg-blue-500 dark:bg-blue-600 transition-all duration-500" 
            style={{ height: `${progress}%` }}
          ></div>
          
          {/* 단계 마커들 */}
          <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
            <div className={`w-3 h-3 rounded-full ${getMarkerStyle(0)}`}></div>
            <div className="text-xs mt-1 ml-3 text-gray-600 dark:text-gray-400">시작</div>
          </div>
          
          <div className="absolute top-1/3 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
            <div className={`w-3 h-3 rounded-full ${getMarkerStyle(33)}`}></div>
            <div className="text-xs mt-1 ml-3 text-gray-600 dark:text-gray-400">1단계</div>
          </div>
          
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
            <div className={`w-3 h-3 rounded-full ${getMarkerStyle(50)}`}></div>
            <div className="text-xs mt-1 ml-3 text-gray-600 dark:text-gray-400">2단계</div>
          </div>
          
          <div className="absolute top-2/3 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
            <div className={`w-3 h-3 rounded-full ${getMarkerStyle(66)}`}></div>
            <div className="text-xs mt-1 ml-3 text-gray-600 dark:text-gray-400">3단계</div>
          </div>
          
          <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2">
            <div className={`w-3 h-3 rounded-full ${getMarkerStyle(100)}`}></div>
            <div className="text-xs mt-1 ml-3 text-gray-600 dark:text-gray-400">완료</div>
          </div>
        </div>
      </div>
    );
  }
  
  // 기본 가로형 인디케이터
  return (
    <div className="mt-3 mb-3">
      <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
        <span>시작</span>
        <span>1단계: 목록</span>
        <span>2단계: 검증</span>
        <span>3단계: 상세</span>
        <span>완료</span>
      </div>
      <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full relative">
        {/* 진행률 표시 */}
        <div 
          className={`absolute left-0 h-2 ${getStageColor(progress)} rounded-full transition-all duration-500 ease-out`}
          style={{ width: `${progress}%` }}
        ></div>
        
        {/* 단계 마커들 */}
        <div className="absolute left-0 top-0 w-3 h-3 transform -translate-x-1/2 -translate-y-1/3">
          <div className={`w-3 h-3 rounded-full ${getMarkerStyle(0)}`}></div>
        </div>
        
        <div className="absolute left-1/3 top-0 w-3 h-3 transform -translate-x-1/2 -translate-y-1/3">
          <div className={`w-3 h-3 rounded-full ${getMarkerStyle(33)}`}></div>
        </div>
        
        <div className="absolute left-1/2 top-0 w-3 h-3 transform -translate-x-1/2 -translate-y-1/3">
          <div className={`w-4 h-4 rounded-full ${getMarkerStyle(50)}`}></div>
        </div>
        
        <div className="absolute left-2/3 top-0 w-3 h-3 transform -translate-x-1/2 -translate-y-1/3">
          <div className={`w-3 h-3 rounded-full ${getMarkerStyle(66)}`}></div>
        </div>
        
        <div className="absolute right-0 top-0 w-3 h-3 transform translate-x-1/2 -translate-y-1/3">
          <div className={`w-3 h-3 rounded-full ${getMarkerStyle(100)}`}></div>
        </div>
      </div>
      
      {/* 현재 단계 레이블 */}
      <div className="text-center mt-4 text-sm font-medium text-blue-700 dark:text-blue-400">
        {getStageLabel(progress)}
      </div>
    </div>
  );
});

StageTransitionIndicator.displayName = 'StageTransitionIndicator';

export default StageTransitionIndicator;
