#!/usr/bin/env node

/**
 * Test Runner for Batch Processing
 * 
 * This script coordinates the execution of various batch processing tests
 * and collects their results in a structured format.
 */

import { resolve, join } from 'path';
import { mkdir, writeFile } from 'fs/promises';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

// Get directory name in ESM
const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Test script paths
const TEST_SCRIPTS = {
  simple: resolve(__dirname, 'simple-batch-test.js'),
  basic: resolve(__dirname, 'batch-processing-test.js'),
  comprehensive: resolve(__dirname, 'comprehensive-batch-test.js'),
  e2e: resolve(__dirname, 'e2e-batch-test.js')
};

// Results directory
const RESULTS_DIR = resolve(__dirname, '../../test-results');
const TIMESTAMP = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');

/**
 * Run a test script and capture its output
 */
async function runTest(scriptPath, testName) {
  return new Promise((resolve) => {
    console.log(`\n==== Running ${testName} test ====\n`);
    
    const process = spawn('node', [scriptPath], {
      stdio: ['inherit', 'pipe', 'pipe']
    });
    
    let stdout = '';
    let stderr = '';
    
    process.stdout.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      console.log(text);
    });
    
    process.stderr.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      console.error(text);
    });
    
    process.on('close', (code) => {
      console.log(`\n==== ${testName} test completed with code ${code} ====\n`);
      
      resolve({
        testName,
        scriptPath,
        exitCode: code,
        stdout,
        stderr,
        success: code === 0
      });
    });
  });
}

/**
 * Save test results to file
 */
async function saveResults(results) {
  try {
    // Create results directory if it doesn't exist
    await mkdir(RESULTS_DIR, { recursive: true });
    
    // Save individual test results
    for (const result of results) {
      const resultPath = join(RESULTS_DIR, `${result.testName}-${TIMESTAMP}.txt`);
      
      let content = `==== TEST: ${result.testName} ====\n`;
      content += `Script: ${result.scriptPath}\n`;
      content += `Exit Code: ${result.exitCode}\n`;
      content += `Success: ${result.success}\n\n`;
      content += `==== STDOUT ====\n\n${result.stdout}\n\n`;
      
      if (result.stderr) {
        content += `==== STDERR ====\n\n${result.stderr}\n\n`;
      }
      
      await writeFile(resultPath, content);
      console.log(`Results saved to ${resultPath}`);
    }
    
    // Save summary
    const summaryPath = join(RESULTS_DIR, `summary-${TIMESTAMP}.json`);
    const summary = results.map(({ testName, exitCode, success }) => ({
      testName, exitCode, success
    }));
    
    await writeFile(summaryPath, JSON.stringify(summary, null, 2));
    console.log(`Summary saved to ${summaryPath}`);
  } catch (error) {
    console.error('Error saving results:', error);
  }
}

/**
 * Main function
 */
async function main() {
  console.log('Starting batch processing tests...');
  console.log(`Test results will be saved to ${RESULTS_DIR}`);
  
  try {
    // Create results directory
    await mkdir(RESULTS_DIR, { recursive: true });
  } catch (error) {
    console.error(`Error creating results directory: ${error.message}`);
  }
  
  const results = [];
  
  // Run simple test first (to validate the implementation quickly)
  console.log('\nRunning simple test first to validate the implementation...');
  results.push(await runTest(TEST_SCRIPTS.simple, 'simple-batch-processing'));
  
  // If simple test fails, stop
  if (results[0].exitCode !== 0) {
    console.error('Simple test failed. Stopping further tests.');
    await saveResults(results);
    return;
  }
  
  // Run basic test
  results.push(await runTest(TEST_SCRIPTS.basic, 'basic-batch-processing'));
  
  // Run comprehensive test
  // Uncomment this for a more thorough test (takes longer to run)
  // results.push(await runTest(TEST_SCRIPTS.comprehensive, 'comprehensive-batch-processing'));
  
  // Save all results
  await saveResults(results);
  
  console.log('All tests completed.');
}

// Run the main function
main().catch(console.error);
