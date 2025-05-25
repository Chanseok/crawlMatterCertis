// 배치 크롤링 구현을 위한 변경 사항
// 아래 코드를 CrawlerEngine.ts의 startCrawling 메서드에 적용하세요.

// Step 1: 배치 처리 설정 추가
const batchSize = currentConfig.batchSize || 30; // 기본값 30페이지
const batchDelayMs = currentConfig.batchDelayMs || 2000; // 기본값 2초
const enableBatchProcessing = currentConfig.enableBatchProcessing !== false; // 기본값 true

// Step 2: 아래 코드를 기존 상단에 추가
// totalPages 정보 가져오기
const { totalPages: totalPagesFromCache } = await productListCollector.fetchTotalPagesCached(true);

// 크롤링 범위 계산
const crawlingRange = await PageIndexManager.calculateCrawlingRange(
  totalPagesFromCache,
  0, // lastPageProductCount 접근 문제로 0으로 설정
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

// Step 3: 이 부분을 아래의 코드로 교체
//const products = await productListCollector.collect(userPageLimit);

// 배치 처리 로직 구현
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

// 위 코드를 startCrawling 메서드에 적용하세요.
