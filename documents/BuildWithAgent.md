# Matter 인증 정보 수집기 개발 기록

## 개발 개요

이 문서는 Matter 인증 정보 수집기(crawlMatterCertis) 프로젝트의 개발 과정과 핵심 내용을 정리한 것입니다. 이 프로젝트는 Electron과 React 기반의 크로스 플랫폼 데스크톱 애플리케이션으로, Matter 인증 정보를 자동으로 크롤링하여 수집하고 관리하는 기능을 제공합니다.

## 기술 스택

프로젝트에 사용된 주요 기술 스택은 다음과 같습니다:

- **프론트엔드**: React, Tailwind CSS
- **백엔드**: Electron (Node.js)
- **상태 관리**: nanostores
- **데이터베이스**: SQLite (better-sqlite3)
- **크롤링**: Playwright
- **데이터 내보내기**: ExcelJS
- **유틸리티**: date-fns, zod, nanoid

## 프로젝트 구조

프로젝트는 크게 두 부분으로 나뉩니다:

1. **UI 레이어 (src/ui)**: React 기반의 사용자 인터페이스
2. **백엔드 레이어 (src/electron)**: Electron 기반의 메인 프로세스

### 주요 파일 구조

```
src/
  electron/             # Electron 메인 프로세스 코드
    main.ts             # 애플리케이션의 진입점
    preload.cts         # 렌더러 프로세스와 통신하기 위한 프리로드 스크립트
    pathResolver.ts     # 파일 경로 처리 유틸리티
    resourceManager.ts  # 리소스 관리
    util.ts             # 유틸리티 함수
    tsconfig.json       # Electron 전용 TypeScript 설정
  
  ui/                   # React UI 레이어
    App.tsx             # 메인 React 애플리케이션 컴포넌트
    stores.ts           # nanostores 기반 상태 관리
    types.ts            # TypeScript 타입 정의
    platform/
      api.ts            # 플랫폼 독립적인 API 인터페이스
```

## 주요 구현 내용

### 1. 프론트엔드 UI 구현

Matter 인증 정보 수집기의 UI는 다음과 같은 주요 구성요소로 설계되었습니다:

1. **모드 전환 (개발/실사용 모드)**
   - 헤더에 모드 토글 버튼을 배치하여 개발 모드와 실사용 모드 간의 전환을 용이하게 함
   - 각 모드에 따라 다른 동작 방식과 시각적 피드백 제공

2. **크롤링 제어 패널**
   - 크롤링 시작/중지 버튼
   - 진행 상황을 시각화한 프로그레스 바
   - 예상 남은 시간 및 현재 단계 표시

3. **로그 패널**
   - 타입별(정보, 경고, 오류, 성공) 로그 메시지 표시
   - 최신 로그가 상단에 표시되도록 역순 정렬
   - 시간 정보와 함께 로그 메시지 제공

4. **데이터 테이블**
   - 수집된 Matter 인증 제품 정보를 테이블 형태로 표시
   - 검색 기능을 통한 데이터 필터링
   - 페이지네이션 지원 (향후 구현 예정)

5. **데이터 내보내기**
   - Excel 형식으로 데이터를 내보내는 기능
   - 크롤링 중에는 내보내기 기능 비활성화

### 2. 상태 관리 구현

nanostores를 활용한 상태 관리 방식을 구현했습니다:

1. **주요 스토어**
   - `appModeStore`: 개발/실사용 모드 상태
   - `crawlingStatusStore`: 크롤링 상태 (idle, running, paused, completed, error)
   - `crawlingProgressStore`: 크롤링 진행 상태
   - `logsStore`: 로그 메시지 목록
   - `productsStore`: 수집된 제품 데이터
   - `searchQueryStore`: 검색어
   - `databaseSummaryStore`: 데이터베이스 요약 정보

2. **주요 액션**
   - `startCrawling()`: 크롤링 시작
   - `stopCrawling()`: 크롤링 중지
   - `addLog()`: 로그 메시지 추가
   - `exportToExcel()`: 데이터 내보내기
   - `searchProducts()`: 제품 검색
   - `toggleAppMode()`: 앱 모드 전환

### 3. 플랫폼 독립적인 API 인터페이스

향후 Tauri 등 다른 플랫폼으로의 마이그레이션을 고려하여 플랫폼 독립적인 API 인터페이스를 설계했습니다:

1. **IPlatformAPI 인터페이스**
   - `subscribeToEvent()`: 이벤트 구독
   - `invokeMethod()`: 메소드 호출

