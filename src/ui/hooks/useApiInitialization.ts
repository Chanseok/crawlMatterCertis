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
        console.log('API 초기화 시작: 설정 로드 중...');
        // 앱 시작 시 설정 로드 보장
        const config = await loadConfig();
        console.log('Configuration loaded successfully:', config);
        
        // 설정이 비어있거나 유효하지 않은 경우 처리
        if (!config || Object.keys(config).length === 0) {
          console.warn('Empty or invalid configuration loaded');
          addLog('설정이 비어 있습니다. 기본값을 사용합니다.', 'warning');
        }
        
        // initializeApiSubscriptions는 각 Domain Store에서 자동으로 처리됨
        addLog('API 초기화 완료', 'info');
        setIsInitialized(true);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        addLog(`API 초기화 실패: ${errorMessage}`, 'error');
        console.error('Failed to load configuration:', error);
        
        // 초기화에 실패하더라도 앱은 계속 실행
        setIsInitialized(true);
      }
    };
    
    init();
  }, []);

  return { isInitialized };
}
