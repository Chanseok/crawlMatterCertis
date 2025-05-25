# 프로젝트 문서 구조

이 디렉토리는 crawlMatterCertis 프로젝트의 모든 문서를 체계적으로 관리합니다.

## 디렉토리 구조

### 📐 Architecture (`architecture/`)
시스템 아키텍처 및 설계 관련 문서
- `overview.md` - 전체 아키텍처 개요
- `electron-react.md` - Electron-React 통합 구조
- `domain-hooks.md` - Domain Hooks 아키텍처

### 🛠️ Development (`development/`)
개발 관련 문서 및 가이드
- `ipc-manual.md` - Electron IPC 매뉴얼
- `vscode-debugger-setup.md` - VS Code 디버거 설정
- `crawler-timeout-*.md` - 크롤러 타임아웃 관련 문서
- `timeout-fix-solution.md` - 타임아웃 문제 해결책
- `crawler-type-implementation.md` - 크롤러 타입 구현
- `lessons-learned-config-cache.md` - 설정 캐시 관련 교훈
- `todo-memo.md` - 개발 할일 메모

#### 📦 Batch Processing (`development/batch-processing/`)
배치 처리 관련 전문 문서
- `summary.md` - 배치 크롤링 요약
- `implementation-guide.md` - 구현 가이드
- `crawler-changes.md` - 크롤러 변경사항
- `batch-processing-guide*.md` - 배치 처리 가이드 (다국어)
- `batch-test-guide*.md` - 배치 테스트 가이드
- `mock-testing-guide*.md` - 모킹 테스트 가이드
- 기타 배치 관련 상세 문서들

### 🔄 Refactoring (`refactoring/`)
리팩토링 관련 문서
- `solution-summary.md` - 솔루션 요약
- `improvement-log.md` - 개선 로그
- `domain-store-migration-complete.md` - Domain Store 마이그레이션 완료
- `ui-synchronization-fixes-complete.md` - UI 동기화 수정 완료
- `ui-fixes-explanation.md` - UI 수정 설명
- `improving.md` - 개선 사항
- `productlist-refactoring.md` - ProductList 리팩토링
- `phase2-documentation.md` - 2단계 리팩토링 문서
- `typesafety-improvements.md` - 타입 안전성 개선
- `progress-documentation-ko.md` - 리팩토링 진행 문서 (한국어)

### 📋 Requirements (`requirements/`)
요구사항 및 기획 관련 문서
- `product-requirements.md` - 제품 요구사항
- `buildings.md` - 빌딩 관련 요구사항

### 📚 Guides (`guides/`)
사용자 가이드 및 매뉴얼
- `build-with-agent.md` - 에이전트와 함께 빌드하기

## 문서 작성 규칙

1. **파일명**: kebab-case 사용 (예: `domain-store-migration.md`)
2. **언어**: 기본 영어, 필요시 한국어 문서는 `-ko` 접미사 사용
3. **구조**: 각 카테고리별로 명확한 목적과 범위 유지
4. **업데이트**: 문서 변경 시 이 README도 함께 업데이트

## 최근 정리 현황

- ✅ 루트 레벨 문서들을 카테고리별로 분류 완료
- ✅ 테스트 파일들을 `test-legacy/` 디렉토리로 이동
- ✅ 임시 텍스트 파일들을 마크다운으로 변환하여 정리
- ✅ 배치 처리 관련 문서들을 전용 서브디렉토리로 구성
- ✅ 일관된 파일명 규칙 적용

## 다음 단계

1. 소스 코드 구조 개선
2. DomainStoreDemo 컴포넌트 분리
3. 공통 컴포넌트 추출
4. 타입 시스템 통합
