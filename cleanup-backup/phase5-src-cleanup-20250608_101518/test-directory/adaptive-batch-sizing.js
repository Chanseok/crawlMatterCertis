#!/usr/bin/env node

/**
 * Memory Usage Monitor for Batch Processing
 * 
 * This script monitors memory usage between batches and implements
 * an adaptive batch sizing algorithm based on system resources.
 */

import { CrawlerEngine } from '../electron/crawler/core/CrawlerEngine.js';
import { configManager } from '../electron/ConfigManager.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

// Get directory name in ESM
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const RESULTS_DIR = path.resolve(__dirname, '../../test-results/memory-optimization');

// Memory usage thresholds (as percentages of system memory)
const MEMORY_THRESHOLDS = {
  LOW: 30,    // <30% usage - can increase batch size
  MEDIUM: 60, // 30-60% usage - maintain batch size
  HIGH: 80,   // 60-80% usage - decrease batch size
  CRITICAL: 90 // >90% usage - significantly reduce batch size
};

// Batch size adaptation factors
const BATCH_SIZE_ADAPTATION = {
  INCREASE: 1.25,  // Increase by 25% when memory usage is low
  REDUCE: 0.75,    // Reduce by 25% when memory usage is high
  REDUCE_CRITICAL: 0.5  // Reduce by 50% when memory usage is critical
};

/**
 * Get current memory usage as a percentage of total system memory
 */
function getMemoryUsagePercentage() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  return (usedMem / totalMem) * 100;
}

/**
 * Determine the optimal batch size based on current memory usage
 */
function getOptimalBatchSize(currentBatchSize) {
  const memoryUsage = getMemoryUsagePercentage();
  
  if (memoryUsage > MEMORY_THRESHOLDS.CRITICAL) {
    return Math.max(1, Math.floor(currentBatchSize * BATCH_SIZE_ADAPTATION.REDUCE_CRITICAL));
  } else if (memoryUsage > MEMORY_THRESHOLDS.HIGH) {
    return Math.max(1, Math.floor(currentBatchSize * BATCH_SIZE_ADAPTATION.REDUCE));
  } else if (memoryUsage < MEMORY_THRESHOLDS.LOW) {
    return Math.ceil(currentBatchSize * BATCH_SIZE_ADAPTATION.INCREASE);
  }
  
  // Return the current size if memory usage is within acceptable range
  return currentBatchSize;
}

/**
 * Extend CrawlerEngine to monitor memory usage and adjust batch size
 */
class AdaptiveCrawlerEngine extends CrawlerEngine {
  constructor() {
    super();
    this.memorySnapshots = [];
    this.batchSizeAdjustments = [];
    this.monitorInterval = null;
  }
  
  /**
   * Start memory monitoring
   */
  startMonitoring() {
    this.memorySnapshots = [];
    this.batchSizeAdjustments = [];
    this.monitorInterval = setInterval(() => {
      const snapshot = {
        timestamp: Date.now(),
        systemMemory: {
          total: os.totalmem(),
          free: os.freemem(),
          usage: getMemoryUsagePercentage()
        },
        processMemory: process.memoryUsage()
      };
      this.memorySnapshots.push(snapshot);
    }, 1000);
  }
  
  /**
   * Stop memory monitoring
   */
  stopMonitoring() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
  }
  
  /**
   * Adjust batch size based on memory usage
   */
  adjustBatchSize() {
    const config = configManager.getConfig();
    const currentBatchSize = config.batchSize || 30;
    const optimalBatchSize = getOptimalBatchSize(currentBatchSize);
    
    if (optimalBatchSize !== currentBatchSize) {
      console.log(`Adjusting batch size from ${currentBatchSize} to ${optimalBatchSize} based on memory usage`);
      
      this.batchSizeAdjustments.push({
        timestamp: Date.now(),
        oldSize: currentBatchSize,
        newSize: optimalBatchSize,
        memoryUsage: getMemoryUsagePercentage()
      });
      
      configManager.updateConfig({ batchSize: optimalBatchSize });
    }
    
    return optimalBatchSize;
  }
  
  /**
   * Get monitoring results
   */
  getMonitoringResults() {
    return {
      memorySnapshots: this.memorySnapshots,
      batchSizeAdjustments: this.batchSizeAdjustments
    };
  }
  
  /**
   * Custom start crawling method that includes memory monitoring and batch size adaptation
   */
  async startAdaptiveCrawling() {
    this.startMonitoring();
    
    // Do initial batch size adjustment
    this.adjustBatchSize();
    
    // Start a timer to periodically adjust batch size
    const adjustmentInterval = setInterval(() => {
      this.adjustBatchSize();
    }, 15000); // Check every 15 seconds
    
    try {
      const result = await super.startCrawling();
      return result;
    } finally {
      clearInterval(adjustmentInterval);
      this.stopMonitoring();
    }
  }
}

/**
 * Save monitoring results
 */
