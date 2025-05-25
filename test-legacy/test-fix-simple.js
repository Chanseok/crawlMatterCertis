#!/usr/bin/env node

/**
 * Simple test to verify the fix for newItems/updatedItems preservation
 */

const { CrawlerState } = require('./dist-electron/electron/crawler/core/CrawlerState.js');

console.log('🧪 Testing CrawlerState newItems/updatedItems preservation fix');
console.log('');

try {
  // Create a new CrawlerState instance
  const state = new CrawlerState();

  // Initialize for detail stage processing
  state.setDetailStageProductCount(60);
  state.initializeDetailStage();

  console.log('✅ CrawlerState initialized for detail stage with 60 total products');

  // Simulate processing some items
  for (let i = 0; i < 10; i++) {
    state.recordDetailItemProcessed(true, `https://example.com/product${i}`); // new item
  }

  for (let i = 0; i < 5; i++) {
    state.recordDetailItemProcessed(false, `https://example.com/existing${i}`); // updated item
  }

  const currentProcessed = state.getDetailStageProcessedCount();
  const currentNew = state.getDetailStageNewCount();
  const currentUpdated = state.getDetailStageUpdatedCount();

  console.log(`Current counts: ${currentProcessed} processed, ${currentNew} new, ${currentUpdated} updated`);

  // Test the fixed updateProgress call
  state.updateProgress({
    current: currentProcessed,
    total: 60,
    message: "Testing progress update...",
    percentage: (currentProcessed / 60) * 100,
    newItems: state.getDetailStageNewCount(),
    updatedItems: state.getDetailStageUpdatedCount()
  });

  // Verify preservation
  const afterNew = state.getDetailStageNewCount();
  const afterUpdated = state.getDetailStageUpdatedCount();
  const progressData = state.getProgressData();

  console.log(`After updateProgress: ${afterNew} new, ${afterUpdated} updated`);
  console.log(`Progress data: ${progressData.newItems} new, ${progressData.updatedItems} updated`);

  const success = (currentNew === afterNew && currentUpdated === afterUpdated && 
                   progressData.newItems === currentNew && progressData.updatedItems === currentUpdated);

  if (success) {
    console.log('🎉 SUCCESS: Counter values preserved correctly!');
    console.log('The fix ensures UI and terminal logs will show matching values.');
  } else {
    console.log('❌ FAILURE: Counter preservation failed!');
  }

} catch (error) {
  console.error('❌ Test failed with error:', error.message);
}
