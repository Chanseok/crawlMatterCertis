import { useState, useEffect, useCallback } from 'react';
import { getPlatformApi } from '../platform/api';
import { addLog } from '../stores';
import { CrawledProduct, CrawlingCompleteData, DbSaveCompleteData, DbSaveSkippedData } from '../types/crawling';

export function useCrawlingComplete() {
  const [crawlingResults, setCrawlingResults] = useState<CrawledProduct[]>([]);
  const [autoSavedToDb, setAutoSavedToDb] = useState<boolean | undefined>(undefined);
  const [showCompleteView, setShowCompleteView] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 크롤링 완료 이벤트 구독
    const api = getPlatformApi();
    let subscriptions: (() => void)[] = [];
    
    try {
      // 크롤링 완료 이벤트 구독
      const unsubscribeCrawlingComplete = api.subscribeToEvent('crawlingComplete', 
        (data: CrawlingCompleteData) => {
          if (data.success && Array.isArray(data.products) && data.products.length > 0) {
            setCrawlingResults(data.products);
            setAutoSavedToDb(data.autoSavedToDb);
            setShowCompleteView(true);
            setError(null);
          } else {
            setError('크롤링 결과가 비어 있거나 잘못되었습니다.');
            addLog('크롤링 완료 처리 중 오류: 유효한 결과가 없음', 'warning');
          }
        }
      );
      subscriptions.push(unsubscribeCrawlingComplete);
      
      // DB 저장 이벤트 구독
      const unsubscribeDbSave = api.subscribeToEvent('dbSaveComplete', 
        (data: DbSaveCompleteData) => {
          if (data.success) {
            setAutoSavedToDb(true);
            setError(null);
          } else {
            setError('DB 저장 실패');
            addLog('DB 저장 실패', 'warning');
          }
        }
      );
      subscriptions.push(unsubscribeDbSave);
      
      const unsubscribeDbSkip = api.subscribeToEvent('dbSaveSkipped', 
        (data: DbSaveSkippedData) => {
          setAutoSavedToDb(false);
          addLog(`DB 저장 건너뜀${data.reason ? ': ' + data.reason : ''}`, 'info');
        }
      );
      subscriptions.push(unsubscribeDbSkip);
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`이벤트 구독 중 오류: ${errorMessage}`);
      addLog(`이벤트 구독 중 오류: ${errorMessage}`, 'error');
    }
    
    return () => {
      // 모든 구독 해제
      subscriptions.forEach(unsubscribe => unsubscribe());
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
    error,
    setShowCompleteView,
    resetCrawlingResults,
    hideCompleteView
  };
}
