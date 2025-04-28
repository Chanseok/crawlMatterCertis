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
    database.ts         # SQLite 데이터베이스 관리 로직
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
    services/
      devDatabaseService.ts # 개발 모드 데이터베이스 서비스 (IPC 사용)
      mockData.ts         # Mock 데이터 및 시뮬레이션 함수
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

### 5. Mock 데이터를 활용한 개발/실사용 모드 구현

프로젝트 요구사항에 따라 백엔드가 완전히 구현되지 않은 상태에서도 UI 개발 및 테스트를 진행할 수 있도록 Mock 데이터 시스템을 구현했습니다. 이를 통해 개발자는 실제 백엔드 없이도 애플리케이션의 전체 흐름을 테스트할 수 있게 되었습니다.

### 6. 개발 환경 데이터베이스 설정 (SQLite)

개발 및 테스트 단계에서 실제 크롤링 없이도 데이터를 관리하고 UI를 검증하기 위해 로컬 SQLite 데이터베이스를 설정했습니다. 이는 요구사항(FR-STORE-001, FR-STORE-003)을 충족하며, 개발 모드(FR-UI-001)에서의 데이터 처리를 가능하게 합니다.

#### 6.1. 구현 단계

1.  **SQLite 라이브러리 설치**: `sqlite3`와 타입 정의(`@types/sqlite3`)를 개발 의존성으로 추가했습니다.
    ```bash
    npm install --save-dev sqlite3 @types/sqlite3
    ```
2.  **데이터베이스 모듈 생성 (`src/electron/database.ts`)**: Electron 메인 프로세스에서 데이터베이스 관련 로직을 처리하는 전용 모듈을 생성했습니다.
    *   **초기화 (`initializeDatabase`)**: 애플리케이션 시작 시 데이터베이스 파일(`dev-database.sqlite`)이 없으면 생성하고, `products`와 `product_details` 테이블을 정의된 스키마에 따라 생성합니다.
    *   **데이터 로딩**: 테이블이 비어 있을 경우, `data-for-dev/all_matter_devices.json` 및 `data-for-dev/merged_matter_devices.json` 파일에서 데이터를 읽어와 각각 `products` 및 `product_details` 테이블을 채웁니다. 이는 개발 환경에서 즉시 테스트 가능한 데이터를 제공합니다.
    *   **CRUD 및 검색 함수**: `getProductsFromDb`, `getProductByIdFromDb`, `searchProductsInDb` 등 데이터 조회 및 검색을 위한 비동기 함수들을 구현했습니다.
    *   **요약 정보 관리**: `getDatabaseSummaryFromDb` 함수는 데이터베이스의 총 제품 수와 마지막 업데이트 정보를 제공합니다. 마지막 업데이트 정보는 별도의 `db_summary.json` 파일에 저장하여 관리합니다.
    *   **업데이트 기록 (`markLastUpdatedInDb`)**: 크롤링 완료 후 새로 추가된 항목 수를 `db_summary.json`에 기록합니다.
3.  **메인 프로세스 통합 (`src/electron/main.ts`)**: 
    *   애플리케이션 시작 시 `initializeDatabase` 함수를 호출하여 데이터베이스를 준비합니다.
    *   `ipcMain.handle`을 사용하여 데이터베이스 관련 함수들(`getProducts`, `getProductById`, `searchProducts`, `getDatabaseSummary`, `markLastUpdated`)을 렌더러 프로세스에서 호출할 수 있도록 IPC 핸들러를 등록했습니다. 타입 안전성을 위해 제네릭을 사용한 `typedIpcMainHandle` 헬퍼 함수를 도입했습니다.
4.  **프론트엔드 서비스 수정 (`src/ui/services/devDatabaseService.ts`)**: 
    *   기존에 `fetch`를 사용하던 개발용 데이터 서비스(`devDatabaseService`)를 수정하여, Electron 환경에서 `window.electron.invokeMethod`를 통해 메인 프로세스의 IPC 핸들러를 호출하도록 변경했습니다. 이는 실제 애플리케이션 환경과 유사한 방식으로 데이터를 주고받게 합니다.
