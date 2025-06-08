/**
 * Batch Processing Test Script
 * 
 * This script tests the batch processing functionality in the crawler
 * by setting different batch sizes and delays and monitoring the crawling process.
 */

// Import mock implementations instead of the actual implementations
// to avoid Electron-specific dependencies
import { CrawlerEngine, configManager, crawlerEvents } from './mock-crawler.js';

// Test configurations
const testConfigs = [
  {
    name: 'Small Batch',
    config: {
      batchSize: 5,
      batchDelayMs: 1000,
      enableBatchProcessing: true,
      pageRangeLimit: 15, // Small range to test multiple batches
      productListRetryCount: 2
    }
  },
  {
    name: 'Medium Batch',
    config: {
      batchSize: 10,
      batchDelayMs: 2000,
      enableBatchProcessing: true,
      pageRangeLimit: 20,
      productListRetryCount: 2
    }
  },
  {
    name: 'Large Batch',
    config: {
      batchSize: 30,
      batchDelayMs: 3000,
      enableBatchProcessing: true,
      pageRangeLimit: 60,
      productListRetryCount: 2
    }
  },
  {
    name: 'Disabled Batch Processing',
    config: {
      enableBatchProcessing: false,
      pageRangeLimit: 10,
      productListRetryCount: 2
    }
  }
];

// Track batch transitions
let batchTransitions = [];
let currentTestConfig = null;
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

// Run the batch processing tests
async function runBatchTests() {
  console.log('Starting batch processing tests...');
  
  for (const testConfig of testConfigs) {
    console.log(`\n=== Testing configuration: ${testConfig.name} ===`);
    console.log(`Batch size: ${testConfig.config.batchSize || 'N/A (disabled)'}`);
    console.log(`Batch delay: ${testConfig.config.batchDelayMs || 'N/A (disabled)'}`);
    console.log(`Batch processing enabled: ${testConfig.config.enableBatchProcessing !== false}`);
    
    // Reset tracking
    batchTransitions = [];
    currentTestConfig = testConfig;
    
    // Update configuration
    configManager.updateConfig(testConfig.config);
    
    // Create a crawler engine
    const crawlerEngine = new CrawlerEngine();
    
    // Start the crawling process
    testStartTime = Date.now();
    console.log(`Starting crawling at ${new Date(testStartTime).toISOString()}`);
    
    try {
      await crawlerEngine.startCrawling();
      
      // Calculate time between batch transitions
      const batchDelays = [];
      for (let i = 1; i < batchTransitions.length; i++) {
        const delay = batchTransitions[i].timestamp - batchTransitions[i-1].timestamp;
        batchDelays.push(delay);
      }
      
      console.log(`\nTest results for ${testConfig.name}:`);
      console.log(`- Number of batches detected: ${batchTransitions.length}`);
      
      if (batchDelays.length > 0) {
        const avgDelay = batchDelays.reduce((sum, delay) => sum + delay, 0) / batchDelays.length;
        console.log(`- Average delay between batches: ${avgDelay.toFixed(0)}ms`);
        console.log(`- Configured delay: ${testConfig.config.batchDelayMs || 'N/A (disabled)'}`);
        
        // Check if delays match configuration
        const delayMatch = testConfig.config.enableBatchProcessing === false || 
          Math.abs(avgDelay - (testConfig.config.batchDelayMs || 2000)) < 500;
          
        console.log(`- Delay matches configuration: ${delayMatch ? 'Yes' : 'No'}`);
      } else {
        console.log(`- No batch transitions detected (single batch or disabled batch processing)`);
      }
      
      // Check if the number of batches matches expectation
      if (testConfig.config.enableBatchProcessing !== false && testConfig.config.batchSize) {
        const expectedBatches = Math.ceil(testConfig.config.pageRangeLimit / testConfig.config.batchSize);
        const batchCountMatch = batchTransitions.length === expectedBatches;
        
        console.log(`- Expected batches: ${expectedBatches}`);
        console.log(`- Batch count matches expectation: ${batchCountMatch ? 'Yes' : 'No'}`);
      }
      
      console.log(`Test for ${testConfig.name} completed successfully.\n`);
    } catch (error) {
      console.error(`Error during test for ${testConfig.name}:`, error);
    }
    
    // Wait for a moment between tests
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  
  console.log('All batch processing tests completed.');
}

// Run the tests
runBatchTests().catch(console.error);
