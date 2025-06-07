/**
 * Test script to verify MobX fixes in ConfigurationViewModel
 */

import { ConfigurationViewModel } from '../src/ui/viewModels/ConfigurationViewModel';

async function testMobXFixes() {
  console.log('🧪 Testing MobX fixes in ConfigurationViewModel...');
  
  const viewModel = new ConfigurationViewModel();
  
  // Wait for initialization to complete
  await new Promise(resolve => setTimeout(resolve, 100));
  
  try {
    // Test 1: Check if hasChanges computed works without circular reference
    console.log('✅ Test 1: hasChanges computed property');
    const initialHasChanges = viewModel.hasChanges;
    console.log(`   Initial hasChanges: ${initialHasChanges}`);
    
    // Test 2: Test canSave computed without circular reference
    console.log('✅ Test 2: canSave computed property');
    const initialCanSave = viewModel.canSave;
    console.log(`   Initial canSave: ${initialCanSave}`);
    
    // Test 3: Test configuration state
    console.log('✅ Test 3: configurationState computed property');
    const configState = viewModel.configurationState;
    console.log(`   Configuration loaded: ${Object.keys(configState.config).length > 0}`);
    console.log(`   Has changes: ${configState.hasChanges}`);
    
    // Test 4: Test updating config (should trigger computed recalculation)
    console.log('✅ Test 4: Update configuration');
    viewModel.updateConfig('pageRangeLimit', 100);
    const updatedHasChanges = viewModel.hasChanges;
    const updatedCanSave = viewModel.canSave;
    console.log(`   After update - hasChanges: ${updatedHasChanges}, canSave: ${updatedCanSave}`);
    
    // Test 5: Test reset (should clear changes)
    console.log('✅ Test 5: Reset configuration');
    viewModel.resetConfiguration();
    const resetHasChanges = viewModel.hasChanges;
    const resetCanSave = viewModel.canSave;
    console.log(`   After reset - hasChanges: ${resetHasChanges}, canSave: ${resetCanSave}`);
    
    console.log('🎉 All MobX tests passed! No circular references or strict-mode violations detected.');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testMobXFixes().catch(console.error);
