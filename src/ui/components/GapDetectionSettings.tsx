/**
 * GapDetectionSettings.tsx
 * Gap Detection & Collection 설정 및 제어 컴포넌트
 * 
 * Clean Architecture & Design Principles:
 * - Single Responsibility: Gap 관련 UI 기능만 담당
 * - Open/Closed: 새로운 Gap 기능 추가시 확장 가능
 * - Dependency Inversion: ViewModel을 통한 비즈니스 로직 분리
 * - Interface Segregation: 명확한 UI 책임 분리
 * 
 * UI Architecture Pattern:
 * - ViewModel Pattern: GapDetectionViewModel을 통한 상태 관리
 * - Component Composition: 기능별 하위 컴포넌트 분리
 * - Reactive UI: MobX Observer를 통한 자동 UI 업데이트
 * - Consistent Design: 기존 ExpandableSection 패턴 활용
 */

import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useGapDetectionViewModel } from '../providers/ViewModelProvider';
import { ExpandableSection } from './ExpandableSection';
import { GapDetectionStage, type GapCollectionOptions } from '../viewmodels/GapDetectionViewModel';

/**
 * Gap Detection Settings Props
 */
interface GapDetectionSettingsProps {
  isExpanded: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

/**
 * Gap Detection Settings Component
 * 
 * 기능:
 * - Gap Detection 설정 및 실행
 * - Gap Collection 제어
 * - 실시간 진행률 표시
 * - 결과 분석 및 표시
 * - 오류 처리 및 사용자 피드백
 */
function GapDetectionSettingsComponent({
  isExpanded,
  onToggle,
  disabled = false
}: GapDetectionSettingsProps) {
  const gapDetectionViewModel = useGapDetectionViewModel();
  
  // === Local UI State ===
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [showResultDetails, setShowResultDetails] = useState(false);

  // === Event Handlers ===
  
  /**
   * Gap Detection 옵션 변경 핸들러
   */
  const handleOptionChange = <K extends keyof GapCollectionOptions>(
    field: K,
    value: GapCollectionOptions[K]
  ) => {
    gapDetectionViewModel.setOptions({ [field]: value });
  };

  /**
   * Detection만 실행
   */
  const handleStartDetection = async () => {
    try {
      await gapDetectionViewModel.startDetection();
    } catch (error) {
      console.error('Failed to start gap detection:', error);
    }
  };

  /**
   * Collection만 실행
   */
  const handleStartCollection = async () => {
    try {
      await gapDetectionViewModel.startCollection();
    } catch (error) {
      console.error('Failed to start gap collection:', error);
    }
  };

  /**
   * Detection + Collection 전체 워크플로우 실행
   */
  const handleStartDetectionAndCollection = async () => {
    try {
      await gapDetectionViewModel.startDetectionAndCollection();
    } catch (error) {
      console.error('Failed to start gap detection and collection:', error);
    }
  };

  /**
   * 작업 취소
   */
  const handleCancel = async () => {
    try {
      await gapDetectionViewModel.cancelOperation();
    } catch (error) {
      console.error('Failed to cancel operation:', error);
    }
  };

  /**
   * 상태 초기화
   */
  const handleReset = () => {
    gapDetectionViewModel.resetState();
  };

  /**
   * 오류 클리어
   */
  const handleClearError = () => {
    gapDetectionViewModel.clearError();
  };

  // === Computed Values ===
  const stage = gapDetectionViewModel.stage;
  const options = gapDetectionViewModel.options;
  const progress = gapDetectionViewModel.progress;
  const result = gapDetectionViewModel.result;
  const error = gapDetectionViewModel.error;
  const isRunning = gapDetectionViewModel.isRunning;
  const isDisabled = disabled || isRunning;

  // === Render Helper Functions ===

  /**
   * 상태 표시 배지 렌더링
   */
  const renderStatusBadge = () => {
    const getStatusColor = (stage: GapDetectionStage) => {
      switch (stage) {
        case GapDetectionStage.IDLE:
          return 'bg-gray-100 text-gray-700';
        case GapDetectionStage.DETECTING:
          return 'bg-blue-100 text-blue-700';
        case GapDetectionStage.ANALYSIS:
          return 'bg-indigo-100 text-indigo-700';
        case GapDetectionStage.COLLECTING:
          return 'bg-yellow-100 text-yellow-700';
        case GapDetectionStage.COMPLETED:
          return 'bg-green-100 text-green-700';
        case GapDetectionStage.ERROR:
          return 'bg-red-100 text-red-700';
        default:
          return 'bg-gray-100 text-gray-700';
      }
    };

    const getStatusText = (stage: GapDetectionStage) => {
      switch (stage) {
        case GapDetectionStage.IDLE:
          return '대기중';
        case GapDetectionStage.DETECTING:
          return 'Gap 감지중';
        case GapDetectionStage.ANALYSIS:
          return '분석중';
        case GapDetectionStage.COLLECTING:
          return '수집중';
        case GapDetectionStage.COMPLETED:
          return '완료';
        case GapDetectionStage.ERROR:
          return '오류';
        default:
          return '알 수 없음';
      }
    };

    return (
      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(stage)}`}>
        {getStatusText(stage)}
      </span>
    );
  };

  /**
   * 기본 옵션 설정 렌더링
   */
  const renderBasicOptions = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={options.detectOnly}
            onChange={(e) => handleOptionChange('detectOnly', e.target.checked)}
            disabled={isDisabled}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm font-medium text-gray-700">Detection만 실행</span>
        </label>
        <p className="text-xs text-gray-500 mt-1 ml-6">
          Gap을 찾기만 하고 수집은 하지 않습니다
        </p>
      </div>

      <div>
        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={options.autoCollect}
            onChange={(e) => handleOptionChange('autoCollect', e.target.checked)}
            disabled={isDisabled || options.detectOnly}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm font-medium text-gray-700">자동 수집</span>
        </label>
        <p className="text-xs text-gray-500 mt-1 ml-6">
          Gap 감지 후 자동으로 수집을 시작합니다
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          동시 처리 페이지 수
        </label>
        <input
          type="number"
          min="1"
          max="10"
          value={options.maxConcurrentPages}
          onChange={(e) => handleOptionChange('maxConcurrentPages', Number(e.target.value))}
          disabled={isDisabled}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          페이지 간 지연 (ms)
        </label>
        <input
          type="number"
          min="100"
          max="10000"
          step="100"
          value={options.delayBetweenPages}
          onChange={(e) => handleOptionChange('delayBetweenPages', Number(e.target.value))}
          disabled={isDisabled}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
        />
      </div>
    </div>
  );

  /**
   * 고급 옵션 설정 렌더링
   */
  const renderAdvancedOptions = () => (
    <div className="mt-4 p-4 bg-gray-50 rounded-lg">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            최대 재시도 횟수
          </label>
          <input
            type="number"
            min="1"
            max="10"
            value={options.maxRetries}
            onChange={(e) => handleOptionChange('maxRetries', Number(e.target.value))}
            disabled={isDisabled}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
          />
        </div>

        <div>
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={options.enableRetry}
              onChange={(e) => handleOptionChange('enableRetry', e.target.checked)}
              disabled={isDisabled}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm font-medium text-gray-700">재시도 활성화</span>
          </label>
        </div>

        <div>
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={options.notificationEnabled}
              onChange={(e) => handleOptionChange('notificationEnabled', e.target.checked)}
              disabled={isDisabled}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm font-medium text-gray-700">완료 알림</span>
          </label>
        </div>

        {/* 커스텀 페이지 범위 설정 */}
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            커스텀 페이지 범위 (선택사항)
          </label>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              min="1"
              placeholder="시작 페이지"
              value={options.customPageRange?.startPage || ''}
              onChange={(e) => {
                const startPage = Number(e.target.value);
                const endPage = options.customPageRange?.endPage || startPage;
                handleOptionChange('customPageRange', { startPage, endPage });
              }}
              disabled={isDisabled}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            />
            <input
              type="number"
              min="1"
              placeholder="끝 페이지"
              value={options.customPageRange?.endPage || ''}
              onChange={(e) => {
                const endPage = Number(e.target.value);
                const startPage = options.customPageRange?.startPage || endPage;
                handleOptionChange('customPageRange', { startPage, endPage });
              }}
              disabled={isDisabled}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            />
          </div>
        </div>
      </div>
    </div>
  );

  /**
   * 진행률 표시 렌더링
   */
  const renderProgress = () => {
    if (!isRunning) return null;

    return (
      <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-blue-800">진행률</span>
          <span className="text-sm text-blue-600">
            {gapDetectionViewModel.progressPercentage}%
          </span>
        </div>
        
        <div className="w-full bg-blue-200 rounded-full h-2 mb-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${gapDetectionViewModel.progressPercentage}%` }}
          />
        </div>

