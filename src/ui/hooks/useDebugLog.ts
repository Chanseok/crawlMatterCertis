import { useEffect } from 'react';
import { debugLog } from '../utils/logger';

/**
 * 컴포넌트 디버깅을 위한 커스텀 훅
 * 개발 환경에서만 로그를 출력하며, 의존성 배열이 변경될 때만 리렌더링
 * 
 * @param componentName 컴포넌트 이름
 * @param logData 출력할 로그 데이터 객체
 * @param dependencies 의존성 배열 - 이 값들이 변경될 때만 로그 출력
 */
export function useDebugLog(
  componentName: string,
  logData: Record<string, any>,
  dependencies: any[]
) {
  useEffect(() => {
    debugLog(`${componentName} 렌더링:`, logData);
  }, dependencies);
}
