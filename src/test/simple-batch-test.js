#!/usr/bin/env node

/**
 * Simple Batch Processing Test
 * 
 * A minimal test script to validate the batch processing implementation
 * with less complexity than the full test suite.
 */

// Import mock implementations instead of the actual implementations
// to avoid Electron-specific dependencies
import { CrawlerEngine, configManager } from './mock-crawler.js';

async function runSimpleTest() {
  console.log('Starting simple batch processing test...');
  
  try {
    // Configure a simple batch setup
    const testConfig = {
      batchSize: 3,              // Very small batch size for quick testing
      batchDelayMs: 1000,        // Short delay between batches
      enableBatchProcessing: true,
      pageRangeLimit: 5,         // Just crawl 5 pages for a quick test
      productListRetryCount: 1,  // Minimal retries for speed
      headlessBrowser: true      // Run in headless mode
    };
    
    // Update configuration
    configManager.updateConfig(testConfig);
    console.log('Configuration updated:', JSON.stringify(testConfig, null, 2));
    
    // Create crawler engine
    const crawlerEngine = new CrawlerEngine();
    console.log('Crawler engine created, starting crawling...');
    
    // Start crawling and measure time
    const startTime = Date.now();
    const result = await crawlerEngine.startCrawling();
    const endTime = Date.now();
    const elapsedSecs = ((endTime - startTime) / 1000).toFixed(2);
    
    console.log(`\nCrawling completed in ${elapsedSecs} seconds`);
    console.log(`Success: ${result}`);
    
    return result;
  } catch (error) {
    console.error('Error during simple batch test:', error);
    return false;
  }
}

// Run the test
runSimpleTest()
  .then(success => {
    console.log(`Test completed with ${success ? 'success' : 'failure'}`);
    process.exit(success ? 0 : 1);
  })
  .catch(err => {
    console.error('Unhandled error in test:', err);
    process.exit(1);
  });
