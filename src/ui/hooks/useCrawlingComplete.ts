import { useState, useEffect, useCallback } from 'react';
import { getPlatformApi } from '../platform/api';
import { addLog, initializeApiSubscriptions } from '../stores';

export function useCrawlingComplete() {
  const [crawlingResults, setCrawlingResults] = useState<any[]>([]);
  const [autoSavedToDb, setAutoSavedToDb] = useState<boolean | undefined>(undefined);
  const [showCompleteView, setShowCompleteView] = useState<boolean>(false);

  useEffect(() => {
    // API 초기화
    initializeApiSubscriptions();
    addLog('애플리케이션이 시작되었습니다.', 'info');
    
    // 크롤링 완료 이벤트 구독
    const api = getPlatformApi();
    
    const unsubscribe = api.subscribeToEvent('crawlingComplete', (data: any) => {
      if (data.success && Array.isArray(data.products) && data.products.length > 0) {
        setCrawlingResults(data.products);
        setAutoSavedToDb(data.autoSavedToDb);
        setShowCompleteView(true);
      }
    });
    
    // DB 저장 이벤트 구독
    const unsubscribeDbSave = api.subscribeToEvent('dbSaveComplete', (data) => {
      if (data.success) setAutoSavedToDb(true);
    });
    
    const unsubscribeDbSkip = api.subscribeToEvent('dbSaveSkipped', () => {
      setAutoSavedToDb(false);
    });
    
    return () => {
      unsubscribe();
      unsubscribeDbSave();
      unsubscribeDbSkip();
    };
  }, []);

  // 결과 전체 또는 일부 초기화 함수 추가
  const resetCrawlingResults = useCallback(() => {
    setCrawlingResults([]);
    setShowCompleteView(false);
  }, []);

  const hideCompleteView = useCallback(() => {
    setShowCompleteView(false);
  }, []);

  return { 
    crawlingResults, 
    autoSavedToDb, 
    showCompleteView, 
    setShowCompleteView,
    resetCrawlingResults,
    hideCompleteView
  };
}
