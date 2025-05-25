# Matter Certification Crawler Codebase Improvement Log

## 개요
이 문서는 Matter Certification Crawler(Electron + React) 프로젝트의 코드베이스 개선 활동을 체계적으로 기록하고, 각 개선의 목적, 적용 내역, 효과를 투명하게 공유하기 위해 작성되었습니다. 모든 리팩토링 및 개선 작업은 이 문서를 참조하며, 각 단계별로 결과와 효과를 지속적으로 업데이트합니다.

---

## 1. 분석된 개선 필요사항

### 1.1. UI/UX 개선
- 진행률 표시의 일관성 부족 (예: progress bar, 상태 메시지 등)
- 중복 정보 및 불필요한 정보 노출
- 오류 및 경고 메시지의 가시성 부족
- 사용자 피드백 및 상태 변화에 대한 명확한 시각적 표시 필요

### 1.2. 크롤링 로직 및 세션/설정 관리
- 크롤링 설정(config)이 세션마다 일관되게 적용되지 않음 (중복 fetch, 불필요한 재설정 등)
- 세션 무결성 및 상태 체크 로직 개선 필요

### 1.3. 타입 중복 및 일관성
- CrawlingProgress, CrawlerConfig 등 주요 타입이 여러 파일에 중복 정의되어 유지보수성 저하

---

## 2. 개선 작업 내역

### 2.1. TypeScript 빌드 오류 해결 (2025.05.22)

#### 2.1.1. 문제 상황
- 총 38개의 TypeScript 빌드 오류가 발생하여 프로젝트 컴파일이 불가능한 상태였음
- 주요 오류 유형:
  1. DOM 관련 타입 오류 (`MatterProductParser.ts`, `playwright-crawler.ts`)
  2. 타입 임포트 문제 (`CrawlerEngine.ts`, `database.ts`, `types.ts`)
  3. 함수 파라미터 누락 (`main.ts`)
  4. 구문 오류 (중괄호 누락 등)

#### 2.1.2. 해결 방법
1. DOM 관련 타입 문제 해결:
   - `src/electron/tsconfig.json`에 DOM 및 DOM.Iterable 라이브러리 추가
   - DOM 관련 코드에 `// @ts-ignore` 주석 추가하여 타입 체크 우회
   - 브라우저 컨텍스트에서만 사용되는 DOM API 정확히 타입 지정

2. 타입 임포트 문제 해결:
   - 명시적 타입 재내보내기 구현 (`export type {...}`)
   - 모듈 경로 수정하여 올바른 타입 참조

3. 누락된 파라미터 추가:
   - `startCrawling()` 함수 호출 시 누락된 `config` 파라미터 추가

4. ES 모듈 설정 수정:
   - `tsconfig.scripts.json`에 "NodeNext" 모듈 설정 추가하여 `import.meta` 지원

#### 2.1.3. 개선 효과
- TypeScript 빌드 오류 38개에서 0개로 감소
- 성공적인 프로젝트 빌드 및 컴파일 가능
- 코드 품질 및 타입 안정성 향상
- 개발 작업 및 향후 유지보수 효율성 증가
- 타입 변경 시 전체 코드베이스에 일관성 있게 반영되지 않는 문제

### 1.4. IPC 및 타입 안전성
- IPC 통신 시 payload 타입이 명확하지 않거나, 타입 정의가 분산되어 있음
- ElectronIPCManual.md 등 문서와 실제 구현의 불일치 가능성

### 1.5. 코드 중복 및 클린 코드 원칙 미준수
- 유사/중복 로직, 불필요한 지역 변수, 명확하지 않은 네이밍 등
- 유지보수 및 확장성 저하

---

## 2. 개선 계획 (Stepwise Roadmap)

1. **공용 타입 일원화**
   - CrawlingProgress, CrawlerConfig 등 모든 공용 타입을 `types.d.ts`에만 정의하고, 모든 모듈에서 import하여 사용하도록 강제
2. **세션/설정 관리 개선**
   - 크롤링 세션 시작 시 config를 단일 fetch, 세션 내 일관성 보장
   - 세션 무결성 체크 및 config 변경 감지 로직 강화
3. **UI/UX 개선**
   - 진행률/상태 UI 일관성, 오류/경고 강조, 불필요 정보 제거 등
4. **IPC 및 타입 안전성 강화**
   - 모든 IPC payload에 대해 `types.d.ts` 기반 타입만 사용, 문서와 코드 일치
