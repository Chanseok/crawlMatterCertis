/**
 * test-page-calculator-simple.ts
 * Simple MissingPageCalculator test without Electron dependencies
 */

import sqlite3 from 'sqlite3';
import path from 'path';

const dbPath = path.join(process.env.HOME!, 'Library/Application Support/crawlmattercertis/dev-database.sqlite');

// Simplified page ID conversion functions
function pageIdToPageNumber(pageId: number): number {
  return pageId + 1;
}

function pageNumberToPageId(pageNumber: number): number {
  return pageNumber - 1;
}

// Simplified incomplete pages query
async function getIncompletePages(): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath);
    
    const query = `
      WITH page_stats AS (
        SELECT 
          pageId,
          COUNT(*) as actualCount,
          MIN(indexInPage) as minIndex,
          MAX(indexInPage) as maxIndex
        FROM products
        WHERE pageId IS NOT NULL
        GROUP BY pageId
      )
      SELECT 
        pageId,
        actualCount,
        12 as expectedCount
      FROM page_stats
      WHERE actualCount < 12 OR minIndex != 0 OR maxIndex != 11
      ORDER BY pageId DESC
      LIMIT 20
    `;

    db.all(query, (err, rows: any[]) => {
      db.close();
      if (err) {
        reject(err);
        return;
      }
      resolve(rows);
    });
  });
}

// Simplified range calculation
function calculatePageRanges(pageIds: number[]): {
  continuousRanges: any[];
  nonContinuousRanges: any[];
} {
  if (pageIds.length === 0) {
    return { continuousRanges: [], nonContinuousRanges: [] };
  }

  const sortedPageIds = [...pageIds].sort((a, b) => a - b);
  const continuousRanges: any[] = [];
  const nonContinuousRanges: any[] = [];

  let currentRangeStart = sortedPageIds[0];
  let currentRangeEnd = sortedPageIds[0];

  for (let i = 1; i < sortedPageIds.length; i++) {
    const currentPage = sortedPageIds[i];
    const previousPage = sortedPageIds[i - 1];

    if (currentPage === previousPage + 1) {
      currentRangeEnd = currentPage;
    } else {
      const totalPages = currentRangeEnd - currentRangeStart + 1;
      const range = {
        startPage: pageIdToPageNumber(currentRangeStart),
        endPage: pageIdToPageNumber(currentRangeEnd),
        totalPages,
        reason: 'Missing data detected'
      };

      if (totalPages >= 3) {
        continuousRanges.push(range);
      } else {
        nonContinuousRanges.push(range);
      }

      currentRangeStart = currentPage;
      currentRangeEnd = currentPage;
    }
  }

  // Last range
  const lastTotalPages = currentRangeEnd - currentRangeStart + 1;
  const lastRange = {
    startPage: pageIdToPageNumber(currentRangeStart),
    endPage: pageIdToPageNumber(currentRangeEnd),
    totalPages: lastTotalPages,
    reason: 'Missing data detected'
  };

  if (lastTotalPages >= 3) {
    continuousRanges.push(lastRange);
  } else {
    nonContinuousRanges.push(lastRange);
  }

  return { continuousRanges, nonContinuousRanges };
}

async function testSimplePageCalculator() {
  console.log('=== Simple Page Calculator Test ===');
  console.log(`Using database: ${dbPath}`);
  
  try {
    console.log('Starting page calculation test...');
    
    // Test 1: Get incomplete pages
    console.log('\n1. Getting incomplete pages...');
    const incompletePages = await getIncompletePages();
    console.log(`Found ${incompletePages.length} incomplete pages (showing first 20)`);
    
    // Show sample incomplete pages
    incompletePages.slice(0, 5).forEach((page, i) => {
      console.log(`  ${i + 1}. Page ${pageIdToPageNumber(page.pageId)} (ID: ${page.pageId}): ${page.actualCount}/12 products`);
    });
    
    // Test 2: Calculate ranges
    console.log('\n2. Calculating page ranges...');
    const pageIds = incompletePages.map(p => p.pageId);
    const { continuousRanges, nonContinuousRanges } = calculatePageRanges(pageIds);
    
    console.log(`  Continuous ranges: ${continuousRanges.length}`);
    console.log(`  Non-continuous ranges: ${nonContinuousRanges.length}`);
    
    // Show continuous ranges
    if (continuousRanges.length > 0) {
      console.log('\n  Continuous ranges:');
      continuousRanges.forEach((range, i) => {
        if (range.totalPages === 1) {
          console.log(`    ${i + 1}. Page ${range.startPage}`);
        } else {
          console.log(`    ${i + 1}. Pages ${range.startPage}-${range.endPage} (${range.totalPages} pages)`);
        }
      });
    }
    
    // Show sample non-continuous ranges
    if (nonContinuousRanges.length > 0) {
      console.log('\n  Non-continuous ranges (first 5):');
      nonContinuousRanges.slice(0, 5).forEach((range, i) => {
        if (range.totalPages === 1) {
          console.log(`    ${i + 1}. Page ${range.startPage}`);
        } else {
          console.log(`    ${i + 1}. Pages ${range.startPage}-${range.endPage} (${range.totalPages} pages)`);
        }
      });
      if (nonContinuousRanges.length > 5) {
        console.log(`    ... and ${nonContinuousRanges.length - 5} more single/small ranges`);
      }
    }
    
    // Test 3: Time estimation
    console.log('\n3. Time estimation...');
    const allRanges = [...continuousRanges, ...nonContinuousRanges];
    const totalPages = allRanges.reduce((sum, range) => sum + range.totalPages, 0);
    const estimatedMinutes = Math.ceil(totalPages * 30 / 60); // 30 seconds per page
    
    console.log(`  Total pages to process: ${totalPages}`);
    console.log(`  Estimated processing time: ${estimatedMinutes} minutes`);
    
    console.log('\n✅ Simple page calculator test completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testSimplePageCalculator().then(() => {
  console.log('Test completed successfully');
}).catch(error => {
  console.error('Test error:', error);
  process.exit(1);
});