2. **Electron API 어댑터**
   - Electron IPC 통신을 추상화하여 표준 인터페이스로 제공
   - 비동기 통신 방식 지원

3. **이벤트 및 메소드 정의**
   - 크롤링 진행 상황, 오류, 완료 등의 이벤트
   - 크롤링 시작/중지, 데이터 조회, 내보내기 등의 메소드

### 4. 타입 시스템 설계

TypeScript를 활용하여 강력한 타입 시스템을 설계했습니다:

1. **데이터 모델**
   ```typescript
   interface MatterProduct {
     id: string;
     manufacturer: string;
     model: string;
     deviceType: string;
     certificationId: string;
     certificationDate: string;
     // 기타 필드
   }
   ```

2. **상태 및 이벤트 타입**
   ```typescript
   type AppMode = 'development' | 'production';
   type CrawlingStatus = 'idle' | 'running' | 'paused' | 'completed' | 'error';
   
   interface LogEntry {
     timestamp: Date;
     message: string;
     type: 'info' | 'warning' | 'error' | 'success';
   }
   
   interface CrawlingProgress {
     current: number;
     total: number;
     percentage: number;
     currentStep: string;
     remainingTime?: number;
     elapsedTime: number;
   }
   ```

3. **API 인터페이스 타입**
   ```typescript
   interface EventPayloadMapping {
     'statistics': Statistics;
     'crawlingProgress': CrawlingProgress;
     'crawlingComplete': { success: boolean; count: number };
     'crawlingError': { message: string; details?: string };
     // 기타
   }
   
   interface MethodParamsMapping {
     'startCrawling': { mode: AppMode };
     'stopCrawling': void;
     'exportToExcel': { path?: string };
     // 기타
   }
   ```

## Mock 데이터를 활용한 개발/실사용 모드 구현

프로젝트 요구사항에 따라 백엔드가 완전히 구현되지 않은 상태에서도 UI 개발 및 테스트를 진행할 수 있도록 Mock 데이터 시스템을 구현했습니다. 이를 통해 개발자는 실제 백엔드 없이도 애플리케이션의 전체 흐름을 테스트할 수 있게 되었습니다.

### 문제 상황

애플리케이션을 `npm run dev` 명령어로 실행했을 때 다음과 같은 문제가 발생했습니다:

1. **화면이 비어 있음**: 애플리케이션이 실행되지만 화면에 아무것도 표시되지 않는 "white blank page" 문제 발생
2. **백엔드 연결 실패**: 백엔드 API가 구현되지 않아 데이터 로드 실패
3. **오류 처리 미흡**: API 호출 실패 시 적절한 대체 콘텐츠 표시 부재

### 해결 방안 구현

#### 1. Mock 데이터 서비스 구현

백엔드 구현 없이도 UI를 테스트할 수 있는 Mock 데이터 서비스를 구현했습니다:

```typescript
// src/ui/services/mockData.ts
export const mockProducts: MatterProduct[] = [
  {
    id: 'mock-1',
    manufacturer: 'MMD HONG KONG HOLDING LIMITED',
    model: 'Philips 43PUS8909',
    // ... 기타 필드
  },
  // ... 더 많은 샘플 데이터
];

// 더 많은 Mock 제품 데이터 생성 함수
export const generateMoreMockProducts = (count: number = 20): MatterProduct[] => {
  // 다양한 제조사, 기기 유형 등을 사용하여 무작위 데이터 생성
};

// 크롤링 시뮬레이션 함수
export const simulateCrawling = (
  onProgress: (progress: CrawlingProgress) => void,
  onComplete: (success: boolean, count: number) => void,
  onError?: (message: string, details?: string) => void
): (() => void) => {
  // 크롤링 과정을 시간 경과에 따라 시뮬레이션
};

// 검색 및 데이터 내보내기 시뮬레이션 함수들
export const simulateSearch = (query: string, page: number = 1, limit: number = 20) => {
  // 검색 기능 시뮬레이션
};

export const simulateExportToExcel = () => {
  // Excel 내보내기 시뮬레이션
};
```

#### 2. Mock API 어댑터 구현

Mock 데이터를 활용하는 API 어댑터를 구현하여 개발 모드에서 사용할 수 있도록 했습니다:

