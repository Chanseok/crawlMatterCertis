#!/usr/bin/env node

/**
 * Mock Batch Error Recovery and Resume Test
 * 
 * This script simulates batch error recovery and resume capability testing
 * without requiring the actual Electron environment. It provides a test harness
 * that can be used to validate how the batch processing implementation handles errors.
 */

// Import mock implementations and utilities
import { CrawlerEngine, configManager } from './mock-crawler.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

// Get directory name in ESM
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const RESULTS_DIR = path.resolve(__dirname, '../../test-results/mock-error-recovery');

// Create results directory if it doesn't exist
async function ensureResultsDir() {
  try {
    await fs.mkdir(RESULTS_DIR, { recursive: true });
    console.log(`Created results directory: ${RESULTS_DIR}`);
  } catch (err) {
    console.error(`Error creating results directory: ${err.message}`);
  }
}

// Enhanced mock crawler engine that simulates errors and recovery
class ErrorRecoveryCrawlerEngine extends CrawlerEngine {
  constructor() {
    super();
    this.errorScenarios = [];
    this.recoveryAttempts = [];
    this.resumePoints = [];
  }
  
  // Add an error scenario
  addErrorScenario(scenario) {
    this.errorScenarios.push(scenario);
    return this;
  }
  
  // Override startCrawling to implement error scenarios and recovery
  async startCrawling() {
    console.log('[ErrorRecoveryCrawlerEngine] Starting with error recovery testing');
    
    const config = configManager.getConfig();
    console.log('[ErrorRecoveryCrawlerEngine] Config:', config);
    
    // Batch processing settings
    const batchSize = config.batchSize || 30;
    const batchDelay = config.batchDelayMs || 2000;
    const enableRetry = config.enableBatchRetry !== false;
    const maxRetries = config.batchRetryCount || 3;
    
    console.log(`[ErrorRecoveryCrawlerEngine] Batch size: ${batchSize}, Batch delay: ${batchDelay}ms`);
    console.log(`[ErrorRecoveryCrawlerEngine] Retry enabled: ${enableRetry}, Max retries: ${maxRetries}`);
    
    // Simulate a multi-batch crawling process
    const pageRange = config.pageRangeLimit || 120;
    const batchCount = Math.ceil(pageRange / batchSize);
    let totalProducts = 0;
    let successfulBatches = 0;
    let failedBatches = 0;
    let retriedBatches = 0;
    let resumedBatches = 0;
    
    console.log(`[ErrorRecoveryCrawlerEngine] Simulating ${batchCount} batches for ${pageRange} pages`);
    
    // Process each batch
    for (let batch = 1; batch <= batchCount; batch++) {
      // Calculate batch range
      const startPage = (batch - 1) * batchSize + 1;
      const endPage = Math.min(startPage + batchSize - 1, pageRange);
      const pagesInBatch = endPage - startPage + 1;
      
      console.log(`[ErrorRecoveryCrawlerEngine] Processing batch ${batch}/${batchCount} (pages ${startPage}-${endPage})`);
      
      // Check if this batch has an error scenario
      const errorScenario = this.errorScenarios.find(s => s.batch === batch);
      
      // Track attempts for this batch
      let attempts = 1;
      let batchSuccess = false;
      
      while (attempts <= (enableRetry ? maxRetries : 1) && !batchSuccess) {
        if (attempts > 1) {
          console.log(`[ErrorRecoveryCrawlerEngine] Retry attempt ${attempts-1} for batch ${batch}`);
          retriedBatches++;
          
          // Simulate recovery delay
          const retryDelay = config.batchRetryDelayMs || 5000;
          console.log(`[ErrorRecoveryCrawlerEngine] Waiting ${retryDelay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
        
        // Simulate batch processing
        console.log(`[ErrorRecoveryCrawlerEngine] Processing ${pagesInBatch} pages in batch ${batch} (attempt ${attempts})`);
        
        // Simulate failure if we have an error scenario and have not exceeded retry count
        let shouldFail = false;
        if (errorScenario) {
          if (errorScenario.failOnAttempts.includes(attempts)) {
            shouldFail = true;
            console.log(`[ErrorRecoveryCrawlerEngine] Simulating error for batch ${batch}: ${errorScenario.errorType}`);
            
            if (errorScenario.errorType === 'network') {
              console.log(`[ErrorRecoveryCrawlerEngine] Network error: ${errorScenario.message}`);
            } else if (errorScenario.errorType === 'timeout') {
              console.log(`[ErrorRecoveryCrawlerEngine] Timeout error: ${errorScenario.message}`);
            } else if (errorScenario.errorType === 'resource') {
              console.log(`[ErrorRecoveryCrawlerEngine] Resource error: ${errorScenario.message}`);
            }
            
            // Record recovery attempt
            this.recoveryAttempts.push({
              batch,
              attempt: attempts,
              timestamp: Date.now(),
              errorType: errorScenario.errorType,
              message: errorScenario.message
            });
          }
        }
        
        // Simulate processing time
        const processingTime = 1000 + Math.random() * 1000;
        await new Promise(resolve => setTimeout(resolve, processingTime));
        
        // Check result
        if (!shouldFail) {
          batchSuccess = true;
          const productsInBatch = pagesInBatch * 5; // assume 5 products per page
          totalProducts += productsInBatch;
          successfulBatches++;
          
          console.log(`[ErrorRecoveryCrawlerEngine] Batch ${batch} completed successfully with ${productsInBatch} products`);
          
          // If this was a retry, record as a successful recovery
          if (attempts > 1) {
            console.log(`[ErrorRecoveryCrawlerEngine] Successfully recovered batch ${batch} after ${attempts-1} retries`);
          }
        } else {
          console.log(`[ErrorRecoveryCrawlerEngine] Batch ${batch} failed on attempt ${attempts}`);
          
          // If this is the last attempt, count as a failed batch
          if (attempts >= (enableRetry ? maxRetries : 1)) {
            failedBatches++;
            console.log(`[ErrorRecoveryCrawlerEngine] Batch ${batch} permanently failed after ${attempts} attempts`);
          }
        }
        
        attempts++;
      }
      
      // Simulate resume if configured and needed
      if (!batchSuccess && config.enableBatchResume && batch < batchCount) {
        console.log(`[ErrorRecoveryCrawlerEngine] Simulating batch resume after failure in batch ${batch}`);
        
        // Record resume point
        this.resumePoints.push({
          batch,
          timestamp: Date.now(),
          resumePoint: {
            batch: batch + 1,
            startPage: (batch * batchSize) + 1
          }
        });
        
        resumedBatches++;
      }
      
      // Cleanup between batches
      if (batch < batchCount) {
        console.log('[ErrorRecoveryCrawlerEngine] Cleaning up resources after batch...');
        await new Promise(resolve => setTimeout(resolve, batchDelay));
      }
    }
    
    // Prepare results
    return {
      success: failedBatches === 0,
      batchCount,
      successfulBatches,
      failedBatches,
      retriedBatches,
      resumedBatches,
      totalProducts,
      recoveryAttempts: this.recoveryAttempts,
      resumePoints: this.resumePoints
    };
  }
}

// Simulate an error recovery and resume test
async function mockErrorRecoveryTest() {
  console.log('Starting mock batch error recovery and resume test...');
  console.log('This test simulates batch failures and tests recovery mechanisms');
  
  await ensureResultsDir();
  
  try {
    // Configure a realistic batch setup with error recovery options
    const testConfig = {
      batchSize: 20,
      batchDelayMs: 2000,
      enableBatchProcessing: true,
      pageRangeLimit: 100,
      enableBatchRetry: true,
      batchRetryCount: 3,
      batchRetryDelayMs: 5000,
      enableBatchResume: true,
      continueOnBatchFailure: true
    };
    
    console.log('Configuring crawler with error recovery settings:', testConfig);
    await configManager.updateConfig(testConfig);
    
    // Create error recovery crawler engine
    const engine = new ErrorRecoveryCrawlerEngine();
    
    // Add error scenarios to test
    engine
      .addErrorScenario({
        batch: 2,
        failOnAttempts: [1], // Fail on first attempt, succeed on retry
        errorType: 'network',
        message: 'Connection timeout'
      })
      .addErrorScenario({
        batch: 4,
        failOnAttempts: [1, 2], // Fail on first and second attempts, succeed on third
        errorType: 'timeout',
        message: 'Request timeout'
      })
      .addErrorScenario({
        batch: 5,
        failOnAttempts: [1, 2, 3], // Fail on all attempts (permanent failure)
        errorType: 'resource',
        message: 'Out of memory'
      });
    
    console.log('Created error recovery crawler engine with test scenarios');
    
    // Record start time
    const startTime = Date.now();
    
    // Start mock crawling
    console.log('Starting mock crawling with error scenarios...');
    const result = await engine.startCrawling();
    
    // Calculate elapsed time
    const elapsed = (Date.now() - startTime) / 1000;
    
    console.log(`\nTest completed in ${elapsed.toFixed(2)} seconds`);
    console.log(`Success: ${result.success}`);
    console.log(`Products collected: ${result.totalProducts}`);
    console.log(`Batches: ${result.batchCount} total, ${result.successfulBatches} successful, ${result.failedBatches} failed`);
    console.log(`Recovery stats: ${result.retriedBatches} retried, ${result.resumedBatches} resumed`);
    
    console.log('\nRecovery Attempts:');
    result.recoveryAttempts.forEach(attempt => {
      console.log(`Batch ${attempt.batch}, Attempt ${attempt.attempt}: ${attempt.errorType} error - ${attempt.message}`);
    });
    
    console.log('\nResume Points:');
    result.resumePoints.forEach(point => {
      console.log(`After failure in batch ${point.batch}, resumed at batch ${point.resumePoint.batch} (page ${point.resumePoint.startPage})`);
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
        failedBatches: result.failedBatches,
        retriedBatches: result.retriedBatches,
        resumedBatches: result.resumedBatches,
        recoveryAttempts: result.recoveryAttempts,
        resumePoints: result.resumePoints
      }
    };
    
    const resultFile = path.join(RESULTS_DIR, `error-recovery-test-${Date.now()}.json`);
    await fs.writeFile(resultFile, JSON.stringify(resultData, null, 2));
    console.log(`Results saved to: ${resultFile}`);
    
    return true;
  } catch (error) {
    console.error('Test failed with error:', error);
    return false;
  }
}

// Run the test
mockErrorRecoveryTest()
  .then(success => {
    console.log(`\nMock error recovery test ${success ? 'completed successfully' : 'failed'}`);
    process.exit(success ? 0 : 1);
  })
  .catch(err => {
    console.error('Unexpected error running test:', err);
    process.exit(1);
  });
