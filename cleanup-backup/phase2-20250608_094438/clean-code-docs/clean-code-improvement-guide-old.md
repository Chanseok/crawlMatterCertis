# Clean Code 완성도 개선 가이드

> **목표**: SW 구조 관점에서 더 이상 리팩토링을 할 필요가 없을 정도로 훌륭한 모범적인 설계와 CleanCode에 부합하는 구현 달성

## 📊 현재 상태 분석

### ✅ 잘 구현된 부분
- **Clean Architecture 3계층 구조**: UI-Domain-Infrastructure 분리가 명확
- **공유 타입 시스템**: [`types.d.ts`](../../../types.d.ts)를 통한 일관된 타입 정의
- **IPC 매뉴얼**: documents/ElectronIPCManual.md에 명시된 체계적 원칙
- **ConfigManager 패턴**: 설정 관리 일원화
- **ViewModel 패턴**: 일부 영역에서 성공적 적용

### 🔴 개선 필요 영역 (완성도: 80% → 100%)

**주요 refinement 방향**: 
애플리케이션의 복잡성이 목적에 비해 과도하다는 문제를 해결하기 위해, **타입 정의 중복 제거**와 **모던 TypeScript 타입 시스템**을 활용한 컴팩트한 구조로 개선.

## 🎯 Phase별 개선 계획 (Architecture Refinement)

---

## 📋 Phase 1: 타입 시스템 통합 (Type System Consolidation)

## 📋 Phase 1: 타입 시스템 통합 (Type System Consolidation)

### 1.1 중복 타입 정의 제거

**문제점**: 여러 파일에 분산된 중복 타입 정의로 인한 복잡성 증가

**개선 대상**:
- [ ] `types.d.ts` - 모든 도메인 타입 통합
- [ ] 컴포넌트별 중복 타입 정의 제거
- [ ] 모던 TypeScript 타입 시스템 활용

**구현 방안**:
```typescript
// 1. Clean Domain Types (Compact & Modern)
type CrawlingStage = 'status-check' | 'product-list' | 'product-detail' | 'db-comparison';
type CrawlingStatus = 'pending' | 'running' | 'completed' | 'failed' | 'stopping';

interface StageProgress {
  readonly stage: CrawlingStage;
  readonly current: number;
  readonly total: number;
  readonly status: CrawlingStatus;
  readonly timestamp: number;
}

// 2. Modern TypeScript Features
type CrawlingConfig = {
  readonly timeouts: {
    readonly page: number;
    readonly productDetail: number;
  };
  readonly retry: {
    readonly maxAttempts: number;
    readonly delay: number;
  };
} & BaseConfig;

// 3. UI Component Type Extensions
type ComponentProps<T = {}> = T & {
  readonly className?: string;
  readonly testId?: string;
};
```

### 1.2 UI 컴포넌트 타입 확장 시스템

**구현 방안**:
```typescript
// Modern TypeScript UI Type System
type ButtonVariant = 'primary' | 'secondary' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ComponentProps {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly disabled?: boolean;
  readonly loading?: boolean;
  readonly onClick?: () => void;
  readonly children: React.ReactNode;
}

// Conditional types for advanced scenarios
type ConditionalProps<T extends CrawlingStatus> = 
  T extends 'running' ? { onStop: () => void } :
  T extends 'stopping' ? { showOverlay: true } :
  { onStart?: () => void };
```

---

## 📋 Phase 2: ViewModel 패턴 완성 (Complete ViewModel Pattern)

## 📋 Phase 2: ViewModel 패턴 완성 (Complete ViewModel Pattern)

### 2.1 BaseViewModel 추상 클래스 완성

**구현 대상**:
- [ ] BaseViewModel 추상 클래스 생성
- [ ] ConfigurationViewModel 구현
- [ ] LocalDbViewModel 구현

**구현 방안**:
```typescript
// 1. BaseViewModel 추상 클래스
abstract class BaseViewModel {
  protected readonly disposers: (() => void)[] = [];
  
  abstract initialize(): Promise<void>;
  abstract cleanup(): void;
  
  protected addDisposer(disposer: () => void): void {
    this.disposers.push(disposer);
  }
  
  public dispose(): void {
    this.disposers.forEach(disposer => disposer());
    this.disposers.length = 0;
    this.cleanup();
  }
}

// 2. ConfigurationViewModel
class ConfigurationViewModel extends BaseViewModel {
  @observable accessor config: CrawlingConfig | null = null;
  @observable accessor isLoading = false;
  @observable accessor error: string | null = null;
  
  async loadConfiguration(): Promise<void> { /* 구현 */ }
  async saveConfiguration(config: CrawlingConfig): Promise<void> { /* 구현 */ }
}

// 3. LocalDbViewModel
class LocalDbViewModel extends BaseViewModel {
  @observable accessor connectionStatus: 'connected' | 'disconnected' | 'error' = 'disconnected';
  @observable accessor dbPath: string | null = null;
  
  async connect(path: string): Promise<void> { /* 구현 */ }
  async disconnect(): Promise<void> { /* 구현 */ }
}
```

---

## 📋 Phase 3: 아키텍처 일관성 강화 (Architecture Consistency)

### 1.3 중복 코드 제거

**중복 발견 영역**:
- [ ] Config 읽기 로직이 여러 클래스에 분산
- [ ] 타임아웃 처리가 각 크롤러마다 별도 구현
- [ ] 진행률 계산 로직이 여러 곳에서 중복