```typescript
// src/ui/platform/api.ts
class MockApiAdapter implements IPlatformAPI {
  private eventHandlers: Map<string, Set<(data: any) => void>> = new Map();
  private crawlingStopper: (() => void) | null = null;

  // 이벤트 구독 메서드
  subscribeToEvent<K extends keyof EventPayloadMapping>(
    eventName: K,
    callback: (data: EventPayloadMapping[K]) => void
  ): UnsubscribeFunction {
    // 구독 처리 및 초기 데이터 전송
  }

  // 메서드 호출 처리
  async invokeMethod<K extends keyof MethodParamsMapping, R = MethodReturnMapping[K]>(
    methodName: K,
    params?: MethodParamsMapping[K]
  ): Promise<R> {
    // 다양한 API 메서드 시뮬레이션
  }

  // 이벤트 발생 메서드 (내부용)
  private emitEvent<K extends keyof EventPayloadMapping>(
    eventName: K, 
    data: EventPayloadMapping[K]
  ): void {
    // 등록된 콜백에 이벤트 데이터 전달
  }
}
```

#### 3. 모드 선택 메커니즘 구현

개발 모드와 실사용 모드를 전환할 수 있는 메커니즘을 구현했습니다:

```typescript
// src/ui/platform/api.ts
// 현재 앱 모드와 API 선택을 위한 상태 변수
let useMockApiInDevelopment = true;
let currentAppMode: AppMode = 'development';

// 플랫폼 감지 및 적절한 API 어댑터 초기화
function detectPlatformAndInitApi(): IPlatformAPI {
  // 개발 모드에서 Mock API 사용
  if (useMockApiInDevelopment && currentAppMode === 'development') {
    return new MockApiAdapter();
  }
  
  // 실사용 모드나 Mock API를 사용하지 않는 경우
  if (window.electron) {
    return new ElectronApiAdapter();
  }
  
  // 플랫폼이 감지되지 않았다면 Mock API로 폴백
  return new MockApiAdapter();
}

// 앱 모드 변경 시 API 재초기화
export function updateApiForAppMode(mode: AppMode): IPlatformAPI {
  currentAppMode = mode;
  currentPlatformAPI = detectPlatformAndInitApi();
  return currentPlatformAPI;
}
```

#### 4. 상태 관리 개선

모드 변경 시 API가 재초기화되고 새로운 데이터를 로드하도록 상태 관리 코드를 개선했습니다:

```typescript
// src/ui/stores.ts
// 앱 모드 전환 함수
export function toggleAppMode(): void {
  const currentMode = appModeStore.get();
  const newMode = currentMode === 'development' ? 'production' : 'development';
  
  appModeStore.set(newMode);
  
  // 모드 변경에 따라 API 재초기화
  api = updateApiForAppMode(newMode);
  
  // 구독 및 데이터 다시 로드
  initializeApiSubscriptions();
  
  addLog(`앱 모드가 ${newMode === 'development' ? '개발' : '실사용'} 모드로 변경되었습니다.`, 'info');
}
```

#### 5. 오류 처리 강화

API 호출 실패 시에도 UI가 적절히 표시되도록 오류 처리를 개선했습니다:

```typescript
// src/ui/stores.ts
// 초기 데이터 로드
async function loadInitialData() {
  try {
    // 데이터베이스 요약 정보 가져오기
    const dbSummary = await api.invokeMethod('getDatabaseSummary')
      .catch(err => {
        console.warn('Failed to load database summary:', err);
        return {
          totalProducts: 0,
          lastUpdated: null,
          newlyAddedCount: 0
        };
      });
      
    databaseSummaryStore.set(dbSummary);
    
    // 제품 목록 가져오기
    const { products, total } = await api.invokeMethod('getProducts', { limit: 100, page: 1 })
      .catch(err => {
        console.warn('Failed to load products:', err);
        return { products: [], total: 0 };
      });
      
    productsStore.set(products);
    
    // 적절한 로그 메시지 표시
    if (products.length > 0) {
      addLog(`데이터베이스에서 ${products.length}개의 제품 정보를 불러왔습니다. (총 ${total}개 중)`, 'info');
    } else {
      addLog('데이터베이스에 제품 정보가 없습니다. 크롤링을 시작하여 데이터를 수집하세요.', 'info');
    }
  } catch (error) {
    console.error('Error loading initial data:', error);
    addLog(`초기 데이터 로드 중 오류 발생: ${error instanceof Error ? error.message : String(error)}`, 'error');
  }
}
```

## 효율적인 코드 유지보수와 경고 해결 방법

개발 과정에서는 종종 VS Code의 Problems 탭에서 다양한 경고나 오류 메시지를 접하게 됩니다. 이러한 경고들은 기능적 문제를 일으키지 않더라도 코드 품질과 유지보수성에 영향을 미칩니다. 프로젝트 과정에서 마주친 `'total' is declared but its value is never read.` 경고를 해결하는 과정을 통해 효율적인 코드 유지보수 접근 방법에 대해 살펴보겠습니다.

