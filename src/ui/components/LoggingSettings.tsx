import { observer } from 'mobx-react-lite';
import { useConfigurationViewModel } from '../providers/ViewModelProvider';
import { LogLevel } from '../../shared/utils/Logger';
import { ExpandableSection } from './ExpandableSection';

interface LoggingSettingsProps {
  isExpanded: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

/**
 * LoggingSettings Component
 * 로깅 레벨 및 옵션 설정을 위한 컴포넌트
 */
function LoggingSettingsComponent({ isExpanded, onToggle, disabled = false }: LoggingSettingsProps) {
  const configurationViewModel = useConfigurationViewModel();

  // 로그 레벨 옵션들
  const logLevelOptions = [
    { value: LogLevel.ERROR, label: 'ERROR', description: '오류만 표시' },
    { value: LogLevel.WARN, label: 'WARN', description: '경고 이상 표시' },
    { value: LogLevel.INFO, label: 'INFO', description: '정보 이상 표시' },
    { value: LogLevel.DEBUG, label: 'DEBUG', description: '디버그 이상 표시' },
    { value: LogLevel.VERBOSE, label: 'VERBOSE', description: '모든 로그 표시' }
  ];

  // 현재 로깅 설정 가져오기
  const loggingConfig = configurationViewModel.getLoggingConfig();
  const availableComponents = configurationViewModel.getAvailableComponents();

  // 전역 로그 레벨 변경 핸들러
  const handleGlobalLogLevelChange = (level: LogLevel) => {
    configurationViewModel.updateGlobalLogLevel(level);
  };

  // 컴포넌트별 로그 레벨 변경 핸들러
  const handleComponentLogLevelChange = (component: string, level: LogLevel) => {
    configurationViewModel.updateLogLevel(component, level);
  };

  // 로깅 옵션 변경 핸들러
  const handleLoggingOptionsChange = (enableStackTrace: boolean, enableTimestamp: boolean) => {
    configurationViewModel.updateLoggingOptions(enableStackTrace, enableTimestamp);
  };

  // 로그 레벨 선택 컴포넌트
  const LogLevelSelect = ({ value, onChange, id }: { 
    value: LogLevel; 
    onChange: (level: LogLevel) => void;
    id: string;
  }) => (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(Number(e.target.value) as LogLevel)}
      disabled={disabled}
      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
    >
      {logLevelOptions.map(option => (
        <option key={option.value} value={option.value}>
          {option.label} - {option.description}
        </option>
      ))}
    </select>
  );

  return (
    <ExpandableSection
      title="로깅 설정"
      isExpanded={isExpanded}
      onToggle={onToggle}
      additionalClasses="border border-gray-200 rounded-lg"
    >
      <div className="p-4 bg-gray-50 space-y-6">
        {/* 전역 로그 레벨 설정 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            전역 로그 레벨
          </label>
          <LogLevelSelect
            id="global-log-level"
            value={configurationViewModel.stringToLogLevel(loggingConfig.level || 'INFO')}
            onChange={handleGlobalLogLevelChange}
          />
          <p className="text-xs text-gray-500 mt-1">
            모든 컴포넌트의 기본 로그 레벨을 설정합니다
          </p>
        </div>

        {/* 컴포넌트별 로그 레벨 설정 */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-3">컴포넌트별 로그 레벨</h4>
          <div className="space-y-3">
            {availableComponents.map(component => {
              const componentLevel = configurationViewModel.getComponentLogLevel(component);
              
              return (
                <div key={component} className="grid grid-cols-1 md:grid-cols-2 gap-2 items-center">
                  <label className="text-sm text-gray-600 font-medium">
                    {component}
                  </label>
                  <LogLevelSelect
                    id={`component-${component}-log-level`}
                    value={componentLevel}
                    onChange={(level) => handleComponentLogLevelChange(component, level)}
                  />
                </div>
              );
            })}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            특정 컴포넌트의 로그 레벨을 개별적으로 설정할 수 있습니다
          </p>
        </div>

        {/* 로깅 옵션 */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-3">로깅 옵션</h4>
          <div className="space-y-2">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={loggingConfig.enableTimestamp !== false}
                onChange={(e) => handleLoggingOptionsChange(
                  loggingConfig.enableStackTrace || false,
                  e.target.checked
                )}
                disabled={disabled}
                className="mr-2"
              />
              <span className="text-sm text-gray-700">타임스탬프 표시</span>
            </label>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={loggingConfig.enableStackTrace || false}
                onChange={(e) => handleLoggingOptionsChange(
                  e.target.checked,
                  loggingConfig.enableTimestamp !== false
                )}
                disabled={disabled}
                className="mr-2"
              />
              <span className="text-sm text-gray-700">스택 트레이스 표시</span>
            </label>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            로그 메시지에 추가 정보를 포함할지 설정합니다
          </p>
        </div>

        {/* 현재 설정 요약 */}
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <h5 className="text-sm font-medium text-blue-800 mb-2">현재 로깅 설정</h5>
          <div className="text-xs text-blue-700 space-y-1">
            <div>전역 레벨: <span className="font-mono">{loggingConfig.level || 'INFO'}</span></div>
            <div>타임스탬프: <span className="font-mono">{(loggingConfig.enableTimestamp !== false) ? '활성화' : '비활성화'}</span></div>
            <div>스택 트레이스: <span className="font-mono">{(loggingConfig.enableStackTrace || false) ? '활성화' : '비활성화'}</span></div>
            {Object.keys(loggingConfig.components || {}).length > 0 && (
              <div>
                커스텀 설정: {Object.keys(loggingConfig.components || {}).length}개 컴포넌트
              </div>
            )}
          </div>
        </div>

        {/* 로깅 설정 즉시 적용 버튼 */}
        <div className="flex justify-end">
          <button
            onClick={() => configurationViewModel.applyLoggingConfig()}
            disabled={disabled}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm"
          >
            로깅 설정 즉시 적용
          </button>
        </div>
      </div>
    </ExpandableSection>
  );
}

// Wrap with MobX observer for reactive state updates
export const LoggingSettings = observer(LoggingSettingsComponent);
export default LoggingSettings;
