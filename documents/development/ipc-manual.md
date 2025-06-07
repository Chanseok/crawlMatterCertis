# Electron-React IPC 통신 매뉴얼

## 개요

이 매뉴얼은 Electron과 React를 함께 사용하는 애플리케이션에서 IPC(Inter-Process Communication) 통신을 효과적으로 구현하고 관리하기 위한 가이드입니다. IPC 명령어 추가, 변경, 삭제 작업을 체계적으로 수행할 수 있도록 설계되었습니다.

### 프로젝트 구조 이해

IPC 명령어를 관리하는 주요 파일들은 다음과 같습니다:

1. **types.d.ts** - 전역 타입 정의 파일
2. **src/electron/main.ts** - 메인 프로세스의 IPC 핸들러 정의
3. **src/electron/preload.cts** - 프리로드 스크립트(IPC 인터페이스 노출)
4. **src/ui/platform/api.ts** - 렌더러 프로세스의 API 추상화
5. **src/ui/stores.ts** - 상태 관리 및 API 메서드 호출

## 1. IPC 명령어 변경 가이드

### 1.1 IPC 명령어 추가 절차

1. **types.d.ts** - 전역 타입 정의 추가
   ```typescript
   // 메서드 매개변수 맵핑에 새 명령어 추가
   type MethodParamsMapping = {
     // 기존 명령어들...
     '새로운명령어': { 파라미터1: 타입1, 파라미터2: 타입2 } | void;
   };

   // 메서드 반환값 맵핑에도 추가
   type MethodReturnMapping = {
     // 기존 명령어들...
     '새로운명령어': { 결과1: 타입1, 결과2: 타입2 };
   };
   ```

2. **src/electron/main.ts** - 채널 상수 정의 및 핸들러 등록
   ```typescript
   // IPC 채널 상수에 추가
   const IPC_CHANNELS = {
     // 기존 채널들...
     새로운명령어_대문자: '새로운명령어'
   };

   // 필요한 함수 import
   import { 필요한함수 } from './모듈이름.js';

   // IPC 핸들러 등록
   ipcMain.handle(IPC_CHANNELS.새로운명령어_대문자, async (event, args) => {
     console.log('[IPC] 새로운명령어 called with args:', args);
     try {
       const 결과 = await 필요한함수(args);
       return { success: true, 결과데이터: 결과 };
     } catch (error) {
       console.error('[IPC] Error in 새로운명령어:', error);
       return { success: false, error: String(error) };
     }
   });
   ```

3. **src/electron/preload.cts** - 프리로드 스크립트에 메서드 추가
   ```typescript
   // 메서드 추가
   const electronAPI = {
     // 기존 코드...
     새로운명령어: createMethodHandler('새로운명령어'),
   };
   ```

4. **src/ui/platform/api.ts** - API 인터페이스 정의 업데이트
   ```typescript
   // MethodParamsMapping 인터페이스에 추가
   export interface MethodParamsMapping {
     // 기존 메서드들...
     '새로운명령어': { 파라미터1: 타입1 } | void;
   }

   // MethodReturnMapping 인터페이스에도 추가
   export interface MethodReturnMapping {
     // 기존 메서드들...
     '새로운명령어': { success: boolean; 결과데이터?: any; error?: string };
   }

   // Mock 어댑터의 invokeMethod 메서드에 case 추가
   case '새로운명령어':
     // Mock 구현
     return {
       success: true,
       결과데이터: 샘플데이터
     } as any;
   ```

5. **src/ui/stores.ts** - 스토어 및 액션 함수 추가
   ```typescript
   // 필요시 새 스토어 추가
   export const 새로운스토어 = map<데이터타입>({} as 데이터타입);

   // 액션 함수 추가
   export async function 새로운함수(): Promise<void> {
     try {
       addLog('새 작업을 시작합니다...', 'info');
       const { success, 결과데이터, error } = await api.invokeMethod('새로운명령어');
       
       if (success) {
         새로운스토어.set(결과데이터);
         addLog('작업이 성공적으로 완료되었습니다.', 'success');
       } else {
         addLog(`작업 실패: ${error}`, 'error');
       }
     } catch (error) {
       addLog(`작업 중 오류: ${error instanceof Error ? error.message : String(error)}`, 'error');
     }
   }
   ```

