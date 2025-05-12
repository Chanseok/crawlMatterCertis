import { useState, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import './App.css';
import { AppLayout } from './components/layout/AppLayout';
import { CrawlingSettings } from './components/CrawlingSettings';
import { ControlPanel } from './components/control/ControlPanel';
import { LocalDBTab } from './components/LocalDBTab';
import { CrawlingCompleteView } from './components/CrawlingCompleteView';
import { LogPanel } from './components/logs/LogPanel';
import { ProductsTable } from './components/products/ProductsTable';
import { useTabs } from './hooks/useTabs';
import {
  crawlingStatusStore,
  addLog,
  initializeApiSubscriptions,
  // logsStore,
  searchProducts,
  searchQueryStore
} from './stores';
import { getPlatformApi } from './platform/api';

function App() {
  // 기본 훅
  const { activeTab, handleTabChange } = useTabs('status');
  const crawlingStatus = useStore(crawlingStatusStore);
  const searchQuery = useStore(searchQueryStore);
  
  // 섹션별 확장/축소 상태
  const [statusExpanded, setStatusExpanded] = useState<boolean>(true);
  const [productsExpanded, setProductsExpanded] = useState<boolean>(true);
  const [logsExpanded, setLogsExpanded] = useState<boolean>(true);
  
  // 크롤링 결과 관련 상태 추가
  const [crawlingResults, setCrawlingResults] = useState<any[]>([]);
  const [autoSavedToDb, setAutoSavedToDb] = useState<boolean | undefined>(undefined);
  const [showCompleteView, setShowCompleteView] = useState<boolean>(false);

  // 상태 토글 핸들러
  const toggleSection = (section: 'status' | 'products' | 'logs') => {
    switch (section) {
      case 'status':
        setStatusExpanded(!statusExpanded);
        break;
      case 'products':
        setProductsExpanded(!productsExpanded);
        break;
      case 'logs':
        setLogsExpanded(!logsExpanded);
        break;
    }
  };

  // API 초기화
  useEffect(() => {
    // API 초기화 및 로그 추가
    initializeApiSubscriptions();
    addLog('애플리케이션이 시작되었습니다.', 'info');
    
    // API 초기화를 보장하기 위한 지연 처리
    const timeoutId = setTimeout(() => {
      try {
        // 크롤링 완료 이벤트 구독
        const api = getPlatformApi();
        const unsubscribe = api.subscribeToEvent('crawlingComplete', (data: any) => {
          if (
            data.success &&
            Array.isArray(data.products) &&
            data.products.length > 0
          ) {
            // 크롤링 결과 저장
            setCrawlingResults(data.products);
            // 자동 DB 저장 여부 설정
            setAutoSavedToDb(data.autoSavedToDb);
            // 완료 뷰 표시 활성화
            setShowCompleteView(true);
          }
        });
        
        // 자동 DB 저장 결과 이벤트 구독
        const unsubscribeDbSave = api.subscribeToEvent('dbSaveComplete', (data: any) => {
          if (data.success) {
            setAutoSavedToDb(true);
          }
        });
        
        // 자동 DB 저장 스킵 이벤트 구독
        const unsubscribeDbSkip = api.subscribeToEvent('dbSaveSkipped', (_data: any) => {
          setAutoSavedToDb(false);
        });
        
        // 컴포넌트 언마운트 시 이벤트 리스너 제거
        return () => {
          unsubscribe();
          unsubscribeDbSave();
          unsubscribeDbSkip();
        };
      } catch (error) {
        console.error('[App] Error initializing API subscriptions:', error);
      }
    }, 200); // API 초기화를 위한 약간의 지연
    
    return () => clearTimeout(timeoutId);
  }, []);

  // 검색어 변경시 검색 실행
  useEffect(() => {
    const delaySearch = setTimeout(() => {
      searchProducts(searchQuery);
    }, 500);

    return () => clearTimeout(delaySearch);
  }, [searchQuery]);

  return (
    <AppLayout>
      {/* 왼쪽 사이드바 (컨트롤 + 진행 상황) */}
      <div className="lg:col-span-1 space-y-6">
        {/* 컨트롤 패널 */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
          {/* 탭 네비게이션 */}
          <div className="flex border-b border-gray-200 dark:border-gray-700 mb-4">
            <button
              className={`px-4 py-2 text-sm font-medium ${
                activeTab === 'settings'
                  ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
              onClick={() => handleTabChange('settings')}
            >
              설정
            </button>
            <button
              className={`px-4 py-2 text-sm font-medium ${
                activeTab === 'status'
                  ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
              onClick={() => handleTabChange('status')}
            >
              상태 & 제어
            </button>
            <button
              className={`px-4 py-2 text-sm font-medium ${
                activeTab === 'localDB'
                  ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
              onClick={() => handleTabChange('localDB')}
            >
              로컬DB
            </button>
          </div>
          
          {/* 설정 탭 */}
          {activeTab === 'settings' && (
            <div>
              <CrawlingSettings />
            </div>
          )}
          
          {/* 상태 및 제어 탭 */}
          {activeTab === 'status' && (
            <ControlPanel 
              statusExpanded={statusExpanded}
              onToggleStatus={() => toggleSection('status')}
            />
          )}
          
          {/* 로컬DB 탭 */}
          {activeTab === 'localDB' && (
            <LocalDBTab />
          )}
        </div>
        
        {/* 로그 패널 - 모든 탭에 공통으로 표시 */}
        <LogPanel 
          isExpanded={logsExpanded} 
          onToggle={() => toggleSection('logs')} 
        />
      </div>
      
      {/* 오른쪽 메인 콘텐츠 (데이터 표시) */}
      <div className="lg:col-span-2">
        {activeTab === 'status' && showCompleteView && crawlingStatus === 'completed' && (
          <CrawlingCompleteView 
            products={crawlingResults} 
            autoSavedToDb={autoSavedToDb}
          />
        )}
        
        {activeTab !== 'localDB' && (
          <ProductsTable
            isExpanded={productsExpanded}
            onToggle={() => toggleSection('products')}
          />
        )}
      </div>
    </AppLayout>
  );
}

export default App;
