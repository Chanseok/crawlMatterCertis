# Batch Processing Tests

This directory contains test scripts for validating and optimizing the batch processing implementation of the crawler.

## Overview

The batch processing system is designed to efficiently handle large-scale data collection by dividing the crawling work into manageable batches. These tests help to:

1. Validate that the batch processing implementation works correctly
2. Measure the performance impact of different batch configurations
3. Identify optimal settings for batch size and delay
4. Monitor system resource usage during batch processing

## Available Tests

### 1. Basic Batch Processing Test (`batch-processing-test.js`)

Tests the batch processing implementation with various configurations:
- Different batch sizes (5, 10, 30)
- Different delay times (1000ms, 2000ms, 3000ms)
- With batch processing disabled

### 2. Resource Monitor (`resource-monitor.js`)

Monitors system resource usage during batch processing:
- Tracks memory usage
- Monitors CPU usage
- Analyzes resource release between batches

### 3. Comprehensive Batch Test (`comprehensive-batch-test.js`)

A more thorough test that combines testing and resource monitoring:
- Compares different configurations
- Analyzes performance characteristics
- Generates detailed reports

### 4. Test Runner and Analyzer

- `run-batch-tests.js`: Runs the tests and collects results
- `analyze-results.js`: Analyzes test results and generates recommendations
- `run-batch-tests.sh`: Shell script that runs both tests and analysis

## Running the Tests

You can run all tests and analyze the results using the provided shell script:

```bash
# Navigate to the project root
cd /path/to/crawlMatterCertis

# Run the test script
./src/test/run-batch-tests.sh
```

## Test Results

Test results are stored in the `test-results` directory:
- Raw test output files: `test-results/*.txt`
- Analysis files: `test-results/analysis/*.md` and `test-results/analysis/*.json`

## Interpreting Results

The analysis will provide recommendations for:
- Optimal batch size
- Optimal delay between batches
- Whether batch processing should be enabled
- Performance comparisons between different configurations

## Customizing Tests

To customize the tests:
1. Edit the test configurations in the respective test files
2. Run the tests again using the shell script
3. Compare the new results with previous runs

## Notes

- Tests may take several minutes to complete, especially the comprehensive test
- For accurate results, close other resource-intensive applications while running tests
- The test results may vary depending on the system's hardware and current load
