
## Step 0
### PRD

## Step 1
### creation
``` npm create vite . ```

``` npm i ```

``` npm run dev ```

### src folder tree 
- src/ui folder 를 만들고 이동, index.html에 경로 반영
- public의 vite.svg 로고 파일 삭제하고, app.tsx에서도 삭제 반영
- ...

### install electron
``` npm install --save-dev electron ```

### add for electron
- add src/electron/main.js (이 시점에서는 .ts 대신 .js로 ...)
- modify package.json - main, and script
- ``` npm run dev:electron  ```
- to fix path problem in '/dist-react/index.html', add base: './' in vite.config.ts
-  
### setting typescript for electron
- root의 tsconfig에서 src/electron은 제외하고, src/electron 내부에 tsconfig.json을 설정해서 electron 전용 typescipt configuration 적용
- package.json에 transpile:electron 옵션 생성
- package.json에 dist-electron의 main.js가 실행되도록 main의 경로 변경

### setting electron builder
- ``` npm i --save-dev electron-builder ```
- electron-builder.json으로 설정을 하고 
- package.json에서 '"dist:mac": "npm run transpile:electron && npm run build && electron-builder --mac --arm64",' 추가하고 
- ``` npm run dist:mac ``` 실행해서 ~.dmg 파일 생성 확인 및 (dmg 파일로 설치하지는 않고) dist/mac-arm64 아래의 실행 파일 확인

### improve dx
- ``` npm i --save-dev cross-env ```
- vite.config.ts에서 server port를 고정하고 util.ts에서 isDev() 함수를 만들어서 NODE_ENV === 'development'인 상황에선 main에서 loadUrl을 하고 배포버전에서는 index.html을 loadFile하도록 수정해서 HMR을 활용할 수 있도록 함
- ``` npm i --save-dev npm-run-all ```
- package.json의 스크립트 추가
  
### system feature 사용 (POC)
- ``` npm i os-utils ```
- ``` npm i --save-dev @types/os-utils ```

### ipc 측면 구현

### ui chart 구현 
- ``` npm install recharts ```

### tauri 전환을 위한 platform layer 추가 

### 필요한 모듈 추가 설치 
요구사항에 맞는 모듈들을 설치하겠습니다. 그 후 동작 테스트를 진행해보겠습니다.

먼저 필요한 모든 모듈을 설치하겠습니다:
``` npm install playwright playwright-chromium better-sqlite3 tailwindcss postcss autoprefixer nanostores @nanostores/react exceljs date-fns zod nanoid ```
기본 모듈 설치가 성공적으로 완료되었습니다. 이제 개발에 필요한 타입 정의 파일을 설치하겠습니다:
``` npm install --save-dev @types/better-sqlite3 @types/tailwindcss ```
모듈 설치가 성공적으로 완료되었습니다. 설치된 모듈은 다음과 같습니다:
1. **크롤링 관련**: playwright, playwright-chromium
2. **데이터베이스 관련**: better-sqlite3 
3. **UI 관련**: tailwindcss, postcss, autoprefixer
4. **상태 관리**: nanostores, @nanostores/react
5. **유틸리티**: exceljs, date-fns, zod, nanoid
6. **타입 정의 (개발용)**: @types/better-sqlite3, @types/tailwindcss

이제 Tailwind CSS를 초기화하여 프로젝트에 설정하겠습니다:
``` npx tailwindcss init -p ```
Tailwind CSS 초기화 명령어에서 문제가 발생했습니다. 이는 npm이 실행 파일을 결정할 수 없다는 오류입니다. 다른 방법으로 Tailwind CSS를 설정해보겠습니다.

먼저 설치된 모듈들이 정상적으로 동작하는지 확인하기 위해 간단한 테스트를 진행해보겠습니다:
``` node -e "console.log('Installed modules: ' + ['playwright', 'better-sqlite3', 'tailwindcss', 'nanostores', 'exceljs', 'date-fns', 'zod', 'nanoid'].map(m => { try { require.resolve(m); return m + ' ✓'; } catch(e) { return m + ' ✗'; } }).join(', '))" ```
모든 필요한 모듈들이 성공적으로 설치되었습니다! 테스트 결과를 보면 다음 모듈들이 모두 정상적으로 설치되어 사용 가능한 상태입니다:

- playwright ✓ (웹 크롤링)
- better-sqlite3 ✓ (SQLite 데이터베이스)
- tailwindcss ✓ (UI 스타일링)
- nanostores ✓ (상태 관리)
- exceljs ✓ (Excel 파일 생성)
- date-fns ✓ (날짜 처리)
- zod ✓ (데이터 유효성 검증)
- nanoid ✓ (고유 ID 생성)

Tailwind CSS 초기화 명령어에서 약간의 문제가 있었지만, 패키지 자체는 정상적으로 설치되었습니다. Tailwind CSS 설정은 수동으로 진행할 수 있습니다.

이제 프로젝트에서 필요한 모든 모듈이 설치되었습니다. 실제로 프로젝트를 실행해보면서 동작을 테스트해 볼 수 있습니다. 다음 단계로는:

1. Tailwind CSS 설정 파일을 수동으로 생성하고 설정
2. 프로젝트 코드에 필요한 모듈을 import하여 사용 시작
3. 크롤링, 데이터베이스, UI 등 각 기능별로 구현 진행

필요하시다면 Tailwind CSS 설정 파일을 수동으로 생성하거나, 실제 기능 구현을 시작할 수 있도록 도와드릴 수 있습니다. 어떤 부분부터 진행하면 좋을지 알려주시겠어요?