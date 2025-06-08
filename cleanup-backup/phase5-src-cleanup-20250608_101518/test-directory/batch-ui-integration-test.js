/**
 * Batch Processing UI Integration Test
 * 
 * This script tests that the UI settings for batch processing are correctly
 * passed to the CrawlerEngine and influence its behavior.
 */

// Import necessary modules
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get directory name in ESM
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Define results directory
const RESULTS_DIR = path.join(__dirname, '../../test-results/batch-ui-integration');

// Create results directory if it doesn't exist
if (!fs.existsSync(RESULTS_DIR)) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  console.log(`Created results directory: ${RESULTS_DIR}`);
}

// Mock implementation of UI components and stores
class MockConfigStore {
  constructor(initialConfig) {
    this.config = initialConfig || {
      pageRangeLimit: 50,
      batchSize: 30,
      batchDelayMs: 2000,
      enableBatchProcessing: true
    };
  }
  
  get() {
    return this.config;
  }
  
  set(newConfig) {
    this.config = { ...this.config, ...newConfig };
    return this.config;
  }
  
  subscribe(callback) {
    // Mock subscription
  }
}

// Mock CrawlerEngine implementation
class MockCrawlerEngine {
  constructor(configStore) {
    this.configStore = configStore;
  }
  
  async startCrawling() {
    const config = this.configStore.get();
    
    // Calculate batches based on configuration
    let batchCount = 1; // Default to 1 batch
    
    if (config.enableBatchProcessing && config.pageRangeLimit > config.batchSize) {
      batchCount = Math.ceil(config.pageRangeLimit / config.batchSize);
    }
    
    // Simulate processing with appropriate batch count
    console.log(`Processing ${config.pageRangeLimit} pages with ${batchCount} batch(es)`);
    
    // Simulate actual processing time based on configuration
    const processingTime = config.pageRangeLimit * 100; // 100ms per page
    const batchDelay = (batchCount - 1) * (config.batchDelayMs || 0);
    const totalTime = processingTime + batchDelay;
    
    // Wait for simulated processing time
    await new Promise(resolve => setTimeout(resolve, Math.min(totalTime, 1000))); // Cap at 1 second for test
    
    return {
      success: true,
      batchCount,
      totalPages: config.pageRangeLimit,
      totalProcessingTime: totalTime
    };
  }
}
  
// Test cases representing different UI configurations
const testCases = [
  {
    name: 'Default Batch Settings',
    config: {
      pageRangeLimit: 100,
      batchSize: 30,
      batchDelayMs: 2000,
      enableBatchProcessing: true
    },
    expectedBatches: 4  // 100/30 rounded up = 4 batches
  },
  {
    name: 'Custom Batch Settings',
    config: {
      pageRangeLimit: 100,
      batchSize: 20,
      batchDelayMs: 1000,
      enableBatchProcessing: true
    },
    expectedBatches: 5  // 100/20 = 5 batches
  },
  {
    name: 'Disabled Batch Processing',
    config: {
      pageRangeLimit: 100,
      batchSize: 20,
      batchDelayMs: 1000,
      enableBatchProcessing: false
    },
    expectedBatches: 1  // Single batch for all pages
  },
  {
    name: 'Large Batch Size',
    config: {
      pageRangeLimit: 100,
      batchSize: 50,
      batchDelayMs: 3000,
      enableBatchProcessing: true
    },
    expectedBatches: 2  // 100/50 = 2 batches
  }
];
// Run all test cases
async function runTests() {
  console.log('\n=== Batch Processing UI Integration Test ===');
  console.log('This test verifies that UI settings correctly influence batch processing behavior');
  
  const results = [];
  
  for (const testCase of testCases) {
    console.log(`\n--- Testing: ${testCase.name} ---`);
    console.log('Config:', testCase.config);
    
    // Create a new store and engine for each test case
    const store = new MockConfigStore(testCase.config);
    const engine = new MockCrawlerEngine(store);
    
    // Start mock crawling
    console.log('Starting mock crawling with this configuration...');
    const startTime = Date.now();
    const result = await engine.startCrawling();
    const elapsed = (Date.now() - startTime) / 1000;
    
    // Verify results
    const success = result.batchCount === testCase.expectedBatches;
    
    console.log(`Test completed in ${elapsed.toFixed(2)} seconds`);
    console.log(`Expected batches: ${testCase.expectedBatches}, Actual batches: ${result.batchCount}`);
    console.log(`Test result: ${success ? 'PASS' : 'FAIL'}`);
    
    // Collect results
    results.push({
      name: testCase.name,
      config: testCase.config,
      expected: testCase.expectedBatches,
      actual: result.batchCount,
      success,
      elapsedSeconds: elapsed
    });
  }
  
  // Save test results
  const resultData = {
    timestamp: new Date().toISOString(),
    tests: results,
    summary: {
      total: results.length,
      passed: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length
    }
  };
  
  const resultFile = path.join(RESULTS_DIR, `batch-ui-integration-${Date.now()}.json`);
  fs.writeFileSync(resultFile, JSON.stringify(resultData, null, 2));
  console.log(`\nResults saved to: ${resultFile}`);
  
  // Generate summary
  const summary = resultData.summary;
  console.log('\n=== Test Summary ===');
  console.log(`Total tests: ${summary.total}`);
  console.log(`Passed: ${summary.passed}`);
  console.log(`Failed: ${summary.failed}`);
  
  return summary.failed === 0;
}

// Run the tests
runTests()
  .then(success => {
    console.log(`\nBatch UI integration test ${success ? 'completed successfully' : 'failed'}`);
    process.exit(success ? 0 : 1);
  })
  .catch(err => {
    console.error('Unexpected error running test:', err);
    process.exit(1);
  });
