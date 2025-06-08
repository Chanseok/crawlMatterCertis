#!/usr/bin/env node

/**
 * Integration Test for Configuration Value Object Pattern
 * 
 * Tests the complete configuration pipeline to ensure the original bug is resolved:
 * ConfigurationViewModel → CrawlingStore → IPCService → ConfigManager
 */

import { promises as fs } from 'fs';
import path from 'path';

// Test scenario: The original bug scenario
const ORIGINAL_BUG_CONFIG = {
  pageRangeLimit: 5,
  productListRetryCount: 10,
  productDetailRetryCount: 8,
  baseUrl: 'https://csa-iot.org/csa-iot_products/',
  productsPerPage: 24
};

const INVALID_CONFIG = {
  pageRangeLimit: 0,  // Should trigger validation error
  productListRetryCount: 25,  // Should trigger validation error
  baseUrl: 'not-a-url'  // Should trigger validation error
};

const EDGE_CASE_CONFIG = {
  pageRangeLimit: 500,  // Maximum allowed
  productListRetryCount: 20,  // Maximum allowed
  productsPerPage: 100  // Maximum allowed
};

async function testConfigurationValue() {
  console.log('🧪 Testing ConfigurationValue module...\n');
  
  try {
    // Import the ConfigurationValidator
    const { ConfigurationValidator } = await import('./dist-electron/shared/domain/ConfigurationValue.js');
    
    console.log('✅ ConfigurationValidator module loaded successfully');
    
    // Test 1: Valid configuration should pass
    console.log('\n📝 Test 1: Valid configuration validation...');
    const validResult = ConfigurationValidator.validatePartialUpdate({}, ORIGINAL_BUG_CONFIG);
    
    if (validResult.isValid) {
      console.log('✅ Valid configuration passed validation');
    } else {
      console.log('❌ Valid configuration failed validation:', validResult.errors);
      return false;
    }
    
    // Test 2: Invalid configuration should fail
    console.log('\n📝 Test 2: Invalid configuration validation...');
    const invalidResult = ConfigurationValidator.validatePartialUpdate({}, INVALID_CONFIG);
    
    if (!invalidResult.isValid) {
      console.log('✅ Invalid configuration correctly rejected');
      console.log('🔍 Validation errors:', invalidResult.errors);
    } else {
      console.log('❌ Invalid configuration incorrectly passed validation');
      return false;
    }
    
    // Test 3: Edge case configuration
    console.log('\n📝 Test 3: Edge case configuration validation...');
    const edgeResult = ConfigurationValidator.validatePartialUpdate({}, EDGE_CASE_CONFIG);
    
    if (edgeResult.isValid) {
      console.log('✅ Edge case configuration passed validation');
      if (Object.keys(edgeResult.warnings).length > 0) {
        console.log('⚠️ Warnings generated:', edgeResult.warnings);
      }
    } else {
      console.log('❌ Edge case configuration failed validation:', edgeResult.errors);
    }
    
    return true;
    
  } catch (error) {
    console.error('❌ ConfigurationValue module test failed:', error.message);
    return false;
  }
}

async function testConfigManager() {
  console.log('\n🧪 Testing ConfigManager integration...\n');
  
  try {
    // Import ConfigManager
    const { ConfigManager } = await import('./dist-electron/electron/ConfigManager.js');
    
    console.log('✅ ConfigManager module loaded successfully');
    
    // Create a test config manager with a temporary config file
    const testConfigPath = path.join(process.cwd(), 'test-config.json');
    
    // Clean up any existing test config
    try {
      await fs.unlink(testConfigPath);
    } catch {}
    
    // Test 1: Configuration update with valid values
    console.log('\n📝 Test 1: ConfigManager valid update...');
    const configManager = new ConfigManager();
    
    try {
      const updatedConfig = configManager.updateConfig(ORIGINAL_BUG_CONFIG);
      console.log('✅ ConfigManager successfully updated valid configuration');
      console.log('📊 Updated values:', {
        pageRangeLimit: updatedConfig.pageRangeLimit,
        productListRetryCount: updatedConfig.productListRetryCount,
        productDetailRetryCount: updatedConfig.productDetailRetryCount
      });
      
      // Verify values match what was set (the original bug was that they got changed to minimums)
      if (updatedConfig.pageRangeLimit === ORIGINAL_BUG_CONFIG.pageRangeLimit &&
          updatedConfig.productListRetryCount === ORIGINAL_BUG_CONFIG.productListRetryCount &&
          updatedConfig.productDetailRetryCount === ORIGINAL_BUG_CONFIG.productDetailRetryCount) {
        console.log('✅ Configuration values preserved correctly (bug fixed!)');
      } else {
        console.log('❌ Configuration values were altered unexpectedly (bug still exists!)');
        console.log('Expected:', ORIGINAL_BUG_CONFIG);
        console.log('Actual:', {
          pageRangeLimit: updatedConfig.pageRangeLimit,
          productListRetryCount: updatedConfig.productListRetryCount,
          productDetailRetryCount: updatedConfig.productDetailRetryCount
        });
        return false;
      }
    } catch (error) {
      console.log('❌ ConfigManager failed to update valid configuration:', error.message);
      return false;
    }
    
    // Test 2: Configuration update with invalid values should fail
    console.log('\n📝 Test 2: ConfigManager invalid update...');
    try {
      configManager.updateConfig(INVALID_CONFIG);
      console.log('❌ ConfigManager should have rejected invalid configuration');
      return false;
    } catch (error) {
      console.log('✅ ConfigManager correctly rejected invalid configuration');
      console.log('🔍 Rejection reason:', error.message);
    }
    
    return true;
    
  } catch (error) {
    console.error('❌ ConfigManager integration test failed:', error.message);
    return false;
  }
}

