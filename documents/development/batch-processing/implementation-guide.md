# 배치 처리 기능 구현 가이드

현재 앱에서는 ProductListCollector와 CrawlerEngine 코드에 문법적 오류가 있어 자동 수정이 어렵습니다. 아래 단계별로 수동으로 구현하는 것을 권장합니다.

## 1. types.d.ts 파일에 배치 처리 관련 설정 추가 (완료됨)

```typescript
// 크롤러 설정 타입 (CrawlerConfig 인터페이스)에 아래 속성 추가
batchSize?: number;          // 배치당 페이지 수 (기본값: 30)
batchDelayMs?: number;       // 배치 간 지연 시간 (ms) (기본값: 2000)
enableBatchProcessing?: boolean; // 배치 처리 활성화 여부 (기본값: true)
```

## 2. CrawlerEngine.startCrawling() 메서드 수정

1. 메서드 상단에 배치 처리 설정 가져오기 추가:

```typescript
const batchSize = currentConfig.batchSize || 30; // 기본값 30페이지
const batchDelayMs = currentConfig.batchDelayMs || 2000; // 기본값 2초
const enableBatchProcessing = currentConfig.enableBatchProcessing !== false; // 기본값 true
```

2. 기존 코드 찾기:

```typescript
// 제품 목록 수집 실행
const products = await productListCollector.collect(userPageLimit);
```

3. 위 부분을 배치 처리 로직으로 교체:

```typescript
// 총 크롤링할 페이지 수 계산을 위한 범위 정보 가져오기
const { totalPages: totalPagesFromCache } = await productListCollector.fetchTotalPagesCached(true);
const crawlingRange = await PageIndexManager.calculateCrawlingRange(
  totalPagesFromCache,
  0, // lastPageProductCount 접근 제한으로 0 사용
  userPageLimit
);

// 크롤링할 페이지가 없는 경우 종료
if (crawlingRange.startPage <= 0 || crawlingRange.endPage <= 0 || crawlingRange.startPage < crawlingRange.endPage) {
  console.log('[CrawlerEngine] No pages to crawl.');
  this.isCrawling = false;
  return true;
}

// 총 크롤링할 페이지 수 계산
const totalPagesToCrawl = crawlingRange.startPage - crawlingRange.endPage + 1;
console.log(`[CrawlerEngine] Total pages to crawl: ${totalPagesToCrawl}, from page ${crawlingRange.startPage} to ${crawlingRange.endPage}`);

let products: Product[] = [];

// 배치 처리가 활성화되고 크롤링할 페이지가 배치 크기보다 큰 경우 배치 처리 실행
if (enableBatchProcessing && totalPagesToCrawl > batchSize) {
  console.log(`[CrawlerEngine] Using batch processing with ${batchSize} pages per batch`);
  
  // 배치 수 계산
  const totalBatches = Math.ceil(totalPagesToCrawl / batchSize);
  let currentPage = crawlingRange.startPage;
  
  // 수집된 모든 제품을 저장할 배열
  let allCollectedProducts: Product[] = [];
  
  // 각 배치 처리
  for (let batch = 0; batch < totalBatches; batch++) {
    if (this.abortController.signal.aborted) {
      console.log('[CrawlerEngine] Crawling aborted during batch processing.');
      break;
    }
    
    const batchNumber = batch + 1;
    console.log(`[CrawlerEngine] Processing batch ${batchNumber}/${totalBatches}`);
    
    // 배치 범위 계산
    const batchEndPage = Math.max(crawlingRange.endPage, currentPage - batchSize + 1);
    const batchRange = {
      startPage: currentPage,
      endPage: batchEndPage
    };
    
    // 이 배치를 위한 새로운 수집기 생성
    const batchCollector = new ProductListCollector(
      this.state,
      this.abortController,
      currentConfig,
      this.browserManager!
    );
    
    batchCollector.setProgressCallback(enhancedProgressUpdater);
    
    // 이 배치에 대한 페이지 범위 설정
    console.log(`[CrawlerEngine] Collecting batch ${batchNumber} range: ${batchRange.startPage} to ${batchRange.endPage}`);
    const batchProducts = await batchCollector.collectPageRange(batchRange);
    
    // 결과 합치기
    allCollectedProducts = allCollectedProducts.concat(batchProducts);
    
    // 이 배치의 실패 확인
    const failedPages = this.state.getFailedPages();
    if (failedPages.length > 0) {
      console.warn(`[CrawlerEngine] Batch ${batchNumber} completed with ${failedPages.length} failed pages.`);
    }
    
    // 다음 배치 준비
    currentPage = batchEndPage - 1;
    
    // 각 배치 후 리소스 해제
    await batchCollector.cleanupResources();
    
    // 배치간 지연 추가
    if (batch < totalBatches - 1) {
      console.log(`[CrawlerEngine] Waiting ${batchDelayMs}ms before next batch...`);
      await new Promise(resolve => setTimeout(resolve, batchDelayMs));
    }
  }
  
  // 모든 배치에서 수집된 제품 저장
  products = allCollectedProducts;
} else {
  // 작은 수집에 대해서는 원래 비배치 프로세스 사용
  console.log('[CrawlerEngine] Using standard processing (no batching needed)');
  productListCollector.setProgressCallback(enhancedProgressUpdater);
  products = await productListCollector.collect(userPageLimit);
}
```

## 3. 성능 개선 효과

이 구현을 통해 다음과 같은 성능 개선 효과를 얻을 수 있습니다:

1. **메모리 사용량 감소**: 전체 페이지를 한 번에 처리하지 않고 작은 배치로 나누어 처리하므로 메모리 사용량이 줄어듭니다.
2. **안정성 향상**: 각 배치가 완료될 때마다 리소스를 해제하므로 장시간 실행 시 메모리 누수가 줄어듭니다.
3. **오류 복구 향상**: 한 배치에서 오류가 발생해도 전체 크롤링이 중단되지 않고 다음 배치는 정상적으로 진행됩니다.
4. **시스템 부하 분산**: 배치 간 지연 시간을 둠으로써 시스템과 네트워크 부하를 분산시킵니다.

## 4. 주의사항

1. ProductListCollector의 문법 오류를 먼저 수정해야 배치 처리 기능이 정상 작동합니다.
2. 이 구현은 메모리 사용량과 시스템 리소스를 효율적으로 관리하는 데 도움이 되지만, 전체 크롤링 시간은 약간 증가할 수 있습니다(배치 간 지연 시간 때문).
3. 배치 크기는 시스템 메모리와 성능에 따라 조정하는 것이 좋습니다. 기본값은 30페이지이지만 필요에 따라 20~50 사이로 조정할 수 있습니다.
4. 첫 번째 구현에서는 배치 간 고정 지연 시간(2초)을 사용하지만, 필요하면 나중에 동적 지연 시간 알고리즘으로 업그레이드할 수 있습니다.