### 미사용 변수 문제와 해결 방안

#### 1. 문제 상황

`stores.ts` 파일에서 API 호출 결과를 구조 분해 할당하는 부분에서 다음과 같은 코드가 있었습니다:

```typescript
const { products, total } = await api.invokeMethod('getProducts', { limit: 100, page: 1 })
```

이 코드에서 `total` 변수를 선언했지만 실제로 사용하지 않아 TypeScript가 경고를 표시했습니다. 이러한 경고는 코드의 품질 지표에 영향을 미치며, 유지보수 과정에서 혼란을 초래할 수 있습니다.

#### 2. 가능한 해결 방안 분석

이러한 문제를 해결하기 위한 여러 가지 접근 방법을 고려해 볼 수 있습니다:

1. **변수 제거**: 가장 단순한 방법으로, 사용하지 않는 변수를 구조 분해 할당에서 제외하는 것입니다.
   ```typescript
   const { products } = await api.invokeMethod('getProducts', { limit: 100, page: 1 })
   ```

2. **언더스코어 사용**: API 응답 구조는 유지하면서, 변수를 사용하지 않음을 명시적으로 표현합니다.
   ```typescript
   const { products, total: _ } = await api.invokeMethod('getProducts', { limit: 100, page: 1 })
   ```

3. **변수 활용하기**: 선언된 변수를 실제로 사용하여 사용자 경험을 개선합니다.
   ```typescript
   addLog(`데이터베이스에서 ${products.length}개의 제품 정보를 불러왔습니다. (총 ${total}개 중)`, 'info');
   ```

4. **TSLint/ESLint 설정 변경**: 특정 변수에 대해 미사용 경고를 무시하도록 설정합니다.
   ```typescript
   // eslint-disable-next-line @typescript-eslint/no-unused-vars
   const { products, total } = await api.invokeMethod('getProducts', { limit: 100, page: 1 })
   ```

#### 3. 선택한 해결책과 그 이유

이 프로젝트에서는 **변수 활용하기** 방안을 선택했습니다. 단순히 경고를 제거하는 것이 아니라, `total` 변수를 로그 메시지에 포함시켜 사용자에게 더 유용한 정보를 제공하도록 했습니다:

```typescript
if (products.length > 0) {
  addLog(`데이터베이스에서 ${products.length}개의 제품 정보를 불러왔습니다. (총 ${total}개 중)`, 'info');
} else {
  addLog('데이터베이스에 제품 정보가 없습니다. 크롤링을 시작하여 데이터를 수집하세요.', 'info');
}
```

이 접근 방식을 선택한 이유는 다음과 같습니다:

1. **사용자 경험 개선**: 전체 데이터 대비 현재 로드된 데이터 비율에 대한 맥락을 제공합니다.
2. **API 일관성 유지**: API 응답 구조를 그대로 활용하여 코드의 일관성을 유지합니다.
3. **확장성**: 향후 페이지네이션 기능 구현 시 `total` 값을 활용할 수 있습니다.
4. **코드 품질 향상**: 미사용 변수 경고를 의미 있게 해결하여 코드 품질을 개선합니다.

추가로, `searchProducts()` 함수에서도 동일한 방식을 적용하여 일관성을 유지했습니다:

```typescript
if (query) {
  addLog(`검색 결과: ${products.length}개 항목 (총 ${total}개 중)`, 'info');
}
```

### 교훈 및 모범 사례

이 경험을 통해 얻은 교훈과 모범 사례는 다음과 같습니다:

1. **경고도 중요한 신호**: 컴파일러 경고는 실행 시 오류를 일으키지 않더라도, 코드 품질과 유지보수성에 영향을 미치므로 적극적으로 해결해야 합니다.

2. **기회로 활용하기**: 단순히 경고를 제거하는 것이 아니라, 코드를 개선하거나 기능을 추가할 기회로 활용하세요.

3. **맥락 고려하기**: 변수가 사용되지 않는 이유와 API의 원래 의도를 고려하여 가장 적합한 해결책을 선택해야 합니다.

4. **일관성 유지하기**: 코드베이스 전체에서 유사한 문제는 동일한 방식으로 해결하여 일관성을 유지하세요.

5. **미래 고려하기**: 현재 사용하지 않는 변수도 향후 기능 확장 시 필요할 수 있으므로, 삭제보다는 활용 방안을 고려하는 것이 좋습니다.

