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

## 🎯 Phase별 개선 계획

---

## 📋 Phase 1: 데이터 흐름 최적화 (High Priority)

### 1.1 진행 상황 업데이트 시스템 개선

**문제점**: Backend → Frontend IPC → ViewModel → UI 체인에서 데이터 동기화 불일치

**개선 대상**:
- [ ] `src/stores/store.ts` - 복잡한 CrawlingProgress 인터페이스 단순화
- [ ] `src/electron/main.ts` - IPC 메시지 전송 타이밍 최적화
- [ ] `src/ui/components/CrawlingDashboard.tsx` - 실시간 업데이트 로직 개선

**구현 방안**:
```typescript
// 1. 단계별 진행 상황 타입 분리
interface StageProgress {
  stageId: 'status-check' | 'product-list' | 'product-detail' | 'db-comparison';
  current: number;
  total: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startTime?: Date;
  endTime?: Date;
}

// 2. Throttling 메커니즘 도입
class ProgressManager {
  private readonly UPDATE_THROTTLE = 100; // ms
  private lastUpdateTime = new Map<string, number>();
  
  updateProgress(stageId: string, progress: StageProgress): void {
    const now = Date.now();
    const lastUpdate = this.lastUpdateTime.get(stageId) || 0;
    
    if (now - lastUpdate >= this.UPDATE_THROTTLE) {
      this.sendToRenderer(progress);
      this.lastUpdateTime.set(stageId, now);
    }
  }
}
```

### 1.2 ViewModel 패턴 완전 도입

**미완성 영역**:
- [ ] 설정 관리 ViewModel 부재
- [ ] 에러 처리 ViewModel 분산
- [ ] 로컬DB 관리 ViewModel 부재

**구현 방안**:
```typescript
// 1. BaseViewModel 추상 클래스
abstract class BaseViewModel {
  protected state: ObservableState;
  protected disposers: (() => void)[] = [];
  
  abstract initialize(): Promise<void>;
  abstract cleanup(): void;
  
  protected addDisposer(disposer: () => void): void {
    this.disposers.push(disposer);
  }
}

// 2. 설정 관리 ViewModel
class ConfigurationViewModel extends BaseViewModel {
  @observable config: CrawlerConfig | null = null;
  @observable isLoading = false;
  @observable error: string | null = null;
  
  async loadConfiguration(): Promise<void> { /* 구현 */ }
  async saveConfiguration(config: CrawlerConfig): Promise<void> { /* 구현 */ }
}

// 3. 에러 처리 ViewModel
class ErrorHandlingViewModel extends BaseViewModel {
  @observable errors: ErrorInfo[] = [];
  @observable notifications: NotificationInfo[] = [];
  
  addError(error: ErrorInfo): void { /* 구현 */ }
  clearErrors(): void { /* 구현 */ }
}
```

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
