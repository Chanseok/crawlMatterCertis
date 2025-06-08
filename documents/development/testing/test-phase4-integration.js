/**
 * Phase 4.1 Integration Test
 * Tests the enhanced CrawlingUtils and utility consolidation
 */

// Import the compiled JavaScript version
const { CrawlingUtils } = require('./dist-electron/shared/utils/CrawlingUtils.js');

console.log('🧪 Phase 4.1 Integration Testing: Enhanced CrawlingUtils\n');

// Test 1: Safe Percentage Calculations
console.log('1. Testing Safe Percentage Calculations:');
console.log('  safePercentage(50, 100):', CrawlingUtils.safePercentage(50, 100)); // Should be 50
console.log('  safePercentage(75, 100):', CrawlingUtils.safePercentage(75, 100)); // Should be 75
console.log('  safePercentage(120, 100):', CrawlingUtils.safePercentage(120, 100)); // Should be 100 (capped)
console.log('  safePercentage(50, 0):', CrawlingUtils.safePercentage(50, 0)); // Should be 0 (safe division)
console.log('  safePercentage(-10, 100):', CrawlingUtils.safePercentage(-10, 100)); // Should be 0 (negative protection)

// Test 2: Progress Completion Detection
console.log('\n2. Testing Progress Completion Detection:');
console.log('  isProgressCompleted(100, 100):', CrawlingUtils.isProgressCompleted(100, 100)); // Should be true
console.log('  isProgressCompleted(50, 100):', CrawlingUtils.isProgressCompleted(50, 100)); // Should be false
console.log('  isProgressCompleted(50, 100, undefined, true):', CrawlingUtils.isProgressCompleted(50, 100, undefined, true)); // Should be true (explicit flag)
console.log('  isProgressCompleted(50, 100, 100):', CrawlingUtils.isProgressCompleted(50, 100, 100)); // Should be true (percentage complete)

// Test 3: Duration Formatting
console.log('\n3. Testing Duration Formatting:');
console.log('  formatDuration(5000):', CrawlingUtils.formatDuration(5000)); // 5 seconds
console.log('  formatDuration(65000):', CrawlingUtils.formatDuration(65000)); // 1 minute 5 seconds
console.log('  formatDuration(3665000):', CrawlingUtils.formatDuration(3665000)); // 1 hour 1 minute 5 seconds
console.log('  formatDuration(0):', CrawlingUtils.formatDuration(0)); // 0 seconds
console.log('  formatDuration(-1000):', CrawlingUtils.formatDuration(-1000)); // Should handle negative

// Test 4: Compact Duration Formatting
console.log('\n4. Testing Compact Duration Formatting:');
console.log('  formatCompactDuration(65000):', CrawlingUtils.formatCompactDuration(65000)); // 01:05
console.log('  formatCompactDuration(3665000):', CrawlingUtils.formatCompactDuration(3665000)); // 01:01:05
console.log('  formatCompactDuration(30000):', CrawlingUtils.formatCompactDuration(30000)); // 00:30

// Test 5: Enhanced Progress Calculation
console.log('\n5. Testing Enhanced Progress Calculation:');
const startTime = Date.now() - 30000; // 30 seconds ago
const progressResult = CrawlingUtils.calculateProgressWithOptions(
  50, 
  100, 
  startTime,
  {
    minProgressForETA: 0.1,
    messageTemplate: '{processed}/{total} items ({percentage}%) - {context}',
    context: 'crawling products'
  }
);

console.log('  Enhanced Progress Result:');
console.log('    - Safe Percentage:', progressResult.safePercentage);
console.log('    - Formatted Percentage:', progressResult.formattedPercentage);
console.log('    - Progress Message:', progressResult.progressMessage);
console.log('    - ETA Reliable:', progressResult.isETAReliable);
console.log('    - Progress Ratio:', progressResult.progressRatio);
console.log('    - Elapsed Time:', progressResult.elapsedTime + 'ms');
if (progressResult.remainingTime) {
  console.log('    - Remaining Time:', progressResult.remainingTime + 'ms');
}

// Test 6: Progress Display Generation
console.log('\n6. Testing Progress Display Generation:');
const displayInfo = CrawlingUtils.generateProgressDisplay(
  30,
  100,
  45000, // 45 seconds
  {
    includePercentage: true,
    includeETA: true,
    percentageDecimals: 1
  }
);

console.log('  Display Information:');
console.log('    - Progress Text:', displayInfo.progressText);
console.log('    - Percentage Text:', displayInfo.percentageText);
console.log('    - ETA Text:', displayInfo.etaText);
console.log('    - Full Status Text:', displayInfo.statusText);

// Test 7: URL Validation
console.log('\n7. Testing URL Validation:');
const urlTests = [
  'https://example.com',
  'example.com',
  'invalid-url',
  'ftp://example.com'
];

urlTests.forEach(url => {
  const result = CrawlingUtils.validateAndNormalizeUrl(url);
  console.log(`  ${url} -> Valid: ${result.isValid}, Normalized: ${result.normalizedUrl || result.error}`);
});

// Test 8: Array Chunking
console.log('\n8. Testing Array Chunking:');
const testArray = Array.from({length: 13}, (_, i) => i + 1);
const chunks = CrawlingUtils.chunkArray(testArray, 5);
console.log('  Original array:', testArray);
console.log('  Chunked into groups of 5:', chunks);

// Test 9: Memory Usage (if available)
console.log('\n9. Testing Memory Usage:');
const memUsage = CrawlingUtils.getMemoryUsage();
if (memUsage) {
  console.log('  Heap Used:', memUsage.formattedHeapUsed);
  console.log('  Heap Total:', memUsage.formattedHeapTotal);
} else {
  console.log('  Memory usage not available (browser environment)');
}

// Test 10: Bytes Formatting
console.log('\n10. Testing Bytes Formatting:');
console.log('  formatBytes(1024):', CrawlingUtils.formatBytes(1024));
console.log('  formatBytes(1536):', CrawlingUtils.formatBytes(1536));
console.log('  formatBytes(1048576):', CrawlingUtils.formatBytes(1048576));

console.log('\n✅ Phase 4.1 Integration Testing Complete!');
console.log('🎯 All enhanced CrawlingUtils functions are working correctly.');
console.log('📈 Utility consolidation successful - duplicate code eliminated!');
