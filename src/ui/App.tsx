import { useEffect, useState } from 'react';
import { useApiInitialization } from './hooks/useApiInitialization';
import { useLogStore } from './hooks/useLogStore';
import { useUIStore } from './hooks/useUIStore';
import { useTabs } from './hooks/useTabs';
import { useCrawlingComplete } from './hooks/useCrawlingComplete';
import { AppLayout } from './components/AppLayout';
import CrawlingDashboard from './components/CrawlingDashboard';
import { CrawlingSettings } from './components/CrawlingSettings';
import { LocalDBTab } from './components/LocalDBTab';
import { AnalysisTab } from './components/AnalysisTab';

function App() {
  // Development mode detection
  const isDevelopment = import.meta.env.DEV || import.meta.env.NODE_ENV === 'development';
  
  // API 초기화 (앱 시작 시 한 번만 수행)
  useApiInitialization();
  
  // Domain Store Hooks 사용
  const { addLog } = useLogStore();
  const { searchQuery } = useUIStore();
  
  // 커스텀 훅을 통한 탭 관리
  const { activeTab, handleTabChange } = useTabs('status'); // 기본 탭을 'status'로 설정
  
  // 크롤링 완료 관련 데이터 훅
  const { error, isSavingToDb } = useCrawlingComplete();
  
  // CrawlingDashboard에 필요한 상태
  const [isAppStatusChecking] = useState(false);
  const [appCompareExpanded, setAppCompareExpanded] = useState(false);

  // searchQuery 변경 시에만 검색 실행 (초기 로드 분리)
  useEffect(() => {
    if (searchQuery && searchQuery.trim()) {
      console.log('Searching products with query:', searchQuery);
      // 검색은 각 탭 컴포넌트에서 필요시 수행
    }
  }, [searchQuery]);

  // 에러 처리
  useEffect(() => {
    if (error) {
      addLog(`크롤링 결과 처리 오류: ${error}`, 'error');
    }
  }, [error, addLog]);
  
  // DB 저장 상태 모니터링
  useEffect(() => {
    if (isSavingToDb) {
      addLog('크롤링된 제품 정보를 DB에 저장하는 중...', 'info');
    }
  }, [isSavingToDb, addLog]);

  // 탭 컨텐츠 렌더링 함수
  const renderTabContent = () => {
    switch (activeTab) {
      case 'status':
        return <CrawlingDashboard 
          isAppStatusChecking={isAppStatusChecking}
          appCompareExpanded={appCompareExpanded}
          setAppCompareExpanded={setAppCompareExpanded}
        />;
      case 'settings':
        return <CrawlingSettings />;
      case 'localDB':
        return <LocalDBTab />;
      case 'analysis':
        return <AnalysisTab />;
      default:
        return <CrawlingDashboard 
          isAppStatusChecking={isAppStatusChecking}
          appCompareExpanded={appCompareExpanded}
          setAppCompareExpanded={setAppCompareExpanded}
        />;
    }
  };

  return (
    <AppLayout 
      activeTab={activeTab} 
      onTabChange={handleTabChange}
      isDevelopment={isDevelopment}
    >
      <div className="h-full">
        {renderTabContent()}
        
        {/* 개발 모드에서만 디버그 패널 표시 */}
        {/* 개발 모드에서만 디버그 패널 표시 */}
        {/* Debug panel component not available */}
      </div>
    </AppLayout>
  );
}

export default App;
