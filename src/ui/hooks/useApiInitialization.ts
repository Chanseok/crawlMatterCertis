import { useEffect, useState } from 'react';
import { initializeApiSubscriptions, addLog } from '../stores';
import { useCrawlingStore } from './useCrawlingStore';

export function useApiInitialization() {
  const [isInitialized, setIsInitialized] = useState(false);
  const { loadConfig } = useCrawlingStore();
  
  useEffect(() => {
    const init = async () => {
      try {
        // 앱 시작 시 설정 로드 보장
        await loadConfig();
        console.log('Configuration loaded successfully');
        
        initializeApiSubscriptions();
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
