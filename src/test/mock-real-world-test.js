#!/usr/bin/env node

/**
 * Mock Real-world Batch Processing Test
 * 
 * This script simulates the real-world batch test without requiring the actual
 * Electron environment and network connections. It provides a test harness that
 * can be used to validate the batch processing implementation.
 */

// Import mock implementations and utilities
import { CrawlerEngine, configManager } from './mock-crawler.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

// Get directory name in ESM
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const RESULTS_DIR = path.resolve(__dirname, '../../test-results/mock-real-world');

// Create results directory if it doesn't exist
async function ensureResultsDir() {
  try {
    await fs.mkdir(RESULTS_DIR, { recursive: true });
    console.log(`Created results directory: ${RESULTS_DIR}`);
  } catch (err) {
    console.error(`Error creating results directory: ${err.message}`);
  }
}

// Simulate a real-world test with network delays
async function mockRealWorldTest() {
  console.log('Starting mock real-world batch processing test...');
  console.log('This test simulates real-world crawling scenarios with network latency');
  
  await ensureResultsDir();
  
  try {
    // Configure a realistic batch setup
    const testConfig = {
      batchSize: 20,
      batchDelayMs: 2000,
      enableBatchProcessing: true,
      pageRangeLimit: 100,
      productListRetryCount: 5,
      productDetailRetryCount: 3,
      maxConcurrentTasks: 3,
      requestDelay: 500
    };
    
    console.log('Configuring crawler with real-world settings:', testConfig);
    await configManager.updateConfig(testConfig);
    
    // Create mock crawler engine
    const engine = new CrawlerEngine();
    console.log('Created mock crawler engine with realistic simulation settings');
    
    // Add network latency simulation
    engine.setNetworkLatency({
      min: 200,
      max: 2000,
      failureRate: 0.05  // 5% chance of request failure
    });
    
    // Record start time
    const startTime = Date.now();
    
    // Start mock crawling
    console.log('Starting mock crawling with simulated network conditions...');
    const result = await engine.startCrawling();
    
    // Calculate elapsed time
    const elapsed = (Date.now() - startTime) / 1000;
    
    console.log(`\nTest completed in ${elapsed.toFixed(2)} seconds`);
    console.log(`Success: ${result.success}`);
    console.log(`Products collected: ${result.totalProducts}`);
    console.log(`Batches used: ${result.batchCount}`);
    console.log(`Average batch time: ${result.avgBatchTimeMs / 1000} seconds`);
    console.log(`Failures encountered: ${result.failures}`);
    console.log(`Retries performed: ${result.retries}`);
    
    // Save test results
    const resultData = {
      timestamp: new Date().toISOString(),
      config: testConfig,
      results: {
        success: result.success,
        elapsed,
        totalProducts: result.totalProducts,
        batchCount: result.batchCount,
        avgBatchTimeMs: result.avgBatchTimeMs,
        failures: result.failures,
        retries: result.retries
      }
    };
    
    const resultFile = path.join(RESULTS_DIR, `real-world-test-${Date.now()}.json`);
    await fs.writeFile(resultFile, JSON.stringify(resultData, null, 2));
    console.log(`Results saved to: ${resultFile}`);
    
    return true;
  } catch (error) {
    console.error('Test failed with error:', error);
    return false;
  }
}

// Run the test
mockRealWorldTest()
  .then(success => {
    console.log(`\nMock real-world test ${success ? 'completed successfully' : 'failed'}`);
    process.exit(success ? 0 : 1);
  })
  .catch(err => {
    console.error('Unexpected error running test:', err);
    process.exit(1);
  });
