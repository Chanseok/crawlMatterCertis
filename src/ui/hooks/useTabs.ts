import { useState, useCallback } from 'react';
import { addLog, loadConfig } from '../stores';

type TabId = 'status' | 'settings' | 'localDB' | 'analysis';

export function useTabs(defaultTab: TabId = 'status') {
  const [activeTab, setActiveTab] = useState<TabId>(defaultTab);

  const handleTabChange = useCallback((tabId: string) => {
    if (isValidTab(tabId)) {
      // 이전 탭이 설정 탭이었고, 새 탭이 상태 & 제어 탭인 경우
      if (activeTab === 'settings' && tabId === 'status') {
        // 설정 정보 리로드 (최신 설정을 확실히 반영)
        loadConfig().then(() => {
          addLog('탭 전환: 최신 설정 정보를 로드했습니다.', 'info');
        });
      }
      setActiveTab(tabId);
      console.log(`Tab changed to: ${tabId}`);
    }
  }, [activeTab]);

  const isValidTab = (tabId: string): tabId is TabId => {
    return ['status', 'settings', 'localDB', 'analysis'].includes(tabId);
  };

  return {
    activeTab,
    handleTabChange,
    isValidTab,
  };
}