6. **UI 컴포넌트** - 함수 import 및 사용
   ```tsx
   // 함수 import
   import { 새로운함수 } from './stores';

   // 핸들러 추가
   const handle새로운작업 = () => {
     새로운함수();
   };

   // UI에 버튼 추가
   <button onClick={handle새로운작업}>새 작업</button>
   ```

### 1.2 IPC 명령어 변경 절차

1. **types.d.ts** - 기존 타입 수정
   ```typescript
   // 파라미터 타입 또는 반환 타입 변경
   type MethodParamsMapping = {
     // 기존 명령어...
     '기존명령어': { 새파라미터: 타입 }; // 수정된 타입
   };

   type MethodReturnMapping = {
     // 기존 명령어...
     '기존명령어': { success: boolean; 새결과: 타입 }; // 수정된 타입
   };
   ```

2. **src/electron/main.ts** - 핸들러 수정
   ```typescript
   // 핸들러 로직 변경
   ipcMain.handle(IPC_CHANNELS.기존명령어, async (event, args) => {
     // 수정된 로직
     try {
       const { 새파라미터 } = args;
       const 결과 = await 수정된함수(새파라미터);
       return { success: true, 새결과: 결과 };
     } catch (error) {
       // 오류 처리
     }
   });
   ```

3. **src/ui/platform/api.ts** - API 인터페이스 정의 수정
   ```typescript
   // 수정된 인터페이스
   export interface MethodParamsMapping {
     '기존명령어': { 새파라미터: 타입 };
   }
   
   export interface MethodReturnMapping {
     '기존명령어': { success: boolean; 새결과?: any; error?: string };
   }
   
   // Mock 구현 수정
   case '기존명령어':
     // 수정된 Mock 구현
     return { success: true, 새결과: 샘플데이터 } as any;
   ```

4. **src/ui/stores.ts** - 액션 함수 수정
   ```typescript
   // 수정된 함수
   export async function 기존함수(새파라미터: 타입): Promise<void> {
     // 수정된 로직
     const { success, 새결과 } = await api.invokeMethod('기존명령어', { 새파라미터 });
     // 처리 로직 수정
   }
   ```

### 1.3 IPC 명령어 삭제 절차

1. **types.d.ts** - 타입 정의에서 제거
   ```typescript
   // 해당 명령어 삭제
   type MethodParamsMapping = {
     // '삭제할명령어' 항목 제거
   };
   
   type MethodReturnMapping = {
     // '삭제할명령어' 항목 제거
   };
   ```

2. **src/electron/main.ts** - 상수 및 핸들러 제거
   ```typescript
   const IPC_CHANNELS = {
     // 삭제할_명령어 항목 제거
   };
   
   // 해당 ipcMain.handle() 호출 제거
   ```

3. **src/electron/preload.cts** - 메서드 제거
   ```typescript
   const electronAPI = {
     // 삭제할명령어 제거
   };
   ```

4. **src/ui/platform/api.ts** - 인터페이스에서 제거
   ```typescript
   export interface MethodParamsMapping {
     // '삭제할명령어' 제거
   }
   
   export interface MethodReturnMapping {
     // '삭제할명령어' 제거
   }
   
   // Mock 어댑터의 case 문에서 해당 case 제거
   ```

5. **src/ui/stores.ts** - 관련 액션 함수 제거
   ```typescript
   // 제거할 함수 삭제
   // export async function 제거할함수() {...}
   ```

6. **UI 컴포넌트** - 관련 코드 제거
   ```tsx
   // 제거할 함수 import 제거
   // 제거할 핸들러 제거
   // 관련 UI 요소 제거
   ```