5.  **타입 정의 업데이트 (`src/ui/types.ts`, `src/electron/preload.cts`)**: 
    *   `IPlatformAPI` 인터페이스와 `MethodParamsMapping`, `MethodReturnMapping` (암시적으로 `invokeMethod`의 제네릭을 통해)에 새로운 데이터베이스 관련 메서드 시그니처를 추가했습니다.
    *   `preload.cts`의 프록시 객체가 이러한 새로운 메서드 호출을 `invokeMethod`로 올바르게 라우팅하도록 했습니다.
6.  **오류 수정**: 
    *   `mockData.ts`에서 `certificateId` 속성명 오류를 `certificationId`로 수정했습니다.
    *   `database.ts`에서 `ProductDetail` 인터페이스 정의 오류 및 모듈 임포트 경로 오류를 수정했습니다.
    *   `main.ts`에서 IPC 핸들러의 타입 관련 오류를 수정했습니다.

#### 6.2. 아키텍처적 고려사항

*   **데이터 관리 분리**: 데이터베이스 관련 로직을 `database.ts` 모듈로 분리하여 메인 프로세스의 다른 책임(창 관리, 시스템 상호작용 등)과 명확히 구분했습니다.
*   **비동기 처리**: 모든 데이터베이스 작업은 비동기 함수(`async/await` 및 `Promise`)로 구현되어 메인 프로세스의 블로킹을 방지합니다.
*   **IPC 통신**: 렌더러 프로세스는 직접 데이터베이스에 접근하지 않고, 정의된 IPC 채널을 통해서만 메인 프로세스에 데이터 요청/수정을 위임합니다. 이는 보안 및 구조적 안정성을 높입니다.
*   **개발 모드 지원**: 개발 모드에서는 로컬 JSON 파일을 초기 데이터 소스로 사용하여 실제 크롤링 없이도 데이터베이스 기능을 테스트할 수 있습니다.

### 7. 효율적인 코드 유지보수와 경고 해결 방법

개발 과정에서는 종종 VS Code의 Problems 탭에서 다양한 경고나 오류 메시지를 접하게 됩니다. 이러한 경고들은 기능적 문제를 일으키지 않더라도 코드 품질과 유지보수성에 영향을 미칩니다. 프로젝트 과정에서 마주친 `'total' is declared but its value is never read.` 경고를 해결하는 과정을 통해 효율적인 코드 유지보수 접근 방법에 대해 살펴보겠습니다.

#### 미사용 변수 문제와 해결 방안

(내용 동일)

### 8. 구현의 소프트웨어 아키텍처적 이점

(내용 동일)

### 9. 향후 개선 사항

(내용 동일)

### 10. Playwright 기반 웹 크롤링 구현

Matter 인증 정보를 자동으로 수집하기 위한 크롤링 기능을 Playwright를 활용하여 구현했습니다. 이 구현은 FR-CRAWL-001, FR-CRAWL-002, FR-CRAWL-003 요구사항을 충족하고, 점진적으로 보완하여 개발했습니다.

#### 10.1. 크롤링 모듈 설계 및 구조

(내용 동일)

#### 10.2. 타입 시스템 개선

(내용 동일)

#### 10.3. 핵심 크롤링 기능 구현

(내용 동일)

#### 10.4. Electron 메인 프로세스와 통합

(내용 동일)

#### 10.5. 타입 일관성 유지 문제와 해결

(내용 동일)

#### 10.6. 추가 구현 및 향후 개발 계획

(내용 동일)

### 11. 핵심 구현 노하우 및 실전 팁

(내용 동일)

### 12. IPC 통신 안정성 개선

(내용 동일)

### 13. macOS 앱 종료 프로세스 개선

(내용 동일)

### 14. 프로덕션 모드 preload 스크립트 로딩 문제 해결

(내용 동일)

## 2025-04-28: 상태 체크 IPC 오류 해결 및 교훈, UI 개선

### 주요 구현 및 개선 내용

- **상태 체크(크롤링 상태 요약) IPC 명령어 구현**
    - Electron main 프로세스에 checkCrawlingStatus IPC 핸들러 추가
    - 크롤러에서 DB/사이트 제품 수, 차이, 마지막 업데이트 등 요약 정보 반환
    - React UI에 상태 요약 패널 추가(제품 수, 차이, 업데이트 시각 등 시각화)

