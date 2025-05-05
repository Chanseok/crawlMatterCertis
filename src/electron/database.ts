import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import type { DatabaseSummary, ProductDetail } from '../ui/types.js'; // Import Product type from your types file
import type { MatterProduct, Product } from '../../types.js'; // Import MatterProduct type from your types file
import { debugLog } from './util.js';

const dbPath = path.join(app.getPath('userData'), 'dev-database.sqlite');
const db = new sqlite3.Database(dbPath);


// --- Initialization --- 

export async function initializeDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
        // SQLite 데이터베이스 파일 경로 로깅
        console.log(`Initializing database at: ${dbPath}`);

        db.serialize(() => {
            // 'products' 테이블 생성
            db.run(`
                 CREATE TABLE IF NOT EXISTS products (
                    url TEXT PRIMARY KEY,
                    manufacturer TEXT,
                    model TEXT,
                    certificateId TEXT,
                    pageId INTEGER,
                    indexInPage INTEGER
                )
                `, (err) => {
                if (err) return reject(err);
                console.log("'products' table checked/created.");
            });

            // 'product_details' 테이블 생성
            db.run(`
                CREATE TABLE IF NOT EXISTS product_details (
                    url TEXT PRIMARY KEY,
                    pageId INTEGER,
                    indexInPage INTEGER,
                    id TEXT,
                    manufacturer TEXT,
                    model TEXT,
                    deviceType TEXT,
                    certificationId TEXT,
                    certificationDate TEXT,
                    softwareVersion TEXT,
                    hardwareVersion TEXT,
                    vid TEXT,
                    pid TEXT,
                    familySku TEXT,
                    familyVariantSku TEXT,
                    firmwareVersion TEXT,
                    familyId TEXT,
                    tisTrpTested TEXT,
                    specificationVersion TEXT,
                    transportInterface TEXT,
                    primaryDeviceTypeId TEXT,
                    applicationCategories TEXT
                )
                `, (err) => {
                if (err) return reject(err);
                console.log("'product_details' table checked/created.");
            });

            // Check if tables are empty 
            db.get("SELECT COUNT(*) as count FROM products", async (err, row: { count: number }) => {
                if (err) return reject(err);
                if (row.count === 0) {
                    console.log(" EMPTY 'products' table...");

                }
                db.get("SELECT COUNT(*) as count FROM product_details", async (err, rowDetails: { count: number }) => {
                    if (err) return reject(err);
                    if (rowDetails.count === 0) {
                        console.log("EMPTY 'product_details' table...");
                    }
                    resolve(); // Resolve after both checks/populations are done
                });
            });

        });
    });
}



// --- Query Functions --- 

export async function getProductsFromDb(page: number = 1, limit: number = 20): Promise<{ products: MatterProduct[], total: number }> {
    return new Promise((resolve, reject) => {
        const offset = (page - 1) * limit;
        // 수정: pageId와 indexInPage 기준으로 내림차순 정렬 적용
        const query = `SELECT * FROM products ORDER BY pageId DESC, indexInPage DESC LIMIT ? OFFSET ?`;
        const countQuery = `SELECT COUNT(*) as total FROM products`;

        db.get(countQuery, (err, row: { total: number }) => {
            if (err) {
                return reject(err);
            }
            const total = row.total;
            console.log(`데이터베이스 전체 레코드 수: ${total}`);
            db.all(query, [limit, offset], (err, rows: any[]) => {
                if (err) {
                    return reject(err);
                }
                // Parse applicationCategories back into an array
                const products = rows.map(row => ({
                    ...row,
                    applicationCategories: JSON.parse(row.applicationCategories || '[]')
                }));
                console.log(`현재 페이지(${page})에서 가져온 레코드 수: ${products.length}, 제한 수: ${limit}, 오프셋: ${offset}`);
                resolve({ products, total });
            });
        });
    });
}