## 2. IPC 통신 디버깅 가이드

### 2.1 디버깅 도구

1. **Electron DevTools**
   - 개발 모드에서 `mainWindow.webContents.openDevTools()` 호출로 활성화
   - 콘솔 로그와 네트워크 요청 확인

2. **로깅 전략**
   - `main.ts`에서 IPC 호출 로깅
   ```typescript
   console.log('[IPC] 명령어 called with args:', args);
   ```
   - `preload.cts`에서 함수 호출 로깅
   ```typescript
   console.log(`[Preload] Invoking method: ${methodName}`, params);
   ```

3. **오류 탐지**
   - 모든 IPC 핸들러에 try-catch 블록 사용
   - 오류 발생 시 적절한 오류 객체 반환
   ```typescript
   return { success: false, error: String(error) };
   ```

### 2.2 일반적인 문제 해결

1. **"Argument of type 'X' is not assignable to parameter of type 'Y'"**
   - **원인**: types.d.ts와 실제 코드 간의 타입 불일치
   - **해결**: 양쪽의 타입 정의 일치시키기

2. **"Cannot destructure property 'X' of 'undefined'"**
   - **원인**: IPC 핸들러에 전달된 args가 undefined
   - **해결**: 기본값 할당 또는 안전한 접근자 사용
   ```typescript
   const { prop = 기본값 } = args || {};
   ```

3. **"Method 'X' is not implemented in mock API"**
   - **원인**: Mock API에 해당 메서드 구현 누락
   - **해결**: MockApiAdapter의 switch 문에 case 추가

4. **"An object could not be cloned"**
   - **원인**: IPC 통신에서 직렬화할 수 없는 객체(Date, Function 등) 전송 시도
   - **해결**: 직렬화 가능한 형태로 변환 후 전송
   ```typescript
   // Date 객체의 경우 ISO 문자열로 변환
   const safeDate = someDate instanceof Date ? someDate.toISOString() : someDate;
   ```

## 3. 주요 파일 체크리스트 및 검증 방법

변경 전 각 파일에서 아래 항목을 반드시 확인하세요:

### 3.1 필수 체크 항목

1. **types.d.ts**
   - [ ] MethodParamsMapping에 명령어 정의됨
   - [ ] MethodReturnMapping에 반환 타입 정의됨
   - [ ] 파라미터/반환 타입 간 일관성 유지

2. **main.ts**
   - [ ] IPC_CHANNELS 상수에 명령어 추가됨
   - [ ] ipcMain.handle 호출로 핸들러 등록됨
   - [ ] 필요한 함수가 import됨
   - [ ] try-catch로 오류 처리됨

3. **preload.cts**
   - [ ] electronAPI 객체에 메서드 추가됨
   - [ ] createMethodHandler 함수로 메서드 생성됨

4. **api.ts**
   - [ ] MethodParamsMapping 인터페이스에 명령어 추가됨
   - [ ] MethodReturnMapping 인터페이스에 반환 타입 추가됨
   - [ ] MockApiAdapter의 switch 문에 case 추가됨

5. **stores.ts**
   - [ ] 필요시 새 스토어 추가됨
   - [ ] api.invokeMethod 호출하는 액션 함수 추가됨
   - [ ] 적절한 로깅 및 오류 처리 포함됨

### 3.2 검증 방법

1. **타입 검증**
   ```bash
   npm run typecheck
   # 또는
   npx tsc --noEmit
   ```

2. **빌드 검증**
   ```bash
   npm run build
   ```

3. **런타임 테스트**
   - 개발 모드에서 새 기능 테스트
   - 콘솔 로그에서 오류 확인
   - 모든 시나리오(성공, 실패, 오류 등) 테스트

## 4. 고급 IPC 통신 패턴

### 4.1 구독 기반 이벤트 패턴

메인 프로세스에서 발생하는 이벤트를 렌더러 프로세스에서 구독할 경우:

1. **main.ts**
   ```typescript
   // 이벤트 발생 시 모든 창에 알림
   function broadcastEvent(eventName: string, data: any) {
     BrowserWindow.getAllWindows().forEach(win => {
       win.webContents.send(eventName, data);
     });
   }
   
   // 특정 상황에서 이벤트 발생
   someEmitter.on('someEvent', (data) => {
     broadcastEvent('someEventName', data);
   });
   ```

2. **preload.cts**
   ```typescript
   // 이벤트 구독 기능 추가
   const electronAPI = {
     // ...기존 코드
     subscribeToEvent: (eventName: string, callback: (data: any) => void) => {
       const subscription = (_event: Electron.IpcRendererEvent, data: any) => callback(data);
       ipcRenderer.on(eventName, subscription);
       return () => {
         ipcRenderer.removeListener(eventName, subscription);
       };
     },
   };
   ```

3. **stores.ts**
   ```typescript
   // 이벤트 구독 설정
   const unsubscribe = api.subscribeToEvent('someEventName', (data) => {
     // 데이터 처리 및 상태 업데이트
     someStore.set(data);
   });
   
   // 컴포넌트 언마운트 또는 재구성 시 구독 해제
   onCleanup(() => unsubscribe());
   ```

### 4.2 대용량 데이터 전송

큰 데이터를 IPC로 전송할 때 최적화 방법:

1. **청크 분할 전송**
   ```typescript
   // 메인 프로세스
   async function sendLargeData(win: BrowserWindow, data: any[]) {
     const chunkSize = 1000;
     for (let i = 0; i < data.length; i += chunkSize) {
       const chunk = data.slice(i, i + chunkSize);
       win.webContents.send('data-chunk', {
         chunk,
         index: i / chunkSize,
         total: Math.ceil(data.length / chunkSize)
       });
       // 렌더러 프로세스 차단 방지를 위한 지연
       await new Promise(resolve => setTimeout(resolve, 0));
     }
     win.webContents.send('data-complete');
   }
   
   // 렌더러 프로세스 (preload.cts로 노출 후)
   let accumulatedData: any[] = [];
   
   api.subscribeToEvent('data-chunk', ({ chunk, index, total }) => {
     accumulatedData = [...accumulatedData, ...chunk];
     progressStore.set({ current: index + 1, total });
   });
   
   api.subscribeToEvent('data-complete', () => {
     dataStore.set(accumulatedData);
     accumulatedData = [];
   });
   ```

2. **파일 시스템 중개 사용**
   ```typescript
   // 메인 프로세스
   const tempFile = path.join(app.getPath('temp'), 'large-data.json');
   fs.writeFileSync(tempFile, JSON.stringify(data));
   win.webContents.send('data-ready', tempFile);
   
   // 렌더러 프로세스
   api.subscribeToEvent('data-ready', async (filePath) => {
     const response = await fetch(`file://${filePath}`);
     const data = await response.json();
     dataStore.set(data);
   });
   ```

## 5. 타입 안전성 강화

### 5.1 타입 가드 패턴

```typescript
// 타입 가드 정의
function isSuccessResponse<T>(response: any): response is { success: true, data: T } {
  return response && response.success === true && 'data' in response;
}

function isErrorResponse(response: any): response is { success: false, error: string } {
  return response && response.success === false && 'error' in response;
}

// 사용 예시
const response = await api.invokeMethod('someMethod');
if (isSuccessResponse<ExpectedType>(response)) {
  // 성공 응답 처리
  useData(response.data);
} else if (isErrorResponse(response)) {
  // 오류 응답 처리
  showError(response.error);
} else {
  // 예상치 못한 응답 형식
  console.error('Unexpected response format:', response);
}
```

### 5.2 Generic 활용

```typescript
// api.ts에서 명확한 타입 시그니처 설정
async function invokeMethod<K extends keyof MethodParamsMapping, R = MethodReturnMapping[K]>(
  methodName: K,
  params?: MethodParamsMapping[K]
): Promise<R> {
  // 구현...
}