- **Electron IPC 오류(An object could not be cloned) 해결**
    - 증상: 상태 체크 버튼 클릭 시 "An object could not be cloned" 오류 발생
    - 원인: main.ts에서 checkCrawlingStatus가 async 함수임에도 await 없이 호출되어 Promise 객체가 IPC로 전송됨
    - 교훈: Electron IPC에서 async 함수는 반드시 await로 호출해야 하며, Promise 객체 자체는 직렬화할 수 없어 IPC로 전송 불가
    - 해결: main.ts에서 `const status = await checkCrawlingStatus();`로 수정하여 Promise가 아닌 실제 결과 객체를 IPC로 반환하도록 함
    - 추가로, Date 객체 등 직렬화 불가 객체는 반드시 toISOString 등으로 변환하여 반환해야 함

- **mockData 완전 제거**
    - 개발/운영 모드 구분을 명확히 하고, 실제 데이터베이스/크롤러만 사용하도록 mockData 및 관련 코드, 파일 완전 삭제

- **Electron-React IPC 통신 매뉴얼 별도 문서화**
    - IPC 명령어 추가/수정/삭제, 직렬화 오류, 타입 관리 등 실무적 노하우를 문서화하여 ElectronIPCManual.md로 관리

### 실전 교훈 및 팁

- Electron IPC에서 async 함수는 반드시 await로 호출해야 한다. 그렇지 않으면 Promise 객체가 직렬화 불가 오류를 유발한다.
- Date, 함수, 순환 참조 등 직렬화 불가 객체는 IPC로 직접 전송할 수 없으므로, 항상 JSON-serializable 형태(문자열, 숫자, 배열, 객체)로 변환해야 한다.
- IPC 통신 경로(메인-프리로드-렌더러) 전체에서 타입과 직렬화 가능성, 비동기 처리 여부를 꼼꼼히 점검해야 한다.
- UI/UX 개선은 실제 사용자 관점에서 상태 요약, 진행률, 로그 등 실시간 피드백을 강화하는 것이 중요하다.
- 실수와 문제 해결 과정을 BuildWithAgent.md에 기록해두면, 이후 유사한 문제 발생 시 빠르게 대응할 수 있다.

## 2025-04-28: ESM 모듈 해결 오류 및 TypeScript 타입 시스템 개선

### 문제 발견 및 근본 원인 분석

프로젝트 코드베이스를 점검하는 과정에서 TypeScript 관련 여러 오류가 발견되었으며, 가장 핵심적인 문제는 다음과 같았습니다:

- **상대 경로 import 시 파일 확장자 명시 오류**
  ```
  Relative import paths need explicit file extensions in ECMAScript imports when '--moduleResolution' is 'node16' or 'nodenext'.
  ```
  - 원인: TypeScript의 ESM 모듈 시스템에서는 상대 경로로 파일을 import할 때 명시적인 파일 확장자(.js)를 요구함
  - 발생 위치: `/src/electron/crawler.ts`에서 `../ui/types` 파일을 import할 때 확장자 누락

- **타입 단언 과다 사용 및 타입 불일치 문제**
  - 여러 파일에서 `as any`, `as unknown as Type` 등의 타입 단언이 과도하게 사용됨
  - 타입 정의가 여러 곳에 중복되어 일관성 부족

- **isolatedModules 모드에서 타입 재내보내기(re-export) 구문 오류**
  - `export { Type }` 문법이 `isolatedModules: true` 설정과 충돌하는 문제

### 개선 방안 및 적용 내용

#### 1. 모듈 경로 개선

- **명시적 파일 확장자 추가**
  - 모든 상대 경로 import에 `.js` 확장자 추가 (TypeScript 소스 파일을 가져올 때도 결과적으로는 JS 파일이 로드되므로)
  ```typescript
  // 수정 전
  import type { CrawlingProgress } from '../ui/types';
  
  // 수정 후
  import type { CrawlingProgress } from '../ui/types.js';
  ```

- **tsconfig.json 설정 일관성 확인**
  - src/electron 폴더의 별도 tsconfig.json에서 `module: "NodeNext"` 사용 중
  - 이는 Node.js의 ESM 해석 규칙을 따라야 함을 의미