export async function getProductByIdFromDb(id: string): Promise<ProductDetail | null> {
    return new Promise((resolve, reject) => {
        const query = `SELECT * FROM product_details WHERE id = ?`;
        db.get(query, [id], (err, row: any) => {
            if (err) {
                return reject(err);
            }
            if (row) {
                // Parse applicationCategories back into an array
                const productDetail = {
                    ...row,
                    applicationCategories: JSON.parse(row.applicationCategories || '[]')
                };
                resolve(productDetail);
            } else {
                resolve(null);
            }
        });
    });
}

export async function searchProductsInDb(query: string, page: number = 1, limit: number = 20): Promise<{ products: MatterProduct[], total: number }> {
    return new Promise((resolve, reject) => {
        const offset = (page - 1) * limit;
        const searchQuery = `%${query}%`;
        const sql = `
            SELECT * FROM products 
            WHERE manufacturer LIKE ? OR model LIKE ? OR deviceType LIKE ? OR certificationId LIKE ?
            ORDER BY pageId DESC, indexInPage DESC
            LIMIT ? OFFSET ?
        `;
        const countSql = `
            SELECT COUNT(*) as total FROM products 
            WHERE manufacturer LIKE ? OR model LIKE ? OR deviceType LIKE ? OR certificationId LIKE ?
        `;

        db.get(countSql, [searchQuery, searchQuery, searchQuery, searchQuery], (err, row: { total: number }) => {
            if (err) {
                return reject(err);
            }
            const total = row.total;
            db.all(sql, [searchQuery, searchQuery, searchQuery, searchQuery, limit, offset], (err, rows: any[]) => {
                if (err) {
                    return reject(err);
                }
                // Parse applicationCategories back into an array
                const products = rows.map(row => ({
                    ...row,
                    applicationCategories: JSON.parse(row.applicationCategories || '[]')
                }));
                resolve({ products, total });
            });
        });
    });
}

// --- Summary and Update --- 

// Store summary info in a separate table or use file system
const summaryFilePath = path.join(app.getPath('userData'), 'db_summary.json');

interface DbSummaryData {
    lastUpdated: string | null;
    newlyAddedCount: number;
}

async function readSummary(): Promise<DbSummaryData> {
    try {
        if (fs.existsSync(summaryFilePath)) {
            const data = await fs.promises.readFile(summaryFilePath, 'utf-8');
            return JSON.parse(data);
        } else {
            return { lastUpdated: null, newlyAddedCount: 0 };
        }
    } catch (error) {
        console.error("Error reading summary file:", error);
        return { lastUpdated: null, newlyAddedCount: 0 }; // Default on error
    }
}

async function writeSummary(summary: DbSummaryData): Promise<void> {
    try {
        await fs.promises.writeFile(summaryFilePath, JSON.stringify(summary, null, 2));
    } catch (error) {
        console.error("Error writing summary file:", error);
    }
}

export async function getDatabaseSummaryFromDb(): Promise<DatabaseSummary> {
    return new Promise((resolve, reject) => {
        const countQuery = `SELECT COUNT(*) as total FROM products`;
        db.get(countQuery, async (err, row: { total: number }) => {
            if (err) {
                return reject(err);
            }
            const summaryData = await readSummary();
            resolve({
                totalProducts: row.total,
                productCount: row.total, // 'productCount'를 'totalProducts'와 동일한 값으로 추가
                lastUpdated: summaryData.lastUpdated ? new Date(summaryData.lastUpdated) : null,
                newlyAddedCount: summaryData.newlyAddedCount
            });
        });
    });
}

export async function markLastUpdatedInDb(count: number): Promise<void> {
    const summaryData: DbSummaryData = {
        lastUpdated: new Date().toISOString(),
        newlyAddedCount: count
    };
    await writeSummary(summaryData);
}

/**
 * 페이지 범위에 해당하는 제품 레코드 삭제
 * @param startPageId 시작 페이지 ID (포함)
 * @param endPageId 종료 페이지 ID (포함)
 * @returns 삭제된 레코드 수
 */
