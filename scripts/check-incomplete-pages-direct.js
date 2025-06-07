/**
 * 직접 DB를 조회하여 incomplete pages 현황을 확인하는 스크립트
 */
import sqlite3 from 'sqlite3';
import path from 'path';

const dbPath = path.join(process.env.HOME, 'Library/Application Support/crawlmattercertis/dev-database.sqlite');

// Page ID to page number conversion
function pageIdToPageNumber(pageId) {
  return pageId + 1;
}

// 상세한 incomplete pages 분석
async function analyzeIncompletePages() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath);
    
    const query = `
      WITH page_stats AS (
        SELECT 
          pageId,
          COUNT(*) as actualCount,
          MIN(indexInPage) as minIndex,
          MAX(indexInPage) as maxIndex,
          GROUP_CONCAT(indexInPage ORDER BY indexInPage) as existingIndices
        FROM products
        WHERE pageId IS NOT NULL
        GROUP BY pageId
      ),
      expected_indices AS (
        SELECT 
          pageId,
          actualCount,
          minIndex,
          maxIndex,
          existingIndices,
          12 as expectedCount,
          CASE 
            WHEN actualCount < 12 OR minIndex != 0 OR maxIndex != (actualCount - 1) THEN 1
            ELSE 0
          END as isIncomplete
        FROM page_stats
      )
      SELECT 
        pageId,
        actualCount,
        expectedCount,
        existingIndices,
        minIndex,
        maxIndex,
        isIncomplete
      FROM expected_indices
      WHERE isIncomplete = 1
      ORDER BY pageId DESC
      LIMIT 30
    `;

    db.all(query, (err, rows) => {
      db.close();
      if (err) {
        reject(err);
        return;
      }
      resolve(rows);
    });
  });
}

// 전체 통계 조회
async function getOverallStats() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath);
    
    const queries = [
      "SELECT COUNT(DISTINCT pageId) as totalPages FROM products WHERE pageId IS NOT NULL",
      "SELECT COUNT(*) as totalProducts FROM products",
      "SELECT COUNT(DISTINCT pageId) as incompletePages FROM (SELECT pageId, COUNT(*) as cnt FROM products WHERE pageId IS NOT NULL GROUP BY pageId HAVING cnt < 12 OR MIN(indexInPage) != 0)"
    ];
    
    let results = {};
    let completed = 0;
    
    queries.forEach((query, index) => {
      db.get(query, (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        
        const keys = ['totalPages', 'totalProducts', 'incompletePages'];
        results[keys[index]] = Object.values(row)[0];
        completed++;
        
        if (completed === queries.length) {
          db.close();
          resolve(results);
        }
      });
    });
  });
}

async function main() {
  console.log('=== Incomplete Pages Analysis ===');
  console.log(`Database: ${dbPath}\n`);
  
  try {
    // 전체 통계
    const stats = await getOverallStats();
    console.log('Overall Statistics:');
    console.log(`- Total pages in DB: ${stats.totalPages}`);
    console.log(`- Total products: ${stats.totalProducts}`);
    console.log(`- Incomplete pages: ${stats.incompletePages}`);
    console.log(`- Completion rate: ${((stats.totalPages - stats.incompletePages) / stats.totalPages * 100).toFixed(1)}%\n`);
    
    // 상세 분석
    const incompletePages = await analyzeIncompletePages();
    console.log(`Detailed analysis of ${incompletePages.length} incomplete pages:\n`);
    
    incompletePages.forEach((page, index) => {
      const pageNumber = pageIdToPageNumber(page.pageId);
      const existingIndices = page.existingIndices.split(',').map(Number);
      const missingIndices = [];
      
      // 0-11 중 누락된 인덱스 찾기
      for (let i = 0; i < 12; i++) {
        if (!existingIndices.includes(i)) {
          missingIndices.push(i);
        }
      }
      
      console.log(`${index + 1}. Page ${pageNumber} (ID: ${page.pageId})`);
      console.log(`   Products: ${page.actualCount}/12`);
      console.log(`   Existing indices: [${existingIndices.join(', ')}]`);
      console.log(`   Missing indices: [${missingIndices.join(', ')}]`);
      console.log(`   Index range: ${page.minIndex} to ${page.maxIndex}`);
      console.log('');
    });
    
    // 문제 유형별 분류
    const issues = {
      partial: 0,  // 일부 제품만 누락
      shifted: 0,  // 인덱스가 0부터 시작하지 않음
      gaps: 0      // 중간에 빈 구멍이 있음
    };
    
    incompletePages.forEach(page => {
      const existingIndices = page.existingIndices.split(',').map(Number);
      
      if (page.minIndex !== 0) {
        issues.shifted++;
      }
      
      if (page.actualCount < 12) {
        issues.partial++;
      }
      
      // 연속성 확인
      let hasGaps = false;
      for (let i = page.minIndex; i < page.maxIndex; i++) {
        if (!existingIndices.includes(i)) {
          hasGaps = true;
          break;
        }
      }
      if (hasGaps) {
        issues.gaps++;
      }
    });
    
    console.log('Issue Classification:');
    console.log(`- Partial collection (< 12 products): ${issues.partial}`);
    console.log(`- Index shifting (not starting from 0): ${issues.shifted}`);
    console.log(`- Index gaps (missing products in middle): ${issues.gaps}`);
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
