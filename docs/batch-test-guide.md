# Batch Processing Test Guide

## Overview

This guide explains how to test the batch processing implementation using various test scripts, how to run them, and how to interpret the results.

## Test Scripts

The following test scripts are provided:

1. **Simple Test** (`simple-batch-test.js`)
   - Quickly validates the basic batch processing functionality
   - Uses mock implementation to run without complex dependencies
   - Uses minimal configuration for fast feedback

2. **Basic Test** (`batch-processing-test.js`)
   - Tests with various batch sizes and delay times
   - Includes tests with batch processing disabled
   - Measures performance and resource usage for each configuration

3. **Comprehensive Test** (`comprehensive-batch-test.js`)
   - Combines testing and resource monitoring
   - Tests more configurations and generates detailed performance reports
   - Analyzes the impact of different batch sizes and delay times

4. **End-to-End Test** (`e2e-batch-test.js`)
   - Tests with realistic data processing and performance characteristics
   - Evaluates batch processing performance with more realistic workloads
   - Provides detailed performance analysis and memory usage tracking

## Running Tests

You can run the tests in the following ways:

### Running All Tests

```bash
# From the project root directory
./src/test/run-batch-tests.sh
```

This script will:

1. Transpile the code if necessary
2. Create test directories
3. Run simple test for validation
4. Run basic tests
5. Analyze results and generate recommended configurations

### Running Individual Tests

To run a specific test:

```bash
# Simple test
node src/test/simple-batch-test.js

# Basic test
node src/test/batch-processing-test.js

# Comprehensive test
node src/test/comprehensive-batch-test.js

# End-to-end test
node src/test/e2e-batch-test.js
```

## Interpreting Test Results

Test results are stored in the `test-results` directory:

- `*.txt` files: Raw output of each test
- `analysis/*.md`: Human-readable analysis reports
- `analysis/*.json`: Machine-readable analysis data

### Key Metrics

Pay attention to the following metrics:

1. **Total Execution Time**
   - Total time for each configuration
   - Shorter times indicate more efficient configurations

2. **Batch Delays**
   - Difference between configured delay and actual delay
   - Actual delays might be longer depending on system load

3. **Memory Usage**
   - Peak RSS memory: Maximum memory used by the process
   - Peak heap usage: Maximum memory used by JavaScript objects
   - Verify if batch processing effectively manages memory usage

4. **Batch Size Efficiency**
   - Processing time per batch size
   - Too small batches increase overhead, too large batches can cause memory issues

## Recommended Configurations

The analysis tool will recommend optimal configurations based on the test results. General recommendations:

1. **Large Collections (100+ pages)**:
   - Batch size: 30-50 pages
   - Batch delay: 2000-5000ms
   - Batch processing enabled: true

2. **Medium Collections (30-100 pages)**:
   - Batch size: 15-30 pages
   - Batch delay: 1000-2000ms
   - Batch processing enabled: true

3. **Small Collections (<30 pages)**:
   - Consider disabling batch processing (enableBatchProcessing: false)

Adjust these values based on your system resources and specific requirements.

## Troubleshooting

You may encounter the following issues during testing:

1. **Module Import Errors**
   - Make sure transpiled code exists by running `npm run transpile:electron`
   - Verify that paths are correct

2. **Analysis Generation Failures**
   - Make sure the `test-results/analysis` directory exists
   - Create the directory manually if needed

3. **Inconsistent Test Times**
   - Test times can vary significantly if system load is high
   - Run tests multiple times to get average performance

## Conclusion

Batch processing tests help you find the most appropriate batch size and delay times for your system. Run tests with different configurations and use the test analysis tools to determine the optimal settings.
