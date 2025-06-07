#!/usr/bin/env node

/**
 * End-to-End Batch Processing Test
 * 
 * This script tests the batch processing implementation with real data
 * in an end-to-end scenario. It uses the mock crawler implementation
 * to simulate the crawler engine behavior but with realistic data
 * processing and performance characteristics.
 */

import { CrawlerEngine, configManager, crawlerEvents } from './mock-crawler.js';
import { performance } from 'perf_hooks';
import os from 'os';
import { writeFile } from 'fs/promises';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

// Get directory name
const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Constants
const RESULTS_DIR = resolve(__dirname, '../../test-results');
const TEST_RESULTS_FILE = resolve(RESULTS_DIR, `e2e-test-results-${new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '')}.json`);

// Test configurations to try
const TEST_CONFIGS = [
  {
    name: "Default Config",
    config: {
      batchSize: 30, 
      batchDelayMs: 2000,
      enableBatchProcessing: true,
      pageRangeLimit: 60,
      productListRetryCount: 2
    }
  },
  {
    name: "Small Batches",
    config: {
      batchSize: 10, 
      batchDelayMs: 1000,
      enableBatchProcessing: true,
      pageRangeLimit: 60,
      productListRetryCount: 2
    }
  },
  {
    name: "No Batching",
    config: {
      enableBatchProcessing: false,
      pageRangeLimit: 60,
      productListRetryCount: 2
    }
  },
  {
    name: "Long Delay",
    config: {
      batchSize: 20, 
      batchDelayMs: 5000,
      enableBatchProcessing: true,
      pageRangeLimit: 60,
      productListRetryCount: 2
    }
  }
];

// Memory usage tracking
let memoryUsageSamples = [];
let batchTimestamps = [];

// Sample memory usage
function sampleMemoryUsage() {
  const memoryUsage = process.memoryUsage();
  const systemMemory = {
    total: os.totalmem(),
    free: os.freemem()
  };
  
  memoryUsageSamples.push({
    timestamp: Date.now(),
    rss: memoryUsage.rss / (1024 * 1024), // MB
    heapTotal: memoryUsage.heapTotal / (1024 * 1024), // MB
    heapUsed: memoryUsage.heapUsed / (1024 * 1024), // MB
    external: memoryUsage.external / (1024 * 1024), // MB
    systemFree: systemMemory.free / (1024 * 1024), // MB
    systemTotal: systemMemory.total / (1024 * 1024) // MB
  });
}

// Setup monitoring
function setupMonitoring() {
  // Reset tracking arrays
  memoryUsageSamples = [];
  batchTimestamps = [];
  
  // Set up memory sampling interval
  const memoryInterval = setInterval(sampleMemoryUsage, 500);
  
  // Listen for crawler events
  crawlerEvents.on('crawlingProgress', (progress) => {
    if (progress.message && progress.message.includes('Processing batch')) {
      batchTimestamps.push({
        timestamp: Date.now(),
        message: progress.message
      });
    }
  });
  
  return () => {
    clearInterval(memoryInterval);
  };
}

// Run a test with a specific configuration
async function runTestWithConfig(configName, config) {
  console.log(`\n==== Running test with configuration: ${configName} ====`);
  console.log(`Configuration: ${JSON.stringify(config, null, 2)}`);
  
  // Update configuration
  configManager.updateConfig(config);
  
  // Start monitoring
  const stopMonitoring = setupMonitoring();
  
  // Create crawler engine
  const engine = new CrawlerEngine();
  
  try {
    // Record start time
    const startTime = performance.now();
    
    // Start crawling
    const result = await engine.startCrawling();
    
    // Record end time
    const endTime = performance.now();
    const totalTime = endTime - startTime;
    
    console.log(`\nTest completed in ${(totalTime / 1000).toFixed(2)} seconds`);
    console.log(`Success: ${result}`);
    
    // Stop monitoring
    stopMonitoring();
    
    // Find peak memory usage
    let peakRss = 0;
    let peakHeapUsed = 0;
    let minSystemFree = Number.MAX_VALUE;
    
    for (const sample of memoryUsageSamples) {
      peakRss = Math.max(peakRss, sample.rss);
      peakHeapUsed = Math.max(peakHeapUsed, sample.heapUsed);
      minSystemFree = Math.min(minSystemFree, sample.systemFree);
    }
    
    // Calculate time between batches
    let batchDelays = [];
    for (let i = 1; i < batchTimestamps.length; i++) {
      const delay = batchTimestamps[i].timestamp - batchTimestamps[i-1].timestamp;
      batchDelays.push(delay);
    }
    
    const avgBatchDelay = batchDelays.length > 0 
      ? batchDelays.reduce((sum, delay) => sum + delay, 0) / batchDelays.length 
      : 0;
    
    // Generate detailed performance report
    const performanceReport = {
      configName,
      configuration: config,
      result: {
        success: result,
        totalTimeMs: totalTime,
        batchCount: batchTimestamps.length,
        batchDelays,
        avgBatchDelayMs: avgBatchDelay,
        peakRssMemoryMB: peakRss,
        peakHeapUsedMB: peakHeapUsed,
        minSystemFreeMB: minSystemFree,
        memoryUsageSamples
      }
    };
    
    // Log summary
    console.log('\nPerformance Summary:');
    console.log(`- Total time: ${(totalTime / 1000).toFixed(2)} seconds`);
    console.log(`- Batch count: ${batchTimestamps.length}`);
    console.log(`- Average batch delay: ${(avgBatchDelay / 1000).toFixed(2)} seconds`);
    console.log(`- Peak RSS memory: ${peakRss.toFixed(2)} MB`);
    console.log(`- Peak heap used: ${peakHeapUsed.toFixed(2)} MB`);
    
    return performanceReport;
  } catch (error) {
    console.error('Error during test:', error);
    
    // Stop monitoring
    stopMonitoring();
    
    return {
      configName,
      configuration: config,
      error: error.message,
      failed: true
    };
  }
}

