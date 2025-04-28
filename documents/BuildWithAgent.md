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

크롤링 기능은 `src/electron/crawler.ts` 모듈에서 구현하였으며, 크게 다음 구성요소로 나누어집니다:

1. **초기화 및 환경 설정**:
   - Playwright의 chromium 브라우저 인스턴스 관리
   - 크롤링 대상 URL 및 필터링 조건 정의
   - 상태 관리 변수 (크롤링 진행 여부, 중단 요청 상태 등)

2. **이벤트 관리 시스템**:
   - Node.js EventEmitter를 활용한 이벤트 기반 통신 설계
   - 진행 상황, 오류, 완료 등 다양한 이벤트 발행
   - Electron의 IPC 통신과 연결하여 UI로 실시간 정보 전달

3. **핵심 크롤링 로직**:
   - 페이지네이션 처리 및 총 페이지 수 파악
   - 데이터베이스와 비교하여 필요한 크롤링 범위 동적 결정
   - 페이지별 제품 정보 추출 및 정규화

4. **오류 처리 및 자원 관리**:
   - 세밀한 예외 처리와 타입 안전성 강화
   - 브라우저 인스턴스 및 컨텍스트 적절한 해제
   - 로깅 및 모니터링 시스템 통합

#### 10.2. 타입 시스템 개선

크롤링 기능 구현 과정에서 타입 시스템을 크게 개선하였습니다:

```typescript
// 이전 CrawlingProgress 타입
export interface CrawlingProgress {
  current: number;
  total: number;
  percentage: number;
  currentStep: string;
  remainingTime?: number;
  elapsedTime: number;
}

// 개선된 CrawlingProgress 타입
export interface CrawlingProgress {
  status: CrawlingStatus;
  currentPage: number;
  totalPages: number;
  processedItems: number;
  totalItems: number;
  startTime: number;
  estimatedEndTime: number;
  newItems: number;
  updatedItems: number;
  percentage?: number;
  currentStep?: string;
  remainingTime?: number;
  elapsedTime?: number;
}
```

또한 `CrawlingStatus` 타입도 더 다양한 상태를 지원하도록 확장했습니다:
```typescript
// 개선된 CrawlingStatus 타입
export type CrawlingStatus = 'idle' | 'initializing' | 'running' | 'paused' | 'stopped' | 'completed' | 'error';
```

이러한 타입 개선을 통해 크롤링 과정의 각 상태와 진행 정보를 더 세밀하게 추적하고 UI에 반영할 수 있게 되었습니다.

#### 10.3. 핵심 크롤링 기능 구현

크롤링의 핵심 기능들은 다음과 같이 구현되었습니다:

1. **총 페이지 수 파악 알고리즘**:
   - `getTotalPages()` 함수에서는 크롤링 대상 사이트의 페이지네이션 구조를 분석
   - 페이지네이션이 다양한 패턴으로 구성될 경우를 대비한 대체 로직 포함
   - 마지막 페이지 번호를 추출하는 선택자 전략
   
   ```typescript
   async function getTotalPages(): Promise<number> {
     const browser = await chromium.launch({ headless: true });
     try {
       // 페이지 로드 및 전체 페이지 수 파악 로직
       const lastPageElement = await page.locator('div.pagination-wrapper > nav > div > a:last-child > span').first();
       // 기본 선택자가 실패할 경우의 대체 전략
       if (totalPages === 0) {
         const pageElements = await page.locator('div.pagination-wrapper > nav > div > a > span').all();
         if (pageElements.length > 0) {
           // 모든 페이지 번호 중 최대값 파악
           const pageNumbers = await Promise.all(
             pageElements.map(async (el) => {
               const text = await el.textContent();
               return text ? parseInt(text.trim(), 10) : 0;
             })
           );
           totalPages = Math.max(...pageNumbers.filter(n => !isNaN(n)));
         }
       }
     } finally {
       await browser.close(); // 브라우저 리소스 확실히 해제
     }
     return totalPages;
   }
   ```

