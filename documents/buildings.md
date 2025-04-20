
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