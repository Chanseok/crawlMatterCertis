import React, { useState, useEffect, useRef } from 'react';
import './TaskProgressIndicator.css';

interface TaskProgressIndicatorProps {
  taskId: string | number;
  remainingTime?: number;
  isActive: boolean;
  statusEmoji?: string;
}

/**
 * 남은 시간을 시각적으로 표시하는 컴포넌트
 * - 이모지가 오른쪽 상단으로 줄어들며 날아가는 애니메이션 (9초 초과)
 * - 최종 9초부터는 카운트다운 표시 (3D 플립 효과)
 */
export const TaskProgressIndicator: React.FC<TaskProgressIndicatorProps> = ({
  taskId,
  remainingTime = 0,
  isActive,
  statusEmoji = '🚀'
}) => {
  // 현재 애니메이션 모드 (flying 또는 countdown)
  const [mode, setMode] = useState<'flying' | 'countdown'>('flying');
  
  // 카운트다운 숫자를 추적
  const [secondsLeft, setSecondsLeft] = useState<number>(Math.ceil(remainingTime / 1000));
  
  // 이전 숫자를 저장하여 애니메이션 효과 적용
  const [prevSeconds, setPrevSeconds] = useState<number | null>(null);
  
  // 애니메이션 키를 사용하여 컴포넌트 강제 리렌더링
  const [animationKey, setAnimationKey] = useState<number>(0);
  
  // 모드 전환 여부를 확인하기 위한 플래그
  const modeChangedRef = useRef<boolean>(false);

  // remainingTime에 따라 모드 전환 및 초 업데이트
  useEffect(() => {
    if (!isActive) return;

    // 9초 이하로 남았을 때 countdown 모드로 전환
    const shouldBeCountdown = remainingTime <= 9000 && remainingTime > 0;
    
    // 현재 초 계산
    const currentSeconds = Math.ceil(remainingTime / 1000);
    
    if (shouldBeCountdown && mode !== 'countdown') {
      setMode('countdown');
      modeChangedRef.current = true;
    } else if (!shouldBeCountdown && mode !== 'flying') {
      setMode('flying');
      modeChangedRef.current = true;
    }
    
    // 초가 변경되었거나 모드가 변경되었을 때만 업데이트
    if (currentSeconds !== secondsLeft || modeChangedRef.current) {
      setPrevSeconds(secondsLeft);
      setSecondsLeft(currentSeconds);
      
      // 애니메이션 키 업데이트로 강제 리렌더링
      setAnimationKey(prev => prev + 1);
      modeChangedRef.current = false;
    }
  }, [remainingTime, isActive, mode, secondsLeft]);

  // 활성 상태가 아니면 렌더링하지 않음
  if (!isActive) return null;

  return (
    <div key={animationKey} className="task-progress-container">
      {/* 날아가는 이모지 애니메이션 (9초 초과) */}
      {mode === 'flying' && (
        <div className="task-progress-indicator" data-task-id={taskId}>
          <div className="flying-emoji">{statusEmoji}</div>
        </div>
      )}
      
      {/* 카운트다운 표시 (9초 이하) */}
      {mode === 'countdown' && (
        <div className="task-countdown" data-task-id={taskId}>
          <div className="countdown-number-container">
            {/* 이전 숫자 (뒤쪽에서 사라짐) */}
            {prevSeconds !== null && prevSeconds !== secondsLeft && (
              <div className="countdown-number countdown-old" data-value={prevSeconds}>
                {prevSeconds}
              </div>
            )}
            
            {/* 새 숫자 (앞쪽에서 나타남) */}
            <div 
              className="countdown-number countdown-new"
              data-value={secondsLeft}
            >
              {secondsLeft}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TaskProgressIndicator;
