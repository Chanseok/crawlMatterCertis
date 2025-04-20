
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
  