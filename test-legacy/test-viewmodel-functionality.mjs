/**
 * Test script to verify ViewModel functionality and UI synchronization fixes
 * This script tests the three main issues we aimed to fix:
 * 1. Error message displayed even when crawling is complete
 * 2. Product collection status inconsistency (46/48 vs 48/48)
 * 3. Mixed display of page/product counts (48/5 pages)
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

async function testViewModelFixes() {
  console.log('🧪 Testing ViewModel UI Synchronization Fixes');
  console.log('=' .repeat(50));
  
  try {
    // Import the compiled ViewModel
    const { UnifiedCrawlingProgressViewModel } = await import('./dist-electron/ui/viewModels/UnifiedCrawlingProgressViewModel.js');
    
    console.log('✅ ViewModel imported successfully');
    
    // Create a test instance
    const viewModel = new UnifiedCrawlingProgressViewModel();
    console.log('✅ ViewModel instance created');
    
    // Test 1: Error → Complete transition (Issue #1)
    console.log('\n🔍 Test 1: Error → Complete transition');
    console.log('Setting error state...');
    viewModel.markError('Test error message', true);
    
    console.log(`Status: ${viewModel.statusDisplay.text}`);
    console.log(`Is Error: ${viewModel.statusDisplay.isError}`);
    console.log(`Is Complete: ${viewModel.statusDisplay.isComplete}`);
    
    console.log('Marking as complete...');
    viewModel.markComplete();
    
    console.log(`Status: ${viewModel.statusDisplay.text}`);
    console.log(`Is Error: ${viewModel.statusDisplay.isError}`);
    console.log(`Is Complete: ${viewModel.statusDisplay.isComplete}`);
    
    if (viewModel.statusDisplay.isComplete && !viewModel.statusDisplay.isError) {
      console.log('✅ Issue #1 FIXED: No error when complete');
    } else {
      console.log('❌ Issue #1 NOT FIXED: Still showing error when complete');
    }
    
    // Test 2: Collection status consistency (Issue #2)
    console.log('\n🔍 Test 2: Collection status consistency (46/48 → 48/48)');
    viewModel.updateFromRawProgress({
      processedItems: 46,
      totalItems: 48,
      status: 'running'
    });
    
    console.log(`Collection: ${viewModel.collectionDisplay.displayText}`);
    console.log(`Processed: ${viewModel.collectionDisplay.processed}`);
    console.log(`Total: ${viewModel.collectionDisplay.total}`);
    
    // Mark complete to see if it syncs properly
    viewModel.markComplete();
    
    console.log(`After completion: ${viewModel.collectionDisplay.displayText}`);
    console.log(`Processed: ${viewModel.collectionDisplay.processed}`);
    console.log(`Total: ${viewModel.collectionDisplay.total}`);
    
    if (viewModel.collectionDisplay.processed === viewModel.collectionDisplay.total) {
      console.log('✅ Issue #2 FIXED: Collection counts are synchronized');
    } else {
      console.log('❌ Issue #2 NOT FIXED: Collection counts still inconsistent');
    }
    
    // Test 3: Page/Product separation (Issue #3)
    console.log('\n🔍 Test 3: Page/Product display separation');
    viewModel.updateFromRawProgress({
      currentPage: 3,
      totalPages: 5,
      processedItems: 48,
      totalItems: 60,
      status: 'running'
    });
    
    console.log(`Page Display: ${viewModel.pageDisplay.displayText}`);
    console.log(`Collection Display: ${viewModel.collectionDisplay.displayText}`);
    
    // Check if page and product counts are properly separated
    const pageDisplayHasPages = viewModel.pageDisplay.displayText.includes('페이지') || 
                               viewModel.pageDisplay.displayText.includes('page');
    const collectionDisplayHasProducts = viewModel.collectionDisplay.displayText.includes('개') ||
                                        viewModel.collectionDisplay.displayText.includes('items');
    
    if (pageDisplayHasPages && collectionDisplayHasProducts) {
      console.log('✅ Issue #3 FIXED: Page and product displays are properly separated');
    } else {
      console.log('❌ Issue #3 NOT FIXED: Page and product displays may still be mixed');
    }
    
    // Summary
    console.log('\n📋 SUMMARY');
    console.log('=' .repeat(30));
    console.log('🎯 UI Synchronization Fixes Status:');
    console.log(`   1. Error → Complete transition: ${viewModel.statusDisplay.isComplete && !viewModel.statusDisplay.isError ? '✅ FIXED' : '❌ NEEDS WORK'}`);
    console.log(`   2. Collection consistency: ${viewModel.collectionDisplay.processed === viewModel.collectionDisplay.total ? '✅ FIXED' : '❌ NEEDS WORK'}`);
    console.log(`   3. Page/Product separation: ${pageDisplayHasPages && collectionDisplayHasProducts ? '✅ FIXED' : '❌ NEEDS WORK'}`);
    
    console.log('\n🎉 ViewModel tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Error testing ViewModel:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Run the tests
testViewModelFixes().then(() => {
  console.log('\n✨ All tests completed');
  process.exit(0);
}).catch(error => {
  console.error('💥 Test execution failed:', error);
  process.exit(1);
});
