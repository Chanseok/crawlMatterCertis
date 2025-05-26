import { useEffect, useState } from 'react';
import { useCrawlingStore } from './useCrawlingStore';
import { useLogStore } from './useLogStore';

export function useApiInitialization() {
  const [isInitialized, setIsInitialized] = useState(false);
  const { loadConfig } = useCrawlingStore();
  const { addLog } = useLogStore();
  
  useEffect(() => {
    const init = async () => {
      try {
        // 앱 시작 시 설정 로드 보장
        await loadConfig();
        console.log('Configuration loaded successfully');
        
        // initializeApiSubscriptions는 각 Domain Store에서 자동으로 처리됨
        addLog('API 초기화 완료', 'info');
        setIsInitialized(true);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        addLog(`API 초기화 실패: ${errorMessage}`, 'error');
        setIsInitialized(false);
        
        console.error('Failed to load configuration:', error);
      }
    };
    
    init();
  }, []);

  return { isInitialized };
}
