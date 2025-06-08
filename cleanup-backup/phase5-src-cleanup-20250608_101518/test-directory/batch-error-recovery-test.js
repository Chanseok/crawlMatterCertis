#!/usr/bin/env node

/**
 * Batch Error Recovery and Resume Test
 * 
 * This script tests the enhanced error handling and resume capability
 * for the batch processing system.
 */

// Import the necessary components
import { CrawlerEngine } from '../electron/crawler/core/CrawlerEngine.js';
import { configManager } from '../electron/ConfigManager.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// Get directory name in ESM
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const RESULTS_DIR = path.resolve(__dirname, '../../test-results/error-recovery');

/**
 * Run a test with error injection
 */
async function runErrorRecoveryTest() {
  console.log('Running batch error recovery test...');
  
  // Configure test
  configManager.updateConfig({
    pageRangeLimit: 30,         // Test with a moderate page range
    batchSize: 5,               // Small batches for more granular testing
    batchDelayMs: 1000,         // Short delay for faster testing
    enableBatchProcessing: true, // Enable batch processing
    
    // Error recovery options
    batchRetryCount: 3,          // Retry failed batches 3 times
    batchRetryDelayMs: 2000,     // Wait 2 seconds before retrying
    continueOnBatchFailure: true // Continue with other batches if one permanently fails
  });
  
  // Create crawler engine
  const crawlerEngine = new CrawlerEngine();
  
  // Inject failures for specific batches (batch 2 and 4)
  const originalCollectPageRange = crawlerEngine.ProductListCollector.prototype.collectPageRange;
  crawlerEngine.ProductListCollector.prototype.collectPageRange = async function(range) {
    const batchNumber = Math.ceil((range.startPage - range.endPage + 1) / 5);
    
    if (batchNumber === 2) {
      // Simulate a temporary failure that will succeed on retry
      if (this.attemptCount === undefined) {
        this.attemptCount = 1;
        throw new Error('Simulated temporary network error for batch 2');
      } else if (this.attemptCount === 1) {
        this.attemptCount++;
        throw new Error('Simulated temporary error (retry 1) for batch 2');
      } else {
        // Succeed on the third attempt
        console.log('Batch 2 succeeding on third attempt');
      }
    } else if (batchNumber === 4) {
      // Simulate a permanent failure that won't succeed even after retries
      throw new Error('Simulated permanent error for batch 4');
    }
    
    // Normal processing for other batches
    return originalCollectPageRange.call(this, range);
  };
  
  try {
    // Start crawling
    const startTime = Date.now();
    const result = await crawlerEngine.startCrawling();
    const endTime = Date.now();
    
    // Restore original method
    crawlerEngine.ProductListCollector.prototype.collectPageRange = originalCollectPageRange;
    
    // Prepare results
    const testResults = {
      success: result,
      timing: {
        duration: endTime - startTime
      },
      batchFailures: crawlerEngine.state.getBatchFailures(),
      completedBatches: crawlerEngine.state.getCompletedBatches(),
      config: configManager.getConfig()
    };
    
    // Save results
    await saveResults(testResults);
    
    return testResults;
  } catch (error) {
    console.error('Unhandled error during test:', error);
    
    // Restore original method
    crawlerEngine.ProductListCollector.prototype.collectPageRange = originalCollectPageRange;
    
    throw error;
  }
}

/**
 * Run a test for batch resume capability
 */