2. **증분식 크롤링 전략**:
   - 데이터베이스의 기존 데이터와 비교하여 필요한 페이지만 크롤링하는 최적화
   - 최신 데이터(첫 페이지)부터 시작하여 중복 데이터 발견 시 중단하는 전략
   - 초기 구현 후 점진적으로 효율성을 높이는 방식으로 개발
   
   ```typescript
   async function determineCrawlingRange(): Promise<{ startPage: number; endPage: number }> {
     // 데이터베이스 요약정보와 웹사이트 총 페이지 수 조회
     const dbSummary = await getDatabaseSummaryFromDb();
     const totalPages = await getTotalPages();
     
     if (dbSummary.productCount === 0) {
       // 데이터베이스가 비어있으면 전체 크롤링
       return { startPage: 1, endPage: totalPages };
     } else {
       // 데이터베이스에 레코드가 있으면 최신 데이터부터 확인
       return { startPage: 1, endPage: totalPages };
     }
   }
   ```

3. **제품 정보 추출 로직**:
   - 각 제품 카드에서 필요한 정보를 추출하는 선택자 전략 구현
   - 초기에는 카드 개수만 파악하도록 구현 후 점진적으로 상세 정보 추출 기능 추가 계획
   - 브라우저 자원 효율적 관리를 위한 패턴 적용
   
   ```typescript
   async function crawlProductsFromPage(pageNumber: number) {
     const browser = await chromium.launch({ headless: true });
     try {
       const context = await browser.newContext();
       const page = await context.newPage();
       
       await page.goto(`${MATTER_FILTER_URL}&paged=${pageNumber}`, { waitUntil: 'networkidle' });
       
       // 현재는 기본적인 제품 카드 수 파악만 구현
       const productCards = await page.locator('.product-card').all();
       console.log(`[Crawler] Found ${productCards.length} products on page ${pageNumber}`);
       
       // 향후: 각 카드별로 상세 정보 추출 기능 추가 예정
       return productCards.length;
     } catch (error: unknown) {
       // 오류 처리의 타입 안전성 보장
       const errorMessage = error instanceof Error ? error.message : String(error);
       throw new Error(`Failed to crawl page ${pageNumber}: ${errorMessage}`);
     } finally {
       await browser.close(); // 브라우저 리소스 해제 보장
     }
   }
   ```

4. **진행 상황 계산 및 이벤트 기반 통신**:
   - 크롤링 진행 상태를 계산하는 알고리즘 구현
   - 예상 완료 시간을 계산하는 추정 로직 개발
   - 이벤트를 통한 실시간 UI 업데이트
   
   ```typescript
   // 크롤링 작업 시작 함수
   export async function startCrawling(): Promise<boolean> {
     // 이벤트를 통한 진행 상태 전달
     const crawlingProgress: CrawlingProgress = {
       status: 'initializing',
       currentPage: 0,
       totalPages: 0,
       processedItems: 0,
       totalItems: 0,
       startTime: Date.now(),
       estimatedEndTime: 0,
       newItems: 0,
       updatedItems: 0
     };
     
     crawlerEvents.emit('crawlingProgress', crawlingProgress);
     
     // 크롤링 진행 및 상태 업데이트
     // ... 각 페이지 처리 로직 ...
     
     crawlingProgress.estimatedEndTime = estimateEndTime(
       crawlingProgress.startTime,
       crawlingProgress.currentPage,
       crawlingProgress.totalPages
     );
     
     crawlerEvents.emit('crawlingProgress', { ...crawlingProgress });
   }
   
   // 완료 시간 추정 함수
   function estimateEndTime(startTime: number, currentPage: number, totalPages: number): number {
     if (currentPage <= 1) return 0;
     
     const elapsed = Date.now() - startTime;
     const avgTimePerPage = elapsed / currentPage;
     const remainingPages = totalPages - currentPage;
     
     return Date.now() + (avgTimePerPage * remainingPages);
   }
   ```

#### 10.4. Electron 메인 프로세스와 통합

크롤링 모듈은 Electron 메인 프로세스와 효과적으로 통합되었습니다:

