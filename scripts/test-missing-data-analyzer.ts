/**
 * test-missing-data-analyzer.ts
 * MissingDataAnalyzer 테스트 스크립트
 */

import * as path from 'path';
import { MissingDataAnalyzer } from '/Users/chanseok/Codes/crawlMatterCertis/dist-electron/electron/services/MissingDataAnalyzer.js';

const dbPath = path.join(process.env.HOME!, 'Library/Application Support/crawlmattercertis/dev-database.sqlite');

async function testMissingDataAnalyzer() {
    console.log('=== Missing Data Analyzer Test ===');
    console.log(`Using database: ${dbPath}`);
    
    try {
        const analyzer = new MissingDataAnalyzer(); // No database path needed
        
        // 전체 분석 실행
        console.log('\n1. Running full analysis...');
        const analysis = await analyzer.analyzeTableDifferences();
        
        console.log('\n📊 Analysis Results:');
        console.log(`- Products count: ${analysis.summary.productsCount}`);
        console.log(`- Product details count: ${analysis.summary.productDetailsCount}`);
        console.log(`- Difference: ${analysis.summary.difference}`);
        console.log(`- Missing details: ${analysis.totalMissingDetails}`);
        console.log(`- Incomplete pages: ${analysis.totalIncompletePages}`);
        
        // 누락된 상세 정보 표시 (처음 10개만)
        if (analysis.missingDetails.length > 0) {
            console.log('\n🔍 Missing Product Details (first 10):');
            analysis.missingDetails.slice(0, 10).forEach((product, index) => {
                console.log(`  ${index + 1}. PageId: ${product.pageId}, Index: ${product.indexInPage}, URL: ${product.url}`);
            });
            if (analysis.missingDetails.length > 10) {
                console.log(`  ... and ${analysis.missingDetails.length - 10} more`);
            }
        }
        
        // 불완전한 페이지 표시 (처음 5개만)
        if (analysis.incompletePages.length > 0) {
            console.log('\n📄 Incomplete Pages (first 5):');
            analysis.incompletePages.slice(0, 5).forEach((page, index) => {
                console.log(`  ${index + 1}. PageId: ${page.pageId}, Missing indices: [${page.missingIndices.join(', ')}], Count: ${page.actualCount}/${page.expectedCount}`);
            });
            if (analysis.incompletePages.length > 5) {
                console.log(`  ... and ${analysis.incompletePages.length - 5} more`);
            }
        }
        
        // 개별 함수 테스트
        console.log('\n2. Testing individual functions...');
        
        const missingDetails = await analyzer.findMissingProductDetails();
        console.log(`📋 Missing details (individual query): ${missingDetails.length}`);
        
        const incompletePages = await analyzer.findIncompletePages();
        console.log(`📄 Incomplete pages (individual query): ${incompletePages.length}`);
        
        console.log('\n✅ Test completed successfully!');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
        process.exit(1);
    }
}

// 실행
testMissingDataAnalyzer().catch(console.error);
