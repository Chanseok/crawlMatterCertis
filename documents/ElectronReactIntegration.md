# Electron과 React 통합 구조 설명서

이 문서는 새로 합류하는 개발팀원이 crawlMatterCertis 프로젝트의 내부 아키텍처를 이해하는데 도움을 주기 위해 작성되었습니다. 특히 Electron(백엔드)와 React(프론트엔드) 사이의 통신 구조와 초기화 과정에 초점을 두고 설명합니다.

## 1. 프로젝트 아키텍처 개요

### 1.1 핵심 구조

본 애플리케이션은 두 가지 주요 기술 스택으로 구성되어 있습니다:

- **백엔드**: Electron (Node.js 기반)
- **프론트엔드**: React (TypeScript 기반)

아래 다이어그램은 전체적인 아키텍처를 보여줍니다:

```
+------------------------+            +------------------------+
|                        |            |                        |
|  React UI (Renderer)   |<---------->|  Electron (Main)       |
|                        |    IPC     |                        |
+------------------------+            +------------------------+
         ^                                      ^
         |                                      |
         v                                      v
+------------------------+            +------------------------+
|                        |            |                        |
|  Frontend State        |            |  Backend Services      |
|  (nanostores)          |            |  (Database, API, etc)  |
|                        |            |                        |
+------------------------+            +------------------------+
```

## 2. 주요 구성요소 및 파일

### 2.1 백엔드 (Electron)

- **src/electron/main.ts**: Electron 애플리케이션의 주 진입점
- **src/electron/preload.cts**: IPC 통신을 위한 브릿지 역할 (컨텍스트 격리 지원)
- **src/electron/database.ts**: 데이터베이스 작업 처리
- **src/electron/resourceManager.ts**: 시스템 자원 모니터링 및 관리
- **src/electron/util.ts**: 유틸리티 함수 모음

### 2.2 프론트엔드 (React)

- **src/ui/main.tsx**: React 애플리케이션의 진입점
- **src/ui/App.tsx**: 메인 React 컴포넌트
- **src/ui/stores.ts**: 상태 관리 (nanostores 기반)
- **src/ui/platform/api.ts**: 프론트엔드-백엔드 통신 추상화 레이어
- **src/ui/types.ts**: 공유 TypeScript 타입 정의

## 3. IPC (Inter-Process Communication) 구조 상세 설명

### 3.1 IPC 통신 흐름

Electron과 React 간의 통신은 다음과 같은 흐름으로 이루어집니다:

1. **preload.cts**: 보안 컨텍스트 격리를 유지하면서 `window.electron` API 노출
2. **api.ts**: 프론트엔드에서 사용할 플랫폼 독립적인 API 추상화 제공
3. **stores.ts**: 상태 관리 및 백엔드와의 통신 조정
4. **main.ts**: IPC 이벤트 처리 및 백엔드 로직 실행

### 3.2 IPC 메커니즘 분석

#### 3.2.1 Preload 스크립트 (electron/preload.cts)

Electron의 컨텍스트 격리를 활용하여 안전한 통신 채널을 구축합니다:

```typescript
const electronAPI: IElectronAPI = {
  subscribeToEvent: function<T = any>(eventName: string, callback: (data: T) => void): () => void {
    // 이벤트 구독 로직
    const handler = (_: Electron.IpcRendererEvent, data: T): void => callback(data);
    ipcRenderer.on(eventName, handler);
    return (): void => ipcRenderer.removeListener(eventName, handler);
  },
  
  invokeMethod: function<T = any, R = any>(methodName: string, params?: T): Promise<R> {
    // 메소드 호출 로직
    return ipcRenderer.invoke(methodName, params);
  }
};

// 렌더러에 API 노출
contextBridge.exposeInMainWorld('electron', electronAPI);
```

이 코드는 두 가지 핵심 기능을 제공합니다:
- `subscribeToEvent`: 백엔드에서 전송되는 이벤트에 대한 구독
- `invokeMethod`: 백엔드 메서드 비동기 호출

#### 3.2.2 Main 프로세스 (electron/main.ts)

Electron의 메인 프로세스에서는 IPC 핸들러를 등록합니다:

```typescript
// IPC 핸들러의 타입 안전성을 보장하기 위한 헬퍼 함수
function typedIpcMainHandle<T, R>(
    channel: string,
    listener: (event: IpcMainInvokeEvent, arg: T) => Promise<R> | R
): void {
    ipcMain.handle(channel, listener);
}

// 각종 IPC 핸들러 등록
typedIpcMainHandle('getProducts', (_, { page, limit }) => 
    getProductsFromDb(page, limit)
);

typedIpcMainHandle('startCrawling', async (_, { mode }) => {
    console.log(`Start crawling requested in ${mode} mode.`);
    // 실제 크롤링 로직은 여기에 구현
    return { success: true };
});
```

#### 3.2.3 플랫폼 API (ui/platform/api.ts)

프론트엔드에서는 백엔드 통신을 추상화하는 API 레이어가 있습니다:

```typescript
// 이 추상화를 통해 Electron 외에도 다른 백엔드(예: Tauri)를 쉽게 지원할 수 있게 됨
class ElectronApiAdapter implements IPlatformAPI {
  subscribeToEvent<K extends keyof EventPayloadMapping>(
    eventName: K,
    callback: (data: EventPayloadMapping[K]) => void
  ): UnsubscribeFunction {
    return window.electron.subscribeToEvent(eventName, callback);
  }

  async invokeMethod<K extends keyof MethodParamsMapping, R = MethodReturnMapping[K]>(
    methodName: K,
    params?: MethodParamsMapping[K]
  ): Promise<R> {
    return window.electron.invokeMethod(methodName, params);
  }
}
```