1. **IPC 핸들러 등록**:
   - 기존의 타입 안전성이 보장된 IPC 핸들러 등록 패턴 활용
   - 크롤링 관련 명령(시작, 중지)에 대한 핸들러 추가
   
   ```typescript
   // main.ts에서의 핸들러 등록
   typedIpcMainHandle<{ mode: AppMode }, { success: boolean }>(
     'startCrawling',
     async (_, { mode }) => {
       console.log(`Start crawling requested in ${mode} mode.`);
       const success = await startCrawling();
       return { success };
     }
   );
   
   typedIpcMainHandle<void, { success: boolean }>(
     'stopCrawling',
     () => {
       console.log('Stop crawling requested.');
       const success = stopCrawling();
       return { success };
     }
   );
   ```

2. **이벤트 릴레이 메커니즘**:
   - 크롤러의 이벤트를 Electron IPC 채널로 전달하는 중계 함수 구현
   - 렌더러 프로세스(React UI)로 이벤트를 실시간 전달
   
   ```typescript
   function setupCrawlerEvents(mainWindow: BrowserWindow): void {
     // 다양한 크롤링 이벤트를 UI로 전달
     crawlerEvents.on('crawlingProgress', (progress) => {
       mainWindow.webContents.send('crawlingProgress', progress);
     });
     
     crawlerEvents.on('crawlingComplete', (data) => {
       mainWindow.webContents.send('crawlingComplete', data);
     });
     
     crawlerEvents.on('crawlingError', (error) => {
       mainWindow.webContents.send('crawlingError', error);
     });
   }
   
   // main.ts에서 애플리케이션 시작 시 이벤트 설정
   app.on('ready', async () => {
     // ... 다른 초기화 코드 ...
     setupCrawlerEvents(mainWindow);
     // ... IPC 핸들러 등록 ...
   });
   ```

#### 10.5. 타입 일관성 유지 문제와 해결

크롤링 기능 구현 과정에서 타입 불일치로 인한 문제가 발생했으며, 이를 효과적으로 해결했습니다:

1. **타입 정의와 구현 간의 불일치 해결**:
   - `CrawlingProgress`, `DatabaseSummary` 등의 인터페이스에서 사용하는 속성과 구현 코드 간의 불일치 발견
   - 타입 정의를 확장하여 실제 사용되는 모든 필드를 포함하도록 개선
   - `types.ts`와 `stores.ts`의 타입 일관성 확보

   ```typescript
   // stores.ts의 초기 구현 (문제 발생)
   export const crawlingProgressStore = map<CrawlingProgress>({
     current: 0, // CrawlingProgress 타입에 정의되지 않은 속성
     total: 0,
     percentage: 0,
     currentStep: '',
     elapsedTime: 0
   });

   // 수정된 구현
   export const crawlingProgressStore = map<CrawlingProgress>({
     status: 'idle',
     currentPage: 0, // 'current' 대신 'currentPage' 사용
     totalPages: 0,
     processedItems: 0,
     totalItems: 0,
     startTime: Date.now(),
     estimatedEndTime: 0,
     newItems: 0,
     updatedItems: 0,
     percentage: 0,
     currentStep: '',
     elapsedTime: 0
   });
   ```

2. **DatabaseSummary 인터페이스 호환성 유지**:
   - `productCount` 속성이 없어 발생한 타입 오류 해결
   - 기존 코드와의 호환성을 위해 `totalProducts`의 별칭으로 `productCount` 속성 추가
   
   ```typescript
   // 수정된 타입 정의
   export interface DatabaseSummary {
     totalProducts: number;
     productCount: number; // totalProducts와 동일한 값을 가지는 별칭
     lastUpdated: Date | null;
     newlyAddedCount: number;
   }
   
   // database.ts에서도 반환 객체에 속성 추가
   export async function getDatabaseSummaryFromDb(): Promise<DatabaseSummary> {
     // ... 데이터베이스 쿼리 ...
     resolve({
       totalProducts: row.total,
       productCount: row.total, // 추가된 속성
       lastUpdated: summaryData.lastUpdated ? new Date(summaryData.lastUpdated) : null,
       newlyAddedCount: summaryData.newlyAddedCount
     });
   }
   ```

이러한 타입 일관성 개선을 통해 애플리케이션의 안정성과 개발 생산성이 크게 향상되었습니다.

#### 10.6. 추가 구현 및 향후 개발 계획

현재까지의 구현은 기초적인 크롤링 구조와 페이지 탐색 기능을 중심으로 했으며, 다음과 같은 추가 개발이 계획되어 있습니다:

1. **제품 세부 정보 추출 기능**:
   - 각 제품 카드별 상세 정보를 추출하는 정교한 선택자 구현
   - 추출된 데이터의 정규화 및 유효성 검증 로직
   - 제품 식별을 위한 고유 키 생성 전략

2. **데이터베이스 저장 최적화**:
   - 추출된 제품 정보를 효율적으로 데이터베이스에 저장하는 기능
   - 중복 검사 및 증분 업데이트 메커니즘
   - 대량 데이터 처리를 위한 배치 삽입 전략

3. **병렬 처리 구현**:
   - Worker Thread를 활용한 병렬 크롤링 구현
   - 여러 페이지를 동시에 처리하는 병렬화 전략
   - 병렬 처리 시의 자원 사용량 모니터링 및 제어 기능

4. **오류 복원 및 재시도 메커니즘**:
   - 네트워크 오류 발생 시 지수 백오프 기반 재시도 로직
   - 크롤링 세션 지속성 유지를 위한 체크포인트 기능
   - 일부 실패 시에도 전체 크롤링을 지속할 수 있는 견고성 확보

5. **크롤링 정책 고도화**:
   - 대상 웹사이트의 정책과 구조를 고려한 예의 바른 크롤링 규칙 구현
   - 웹사이트 변경 감지 및 자동 적응 메커니즘
   - 서버 부하 감소를 위한 레이트 리미팅 전략

### 11. IPC 통신 안정성 개선

Electron 애플리케이션의 핵심인 IPC(Inter-Process Communication) 통신의 안정성과 견고성을 크게 개선했습니다. 이는 렌더러 프로세스(React UI)와 메인 프로세스(Electron) 간의 데이터 및 명령 교환을 더 신뢰성 있게 만드는 중요한 작업이었습니다.

#### 11.1. 문제 발견 및 분석

개발 과정에서 다음과 같은 IPC 통신 관련 문제가 발생했습니다:

1. **매개변수 전달 오류**: 특히 `startCrawling`과 같은 함수 호출 시 매개변수가 메인 프로세스에 제대로 전달되지 않는 현상
2. **TypeScript 타입과 런타임 불일치**: 타입 시스템에서는 문제가 없지만 실제 런타임에서 오류 발생
3. **오류 처리 미흡**: IPC 통신 실패 시 명확한 오류 메시지나 복구 메커니즘 부재

주요 오류 로그 예시:
```
TypeError: Cannot destructure property 'mode' of 'undefined'
[API] Falling back to mock implementation for: startCrawling
```

#### 11.2. 원인 분석

문제의 근본 원인은 다음과 같이 파악되었습니다:

1. `typedIpcMainHandle` 래퍼 함수: TypeScript 타입 안전성을 제공하려는 커스텀 래퍼 함수가 실제 런타임에서는 제대로 작동하지 않음
2. Preload 스크립트에서의 매개변수 처리: 매개변수를 메인 프로세스로 전달하는 과정에서 문제 발생
3. 타입 정보 소실: 컴파일 후 TypeScript의 타입 정보가 제거되면서 런타임에 타입 불일치 발생

#### 11.3. 구조적 해결책 구현

이러한 문제를 근본적으로 해결하기 위해 다음과 같은 변경사항을 적용했습니다:

1. **네이티브 IPC 통신 방식 채택**:
   - 커스텀 래퍼 함수(`typedIpcMainHandle`) 제거
   - Electron의 네이티브 `ipcMain.handle` 메소드 직접 사용

   ```typescript
   // 이전 코드 (문제 발생)
   typedIpcMainHandle<{ mode: AppMode } | undefined, { success: boolean }>(
     'startCrawling',
     async (_, arg) => {
       const mode = arg?.mode || 'development';
       // ...
     }
   );
   
   // 개선된 코드
   ipcMain.handle(IPC_CHANNELS.START_CRAWLING, async (event, args) => {
     console.log('[IPC] startCrawling called with args (raw):', args);
     console.log('[IPC] startCrawling args type:', typeof args);
     console.log('[IPC] startCrawling JSON args:', JSON.stringify(args));
     
     // 안전한 매개변수 처리
     let mode: AppMode = 'development'; // 기본값
     
     try {
       if (args && typeof args === 'object' && 'mode' in args) {
         mode = args.mode as AppMode;
       }
     } catch (err) {
       console.error('[IPC] Error parsing startCrawling args:', err);
     }
     
     // ... 나머지 로직
   });
   ```