#### 2. 타입 시스템 통합 및 일관성 향상

- **types.d.ts를 모듈로 전환**
  - 기존 글로벌 타입 정의(ambient declaration)를 모듈 형태로 변경
  - 모든 타입에 export 키워드 추가하여 명시적 가져오기/내보내기 가능하도록 개선
  
- **타입 단언 최소화**
  - `as unknown as Type` 같은 위험한 타입 단언을 제거하고 타입 안전한 접근 방식 적용
  - 특히 IPC 통신 부분에서 안전한 타입 처리 강화

- **타입 재내보내기 방식 개선**
  - `isolatedModules: true` 설정에 맞게 타입 재내보내기 방식을 수정
  ```typescript
  // 수정 전
  export { AppMode, DatabaseSummary, ... };
  
  // 수정 후 
  export type { AppMode, DatabaseSummary, ... };
  ```

#### 3. 모듈 시스템 호환성 강화

- **NodeNext 모듈 해석에 맞는 파일 확장자 전략 수립**
  - TypeScript 소스 코드: `.ts`
  - 타입 정의 파일: `.d.ts`
  - Import 구문에서 참조: `.js` (런타임에는 컴파일된 JS 파일이 로드되므로)

- **타입 및 값 구분 명확화**
  - `type` 키워드로 타입 가져오기/내보내기 구분
  - 타입과 값을 혼합하여 사용하는 패턴 제거

### 근본적인 개선 효과

이번 개선을 통해 프로젝트는 다음과 같은 이점을 얻었습니다:

1. **타입 안전성 강화**: 명시적 타입 정의와 일관된 import/export 패턴을 통해 타입 오류 가능성 감소
2. **모듈 시스템 호환성 확보**: NodeNext 모듈 해석 방식과 ESM 표준에 맞는 코드베이스로 전환
3. **유지보수성 향상**: 중앙화된 타입 정의와 일관된 사용 패턴으로 코드 이해 및 수정이 용이해짐
4. **IDE 지원 개선**: 자동 완성, 네비게이션, 타입 검사 등 IDE 기능이 더 정확하게 작동

### 교훈 및 모범 사례

1. **모듈 해석 전략 이해의 중요성**
   - `moduleResolution` 설정(node, node16, bundler 등)에 따라 import 문법과 동작 방식이 크게 달라짐
   - 프로젝트 초기에 일관된 모듈 전략 수립 필요

2. **타입 정의 중앙화**
   - 가능한 한 타입을 한 곳에서 관리하고, 여러 파일에서 재정의하지 않음
   - `types.d.ts` 같은 중앙 타입 저장소를 활용

3. **타입 단언 최소화**
   - `as any` 같은 타입 단언은 타입 시스템의 이점을 무력화시키므로 최소화
   - 불가피한 경우에만 제한적으로 사용하고 주석으로 이유 명시

4. **일관된 확장자 전략**
   - `.ts`, `.js`, `.d.ts` 등의 확장자를 프로젝트 규칙에 맞게 일관되게 사용
   - 특히 ESM에서는 확장자 처리가 중요함을 인지

이러한 개선을 통해 더 안정적이고 유지보수하기 좋은 코드베이스를 구축할 수 있었으며, 향후 발생할 수 있는 타입 관련 문제들을 사전에 방지할 수 있게 되었습니다.

## 2025-04-29: CommonJS와 ESM 모듈 간 TypeScript 타입 호환성 해결

### 발생한 문제 및 근본 원인

프로젝트 실행 시 TypeScript 컴파일러에서 다음과 같은 오류가 지속적으로 발생했습니다:

```
src/electron/preload.cts:7:8 - error TS1541: Type-only import of an ECMAScript module from a CommonJS module must have a 'resolution-mode' attribute.
```

이 문제의 근본 원인은 **TypeScript 모듈 시스템의 혼합 사용**에서 비롯되었습니다:

1. **CommonJS와 ESM 모듈 간 타입 공유의 복잡성**
   - `preload.cts` (CommonJS TypeScript)에서 `types.js` (ESM)의 타입을 가져올 때 발생
   - TypeScript 5.0 이상에서 더 엄격해진 모듈 간 타입 가져오기 규칙

