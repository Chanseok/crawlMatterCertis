# 배치 재시도 메커니즘 빌드 오류 수정

## 발생한 오류
1. `failedPages` 변수가 선언되기 전에 사용됨
2. 스코프 밖에서 `batchCollector` 변수 참조됨

## 수정 내용

### 1. CrawlerEngine.ts 파일 수정
- 배치 성공 후 처리 부분에서 `failedPages` 변수 스코프 문제 해결
  - 기존 코드는 아직 선언되지 않은 `failedPages` 변수를 참조하고 있었음
  - 배치 성공 후 상태 확인을 위해 `currentFailedPages`라는 새 변수 생성하여 해결
- 스코프 밖에서 참조된 `batchCollector.cleanupResources()` 호출 제거
  - 이미 try/catch 블록 내에서 리소스 정리가 수행되므로 중복된 코드였음

### 2. CrawlerState.ts 파일 수정
- `resetFailedPages()` 메서드 구현 추가
  - 배치 재시도 시 실패한 페이지 목록과 오류 정보를 초기화하는 기능
  - 재시도 로직에서 이전 실패 정보를 정리하기 위해 필요

## 해결 결과
TypeScript 컴파일러가 더 이상 변수 스코프 관련 오류를 보고하지 않음. 몇 가지 미사용 변수 경고가 남아 있지만 기능에 영향을 주지 않으며, 향후 코드 정리 작업에서 처리할 수 있음.

## 남은 경고
1. 미사용 변수 (`startTime`, `totalPagesCount`, `productListRetryCount`, `firstRetryCycleAttemptNumber`, `app`, `event`)
   - 이 경고들은 코드 기능에 영향을 주지 않으며, 향후 코드 정리 작업에서 제거하거나 활용할 수 있음
