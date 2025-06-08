/**
 * test-missing-page-calculator.ts
 * MissingPageCalculator 테스트 스크립트
 */

import { MissingPageCalculator } from '/Users/chanseok/Codes/crawlMatterCertis/dist-electron/electron/services/MissingPageCalculator.js';

async function testMissingPageCalculator() {
  console.log('=== Missing Page Calculator Test ===');
  
  try {
    const calculator = new MissingPageCalculator();
    
    // 테스트 1: 페이지 ID 변환 테스트
    console.log('\n1. Testing page ID conversion...');
    const testPageIds = [0, 1, 50, 100, 463];
    testPageIds.forEach(pageId => {
      const pageNumber = calculator.pageIdToPageNumber(pageId);
      const backToPageId = calculator.pageNumberToPageId(pageNumber);
      console.log(`  PageID ${pageId} -> Page ${pageNumber} -> PageID ${backToPageId}`);
    });
    
    // 테스트 2: 크롤링 범위 계산 (실제 데이터 사용)
    console.log('\n2. Testing crawling range calculation...');
    const rangeResult = await calculator.calculateCrawlingRanges();
    
    console.log(`  Total incomplete pages: ${rangeResult.totalIncompletePages}`);
    console.log(`  Priority pages: ${rangeResult.priorityPages.length}`);
    console.log(`  Skipped pages: ${rangeResult.skippedPages.length}`);
    console.log(`  Continuous ranges: ${rangeResult.continuousRanges.length}`);
    console.log(`  Non-continuous ranges: ${rangeResult.nonContinuousRanges.length}`);
    
    // 범위 표시
    if (rangeResult.continuousRanges.length > 0) {
      console.log('\n  Continuous ranges:');
      const continuousDisplay = calculator.formatRangesForDisplay(rangeResult.continuousRanges);
      continuousDisplay.forEach((range, i) => {
        console.log(`    ${i + 1}. ${range}`);
      });
    }
    
    if (rangeResult.nonContinuousRanges.length > 0) {
      console.log('\n  Non-continuous ranges:');
      const nonContinuousDisplay = calculator.formatRangesForDisplay(rangeResult.nonContinuousRanges);
      nonContinuousDisplay.slice(0, 5).forEach((range, i) => {
        console.log(`    ${i + 1}. ${range}`);
      });
      if (nonContinuousDisplay.length > 5) {
        console.log(`    ... and ${nonContinuousDisplay.length - 5} more ranges`);
      }
    }
    
    // 테스트 3: 처리 시간 추정
    console.log('\n3. Testing processing time estimation...');
    const allRanges = [...rangeResult.continuousRanges, ...rangeResult.nonContinuousRanges];
    const timeEstimate = calculator.estimateProcessingTime(allRanges);
    
    console.log(`  Total pages to process: ${timeEstimate.totalPages}`);
    console.log(`  Estimated processing time: ${timeEstimate.estimatedTimeText}`);
    
    // 테스트 4: 특정 페이지들의 누락 인덱스 계산
    console.log('\n4. Testing missing indices calculation...');
    if (rangeResult.priorityPages.length > 0) {
      const samplePages = rangeResult.priorityPages.slice(0, 3);
      const missingIndices = await calculator.calculateMissingIndicesForPages(samplePages);
      
      console.log(`  Missing indices for sample pages:`);
      missingIndices.forEach((indices, pageId) => {
        const pageNumber = calculator.pageIdToPageNumber(pageId);
        console.log(`    Page ${pageNumber} (ID: ${pageId}): missing ${indices.length} indices [${indices.join(', ')}]`);
      });
    }
    
    console.log('\n✅ MissingPageCalculator tests completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testMissingPageCalculator().then(() => {
  console.log('Test completed successfully');
}).catch(error => {
  console.error('Test error:', error);
  process.exit(1);
});