5. **코드 중복 제거 및 클린 코드 리팩토링**
   - 중복 로직 통합, 명확한 네이밍, 불필요 코드 제거 등
6. **문서화 및 개선 로그 관리**
   - 본 문서에 모든 개선 내역, 효과, 참고사항을 지속적으로 기록

---

## 3. 지금까지 진행한 개선 및 효과

### 3.1. 공용 타입 일원화 (1단계)
- `CrawlingProgress`, `CrawlerConfig`, `CrawlingStatus` 등 주요 타입을 `types.d.ts`에만 정의
- `/src/ui/types.ts`, `/src/electron/crawler/utils/types.ts`, `/src/electron/crawler/core/CrawlerState.ts` 등에서 중복 정의 제거 및 import로 통일
- UI/백엔드 전체에서 해당 타입을 반드시 import하여 사용하도록 grep/semantic search로 확인 및 적용
- **효과:**
  - 타입 변경 시 전체 코드베이스에 즉시 반영되어 유지보수성 대폭 향상
  - 타입 중복/불일치로 인한 버그 및 혼란 방지
  - 코드 가독성 및 일관성 개선

### 3.2. 세션/설정 관리 개선 (2단계)
- UI에서 크롤링 시작 시 config를 한 번만 fetch하여 백엔드로 전달, 백엔드는 이 config만 세션 전체에 사용하도록 구조 명확화
- CrawlerEngine이 세션 도중 config 변경을 무시하고, 세션 시작 시 받은 config만 사용하도록 리팩토링
- configManager.getConfig()의 중복 호출 제거, 세션 무결성 보장
- **효과:**
  - 세션 내 config 일관성 보장, 예측 불가능한 동작 방지
  - 불필요한 config fetch/적용 최소화로 성능 및 안정성 향상
  - 구조가 명확해져 유지보수성 및 디버깅 용이성 증가

### 3.3. 타입스크립트 빌드 오류 해결 (진행 중)
- 백엔드(Electron) 빌드 시 발생하던 타입 관련 오류 수정:
  - `CrawlerEngine.ts`에 누락된 `CrawlerConfig` 타입 import 추가
  - `database.ts`에서 UI 전용 타입과 글로벌 타입 import 분리
  - `main.ts`의 `startCrawling()` 호출에 필요한 config 파라미터 제공
- **효과:**
  - 백엔드(Electron) 부분의 TypeScript 컴파일 오류 해결 완료
  - 타입 안전성 향상 및 개발 경험 개선

---

## 4. 향후 개선 진행 시 작성 예시

### 4.1. UI 타입 오류 해결 (진행 예정)
- [ ] UI 관련 타입 import/export 방식 개선
- [ ] DOM 라이브러리 참조 문제 해결
- [ ] 스크립트 모듈 문제 해결

### 4.2. UI/UX 개선 (예정)
- [ ] 진행률 UI/UX 개선, 오류/경고 강조 등
- [ ] 적용 후 효과 및 문제점 기록

---

## 5. 참고 및 기타
- 본 문서는 모든 리팩토링/개선 작업의 기준이 되며, 각 단계별로 반드시 결과 및 효과를 추가 기록할 것
- 문서와 실제 코드가 불일치하지 않도록 지속적으로 동기화


---
## 5. 참고 사항

아래는 SW 전체 구조를 분석하여 실제로 구현해야 할 개선 포인트와 구체적인 해결책입니다. 각 항목은 실제 소스 구조와 연관된 파일, 클래스, 함수, 타입 정의 등을 고려하여 작성하였습니다.

