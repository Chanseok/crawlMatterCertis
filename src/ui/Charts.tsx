import { useMemo, useRef, useEffect, useState } from "react";
import { BaseChart } from "./BaseChart";
import { useStore } from '@nanostores/react';
import { concurrentTasksStore, activeTasksStore } from './stores';
import type { ConcurrentCrawlingTask } from './types';
import { TaskProgressIndicator } from "./components/TaskProgressIndicator";

export type ChartProps = {
    data: number[];
    maxDataPoints: number;
};

export function Chart(props: ChartProps) {
    const prepareData = useMemo(() => {
        const points = props.data.map((point) => ({ value: point * 100 }))
        return [
            ...points,
            ...Array.from({ length: props.maxDataPoints - points.length }).map(() => ({ value: undefined })),
        ];
    }, [props.data, props.maxDataPoints]);

    return <BaseChart data={prepareData} fill="grey" stroke="grey" />;
}

// 동시 처리 작업 현황 시각화 컴포넌트
export function ConcurrentTasksVisualizer() {
  const tasks = useStore(concurrentTasksStore);
  const activeTasksDetail = useStore(activeTasksStore);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [lastChangedTasks, setLastChangedTasks] = useState<(string | number)[]>([]);

  // Safety check to ensure tasks is an array
  const tasksArray = Array.isArray(tasks) ? tasks : [];

  // 작업 상태 변경 감지를 위한 이전 상태 추적
  const prevTasksRef = useRef<ConcurrentCrawlingTask[]>([]);

  useEffect(() => {
    // 이전 상태와 현재 상태 비교하여 변경된 작업 감지
    const changedTasks: (string | number)[] = [];
    
    tasksArray.forEach(task => {
      const prevTask = prevTasksRef.current.find(t => t.pageNumber === task.pageNumber);
      if (!prevTask || prevTask.status !== task.status) {
        changedTasks.push(task.pageNumber);
      }
    });
    
    if (changedTasks.length > 0) {
      setLastChangedTasks(changedTasks);
    }
    
    // 현재 상태를 이전 상태로 저장
    prevTasksRef.current = [...tasksArray];
    
    // 변경된 작업으로 스크롤
    if (scrollContainerRef.current && changedTasks.length > 0) {
      const activeElements = changedTasks.map(taskId => 
        scrollContainerRef.current?.querySelector(`[data-task-id="${taskId}"]`)
      ).filter(Boolean);
      
      if (activeElements.length > 0) {
        activeElements[0]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      } else {
        // 이전 방식의 스크롤 유지 (애니메이션 요소로 스크롤)
        const currentTaskElement = scrollContainerRef.current.querySelector(
          '.animate-bounce, .animate-pulse'
        );
        if (currentTaskElement) {
          currentTaskElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
      }
    }
  }, [tasksArray]);

  // 이모지/컬러 매핑
  const statusEmojiMap: Record<string, string> = {
    pending: '⏳',
    running: '🚀',
    success: '✅',
    error: '❌',
    stopped: '⏹️',
    waiting: '⌛',
    attempting: '🔄',
    failed: '❌',
    incomplete: '⚠️'
  };
  
  const statusColor: Record<string, string> = {
    pending: 'text-gray-400',
    running: 'text-blue-500 animate-bounce',
    success: 'text-green-500',
    error: 'text-red-500 animate-shake',
    stopped: 'text-gray-500',
    waiting: 'text-gray-400',
    attempting: 'text-blue-500 animate-pulse',
    failed: 'text-red-500',
    incomplete: 'text-amber-500'
  };

  return (
    <div 
      ref={scrollContainerRef}
      className="flex flex-wrap gap-2 p-2 bg-gray-50 rounded shadow-inner overflow-x-auto h-32"
    >
      {tasksArray.length === 0 && <span className="text-gray-400">아직 동시 작업 없음</span>}
      {tasksArray.map((task: ConcurrentCrawlingTask) => {
        const taskDetail = activeTasksDetail[task.pageNumber];
        const startTime = taskDetail?.startTime || 0;
        const isActive = task.status === 'running' || task.status === 'attempting';
        
        const DEFAULT_TASK_DURATION = 30000; // 30초
        const elapsedTime = startTime ? Date.now() - startTime : 0;
        const remainingTime = Math.max(0, DEFAULT_TASK_DURATION - elapsedTime);
        
        const taskChanged = lastChangedTasks.includes(task.pageNumber);
        const highlightClass = taskChanged ? 'ring-2 ring-yellow-400 dark:ring-yellow-600' : '';
        
        // 9초 이하이고 활성 상태일 때는 중앙 이모지 숨김
        // 명확하게 하기 위해 아래 조건을 task.status 값으로 명시적 검사
        const showCentralEmoji = !(isActive && remainingTime <= 9000 && 
          (task.status === 'running' || task.status === 'attempting'));

        return (
          <div
            key={task.pageNumber}
            data-task-id={task.pageNumber}
            className={`relative flex flex-col items-center w-14 h-14 justify-center border rounded ${statusColor[task.status]} ${highlightClass}`}
            title={`페이지 ${task.pageNumber} - ${task.status}`}
          >
            {/* isActive가 true고 상태가 running 또는 attempting일 때만 중앙 이모지 숨김 */}
            {showCentralEmoji && (
              <span className="text-2xl">{statusEmojiMap[task.status] || '❓'}</span>
            )}
            <span className="text-xs mt-1">p.{task.pageNumber}</span>
            
            <TaskProgressIndicator 
              taskId={task.pageNumber}
              remainingTime={remainingTime}
              isActive={isActive}
              statusEmoji={statusEmojiMap[task.status] || '🚀'} // flyUpAndShrink 애니메이션용 이모지
            />
          </div>
        );
      })}
    </div>
  );
}