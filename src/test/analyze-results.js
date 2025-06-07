#!/usr/bin/env node

/**
 * Test Results Analyzer
 * 
 * This script analyzes the results of batch processing tests and
 * generates recommendations for optimal configuration.
 */

import { resolve, join } from 'path';
import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { fileURLToPath } from 'url';

// Get directory name in ESM
const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Results directory
const RESULTS_DIR = resolve(__dirname, '../../test-results');
const ANALYSIS_DIR = resolve(__dirname, '../../test-results/analysis');

/**
 * Parse test results from a file
 */
async function parseTestResults(filePath) {
  const content = await readFile(filePath, 'utf-8');
  
  // Extract test name
  const testNameMatch = content.match(/==== TEST: (.+?) ====/);
  const testName = testNameMatch ? testNameMatch[1] : 'unknown';
  
  // Extract success status
  const successMatch = content.match(/Success: (true|false)/);
  const success = successMatch ? successMatch[1] === 'true' : false;
  
  // Extract batch information
  const batchCountMatch = content.match(/Number of batches: (\d+)/);
  const batchCount = batchCountMatch ? parseInt(batchCountMatch[1], 10) : 0;
  
  // Extract delay information
  const avgDelayMatch = content.match(/Average delay between batches: (\d+)ms/);
  const avgDelay = avgDelayMatch ? parseInt(avgDelayMatch[1], 10) : 0;
  
  // Extract memory information
  const peakRssMatch = content.match(/RSS: ([\d.]+) MB/);
  const peakRss = peakRssMatch ? parseFloat(peakRssMatch[1]) : 0;
  
  // Extract batch size and configured delay
  const batchSizeMatch = content.match(/Batch size: (\d+|N\/A)/);
  const batchSize = batchSizeMatch && batchSizeMatch[1] !== 'N/A' ? parseInt(batchSizeMatch[1], 10) : null;
  
  const configuredDelayMatch = content.match(/Batch delay: (\d+|N\/A)/);
  const configuredDelay = configuredDelayMatch && configuredDelayMatch[1] !== 'N/A' ? 
    parseInt(configuredDelayMatch[1], 10) : null;
  
  const batchProcessingEnabledMatch = content.match(/Batch processing enabled: (true|false)/);
  const batchProcessingEnabled = batchProcessingEnabledMatch ? 
    batchProcessingEnabledMatch[1] === 'true' : true;
  
  // Extract total time
  const totalTimeMatch = content.match(/Total time: ([\d.]+) seconds/);
  const totalTime = totalTimeMatch ? parseFloat(totalTimeMatch[1]) : 0;
  
  return {
    testName,
    success,
    batchCount,
    avgDelay,
    peakRss,
    batchSize,
    configuredDelay,
    batchProcessingEnabled,
    totalTime,
    filePath
  };
}

/**
 * Analyze test results and generate recommendations
 */