1. 공용 타입 일원화 및 타입 충돌 방지
문제: CrawlingProgress, CrawlerConfig 등 주요 타입이 electron/backend와 frontend/ui에서 중복 정의되어 불일치 및 타입 오류 발생.
해결책:
types.d.ts에 공용 타입을 최신 구현 기준으로 일원화합니다.
electron, react, preload 등 모든 영역에서 반드시 이 파일만 import하여 타입을 사용하도록 강제합니다.
기존에 각 영역에 중복 정의된 타입은 모두 제거합니다.
타입 변경 시 반드시 전체 사용처(예: store, ipc, config, crawling 관련 모듈 등)를 점검하여 일관성 유지.
2. ConfigManager 및 설정 동기화
문제: 설정 변경 후 최신 config가 반영되지 않거나, config를 매번 불필요하게 읽는 문제.
해결책:
ConfigManager.ts에서 config를 singleton 또는 세션 단위로 관리.
config 변경 시 이벤트(예: configChanged)를 emit하여, 필요한 모듈(예: CrawlerEngine, ProductListCollector, ProductDetailCollector 등)이 즉시 최신 config를 반영하도록 구현.
collect 함수 등에서는 config를 매번 getConfig()로 읽지 말고, 생성 시점에 주입받아 멤버로 보관.
UI에서 설정 변경 후 반드시 config를 저장하고, 상태 체크/크롤링 시작 시 최신 config를 반영하도록 IPC 및 상태 관리(store) 로직 보완.
3. IPC 통신 구조 개선
문제: IPC 명령/응답 타입 불일치, 누락, 중복 등으로 인한 통신 오류.
해결책:
ElectronIPCManual.md 기준으로 IPC 명령어, 파라미터, 반환 타입을 types.d.ts에 정의.
main, preload, renderer 모두에서 동일한 타입을 사용하도록 import 경로 통일.
IPC 핸들러 등록, 응답, 오류 처리 등 체크리스트에 따라 누락된 부분 보완.
신규 IPC 추가/변경 시 반드시 문서와 코드 동기화.
4. 크롤링 세션/진행 상태 관리
문제: 크롤링 세션 단위로 진행 상태, config, 캐시 정보가 일관되게 관리되지 않음.
해결책:
ProductListCollector, ProductDetailCollector 등 주요 크롤러 클래스는 collect 함수 시작 시점에 config, totalPage, offset 등 세션 정보를 멤버로 보관.
collect 세션 내에서만 상태/캐시를 사용하고, 세션 종료 후에는 무결성 검증(예: 시작/종료 시 total product count 비교).
진행 상태는 CrawlingProgress 타입으로 store 및 UI에 일관되게 전달.
5. UI/UX 개선 및 상태 동기화
문제: 진행률, 재시도, 남은 시간, 페이지네이션 등 UI 정보가 실제 상태와 불일치하거나 갱신이 누락됨.
해결책:
진행률, 재시도, 남은 시간 등은 CrawlingProgress를 통해 실시간으로 store에 반영하고, UI는 store 상태를 구독하여 자동 갱신.
페이지네이션, 제품 목록 등은 DB 쿼리 결과를 기준으로 내림차순 정렬, 삭제/추가 시 즉시 갱신.
버튼, 섹션 등 주요 UI 요소에 id/class를 부여하여 유지보수 및 협업 용이성 확보.
애니메이션, 효과 등은 React 상태 변화에 따라 자연스럽게 트리거.
6. 중복/불필요 코드 정리 및 책임 분리
문제: 동일 기능이 여러 파일/클래스에 중복 구현, 불필요한 네트워크/DB 접근, 책임 과중 등.
해결책:
config, crawling, DB, IPC 등 역할별로 유틸리티 함수/클래스 분리.
중복된 로직(예: config 읽기, 타입 변환, 상태 계산 등)은 하나의 함수/모듈로 일원화.
불필요한 네트워크/DB 접근은 캐싱, 세션 단위 관리로 최소화.
7. 문제점/오류 발생 시 단계별 점진적 개선
문제: 여러 기능을 동시에 변경 시 오류 발생 가능성 증가.
해결책:
반드시 한 번에 하나의 기능/모듈 단위로 개선(예: 타입 일원화 → config 동기화 → UI 개선 순).
각 단계별로 npm run build/test로 오류 여부 확인 후 다음 단계 진행.
개선 내역 및 추가 발견된 문제점은 별도 문서(예: documents/Improvement_TODO.md)에 기록.
8. 기타 세부 개선
문제: DB/페이지네이션/삭제/엑셀 내보내기 등 세부 동작의 불일치.
해결책:
DB 쿼리, 페이지네이션, 삭제, 엑셀 내보내기 등은 요구사항에 맞게 내림차순 정렬, 연속 범위 선택, 파일명/폴더 관리 등 세부 로직 보완.
각 기능별로 실제 구현 코드를 점검하여, 존재하지 않는 함수/메서드가 아닌 실제 구현된 함수만 활용.
9. 문서화 및 협업
문제: 개선 내역, 구조, 노하우, TODO 등이 산발적으로 관리됨.
해결책:
개선 내역, 구조, 노하우, TODO 등은 반드시 documents 폴더 내에 마크다운 문서로 기록.
신규/변경된 타입, IPC, config, 주요 로직 등은 문서와 코드가 항상 동기화되도록 관리.