async function runResumeTest() {
  console.log('Running batch resume test...');
  
  // Configure test
  configManager.updateConfig({
    pageRangeLimit: 30,         // Test with a moderate page range
    batchSize: 5,               // Small batches for more granular testing
    batchDelayMs: 1000,         // Short delay for faster testing
    enableBatchProcessing: true, // Enable batch processing
    enableBatchResume: true,     // Enable batch resume feature
    batchProgressSaveIntervalMs: 5000 // Save progress frequently for testing
  });
  
  // First crawling session - will be interrupted
  console.log('Starting first crawling session (will be interrupted)...');
  
  const crawlerEngine1 = new CrawlerEngine();
  
  // Inject an interruption after the 3rd batch
  const originalCollectPageRange = crawlerEngine1.ProductListCollector.prototype.collectPageRange;
  crawlerEngine1.ProductListCollector.prototype.collectPageRange = async function(range) {
    const result = await originalCollectPageRange.call(this, range);
    
    const batchNumber = Math.ceil((range.startPage - range.endPage + 1) / 5);
    if (batchNumber === 3) {
      console.log('Simulating interruption after batch 3...');
      
      // Simulate a clean interruption that saved progress
      setTimeout(() => {
        console.log('Triggering abort signal...');
        crawlerEngine1.abortController.abort('test_interruption');
      }, 100);
    }
    
    return result;
  };
  
  try {
    // Start first crawling session
    await crawlerEngine1.startCrawling();
  } catch (error) {
    console.log('First session interrupted as expected');
  } finally {
    // Restore original method
    crawlerEngine1.ProductListCollector.prototype.collectPageRange = originalCollectPageRange;
  }
  
  // Wait a moment for progress to be saved
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Second crawling session - should resume
  console.log('\nStarting second crawling session (should resume)...');
  
  const crawlerEngine2 = new CrawlerEngine();
  
  // Track which batches are processed
  const processedBatches = [];
  
  // Monitor which batches are processed
  const originalCollectPageRange2 = crawlerEngine2.ProductListCollector.prototype.collectPageRange;
  crawlerEngine2.ProductListCollector.prototype.collectPageRange = async function(range) {
    const batchNumber = Math.ceil((range.startPage - range.endPage + 1) / 5);
    processedBatches.push(batchNumber);
    
    return originalCollectPageRange2.call(this, range);
  };
  
  try {
    // Start second crawling session
    const startTime = Date.now();
    const result = await crawlerEngine2.startCrawling();
    const endTime = Date.now();
    
    // Prepare results
    const testResults = {
      success: result,
      timing: {
        duration: endTime - startTime
      },
      processedBatches,
      config: configManager.getConfig()
    };
    
    // Save results
    await saveResults(testResults, 'resume-test');
    
    return testResults;
  } catch (error) {
    console.error('Unhandled error during resume test:', error);
    throw error;
  } finally {
    // Restore original method
    crawlerEngine2.ProductListCollector.prototype.collectPageRange = originalCollectPageRange2;
  }
}

/**
 * Save test results
 */
async function saveResults(results, testName = 'error-recovery-test') {
  try {
    // Create results directory
    await fs.mkdir(RESULTS_DIR, { recursive: true });
    
    // Save results as JSON
    await fs.writeFile(
      path.join(RESULTS_DIR, `${testName}-${Date.now()}.json`),
      JSON.stringify(results, null, 2)
    );
    
    // Create human-readable report
    let report = `# ${testName.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} Results\n\n`;
    report += `Test run on: ${new Date().toISOString()}\n\n`;
    
    report += `## Configuration\n\n`;
    report += '```json\n';
    report += JSON.stringify(results.config, null, 2);
    report += '\n```\n\n';
    
    report += `## Test Results\n\n`;
    report += `- Success: ${results.success}\n`;
    report += `- Duration: ${(results.timing.duration / 1000).toFixed(2)} seconds\n\n`;
    
    if (results.batchFailures) {
      report += `## Batch Failures\n\n`;
      if (results.batchFailures.length === 0) {
        report += 'No batch failures recorded.\n\n';
      } else {
        for (const failure of results.batchFailures) {
          report += `### Batch ${failure.batchNumber}\n`;
          report += `- Range: Page ${failure.range.startPage} to ${failure.range.endPage}\n`;
          report += `- Error: ${failure.error}\n`;
          report += `- Time: ${new Date(failure.timestamp).toLocaleString()}\n\n`;
        }
      }
    }
    
    if (results.processedBatches) {
      report += `## Processed Batches\n\n`;
      report += `The following batches were processed in this session: ${results.processedBatches.join(', ')}\n\n`;
      
      // Check if resume worked as expected
      if (!results.processedBatches.includes(1) && 
          !results.processedBatches.includes(2) && 
          !results.processedBatches.includes(3)) {
        report += `✅ **Resume successful!** Batches 1-3 were correctly skipped as they were already completed in the previous session.\n\n`;
      } else {
        report += `❌ **Resume failed!** Some batches that should have been skipped were processed again.\n\n`;
      }
    }
    
    await fs.writeFile(
      path.join(RESULTS_DIR, `${testName}-${Date.now()}.md`),
      report
    );
    
    console.log(`Results saved to ${RESULTS_DIR}`);
  } catch (err) {
    console.error('Error saving results:', err);
  }
}

/**
 * Main function
 */
async function main() {
  console.log('Starting batch error recovery and resume tests...');
  
  try {
    // Run error recovery test
    await runErrorRecoveryTest();
    
    // Short pause between tests
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Run resume test
    await runResumeTest();
    
    console.log('All tests completed successfully!');
  } catch (err) {
    console.error('Error running tests:', err);
    process.exit(1);
  }
}

// Run the main function
main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