        <div className="text-xs text-blue-600 space-y-1">
          {stage === GapDetectionStage.COLLECTING && (
            <>
              <div>현재 페이지: {progress.currentPage}</div>
              <div>수집 완료: {progress.collectedPages}/{progress.totalPages}</div>
              <div>처리 속도: {progress.processingRate} pages/min</div>
              {progress.estimatedTimeRemaining > 0 && (
                <div>예상 남은 시간: {Math.round(progress.estimatedTimeRemaining / 60)}분</div>
              )}
            </>
          )}
          {progress.failedPages.length > 0 && (
            <div className="text-red-600">
              실패한 페이지: {progress.failedPages.length}개
            </div>
          )}
        </div>
      </div>
    );
  };

  /**
   * 결과 표시 렌더링
   */
  const renderResults = () => {
    if (!result) return null;

    return (
      <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-medium text-green-800">Detection 결과</h4>
          <button
            onClick={() => setShowResultDetails(!showResultDetails)}
            className="text-xs text-green-600 hover:text-green-700"
          >
            {showResultDetails ? '숨기기' : '자세히 보기'}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm text-green-700">
          <div>
            <span className="font-medium">누락된 페이지:</span>
            <span className="ml-2">{result.totalMissingPages}개</span>
          </div>
          <div>
            <span className="font-medium">예상 누락 제품:</span>
            <span className="ml-2">{result.missingProductsCount}개</span>
          </div>
          <div>
            <span className="font-medium">감지 시간:</span>
            <span className="ml-2">{(result.detectionTime / 1000).toFixed(1)}초</span>
          </div>
          <div>
            <span className="font-medium">감지 날짜:</span>
            <span className="ml-2">{result.lastDetectionDate.toLocaleDateString()}</span>
          </div>
        </div>

        {showResultDetails && result.analysisDetails && (
          <div className="mt-3 pt-3 border-t border-green-200">
            <div className="text-xs text-green-600 space-y-2">
              <div>
                <span className="font-medium">최대 Gap:</span>
                <span className="ml-2">
                  페이지 {result.analysisDetails.largestGap.startPage}-{result.analysisDetails.largestGap.endPage} 
                  ({result.analysisDetails.largestGap.count}개)
                </span>
              </div>
              <div>
                <span className="font-medium">누락 pageId 목록:</span>
                <div className="mt-1 p-2 bg-white rounded text-xs font-mono">
                  {result.missingPagesList.slice(0, 50).sort().join(', ')}
                  {result.missingPagesList.length > 20 && '...'}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  /**
   * 오류 표시 렌더링
   */
  const renderError = () => {
    if (!error) return null;

    return (
      <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <svg className="w-4 h-4 text-red-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <span className="text-sm font-medium text-red-800">오류 발생</span>
          </div>
          <button
            onClick={handleClearError}
            className="text-xs text-red-600 hover:text-red-700"
          >
            닫기
          </button>
        </div>
        <p className="mt-2 text-sm text-red-700">{error}</p>
      </div>
    );
  };

  /**
   * 액션 버튼들 렌더링
   */
  const renderActionButtons = () => (
    <div className="mt-6 flex flex-wrap gap-2">
      {/* Detection 버튼 */}
      <button
        onClick={handleStartDetection}
        disabled={!gapDetectionViewModel.canStartDetection || isDisabled}
        className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Gap 감지만
      </button>

      {/* Collection 버튼 (결과가 있을 때만) */}
      {gapDetectionViewModel.hasValidResult && (
        <button
          onClick={handleStartCollection}
          disabled={!gapDetectionViewModel.canStartCollection || isDisabled}
          className="px-4 py-2 bg-yellow-600 text-white text-sm font-medium rounded-md hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Gap 수집만
        </button>
      )}

      {/* Detection + Collection 버튼 */}
      <button
        onClick={handleStartDetectionAndCollection}
        disabled={!gapDetectionViewModel.canStartDetection || isDisabled}
        className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        감지 + 수집
      </button>

      {/* 취소 버튼 (실행 중일 때만) */}
      {gapDetectionViewModel.canCancel && (
        <button
          onClick={handleCancel}
          className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
        >
          취소
        </button>
      )}

      {/* 초기화 버튼 */}
      <button
        onClick={handleReset}
        disabled={isRunning}
        className="px-4 py-2 bg-gray-600 text-white text-sm font-medium rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        초기화
      </button>
    </div>
  );

  // === Main Render ===
  return (
    <ExpandableSection
      title="Gap Detection & Collection"
      isExpanded={isExpanded}
      onToggle={onToggle}
      additionalClasses={disabled ? "opacity-50" : ""}
    >
      <div className="space-y-4">
        {/* 상태 정보 및 배지 */}
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            <p>로컬 데이터베이스에 누락된 제품들을 감지하고 수집합니다.</p>
            <p className="mt-1">CLI 기반 gap-collect 기능의 UI 버전입니다.</p>
          </div>
          {renderStatusBadge()}
        </div>

        {/* 기본 옵션 */}
        {renderBasicOptions()}

        {/* 고급 옵션 토글 */}
        <div>
          <button
            onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
            disabled={isDisabled}
            className="text-sm text-blue-600 hover:text-blue-700 disabled:opacity-50"
          >
            {showAdvancedOptions ? '고급 옵션 숨기기' : '고급 옵션 표시'}
          </button>
        </div>

        {/* 고급 옵션 */}
        {showAdvancedOptions && renderAdvancedOptions()}

        {/* 진행률 표시 */}
        {renderProgress()}

        {/* 결과 표시 */}
        {renderResults()}

        {/* 오류 표시 */}
        {renderError()}

        {/* 액션 버튼들 */}
        {renderActionButtons()}
      </div>
    </ExpandableSection>
  );
}

// MobX observer for reactive state updates
const GapDetectionSettings = observer(GapDetectionSettingsComponent);

export { GapDetectionSettings };
export default GapDetectionSettings;
