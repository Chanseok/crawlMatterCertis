import React, { useState, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { useCrawlingStore } from '../hooks/useCrawlingStore';
import { useTaskStore } from '../hooks/useTaskStore';
import { Logger } from '../../shared/utils/Logger';
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
export const TaskProgressIndicator: React.FC<TaskProgressIndicatorProps> = React.memo(observer(({
  pageNumber,
  statusEmoji = '🚀'
}) => {
  const logger = new Logger('TaskProgressIndicator');
  // 활성 작업 목록과 설정 구독
  const { activeTasks, concurrentTasks } = useTaskStore();
  const { config: currentConfig } = useCrawlingStore();
  
  // 컴포넌트의 현재 시각적 상태
  const [displayState, setDisplayState] = useState<'default' | 'collecting' | 'countdown'>('default');
  
  // 카운트다운 숫자를 추적
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  
  // 이전 숫자를 저장하여 애니메이션 효과 적용
  const [prevSeconds, setPrevSeconds] = useState<number | null>(null);
  
  // 애니메이션 키를 사용하여 컴포넌트 강제 리렌더링
  const [animationKey, setAnimationKey] = useState<number>(0);
  
  // 로켓 애니메이션 여부 - 수집 중에도 로켓 애니메이션 표시
  const [showRocketAnimation, setShowRocketAnimation] = useState<boolean>(false);

  // 페이지 번호에 해당하는 작업 찾기
  // concurrentTasks에서 해당 페이지 번호의 작업을 찾기
  const concurrentTask = concurrentTasks.find(task => task.pageNumber === pageNumber);
  
  // activeTasks에서 페이지 기반 작업 찾기 (page-XX 형태의 키 사용)
  const pageTaskKey = `page-${pageNumber}`;
  const activeTask = activeTasks[pageTaskKey];
  
  // 타이밍 정보 추출 함수
  const extractTimingInfo = (task: any): { startTime: number | null } => {
    // 1. 직접 startTime이 있는 경우
    if (task?.startTime) {
      return { startTime: typeof task.startTime === 'string' ? new Date(task.startTime).getTime() : task.startTime };
    }
    
    // 2. message 필드에서 JSON 파싱하여 startTime 추출
    if (task?.message) {
      try {
        const messageData = JSON.parse(task.message);
        if (messageData.startTime) {
          return { startTime: new Date(messageData.startTime).getTime() };
        }
      } catch (e) {
        // JSON 파싱 실패는 무시
      }
    }
    
    return { startTime: null };
  };
  
  // 현재 작업 객체 생성 (concurrentTask와 activeTask 정보 결합)
  const currentTask = concurrentTask ? (() => {
    const timingInfo = extractTimingInfo(activeTask);
    
    return {
      status: concurrentTask.status,
      startTime: timingInfo.startTime || Date.now(), // 타이밍 정보가 없으면 현재 시간 사용
      pageNumber: concurrentTask.pageNumber,
      error: concurrentTask.error
    };
  })() : null;
  
  const taskKey = `page-${pageNumber}`;

  // 작업 상태에 따라 디스플레이 상태 업데이트
  useEffect(() => {
    let timerId: ReturnType<typeof setTimeout> | undefined;

    if (currentTask && (currentTask.status === 'running' || currentTask.status === 'attempting')) {
      // 수집 중일 때는 로켓 애니메이션 표시
      setShowRocketAnimation(true);
      
      // 페이지 타임아웃 설정 가져오기
      const pageTimeoutMs = currentConfig.pageTimeoutMs || 60000; // 기본값 60초
      const taskStartTime = currentTask.startTime || Date.now();

      // 상세 타임아웃 디버깅 로그
      logger.debug(`Page ${pageNumber} status and timing`, {
        status: currentTask.status,
        startTime: new Date(taskStartTime).toISOString(),
        timeout: pageTimeoutMs
      });
      logger.debug(`Page ${pageNumber} timeout configuration`, {
        configTimeout: currentConfig.pageTimeoutMs,
        fallback: pageTimeoutMs
      });
      
      // 타임아웃 설정 불일치 경고
      if (currentConfig.pageTimeoutMs && currentConfig.pageTimeoutMs !== 60000) {
        logger.warn(`Frontend timeout may differ from backend timeout`, {
          pageNumber,
          frontendTimeout: pageTimeoutMs,
          message: 'Check ConfigManager settings'
        });
      }

      const updateTimer = () => {
        const elapsedTime = Date.now() - taskStartTime;
        const timeLeftMs = pageTimeoutMs - elapsedTime;

        logger.debug(`Page ${pageNumber} timer update`, {
          elapsed: elapsedTime,
          timeLeft: timeLeftMs,
          progress: ((elapsedTime/pageTimeoutMs)*100).toFixed(1) + '%'
        });

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
            logger.debug(`Page ${pageNumber} countdown`, { seconds: currentSeconds });
          }
        } else if (timeLeftMs <= 0) {
          // 타임아웃 발생 또는 작업 완료/실패 시 기본 상태로 돌아감
          setDisplayState('default');
          setSecondsLeft(null);
          setShowRocketAnimation(false);
          logger.info(`Page ${pageNumber} timeout or completion`, {
            elapsed: elapsedTime,
            configuredTimeout: pageTimeoutMs
          });
          if (timerId) clearInterval(timerId);
        } else {
          // 수집 중이지만, 카운트다운 시작 전
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
      setShowRocketAnimation(false);
      logger.debug(`Page ${pageNumber} reset to default state`);
    }

    return () => {
      if (timerId) clearInterval(timerId);
    };
  }, [currentTask, currentConfig.pageTimeoutMs, secondsLeft, pageNumber]);

  return (
    <div key={animationKey} className="task-progress-container" data-task-id={taskKey}>
      {/* 로켓 날아가는 애니메이션 - 수집 중일 때도 표시 */}
      {showRocketAnimation && (
        <div className="task-progress-indicator">
          <div className="flying-emoji">{statusEmoji}</div>
        </div>
      )}
      
      {/* 수집 중 상태 텍스트 표시 */}
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
      {displayState === 'default' && !showRocketAnimation && (
        <div className="task-indicator default">
          <span role="img" aria-label="rocket">{statusEmoji}</span>
        </div>
      )}
    </div>
  );
}));

TaskProgressIndicator.displayName = 'TaskProgressIndicator';

export default TaskProgressIndicator;
