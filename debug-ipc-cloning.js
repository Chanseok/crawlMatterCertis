/**
 * Debug script to test IPC cloning error
 * This script will analyze the exact structure that was causing the "An object could not be cloned" error
 */

console.log('🔍 Starting IPC cloning debug test...');

async function testIPCCloning() {
    try {
        console.log('Step 1: Getting missing products analysis...');
        
        // Get the analysis result that was causing the cloning error
        const analysisResponse = await window.electron.analyzeMissingProducts();
        console.log('Analysis response:', analysisResponse);
        
        if (analysisResponse.success) {
            const originalAnalysisResult = analysisResponse.analysis;
            console.log('Original analysis result structure:', originalAnalysisResult);
            
            // Log detailed information about the problematic properties
            console.log('missingDetails type:', typeof originalAnalysisResult.missingDetails);
            console.log('missingDetails isArray:', Array.isArray(originalAnalysisResult.missingDetails));
            console.log('missingDetails constructor:', originalAnalysisResult.missingDetails?.constructor?.name);
            console.log('missingDetails sample:', originalAnalysisResult.missingDetails?.slice(0, 2));
            
            console.log('incompletePages type:', typeof originalAnalysisResult.incompletePages);
            console.log('incompletePages isArray:', Array.isArray(originalAnalysisResult.incompletePages));
            console.log('incompletePages constructor:', originalAnalysisResult.incompletePages?.constructor?.name);
            console.log('incompletePages sample:', originalAnalysisResult.incompletePages?.slice(0, 2));
            
            // Test 1: Try to pass the original object (this should fail with cloning error)
            console.log('\n🧪 Test 1: Trying original object (should fail)...');
            try {
                await window.electron.crawlMissingProducts({
                    analysisResult: originalAnalysisResult,
                    config: {}
                });
                console.log('❌ Test 1: Unexpectedly succeeded!');
            } catch (error) {
                console.log('✅ Test 1: Failed as expected with error:', error.message);
            }
            
            // Test 2: Try the serializable version (this should work)
            console.log('\n🧪 Test 2: Trying serializable version (should work)...');
            const serializableAnalysisResult = {
                totalMissingDetails: originalAnalysisResult.totalMissingDetails,
                totalIncompletePages: originalAnalysisResult.totalIncompletePages,
                summary: {
                    productsCount: originalAnalysisResult.summary.productsCount,
                    productDetailsCount: originalAnalysisResult.summary.productDetailsCount,
                    difference: originalAnalysisResult.summary.difference
                },
                missingDetails: originalAnalysisResult.missingDetails ? 
                    [...originalAnalysisResult.missingDetails] : [],
                incompletePages: originalAnalysisResult.incompletePages ? 
                    [...originalAnalysisResult.incompletePages] : []
            };
            
            console.log('Serializable analysis result:', serializableAnalysisResult);
            
            try {
                const result = await window.electron.crawlMissingProducts({
                    analysisResult: serializableAnalysisResult,
                    config: {}
                });
                console.log('✅ Test 2: Succeeded! Result:', result);
            } catch (error) {
                console.log('❌ Test 2: Failed with error:', error.message);
            }
            
        } else {
            console.error('Analysis failed:', analysisResponse.error);
        }
        
    } catch (error) {
        console.error('💥 Debug test failed:', error);
    }
}

// Auto-run the test when loaded
if (window.electron) {
    setTimeout(testIPCCloning, 1000);
} else {
    console.error('Electron API not available');
}