개발 모드를 위한 Mock API도 제공되어 있어, Electron이 없는 환경에서도 UI 개발이 가능합니다.

### 3.2.4 상태 관리 (ui/stores.ts)

nanostores를 사용하여 애플리케이션 상태를 관리하고 백엔드와의 통신을 조정합니다:

```typescript
// API 참조
let api = getPlatformApi();

// API 구독 설정
export function initializeApiSubscriptions() {
  // 기존 구독 해제 및 새 구독 등록
  unsubscribeAll();
  
  // 크롤링 진행 상황 구독
  const unsubProgress = api.subscribeToEvent('crawlingProgress', (progress) => {
    crawlingProgressStore.set({
      ...crawlingProgressStore.get(),
      ...progress
    });
  });
  unsubscribeFunctions.push(unsubProgress);
  
  // 기타 이벤트 구독 및 초기 데이터 로드
  // ...
  
  // 초기 데이터 로드
  loadInitialData();
}
```

## 4. 초기화 프로세스

### 4.1 애플리케이션 시작 흐름

1. **Electron 애플리케이션 시작**
   - `main.ts`에서 `app.on('ready', ...)` 이벤트 핸들러 실행
   - BrowserWindow 생성 및 preload 스크립트 연결
   - 데이터베이스 초기화 (`initializeDatabase()`)
   - UI 로드 (개발 모드에서는 Vite 개발 서버, 프로덕션에서는 빌드된 HTML)
   - IPC 핸들러 등록

2. **React 애플리케이션 시작**
   - `main.tsx`에서 React 루트 컴포넌트 렌더링
   - `App.tsx`에서 상태 초기화 및 컴포넌트 마운트

3. **API 초기화**
   - `api.ts`에서 `initPlatformApi()` 호출하여 적절한 API 어댑터 선택
   - DOM 로드 상태에 따른 지연 초기화 전략 구현

4. **상태 관리 초기화**
   - `stores.ts`에서 `initializeApiSubscriptions()` 호출
   - 백엔드 이벤트 구독 설정
   - 초기 데이터 로드 (`loadInitialData()`)

### 4.2 주의할 점

- **타이밍 이슈**: Electron API는 DOM이 완전히 로드된 후에 사용 가능해야 함
- **오류 처리**: 백엔드 연결 실패 시 MockApiAdapter로 폴백
- **개발/프로덕션 모드**: 환경에 따라 적절한 API 어댑터 선택

## 5. 데이터 흐름 예시

### 5.1 크롤링 시작 예시

1. 사용자가 UI에서 "크롤링 시작" 버튼 클릭
2. `stores.ts`의 `startCrawling()` 함수 호출
3. `api.invokeMethod('startCrawling', { mode: appModeStore.get() })` 실행
4. `preload.cts`를 통해 IPC 메시지가 메인 프로세스로 전달
5. 메인 프로세스의 `startCrawling` 핸들러 실행
6. 백엔드에서 크롤링 작업 시작 및 주기적으로 `crawlingProgress` 이벤트 전송
7. 이벤트가 `preload.cts`를 통해 렌더러로 전달
8. `stores.ts`의 이벤트 리스너가 상태 업데이트
9. React 컴포넌트가 업데이트된 상태를 반영하여 UI 갱신

## 6. 디버깅 팁

### 6.1 IPC 통신 디버깅

- 개발 모드에서는 Electron DevTools를 통해 IPC 통신 로그 확인 가능
- `api.ts`와 `preload.cts`에는 디버깅을 위한 로그가 포함되어 있음
- 문제 발생 시 `console.log(window.electron)`으로 접근 가능 여부 확인

### 6.2 일반적인 문제 해결

- **IPC 통신 실패**: preload 스크립트 경로 확인 및 컨텍스트 격리 설정 검토
- **데이터베이스 오류**: 초기화 순서 및 파일 경로 확인
- **UI 렌더링 문제**: 상태 업데이트 및 이벤트 구독 확인

## 7. 확장 및 개발 가이드라인

### 7.1 새로운 IPC 메서드 추가하기

1. `ui/types.ts`에 관련 타입 정의 추가
2. `ui/platform/api.ts`의 `MethodParamsMapping` 및 `MethodReturnMapping` 인터페이스 업데이트
3. `electron/main.ts`에 IPC 핸들러 추가
4. `stores.ts` 또는 필요한 컴포넌트에서 해당 메서드 사용

### 7.2 새로운 이벤트 추가하기

1. `ui/types.ts`에 관련 타입 정의 추가
2. `ui/platform/api.ts`의 `EventPayloadMapping` 인터페이스 업데이트
3. `electron/main.ts` 또는 관련 서비스에서 `mainWindow.webContents.send(eventName, data)` 호출
4. `stores.ts`에서 `api.subscribeToEvent(eventName, callback)` 추가

## 8. 결론

이 아키텍처는 보안, 유지보수성, 확장성을 고려하여 설계되었습니다. Electron과 React 사이의 통신은 타입 안전한 방식으로 구현되어 있으며, 개발 및 프로덕션 환경 모두에서 원활하게 작동합니다. 또한 향후 다른 백엔드 프레임워크(예: Tauri)로의 마이그레이션도 용이하게 만들어 두었습니다.

이 문서가 신규 팀원들이 프로젝트의 구조를 이해하는 데 도움이 되길 바랍니다. 추가 질문이나 명확한 설명이 필요한 부분이 있다면 팀 리드나 숙련된 개발자에게 문의하세요.