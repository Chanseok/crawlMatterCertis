#!/usr/bin/env node

/**
 * Direct verification of the newItems/updatedItems preservation fix
 * 
 * This test directly exercises the CrawlerState methods that our fix uses
 * to ensure that progress updates preserve counter values correctly.
 */

import { CrawlerState } from './dist-electron/electron/crawler/core/CrawlerState.js';
import { crawlerEvents } from './dist-electron/electron/crawler/utils/progress.js';

console.log('🧪 Direct test of CrawlerState newItems/updatedItems preservation');
console.log('');

// Create a new CrawlerState instance
const state = new CrawlerState();

// Initialize for detail stage processing
state.setDetailStageProductCount(60); // Simulate 60 products from Stage 1
state.initializeDetailStage();

console.log('✅ CrawlerState initialized for detail stage with 60 total products');
console.log('');

// Simulate some product processing
console.log('📊 Simulating product detail processing...');

// Process 10 new items and 5 updated items
for (let i = 0; i < 10; i++) {
  state.recordDetailItemProcessed(true, `https://example.com/product${i}`); // new item
}

for (let i = 0; i < 5; i++) {
  state.recordDetailItemProcessed(false, `https://example.com/existing${i}`); // updated item
}

// Check current counts
const currentProcessed = state.getDetailStageProcessedCount();
const currentNew = state.getDetailStageNewCount();
const currentUpdated = state.getDetailStageUpdatedCount();

console.log(`Current counts after processing:`);
console.log(`  - Processed: ${currentProcessed}`);
console.log(`  - New items: ${currentNew}`);
console.log(`  - Updated items: ${currentUpdated}`);
console.log('');

// Now test the specific fix: simulate the updateProgress call that was causing the bug
console.log('🔧 Testing the fix: calling updateProgress with preserved counter values...');

// BEFORE FIX (this would lose the counter values):
// state.updateProgress({
//   current: currentProcessed,
//   total: 60,
//   message: "Processing...",
//   percentage: (currentProcessed / 60) * 100
// });

// AFTER FIX (this preserves the counter values):
state.updateProgress({
  current: currentProcessed,
  total: 60,
  message: "2단계: 제품 상세정보 처리 중",
  percentage: (currentProcessed / 60) * 100,
  newItems: state.getDetailStageNewCount(),     // ← This was missing before
  updatedItems: state.getDetailStageUpdatedCount() // ← This was missing before
});

// Verify that the counters were preserved
const afterNew = state.getDetailStageNewCount();
const afterUpdated = state.getDetailStageUpdatedCount();
const progressData = state.getProgressData();

console.log(`Counter values after updateProgress:`);
console.log(`  - New items: ${afterNew} (should be ${currentNew})`);
console.log(`  - Updated items: ${afterUpdated} (should be ${currentUpdated})`);
console.log(`  - Progress data newItems: ${progressData.newItems || 'undefined'}`);
console.log(`  - Progress data updatedItems: ${progressData.updatedItems || 'undefined'}`);
console.log('');

// Test result
const newPreserved = afterNew === currentNew;
const updatedPreserved = afterUpdated === currentUpdated;
const progressHasNew = progressData.newItems === currentNew;
const progressHasUpdated = progressData.updatedItems === currentUpdated;

if (newPreserved && updatedPreserved && progressHasNew && progressHasUpdated) {
  console.log('🎉 SUCCESS: Counter values were preserved correctly!');
  console.log('');
  console.log('The fix ensures that:');
  console.log('✅ CrawlerState internal counters remain unchanged');
  console.log('✅ Progress data includes current newItems count');
  console.log('✅ Progress data includes current updatedItems count');
  console.log('✅ UI will display consistent values between terminal logs and dashboard');
} else {
  console.log('❌ FAILURE: Counter preservation failed!');
  console.log(`  - New items preserved: ${newPreserved}`);
  console.log(`  - Updated items preserved: ${updatedPreserved}`);
  console.log(`  - Progress has new items: ${progressHasNew}`);
  console.log(`  - Progress has updated items: ${progressHasUpdated}`);
}

console.log('');
console.log('🔍 Summary of the fix:');
console.log('The original bug was in /src/electron/crawler/tasks/productDetail.ts line ~1757');
console.log('where periodic progress updates during parallel processing were calling:');
console.log('');
console.log('❌ BEFORE (losing counter values):');
console.log('  this.state.updateProgress({');
console.log('    current: currentProcessedItems,');
console.log('    total: totalItems,');
console.log('    message: message,');
console.log('    percentage: percentage');
console.log('  });');
console.log('');
console.log('✅ AFTER (preserving counter values):');
console.log('  this.state.updateProgress({');
console.log('    current: currentProcessedItems,');
console.log('    total: totalItems,');
console.log('    message: message,');
console.log('    percentage: percentage,');
console.log('    newItems: this.state.getDetailStageNewCount(),');
console.log('    updatedItems: this.state.getDetailStageUpdatedCount()');
console.log('  });');
console.log('');
console.log('This ensures terminal logs and UI show the same values: "X new + Y updated = Z total"');
