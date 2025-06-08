#!/usr/bin/env node

/**
 * Quick Batch Processing Test
 * 
 * This script runs a simplified batch processing test for faster feedback.
 * It uses a small page range and focuses on basic functionality validation
 * rather than comprehensive performance testing.
 */

import { CrawlerEngine } from '../../dist-electron/electron/crawler/core/CrawlerEngine.js';
import { configManager } from '../../dist-electron/electron/ConfigManager.js';
import { crawlerEvents } from '../../dist-electron/electron/crawler/utils/progress.js';

// Test configuration
const TEST_CONFIG = {
  batchSize: 5,
  batchDelayMs: 1000,
  enableBatchProcessing: true,
  pageRangeLimit: 12, // Small range for quick testing
  productListRetryCount: 1 // Minimum retries for faster execution
};

// Track batch transitions
let batchTransitions = [];
let testStartTime = 0;

// Listen for crawling progress events to monitor batch transitions
crawlerEvents.on('crawlingProgress', (progress) => {
  // Check for batch transitions by looking for pauses in processing
  if (progress.message && progress.message.includes('Processing batch')) {
    const timestamp = Date.now();
    const elapsed = timestamp - testStartTime;
    
    batchTransitions.push({
      message: progress.message,
      timestamp,
      elapsedMs: elapsed
    });
    
    console.log(`[${elapsed}ms] ${progress.message}`);
  }
});

/**
 * Run a quick test of the batch processing implementation
 */
async function runQuickTest() {
  console.log('Starting quick batch processing test...');
  console.log(`Configuration: batch size=${TEST_CONFIG.batchSize}, delay=${TEST_CONFIG.batchDelayMs}ms`);
  
  // Update configuration
  configManager.updateConfig(TEST_CONFIG);
  
  // Create a crawler engine
  const crawlerEngine = new CrawlerEngine();
  
  // Start the crawling process
  testStartTime = Date.now();
  console.log(`Starting crawling at ${new Date(testStartTime).toISOString()}`);
  
  try {
    // Run the crawler
    const result = await crawlerEngine.startCrawling();
    
    // Calculate time between batch transitions
    const batchDelays = [];
    for (let i = 1; i < batchTransitions.length; i++) {
      const delay = batchTransitions[i].timestamp - batchTransitions[i-1].timestamp;
      batchDelays.push(delay);
    }
    
    // Generate test result
    const testEndTime = Date.now();
    const totalElapsedMs = testEndTime - testStartTime;
    
    console.log('\nTest results:');
    console.log(`- Crawling ${result ? 'succeeded' : 'failed'}`);
    console.log(`- Total time: ${(totalElapsedMs / 1000).toFixed(2)} seconds`);
    console.log(`- Number of batches: ${batchTransitions.length}`);
    
    if (batchDelays.length > 0) {
      const avgDelay = batchDelays.reduce((sum, delay) => sum + delay, 0) / batchDelays.length;
      console.log(`- Average delay between batches: ${avgDelay.toFixed(0)}ms`);
      console.log(`- Configured delay: ${TEST_CONFIG.batchDelayMs}ms`);
    } else {
      console.log(`- No batch transitions detected (single batch or disabled batch processing)`);
    }
    
    if (batchTransitions.length > 0) {
      console.log('\nBatch transitions:');
      batchTransitions.forEach((transition, index) => {
        console.log(`${index + 1}. ${transition.message} at ${(transition.elapsedMs / 1000).toFixed(2)}s`);
      });
    }
    
    console.log('\nQuick test completed successfully.');
    return true;
  } catch (error) {
    console.error('Error during test:', error);
    return false;
  }
}

// Run the test
runQuickTest().catch(console.error);
