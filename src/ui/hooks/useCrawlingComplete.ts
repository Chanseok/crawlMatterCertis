import { useState, useCallback, useMemo } from 'react';
import { addLog } from '../stores';
import { useMultipleEventSubscriptions, EventSubscription } from './useEventSubscription';
import type { MatterProduct } from '../../../types';
import { CrawlingCompleteData, DbSaveCompleteData, DbSaveSkippedData } from '../types/crawling';

export function useCrawlingComplete() {
  // 상태 관리
  const [crawlingResults, setCrawlingResults] = useState<MatterProduct[]>([]);
  const [autoSavedToDb, setAutoSavedToDb] = useState<boolean | undefined>(undefined);
  const [showCompleteView, setShowCompleteView] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // 이벤트 콜백 핸들러들 (메모이제이션으로 불필요한 리렌더링 방지)
  const handleCrawlingComplete = useCallback((data: CrawlingCompleteData) => {
    setIsLoading(false);
    if (data.success && Array.isArray(data.products) && data.products.length > 0) {
      setCrawlingResults(data.products);
      setAutoSavedToDb(data.autoSavedToDb);
      setShowCompleteView(true);
      setError(null);
      addLog(`크롤링 완료: ${data.products.length}개 항목 발견`, 'info');
    } else {
      setError('크롤링 결과가 비어 있거나 잘못되었습니다.');
      addLog('크롤링 완료 처리 중 오류: 유효한 결과가 없음', 'warning');
    }
  }, []);

  const handleDbSaveComplete = useCallback((data: DbSaveCompleteData) => {
    if (data.success) {
      setAutoSavedToDb(true);
      setError(null);
      addLog(`DB 저장 완료${data.count ? `: ${data.count}개 항목` : ''}`, 'success');
    } else {
      setError('DB 저장 실패');
      addLog(`DB 저장 실패${data.message ? `: ${data.message}` : ''}`, 'warning');
    }
  }, []);

  const handleDbSaveSkipped = useCallback((data: DbSaveSkippedData) => {
    setAutoSavedToDb(false);
    addLog(`DB 저장 건너뜀${data.reason ? ': ' + data.reason : ''}`, 'info');
  }, []);

  // 에러 핸들러
  const handleSubscriptionError = useCallback((err: unknown) => {
    const errorMessage = err instanceof Error ? err.message : String(err);
    setError(`이벤트 구독 중 오류: ${errorMessage}`);
    setIsLoading(false);
  }, []);

  // 이벤트 구독 목록 (메모이제이션으로 불필요한 재구독 방지)
  const subscriptions = useMemo<EventSubscription[]>(() => [
    { eventName: 'crawlingComplete', callback: handleCrawlingComplete },
    { eventName: 'dbSaveComplete', callback: handleDbSaveComplete },
    { eventName: 'dbSaveSkipped', callback: handleDbSaveSkipped }
  ], [handleCrawlingComplete, handleDbSaveComplete, handleDbSaveSkipped]);

  // 여러 이벤트 구독을 위한 훅 사용
  useMultipleEventSubscriptions(subscriptions, handleSubscriptionError);

  // 유틸리티 함수들
  const resetCrawlingResults = useCallback(() => {
    setCrawlingResults([]);
    setShowCompleteView(false);
    setError(null);
  }, []);

  const hideCompleteView = useCallback(() => {
    setShowCompleteView(false);
  }, []);

  // 크롤링 시작 시 로딩 상태 설정 함수
  const setLoading = useCallback((loading: boolean) => {
    setIsLoading(loading);
    if (loading) {
      // 크롤링 시작 시 에러 초기화
      setError(null);
    }
  }, []);

  return { 
    crawlingResults, 
    autoSavedToDb, 
    showCompleteView, 
    error,
    isLoading,
    setLoading,
    setShowCompleteView,
    resetCrawlingResults,
    hideCompleteView
  };
}