이러한 접근 방식은 단순한 코드 수정을 넘어, 프로젝트의 장기적인 품질과 사용자 경험을 향상시키는 데 기여합니다. 특히 팀 프로젝트나 오픈 소스 프로젝트에서는 이러한 세심한 관리가 코드베이스의 건강성을 유지하는 데 중요합니다.

### 구현의 소프트웨어 아키텍처적 이점

이번 Mock 데이터 및 모드 전환 시스템 구현을 통해 다음과 같은 아키텍처적 이점을 얻었습니다:

#### 1. 관심사 분리

- **데이터 제공 계층**: Mock 데이터 서비스
- **API 통신 계층**: 플랫폼 API 어댑터
- **상태 관리 계층**: nanostores 기반 스토어
- **UI 렌더링 계층**: React 컴포넌트

이러한 관심사 분리는 각 계층의 독립적인 개발과 테스트를 가능하게 하며, 코드 유지보수성을 크게 향상시킵니다.

#### 2. 코드 재사용성

Mock 데이터 생성과 실제 API 통신이 동일한 인터페이스를 사용함으로써 코드 재사용성이 높아졌습니다. 또한 개발/테스트 환경에서 사용하는 코드와 실제 환경에서 사용하는 코드의 중복을 최소화했습니다.

#### 3. 확장성

어댑터 패턴과 디펜던시 인젝션을 활용하여 시스템의 확장성을 대폭 향상시켰습니다. 새로운 데이터 소스나 API가 추가되더라도 기존 코드 변경 없이 새로운 어댑터를 추가하는 것만으로 대응이 가능합니다.

#### 4. 테스트 용이성

Mock 데이터 시스템 덕분에 백엔드 구현 없이도 UI 컴포넌트와 상태 관리 로직을 쉽게 테스트할 수 있게 되었습니다. 이는 테스트 주도 개발(TDD)을 더 효과적으로 수행할 수 있게 해줍니다.

### 향후 개선 사항

Mock 데이터 시스템을 기반으로 한 개발/실사용 모드 구현은 현재 단계에서 애플리케이션의 기능 개발을 가속화하는 데 도움이 되었지만, 다음과 같은 영역에서 추가 개선이 필요합니다:

1. **백엔드와의 점진적 통합**:
   - 실제 백엔드 기능이 구현됨에 따라 점진적으로 Mock 데이터를 실제 데이터로 대체
   - 백엔드 기능 테스트를 위한 Mock/Real API 전환 UI 개선

2. **Mock 데이터의 다양성 향상**:
   - 더 다양한 시나리오 및 엣지 케이스를 테스트할 수 있는 Mock 데이터 추가
   - 특정 테스트 시나리오에 맞춘 Mock 데이터 세트 생성 기능

3. **시뮬레이션 정교화**:
   - 네트워크 지연, 오류 상황 등을 더 정교하게 시뮬레이션하는 기능 추가
   - 다양한 크롤링 시나리오(성공, 부분 성공, 실패 등)에 대한 시뮬레이션 강화

이러한 개선 사항들은 백엔드 개발과 병행하여 점진적으로 구현될 예정입니다. 특히 백엔드 구현 단계에서는 실제 데이터와 Mock 데이터 간의 원활한 전환을 통해 전체 시스템 통합 테스트를 효과적으로 진행할 수 있을 것입니다.

## 핵심 학습 포인트

이번 단계 개발을 통해 얻은 주요 학습 포인트는 다음과 같습니다:

1. **프론트엔드와 백엔드의 독립적 개발**:
   - Mock 데이터를 활용하여 프론트엔드와 백엔드를 독립적으로 개발할 수 있는 방법 학습
   - API 계약(Contract)을 먼저 정의하고 이에 맞춰 개발하는 접근 방식의 효율성 확인

2. **어댑터 패턴의 실제 적용**:
   - 타입스크립트를 활용한 인터페이스 기반 어댑터 패턴 구현 경험
   - 다양한 구현체(Mock, Electron, 향후 Tauri)를 동일 인터페이스로 처리하는 방법 학습

3. **상태 관리와 API 통합**:
   - nanostores와 같은 외부 상태 관리 라이브러리와 API 계층의 통합 방식 학습
   - 비동기 데이터 흐름 관리와 오류 처리 방법 개선

4. **개발/실사용 모드의 실제 구현**:
   - 개발자 경험(DX)과 사용자 경험(UX)을 모두 고려한 모드 전환 시스템 설계
   - 런타임에 애플리케이션 동작을 변경할 수 있는 유연한 아키텍처의 가치 인식

이러한 학습 포인트들은 향후 유사한 크로스 플랫폼 데스크톱 애플리케이션 개발에 귀중한 참고 자료가 될 것입니다.