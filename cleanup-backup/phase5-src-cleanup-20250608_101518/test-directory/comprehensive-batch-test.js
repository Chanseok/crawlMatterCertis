/**
 * Comprehensive Batch Processing Test
 * 
 * This script combines batch processing tests with resource monitoring
 * to validate and analyze the batch processing implementation.
 */

// Import mock implementations instead of the actual implementations
// to avoid Electron-specific dependencies
import { CrawlerEngine, configManager, crawlerEvents } from './mock-crawler.js';
import { resourceMonitor, monitorEvents } from './resource-monitor.js';

// Configuration for batch size test
const batchSizeTest = {
  name: 'Batch Size Comparison Test',
  configurations: [
    {
      name: 'Small Batch (5 pages)',
      config: {
        batchSize: 5,
        batchDelayMs: 2000,
        enableBatchProcessing: true,
        pageRangeLimit: 15,
        productListRetryCount: 2
      }
    },
    {
      name: 'Standard Batch (30 pages)',
      config: {
        batchSize: 30,
        batchDelayMs: 2000,
        enableBatchProcessing: true,
        pageRangeLimit: 60,
        productListRetryCount: 2
      }
    },
    {
      name: 'No Batching',
      config: {
        enableBatchProcessing: false,
        pageRangeLimit: 15,
        productListRetryCount: 2
      }
    }
  ]
};

// Configuration for batch delay test
const batchDelayTest = {
  name: 'Batch Delay Comparison Test',
  configurations: [
    {
      name: 'No Delay',
      config: {
        batchSize: 10,
        batchDelayMs: 0,
        enableBatchProcessing: true,
        pageRangeLimit: 30,
        productListRetryCount: 2
      }
    },
    {
      name: 'Short Delay (1s)',
      config: {
        batchSize: 10,
        batchDelayMs: 1000,
        enableBatchProcessing: true,
        pageRangeLimit: 30,
        productListRetryCount: 2
      }
    },
    {
      name: 'Standard Delay (2s)',
      config: {
        batchSize: 10,
        batchDelayMs: 2000,
        enableBatchProcessing: true,
        pageRangeLimit: 30,
        productListRetryCount: 2
      }
    },
    {
      name: 'Long Delay (5s)',
      config: {
        batchSize: 10,
        batchDelayMs: 5000,
        enableBatchProcessing: true,
        pageRangeLimit: 30,
        productListRetryCount: 2
      }
    }
  ]
};

// Test results storage
const testResults = {
  batchSize: [],
  batchDelay: []
};

// Track batch progress
let batchProgress = [];
let batchTransitions = [];
let testStartTime = 0;

