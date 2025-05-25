# 배치 재시도 메커니즘 구현 문서

## 개요
이 문서는 크롤링 작업에서 배치 처리 재시도 메커니즘의 구현 내용을 설명합니다. 배치 처리 중 실패가 발생할 경우, 시스템은 구성 가능한 횟수만큼 해당 배치를 자동으로 재시도하고, 모든 재시도가 실패하면 크롤링 프로세스를 중지합니다.

## 주요 구현 내용

### 1. 타입 정의 업데이트
`types.d.ts` 파일에 배치 재시도 관련 설정 및 상태를 저장하기 위한 필드를 추가했습니다:

```typescript
// CrawlerConfig 인터페이스에 batchRetryLimit 필드 추가
export interface CrawlerConfig {
  // ... 기존 필드 ...
  batchRetryLimit?: number;  // 배치 실패 시 재시도 횟수 (기본값: 3)
}

// CrawlingProgress 인터페이스에 배치 재시도 상태 필드 추가
export type CrawlingProgress = {
  // ... 기존 필드 ...
  batchRetryCount?: number;  // 현재 배치의 재시도 횟수
  batchRetryLimit?: number;  // 배치 최대 재시도 횟수
}
```

### 2. 기본 설정 추가
`ConfigManager.ts`에 배치 재시도 관련 기본 설정을 추가했습니다:

```typescript
// 배치 재시도 관련 상수 정의
const MIN_BATCH_RETRY_LIMIT = 1;
const MAX_BATCH_RETRY_LIMIT = 10;

// 기본 설정 값에 batchRetryLimit 추가
const DEFAULT_CONFIG: CrawlerConfig = {
  // ... 기존 필드 ...
  batchRetryLimit: 3, // 기본 배치 재시도 횟수
}
```

### 3. 설정 검증 추가
`ConfigManager.ts`의 `updateConfig` 메서드에 배치 재시도 횟수 검증 로직을 추가했습니다:

```typescript
// 배치 재시도 횟수 검증
if (this.config.batchRetryLimit !== undefined) {
  if (this.config.batchRetryLimit < MIN_BATCH_RETRY_LIMIT) this.config.batchRetryLimit = MIN_BATCH_RETRY_LIMIT;
  if (this.config.batchRetryLimit > MAX_BATCH_RETRY_LIMIT) this.config.batchRetryLimit = MAX_BATCH_RETRY_LIMIT;
}
```

### 4. UI 설정 컴포넌트 업데이트
`CrawlingSettings.tsx`에 배치 재시도 횟수 설정 UI 요소를 추가했습니다:

```tsx
{/* 배치 재시도 횟수 설정 */}
<div>
  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
    배치 재시도 횟수 (1~10)
  </label>
  <div className="flex items-center">
    <input
      type="range"
      min="1"
      max="10"
      value={batchRetryLimit}
      onChange={(e) => setBatchRetryLimit(parseInt(e.target.value))}
      className="w-full mr-3"
    />
    <input
      type="number"
      min="1"
      max="10"
      value={batchRetryLimit}
      onChange={(e) => {
        const value = parseInt(e.target.value);
        if (!isNaN(value) && value >= 1 && value <= 10) {
          setBatchRetryLimit(value);
        }
      }}
      className="w-16 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-right"
    />
  </div>
  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
    배치 처리 실패 시 자동 재시도 횟수입니다. 네트워크 불안정 등의 일시적 오류에 대응합니다.
  </p>
</div>
```

### 5. 배치 재시도 로직 구현
`CrawlerEngine.ts`에 배치 재시도 로직을 구현했습니다. 배치가 실패하면 설정된 횟수만큼 재시도하고, 모든 재시도가 실패하면 크롤링을 중지합니다:

```typescript
// 배치 처리 설정 가져오기
const batchSize = currentConfig.batchSize || 30;
const batchDelayMs = currentConfig.batchDelayMs || 2000;
const enableBatchProcessing = currentConfig.enableBatchProcessing !== false;
const batchRetryLimit = currentConfig.batchRetryLimit || 3;

// 배치 수집 시도 (실패 시 재시도)
while (!batchSuccess && batchRetryCount <= batchRetryLimit) {
  try {
    // 배치 처리 시도...
    
    // 실패 확인 및 재시도 로직
    if (failedPages.length === 0) {
      batchSuccess = true;
    } else {
      batchRetryCount++;
      
      if (batchRetryCount > batchRetryLimit) {
        // 최대 재시도 횟수 초과 시 크롤링 중단
        this.state.reportCriticalFailure(`배치 ${batchNumber} 처리 실패 (${batchRetryLimit}회 재시도 후)`);
        return false;
      }
      
      // 실패한 페이지 초기화 (재시도를 위해)
      this.state.resetFailedPages();
    }
  } catch (error) {
    // 오류 처리 및 재시도 로직
  }
}
```

### 6. 실패한 페이지 초기화 기능 추가
`CrawlerState.ts`에 실패한 페이지를 초기화하는 메서드를 추가했습니다:

```typescript
/**
 * 실패한 페이지 목록 초기화
 * 배치 재시도 등에 사용
 */
public resetFailedPages(): void {
  this.failedPages = [];
  this.failedPageErrors = {};
  console.log('[CrawlerState] Failed pages have been reset for retry.');
}
```

### 7. 진행 상황 UI 업데이트
`CrawlingDashboard.tsx`에 배치 재시도 상태를 표시하는 UI 요소를 추가했습니다:

```tsx
{progress.batchRetryCount !== undefined && progress.batchRetryCount > 0 && (
  <span className="ml-2 text-amber-600 dark:text-amber-400">
    (재시도: {progress.batchRetryCount}/{progress.batchRetryLimit || 3})
  </span>
)}
```

## 사용 방법
배치 재시도 기능은 다음과 같이 사용할 수 있습니다:

1. 크롤링 설정 화면에서 배치 재시도 횟수를 1~10 사이로 설정합니다.
2. 크롤링 작업 중 배치 처리가 실패하면 시스템은 자동으로 설정된 횟수만큼 재시도합니다.
3. 재시도 상태는 크롤링 대시보드의 배치 처리 정보에 표시됩니다.
4. 모든 재시도가 실패하면 크롤링 작업이 중단되고 오류 메시지가 표시됩니다.

## 이점
- 일시적인 네트워크 오류나 서버 응답 지연 등으로 인한 배치 처리 실패를 자동으로 복구합니다.
- 지수 백오프 방식을 적용하여 재시도 간격을 점진적으로 증가시켜 서버 부하를 줄입니다.
- 최대 재시도 횟수를 초과한 경우 크롤링을 자동으로 중단하여 불필요한 리소스 소비를 방지합니다.
- 사용자에게 배치 재시도 상태를 시각적으로 제공하여 크롤링 작업의 진행 상황을 명확하게 파악할 수 있게 합니다.
