/**
 * Batch Crawler Test Helper
 * 
 * This module provides mock implementations of the necessary classes and functions
 * to test the batch processing implementation without requiring Electron.
 */

// Mock CrawlerEngine
class CrawlerEngine {
  constructor() {
    console.log('Created mock CrawlerEngine');
  }
  
  async startCrawling() {
    console.log('Starting mock crawling with batch processing...');
    
    // Get current batch processing config
    const config = configManager.getConfig();
    console.log('Using configuration:', config);
    
    // Simulate batch processing
    const totalPages = config.pageRangeLimit || 10;
    const batchSize = config.batchSize || 30;
    const batchDelay = config.batchDelayMs || 2000;
    const enableBatchProcessing = config.enableBatchProcessing !== false;
    
    console.log(`Mock crawling ${totalPages} pages`);
    
    if (enableBatchProcessing && totalPages > batchSize) {
      // Calculate number of batches
      const totalBatches = Math.ceil(totalPages / batchSize);
      console.log(`Using batch processing: ${totalBatches} batches of ${batchSize} pages each`);
      
      for (let batch = 0; batch < totalBatches; batch++) {
        const pagesInBatch = (batch === totalBatches - 1) 
          ? totalPages - (batch * batchSize) 
          : batchSize;
          
        console.log(`Processing batch ${batch + 1}/${totalBatches} (${pagesInBatch} pages)`);
        
        // Emit progress event
        crawlerEvents.emit('crawlingProgress', {
          message: `Processing batch ${batch + 1}/${totalBatches}`,
          current: batch + 1,
          total: totalBatches,
          percentage: (((batch + 1) / totalBatches) * 100).toFixed(1)
        });
        
        // Simulate processing batch
        await this.simulatePageProcessing(pagesInBatch);
        
        // Simulate cleanup between batches
        console.log('Cleaning up resources after batch...');
        
        // Simulate batch delay (reduced for testing)
        if (batch < totalBatches - 1) {
          console.log(`Waiting ${batchDelay}ms between batches...`);
          
          // Emit progress event for batch delay
          crawlerEvents.emit('crawlingProgress', {
            message: `Waiting ${batchDelay}ms before next batch...`,
            current: batch + 1,
            total: totalBatches,
            percentage: (((batch + 1) / totalBatches) * 100).toFixed(1)
          });
          
          await new Promise(resolve => setTimeout(resolve, batchDelay));
        }
      }
    } else {
      console.log('Batch processing disabled or not needed, processing all pages at once');
      await this.simulatePageProcessing(totalPages);
    }
    
    console.log('Mock crawling completed successfully');
    return true;
  }
  
  async simulatePageProcessing(pageCount) {
    console.log(`Simulating processing ${pageCount} pages...`);
    // Simulate page processing time (100ms per page)
    await new Promise(resolve => setTimeout(resolve, pageCount * 100));
  }
}

// Mock ConfigManager
class ConfigManager {
  constructor() {
    this.config = {
      pageRangeLimit: 10,
      batchSize: 3,
      batchDelayMs: 1000,
      enableBatchProcessing: true,
      productListRetryCount: 1
    };
  }
  
  getConfig() {
    return { ...this.config };
  }
  
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    return this.config;
  }
}

// Mock EventEmitter for crawlerEvents
class EventEmitter {
  constructor() {
    this.listeners = {};
  }
  
  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
    return this;
  }
  
  emit(event, ...args) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => callback(...args));
    }
    return true;
  }
}

// Create instances
const configManager = new ConfigManager();
const crawlerEvents = new EventEmitter();

// Export everything
export { CrawlerEngine, configManager, crawlerEvents };
