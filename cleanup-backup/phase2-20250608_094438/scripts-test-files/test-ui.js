/**
 * UI Test Runner
 * Runs tests for UI components and hooks
 */
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';

const rootDir = resolve(__dirname, '..');
const testDir = resolve(rootDir, 'src/ui/test');

// Make sure test dir exists
if (!existsSync(testDir)) {
  console.error(`Test directory not found: ${testDir}`);
  process.exit(1);
}

console.log('Running UI tests...');

try {
  execSync(`npx vitest run --dir ${testDir}`, {
    cwd: rootDir,
    stdio: 'inherit'
  });
  console.log('✅ UI tests completed successfully');
} catch (error) {
  console.error('❌ UI tests failed');
  process.exit(1);
}
