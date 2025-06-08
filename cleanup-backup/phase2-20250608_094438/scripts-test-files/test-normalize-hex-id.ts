/**
 * test-normalize-hex-id.ts
 * 
 * Tests the normalizeHexId function with different input types.
 */

// Mock implementation of the normalizeHexId function
function normalizeHexId(value: string | number | undefined): number | undefined {
  // Value is a number, return it directly
  if (typeof value === 'number') {
    console.log(`Input was a number: ${value}, returning as is.`);
    return value;
  }
  
  // Value is undefined or meaningless string
  if (!value || (typeof value === 'string' && ['', 'n/a', '-', 'none', 'unknown'].includes(value.toLowerCase().trim()))) {
    console.log(`Input was empty or meaningless: ${value}, returning undefined.`);
    return undefined;
  }
  
  const trimmedValue = String(value).trim();
  
  try {
    // Hex format check (with 0x prefix)
    if (/^0x[0-9A-Fa-f]+$/i.test(trimmedValue)) {
      const result = parseInt(trimmedValue.substring(2), 16);
      console.log(`Input was hex with prefix: ${value}, parsed as: ${result}`);
      return result;
    } 
    // Hex format check (without prefix)
    else if (/^[0-9A-Fa-f]+$/i.test(trimmedValue)) {
      const result = parseInt(trimmedValue, 16);
      console.log(`Input was hex without prefix: ${value}, parsed as: ${result}`);
      return result;
    } 
    // Decimal number
    else if (/^\d+$/.test(trimmedValue)) {
      const result = parseInt(trimmedValue, 10);
      console.log(`Input was decimal: ${value}, parsed as: ${result}`);
      return result;
    } 
    // Unsupported format
    else {
      console.log(`Input was unsupported format: ${value}, returning undefined.`);
      return undefined;
    }
  } catch (e) {
    console.error(`Hex conversion failed: ${value}`, e);
    return undefined;
  }
}

// Mock implementation of the mapKeyToField function (simplified)
function mapKeyToField(key: string, value: string | number, fields: Record<string, any>): void {
  console.log(`\nMapKeyToField called with:
  - key: ${key}
  - value: ${value} (type: ${typeof value})
  - fieldName: 'vid' or 'pid'
`);

  if (typeof value === 'number') {
    console.log(`  Value is a number, setting directly without conversion: ${value}`);
    fields['vid'] = value;
  } else if (value && typeof value === 'string' && !['n/a', '-', 'none', 'unknown'].includes(value.toLowerCase().trim())) {
    console.log(`  Value is a string, normalizing: "${value}"`);
    fields['vid'] = normalizeHexId(value);
  } else {
    console.log(`  Value is empty or meaningless: "${value}", not setting field`);
  }
  
  console.log(`  Result in fields: ${fields['vid']}`);
}

// Test function with various inputs
function testNormalizeHexId() {
  console.log('==== Testing normalizeHexId function ====');
  
  // Test with string inputs
  console.log('\nTesting string inputs:');
  normalizeHexId('0x1234');     // Hex with prefix
  normalizeHexId('abcd');       // Hex without prefix
  normalizeHexId('1234');       // Could be interpreted as decimal or hex
  normalizeHexId('n/a');        // Meaningless string
  normalizeHexId('');           // Empty string
  
  // Test with number inputs
  console.log('\nTesting number inputs:');
  normalizeHexId(0x1234);       // Number from hex literal
  normalizeHexId(1234);         // Decimal number
  normalizeHexId(0);            // Zero
  
  // Test with undefined
  console.log('\nTesting undefined:');
  normalizeHexId(undefined);
  
  // Test with vid/pid examples from a database
  console.log('\nTesting with sample vid/pid values:');
  normalizeHexId('0x1234');     // String VID with prefix
  normalizeHexId(0x1234);       // Number VID from hex
  normalizeHexId(4660);         // Number VID as decimal (0x1234 = 4660)
  
  // Test mapKeyToField function with different value types
  console.log('\n==== Testing mapKeyToField function ====');
  const fields: Record<string, any> = {};
  
  // Test with string input
  mapKeyToField('vid', '0x1234', fields);
  
  // Test with number input
  fields['vid'] = undefined; // Reset
  mapKeyToField('vid', 0x1234, fields);
  
  // Test with already-parsed number in database
  fields['vid'] = undefined; // Reset
  mapKeyToField('vid', 4660, fields);
  
  // Test with empty/meaningless input
  fields['vid'] = undefined; // Reset
  mapKeyToField('vid', 'n/a', fields);
  
  console.log('\n==== Tests complete ====');
}

// Run the test
testNormalizeHexId();
