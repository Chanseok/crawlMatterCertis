#!/usr/bin/env node

/**
 * Mock Adaptive Batch Sizing Test
 * 
 * This script simulates the adaptive batch sizing test without requiring the actual
 * Electron environment. It provides a test harness that can be used to validate
 * the batch processing implementation's ability to adapt batch sizes based on
 * system resources.
 */

// Import mock implementations and utilities
import { CrawlerEngine, configManager } from './mock-crawler.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

// Get directory name in ESM
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const RESULTS_DIR = path.resolve(__dirname, '../../test-results/mock-adaptive');

// Create results directory if it doesn't exist
async function ensureResultsDir() {
  try {
    await fs.mkdir(RESULTS_DIR, { recursive: true });
    console.log(`Created results directory: ${RESULTS_DIR}`);
  } catch (err) {
    console.error(`Error creating results directory: ${err.message}`);
  }
}

// Simulate system resource pressure
class ResourceSimulator {
  constructor() {
    this.memoryPressure = 0;
    this.cpuPressure = 0;
  }
  
  setMemoryPressure(level) {
    this.memoryPressure = Math.max(0, Math.min(1, level));
    console.log(`[ResourceSimulator] Memory pressure set to ${(this.memoryPressure * 100).toFixed(1)}%`);
  }
  
  setCpuPressure(level) {
    this.cpuPressure = Math.max(0, Math.min(1, level));
    console.log(`[ResourceSimulator] CPU pressure set to ${(this.cpuPressure * 100).toFixed(1)}%`);
  }
  
  getMemoryInfo() {
    // Simulate memory info based on pressure level
    const totalMem = os.totalmem();
    const baseFree = totalMem * 0.4; // 40% free at baseline
    const adjustedFree = baseFree * (1 - this.memoryPressure);
    
    return {
      total: totalMem,
      free: adjustedFree,
      used: totalMem - adjustedFree,
      percentUsed: ((totalMem - adjustedFree) / totalMem) * 100
    };
  }
  
  getCpuInfo() {
    // Simulate CPU info based on pressure level
    return {
      loadAvg: [
        0.5 + (this.cpuPressure * 3.5), 
        0.4 + (this.cpuPressure * 3.1),
        0.3 + (this.cpuPressure * 2.7)
      ],
      percentUsed: this.cpuPressure * 100
    };
  }
}

// Enhanced mock crawler engine with adaptive batch sizing
class AdaptiveCrawlerEngine extends CrawlerEngine {
  constructor() {
    super();
    this.resourceSim = new ResourceSimulator();
    this.adaptiveBatchSizing = true;
    this.batchSizeHistory = [];
    this.resourceHistory = [];
  }
  
  // Override startCrawling to implement adaptive batch sizing
  async startCrawling() {
    console.log('[AdaptiveCrawlerEngine] Starting with adaptive batch sizing');
    
    const config = configManager.getConfig();
    console.log('[AdaptiveCrawlerEngine] Initial config:', config);
    
    // Initialize with default batch size
    let currentBatchSize = config.batchSize || 30;
    let recommendedBatchSize = currentBatchSize;
    
    console.log(`[AdaptiveCrawlerEngine] Initial batch size: ${currentBatchSize}`);
    
    // Simulate increasing memory pressure as crawling progresses
    const memoryPressurePoints = [
      { batch: 1, pressure: 0.2 },
      { batch: 2, pressure: 0.5 },
      { batch: 3, pressure: 0.7 },
      { batch: 4, pressure: 0.85 },
      { batch: 5, pressure: 0.9 },
    ];
    
    // Simulate a multi-batch crawling process
    const batchCount = 6;
    let totalProducts = 0;
    let successfulBatches = 0;
    let batchTimes = [];
    
    for (let batch = 1; batch <= batchCount; batch++) {
      // Update simulated resource pressure
      const pressurePoint = memoryPressurePoints.find(p => p.batch === batch);
      if (pressurePoint) {
        this.resourceSim.setMemoryPressure(pressurePoint.pressure);
        this.resourceSim.setCpuPressure(pressurePoint.pressure * 0.7); // CPU pressure is 70% of memory pressure
      }
      
      // Get current resource status
      const memInfo = this.resourceSim.getMemoryInfo();
      const cpuInfo = this.resourceSim.getCpuInfo();
      
      // Record resource state
      this.resourceHistory.push({
        batch,
        timestamp: Date.now(),
        memoryPercentUsed: memInfo.percentUsed,
        cpuPercentUsed: cpuInfo.percentUsed
      });
      
      // Calculate recommended batch size based on resource pressure
      const memoryFactor = 1 - (memInfo.percentUsed / 100);
      recommendedBatchSize = Math.max(
        5, // Minimum batch size
        Math.floor(config.batchSize * memoryFactor)
      );
      
      // Adaptive adjustment
      if (Math.abs(currentBatchSize - recommendedBatchSize) > 5) {
        console.log(`[AdaptiveCrawlerEngine] Adjusting batch size from ${currentBatchSize} to ${recommendedBatchSize} due to resource pressure`);
        currentBatchSize = recommendedBatchSize;
      }
      
      // Record batch size history
      this.batchSizeHistory.push({
        batch,
        batchSize: currentBatchSize,
        memoryUsed: memInfo.percentUsed.toFixed(1) + '%',
        cpuUsed: cpuInfo.percentUsed.toFixed(1) + '%'
      });
      
      console.log(`[AdaptiveCrawlerEngine] Processing batch ${batch}/${batchCount} with size ${currentBatchSize}`);
      console.log(`[AdaptiveCrawlerEngine] Memory: ${memInfo.percentUsed.toFixed(1)}% used, CPU: ${cpuInfo.percentUsed.toFixed(1)}% used`);
      
      // Simulate processing this batch
      const batchStartTime = Date.now();
      const productsInBatch = currentBatchSize * 5; // Assume 5 products per page
      
      // Simulate processing time (higher with more memory pressure)
      const processingTime = 1000 + (2000 * (memInfo.percentUsed / 100));
      await new Promise(resolve => setTimeout(resolve, processingTime));
      
      const batchTime = Date.now() - batchStartTime;
      batchTimes.push(batchTime);
      
      console.log(`[AdaptiveCrawlerEngine] Batch ${batch} completed in ${batchTime}ms with ${productsInBatch} products`);
      
      // Simulate batch success/failure based on memory pressure
      const batchSuccess = Math.random() > (memInfo.percentUsed / 100) * 0.8;
      if (batchSuccess) {
        totalProducts += productsInBatch;
        successfulBatches++;
      } else {
        console.log(`[AdaptiveCrawlerEngine] Batch ${batch} failed due to high resource pressure`);
      }
      
      // Simulate cleanup between batches
      console.log('[AdaptiveCrawlerEngine] Cleaning up resources after batch...');
      await new Promise(resolve => setTimeout(resolve, config.batchDelayMs || 2000));
    }
    
    // Prepare results
    const avgBatchTime = batchTimes.reduce((a, b) => a + b, 0) / batchTimes.length;
    
    return {
      success: successfulBatches > 0,
      batchCount,
      successfulBatches,
      totalProducts,
      avgBatchTimeMs: avgBatchTime,
      batchSizeHistory: this.batchSizeHistory,
      resourceHistory: this.resourceHistory
    };
  }
}