export async function deleteProductsByPageRange(startPageId: number, endPageId: number): Promise<number> {
    return new Promise((resolve, reject) => {
        console.log(` ${startPageId}, 종료 페이지: ${endPageId}`);

        // 삭제 전 레코드 개수 확인 (디버깅용)
        db.get(`SELECT COUNT(*) as count FROM products WHERE pageId >= ? AND pageId <= ?`, 
               [endPageId, startPageId], 
               (err, row: { count: number }) => {
            if (err) {
                console.error('[DB] 삭제 전 레코드 개수 확인 실패:', err);
            } else {
                console.log(`[DB] 삭제 대상 레코드 개수: ${row.count}`);
                
                // 마지막 한 페이지 남은 경우 특별 로깅
                if (startPageId === endPageId) {
                    console.log(`[DB] 마지막 한 페이지(${startPageId}) 삭제 시도 - 예상 레코드 수: ${row.count}`);
                    
                    // 삭제할 페이지 ID에 실제 데이터가 있는지 확인
                    db.all(`SELECT * FROM products WHERE pageId = ?`, [startPageId], (err, rows) => {
                        if (err) {
                            console.error(`[DB] 페이지 ID ${startPageId}의 제품 조회 실패:`, err);
                        } else {
                            console.log(`[DB] 페이지 ID ${startPageId}의 제품 개수: ${rows.length}`);
                            if (rows.length === 0) {
                                console.warn(`[DB] 경고: 페이지 ID ${startPageId}에 제품이 없습니다.`);
                            } else {
                                console.log(`[DB] 페이지 ID ${startPageId}의 첫 번째 제품:`, JSON.stringify(rows[0]));
                            }
                        }
                    });
                }
            }
        });

        // 트랜잭션 시작
        db.serialize(() => {
            db.run('BEGIN TRANSACTION', (err) => {
                if (err) {
                    console.error('[DB] 트랜잭션 시작 오류:', err);
                    return reject(err);
                }

                console.log(`[DB] 삭제 쿼리 실행: DELETE FROM products WHERE pageId >= ${endPageId} AND pageId <= ${startPageId}`);
                
                // products 테이블에서 삭제
                db.run(
                    `DELETE FROM products WHERE pageId >= ? AND pageId <= ?`, 
                    [endPageId, startPageId], 
                    function(err) {
                        if (err) {
                            console.error('[DB] products 테이블 삭제 실패:', err);
                            db.run('ROLLBACK', () => reject(err));
                            return;
                        }
                        
                        const productsDeleted = this.changes;
                        console.log(`[DB] products 테이블에서 ${productsDeleted}개 레코드 삭제됨`);
                        
                        // product_details 테이블에서도 삭제
                        db.run(
                            `DELETE FROM product_details WHERE pageId >= ? AND pageId <= ?`, 
                            [endPageId, startPageId], 
                            function(err) {
                                if (err) {
                                    console.error('[DB] product_details 테이블 삭제 실패:', err);
                                    db.run('ROLLBACK', () => reject(err));
                                    return;
                                }

                                const detailsDeleted = this.changes;
                                console.log(`[DB] product_details 테이블에서 ${detailsDeleted}개 레코드 삭제됨`);
                                
                                // 트랜잭션 커밋
                                db.run('COMMIT', (err) => {
                                    if (err) {
                                        console.error('[DB] 트랜잭션 커밋 실패:', err);
                                        db.run('ROLLBACK', () => reject(err));
                                        return;
                                    }
                                    
                                    console.log(`[DB] 삭제 트랜잭션 성공적으로 커밋됨, 총 ${productsDeleted}개 레코드 삭제`);
                                    
                                    // 삭제 후 레코드 개수 확인 (디버깅용)
                                    db.get(`SELECT COUNT(*) as count FROM products`, [], (err, row: { count: number }) => {
                                        if (err) {
                                            console.error('[DB] 삭제 후 전체 레코드 개수 확인 실패:', err);
                                        } else {
                                            console.log(`[DB] 삭제 후 남은 전체 레코드 개수: ${row.count}`);
                                        }
                                    });
                                    
                                    // 삭제된 총 레코드 수 반환
                                    resolve(productsDeleted);
                                });
                            }
                        );
                    }
                );
            });
        });
    });
}