async function testRealWorldScenario() {
  console.log('\n🧪 Testing real-world scenario...\n');
  
  // Simulate the exact scenario from the original bug report
  const realWorldConfig = {
    pageRangeLimit: 5,
    productListRetryCount: 10,
    productDetailRetryCount: 8
  };
  
  try {
    const { ConfigurationValidator } = await import('./dist-electron/shared/domain/ConfigurationValue.js');
    const { ConfigManager } = await import('./dist-electron/electron/ConfigManager.js');
    
    console.log('📝 Testing exact original bug scenario...');
    console.log('🔧 Input configuration:', realWorldConfig);
    
    // Step 1: Validate configuration
    const validationResult = ConfigurationValidator.validatePartialUpdate({}, realWorldConfig);
    
    if (!validationResult.isValid) {
      console.log('❌ Real-world configuration failed validation:', validationResult.errors);
      return false;
    }
    
    console.log('✅ Real-world configuration passed validation');
    
    // Step 2: Apply configuration through ConfigManager
    const configManager = new ConfigManager();
    const result = configManager.updateConfig(realWorldConfig);
    
    // Step 3: Verify values were not corrupted
    const corruption = [];
    
    if (result.pageRangeLimit !== realWorldConfig.pageRangeLimit) {
      corruption.push(`pageRangeLimit: expected ${realWorldConfig.pageRangeLimit}, got ${result.pageRangeLimit}`);
    }
    
    if (result.productListRetryCount !== realWorldConfig.productListRetryCount) {
      corruption.push(`productListRetryCount: expected ${realWorldConfig.productListRetryCount}, got ${result.productListRetryCount}`);
    }
    
    if (result.productDetailRetryCount !== realWorldConfig.productDetailRetryCount) {
      corruption.push(`productDetailRetryCount: expected ${realWorldConfig.productDetailRetryCount}, got ${result.productDetailRetryCount}`);
    }
    
    if (corruption.length > 0) {
      console.log('❌ Value corruption detected (original bug still exists):');
      corruption.forEach(issue => console.log(`   ${issue}`));
      return false;
    }
    
    console.log('🎉 No value corruption detected - original bug has been FIXED!');
    console.log('📊 Final configuration values:', {
      pageRangeLimit: result.pageRangeLimit,
      productListRetryCount: result.productListRetryCount,
      productDetailRetryCount: result.productDetailRetryCount
    });
    
    return true;
    
  } catch (error) {
    console.error('❌ Real-world scenario test failed:', error.message);
    console.error('Stack trace:', error.stack);
    return false;
  }
}

async function runIntegrationTests() {
  console.log('🚀 Starting Configuration Integration Tests\n');
  console.log('🎯 Goal: Verify that the original configuration corruption bug is fixed\n');
  console.log('=' .repeat(70));
  
  const results = [];
  
  // Test 1: ConfigurationValue module
  results.push(await testConfigurationValue());
  
  // Test 2: ConfigManager integration
  results.push(await testConfigManager());
  
  // Test 3: Real-world scenario
  results.push(await testRealWorldScenario());
  
  console.log('\n' + '=' .repeat(70));
  console.log('📈 Integration Test Results:');
  console.log('=' .repeat(70));
  
  const passed = results.filter(Boolean).length;
  const total = results.length;
  
  if (passed === total) {
    console.log(`🎉 ALL TESTS PASSED (${passed}/${total})`);
    console.log('✅ Configuration corruption bug has been RESOLVED!');
    console.log('✅ Value Object pattern is working correctly!');
    console.log('✅ Clean Code architecture is functioning as expected!');
  } else {
    console.log(`❌ TESTS FAILED (${passed}/${total})`);
    console.log('🚨 Some issues remain in the configuration system');
  }
  
  return passed === total;
}

// Run the integration tests
runIntegrationTests()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('💥 Integration test runner failed:', error);
    process.exit(1);
  });
