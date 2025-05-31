import { useState, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { useCrawlingStore } from '../hooks/useCrawlingStore';
import { useConfigurationViewModel } from '../providers/ViewModelProvider';
import { serviceFactory } from '../services/ServiceFactory';
import type { CrawlerConfig } from '../../../types';

/**
 * CrawlingSettings Component
 * ConfigurationViewModel을 사용한 크롤링 설정 컴포넌트
 */
export function CrawlingSettings() {
  const { status } = useCrawlingStore();
  const configurationViewModel = useConfigurationViewModel();
  
  // 설정 파일 경로 상태
  const [configPath, setConfigPath] = useState<string>('');
  const [configPathError, setConfigPathError] = useState<string>('');

  // 컴포넌트 마운트 시 설정 초기화
  useEffect(() => {
    const initializeConfig = async () => {
      try {
        await configurationViewModel.initialize();
      } catch (error) {
        console.error('Failed to initialize configuration:', error);
      }
    };

    initializeConfig();
  }, [configurationViewModel]);

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
      configurationViewModel.setConfigurationLocked(true);
    } else {
      configurationViewModel.setConfigurationLocked(false);
    }
  }, [status, configurationViewModel]);

  const handleSave = async () => {
    try {
      await configurationViewModel.saveConfig();
    } catch (err) {
      console.error('설정 저장 실패:', err);
    }
  };

  const handleReset = async () => {
    try {
      await configurationViewModel.discardChanges();
    } catch (err) {
      console.error('설정 초기화 실패:', err);
    }
  };

  const handleFieldChange = <K extends keyof CrawlerConfig>(
    field: K,
    value: CrawlerConfig[K]
  ) => {
    configurationViewModel.updateConfigurationField(field, value);
  };

  const isDisabled = configurationViewModel.isConfigurationLocked;

  return (
    <div className="p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-xl font-semibold mb-4">크롤링 설정</h2>
      
      {/* 설정 상태 표시 */}
      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-blue-800">설정 상태</span>
          <div className="flex items-center space-x-2">
            {configurationViewModel.isConfigurationLocked && (
              <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded">설정 잠금</span>
            )}
            {configurationViewModel.isDirty && (
              <span className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded">
                미저장 변경사항
              </span>
            )}
          </div>
        </div>
      </div>

      {configurationViewModel.error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          {configurationViewModel.error}
          <button 
            onClick={() => configurationViewModel.clearErrorState()}
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
      {configurationViewModel.isLoading && (
        <div className="mb-4 p-3 rounded flex items-center bg-blue-100 border border-blue-400 text-blue-700">
          <svg className="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          설정을 처리하는 중...
        </div>
      )}

      {configurationViewModel.config && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              페이지 범위 제한
            </label>
            <input
              type="number"
              min="1"
              max="1000"
              value={configurationViewModel.getEffectiveValue('pageRangeLimit') || 0}
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
              value={configurationViewModel.getEffectiveValue('productListRetryCount') || 0}
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
              value={configurationViewModel.getEffectiveValue('productDetailRetryCount') || 0}
              onChange={(e) => handleFieldChange('productDetailRetryCount', Number(e.target.value))}
              disabled={isDisabled}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            />
          </div>

          <div>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={configurationViewModel.getEffectiveValue('autoAddToLocalDB') || false}
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
          disabled={isDisabled || configurationViewModel.isLoading}
          className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          초기화
        </button>
        <button
          onClick={() => configurationViewModel.discardChanges()}
          disabled={isDisabled || !configurationViewModel.isDirty}
          className="px-4 py-2 bg-orange-500 text-white rounded-md hover:bg-orange-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          변경사항 취소
        </button>
        <button
          onClick={handleSave}
          disabled={isDisabled || configurationViewModel.isLoading || !configurationViewModel.isDirty}
          className={`px-4 py-2 rounded-md flex items-center ${
            isDisabled || configurationViewModel.isLoading || !configurationViewModel.isDirty
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700'
          } text-white`}
        >
          {configurationViewModel.isLoading && (
            <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          )}
          {configurationViewModel.isLoading ? '저장 중...' : '설정 저장'}
        </button>
      </div>

      {/* 디버그 정보 (개발 모드에서만) */}
      {typeof window !== 'undefined' && window.location.hostname === 'localhost' && (
        <div className="mt-6 p-4 bg-gray-100 rounded-lg border">
          <h4 className="text-sm font-medium text-gray-700 mb-2">디버그 정보</h4>
          <pre className="text-xs text-gray-600 whitespace-pre-wrap">
            {JSON.stringify(configurationViewModel.getSessionStatus(), null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// Wrap with MobX observer for reactive state updates
export default observer(CrawlingSettings);