/**
 * 데이터베이스에서 가장 큰 pageId 값을 조회
 * @returns 가장 큰 pageId 값
 */
export async function getMaxPageIdFromDb(): Promise<number> {
    return new Promise((resolve, reject) => {
        db.get(`SELECT MAX(pageId) as maxPageId FROM products`, (err, row: { maxPageId: number | null }) => {
            if (err) {
                return reject(err);
            }
            // maxPageId가 null인 경우(테이블이 비어있는 경우) 0 반환
            const maxPageId = row.maxPageId !== null ? row.maxPageId : 0;
            console.log(`현재 최대 pageId: ${maxPageId}`);
            resolve(maxPageId);
        });
    });
}

/**
 * 수집한 제품 정보를 데이터베이스에 저장 (제품이 이미 존재하는 경우 업데이트)
 * @param products 저장할 제품 정보 배열
 * @returns {Promise<{added: number, updated: number, unchanged: number, failed: number, duplicateInfo: Array<{url: string, changes: string[]}>}>}
 */
export async function saveProductsToDb(products: MatterProduct[]): Promise<{
  added: number;
  updated: number;
  unchanged: number;
  failed: number;
  duplicateInfo: Array<{url: string, changes: string[]}>; // 중복 제품 중 정보가 다른 경우의 세부 정보
}> {
  debugLog(`[DB] saveProductsToDb called with ${products.length} products`);
  
  if (!products || products.length === 0) {
    return { added: 0, updated: 0, unchanged: 0, failed: 0, duplicateInfo: [] };
  }

  return new Promise((resolve, reject) => {
    let added = 0;
    let updated = 0;
    let unchanged = 0;
    let failed = 0;
    const duplicateInfo: Array<{url: string, changes: string[]}> = [];
    
    // 비동기 처리를 위한 카운터
    let processedCount = 0;

    // 작업 완료 체크 함수
    const checkCompletion = () => {
      processedCount++;
      if (processedCount >= products.length) {
        finalize();
      }
    };

    // 모든 작업 완료 후 트랜잭션 종료 및 결과 반환
    const finalize = () => {
      db.run('COMMIT', (err) => {
        if (err) {
          console.error('[DB] 트랜잭션 커밋 실패:', err);
          db.run('ROLLBACK', () => {
            reject(err);
          });
          return;
        }
        
        console.log(`[DB] 제품 저장 완료: ${added}개 추가, ${updated}개 업데이트, ${unchanged}개 변동 없음, ${failed}개 실패`);
        
        // 신규 추가된 제품이 있으면 요약 정보 업데이트
        if (added > 0) {
          markLastUpdatedInDb(added).catch(err => {
            console.error('[DB] 마지막 업데이트 정보 저장 중 오류:', err);
          });
        }
        
        resolve({
          added,
          updated,
          unchanged,
          failed,
          duplicateInfo
        });
      });
    };
    
    // 트랜잭션 시작
    db.run('BEGIN TRANSACTION', (err) => {
      if (err) {
        console.error('[DB] 트랜잭션 시작 실패:', err);
        return reject(err);
      }
      
      // 1. 먼저 기본 products 테이블에 정보 저장 (테이블 동기화)
      const basicProducts: Product[] = products.map(p => ({
        url: p.url,
        manufacturer: p.manufacturer,
        model: p.model, 
        certificateId: p.certificateId,
        pageId: p.pageId,
        indexInPage: p.indexInPage
      }));
      
      const basicStmt = db.prepare(`
        INSERT INTO products (url, manufacturer, model, certificateId, pageId, indexInPage)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(url) DO UPDATE SET
          manufacturer=excluded.manufacturer,
          model=excluded.model,
          certificateId=excluded.certificateId,
          pageId=excluded.pageId,
          indexInPage=excluded.indexInPage
      `);
      
      // 기본 products 테이블 업데이트
      basicProducts.forEach(product => {
        basicStmt.run([
          product.url,
          product.manufacturer,
          product.model,
          product.certificateId,
          product.pageId,
          product.indexInPage
        ], function(err) {
          if (err) {
            console.error(`[DB] products 테이블 업데이트 실패 (URL: ${product.url}):`, err);
          }
        });
      });
      
      basicStmt.finalize();
      
      // 2. 제품 상세 정보 처리
      if (products.length > 0) {
        // 각 제품별로 처리
        products.forEach(product => {
          // 기존 제품 정보 확인
          db.get('SELECT * FROM product_details WHERE url = ?', [product.url], (err, existingProduct: any) => {
            if (err) {
              console.error(`[DB] 제품 조회 중 오류 (URL: ${product.url}):`, err);
              failed++;
              checkCompletion();
              return;
            }
            
            try {
              // applicationCategories 문자열로 변환
              const applicationCategoriesStr = JSON.stringify(product.applicationCategories || []);
              
              // 날짜 형식 처리
              const certificationDate = product.certificationDate instanceof Date 
                ? product.certificationDate.toISOString() 
                : product.certificationDate;
              
              // 중요: 실제로 레코드가 있는지 확인 (URL 필드 확인)
              const recordExists = existingProduct && existingProduct.url === product.url;
              
              if (recordExists) {
                // 디버그: 기존 레코드 발견
                console.log(`[DB] 기존 제품 발견: ${product.url}`);
                
                // 변경사항 확인
                const changes: string[] = [];
                const fieldsToCompare = [
                  'manufacturer', 'model', 'deviceType', 'certificationId',
                  'softwareVersion', 'hardwareVersion', 'vid', 'pid', 
                  'familySku', 'familyVariantSku', 'firmwareVersion', 'familyId',
                  'tisTrpTested', 'specificationVersion', 'transportInterface',
                  'primaryDeviceTypeId'
                ];
                
                for (const field of fieldsToCompare) {
                  const key = field as keyof MatterProduct;
                  if (product[key] !== existingProduct[field]) {
                    changes.push(`${field}: ${existingProduct[field]} → ${product[key]}`);
                  }
                }
                
                // 특수 필드 비교
                // applicationCategories 비교 (JSON 문자열)
                const existingCategoriesStr = existingProduct.applicationCategories || '[]';
                if (applicationCategoriesStr !== existingCategoriesStr) {
                  changes.push(`applicationCategories: ${existingCategoriesStr} → ${applicationCategoriesStr}`);
                }
                
                // 날짜 비교
                if (certificationDate !== existingProduct.certificationDate) {
                  changes.push(`certificationDate: ${existingProduct.certificationDate} → ${certificationDate}`);
                }
                
                if (changes.length > 0) {
                  // 변경된 내용이 있으면 업데이트
                  console.log(`[DB] 제품 업데이트: ${product.url} (${changes.length}개 필드 변경)`);
                  duplicateInfo.push({ url: product.url, changes });
                  updated++;
                } else {
                  // 변경 없음
                  console.log(`[DB] 제품 변경 없음: ${product.url}`);
                  unchanged++;
                }
              } else {
                // 새 제품 추가
                console.log(`[DB] 새 제품 추가: ${product.url}`);
                added++;
              }
              
              // 제품 상세 정보 저장/업데이트
              const stmt = db.prepare(`
                INSERT INTO product_details (
                  url, pageId, indexInPage, id, manufacturer, model, deviceType, certificationId,
                  certificationDate, softwareVersion, hardwareVersion, vid, pid, familySku,
                  familyVariantSku, firmwareVersion, familyId, tisTrpTested, specificationVersion,
                  transportInterface, primaryDeviceTypeId, applicationCategories
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(url) DO UPDATE SET
                  pageId=excluded.pageId,
                  indexInPage=excluded.indexInPage,
                  id=excluded.id,
                  manufacturer=excluded.manufacturer,
                  model=excluded.model,
                  deviceType=excluded.deviceType,
                  certificationId=excluded.certificationId,
                  certificationDate=excluded.certificationDate,
                  softwareVersion=excluded.softwareVersion,
                  hardwareVersion=excluded.hardwareVersion,
                  vid=excluded.vid,
                  pid=excluded.pid,
                  familySku=excluded.familySku,
                  familyVariantSku=excluded.familyVariantSku,
                  firmwareVersion=excluded.firmwareVersion,
                  familyId=excluded.familyId,
                  tisTrpTested=excluded.tisTrpTested,
                  specificationVersion=excluded.specificationVersion,
                  transportInterface=excluded.transportInterface,
                  primaryDeviceTypeId=excluded.primaryDeviceTypeId,
                  applicationCategories=excluded.applicationCategories
              `);
              
              stmt.run([
                product.url,
                product.pageId,
                product.indexInPage,
                product.id,
                product.manufacturer,
                product.model,
                product.deviceType,
                product.certificateId,
                certificationDate,
                product.softwareVersion,
                product.hardwareVersion,
                product.vid,
                product.pid,
                product.familySku,
                product.familyVariantSku,
                product.firmwareVersion,
                product.familyId,
                product.tisTrpTested,
                product.specificationVersion,
                product.transportInterface,
                product.primaryDeviceTypeId,
                applicationCategoriesStr
              ], function(err) {
                if (err) {
                  console.error(`[DB] 제품 상세 정보 저장 실패 (URL: ${product.url}):`, err);
                  failed++;
                }
                stmt.finalize();
                checkCompletion();
              });
            } catch (error) {
              console.error(`[DB] 제품 처리 중 오류 (URL: ${product.url}):`, error);
              failed++;
              checkCompletion();
            }
          });
        });
      } else {
        // 제품이 없는 경우 바로 종료
        finalize();
      }
    });
  });
}

