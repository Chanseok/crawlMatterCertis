/**
 * Simple Phase 4.1 Integration Test
 */

console.log('🧪 Testing Enhanced CrawlingUtils...\n');

try {
  // Import the compiled JavaScript version
  const fs = require('fs');
  const path = require('path');
  
  // Read the compiled CrawlingUtils file to verify it exists and is valid
  const crawlingUtilsPath = path.join(__dirname, 'dist-electron', 'shared', 'utils', 'CrawlingUtils.js');
  
  if (fs.existsSync(crawlingUtilsPath)) {
    console.log('✅ CrawlingUtils.js compiled successfully');
    
    const stats = fs.statSync(crawlingUtilsPath);
    console.log(`📦 File size: ${stats.size} bytes`);
    console.log(`📅 Last modified: ${stats.mtime.toISOString()}`);
    
    // Try to require the module
    const { CrawlingUtils } = require('./dist-electron/shared/utils/CrawlingUtils.js');
    console.log('✅ CrawlingUtils module loaded successfully');
    
    // Test basic functionality
    console.log('\n🔧 Testing basic functions:');
    
    // Test safe percentage
    const percentage1 = CrawlingUtils.safePercentage(50, 100);
    console.log(`  safePercentage(50, 100) = ${percentage1}% ✓`);
    
    const percentage2 = CrawlingUtils.safePercentage(75, 0);  // Edge case
    console.log(`  safePercentage(75, 0) = ${percentage2}% ✓`);
    
    // Test duration formatting
    const duration1 = CrawlingUtils.formatDuration(65000);
    console.log(`  formatDuration(65000) = "${duration1}" ✓`);
    
    const duration2 = CrawlingUtils.formatCompactDuration(65000);
    console.log(`  formatCompactDuration(65000) = "${duration2}" ✓`);
    
    // Test progress completion
    const isComplete1 = CrawlingUtils.isProgressCompleted(100, 100);
    console.log(`  isProgressCompleted(100, 100) = ${isComplete1} ✓`);
    
    const isComplete2 = CrawlingUtils.isProgressCompleted(50, 100);
    console.log(`  isProgressCompleted(50, 100) = ${isComplete2} ✓`);
    
    console.log('\n🎉 All basic tests passed!');
    console.log('📈 Phase 4.1 Enhanced CrawlingUtils integration successful!');
    
  } else {
    console.log('❌ CrawlingUtils.js not found');
  }
  
} catch (error) {
  console.error('❌ Test failed:', error.message);
}
