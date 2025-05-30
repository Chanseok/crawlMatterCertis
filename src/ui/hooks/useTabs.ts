import { useState } from 'react';
import { addLog, loadConfig } from '../stores';

type TabType = 'settings' | 'status' | 'localDB';

export function useTabs(initialTab: TabType = 'status') {
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);

  const handleTabChange = (tab: TabType) => {
    // 이전 탭이 설정 탭이었고, 새 탭이 상태 & 제어 탭인 경우
    if (activeTab === 'settings' && tab === 'status') {
      // 설정 정보 리로드 (최신 설정을 확실히 반영)
      loadConfig().then(() => {
        addLog('탭 전환: 최신 설정 정보를 로드했습니다.', 'info');
      });
    }
    setActiveTab(tab);
  };

  return {
    activeTab,
    handleTabChange,
  };
}
