import React, { useState, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { activeTasksStore, configStore } from '../stores';
import './TaskProgressIndicator.css';

interface TaskProgressIndicatorProps {
  pageNumber: number; // 페이지 번호를 prop으로 받음
  statusEmoji?: string;
}

/**
 * 남은 시간을 시각적으로 표시하는 컴포넌트
 * - 수집 중일 때는 로켓 이미지 대신 '수집중' 텍스트 표시
 * - 타임아웃 9초 전부터는 카운트다운 표시 (3D 플립 효과)
 * - 기본 상태는 로켓 이모지 표시
 */
export const TaskProgressIndicator: React.FC<TaskProgressIndicatorProps> = ({
  pageNumber,
  statusEmoji = '🚀'
}) => {
  // 활성 작업 목록과 설정 구독
  const allActiveTasks = useStore(activeTasksStore);
  const currentConfig = useStore(configStore);
  
  // 컴포넌트의 현재 시각적 상태
  const [displayState, setDisplayState] = useState<'default' | 'collecting' | 'countdown'>('default');
  
  // 카운트다운 숫자를 추적
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  
  // 이전 숫자를 저장하여 애니메이션 효과 적용
  const [prevSeconds, setPrevSeconds] = useState<number | null>(null);
  
  // 애니메이션 키를 사용하여 컴포넌트 강제 리렌더링
  const [animationKey, setAnimationKey] = useState<number>(0);

  // 페이지 번호에 해당하는 작업 찾기
  const taskKey = `page-${pageNumber}`;
  const currentTask = allActiveTasks[taskKey];

  // 작업 상태에 따라 디스플레이 상태 업데이트
  useEffect(() => {
    let timerId: NodeJS.Timeout | undefined;

    if (currentTask && (currentTask.status === 'running' || currentTask.status === 'attempting')) {
      // 페이지 타임아웃 설정 가져오기
      const pageTimeoutMs = currentConfig.pageTimeoutMs || 60000; // 기본값 60초
      const taskStartTime = currentTask.startTime || Date.now();

      const updateTimer = () => {
        const elapsedTime = Date.now() - taskStartTime;
        const timeLeftMs = pageTimeoutMs - elapsedTime;

        if (timeLeftMs <= 9000 && timeLeftMs > 0) {
          // 타임아웃 9초 전부터 카운트다운 모드
          setDisplayState('countdown');
          const currentSeconds = Math.ceil(timeLeftMs / 1000);
          
          // 초가 변경되었을 때만 업데이트
          if (currentSeconds !== secondsLeft) {
            setPrevSeconds(secondsLeft);
            setSecondsLeft(currentSeconds);
            // 애니메이션 키 업데이트로 강제 리렌더링
            setAnimationKey(prev => prev + 1);
          }
        } else if (timeLeftMs <= 0) {
          // 타임아웃 발생 또는 작업 완료/실패 시 기본 상태로 돌아감
          setDisplayState('default');
          setSecondsLeft(null);
          if (timerId) clearInterval(timerId);
        } else {
          // 수집 중이지만, 카운트다운 시작 전 (로켓 없이 '수집중' 표시)
          setDisplayState('collecting');
          setSecondsLeft(null);
        }
      };

      updateTimer(); // 즉시 상태 업데이트
      timerId = setInterval(updateTimer, 1000); // 1초마다 상태 업데이트
    } else {
      // 작업이 없거나 'running'/'attempting' 상태가 아니면 기본 상태
      setDisplayState('default');
      setSecondsLeft(null);
    }

    return () => {
      if (timerId) clearInterval(timerId);
    };
  }, [currentTask, currentConfig.pageTimeoutMs, secondsLeft, pageNumber]);

  return (
    <div key={animationKey} className="task-progress-container" data-task-id={taskKey}>
      {/* 수집 중 상태 (로켓 이미지 대신 '수집중' 텍스트 표시) */}
      {displayState === 'collecting' && (
        <div className="task-collecting">
          <span className="collecting-text">수집중</span>
        </div>
      )}
      
      {/* 카운트다운 표시 (9초 이하) */}
      {displayState === 'countdown' && secondsLeft !== null && (
        <div className="task-countdown">
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
      
      {/* 기본 상태 (로켓 이모지 표시) */}
      {displayState === 'default' && (
        <div className="task-indicator default">
          <span role="img" aria-label="rocket">{statusEmoji}</span>
        </div>
      )}
    </div>
  );
};

export default TaskProgressIndicator;