// 사용 예시
const result = await invokeMethod('getUserData', { userId: 123 });
// result는 MethodReturnMapping['getUserData'] 타입으로 추론됨
```

## 6. 보안 고려사항

### 6.1 안전한 IPC 통신

1. **입력 검증**
   ```typescript
   // 메인 프로세스에서 입력 검증
   ipcMain.handle('someMethod', async (event, args) => {
     // 스키마 검증 (예: Zod, Joi 등 사용)
     const schema = z.object({
       id: z.number(),
       name: z.string().min(1)
     });
     
     try {
       // 검증 수행
       const validArgs = schema.parse(args);
       // 검증된 데이터로 작업 수행
       return { success: true, data: await processData(validArgs) };
     } catch (error) {
       return { 
         success: false, 
         error: error instanceof z.ZodError 
           ? '입력 데이터가 유효하지 않습니다' 
           : String(error)
       };
     }
   });
   ```

2. **권한 제한**
   ```typescript
   // 보안에 민감한 작업은 명시적 허용 로직 추가
   ipcMain.handle('fileOperation', async (event, args) => {
     // 허용된 경로인지 확인
     if (!isAllowedPath(args.path)) {
       return { success: false, error: '접근 권한이 없습니다' };
     }
     
     // 작업 수행
     // ...
   });
   ```

## 7. IPC 명령어 관리 모범 사례

1. **명령어 집중 관리**
   - 모든 IPC 명령어 상수를 한 파일에서 관리
   - 동일한 명령어 문자열을 중복 정의하지 않기

2. **예측 가능한 응답 형식**
   - 모든 IPC 응답에 일관된 형식 사용 (예: `{ success: boolean, data?: T, error?: string }`)
   - 오류 발생 시 명확한 오류 메시지 제공

3. **코드 구조화**
   - 관련 IPC 핸들러를 모듈로 그룹화
   - 복잡한 핸들러 로직은 별도 함수로 분리

4. **문서화**
   - 각 IPC 명령어의 목적, 매개변수, 반환 값을 문서화
   - 변경 사항 기록 및 공유

## 8. 트러블슈팅 및 유용한 팁

### 8.1 일반적인 문제 해결

1. **IPC 메시지가 도달하지 않음**
   - preload 스크립트가 올바르게 로드되었는지 확인
   - contextIsolation과 nodeIntegration 설정 확인
   - 메시지 이름이 정확한지 확인

2. **타입 오류**
   - types.d.ts와 api.ts의 타입 정의가 일치하는지 확인
   - 문자열 리터럴 타입 사용 시 일치 여부 확인

3. **직렬화 오류**
   - Date, Function, 순환 참조를 포함한 객체는 직렬화할 수 없음
   - 직렬화 가능한 형태로 변환 후 전송

### 8.2 디버깅 방법

1. **로그 추가**
   ```typescript
   // 메인 프로세스
   ipcMain.handle('myMethod', async (event, args) => {
     console.log('[IPC:Main] myMethod called with:', args);
     // ...
   });
   
   // 렌더러 프로세스
   async function callMyMethod() {
     console.log('[IPC:Renderer] Calling myMethod with:', args);
     const result = await api.invokeMethod('myMethod', args);
     console.log('[IPC:Renderer] myMethod result:', result);
   }
   ```

2. **DevTools 활용**
   - 메인 프로세스 디버깅: `--inspect` 플래그로 노드 인스펙터 활성화
   - 렌더러 프로세스: `mainWindow.webContents.openDevTools()`

## 9. 참고 자료

1. [Electron IPC 공식 문서](https://www.electronjs.org/docs/latest/api/ipc-main)
2. [보안 체크리스트](https://www.electronjs.org/docs/latest/tutorial/security)
3. [IPC 예제 코드](https://github.com/electron/electron-quick-start/blob/master/main.js)