/**
 * 기본 제품 정보를 DB에 저장 (products 테이블)
 * @param products 기본 제품 정보 배열
 */
export async function saveBasicProductsToDb(products: Product[]): Promise<number> {
  return new Promise((resolve, reject) => {
    if (!products || products.length === 0) {
      return resolve(0);
    }

    db.serialize(() => {
      db.run('BEGIN TRANSACTION');

      const stmt = db.prepare(`
        INSERT INTO products (url, manufacturer, model, certificateId, pageId, indexInPage)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(url) DO UPDATE SET
          manufacturer=excluded.manufacturer,
          model=excluded.model,
          certificateId=excluded.certificateId,
          pageId=excluded.pageId,
          indexInPage=excluded.indexInPage
      `);

      for (const product of products) {
        // Ensure the Product type has a 'url' property, or map/cast as needed
        stmt.run([
          (product as any).url,
          product.manufacturer,
          product.model,
          product.certificateId,
          product.pageId,
          product.indexInPage
        ], function(err) {
          if (err) {
            console.error(`[DB] 기본 제품 정보 저장 실패 (URL: ${(product as any).url}):`, err);
          }
        });
      }

      stmt.finalize();

      db.run('COMMIT', function(err) {
        if (err) {
          console.error('[DB] 트랜잭션 커밋 실패:', err);
          db.run('ROLLBACK');
          reject(err);
          return;
        }
        
        console.log(`[DB] ${this.changes}개의 기본 제품 정보가 저장되었습니다.`);
        resolve(products.length);
      });
    });
  });
}

// Close the database connection when the app quits
app.on('quit', () => {
    db.close((err) => {
        if (err) {
            console.error('Error closing database:', err.message);
        } else {
            console.log('Database connection closed.');
        }
    });
});
