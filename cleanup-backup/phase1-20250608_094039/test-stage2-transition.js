#!/usr/bin/env node

/**
 * Test Stage 2 Transition
 * 
 * This script tests if the Stage 2 transition works properly by
 * simulating a crawling start call via the browser developer console.
 */

console.log("=== Stage 2 Transition Test ===");
console.log("");
console.log("Instructions:");
console.log("1. Open the application in browser at http://localhost:5123");
console.log("2. Open Developer Console (F12)");
console.log("3. Copy and paste the following code:");
console.log("");
console.log("--- START COPY FROM HERE ---");
console.log(`
// Test Stage 2 transition by starting crawling
(async () => {
  try {
    console.log("🧪 Testing Stage 2 transition...");
    
    // Get current config first
    const config = await window.electron.getConfig();
    console.log("Current config:", config);
    
    // Start crawling with the modified object format that was fixed
    const result = await window.electron.startCrawling({ 
      mode: 'development', 
      config: config 
    });
    
    console.log("✅ Crawling started successfully:", result);
    console.log("🔍 Watch the console for Stage 1 → Stage 2 transition messages");
    console.log("📋 Look for: '1단계: 제품 목록 수집이 완료되었습니다. 2단계를 시작합니다.'");
    
  } catch (error) {
    console.error("❌ Error starting crawling:", error);
  }
})();
`);
console.log("--- END COPY TO HERE ---");
console.log("");
console.log("Expected Results:");
console.log("- Crawling should start without IPC errors");
console.log("- Should see Stage 1 completion message");
console.log("- Should see Stage 2 start message");
console.log("- UI should display 'Stage 2: Product Detail Collection'");
console.log("");
console.log("🎯 Key Test Points:");
console.log("1. No 'object could not be cloned' errors");
console.log("2. Progression from Stage 1 to Stage 2");
console.log("3. UI updates to show current stage correctly");