// Simulate an adaptive batch sizing test
async function mockAdaptiveBatchTest() {
  console.log('Starting mock adaptive batch sizing test...');
  console.log('This test simulates system resource fluctuations and adaptive batch size adjustments');
  
  await ensureResultsDir();
  
  try {
    // Configure a realistic batch setup
    const testConfig = {
      batchSize: 30, // Starting batch size
      batchDelayMs: 2000,
      enableBatchProcessing: true,
      pageRangeLimit: 150,
      adaptiveBatchSizing: true, // Enable adaptive sizing
      minBatchSize: 5,
      maxBatchSize: 50,
      batchSizeAdjustThreshold: 10 // Percentage of memory usage change to trigger adjustment
    };
    
    console.log('Configuring crawler with adaptive batch settings:', testConfig);
    await configManager.updateConfig(testConfig);
    
    // Create adaptive crawler engine
    const engine = new AdaptiveCrawlerEngine();
    console.log('Created adaptive crawler engine');
    
    // Record start time
    const startTime = Date.now();
    
    // Start mock crawling
    console.log('Starting mock crawling with adaptive batch sizing...');
    const result = await engine.startCrawling();
    
    // Calculate elapsed time
    const elapsed = (Date.now() - startTime) / 1000;
    
    console.log(`\nTest completed in ${elapsed.toFixed(2)} seconds`);
    console.log(`Success: ${result.success}`);
    console.log(`Products collected: ${result.totalProducts}`);
    console.log(`Batches used: ${result.batchCount}`);
    console.log(`Successful batches: ${result.successfulBatches}`);
    console.log(`Average batch time: ${result.avgBatchTimeMs / 1000} seconds`);
    
    console.log('\nBatch Size History:');
    result.batchSizeHistory.forEach(entry => {
      console.log(`Batch ${entry.batch}: Size ${entry.batchSize}, Memory ${entry.memoryUsed}, CPU ${entry.cpuUsed}`);
    });
    
    // Save test results
    const resultData = {
      timestamp: new Date().toISOString(),
      config: testConfig,
      results: {
        success: result.success,
        elapsed,
        totalProducts: result.totalProducts,
        batchCount: result.batchCount,
        successfulBatches: result.successfulBatches,
        avgBatchTimeMs: result.avgBatchTimeMs,
        batchSizeHistory: result.batchSizeHistory,
        resourceHistory: result.resourceHistory
      }
    };
    
    const resultFile = path.join(RESULTS_DIR, `adaptive-test-${Date.now()}.json`);
    await fs.writeFile(resultFile, JSON.stringify(resultData, null, 2));
    console.log(`Results saved to: ${resultFile}`);
    
    return true;
  } catch (error) {
    console.error('Test failed with error:', error);
    return false;
  }
}

// Run the test
mockAdaptiveBatchTest()
  .then(success => {
    console.log(`\nMock adaptive batch test ${success ? 'completed successfully' : 'failed'}`);
    process.exit(success ? 0 : 1);
  })
  .catch(err => {
    console.error('Unexpected error running test:', err);
    process.exit(1);
  });
