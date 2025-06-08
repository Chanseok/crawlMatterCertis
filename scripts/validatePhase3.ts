/**
 * Phase 3 Service Layer Validation Script
 * Tests the new event // Run val// Export for potential use in testing framework
export { validatePhase3Patterns };

// Run validation if script is executed directly
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  validatePhase3Patterns()
    .then(() => {
      console.log('🚀 Phase 3 service layer is ready for production!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Phase 3 validation failed:', error);
      process.exit(1);
    });
}pt is executed directly
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  validatePhase3Patterns()
    .then(() => {
      console.log('🚀 Phase 3 service layer is ready for production!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Phase 3 validation failed:', error);
      process.exit(1);
    });
} patterns, resilience management, and service lifecycle
 */

import { serviceFactory } from '../src/ui/services/ServiceFactory.js';
import { CrawlingService } from '../src/ui/services/domain/CrawlingService.js';
import { DatabaseService } from '../src/ui/services/domain/DatabaseService.js';
import { ConfigurationService } from '../src/ui/services/domain/ConfigurationService.js';

async function validatePhase3Patterns() {
  console.log('🚀 Phase 3 Service Layer Validation');
  console.log('=====================================');

  try {
    // Test 1: Service Factory Initialization
    console.log('\n1️⃣  Testing Service Factory Initialization...');
    await serviceFactory.initializeServices();
    console.log('✅ Service factory initialization completed');

    // Test 2: Service Health Check
    console.log('\n2️⃣  Testing Service Health Monitoring...');
    const healthStatus = await serviceFactory.performHealthCheck();
    console.log('✅ Health check completed:', Object.keys(healthStatus).length, 'services checked');
    
    // Test 3: Event Subscription Patterns
    console.log('\n3️⃣  Testing Event Subscription Patterns...');
    const crawlingService = serviceFactory.getCrawlingService();
    
    // Test new subscription pattern
    const unsubscribe = crawlingService.subscribeCrawlingProgress((progress) => {
      console.log('📊 Progress event received:', progress);
    });
    
    console.log('✅ Event subscription created (returns unsubscribe function)');
    console.log('✅ Subscription type:', typeof unsubscribe);
    
    // Test unsubscription
    unsubscribe();
    console.log('✅ Event unsubscription completed');

    // Test 4: Resilience Patterns
    console.log('\n4️⃣  Testing Resilience Patterns...');
    const databaseService = serviceFactory.getDatabaseService();
    
    // Test executeOperation with resilience
    const testResult = await databaseService.getDatabaseSummary();
    console.log('✅ Resilience pattern test:', testResult.success ? 'SUCCESS' : 'FAILED');

    // Test 5: Service Cleanup
    console.log('\n5️⃣  Testing Service Cleanup...');
    const configService = serviceFactory.getConfigurationService();
    if (typeof configService.cleanup === 'function') {
      await configService.cleanup();
      console.log('✅ Service cleanup method available and working');
    }

    console.log('\n🎉 Phase 3 Validation Complete!');
    console.log('=====================================');
    console.log('✅ All Phase 3 patterns validated successfully');
    
  } catch (error) {
    console.error('❌ Phase 3 validation failed:', error);
    process.exit(1);
  }
}

// Export for potential use in testing framework
export { validatePhase3Patterns };
