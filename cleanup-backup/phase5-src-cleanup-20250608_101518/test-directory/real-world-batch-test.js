#!/usr/bin/env node

/**
 * Real-world Batch Processing Test
 * 
 * This script tests the batch processing implementation against a live website
 * to collect performance data with various batch configurations.
 */

// Import the actual CrawlerEngine and ConfigManager
import { CrawlerEngine } from '../electron/crawler/core/CrawlerEngine.js';
import { configManager } from '../electron/ConfigManager.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

// Get directory name in ESM
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const RESULTS_DIR = path.resolve(__dirname, '../../test-results/real-world');

// Test configurations
const TEST_CONFIGS = [
  {
    name: 'small-batch',
    config: {
      batchSize: 5,
      batchDelayMs: 2000,
      enableBatchProcessing: true,
      pageRangeLimit: 10
    }
  },
  {
    name: 'medium-batch',
    config: {
      batchSize: 15,
      batchDelayMs: 2000,
      enableBatchProcessing: true,
      pageRangeLimit: 30
    }
  },
  {
    name: 'large-batch',
    config: {
      batchSize: 30,
      batchDelayMs: 3000,
      enableBatchProcessing: true,
      pageRangeLimit: 60
    }
  },
  {
    name: 'no-batching',
    config: {
      enableBatchProcessing: false,
      pageRangeLimit: 10
    }
  }
];

/**
 * Capture system information for reference
 */
function getSystemInfo() {
  return {
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    cpus: os.cpus().length,
    totalMemory: Math.round(os.totalmem() / (1024 * 1024 * 1024)), // GB
    freeMemory: Math.round(os.freemem() / (1024 * 1024 * 1024)), // GB
    timestamp: new Date().toISOString()
  };
}

/**
 * Run a test with specific configuration
 */
async function runTest(testConfig) {
  console.log(`\n==== Running test: ${testConfig.name} ====`);
  console.log(`Configuration: ${JSON.stringify(testConfig.config, null, 2)}`);
  
  // Set up test
  const originalConfig = configManager.getConfig();
  configManager.updateConfig(testConfig.config);
  
  // Create crawler engine
  const crawlerEngine = new CrawlerEngine();
  
  // Track memory usage
  const memorySnapshots = [];
  const memoryInterval = setInterval(() => {
    memorySnapshots.push({
      timestamp: Date.now(),
      memory: process.memoryUsage()
    });
  }, 1000);
  
  // Run test
  const startTime = Date.now();
  let success = false;
  let error = null;
  
  try {
    success = await crawlerEngine.startCrawling();
    console.log(`Crawling completed with success: ${success}`);
  } catch (err) {
    error = err;
    console.error('Error during crawling:', err);
  }
  
  const endTime = Date.now();
  clearInterval(memoryInterval);
  
  // Restore original config
  configManager.updateConfig(originalConfig);
  
  // Prepare results
  return {
    name: testConfig.name,
    config: testConfig.config,
    timing: {
      startTime,
      endTime,
      durationMs: endTime - startTime
    },
    memory: {
      snapshots: memorySnapshots,
      peak: memorySnapshots.reduce((max, snap) => 
        snap.memory.rss > max ? snap.memory.rss : max, 0) / (1024 * 1024) // MB
    },
    success,
    error: error ? String(error) : null
  };
}

/**
 * Save test results
 */
async function saveResults(results, systemInfo) {
  try {
    // Create results directory
    await fs.mkdir(RESULTS_DIR, { recursive: true });
    
    // Save system info
    await fs.writeFile(
      path.join(RESULTS_DIR, 'system-info.json'),
      JSON.stringify(systemInfo, null, 2)
    );
    
    // Save complete results
    await fs.writeFile(
      path.join(RESULTS_DIR, 'test-results.json'),
      JSON.stringify(results, null, 2)
    );
    
    // Create human-readable summary
    let summary = '# Real-world Batch Processing Test Results\n\n';
    summary += `Test run on: ${systemInfo.timestamp}\n`;
    summary += `Platform: ${systemInfo.platform} ${systemInfo.arch}, Node ${systemInfo.nodeVersion}\n`;
    summary += `System: ${systemInfo.cpus} CPUs, ${systemInfo.totalMemory}GB RAM (${systemInfo.freeMemory}GB free)\n\n`;
    
    summary += '## Test Results\n\n';
    summary += '| Configuration | Duration | Success | Peak Memory |\n';
    summary += '|---------------|----------|---------|-------------|\n';
    
    for (const result of results) {
      const durationSec = (result.timing.durationMs / 1000).toFixed(2);
      summary += `| ${result.name} | ${durationSec}s | ${result.success} | ${result.memory.peak.toFixed(2)}MB |\n`;
    }
    
    summary += '\n## Recommendations\n\n';
    
    // Find fastest successful test
    const successfulTests = results.filter(r => r.success);
    if (successfulTests.length > 0) {
      const fastest = successfulTests.reduce((a, b) => 
        a.timing.durationMs < b.timing.durationMs ? a : b);
      
      summary += `- Fastest configuration: **${fastest.name}** (${(fastest.timing.durationMs / 1000).toFixed(2)}s)\n`;
      
      // Find most memory efficient
      const mostMemoryEfficient = successfulTests.reduce((a, b) => 
        a.memory.peak < b.memory.peak ? a : b);
      
      summary += `- Most memory efficient: **${mostMemoryEfficient.name}** (${mostMemoryEfficient.memory.peak.toFixed(2)}MB)\n`;
      
      // Overall recommendation
      summary += '\n### Suggested Configuration\n\n';
      summary += '```json\n';
      
      // Balance between speed and memory
      const recommended = successfulTests.length > 2 ? 
        successfulTests.sort((a, b) => 
          (a.timing.durationMs * 0.7 + a.memory.peak * 0.3) - 
          (b.timing.durationMs * 0.7 + b.memory.peak * 0.3)
        )[0] : fastest;
      
      summary += JSON.stringify(recommended.config, null, 2);
      summary += '\n```\n';
    } else {
      summary += '- No successful tests to make recommendations from.\n';
    }
    
    await fs.writeFile(
      path.join(RESULTS_DIR, 'summary.md'),
      summary
    );
    
    console.log(`\nResults saved to ${RESULTS_DIR}`);
    console.log(`Summary: ${path.join(RESULTS_DIR, 'summary.md')}`);
  } catch (err) {
    console.error('Error saving results:', err);
  }
}

/**
 * Main test runner
 */
async function main() {
  console.log('Starting real-world batch processing tests...');
  
  const systemInfo = getSystemInfo();
  console.log('System info:', systemInfo);
  
  const results = [];
  
  for (const testConfig of TEST_CONFIGS) {
    try {
      const result = await runTest(testConfig);
      results.push(result);
      
      // Add a short delay between tests to let system resources stabilize
      await new Promise(resolve => setTimeout(resolve, 5000));
    } catch (err) {
      console.error(`Error running test ${testConfig.name}:`, err);
      results.push({
        name: testConfig.name,
        config: testConfig.config,
        error: String(err),
        success: false
      });
    }
  }
  
  await saveResults(results, systemInfo);
  console.log('All tests completed!');
}

// Run the main function
main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
