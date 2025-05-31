# ViewModel Pattern Implementation

## 개요

CrawlMatterCertis 애플리케이션에서 ViewModel 패턴을 성공적으로 구현하여 UI 컴포넌트와 비즈니스 로직 간의 분리를 달성했습니다. 이 문서는 구현된 ViewModel 패턴의 아키텍처와 주요 구성 요소를 설명합니다.

## 아키텍처 개요

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   UI Components │────│   ViewModels     │────│   Domain Store  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │   Services       │
                       └──────────────────┘
```

## 핵심 구성 요소

### 1. ViewModels

#### ConfigurationViewModel
- **역할**: 크롤링 설정 관리
- **기능**:
  - 설정 로드/저장
  - 실시간 유효성 검증
  - 변경사항 추적 (isDirty)
  - 설정 잠금 관리
  - 오류 상태 관리

```typescript
class ConfigurationViewModel extends BaseViewModel {
  @observable accessor config: CrawlerConfig
  @observable accessor isLoading: boolean
  @observable accessor validationErrors: Record<string, string>
  @observable accessor isConfigurationLocked: boolean
  
  @computed get isDirty(): boolean
  @computed get isValid(): boolean
  
  @action updateConfigurationField<K>(field: K, value: CrawlerConfig[K])
  @action saveConfig()
  @action discardChanges()
}
```

#### CrawlingWorkflowViewModel
- **역할**: 크롤링 워크플로우 상태 관리
- **기능**:
  - 워크플로우 단계 추적
  - 진행률 계산
  - 시간 추정
  - 오류 처리

#### DatabaseViewModel
- **역할**: 데이터베이스 뷰 상태 관리
- **기능**:
  - 페이지네이션
  - 정렬/필터링
  - 선택 항목 관리
  - 데이터 내보내기/가져오기

#### LogViewModel
- **역할**: 로그 뷰어 상태 관리
- **기능**:
  - 로그 필터링
  - 자동 스크롤
  - 표시 설정
  - 로그 내보내기

#### UIStateViewModel
- **역할**: 전역 UI 상태 관리
- **기능**:
  - 탭 관리
  - 레이아웃 설정
  - 모달/알림 관리
  - 네비게이션 상태

### 2. ViewModelProvider

ViewModels의 생성과 의존성 주입을 담당하는 React Context Provider:

```typescript
export const ViewModelProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const viewModels = useMemo(() => ({
    configurationViewModel: new ConfigurationViewModel(),
    crawlingWorkflowViewModel: new CrawlingWorkflowViewModel(),
    databaseViewModel: new DatabaseViewModel(databaseStore, logStore),
    logViewModel: new LogViewModel(logStore),
    uiStateViewModel: new UIStateViewModel(uiStore)
  }), []);

  return (
    <ViewModelContext.Provider value={viewModels}>
      {children}
    </ViewModelContext.Provider>
  );
};
```

### 3. 마이그레이션된 컴포넌트

#### CrawlingSettings.tsx
- **이전**: SessionConfigManager 직접 사용
- **이후**: ConfigurationViewModel 사용
- **개선사항**:
  - 반응형 상태 관리
  - 자동 유효성 검증
  - 일관된 오류 처리
  - 깔끔한 코드 구조

#### CrawlingSettingsNew.tsx
- **이전**: SessionConfigManager 직접 사용
- **이후**: ConfigurationViewModel 사용
- **개선사항**:
  - 동일한 ViewModel 인터페이스 사용
  - 코드 중복 제거
  - 일관된 사용자 경험

## 주요 개선 사항

### 1. 관심사의 분리
- UI 컴포넌트는 화면 표시에만 집중
- ViewModels은 상태 관리와 비즈니스 로직 담당
- Services는 데이터 접근과 외부 API 호출 담당

### 2. 테스트 가능성 향상
- ViewModels은 독립적으로 테스트 가능
- 의존성 주입을 통한 모킹 용이
- 단위 테스트와 통합 테스트 분리

### 3. 재사용성 증대
- ViewModels을 여러 컴포넌트에서 공유 가능
- 플랫폼 독립적인 비즈니스 로직
- 일관된 상태 관리 패턴

### 4. 유지보수성 개선
- 명확한 책임 분리
- 코드 중복 제거
- 예측 가능한 상태 변화

## MobX 통합

### Observable 상태 관리
```typescript
@observable accessor config: CrawlerConfig
@observable accessor isLoading: boolean
@observable accessor validationErrors: Record<string, string>
```

### Computed 속성
```typescript
@computed get isDirty(): boolean {
  return !isEqual(this.config, this.originalConfig);
}

@computed get isValid(): boolean {
  return Object.keys(this.validationErrors).length === 0;
}
```

### Action 메서드
```typescript
@action updateConfigurationField<K extends keyof CrawlerConfig>(
  field: K, 
  value: CrawlerConfig[K]
) {
  this.config[field] = value;
  this.validateField(field, value);
}
```

## 호환성 유지

기존 SessionConfigManager 인터페이스와의 호환성을 위해 wrapper 메서드 제공:

```typescript
// ConfigurationViewModel
getEffectiveValue<K extends keyof CrawlerConfig>(key: K): CrawlerConfig[K] {
  return this.config[key];
}

clearErrorState(): void {
  this.clearError();
}

saveConfig(config?: CrawlerConfig): Promise<void> {
  return this.save(config);
}
```

## 성능 최적화

### React.memo와 observer 활용
```typescript
export const CrawlingSettings = observer(() => {
  const configurationViewModel = useConfigurationViewModel();
  // 컴포넌트 로직
});
```

### 선택적 리렌더링
- MobX의 반응형 시스템으로 필요한 부분만 업데이트
- 불필요한 리렌더링 방지
- 메모리 사용량 최적화

## 향후 확장 계획

### 1. 추가 ViewModels
- ProgressViewModel: 진행률 상세 관리
- SettingsViewModel: 애플리케이션 설정 관리
- NotificationViewModel: 알림 시스템 관리

### 2. 고급 기능
- Undo/Redo 기능
- 상태 영속화
- 오프라인 지원
- 실시간 동기화

### 3. 개발자 도구
- ViewModel 상태 디버거
- 성능 모니터링
- 자동 테스트 생성

## 결론

ViewModel 패턴 구현으로 다음과 같은 목표를 달성했습니다:

1. **코드 품질 향상**: 명확한 아키텍처와 관심사 분리
2. **개발 생산성 증대**: 재사용 가능한 컴포넌트와 로직
3. **유지보수성 개선**: 예측 가능하고 테스트 가능한 코드
4. **사용자 경험 향상**: 반응형 UI와 일관된 상태 관리

이 패턴은 애플리케이션의 복잡성 증가에 대비한 견고한 기반을 제공하며, 향후 기능 확장과 유지보수를 크게 개선할 것입니다.