async function saveResults(results) {
  try {
    // Create results directory
    await fs.mkdir(RESULTS_DIR, { recursive: true });
    
    // Save raw data
    await fs.writeFile(
      path.join(RESULTS_DIR, 'monitoring-data.json'),
      JSON.stringify(results, null, 2)
    );
    
    // Generate charts and analysis
    let report = '# Memory Usage and Batch Size Analysis\n\n';
    report += `Test run on: ${new Date().toISOString()}\n\n`;
    
    // Add batch size adjustment summary
    report += '## Batch Size Adjustments\n\n';
    if (results.batchSizeAdjustments.length > 0) {
      report += '| Time | Old Size | New Size | Memory Usage |\n';
      report += '|------|----------|----------|---------------|\n';
      
      for (const adjustment of results.batchSizeAdjustments) {
        const time = new Date(adjustment.timestamp).toLocaleTimeString();
        report += `| ${time} | ${adjustment.oldSize} | ${adjustment.newSize} | ${adjustment.memoryUsage.toFixed(2)}% |\n`;
      }
    } else {
      report += 'No batch size adjustments were made during the test.\n';
    }
    
    // Add memory usage summary
    report += '\n## Memory Usage Summary\n\n';
    if (results.memorySnapshots.length > 0) {
      // Calculate min, max, avg memory usage
      const processMemoryValues = results.memorySnapshots.map(s => s.processMemory.rss / (1024 * 1024));
      const systemMemoryValues = results.memorySnapshots.map(s => s.systemMemory.usage);
      
      const processStats = {
        min: Math.min(...processMemoryValues),
        max: Math.max(...processMemoryValues),
        avg: processMemoryValues.reduce((sum, v) => sum + v, 0) / processMemoryValues.length
      };
      
      const systemStats = {
        min: Math.min(...systemMemoryValues),
        max: Math.max(...systemMemoryValues),
        avg: systemMemoryValues.reduce((sum, v) => sum + v, 0) / systemMemoryValues.length
      };
      
      report += '### Process Memory (RSS)\n\n';
      report += `- Minimum: ${processStats.min.toFixed(2)} MB\n`;
      report += `- Maximum: ${processStats.max.toFixed(2)} MB\n`;
      report += `- Average: ${processStats.avg.toFixed(2)} MB\n\n`;
      
      report += '### System Memory Usage\n\n';
      report += `- Minimum: ${systemStats.min.toFixed(2)}%\n`;
      report += `- Maximum: ${systemStats.max.toFixed(2)}%\n`;
      report += `- Average: ${systemStats.avg.toFixed(2)}%\n`;
    }
    
    // Add recommendations
    report += '\n## Recommendations\n\n';
    
    // Based on the data, make recommendations
    if (results.batchSizeAdjustments.length > 0) {
      const lastAdjustment = results.batchSizeAdjustments[results.batchSizeAdjustments.length - 1];
      report += `- **Recommended batch size**: ${lastAdjustment.newSize}\n`;
      
      if (results.batchSizeAdjustments.length > 1) {
        report += '- **Adaptive batch sizing** is recommended for this system due to memory fluctuations\n';
      }
    } else {
      report += '- The current batch size appears to be well-suited for your system, as no adjustments were needed\n';
    }
    
    // Memory-based recommendations
    if (results.memorySnapshots.length > 0) {
      const maxMemUsage = Math.max(...results.memorySnapshots.map(s => s.systemMemory.usage));
      
      if (maxMemUsage > MEMORY_THRESHOLDS.HIGH) {
        report += '- Consider **reducing** the default batch size to avoid memory pressure\n';
      } else if (maxMemUsage < MEMORY_THRESHOLDS.LOW) {
        report += '- You could **increase** the default batch size to improve performance\n';
      }
    }
    
    await fs.writeFile(
      path.join(RESULTS_DIR, 'analysis.md'),
      report
    );
    
    console.log(`\nResults saved to ${RESULTS_DIR}`);
    console.log(`Analysis: ${path.join(RESULTS_DIR, 'analysis.md')}`);
  } catch (err) {
    console.error('Error saving results:', err);
  }
}

/**
 * Main function
 */
async function main() {
  console.log('Starting memory usage monitoring and adaptive batch sizing test...');
  
  // Set up initial configuration
  const baseConfig = {
    pageRangeLimit: 50,         // Test with a moderate page range
    batchSize: 10,              // Start with a medium batch size
    batchDelayMs: 2000,         // Standard delay
    enableBatchProcessing: true // Enable batch processing
  };
  
  configManager.updateConfig(baseConfig);
  console.log('Initial configuration:', baseConfig);
  
  // Create the adaptive crawler engine
  const crawlerEngine = new AdaptiveCrawlerEngine();
  
  try {
    console.log('Starting adaptive crawling process...');
    const success = await crawlerEngine.startAdaptiveCrawling();
    console.log(`Crawling completed with success: ${success}`);
  } catch (err) {
    console.error('Error during crawling:', err);
  } finally {
    // Get and save monitoring results
    const results = crawlerEngine.getMonitoringResults();
    await saveResults(results);
  }
}

// Run the main function
main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
