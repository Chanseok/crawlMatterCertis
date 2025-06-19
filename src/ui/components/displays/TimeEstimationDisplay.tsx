/**
 * TimeEstimationDisplay.tsx
 * UI Layer - Clean Architecture 기반 시간 예측 표시 컴포넌트
 * 
 * Single Responsibility: 시간 예측 정보의 시각적 표현
 * 상태 관리나 비즈니스 로직 없이 순수한 UI 렌더링만 담당
 */

import React, { useMemo } from 'react';

// === Value Objects (UI Domain) ===
interface TimeDisplayValue {
  readonly hours: number;
  readonly minutes: number;
  readonly seconds: number;
  readonly totalSeconds: number;
  
  toString(): string;
  toShortString(): string;
}

class UITimeValue implements TimeDisplayValue {
  constructor(public readonly totalSeconds: number) {}

  get hours(): number {
    return Math.floor(this.totalSeconds / 3600);
  }

  get minutes(): number {
    return Math.floor((this.totalSeconds % 3600) / 60);
  }

  get seconds(): number {
    return this.totalSeconds % 60;
  }

  toString(): string {
    return `${this.hours.toString().padStart(2, '0')}:${this.minutes.toString().padStart(2, '0')}:${this.seconds.toString().padStart(2, '0')}`;
  }

  toShortString(): string {
    if (this.hours > 0) return `${this.hours}시간 ${this.minutes}분`;
    if (this.minutes > 0) return `${this.minutes}분 ${this.seconds}초`;
    return `${this.seconds}초`;
  }
}

// === Props Interface ===
interface TimeEstimationDisplayProps {
  elapsedTimeSeconds: number;
  remainingTimeSeconds: number;
  confidence: 'low' | 'medium' | 'high';
  isRunning: boolean;
  showConfidenceIndicator?: boolean;
  compact?: boolean;
  className?: string;
}

// === Pure UI Component ===
export const TimeEstimationDisplay: React.FC<TimeEstimationDisplayProps> = React.memo(({
  elapsedTimeSeconds,
  remainingTimeSeconds,
  confidence,
  isRunning,
  showConfidenceIndicator = true,
  compact = false,
  className = ''
}) => {
  // 실시간 카운트다운을 위한 로컬 상태
  const [localRemainingSeconds, setLocalRemainingSeconds] = React.useState(remainingTimeSeconds);
  const [lastUpdateTime, setLastUpdateTime] = React.useState(Date.now());
  
  // 백엔드에서 새로운 시간 예측이 올 때마다 로컬 상태 업데이트
  React.useEffect(() => {
    if (remainingTimeSeconds !== localRemainingSeconds) {
      setLocalRemainingSeconds(remainingTimeSeconds);
      setLastUpdateTime(Date.now());
    }
  }, [remainingTimeSeconds]);
  
  // 1초마다 카운트다운 (크롤링 진행 중일 때만)
  React.useEffect(() => {
    if (!isRunning || localRemainingSeconds <= 0) return;
    
    const interval = setInterval(() => {
      const now = Date.now();
      const elapsedSinceUpdate = Math.floor((now - lastUpdateTime) / 1000);
      const newRemainingTime = Math.max(0, remainingTimeSeconds - elapsedSinceUpdate);
      
      setLocalRemainingSeconds(newRemainingTime);
    }, 1000);
    
    return () => clearInterval(interval);
  }, [isRunning, remainingTimeSeconds, lastUpdateTime]);

  // Value Objects 생성 (메모이제이션) - 로컬 시간 사용
  const elapsedTime = useMemo(() => new UITimeValue(elapsedTimeSeconds), [elapsedTimeSeconds]);
  const remainingTime = useMemo(() => new UITimeValue(localRemainingSeconds), [localRemainingSeconds]);

  // 신뢰도 기반 UI 스타일
  const confidenceConfig = useMemo(() => {
    switch (confidence) {
      case 'high':
        return { color: 'text-green-600 dark:text-green-400', icon: '●', message: '정확도 높음' };
      case 'medium':
        return { color: 'text-yellow-600 dark:text-yellow-400', icon: '◐', message: '조정 중' };
      case 'low':
        return { color: 'text-gray-500 dark:text-gray-400', icon: '○', message: '계산 중' };
      default:
        return { color: 'text-gray-400', icon: '○', message: '' };
    }
  }, [confidence]);

  // 컴팩트 모드
  if (compact) {
    return (
      <div className={`flex items-center gap-4 ${className}`}>
        <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {elapsedTime.toString()} / {remainingTime.toShortString()}
        </div>
        {showConfidenceIndicator && (
          <span className={`text-xs ${confidenceConfig.color}`}>
            {confidenceConfig.icon}
          </span>
        )}
      </div>
    );
  }

  // 전체 모드
  return (
    <div className={`bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-lg p-4 ${className}`}>
      {/* 메인 시간 표시 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex-1">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">소요시간</div>
          <div className="text-xl font-mono font-bold text-gray-800 dark:text-gray-200">
            {elapsedTime.toString()}
          </div>
        </div>
        
        <div className="w-px h-12 bg-gray-200 dark:bg-gray-600 mx-4" />
        
        <div className="flex-1">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">예상 남은 시간</div>
          <div className={`text-xl font-mono font-bold transition-colors duration-300 ${
            isRunning ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400'
          }`}>
            {localRemainingSeconds > 0 ? remainingTime.toString() : '계산 중'}
          </div>
        </div>
      </div>

      {/* 신뢰도 표시 */}
      {showConfidenceIndicator && localRemainingSeconds > 0 && (
        <div className="flex items-center justify-center">
          <div className={`flex items-center gap-2 text-xs px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-700 ${confidenceConfig.color}`}>
            <span>{confidenceConfig.icon}</span>
            <span>{confidenceConfig.message}</span>
          </div>
        </div>
      )}

      {/* 진행률 기반 예상 완료 시간 */}
      {isRunning && localRemainingSeconds > 0 && (
        <div className="mt-3 text-center">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            예상 완료: {new Date(Date.now() + localRemainingSeconds * 1000).toLocaleTimeString()}
          </div>
        </div>
      )}
    </div>
  );
});

TimeEstimationDisplay.displayName = 'TimeEstimationDisplay';
