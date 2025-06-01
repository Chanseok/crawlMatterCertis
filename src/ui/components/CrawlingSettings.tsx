import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useConfigurationViewModel, useCrawlingWorkflowViewModel } from '../providers/ViewModelProvider';
import { BatchProcessingSettings } from './BatchProcessingSettings';
import { ExpandableSection } from './ExpandableSection';
import { LoggingSettings } from './LoggingSettings';
import type { CrawlerConfig } from '../../../types';
import { WorkflowStage } from '../viewmodels/CrawlingWorkflowViewModel';

/**
 * CrawlingSettings Component
 * ConfigurationViewModel을 사용한 설정 관리 컴포넌트
 */
function CrawlingSettingsComponent() {
  const configurationViewModel = useConfigurationViewModel();
  const crawlingWorkflowViewModel = useCrawlingWorkflowViewModel();
  const [isAdvancedExpanded, setIsAdvancedExpanded] = useState(false);
  const [isLoggingExpanded, setIsLoggingExpanded] = useState(false);

  // 컴포넌트 마운트 시 초기화
  useEffect(() => {
    const initialize = async () => {
      try {
        await configurationViewModel.loadConfiguration();
      } catch (error) {
        console.error('Failed to initialize configuration:', error);
      }
    };

    initialize();
  }, [configurationViewModel]);

  // 크롤링 상태에 따른 설정 잠금 관리
  useEffect(() => {
    const isRunning = crawlingWorkflowViewModel.workflowState.stage !== WorkflowStage.IDLE;
    configurationViewModel.setConfigurationLocked(isRunning);
  }, [crawlingWorkflowViewModel.workflowState.stage, configurationViewModel]);

  const handleSave = async () => {
    try {
      await configurationViewModel.saveConfiguration();
    } catch (err) {
      console.error('설정 저장 실패:', err);
    }
  };

  const handleReset = async () => {
    try {
      await configurationViewModel.resetConfiguration();
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

  const handleDiscardChanges = () => {
    configurationViewModel.discardChanges();
  };

  const isDisabled = configurationViewModel.isConfigurationLocked;

  const BATCH_THRESHOLD = 10;

  return (
    <div className="p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-xl font-semibold mb-4">크롤링 설정</h2>
      
      {/* 세션 상태 표시 */}
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
        <h3 className="text-sm font-medium text-gray-700 mb-2">설정 상태 정보</h3>
        <div className="text-sm text-gray-600">
          <div className="grid grid-cols-2 gap-2">
            <span>설정 로드됨:</span>
            <span>{Object.keys(configurationViewModel.config).length > 0 ? '예' : '아니오'}</span>
            <span>설정 키 개수:</span>
            <span>{Object.keys(configurationViewModel.config).length}</span>
            <span>마지막 저장:</span>
            <span>{configurationViewModel.lastSaved ? configurationViewModel.lastSaved.toLocaleString() : '없음'}</span>
            <span>변경사항:</span>
            <span>{configurationViewModel.hasChanges ? '있음' : '없음'}</span>
            <span>로딩 중:</span>
            <span>{configurationViewModel.isLoading ? '예' : '아니오'}</span>
            <span>에러:</span>
            <span>{configurationViewModel.error || '없음'}</span>
          </div>
        </div>
        <div className="mt-3 text-xs text-gray-500">
          <details>
            <summary className="cursor-pointer">설정 키 목록 보기</summary>
            <div className="mt-2 p-2 bg-white rounded border text-xs font-mono">
              {Object.keys(configurationViewModel.config).length > 0 
                ? Object.keys(configurationViewModel.config).join(', ') 
                : '설정 데이터 없음'}
            </div>
          </details>
        </div>
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

      {configurationViewModel.config && Object.keys(configurationViewModel.config).length > 0 && (
        <>
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

          {/* 고급 설정 섹션 */}
          <div className="mt-6">
            <ExpandableSection
              title="고급 설정"
              isExpanded={isAdvancedExpanded}
              onToggle={() => setIsAdvancedExpanded(!isAdvancedExpanded)}
              additionalClasses="border border-gray-200 rounded-lg"
            >
              <div className="p-4 bg-gray-50">
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={configurationViewModel.getEffectiveValue('autoStatusCheck') || false}
                        onChange={(e) => handleFieldChange('autoStatusCheck', e.target.checked)}
                        disabled={isDisabled}
                        className="mr-2"
                      />
                      <span className="text-sm font-medium text-gray-700">
                        자동 상태 체크
                      </span>
                    </label>
                    <p className="text-xs text-gray-500 mt-1 ml-6">
                      상태 & 제어 탭 첫 진입 시 자동으로 상태를 체크합니다
                    </p>
                  </div>
                </div>
              </div>
            </ExpandableSection>
          </div>
        </>
      )}

      {/* 배치 처리 설정 (페이지 범위가 임계값을 초과할 때만 표시) */}
      {configurationViewModel.getEffectiveValue('pageRangeLimit')! > BATCH_THRESHOLD && (
        <BatchProcessingSettings
          enableBatchProcessing={!!configurationViewModel.getEffectiveValue('enableBatchProcessing')}
          setEnableBatchProcessing={(enable) => configurationViewModel.updateConfigurationField('enableBatchProcessing', enable)}
          batchSize={configurationViewModel.getEffectiveValue('batchSize') || 10}
          setBatchSize={(size) => configurationViewModel.updateConfigurationField('batchSize', size)}
          batchDelayMs={configurationViewModel.getEffectiveValue('batchDelayMs') || 1000}
          setBatchDelayMs={(delay) => configurationViewModel.updateConfigurationField('batchDelayMs', delay)}
          batchRetryLimit={configurationViewModel.getEffectiveValue('batchRetryLimit') || 3}
          setBatchRetryLimit={(limit) => configurationViewModel.updateConfigurationField('batchRetryLimit', limit)}
        />
      )}

      {/* 로깅 설정 */}
      <LoggingSettings
        isExpanded={isLoggingExpanded}
        onToggle={() => setIsLoggingExpanded(!isLoggingExpanded)}
        disabled={isDisabled}
      />

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
          onClick={handleDiscardChanges}
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

      {/* 세션 디버그 정보 (개발 모드에서만) */}
      {typeof window !== 'undefined' && window.location.hostname === 'localhost' && (
        <div className="mt-6 p-4 bg-gray-100 rounded-lg border">
          <h4 className="text-sm font-medium text-gray-700 mb-2">설정 디버그 정보</h4>
          <pre className="text-xs text-gray-600 whitespace-pre-wrap">
            {JSON.stringify(configurationViewModel.getSessionStatus(), null, 2)}
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
