/**
 * test-missing-data-simple.ts
 * Direct database function test without Electron dependencies
 */

import sqlite3 from 'sqlite3';
import path from 'path';

const dbPath = path.join(process.env.HOME!, 'Library/Application Support/crawlmattercertis/dev-database.sqlite');

// Simplified versions of the database functions for testing
async function testMissingProductDetails(): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath);
    
    const query = `
      SELECT p.url, p.pageId, p.indexInPage
      FROM products p
      LEFT JOIN product_details pd ON p.url = pd.url
      WHERE pd.url IS NULL
      ORDER BY p.pageId DESC, p.indexInPage DESC
      LIMIT 10
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

async function testIncompletePages(): Promise<any[]> {
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
      LIMIT 10
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

async function testTableCounts(): Promise<any> {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath);
    
    const queries = [
      "SELECT COUNT(*) as productsCount FROM products",
      "SELECT COUNT(*) as productDetailsCount FROM product_details"
    ];
    
    let results: any = {};
    let completed = 0;
    
    queries.forEach((query, index) => {
      db.get(query, (err, row: any) => {
        if (err) {
          db.close();
          reject(err);
          return;
        }
        
        if (index === 0) results.productsCount = row.productsCount;
        if (index === 1) results.productDetailsCount = row.productDetailsCount;
        
        completed++;
        if (completed === queries.length) {
          results.difference = results.productsCount - results.productDetailsCount;
          db.close();
          resolve(results);
        }
      });
    });
  });
}

async function testSimpleMissingDataAnalysis() {
  console.log('=== Simple Missing Data Analysis Test ===');
  console.log(`Using database: ${dbPath}`);
  
  try {
    console.log('Starting tests...');
    
    // Test table counts
    console.log('\n1. Testing table counts...');
    const counts = await testTableCounts();
    console.log('Table counts:', counts);
    
    // Test missing product details
    console.log('\n2. Testing missing product details (sample)...');
    const missingDetails = await testMissingProductDetails();
    console.log(`Found ${missingDetails.length} missing details (showing first 10):`);
    missingDetails.forEach((item, i) => {
      console.log(`  ${i + 1}. Page ${item.pageId}, Index ${item.indexInPage}: ${item.url}`);
    });
    
    // Test incomplete pages
    console.log('\n3. Testing incomplete pages (sample)...');
    const incompletePages = await testIncompletePages();
    console.log(`Found ${incompletePages.length} incomplete pages (showing first 10):`);
    incompletePages.forEach((page, i) => {
      console.log(`  ${i + 1}. Page ${page.pageId}: ${page.actualCount}/12 products`);
    });
    
    console.log('\n✅ All tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Make sure the function actually runs
testSimpleMissingDataAnalysis().then(() => {
  console.log('Test function completed');
}).catch(error => {
  console.error('Test function error:', error);
  process.exit(1);
});