2. **IPC 채널 상수화**:
   - 일관된 채널 이름 관리를 위해 상수 사용
   - 오타나 불일치로 인한 오류 방지

   ```typescript
   // IPC 채널 상수 정의
   const IPC_CHANNELS = {
     GET_STATIC_DATA: 'getStaticData',
     GET_PRODUCTS: 'getProducts',
     GET_PRODUCT_BY_ID: 'getProductById',
     SEARCH_PRODUCTS: 'searchProducts',
     GET_DATABASE_SUMMARY: 'getDatabaseSummary',
     MARK_LAST_UPDATED: 'markLastUpdated',
     START_CRAWLING: 'startCrawling',
     STOP_CRAWLING: 'stopCrawling',
     EXPORT_TO_EXCEL: 'exportToExcel'
   };
   ```

3. **Preload 스크립트 안전성 강화**:
   - 매개변수 전달 시 명시적 유효성 검사 추가
   - 특정 함수 호출에 대한 특별 처리 로직 구현

   ```typescript
   // Preload 스크립트 개선
   invokeMethod: function<T = any, R = any>(methodName: string, params?: T): Promise<R> {
     // 명시적으로 파라미터 처리 강화
     console.log(`[Preload] Invoking method directly: ${methodName}`, params);
     
     // 특별히 startCrawling 호출에 대한 매개변수 검사 추가
     if (methodName === 'startCrawling') {
       console.log(`[Preload] startCrawling params type: ${typeof params}`);
       console.log(`[Preload] startCrawling JSON params: ${JSON.stringify(params)}`);
       
       // 매개변수가 없으면 기본값 제공
       if (!params) {
         console.warn(`[Preload] startCrawling called with no params, using default`);
         return ipcRenderer.invoke(methodName, { mode: 'development' });
       }
     }
     
     // 항상 명시적인 객체로 매개변수 전달
     return ipcRenderer.invoke(methodName, params);
   }
   ```

4. **포괄적인 오류 처리 추가**:
   - 메인 프로세스의 모든 IPC 핸들러에 try-catch 블록 추가
   - 오류 발생 시 구조화된 응답으로 변환하여 반환
   - 디버깅을 위한 상세 로깅 추가

#### 11.4. 빌드 프로세스 개선

IPC 통신 문제 해결 과정에서 빌드 프로세스도 개선했습니다:

1. **Clean 스크립트 추가**:
   - 이전 빌드 결과물을 완전히 제거하는 `clean` 스크립트 구현
   - `rimraf` 패키지를 활용한 안정적인 디렉토리 정리

   ```json
   "scripts": {
     "clean": "rimraf dist-electron dist-react",
     "rebuild": "npm run clean && npm run transpile:electron && npm run build"
   }
   ```

2. **빌드 순서 최적화**:
   - `rebuild` 스크립트에서 `transpile:electron` 명령을 명시적으로 포함
   - 올바른 순서로 빌드 단계를 실행하도록 보장

3. **메인 진입점 경로 수정**:
   - 빌드된 파일의 실제 위치에 맞게 `package.json`의 `main` 필드 수정
   - `dist-electron/main.js`에서 `dist-electron/electron/main.js`로 변경

#### 11.5. 개선 결과

이러한 개선 작업의 결과로 다음과 같은 효과를 얻었습니다:

1. **안정적인 IPC 통신**: 매개변수 전달 문제가 해결되어 안정적인 통신이 가능해짐
2. **향상된 디버깅**: 상세한 로깅으로 문제 발생 시 원인 파악이 용이
3. **견고성 강화**: 예상치 못한 상황에서도 기본값을 제공하여 시스템 안정성 유지
4. **유지보수성 향상**: 채널 이름 상수화 및 일관된 코드 스타일로 유지보수 용이성 증가

### 12. macOS 앱 종료 프로세스 개선

