import { useState, useCallback } from 'react';
import { useLogStore } from './useLogStore';
import { useCrawlingStore } from './useCrawlingStore';
import { useConfigurationViewModel } from '../providers/ViewModelProvider';

type TabId = 'status' | 'settings' | 'localDB' | 'analysis';

export function useTabs(defaultTab: TabId = 'status') {
  const [activeTab, setActiveTab] = useState<TabId>(defaultTab);
  const { addLog } = useLogStore();
  const { loadConfig, checkStatus } = useCrawlingStore();
  const configurationViewModel = useConfigurationViewModel();

  const handleTabChange = useCallback((tabId: string) => {
    if (isValidTab(tabId)) {
      // 이전 탭이 설정 탭이었고, 새 탭이 상태 & 제어 탭인 경우
      if (activeTab === 'settings' && tabId === 'status') {
        // 설정 정보 리로드 (최신 설정을 확실히 반영)
        loadConfig().then(() => {
          addLog('탭 전환: 최신 설정 정보를 로드했습니다.', 'info');
        });
      }
      
      // 이전 탭이 로컬DB 탭이었고, 새 탭이 상태 & 제어 탭인 경우
      if (activeTab === 'localDB' && tabId === 'status') {
        console.log('[useTabs] LocalDB → Status tab change detected');
        
        // Check if LocalDB data has been changed
        const hasLocalDBChanged = sessionStorage.getItem('localDB-data-changed') === 'true';
        console.log('[useTabs] LocalDB data changed flag:', hasLocalDBChanged);
        
        if (hasLocalDBChanged) {
          // Clear the flag
          sessionStorage.removeItem('localDB-data-changed');
          
          console.log('[useTabs] Starting refresh due to LocalDB changes...');
          
          // Multiple attempts to ensure status is properly updated
          const refreshWithRetry = async () => {
            try {
              // First, load config and check status
              await Promise.all([
                loadConfig(),
                checkStatus()
              ]);
              
              console.log('[useTabs] Config and status refresh completed');
              
              // Wait a bit more and try page range recalculation multiple times
              let attempts = 0;
              const maxAttempts = 3;                const attemptRecalculation = () => {
                attempts++;
                console.log(`[useTabs] Attempting page range recalculation (attempt ${attempts}/${maxAttempts})...`);
                
                configurationViewModel.recalculatePageRangeManually();
                
                if (attempts < maxAttempts) {
                  // Try again after a delay
                  setTimeout(attemptRecalculation, 1000);
                }
              };
              
              // Start the first attempt
              setTimeout(attemptRecalculation, 500);
              
              console.log('[useTabs] Refresh completed successfully');
              addLog('탭 전환: 로컬DB 변경사항을 반영하여 크롤링 범위를 재계산했습니다.', 'info');
              
            } catch (error) {
              console.error('[useTabs] Error refreshing status after LocalDB tab change:', error);
              addLog('탭 전환: 상태 갱신 중 오류가 발생했습니다.', 'error');
            }
          };
          
          refreshWithRetry();
        } else {
          // No changes detected, just log the tab change
          console.log('[useTabs] No LocalDB changes detected, skipping refresh');
          addLog('탭 전환: 로컬DB에서 상태 & 제어 탭으로 전환했습니다.', 'info');
        }
      }
      
      setActiveTab(tabId);
      console.log(`Tab changed to: ${tabId}`);
    }
  }, [activeTab, addLog, loadConfig, checkStatus, configurationViewModel]);

  const isValidTab = (tabId: string): tabId is TabId => {
    return ['status', 'settings', 'localDB', 'analysis'].includes(tabId);
  };

  return {
    activeTab,
    handleTabChange,
    isValidTab,
  };
}
