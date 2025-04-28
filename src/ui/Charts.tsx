import { useMemo } from "react";
import { BaseChart } from "./BaseChart";
import { useStore } from '@nanostores/react';
import { concurrentTasksStore } from './stores';
import type { ConcurrentCrawlingTask } from './types';

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

  // 이모지/컬러 매핑
  const statusEmoji: Record<string, string> = {
    pending: '⏳',
    running: '🚀',
    success: '✅',
    error: '❌',
  };
  const statusColor: Record<string, string> = {
    pending: 'text-gray-400',
    running: 'text-blue-500 animate-bounce',
    success: 'text-green-500',
    error: 'text-red-500 animate-shake',
  };

  return (
    <div className="flex flex-wrap gap-2 p-2 bg-gray-50 rounded shadow-inner">
      {tasks.length === 0 && <span className="text-gray-400">아직 동시 작업 없음</span>}
      {tasks.map((task: ConcurrentCrawlingTask) => (
        <div
          key={task.pageNumber}
          className={`flex flex-col items-center w-14 h-14 justify-center border rounded ${statusColor[task.status]}`}
          title={`페이지 ${task.pageNumber} - ${task.status}`}
        >
          <span className="text-2xl">{statusEmoji[task.status]}</span>
          <span className="text-xs mt-1">p.{task.pageNumber}</span>
        </div>
      ))}
    </div>
  );
}