import { useEffect, useState } from 'react';
import { initializeApiSubscriptions, addLog } from '../stores';

export function useApiInitialization() {
  const [isInitialized, setIsInitialized] = useState(false);
  
  useEffect(() => {
    try {
      initializeApiSubscriptions();
      addLog('API 초기화 완료', 'info');
      setIsInitialized(true);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addLog(`API 초기화 실패: ${errorMessage}`, 'error');
      setIsInitialized(false);
    }
    
    return () => {
      // 필요한 정리 작업이 있으면 여기에 추가
    };
  }, []);

  return { isInitialized };
}