// Run all tests and compare results
async function runAllTests() {
  console.log('==== Starting End-to-End Batch Processing Tests ====');
  console.log(`Date: ${new Date().toISOString()}`);
  console.log(`System: ${os.type()} ${os.release()} (${os.arch()})`);
  console.log(`CPU: ${os.cpus().length} cores, ${os.cpus()[0].model}`);
  console.log(`Memory: ${(os.totalmem() / (1024 * 1024 * 1024)).toFixed(2)} GB`);
  
  const testResults = [];
  
  for (const testConfig of TEST_CONFIGS) {
    const result = await runTestWithConfig(testConfig.name, testConfig.config);
    testResults.push(result);
    
    // Wait between tests to let system resources stabilize
    console.log('Waiting 5 seconds before next test...');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  
  // Compare results
  console.log('\n==== Test Results Comparison ====');
  
  // Sort by total time
  const successfulTests = testResults.filter(r => !r.failed);
  successfulTests.sort((a, b) => a.result.totalTimeMs - b.result.totalTimeMs);
  
  console.log('\nPerformance Ranking (fastest to slowest):');
  successfulTests.forEach((result, index) => {
    console.log(`${index + 1}. ${result.configName}: ${(result.result.totalTimeMs / 1000).toFixed(2)}s`);
  });
  
  console.log('\nMemory Usage Ranking (lowest to highest peak RSS):');
  [...successfulTests].sort((a, b) => a.result.peakRssMemoryMB - b.result.peakRssMemoryMB)
    .forEach((result, index) => {
      console.log(`${index + 1}. ${result.configName}: ${result.result.peakRssMemoryMB.toFixed(2)} MB`);
    });
  
  // Save detailed results
  try {
    await writeFile(TEST_RESULTS_FILE, JSON.stringify({ 
      date: new Date().toISOString(),
      system: {
        type: os.type(),
        release: os.release(),
        arch: os.arch(),
        cpuCount: os.cpus().length,
        cpuModel: os.cpus()[0].model,
        totalMemory: os.totalmem() / (1024 * 1024 * 1024) // GB
      },
      testResults 
    }, null, 2));
    console.log(`\nDetailed test results saved to: ${TEST_RESULTS_FILE}`);
  } catch (error) {
    console.error(`Error saving test results: ${error.message}`);
  }
  
  // Print recommendations
  if (successfulTests.length > 0) {
    const fastestTest = successfulTests[0];
    console.log('\n==== Recommended Configuration ====');
    console.log(`Based on these tests, the recommended configuration is:`);
    console.log(JSON.stringify(fastestTest.configuration, null, 2));
    
    // Check if batching helped
    const batchingEnabled = successfulTests.filter(t => t.configuration.enableBatchProcessing);
    const batchingDisabled = successfulTests.filter(t => !t.configuration.enableBatchProcessing);
    
    if (batchingEnabled.length > 0 && batchingDisabled.length > 0) {
      const fastestBatchingTime = Math.min(...batchingEnabled.map(t => t.result.totalTimeMs));
      const fastestNoBatchingTime = Math.min(...batchingDisabled.map(t => t.result.totalTimeMs));
      
      if (fastestBatchingTime < fastestNoBatchingTime) {
        console.log('\nBatch processing improved performance by ' + 
          ((fastestNoBatchingTime - fastestBatchingTime) / fastestNoBatchingTime * 100).toFixed(1) + '%');
      } else {
        console.log('\nBatch processing did not improve performance in these tests. ' +
          'Consider disabling it for this workload.');
      }
    }
  } else {
    console.log('\nNo successful tests to make recommendations from.');
  }
  
  console.log('\n==== End-to-End Batch Processing Tests Complete ====');
}

// Run all tests
runAllTests().catch(console.error);
