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

## 핵심 학습 포인트

(내용 동일)