2. **모듈 형식에 따른 확장자 차이**
   - `.ts` - 일반 TypeScript 파일 (모듈 시스템은 tsconfig에 따라 결정)
   - `.cts` - CommonJS 모듈로 취급되는 TypeScript 파일
   - `.mts` - ESM으로 취급되는 TypeScript 파일
   - `.d.ts` - 타입 선언 파일

3. **import 속성(import attributes) 구문의 정확한 사용법 오류**
   - 구문 오류: `with { resolution-mode: "require" }` (잘못된 형식)
   - 올바른 구문: `with { "resolution-mode": "require" }` (속성 이름에 따옴표 필요)

### 시도한 해결책과 결론

#### 1. 초기 시도: import 속성 구문 추가

최초 접근법은 import 속성 구문을 사용하는 것이었습니다:

```typescript
// 시도 1: 구문 오류 - 하이픈 사용
import type { ... } from '../../types.js' with { resolution-mode: "require" };

// 시도 2: 구문 오류 - 속성 이름에 따옴표 누락
import type { ... } from '../../types.js' with { resolutionMode: "require" };
```

두 시도 모두 구문 오류나 TypeScript 컴파일러와의 호환성 문제로 실패했습니다.

#### 2. 최종 해결책: 올바른 import 속성 구문

TypeScript 5.0+ 버전의 정확한 구문을 사용한 최종 해결책:

```typescript
import type { 
    EventPayloadMapping, 
    MethodParamsMapping,
    MethodReturnMapping,
    IElectronAPI
} from '../../types.js' with { "resolution-mode": "require" };
```

**핵심 포인트**:
- 속성 이름(`"resolution-mode"`)은 따옴표로 감싸야 함
- 값(`"require"`)도 문자열 리터럴로 표현
- `.js` 확장자는 명시적으로 포함해야 함

### 기술적 배경: TypeScript의 Import Attributes

이 문제는 ECMAScript의 Import Attributes 명세에 기반합니다:

1. **Import Attributes란?**
   - JavaScript/TypeScript에 새롭게 추가된 기능
   - `import x from "y" with { type: "json" }` 구문으로 모듈 가져오기에 메타데이터를 추가할 수 있음
   - 이전에는 Import Assertions(`import x from "y" assert { type: "json" }`)로 불렸음

2. **`resolution-mode` 속성의 의미**
   - CommonJS 모듈에서 ESM 모듈의 타입만 가져올 때 어떻게 해석할지 지정
   - `"require"`: Node.js의 CommonJS `require()` 메커니즘으로 해석
   - `"import"`: ES 모듈 `import` 메커니즘으로 해석

### 배운 교훈 및 모범 사례

1. **TypeScript 버전에 주의**
   - TypeScript 5.0 이상에서는 모듈 간 타입 가져오기에 더 엄격한 규칙이 적용됨
   - 공식 문서에서 해당 버전의 변경사항을 항상 체크해야 함

2. **일관된 모듈 시스템 선택**
   - 가능하다면 프로젝트 전체에서 하나의 모듈 시스템(CommonJS 또는 ESM)만 사용
   - 혼합 사용이 불가피하다면 명확한 규칙과 가이드라인 수립 필요

3. **파일 확장자와 모듈 형식의 관계 이해**
   - `.ts`/`.js` - 기본 파일 (tsconfig의 모듈 설정 따름)
   - `.cts`/`.cjs` - CommonJS 모듈
   - `.mts`/`.mjs` - ES 모듈
   - import 시에는 결과물인 JS 파일의 확장자(`.js`, `.cjs`, `.mjs`)를 사용

4. **특수 구문 사용 시 정확한 명세 참조**
   - Import Attributes처럼 새로운 ECMAScript 기능은 명세를 정확히 참조
   - 속성 이름에 따옴표를 붙이는 등의 세부 구문에 주의

이 경험을 통해 TypeScript의 모듈 시스템과 ECMAScript 명세의 최신 기능에 대한 이해를 크게 향상시킬 수 있었습니다. 특히 Electron 프로젝트처럼 Node.js 환경과 브라우저 환경이 혼합된 애플리케이션에서는 이런 모듈 시스템 간의 호환성 문제에 더욱 주의해야 함을 배웠습니다.