function analyzeResults(results) {
  // Filter successful tests
  const successfulResults = results.filter(r => r.success);
  
  if (successfulResults.length === 0) {
    return {
      recommendations: "All tests failed. Check implementation and try again.",
      topConfigurations: []
    };
  }
  
  // Group by test type
  const groupedResults = {};
  for (const result of successfulResults) {
    const testType = result.testName.includes('comprehensive') ? 'comprehensive' : 'basic';
    if (!groupedResults[testType]) {
      groupedResults[testType] = [];
    }
    groupedResults[testType].push(result);
  }
  
  // Analyze batch size effectiveness
  const batchSizeAnalysis = successfulResults
    .filter(r => r.batchSize !== null)
    .sort((a, b) => {
      // If total times are similar (within 10%), prioritize by memory usage
      if (Math.abs(a.totalTime - b.totalTime) / a.totalTime < 0.1) {
        return a.peakRss - b.peakRss;
      }
      return a.totalTime - b.totalTime;
    });
  
  // Analyze batch delay effectiveness
  const batchDelayAnalysis = successfulResults
    .filter(r => r.configuredDelay !== null)
    .sort((a, b) => a.totalTime - b.totalTime);
  
  // Best configurations
  const topConfigurations = batchSizeAnalysis.slice(0, 3).map(r => ({
    batchSize: r.batchSize,
    batchDelay: r.configuredDelay,
    totalTime: r.totalTime,
    peakMemory: r.peakRss,
    efficiency: r.batchSize ? r.totalTime / r.batchSize : 0
  }));
  
  // Generate recommendations
  let recommendations = "Based on the test results:\n\n";
  
  // Batch size recommendation
  if (batchSizeAnalysis.length > 0) {
    const bestBatchSize = batchSizeAnalysis[0].batchSize;
    recommendations += `1. **Optimal Batch Size**: ${bestBatchSize} pages\n`;
    recommendations += `   - This size provided the best balance of performance and resource usage\n`;
    recommendations += `   - Total time: ${batchSizeAnalysis[0].totalTime.toFixed(2)} seconds\n`;
    recommendations += `   - Peak memory: ${batchSizeAnalysis[0].peakRss.toFixed(2)} MB\n\n`;
  }
  
  // Batch delay recommendation
  if (batchDelayAnalysis.length > 0) {
    const bestDelay = batchDelayAnalysis[0].configuredDelay;
    recommendations += `2. **Optimal Batch Delay**: ${bestDelay} ms\n`;
    recommendations += `   - This delay provided the best overall performance\n`;
    recommendations += `   - Actual average delay: ${batchDelayAnalysis[0].avgDelay.toFixed(0)} ms\n\n`;
  }
  
  // Overall recommendation
  const withBatching = successfulResults.filter(r => r.batchProcessingEnabled);
  const withoutBatching = successfulResults.filter(r => !r.batchProcessingEnabled);
  
  if (withBatching.length > 0 && withoutBatching.length > 0) {
    const avgWithBatching = withBatching.reduce((sum, r) => sum + r.totalTime, 0) / withBatching.length;
    const avgWithoutBatching = withoutBatching.reduce((sum, r) => sum + r.totalTime, 0) / withoutBatching.length;
    
    if (avgWithBatching < avgWithoutBatching) {
      recommendations += `3. **Batch Processing**: Enabled\n`;
      recommendations += `   - Batch processing improved performance by ${(((avgWithoutBatching - avgWithBatching) / avgWithoutBatching) * 100).toFixed(1)}%\n\n`;
    } else {
      recommendations += `3. **Batch Processing**: Consider disabling for small collections\n`;
      recommendations += `   - Non-batched processing was ${(((avgWithBatching - avgWithoutBatching) / avgWithBatching) * 100).toFixed(1)}% faster\n\n`;
    }
  }
  
  // Final configuration recommendation
  recommendations += `4. **Recommended Configuration**:\n`;
  recommendations += "```typescript\n";
  recommendations += "{\n";
  
  if (batchSizeAnalysis.length > 0) {
    recommendations += `  batchSize: ${batchSizeAnalysis[0].batchSize},\n`;
  } else {
    recommendations += "  batchSize: 30, // Default\n";
  }
  
  if (batchDelayAnalysis.length > 0) {
    recommendations += `  batchDelayMs: ${batchDelayAnalysis[0].configuredDelay},\n`;
  } else {
    recommendations += "  batchDelayMs: 2000, // Default\n";
  }
  
  if (withBatching.length > 0 && withoutBatching.length > 0) {
    const avgWithBatching = withBatching.reduce((sum, r) => sum + r.totalTime, 0) / withBatching.length;
    const avgWithoutBatching = withoutBatching.reduce((sum, r) => sum + r.totalTime, 0) / withoutBatching.length;
    
    recommendations += `  enableBatchProcessing: ${avgWithBatching < avgWithoutBatching}\n`;
  } else {
    recommendations += "  enableBatchProcessing: true // Default\n";
  }
  
  recommendations += "}\n```\n";
  
  return {
    recommendations,
    topConfigurations,
    batchSizeAnalysis: batchSizeAnalysis.map(r => ({
      batchSize: r.batchSize,
      totalTime: r.totalTime,
      peakMemory: r.peakRss
    })),
    batchDelayAnalysis: batchDelayAnalysis.map(r => ({
      batchDelay: r.configuredDelay,
      avgDelay: r.avgDelay,
      totalTime: r.totalTime
    }))
  };
}