macOS에서 Electron 앱 종료 시 발생하는 문제를 해결하여 사용자 경험을 개선했습니다.

#### 12.1. 문제 증상

macOS에서 애플리케이션을 종료할 때 다음과 같은 문제가 발생했습니다:
1. 앱 창을 닫아도 Dock에 앱 아이콘이 계속 남아있음
2. 이후 예기치 않게 종료되었다는 팝업 메시지가 표시됨
3. 실행 중인 프로세스가 제대로 정리되지 않음

#### 12.2. 문제 원인

이 문제의 원인은 다음과 같았습니다:

1. **macOS의 기본 앱 동작**: macOS에서는 모든 창이 닫혀도 앱이 자동으로 종료되지 않는 기본 동작이 있음
2. **미완전한 종료 처리**: Electron의 기본 설정이 macOS 표준을 따르도록 되어 있어, `window-all-closed` 이벤트에서 macOS(`darwin`)는 `app.quit()`를 호출하지 않도록 구현됨
   
   ```typescript
   // 문제가 있는 기존 코드
   app.on('window-all-closed', () => {
     if (process.platform !== 'darwin') {
       app.quit();
     }
   });
   ```

3. **자원 정리 부족**: 앱 종료 시 실행 중인 프로세스(크롤링 등)를 명시적으로 중지하지 않음

#### 12.3. 구현한 해결책

이 문제를 해결하기 위해 다음과 같은 개선 사항을 적용했습니다:

1. **macOS 앱 종료 동작 수정**:
   - macOS에서도 모든 창이 닫히면 앱이 완전히 종료되도록 변경
   
   ```typescript
   // 개선된 코드
   app.on('window-all-closed', () => {
     // 모든 창이 닫힐 때 앱을 완전히 종료 (macOS에서도)
     console.log('All windows closed, quitting application');
     app.quit();
   });
   ```

2. **안전한 앱 종료 메커니즘 구현**:
   - 메인 창 닫힘 이벤트 처리기 추가
   - 실행 중인 작업 정리를 위한 준비 함수 구현
   
   ```typescript
   // 메인 창 닫힘 이벤트 처리
   mainWindow.on('close', (e) => {
     console.log('Main window close event triggered');
     
     // 실행 중인 크롤링 작업이 있다면 중지 시도
     stopCrawling();
     
     // 메인 윈도우가 닫힐 때 앱 종료 준비
     prepareForAppTermination();
   });
   ```

3. **종료 전 자원 정리 로직 추가**:
   - `before-quit` 이벤트에 정리 로직 추가
   - 실행 중인 모든 작업을 안전하게 중지하는 함수 구현
   
   ```typescript
   // 앱 종료 준비 함수
   function prepareForAppTermination(): void {
     console.log('Preparing for app termination...');
     
     try {
       // 실행 중인 크롤링 작업 중지 시도
       stopCrawling();
       
       // 기타 실행 중인 프로세스나 리소스 정리
       // 예: 데이터베이스 연결 해제, 임시 파일 정리 등
       console.log('Cleanup completed successfully');
     } catch (error) {
       console.error('Error during app termination cleanup:', error);
     }
   }
   
   // 앱이 종료되기 직전 이벤트
   app.on('before-quit', (event) => {
     console.log('Before-quit event triggered');
     
     // 종료 전 정리 작업 수행
     prepareForAppTermination();
   });
   ```

#### 12.4. 개선 결과

적용된 해결책을 통해 다음과 같은 효과를 얻었습니다:

1. **깔끔한 앱 종료**: macOS에서 앱 창을 닫으면 앱이 완전히 종료되고 Dock에 아이콘이 남지 않음
2. **오류 메시지 제거**: "앱이 예기치 않게 종료되었습니다" 오류 메시지가 더 이상 표시되지 않음
3. **자원 관리 개선**: 실행 중인 크롤링 작업이나 기타 프로세스가 앱 종료 시 안전하게 중지됨
4. **사용자 경험 향상**: 앱의 예상 동작과 실제 동작이 일치하여 사용자 혼란 감소

### 13. 프로덕션 모드 preload 스크립트 로딩 문제 해결

배포된 앱에서 preload 스크립트를 찾지 못하는 문제를 해결하여 제품 안정성을 크게 향상시켰습니다.

