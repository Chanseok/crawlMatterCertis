import { useState, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { useCrawlingStore } from '../hooks/useCrawlingStore';
import { SessionConfigManager } from '../services/domain/SessionConfigManager';
import { serviceFactory } from '../services/ServiceFactory';
import type { CrawlerConfig } from '../../../types';

/**
 * CrawlingSettings Component
 * SessionConfigManager를 사용한 세션 기반 크롤링 설정 컴포넌트
 */
function CrawlingSettingsComponent() {
  const { status } = useCrawlingStore();
  const [sessionConfigManager] = useState(() => SessionConfigManager.getInstance());
  
  // 설정 파일 경로 상태
  const [configPath, setConfigPath] = useState<string>('');
  const [configPathError, setConfigPathError] = useState<string>('');

  // 컴포넌트 마운트 시 세션 초기화 및 이전 세션의 변경사항 복원
  useEffect(() => {
    const initializeSession = async () => {
      try {
        await sessionConfigManager.initialize();
        await sessionConfigManager.restorePendingChanges();
        
        // 디버깅을 위해 전역 객체에 sessionConfigManager 노출
        if (typeof window !== 'undefined') {
          (window as any).sessionConfigManager = sessionConfigManager;
          console.log('🔧 SessionConfigManager exposed to window.sessionConfigManager for debugging');
        }
      } catch (error) {
        console.error('Failed to initialize session:', error);
      }
    };

    initializeSession();
  }, [sessionConfigManager]);

  // 설정 파일 경로 가져오기
  useEffect(() => {
    const loadConfigPath = async () => {
      try {
        const configService = serviceFactory.getConfigurationService();
        const path = await configService.getConfigPath();
        setConfigPath(path);
        setConfigPathError('');
      } catch (err) {
        console.error('Failed to load config path:', err);
        setConfigPathError('설정 파일 경로를 가져올 수 없습니다.');
      }
    };

    loadConfigPath();
  }, []);

  // 크롤링 상태에 따른 설정 잠금 관리
  useEffect(() => {
    if (status === 'running') {
      sessionConfigManager.lockConfig();
    } else {
      sessionConfigManager.unlockConfig();
    }
  }, [status, sessionConfigManager]);

  const handleSave = async () => {
    try {
      await sessionConfigManager.savePendingChanges();
    } catch (err) {
      console.error('설정 저장 실패:', err);
    }
  };

  const handleReset = async () => {
    try {
      await sessionConfigManager.resetConfig();
    } catch (err) {
      console.error('설정 초기화 실패:', err);
    }
  };

  const handleFieldChange = <K extends keyof CrawlerConfig>(
    field: K,
    value: CrawlerConfig[K]
  ) => {
    console.log('🔄 CrawlingSettings: handleFieldChange called', { field, value, previousValue: sessionConfigManager.getEffectiveValue(field) });
    sessionConfigManager.setPendingValue(field, value);
    console.log('✅ CrawlingSettings: after setPendingValue', { 
      newValue: sessionConfigManager.getEffectiveValue(field),
      isDirty: sessionConfigManager.isDirty,
      pendingChangesCount: sessionConfigManager.pendingChanges ? Object.keys(sessionConfigManager.pendingChanges).length : 0
    });
  };

  const isDisabled = sessionConfigManager.isConfigLocked;

  return (
    <div className="p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-xl font-semibold mb-4">크롤링 설정</h2>
      
      {/* 세션 상태 표시 */}
      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-blue-800">세션 상태</span>
          <div className="flex items-center space-x-2">
            {sessionConfigManager.isConfigLocked && (
              <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded">설정 잠금</span>
            )}
            {sessionConfigManager.isDirty && (
              <span className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded">
                미저장 변경사항 {sessionConfigManager.pendingChanges && Object.keys(sessionConfigManager.pendingChanges).length}개
              </span>
            )}
          </div>
        </div>
      </div>

      {sessionConfigManager.lastError && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          {sessionConfigManager.lastError}
          <button 
            onClick={() => sessionConfigManager.clearError()}
            className="ml-2 text-red-500 hover:text-red-700"
          >
            ✕
          </button>
        </div>
      )}

      {/* 설정 파일 정보 섹션 */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg border">
        <h3 className="text-sm font-medium text-gray-700 mb-2">설정 파일 정보</h3>
        {configPathError ? (
          <div className="text-red-600 text-sm">{configPathError}</div>
        ) : (
          <div className="text-sm text-gray-600">
            <span className="font-medium">설정 파일 위치:</span>
            <div className="mt-1 font-mono text-xs bg-white p-2 rounded border break-all">
              {configPath || '로딩 중...'}
            </div>
          </div>
        )}
      </div>

      {/* 저장 상태 메시지 */}
      {sessionConfigManager.isLoading && (
        <div className="mb-4 p-3 rounded flex items-center bg-blue-100 border border-blue-400 text-blue-700">
          <svg className="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          설정을 처리하는 중...
        </div>
      )}

      {sessionConfigManager.config && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              페이지 범위 제한
            </label>
            <input
              type="number"
              min="1"
              max="1000"
              value={sessionConfigManager.getEffectiveValue('pageRangeLimit') || 0}
              onChange={(e) => handleFieldChange('pageRangeLimit', Number(e.target.value))}
              disabled={isDisabled}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              제품 목록 재시도 횟수
            </label>
            <input
              type="number"
              min="1"
              max="20"
              value={sessionConfigManager.getEffectiveValue('productListRetryCount') || 0}
              onChange={(e) => handleFieldChange('productListRetryCount', Number(e.target.value))}
              disabled={isDisabled}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              제품 상세 재시도 횟수
            </label>
            <input
              type="number"
              min="1"
              max="20"
              value={sessionConfigManager.getEffectiveValue('productDetailRetryCount') || 0}
              onChange={(e) => handleFieldChange('productDetailRetryCount', Number(e.target.value))}
              disabled={isDisabled}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            />
          </div>

          <div>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={sessionConfigManager.getEffectiveValue('autoAddToLocalDB') || false}
                onChange={(e) => handleFieldChange('autoAddToLocalDB', e.target.checked)}
                disabled={isDisabled}
                className="mr-2"
              />
              <span className="text-sm font-medium text-gray-700">
                자동으로 로컬 DB에 추가
              </span>
            </label>
          </div>
        </div>
      )}

      {/* 저장 버튼 */}
      <div className="mt-6 flex justify-end space-x-3">
        <button
          onClick={handleReset}
          disabled={isDisabled || sessionConfigManager.isLoading}
          className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          초기화
        </button>
        <button
          onClick={() => sessionConfigManager.discardPendingChanges()}
          disabled={isDisabled || !sessionConfigManager.isDirty}
          className="px-4 py-2 bg-orange-500 text-white rounded-md hover:bg-orange-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          변경사항 취소
        </button>
        <button
          onClick={handleSave}
          disabled={isDisabled || sessionConfigManager.isLoading || !sessionConfigManager.isDirty}
          className={`px-4 py-2 rounded-md flex items-center ${
            isDisabled || sessionConfigManager.isLoading || !sessionConfigManager.isDirty
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700'
          } text-white`}
        >
          {sessionConfigManager.isLoading && (
            <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          )}
          {sessionConfigManager.isLoading ? '저장 중...' : '설정 저장'}
        </button>
      </div>

      {/* 세션 디버그 정보 (개발 모드에서만) */}
      {typeof window !== 'undefined' && window.location.hostname === 'localhost' && (
        <div className="mt-6 p-4 bg-gray-100 rounded-lg border">
          <h4 className="text-sm font-medium text-gray-700 mb-2">세션 디버그 정보</h4>
          <pre className="text-xs text-gray-600 whitespace-pre-wrap">
            {JSON.stringify(sessionConfigManager.getSessionStatus(), null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// Wrap with MobX observer for reactive state updates
const CrawlingSettings = observer(CrawlingSettingsComponent);

export { CrawlingSettings };
export default CrawlingSettings;
