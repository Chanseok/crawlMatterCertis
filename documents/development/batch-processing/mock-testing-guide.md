# Mock Testing Guide for Batch Processing

## Overview

This guide explains the mock testing approach used to validate the batch processing functionality without relying on the full Electron environment. This approach allows tests to run in any Node.js environment, making it easier to automate testing and integrate with CI/CD pipelines.

## Why Mock Testing?

Testing the batch processing functionality presented several challenges:

1. **Electron Dependency**: The original tests required the full Electron environment, making it difficult to run in automated testing environments.
2. **Network Dependency**: Real-world tests relied on actual network connections, introducing variability and potential failures due to external factors.
3. **Resource Monitoring**: Testing resource usage and adaptive batch sizing required system-level monitoring capabilities.
4. **Error Simulation**: Consistently simulating error conditions for testing recovery mechanisms was difficult with real network requests.

Our mock testing approach addresses these challenges by:

1. Simulating the Electron environment and APIs
2. Providing controllable network simulation with configurable latency and failure rates
3. Implementing virtual resource monitoring for testing adaptive behaviors
4. Creating predictable error scenarios for testing recovery mechanisms

## Mock Implementation Components

### 1. Mock Electron (mock-electron.js)

This module simulates the Electron API functionality that our crawler relies on:

```javascript
// Simplified example of mock-electron.js
export const electron = {
  ipcRenderer: {
    invoke: async (channel, ...args) => {
      // Simulate IPC communication
      console.log(`Mock IPC: ${channel}`, args);
      
      // Return simulated responses based on the channel
      switch (channel) {
        case 'crawler:start':
          return { success: true, totalPages: args[0].pageRangeLimit };
        case 'crawler:status':
          return { status: 'running', progress: 0.5 };
        // Add more cases as needed
        default:
          return null;
      }
    }
  }
};
```

### 2. Mock Crawler (mock-crawler.js)

This module simulates the crawler engine and its batch processing behavior:

```javascript
// Simplified example of mock-crawler.js
export class CrawlerEngine {
  constructor() {
    this.networkLatency = { min: 100, max: 500, failureRate: 0.02 };
    this.resources = { memory: 1000 };
  }
  
  setNetworkLatency(options) {
    this.networkLatency = { ...this.networkLatency, ...options };
  }
  
  async startCrawling(config) {
    // Simulate batch processing behavior
    const totalPages = config?.pageRangeLimit || 100;
    const batchSize = config?.batchSize || 30;
    const batchDelayMs = config?.batchDelayMs || 2000;
    
    const batches = Math.ceil(totalPages / batchSize);
    let completedBatches = 0;
    let failures = 0;
    let retries = 0;
    
    for (let i = 0; i < batches; i++) {
      // Simulate processing a batch
      await this.processBatch(i, batchSize);
      completedBatches++;
      
      // Add simulated delay between batches
      if (i < batches - 1) {
        await new Promise(resolve => setTimeout(resolve, batchDelayMs));
      }
    }
    
    return {
      success: true,
      totalProducts: totalPages * 12, // Assume 12 products per page
      batchCount: completedBatches,
      avgBatchTimeMs: 1500,
      failures,
      retries
    };
  }
  
  async processBatch(batchIndex, batchSize) {
    // Simulate processing with network delays and potential failures
    // Implementation details omitted for brevity
  }
}

export const configManager = {
  updateConfig: async (config) => {
    console.log('Mock config update:', config);
    return { success: true };
  }
};
```

### 3. Mock Tests

Three primary mock test implementations were created:

#### Real-World Batch Test (mock-real-world-test.js)

Simulates network requests with realistic conditions:

- Configurable network latency (200-2000ms)
- Random request failures (5% failure rate)
- Page content simulation
- Product extraction simulation
- Detailed performance metrics

#### Adaptive Batch Test (mock-adaptive-batch-test.js)

Simulates batch size adjustments based on resource usage:

- Virtual memory monitoring
- Dynamic batch size adjustments
- Performance impact analysis
- Threshold testing

#### Error Recovery Test (mock-error-recovery-test.js)

Simulates error conditions and recovery mechanisms:

- Controlled failure injection
- Retry behavior validation
- Batch resumption testing
- Progress persistence simulation

## Running the Mock Tests

The tests can be run using the enhanced test runner script:

```bash
./src/test/run-enhanced-batch-tests.sh
```

This script:

1. Makes sure the code is transpiled
2. Runs all tests in sequence
3. Collects results and generates analysis reports
4. Provides summary information about test outcomes

## Interpreting Mock Test Results

The mock tests provide detailed metrics on batch processing performance:

1. **Processing Time**: Total and per-batch processing times
2. **Resource Usage**: Simulated memory usage patterns
3. **Error Handling**: Recovery statistics and effectiveness
4. **Scalability**: Performance with different batch sizes and delays

These metrics help determine the optimal batch processing configuration for different scenarios.

## Adding New Mock Tests

To create a new mock test:

1. Create a new file in the `src/test` directory (e.g., `mock-new-test.js`)
2. Import the necessary mock implementations:
   ```javascript
   import { CrawlerEngine, configManager } from './mock-crawler.js';
   ```
3. Implement your test logic using the mock components
4. Add your test to the `run-enhanced-batch-tests.sh` script

## Best Practices for Mock Testing

1. **Realistic Simulation**: Configure mock components to reflect real-world conditions
2. **Consistent Baselines**: Maintain baseline metrics for comparison
3. **Comprehensive Scenarios**: Test various configurations and edge cases
4. **Clear Reporting**: Generate detailed, actionable test reports
5. **Regular Validation**: Periodically validate mock test results against real-world behavior

## Limitations of Mock Testing

While mock testing provides valuable insights, it has limitations:

1. Cannot fully replicate complex interactions in real environments
2. May miss some edge cases specific to the Electron runtime
3. Network simulation is simplified compared to actual network conditions
4. Resource usage simulation is approximated

For these reasons, mock testing should be complemented with occasional real-world validation tests.

## Conclusion

The mock testing approach provides a practical solution for validating batch processing functionality without the complexities of the full Electron environment. By simulating the necessary components, we can consistently test various aspects of batch processing, including performance, error handling, and resource optimization.