// Initialize test monitoring
function setupTestMonitoring() {
  // Reset tracking arrays
  batchProgress = [];
  batchTransitions = [];
  
  // Monitor crawling progress
  crawlerEvents.on('crawlingProgress', (progress) => {
    batchProgress.push({
      timestamp: Date.now(),
      message: progress.message,
      current: progress.current,
      total: progress.total,
      percentage: progress.percentage
    });
    
    // Detect batch transitions
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
  
  // Monitor resource usage
  monitorEvents.on('stats', (stats) => {
    // We could store these for later analysis
  });
}

// Run a single test configuration
async function runTestConfiguration(testConfig) {
  console.log(`\n=== Testing configuration: ${testConfig.name} ===`);
  console.log(`Batch size: ${testConfig.config.batchSize || 'N/A (disabled)'}`);
  console.log(`Batch delay: ${testConfig.config.batchDelayMs || 'N/A (disabled)'}`);
  console.log(`Batch processing enabled: ${testConfig.config.enableBatchProcessing !== false}`);
  
  // Reset tracking
  batchTransitions = [];
  batchProgress = [];
  
  // Update configuration
  configManager.updateConfig(testConfig.config);
  
  // Create a crawler engine
  const crawlerEngine = new CrawlerEngine();
  
  // Start the crawling process
  testStartTime = Date.now();
  console.log(`Starting crawling at ${new Date(testStartTime).toISOString()}`);
  
  try {
    // Start resource monitoring
    resourceMonitor.start();
    
    // Run the crawler
    await crawlerEngine.startCrawling();
    
    // Stop resource monitoring
    resourceMonitor.stop();
    
    // Calculate time between batch transitions
    const batchDelays = [];
    for (let i = 1; i < batchTransitions.length; i++) {
      const delay = batchTransitions[i].timestamp - batchTransitions[i-1].timestamp;
      batchDelays.push(delay);
    }
    
    // Generate test result
    const testEndTime = Date.now();
    const totalElapsedMs = testEndTime - testStartTime;
    
    const result = {
      configName: testConfig.name,
      batchSize: testConfig.config.batchSize,
      batchDelayMs: testConfig.config.batchDelayMs,
      enableBatchProcessing: testConfig.config.enableBatchProcessing,
      totalElapsedMs,
      batchCount: batchTransitions.length,
      avgBatchDelayMs: batchDelays.length > 0 ? 
        batchDelays.reduce((sum, delay) => sum + delay, 0) / batchDelays.length : 0,
      // Include memory metrics from resource monitor
      memoryProfile: resourceMonitor.generateReport()
    };
    
    console.log(`\nTest results for ${testConfig.name}:`);
    console.log(`- Total time: ${(totalElapsedMs / 1000).toFixed(2)} seconds`);
    console.log(`- Number of batches: ${batchTransitions.length}`);
    
    if (batchDelays.length > 0) {
      console.log(`- Average delay between batches: ${result.avgBatchDelayMs.toFixed(0)}ms`);
    }
    
    return result;
  } catch (error) {
    console.error(`Error during test for ${testConfig.name}:`, error);
    return {
      configName: testConfig.name,
      error: error.message,
      failed: true
    };
  }
}

// Run all tests in a test suite
async function runTestSuite(testSuite) {
  console.log(`\n====== STARTING TEST SUITE: ${testSuite.name} ======\n`);
  
  const results = [];
  
  for (const config of testSuite.configurations) {
    const result = await runTestConfiguration(config);
    results.push(result);
    
    // Wait between tests
    console.log(`Waiting 10 seconds before next test...`);
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
  
  console.log(`\n====== TEST SUITE COMPLETED: ${testSuite.name} ======\n`);
  return results;
}

// Generate comparative report of test results
function generateComparativeReport(testSuite, results) {
  console.log(`\n====== COMPARATIVE RESULTS: ${testSuite.name} ======\n`);
  
  // Sort results by total elapsed time
  results.sort((a, b) => a.totalElapsedMs - b.totalElapsedMs);
  
  console.log('Performance Ranking (fastest to slowest):');
  results.forEach((result, index) => {
    console.log(`${index + 1}. ${result.configName}: ${(result.totalElapsedMs / 1000).toFixed(2)}s`);
  });
  
  // Compare memory usage
  console.log('\nMemory Usage Comparison:');
  // This would use the memory metrics from the resource monitor
  
  // Batch size efficiency (if applicable)
  if (testSuite.name.includes('Batch Size')) {
    console.log('\nBatch Size Efficiency:');
    results.forEach(result => {
      if (result.batchSize) {
        const timePerPage = result.totalElapsedMs / (result.batchSize * result.batchCount);
        console.log(`${result.configName}: ${timePerPage.toFixed(2)}ms per page`);
      } else {
        console.log(`${result.configName}: N/A (no batching)`);
      }
    });
  }
  
  // Batch delay impact (if applicable)
  if (testSuite.name.includes('Batch Delay')) {
    console.log('\nBatch Delay Impact:');
    results.forEach(result => {
      if (result.batchDelayMs !== undefined) {
        const theoreticalDelayTime = result.batchCount * result.batchDelayMs;
        console.log(`${result.configName}: ${(theoreticalDelayTime / 1000).toFixed(2)}s total theoretical delay time`);
        console.log(`  - Configured delay: ${result.batchDelayMs}ms`);
        console.log(`  - Actual avg delay: ${result.avgBatchDelayMs.toFixed(0)}ms`);
      }
    });
  }
  
  console.log('\n====== END OF COMPARATIVE RESULTS ======\n');
}

// Main test function
async function runAllTests() {
  setupTestMonitoring();
  
  console.log('Starting comprehensive batch processing tests...');
  
  // Run batch size test
  console.log('\nRunning batch size comparison tests...');
  const batchSizeResults = await runTestSuite(batchSizeTest);
  testResults.batchSize = batchSizeResults;
  generateComparativeReport(batchSizeTest, batchSizeResults);
  
  // Run batch delay test
  console.log('\nRunning batch delay comparison tests...');
  const batchDelayResults = await runTestSuite(batchDelayTest);
  testResults.batchDelay = batchDelayResults;
  generateComparativeReport(batchDelayTest, batchDelayResults);
  
  console.log('\nAll tests completed.');
}

// Run the tests
runAllTests().catch(console.error);
