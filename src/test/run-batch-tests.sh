#!/usr/bin/env zsh

# Batch Processing Test Runner
# This script runs all batch processing tests and then analyzes the results

# Change to project root directory
cd "$(dirname "$0")"/../..

# Make sure transpiled code exists
if [ ! -d "dist-electron/electron/crawler/core" ]; then
  echo "Transpiled code not found. Running transpile:electron..."
  npm run transpile:electron
  
  if [ $? -ne 0 ]; then
    echo "❌ Transpilation failed. Please fix the errors and try again."
    exit 1
  fi
fi

# Create test results directory if it doesn't exist
mkdir -p test-results/analysis

echo "================================================="
echo "Starting Batch Processing Implementation Test Suite"
echo "================================================="
echo "Date: $(date)"
echo ""

# Run tests
echo "Running batch processing tests..."
node src/test/run-batch-tests.js

# Check if tests ran successfully
if [ $? -ne 0 ]; then
  echo "❌ Tests failed to run properly."
  exit 1
fi

echo ""
echo "Waiting for tests to complete..."
sleep 3  # Give some time for file writing to complete

# Analyze results
echo ""
echo "Analyzing test results..."
node src/test/analyze-results.js

# Check if analysis ran successfully
if [ $? -ne 0 ]; then
  echo "❌ Analysis failed to run properly."
  exit 1
fi

echo ""
echo "================================================="
echo "Batch Processing Test Suite Completed"
echo "================================================="
echo "You can find the test results and analysis in the test-results directory."
echo ""

# Show the latest analysis file
LATEST_ANALYSIS=$(ls -t test-results/analysis/analysis-*.md 2>/dev/null | head -1)
if [ -n "$LATEST_ANALYSIS" ]; then
  echo "Latest analysis file: $LATEST_ANALYSIS"
  echo ""
  echo "Summary of recommendations:"
  grep -A 15 "## Recommendations" "$LATEST_ANALYSIS" | tail -n +2 || echo "No recommendations found in analysis file."
else
  echo "No analysis file found. The analysis may have failed to generate a report."
fi
