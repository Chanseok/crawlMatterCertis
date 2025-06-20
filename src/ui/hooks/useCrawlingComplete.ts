import { useState, useCallback, useMemo } from 'react';
import { useLogStore } from './useLogStore';
import { useMultipleEventSubscriptions, EventSubscription } from './useEventSubscription';
import type { MatterProduct } from '../../../types';
import { CrawlingCompleteData, DbSaveCompleteData, DbSaveSkippedData, FinalCrawlingResultData } from '../types/crawling';
import { useDebugLog } from './useDebugLog';

/**
 * 크롤링 완료 및 DB 저장 관련 이벤트를 처리하는 커스텀 훅
 * 이벤트 리스너를 등록하고 상태를 관리하여 UI에서 사용할 수 있게 함
 */
export function useCrawlingComplete() {
  const { addLog } = useLogStore();
  
  // 상태 관리
  const [crawlingResults, setCrawlingResults] = useState<MatterProduct[]>([]);
  const [autoSavedToDb, setAutoSavedToDb] = useState<boolean | undefined>(undefined);
  const [showCompleteView, setShowCompleteView] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSavingToDb, setIsSavingToDb] = useState<boolean>(false);
  
  // 디버그 로깅
  useDebugLog('useCrawlingComplete', {
    resultsCount: crawlingResults.length,
    autoSavedToDb,
    showCompleteView,
    error,
    isLoading,
    isSavingToDb
  }, [crawlingResults, autoSavedToDb, showCompleteView, error, isLoading, isSavingToDb]);
  
  // 모든 상태를 리셋하는 유틸리티 함수
  const resetAllStates = useCallback(() => {
    setCrawlingResults([]);
    setAutoSavedToDb(undefined);
    setShowCompleteView(false);
    setError(null);
    setIsLoading(false);
    setIsSavingToDb(false);
  }, []);

  // 이벤트 콜백 핸들러들 (메모이제이션으로 불필요한 리렌더링 방지)
  const handleCrawlingComplete = useCallback((data: CrawlingCompleteData) => {
    setIsLoading(false);
    if (data.success && Array.isArray(data.products) && data.products.length > 0) {
      setCrawlingResults(data.products);
      setAutoSavedToDb(data.autoSavedToDb);
      setShowCompleteView(true);
      setError(null);
      
      // 자동 저장 진행 중인 경우 상태 표시
      if (data.autoSavedToDb === undefined) {
        setIsSavingToDb(true);
      }
      
      addLog(`크롤링 완료: ${data.products.length}개 항목 발견`, 'info');
    } else {
      setError('크롤링 결과가 비어 있거나 잘못되었습니다.');
      addLog('크롤링 완료 처리 중 오류: 유효한 결과가 없음', 'warning');
    }
  }, []);

  const handleDbSaveComplete = useCallback((data: DbSaveCompleteData) => {
    setIsSavingToDb(false);
    if (data.success) {
      setAutoSavedToDb(true);
      setError(null);
      
      // 상세 저장 결과가 있는 경우 더 자세한 로그 표시
      if (data.added !== undefined && data.updated !== undefined) {
        addLog(`DB 저장 완료: ${data.added}개 추가됨, ${data.updated}개 업데이트됨`, 'success');
      } else {
        addLog(`DB 저장 완료${data.count ? `: ${data.count}개 항목` : ''}`, 'success');
      }
    } else {
      setError('DB 저장 실패');
      addLog(`DB 저장 실패${data.message ? `: ${data.message}` : ''}`, 'warning');
    }
  }, []);

  const handleDbSaveSkipped = useCallback((data: DbSaveSkippedData) => {
    setIsSavingToDb(false);
    setAutoSavedToDb(false);
    addLog(`DB 저장 건너뜀${data.reason ? ': ' + data.reason : ''}`, 'info');
  }, []);

  // 최종 크롤링 결과 처리 핸들러
  const handleFinalCrawlingResult = useCallback((data: FinalCrawlingResultData) => {
    console.log('Final crawling result received:', data);
    addLog(`최종 수집 결과: 총 ${data.collected}개 제품 중 ${data.newItems}개 신규, ${data.updatedItems}개 업데이트됨`, 'info');
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
    { eventName: 'dbSaveSkipped', callback: handleDbSaveSkipped },
    { eventName: 'finalCrawlingResult', callback: handleFinalCrawlingResult }
  ], [handleCrawlingComplete, handleDbSaveComplete, handleDbSaveSkipped, handleFinalCrawlingResult]);

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
    isSavingToDb,
    setLoading,
    setShowCompleteView,
    resetCrawlingResults,
    resetAllStates,
    hideCompleteView
  };
}