/**
 * Main function
 */
async function main() {
  try {
    console.log('Analyzing test results...');
    
    // Make sure results directory exists
    try {
      await mkdir(RESULTS_DIR, { recursive: true });
    } catch (error) {
      console.error(`Error creating results directory: ${error.message}`);
      // Continue anyway, the directory might already exist
    }
    
    // Get test result files
    const files = await readdir(RESULTS_DIR);
    const resultFiles = files.filter(f => f.endsWith('.txt') && !f.includes('analysis'));
    
    if (resultFiles.length === 0) {
      console.log('No test result files found.');
      return;
    }
    
    console.log(`Found ${resultFiles.length} test result files.`);
    
    // Parse results
    const parsedResults = [];
    for (const file of resultFiles) {
      const filePath = join(RESULTS_DIR, file);
      try {
        const result = await parseTestResults(filePath);
        parsedResults.push(result);
      } catch (error) {
        console.error(`Error parsing ${file}:`, error);
      }
    }
    
    console.log(`Successfully parsed ${parsedResults.length} result files.`);
    
    // Analyze results
    const analysis = analyzeResults(parsedResults);
    
    // Create analysis directory
    await mkdir(ANALYSIS_DIR, { recursive: true });
    
    // Save analysis
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
    
    try {
      // Create analysis directory
      await mkdir(ANALYSIS_DIR, { recursive: true });
      
      const analysisPath = join(ANALYSIS_DIR, `analysis-${timestamp}.md`);
      
      let analysisContent = `# Batch Processing Test Analysis\n\n`;
      analysisContent += `Generated: ${new Date().toLocaleString()}\n\n`;
      analysisContent += `## Test Summary\n\n`;
      analysisContent += `- Total tests: ${parsedResults.length}\n`;
      analysisContent += `- Successful tests: ${parsedResults.filter(r => r.success).length}\n`;
      analysisContent += `- Failed tests: ${parsedResults.filter(r => !r.success).length}\n\n`;
      
      analysisContent += `## Recommendations\n\n`;
      analysisContent += analysis.recommendations;
      
      analysisContent += `\n## Top Performing Configurations\n\n`;
      analysisContent += `| Batch Size | Batch Delay (ms) | Total Time (s) | Peak Memory (MB) |\n`;
      analysisContent += `|------------|-----------------|----------------|------------------|\n`;
      
      for (const config of analysis.topConfigurations) {
        analysisContent += `| ${config.batchSize} | ${config.batchDelay} | ${config.totalTime.toFixed(2)} | ${config.peakMemory.toFixed(2)} |\n`;
      }
      
      analysisContent += `\n## Raw Test Results\n\n`;
      analysisContent += `| Test | Batch Size | Delay | Enabled | Time (s) | Memory (MB) |\n`;
      analysisContent += `|------|------------|-------|---------|----------|-------------|\n`;
      
      for (const result of parsedResults) {
        analysisContent += `| ${result.testName} | ${result.batchSize || 'N/A'} | ${result.configuredDelay || 'N/A'} | ${result.batchProcessingEnabled} | ${result.totalTime.toFixed(2)} | ${result.peakRss.toFixed(2)} |\n`;
      }
      
      await writeFile(analysisPath, analysisContent);
      console.log(`Analysis saved to ${analysisPath}`);
      
      // Save analysis JSON
      const analysisJsonPath = join(ANALYSIS_DIR, `analysis-${timestamp}.json`);
      await writeFile(analysisJsonPath, JSON.stringify({
        results: parsedResults,
        analysis
      }, null, 2));
      console.log(`Analysis JSON saved to ${analysisJsonPath}`);
    } catch (error) {
      console.error(`Error writing analysis files: ${error.message}`);
    }
    
  } catch (error) {
    console.error('Error analyzing results:', error);
  }
}

// Run the main function
main().catch(console.error);
