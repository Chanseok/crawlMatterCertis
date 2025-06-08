import React, { useMemo, useRef, useEffect, useState, useCallback } from "react";
import { observer } from 'mobx-react-lite';
import { BaseChart } from "./BaseChart";
import type { ConcurrentCrawlingTask } from './types';
import { TaskProgressIndicator } from "./components/TaskProgressIndicator";
import { useTaskStore } from './hooks/useTaskStore';

export type ChartProps = {
    data: number[];
    maxDataPoints: number;
};

export const Chart: React.FC<ChartProps> = React.memo((props) => {
    const prepareData = useMemo(() => {
        const points = props.data.map((point) => ({ value: point * 100 }))
        return [
            ...points,
            ...Array.from({ length: props.maxDataPoints - points.length }).map(() => ({ value: undefined })),
        ];
    }, [props.data, props.maxDataPoints]);

    return <BaseChart data={prepareData} fill="grey" stroke="grey" />;
});

Chart.displayName = 'Chart';

// 동시 처리 작업 현황 시각화 컴포넌트
export const ConcurrentTasksVisualizer = React.memo(observer(() => {
  const { concurrentTasks, activeTasks } = useTaskStore();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [lastChangedTasks, setLastChangedTasks] = useState<(string | number)[]>([]);

  // Safety check to ensure tasks is an array - memoized for performance
  const tasksArray = useMemo(() => 
    Array.isArray(concurrentTasks) ? concurrentTasks : [], [concurrentTasks]);

  // Memoized status emoji and color mappings
  const statusEmojiMap = useMemo(() => ({
    pending: '⏳',
    running: '🚀',
    success: '✅',
    error: '❌',
    stopped: '⏹️',
    waiting: '⌛',
    attempting: '🔄',
    failed: '❌',
    incomplete: '⚠️'
  }), []);
  
  const statusColor = useMemo(() => ({
    pending: 'text-gray-400',
    running: 'text-blue-500 animate-bounce',
    success: 'text-green-500',
    error: 'text-red-500 animate-pulse',
    stopped: 'text-gray-500',
    waiting: 'text-yellow-500',
    attempting: 'text-orange-500 animate-spin',
    failed: 'text-red-600',
    incomplete: 'text-amber-500'
  }), []);

  // Memoized scroll function
  const scrollToChangedTasks = useCallback((changedTasks: (string | number)[]) => {
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
  }, []);

  // Debug logging for concurrent tasks
  useEffect(() => {
    console.log('[ConcurrentTasksVisualizer] concurrentTasks updated:', {
      concurrentTasksLength: concurrentTasks.length,
      activeTasksCount: Object.keys(activeTasks).length,
      tasksArray: tasksArray
    });
  }, [concurrentTasks, activeTasks, tasksArray]);

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
      scrollToChangedTasks(changedTasks);
    }
    
    // 현재 상태를 이전 상태로 저장
    prevTasksRef.current = [...tasksArray];
  }, [tasksArray, scrollToChangedTasks]);

  // Memoized task rendering function for performance
  const renderTask = useCallback((task: ConcurrentCrawlingTask) => {
    const isActive = task.status === 'running' || task.status === 'attempting';
    const taskChanged = lastChangedTasks.includes(task.pageNumber);
    const highlightClass = taskChanged ? 'ring-2 ring-yellow-400 dark:ring-yellow-600' : '';
    
    // 활성 상태일 때는 중앙 이모지 숨김 (TaskProgressIndicator에서 애니메이션이나 상태 표시)
    const showCentralEmoji = !isActive;

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
          pageNumber={task.pageNumber}
          statusEmoji={statusEmojiMap[task.status] || '🚀'} // 이모지 표시
        />
      </div>
    );
  }, [lastChangedTasks, statusColor, statusEmojiMap]);

  return (
    <div 
      ref={scrollContainerRef}
      className="flex flex-wrap gap-2 p-2 bg-gray-50 rounded shadow-inner overflow-x-auto h-32"
    >
      {tasksArray.length === 0 && <span className="text-gray-400">아직 동시 작업 없음</span>}
      {tasksArray.map(renderTask)}
    </div>
  );
}));