#!/usr/bin/env node

/**
 * Test script to validate the fix for newItems/updatedItems preservation issue
 * 
 * This script tests the specific fix we implemented where periodic progress updates
 * in executeParallelProductDetailCrawling were overwriting newItems and updatedItems values.
 * 
 * The fix ensures that updateProgress() calls include:
 * - newItems: this.state.getDetailStageNewCount()
 * - updatedItems: this.state.getDetailStageUpdatedCount()
 */

import { crawlerEvents } from './dist-electron/electron/crawler/utils/progress.js';

console.log('🔍 Testing fix for newItems/updatedItems preservation...');
console.log('');

// Create test data structure to track progress events
const progressEvents = [];
let testStartTime = Date.now();

// Listen for all crawling progress events
crawlerEvents.on('crawlingProgress', (progress) => {
  const timestamp = Date.now() - testStartTime;
  
  // Store the progress event with timestamp
  progressEvents.push({
    timestamp,
    newItems: progress.newItems || 0,
    updatedItems: progress.updatedItems || 0,
    current: progress.current || 0,
    total: progress.total || 0,
    message: progress.message || '',
    percentage: progress.percentage || 0
  });
  
  // Print progress with focus on newItems and updatedItems
  console.log(`[${timestamp}ms] Progress: ${progress.current}/${progress.total} - New: ${progress.newItems || 0}, Updated: ${progress.updatedItems || 0}`);
  if (progress.message) {
    console.log(`  Message: ${progress.message}`);
  }
});

// Simulate the batch UI test to trigger progress events
import { simulateBatchProcessing } from './dist-electron/electron/crawler/test/batch-ui-test.js';

console.log('Starting batch processing simulation with 3 batches...');
console.log('This simulates the exact scenario where our fix should preserve newItems/updatedItems');
console.log('');

simulateBatchProcessing(3, 1500).then(() => {
  console.log('');
  console.log('✅ Batch processing simulation completed');
  console.log('');
  console.log('📊 Analysis of progress events:');
  
  // Analyze the captured events
  let previousNewItems = 0;
  let previousUpdatedItems = 0;
  let preservationViolations = 0;
  
  progressEvents.forEach((event, index) => {
    // Check if newItems or updatedItems decreased (which would indicate the bug)
    if (event.newItems < previousNewItems || event.updatedItems < previousUpdatedItems) {
      preservationViolations++;
      console.log(`❌ Event ${index + 1}: Counter values decreased! New: ${previousNewItems} → ${event.newItems}, Updated: ${previousUpdatedItems} → ${event.updatedItems}`);
    } else if (event.newItems > previousNewItems || event.updatedItems > previousUpdatedItems) {
      console.log(`✅ Event ${index + 1}: Counter values increased correctly. New: ${previousNewItems} → ${event.newItems}, Updated: ${previousUpdatedItems} → ${event.updatedItems}`);
    }
    
    previousNewItems = event.newItems;
    previousUpdatedItems = event.updatedItems;
  });
  
  console.log('');
  console.log(`📈 Final Results:`);
  console.log(`  - Total progress events: ${progressEvents.length}`);
  console.log(`  - Counter preservation violations: ${preservationViolations}`);
  console.log(`  - Final newItems count: ${previousNewItems}`);
  console.log(`  - Final updatedItems count: ${previousUpdatedItems}`);
  
  if (preservationViolations === 0) {
    console.log('');
    console.log('🎉 SUCCESS: All counter values were preserved correctly!');
    console.log('The fix for newItems/updatedItems preservation is working properly.');
  } else {
    console.log('');
    console.log('❌ FAILURE: Counter preservation violations detected!');
    console.log('The fix may need additional adjustments.');
  }
  
  // Summary of what the fix does
  console.log('');
  console.log('🔧 Fix Summary:');
  console.log('The issue was in productDetail.ts around line 1757 where periodic progress updates');
  console.log('were calling updateProgress() without preserving newItems and updatedItems values.');
  console.log('');
  console.log('Before fix:');
  console.log('  this.state.updateProgress({');
  console.log('    current: currentProcessedItems,');
  console.log('    total: totalItems,');
  console.log('    message: message,');
  console.log('    percentage: percentage');
  console.log('  });');
  console.log('');
  console.log('After fix:');
  console.log('  this.state.updateProgress({');
  console.log('    current: currentProcessedItems,');
  console.log('    total: totalItems,');
  console.log('    message: message,');
  console.log('    percentage: percentage,');
  console.log('    newItems: this.state.getDetailStageNewCount(),');
  console.log('    updatedItems: this.state.getDetailStageUpdatedCount()');
  console.log('  });');
  
}).catch(err => {
  console.error('❌ Test failed with error:', err);
});
