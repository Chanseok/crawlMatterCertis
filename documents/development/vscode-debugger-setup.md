# VS Code 디버거 설정 및 Electron 경로 문제 해결 교훈

Electron 애플리케이션을 VS Code로 디버깅할 때, 특히 `preload` 스크립트나 UI 리소스 경로와 관련된 문제가 발생할 수 있습니다. 이 문서는 `app.getAppPath()`의 동작 차이로 인해 발생했던 문제를 해결하고, 일관된 디버깅 환경을 설정하는 과정에서 얻은 교훈을 정리합니다.

## 문제 상황

1.  **UI 로드 실패 (흰 화면)**: `npm run dev`로 실행하면 정상적으로 UI가 로드되지만, VS Code 디버거로 실행하면 초기 로드 후 흰 화면으로 변경되거나, `preload` 스크립트를 찾지 못하는 오류 발생.
2.  **`preload` 스크립트 경로 오류**: DevTools 콘솔에 `Cannot find module '/path/to/project/dist-electron/electron/dist-electron/electron/preload.cjs'`와 같이 경로가 중복되어 `preload` 스크립트를 찾지 못하는 오류가 나타남.

## 원인 분석

핵심 원인은 Electron의 `app.getAppPath()` API가 실행 환경에 따라 다른 값을 반환하기 때문이었습니다.

*   **`npm run dev` (또는 터미널에서 `electron .` 실행 시)**:
    *   `app.getAppPath()`는 일반적으로 프로젝트의 루트 디렉터리 (예: `/Users/chanseok/Codes/crawlMatterCertis`)를 반환합니다.
*   **VS Code 디버거 (기본 설정 시)**:
    *   `.vscode/launch.json`의 `program` 속성이 특정 파일 (예: `${workspaceFolder}/dist-electron/electron/main.js`)을 가리키는 경우, `app.getAppPath()`는 해당 `program` 파일이 위치한 디렉터리 (예: `/Users/chanseok/Codes/crawlMatterCertis/dist-electron/electron`)를 반환하는 경향이 있습니다.

이러한 `app.getAppPath()` 반환값의 차이로 인해, `preload` 스크립트 경로를 `path.join(app.getAppPath(), 'dist-electron/electron/preload.cjs')`와 같이 구성하는 코드(`src/electron/pathResolver.ts`의 `getPreloadPath` 함수)는 디버깅 환경에서 경로 중복 문제를 일으켰습니다.

## 해결 과정 및 교훈

### 1. `NODE_ENV` 환경 변수 설정의 중요성

*   **교훈**: UI가 Vite 개발 서버(`http://localhost:5123`)에서 로드되어야 하는 개발 환경에서는 `NODE_ENV=development` 환경 변수가 필수적입니다.
*   **적용**: `.vscode/launch.json`의 디버깅 설정에 `"env": { "NODE_ENV": "development" }`를 추가하여 `isDev()` 유틸리티 함수가 올바르게 작동하고, `getUIPath()` 함수가 개발 서버 URL을 반환하도록 했습니다.

### 2. `app.getAppPath()` 동작 일관성 확보

*   **교훈**: `app.getAppPath()`가 일관된 경로(프로젝트 루트)를 반환하도록 디버깅 환경을 구성하는 것이 중요합니다.
*   **시도 1: `cwd` 설정**:
    *   `.vscode/launch.json`에 `"cwd": "${workspaceFolder}"`를 추가하여 Electron 프로세스의 작업 디렉터리를 프로젝트 루트로 명시했습니다.
    *   **결과**: 이 설정만으로는 `app.getAppPath()`의 반환값이 디버깅 시 프로젝트 루트로 변경되지 않았습니다.
*   **시도 2 (성공): `program` 설정 변경**:
    *   `.vscode/launch.json`의 `program` 속성 값을 특정 `main.js` 파일 경로에서 프로젝트 루트 디렉터리(`"${workspaceFolder}"`)로 변경했습니다.
    *   **원리**: 이렇게 하면 Electron은 해당 폴더의 `package.json`에 명시된 `main` 스크립트(현재 프로젝트에서는 `dist-electron/electron/main.js`)를 찾아 실행하게 됩니다. 이 과정에서 Electron은 `workspaceFolder`를 애플리케이션의 루트로 인식하여, `app.getAppPath()`가 `npm run dev`와 동일하게 프로젝트 루트를 반환하게 됩니다.
    *   **결과**: `app.getAppPath()`가 디버깅 시에도 프로젝트 루트를 반환하여 경로 문제가 해결되었습니다.

### 3. `pathResolver.ts`의 견고한 경로 구성

*   **교훈**: `app.getAppPath()`가 일관되게 프로젝트 루트를 반환하게 되면, `getPreloadPath` 함수 내에서 `path.join(appPath, 'dist-electron/electron/preload.cjs')`와 같은 경로 구성 로직이 모든 환경에서 올바르게 작동합니다.
*   **참고**: 만약 `app.getAppPath()`의 동작을 제어할 수 없는 상황이라면, `getPreloadPath` 함수 내에서 `appPath`의 값을 확인하고 조건에 따라 경로를 다르게 구성하거나, `__dirname` (컴파일된 JavaScript 파일 기준)을 사용하여 프로젝트 루트로부터의 상대 경로를 계산하는 방어적인 로직을 구현할 수 있습니다.

## 최종 `launch.json` 권장 설정

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Electron Main Process",
      "runtimeExecutable": "${workspaceFolder}/node_modules/.bin/electron",
      "runtimeArgs": ["--remote-debugging-port=9222"],
      "program": "${workspaceFolder}", // Electron이 프로젝트 루트를 앱으로 인식
      "preLaunchTask": "transpile:electron", // main.js 빌드 작업
      "outFiles": ["${workspaceFolder}/dist-electron/**/*.js"],
      "sourceMaps": true,
      "console": "integratedTerminal",
      "cwd": "${workspaceFolder}", // 작업 디렉토리를 프로젝트 루트로 명시
      "env": {
        "NODE_ENV": "development" // 개발 모드 설정
      }
    }
    // 다른 디버깅 설정들...
  ]
}
```

## 결론

Electron 애플리케이션 디버깅 시 `app.getAppPath()`의 동작 특성을 이해하고, `.vscode/launch.json`의 `program` 및 `env` 설정을 적절히 조정함으로써 개발 환경과 디버깅 환경 간의 동작 차이를 최소화하고 안정적인 디버깅 환경을 구축할 수 있습니다. 경로 문제는 주로 `app.getAppPath()`의 반환값 불일치에서 비롯되므로, 이 값을 기준으로 경로를 구성하는 로직을 신중하게 작성해야 합니다.