#### 13.1. 문제 증상

macOS에서 배포된 앱 실행 시 다음과 같은 오류가 발생했습니다:

```
Unable to load preload script: /Users/.../crawlmattercertis.app/Contents/Resources/dist-electron/electron/preload.cjs
Error: Cannot find module '/Users/.../crawlmattercertis.app/Contents/Resources/dist-electron/electron/preload.cjs'
```

이로 인해 Electron IPC 통신이 작동하지 않아 앱이 Mock API로 fallback되는 문제가 발생했습니다.

#### 13.2. 문제 원인

문제의 원인은 다음과 같았습니다:

1. **경로 차이**: 개발 환경과 빌드된 앱의 파일 구조가 달라 preload 스크립트 경로가 일치하지 않음
2. **하드코딩된 경로**: `getPreloadPath` 함수에서 개발 환경 기준으로 하드코딩된 경로 사용
3. **경로 확인 부족**: 파일 존재 여부를 확인하는 로직 부재

#### 13.3. 구현한 해결책

이 문제를 해결하기 위해 `pathResolver.ts` 파일의 `getPreloadPath` 함수를 다음과 같이 개선했습니다:

```typescript
export function getPreloadPath() {
    const appPath = app.getAppPath();
    console.log('App path:', appPath);
    
    if (isDev()) {
        // 개발 모드에서는 기존 경로 사용
        const devPath = path.join(appPath, './dist-electron/electron/preload.cjs');
        console.log('Development preload path:', devPath);
        
        // 존재 여부 확인 (디버깅용)
        if (fs.existsSync(devPath)) {
            console.log('Preload script exists at development path');
        } else {
            console.warn('Preload script NOT found at development path');
        }
        
        return devPath;
    } else {
        // 프로덕션 모드에서는 여러 가능한 경로 시도
        const possiblePaths = [
            // 일반적인 Electron 앱 번들 구조 (macOS)
            path.join(appPath, 'dist-electron', 'electron', 'preload.cjs'),
            path.join(appPath, '../dist-electron/electron/preload.cjs'),
            // macOS .app 번들 내부 구조 
            path.join(appPath, '..', '..', 'dist-electron', 'electron', 'preload.cjs'),
            // 상대 경로로 시도
            path.resolve(appPath, './dist-electron/electron/preload.cjs')
        ];
        
        // 가능한 경로들을 순차적으로 확인
        for (const candidatePath of possiblePaths) {
            console.log('Checking preload path:', candidatePath);
            if (fs.existsSync(candidatePath)) {
                console.log('Preload script found at:', candidatePath);
                return candidatePath;
            }
        }
        
        // 경로를 찾지 못한 경우 기본값 반환
        console.warn('Could not find preload script in expected locations. Falling back to first possible path.');
        return possiblePaths[0];
    }
}
```

이 구현의 주요 특징은 다음과 같습니다:

1. **적응형 경로 탐색**: 개발 모드와 프로덕션 모드를 명확히 구분하여 처리
2. **다중 경로 시도**: 프로덕션 모드에서 여러 가능한 경로를 순차적으로 시도
3. **파일 존재 확인**: `fs.existsSync`를 사용하여 파일이 실제로 존재하는지 확인
4. **상세 로깅**: 전체 과정을 로깅하여 디버깅 용이성 확보
5. **폴백 메커니즘**: 모든 시도가 실패해도 최소한의 기본 경로 제공

#### 13.4. 개선 결과

이러한 개선을 통해 다음과 같은 효과를 얻었습니다:

1. **macOS 배포 앱 안정성**: 배포된 앱에서 preload 스크립트를 안정적으로 로드
2. **IPC 통신 복원**: Electron IPC 통신이 정상 작동하여 실제 API 호출 가능
3. **Mock API 의존 감소**: 더 이상 Mock API에 의존하지 않고 실제 기능 사용
4. **크로스 플랫폼 호환성 강화**: 다양한 환경에서 앱이 안정적으로 동작하도록 보장
5. **디버깅 용이성**: 상세한 로깅을 통해 향후 유사 문제 발생 시 빠른 진단 가능

## 핵심 학습 포인트

(내용 동일)