**구현 방안**:
```typescript
// 공통 유틸리티 클래스 통합
class CrawlingUtils {
  // 재시도 로직 통합
  static async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delay: number = 1000
  ): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        if (attempt === maxRetries) throw error;
        await new Promise(resolve => setTimeout(resolve, delay * attempt));
      }
    }
    throw new Error('Max retries exceeded');
  }
  
  // 진행률 계산 통합
  static calculateProgress(current: number, total: number): number {
    return total > 0 ? Math.round((current / total) * 100) : 0;
  }
  
  // 시간 포맷팅 통합
  static formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) return `${hours}시간 ${minutes % 60}분`;
    if (minutes > 0) return `${minutes}분 ${seconds % 60}초`;
    return `${seconds}초`;
  }
  
  // 페이지 범위 검증 통합
  static validatePageRange(start: number, end: number, max: number): boolean {
    return start >= 0 && end >= start && end <= max;
  }
}
```

---

## 📋 Phase 2: UI 컴포넌트 최적화 (Medium Priority)

### 2.1 컴포넌트 책임 분리

**문제점**: 일부 UI 컴포넌트가 너무 많은 책임을 담당

**개선 대상**:
- [ ] `CrawlingDashboard.tsx` - 단일 책임 원칙 적용
- [ ] `SettingsTab.tsx` - 설정 로직과 UI 분리
- [ ] `LocalDbTab.tsx` - 데이터 로직과 UI 분리

**구현 방안**:
```typescript
// 1. Container-Presenter 패턴 적용
// CrawlingDashboardContainer.tsx (로직)
const CrawlingDashboardContainer: React.FC = () => {
  const viewModel = useCrawlingViewModel();
  
  return <CrawlingDashboardPresenter viewModel={viewModel} />;
};

// CrawlingDashboardPresenter.tsx (UI)
interface Props {
  viewModel: CrawlingViewModel;
}

const CrawlingDashboardPresenter: React.FC<Props> = ({ viewModel }) => {
  // 순수 UI 렌더링만 담당
};
```

### 2.2 상태 관리 최적화

**개선 대상**:
- [ ] 불필요한 리렌더링 방지
- [ ] 메모이제이션 적용
- [ ] 상태 정규화

**구현 방안**:
```typescript
// useMemo, useCallback 적절한 사용
const CrawlingProgress: React.FC = () => {
  const { progress } = useCrawlingStore();
  
  const progressPercentage = useMemo(() => 
    CrawlingUtils.calculateProgress(progress.current, progress.total),
    [progress.current, progress.total]
  );
  
  const formatTime = useCallback((ms: number) => 
    CrawlingUtils.formatDuration(ms),
    []
  );
  
  return (
    <div>
      <ProgressBar percentage={progressPercentage} />
      <TimeDisplay formatter={formatTime} />
    </div>
  );
};
```

---

## 📋 Phase 3: 성능 및 안정성 개선 (Low Priority)

### 3.1 세션 기반 Configuration 관리 강화

**개선 대상**:
- [ ] Runtime 설정 변경 즉시 반영
- [ ] 크롤링 세션 중 설정 불일치 방지

### 3.2 브라우저 관리 최적화

**개선 대상**:
- [ ] Context별 브라우저 인스턴스 관리
- [ ] 메모리 리크 방지
- [ ] 타임아웃 처리 개선

### 3.3 DB 비교 단계 완성

**개선 대상**:
- [ ] 1단계와 2단계 사이 DB 비교 로직 구현
- [ ] UI 표현 최적화

---

## 🔧 개선 작업 가이드라인

### 코드 품질 체크리스트

#### ✅ Clean Code 원칙
- [ ] **단일 책임 원칙**: 각 클래스/함수가 하나의 책임만 담당
- [ ] **개방-폐쇄 원칙**: 확장에는 열려있고 수정에는 닫혀있음
- [ ] **의존성 역전 원칙**: 고수준 모듈이 저수준 모듈에 의존하지 않음
- [ ] **DRY 원칙**: 중복 코드 제거
- [ ] **KISS 원칙**: 불필요한 복잡성 제거

#### ✅ TypeScript 타입 안정성
- [ ] `any` 타입 사용 금지
- [ ] 모든 함수에 명시적 반환 타입
- [ ] Union 타입 적절한 사용
- [ ] Interface 우선, Type alias 보조적 사용

#### ✅ React 성능 최적화
- [ ] 불필요한 리렌더링 방지
- [ ] 적절한 메모이제이션
- [ ] Key prop 올바른 사용
- [ ] 컴포넌트 분할 최적화

#### ✅ MobX 상태 관리
- [ ] Observable 상태 최소화
- [ ] Action을 통한 상태 변경
- [ ] Computed 값 적절한 사용
- [ ] Reaction 정리 확실히

---

## 📝 작업 진행 시 주의사항

1. **점진적 개선**: 한 번에 여러 영역을 동시에 변경하지 않기
2. **기존 구조 유지**: 전체 SW 구조는 견고하게 유지
3. **IPC 원칙 준수**: documents/ElectronIPCManual.md 원칙 따르기
4. **타입 체계 일관성**: 기존 types.d.ts 패턴 유지
5. **테스트 확인**: 각 개선 후 기능 동작 확인

---

## 📚 참고 문서

- [ElectronIPCManual.md](../development/ElectronIPCManual.md)
- [Architecture Overview](../architecture/)
- [Refactoring History](../refactoring/)

---

**마지막 업데이트**: 2025년 6월 2일  
**완성도**: 80% → 100% 목표  
**예상 작업 기간**: 2-3주
