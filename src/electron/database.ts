import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import type { ProductDetail } from '../ui/types.js'; // Import UI-specific ProductDetail type
import type { MatterProduct, Product, DatabaseSummary } from '../../types.js'; // Import global types
import log, { debugLog as electronDebugLog } from './logger.js';
import { hexIdToInteger, hexIdListToJsonArray } from './utils/hexUtils.js';

const dbPath = path.join(app.getPath('userData'), 'dev-database.sqlite');
const db = new sqlite3.Database(dbPath);
const debugLog = electronDebugLog;


// --- Initialization --- 

export async function initializeDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
        // SQLite 데이터베이스 파일 경로 로깅
        log.info(`Initializing database at: ${dbPath}`);

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
                log.info("'products' table checked/created.");
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
                    vid INTEGER,
                    pid INTEGER,
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
                log.info("'product_details' table checked/created.");
            });

            // 'vendors' 테이블 생성
            db.run(`
                CREATE TABLE IF NOT EXISTS vendors (
                    vendorId INTEGER PRIMARY KEY,
                    vendorName TEXT,
                    companyLegalName TEXT
                )
                `, (err) => {
                if (err) return reject(err);
                log.info("'vendors' table checked/created.");
            });

            // Check if tables are empty 
            db.get("SELECT COUNT(*) as count FROM products", async (err, row: { count: number }) => {
                if (err) return reject(err);
                if (row.count === 0) {
                    log.info(" EMPTY 'products' table...");

                }
                db.get("SELECT COUNT(*) as count FROM product_details", async (err, rowDetails: { count: number }) => {
                    if (err) return reject(err);
                    if (rowDetails.count === 0) {
                        log.info("EMPTY 'product_details' table...");
                    }

                    // Check if vendors table is empty
                    db.get("SELECT COUNT(*) as count FROM vendors", async (err, vendorsRow: { count: number }) => {
                        if (err) return reject(err);
                        if (vendorsRow.count === 0) {
                            log.info("EMPTY 'vendors' table...");
                        }
                        resolve(); // Resolve after checks are done
                    });
                });
            });

        });
    });
}



// --- Query Functions --- 

export async function getProductsFromDb(page: number = 1, limit?: number): Promise<{ products: MatterProduct[], total: number }> {
    return new Promise((resolve, reject) => {
        // 전체 레코드 수 조회 - product_details 테이블에서 조회
        const countQuery = `SELECT COUNT(*) as total FROM product_details`;

        db.get(countQuery, (err, row: { total: number }) => {
            if (err) {
                return reject(err);
            }
            const total = row.total;
            log.info(`데이터베이스 전체 레코드 수: ${total}`);
            
            // limit이 없으면 모든 레코드를 반환
            // product_details와 vendors 테이블을 LEFT JOIN하여 vendorName을 가져옵니다
            let query = `
                SELECT pd.*, 
                       COALESCE(v.vendorName, pd.manufacturer) as manufacturer
                FROM product_details pd 
                LEFT JOIN vendors v ON pd.vid = v.vendorId 
                ORDER BY pd.pageId DESC, pd.indexInPage DESC`;
            let params: any[] = [];
            
            if (limit !== undefined) {
                const offset = (page - 1) * limit;
                query += ` LIMIT ? OFFSET ?`;
                params = [limit, offset];
                log.info(`페이지네이션: 페이지 ${page}, 제한 ${limit}, 오프셋 ${offset}`);
            } else {
                log.info(`전체 레코드 로딩: 모든 ${total}개 레코드를 가져옵니다`);
            }

            db.all(query, params, (err, rows: any[]) => {
                if (err) {
                    return reject(err);
                }
                // Parse applicationCategories back into an array
                const products = rows.map(row => ({
                    ...row,
                    applicationCategories: JSON.parse(row.applicationCategories || '[]')
                }));
                log.info(`가져온 레코드 수: ${products.length}`);
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

export async function searchProductsInDb(query: string, page: number = 1, limit?: number): Promise<{ products: MatterProduct[], total: number }> {
    return new Promise((resolve, reject) => {
        const searchQuery = `%${query}%`;
        const countSql = `
            SELECT COUNT(*) as total FROM product_details pd
            LEFT JOIN vendors v ON pd.vid = v.vendorId
            WHERE COALESCE(v.vendorName, pd.manufacturer) LIKE ? 
               OR pd.model LIKE ? 
               OR pd.deviceType LIKE ? 
               OR pd.certificationId LIKE ?
        `;

        db.get(countSql, [searchQuery, searchQuery, searchQuery, searchQuery], (err, row: { total: number }) => {
            if (err) {
                return reject(err);
            }
            const total = row.total;
            
            // limit이 없으면 모든 검색 결과를 반환
            // product_details와 vendors 테이블을 LEFT JOIN하여 vendorName을 가져옵니다
            let sql = `
                SELECT pd.*, 
                       COALESCE(v.vendorName, pd.manufacturer) as manufacturer
                FROM product_details pd 
                LEFT JOIN vendors v ON pd.vid = v.vendorId
                WHERE COALESCE(v.vendorName, pd.manufacturer) LIKE ? 
                   OR pd.model LIKE ? 
                   OR pd.deviceType LIKE ? 
                   OR pd.certificationId LIKE ?
                ORDER BY pd.pageId DESC, pd.indexInPage DESC
            `;
            let params: any[] = [searchQuery, searchQuery, searchQuery, searchQuery];
            
            if (limit !== undefined) {
                const offset = (page - 1) * limit;
                sql += ` LIMIT ? OFFSET ?`;
                params = [...params, limit, offset];
                log.info(`검색 페이지네이션: 페이지 ${page}, 제한 ${limit}, 오프셋 ${offset}`);
            } else {
                log.info(`전체 검색 결과 로딩: 총 ${total}개 검색 결과를 가져옵니다`);
            }

            db.all(sql, params, (err, rows: any[]) => {
                if (err) {
                    return reject(err);
                }
                // Parse applicationCategories back into an array
                const products = rows.map(row => ({
                    ...row,
                    applicationCategories: JSON.parse(row.applicationCategories || '[]')
                }));
                log.info(`검색 결과: ${products.length}개 레코드 (검색어: "${query}")`);
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
        log.error("Error reading summary file:", error);
        return { lastUpdated: null, newlyAddedCount: 0 }; // Default on error
    }
}

async function writeSummary(summary: DbSummaryData): Promise<void> {
    try {
        await fs.promises.writeFile(summaryFilePath, JSON.stringify(summary, null, 2));
    } catch (error) {
        log.error("Error writing summary file:", error);
    }
}

export async function getDatabaseSummaryFromDb(): Promise<DatabaseSummary> {
    return new Promise((resolve, reject) => {
        // product_details 테이블에서 레코드 수를 조회하여 getProductsFromDb()와 일치시킴
        const countQuery = `SELECT COUNT(*) as total FROM product_details`;
        db.get(countQuery, async (err, row: { total: number }) => {
            if (err) {
                return reject(err);
            }
            const summaryData = await readSummary();
            
            // Get the max pageId from the database (product_details 테이블에서)
            try {
                const maxPageId = await new Promise<number>((resolve, reject) => {
                    db.get(`SELECT MAX(pageId) as maxPageId FROM product_details`, (err, row: { maxPageId: number | null }) => {
                        if (err) {
                            return reject(err);
                        }
                        const maxPageId = row.maxPageId !== null ? row.maxPageId : 0;
                        resolve(maxPageId);
                    });
                });
                
                resolve({
                    totalProducts: row.total,
                    productCount: row.total, // 'productCount'를 'totalProducts'와 동일한 값으로 추가
                    lastUpdated: summaryData.lastUpdated ? new Date(summaryData.lastUpdated) : null,
                    newlyAddedCount: summaryData.newlyAddedCount,
                    lastPageId: maxPageId // Add the last page ID to the summary
                });
            } catch (maxPageIdError) {
                log.warn('Failed to get max pageId for database summary:', maxPageIdError);
                resolve({
                    totalProducts: row.total,
                    productCount: row.total,
                    lastUpdated: summaryData.lastUpdated ? new Date(summaryData.lastUpdated) : null,
                    newlyAddedCount: summaryData.newlyAddedCount,
                    lastPageId: 0 // Fallback to 0 if we can't get the max pageId
                });
            }
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
        log.info(`[DB] 페이지 범위 삭제 시작 - 시작 페이지: ${startPageId}, 종료 페이지: ${endPageId}`);

        // 시작 페이지가 종료 페이지보다 크거나 같은지 확인 (SQL 쿼리 조건이 반대이므로 주의)
        if (startPageId < endPageId) {
            const errorMsg = `[DB] 오류: 시작 페이지 ID(${startPageId})가 종료 페이지 ID(${endPageId})보다 작습니다.`;
            log.error(errorMsg);
            return reject(new Error(errorMsg));
        }

        // 삭제 전 레코드 개수 확인 (디버깅용)
        db.get(`SELECT COUNT(*) as count FROM products WHERE pageId >= ? AND pageId <= ?`, 
               [endPageId, startPageId], 
               (err, row: { count: number }) => {
            if (err) {
                log.error('[DB] 삭제 전 레코드 개수 확인 실패:', err);
                return reject(err);
            } else {
                log.info(`[DB] 삭제 대상 레코드 개수: ${row.count}`);
                
                // 레코드가 없는 경우 조기 리턴
                if (row.count === 0) {
                    log.warn(`[DB] 경고: 페이지 범위 ${endPageId}~${startPageId}에 삭제할 레코드가 없습니다.`);
                    return resolve(0); // 삭제할 레코드가 없으므로 0 반환
                }
                
                // 마지막 한 페이지 남은 경우 특별 로깅
                if (startPageId === endPageId) {
                    log.info(`[DB] 마지막 한 페이지(${startPageId}) 삭제 시도 - 예상 레코드 수: ${row.count}`);
                    
                    // 삭제할 페이지 ID에 실제 데이터가 있는지 확인
                    db.all(`SELECT * FROM products WHERE pageId = ?`, [startPageId], (err, rows) => {
                        if (err) {
                            log.error(`[DB] 페이지 ID ${startPageId}의 제품 조회 실패:`, err);
                        } else {
                            log.info(`[DB] 페이지 ID ${startPageId}의 제품 개수: ${rows.length}`);
                            if (rows.length === 0) {
                                log.warn(`[DB] 경고: 페이지 ID ${startPageId}에 제품이 없습니다.`);
                            } else {
                                log.info(`[DB] 페이지 ID ${startPageId}의 첫 번째 제품:`, JSON.stringify(rows[0]));
                            }
                        }
                    });
                }
            }
        });

        // 먼저 실제 존재하는 pageId 값들을 확인
        db.all(`SELECT DISTINCT pageId FROM products ORDER BY pageId`, [], (err, rows: Array<{pageId: number}>) => {
            if (err) {
                log.error('[DB] 페이지 ID 목록 조회 실패:', err);
                return reject(err);
            }

            const pageIds = rows.map(row => row.pageId);
            log.info(`[DB] 데이터베이스에 존재하는 페이지 ID: ${pageIds.join(', ')}`);
            
            // 삭제 대상 페이지 ID가 실제로 존재하는지 확인
            const targetPageIds = pageIds.filter(id => id >= endPageId && id <= startPageId);
            if (targetPageIds.length === 0) {
                log.warn(`[DB] 경고: 지정된 범위 내에 삭제할 페이지 ID가 없습니다. 범위: ${endPageId}-${startPageId}, 존재하는 페이지: ${pageIds.join(', ')}`);
                return resolve(0); // 삭제할 항목이 없음
            }
            
            log.info(`[DB] 실제 삭제 대상 페이지 ID: ${targetPageIds.join(', ')}`);

            // 트랜잭션 시작
            db.serialize(() => {
                db.run('BEGIN TRANSACTION', (err) => {
                    if (err) {
                        log.error('[DB] 트랜잭션 시작 오류:', err);
                        return reject(err);
                    }

                    // 명확한 SQL 쿼리 로깅 (범위 확인용)
                    log.info(`[DB] 삭제 쿼리: pageId >= ${endPageId} AND pageId <= ${startPageId} (페이지 범위: ${endPageId}에서 ${startPageId}까지)`);
                    
                    // 특수 케이스: 단일 페이지 삭제 처리 향상 (값이 같을 때 확인 강화)
                    if (endPageId === startPageId) {
                        log.info(`[DB] 단일 페이지 삭제 시도 - pageId = ${endPageId} 정확히 일치하는 조건으로 삭제`);
                        db.run(
                            `DELETE FROM products WHERE pageId = ?`, 
                            [endPageId], 
                            function(err) {
                                if (err) {
                                    log.error(`[DB] 단일 페이지 ${endPageId} 삭제 실패:`, err);
                                    db.run('ROLLBACK', () => reject(err));
                                    return;
                                }
                                
                                const productsDeleted = this.changes;
                                log.info(`[DB] 단일 페이지 ${endPageId} 삭제 결과: ${productsDeleted}개 레코드 삭제됨`);
                                
                                // product_details 테이블에서도 삭제 (단일 페이지)
                                db.run(
                                    `DELETE FROM product_details WHERE pageId = ?`, 
                                    [endPageId], 
                                    function(err) {
                                        if (err) {
                                            log.error(`[DB] 단일 페이지 product_details 삭제 실패:`, err);
                                            db.run('ROLLBACK', () => reject(err));
                                            return;
                                        }
                                        
                                        const detailsDeleted = this.changes;
                                        log.info(`[DB] product_details 테이블에서 ${detailsDeleted}개 레코드 삭제됨`);
                                        
                                        // 트랜잭션 커밋
                                        db.run('COMMIT', (err) => {
                                            if (err) {
                                                log.error('[DB] 트랜잭션 커밋 실패:', err);
                                                db.run('ROLLBACK', () => reject(err));
                                                return;
                                            }
                                            
                                            log.info(`[DB] 삭제 트랜잭션 성공적으로 커밋됨, 총 ${productsDeleted}개 레코드 삭제`);
                                            
                                            // 삭제 후 레코드 개수 확인 (디버깅용)
                                            db.get(`SELECT COUNT(*) as count FROM products`, [], (err, row: { count: number }) => {
                                                if (err) {
                                                    log.error('[DB] 삭제 후 전체 레코드 개수 확인 실패:', err);
                                                } else {
                                                    log.info(`[DB] 삭제 후 남은 전체 레코드 개수: ${row.count}`);
                                                }
                                            });
                                            
                                            // 삭제된 총 레코드 수 반환
                                            resolve(productsDeleted);
                                        });
                                    }
                                );
                            }
                        );
                    } else {
                        // 일반 케이스: 페이지 범위 삭제
                        db.run(
                            `DELETE FROM products WHERE pageId >= ? AND pageId <= ?`, 
                            [endPageId, startPageId], 
                            function(err) {
                                if (err) {
                                    log.error('[DB] products 테이블 삭제 실패:', err);
                                    db.run('ROLLBACK', () => reject(err));
                                    return;
                                }
                        
                                const productsDeleted = this.changes;
                                log.info(`[DB] products 테이블에서 ${productsDeleted}개 레코드 삭제됨`);
                                
                                // product_details 테이블에서도 삭제
                                const detailsQuery = endPageId === startPageId 
                                    ? `DELETE FROM product_details WHERE pageId = ?` 
                                    : `DELETE FROM product_details WHERE pageId >= ? AND pageId <= ?`;
                                const params = endPageId === startPageId ? [endPageId] : [endPageId, startPageId];
                                
                                db.run(
                                    detailsQuery,
                                    params, 
                                    function(err) {
                                        if (err) {
                                            log.error('[DB] product_details 테이블 삭제 실패:', err);
                                            db.run('ROLLBACK', () => reject(err));
                                            return;
                                        }

                                        const detailsDeleted = this.changes;
                                        log.info(`[DB] product_details 테이블에서 ${detailsDeleted}개 레코드 삭제됨`);
                                        
                                        // 트랜잭션 커밋
                                        db.run('COMMIT', (err) => {
                                            if (err) {
                                                log.error('[DB] 트랜잭션 커밋 실패:', err);
                                                db.run('ROLLBACK', () => reject(err));
                                                return;
                                            }
                                            
                                            log.info(`[DB] 삭제 트랜잭션 성공적으로 커밋됨, 총 ${productsDeleted}개 레코드 삭제`);
                                            
                                            // 삭제 후 레코드 개수 확인 (디버깅용)
                                            db.get(`SELECT COUNT(*) as count FROM products`, [], (err, row: { count: number }) => {
                                                if (err) {
                                                    log.error('[DB] 삭제 후 전체 레코드 개수 확인 실패:', err);
                                                } else {
                                                    log.info(`[DB] 삭제 후 남은 전체 레코드 개수: ${row.count}`);
                                                }
                                            });
                                            
                                            // 삭제된 총 레코드 수 반환
                                            resolve(productsDeleted);
                                        });
                                    }
                                );
                            }
                        );
                    }
                });
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
            log.info(`현재 최대 pageId: ${maxPageId}`);
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
          log.error('[DB] 트랜잭션 커밋 실패:', err);
          db.run('ROLLBACK', () => {
            reject(err);
          });
          return;
        }
        
        log.info(`[DB] 제품 저장 완료: ${added}개 추가, ${updated}개 업데이트, ${unchanged}개 변동 없음, ${failed}개 실패`);
        
        // 신규 추가된 제품이 있으면 요약 정보 업데이트
        if (added > 0) {
          markLastUpdatedInDb(added).catch(err => {
            log.error('[DB] 마지막 업데이트 정보 저장 중 오류:', err);
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
        log.error('[DB] 트랜잭션 시작 실패:', err);
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
            log.error(`[DB] products 테이블 업데이트 실패 (URL: ${product.url}):`, err);
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
              log.error(`[DB] 제품 조회 중 오류 (URL: ${product.url}):`, err);
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
              
              // vid와 pid를 정수로 변환 - 이미 정수인 경우 그대로 사용
              let vidValue: number | null = null;
              if (product.vid !== undefined && product.vid !== null) {
                // 이미 정수인 경우 그대로 사용, 문자열인 경우에만 변환
                vidValue = typeof product.vid === 'number' ? product.vid : hexIdToInteger(product.vid);
              }
              
              let pidValue: number | null = null;
              if (product.pid !== undefined && product.pid !== null) {
                // 이미 정수인 경우 그대로 사용, 문자열인 경우에만 변환
                pidValue = typeof product.pid === 'number' ? product.pid : hexIdToInteger(product.pid);
              }
              
              // primaryDeviceTypeId를 JSON 배열로 변환
              let deviceTypeIdsValue = '[]';
              if (product.primaryDeviceTypeId) {
                deviceTypeIdsValue = hexIdListToJsonArray(product.primaryDeviceTypeId) || '[]';
              }
              
              // 중요: 실제로 레코드가 있는지 확인 (URL 필드 확인)
              const recordExists = existingProduct && existingProduct.url === product.url;
              
              if (recordExists) {
                // 디버그: 기존 레코드 발견
                log.info(`[DB] 기존 제품 발견: ${product.url}`);
                
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
                  log.info(`[DB] 제품 업데이트: ${product.url} (${changes.length}개 필드 변경)`);
                  duplicateInfo.push({ url: product.url, changes });
                  updated++;
                } else {
                  // 변경 없음
                  log.info(`[DB] 제품 변경 없음: ${product.url}`);
                  unchanged++;
                }
              } else {
                // 새 제품 추가
                log.info(`[DB] 새 제품 추가: ${product.url}`);
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
                vidValue,                     // 변환된 INTEGER 값 사용
                pidValue,                     // 변환된 INTEGER 값 사용
                product.familySku,
                product.familyVariantSku,
                product.firmwareVersion,
                product.familyId,
                product.tisTrpTested,
                product.specificationVersion,
                product.transportInterface,
                deviceTypeIdsValue,           // 변환된 JSON 배열 문자열 사용
                applicationCategoriesStr
              ], function(err) {
                if (err) {
                  log.error(`[DB] 제품 상세 정보 저장 실패 (URL: ${product.url}):`, err);
                  failed++;
                }
                stmt.finalize();
                checkCompletion();
              });
            } catch (error) {
              log.error(`[DB] 제품 처리 중 오류 (URL: ${product.url}):`, error);
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
            log.error(`[DB] 기본 제품 정보 저장 실패 (URL: ${(product as any).url}):`, err);
          }
        });
      }

      stmt.finalize();

      db.run('COMMIT', function(err) {
        if (err) {
          log.error('[DB] 트랜잭션 커밋 실패:', err);
          db.run('ROLLBACK');
          reject(err);
          return;
        }
        
        log.info(`[DB] ${this.changes}개의 기본 제품 정보가 저장되었습니다.`);
        resolve(products.length);
      });
    });
  });
}

// Close the database connection when the app quits
app.on('quit', () => {
    db.close((err) => {
        if (err) {
            log.error('Error closing database:', err.message);
        } else {
            log.info('Database connection closed.');
        }
    });
});

// Types used within database.ts
interface DbSummaryData {
    lastUpdated: string | null;
    newlyAddedCount: number;
}

// Vendor type definition
export interface Vendor {
    vendorId: number;
    vendorName: string;
    companyLegalName: string;
}

/**
 * Fetch and update vendors from the DCL JSON API with pagination support
 * @returns Object with counts of processed vendors
 */
export async function fetchAndUpdateVendors(): Promise<{ 
    added: number; 
    updated: number; 
    total: number; 
    error?: string 
}> {
    return new Promise(async (resolve) => {
        try {
            log.info('[DB] Starting vendors fetch and update from JSON API');
            
            // Use axios for HTTP requests
            // Import axios directly from node_modules
            const { default: axios } = await import('axios');
            
            // Initialize counters and collection
            let added = 0;
            let updated = 0;
            let totalFetched = 0;
            const vendors: Vendor[] = [];
            
            // Pagination variables
            let nextKey: string | null = null;
            let hasMoreData = true;
            let pageCount = 0;
            const MAX_PAGES = 10; // 페이지 제한 증가
            
            let vendorCount = new Set<number>(); // Track unique vendors to detect duplicates
            let seenNextKeys = new Set<string>(); // Track previous next_key values
            
            // Fetch all pages of vendor data
            while (hasMoreData && pageCount < MAX_PAGES) {
                pageCount++;
                
                // Construct the API URL with pagination
                // 수정: API 엔드포인트 구성 변경 (pagination.key 파라미터 사용)
                let apiUrl: string;
                if (nextKey) {
                    apiUrl = `https://on.dcl.csa-iot.org/dcl/vendorinfo/vendors?pagination.key=${encodeURIComponent(nextKey)}`;
                } else {
                    apiUrl = 'https://on.dcl.csa-iot.org/dcl/vendorinfo/vendors';
                }
                
                log.info(`[DB] Fetching vendors from: ${apiUrl} (page ${pageCount}/${MAX_PAGES})`);
                
                let response: any;
                try {
                    // Make the API request with timeout to prevent hanging
                    response = await axios.get(apiUrl, { timeout: 10000 });
                    
                    // Check if we have valid data
                    if (!response.data || !Array.isArray(response.data.vendorInfo)) {
                        log.error('[DB] Unexpected API response format:', response.data);
                        // 응답 구조 로깅
                        log.info('[DB] API response keys:', Object.keys(response.data || {}));
                        log.info('[DB] Pagination info:', JSON.stringify(response.data?.pagination || {}));
                        break; // Exit pagination loop on error
                    }
                } catch (apiError) {
                    log.error(`[DB] API request failed for page ${pageCount}:`, apiError);
                    break; // Exit pagination loop on error
                }
                
                // Process the vendors from this page
                const pageVendors = response.data.vendorInfo.map((vendor: any) => ({
                    vendorId: parseInt(vendor.vendorID, 10),
                    vendorName: vendor.vendorName || '',
                    companyLegalName: vendor.companyLegalName || ''
                }));
                
                // Check for duplicate vendors (could indicate pagination issue)
                const previousVendorCount = vendorCount.size;
                
                // Add vendor IDs to our tracking set
                pageVendors.forEach((v: Vendor) => vendorCount.add(v.vendorId));
                
                // If we didn't add any new unique vendors, we might be in a loop
                if (vendorCount.size === previousVendorCount && pageCount > 1) {
                    log.info(`[DB] No new unique vendors detected, possible pagination loop`);
                    hasMoreData = false;
                    break;
                }
                
                // Add to our collection
                vendors.push(...pageVendors);
                totalFetched += pageVendors.length;
                
                log.info(`[DB] Fetched ${pageVendors.length} vendors from current page (total unique: ${vendorCount.size})`);
                
                // Check for next page - safely access pagination property with optional chaining
                const nextKeyFromResponse = response.data.pagination?.key || response.data.pagination?.next_key || null;
                
                // 이미 사용한 next_key 값을 재사용하는지 확인 (무한 루프 방지)
                if (nextKeyFromResponse && seenNextKeys.has(nextKeyFromResponse)) {
                    log.info(`[DB] Already seen next_key detected (${nextKeyFromResponse}), stopping pagination`);
                    hasMoreData = false;
                } else if (nextKeyFromResponse) {
                    // 새로운 다음 키는 저장하고 계속 진행
                    nextKey = nextKeyFromResponse;
                    if (nextKey) {
                        seenNextKeys.add(nextKey);
                    }
                    hasMoreData = true;
                    log.info(`[DB] More data available, next_key: ${nextKey}`);
                } else {
                    // 더 이상 다음 페이지가 없음
                    nextKey = null;
                    hasMoreData = false;
                    log.info(`[DB] No more vendor data available`);
                }
                
                if (hasMoreData) {
                    // 중복 로그 방지
                } else {
                    log.info(`[DB] No more vendor data available or max pages reached (${pageCount}/${MAX_PAGES})`);
                }
            }
            
            if (vendors.length === 0) {
                log.warn('[DB] No vendors found in the API response');
                resolve({
                    added: 0,
                    updated: 0,
                    total: 0,
                    error: 'No vendors found in the API response'
                });
                return;
            }
            
            log.info(`[DB] Found ${vendors.length} vendors in total (${vendorCount.size} unique)`);
            
            // Insert or update the vendors in the database
            // Use a transaction for better performance and reliability
            try {
                await new Promise<void>((resolveTransaction, rejectTransaction) => {
                    db.serialize(() => {
                        db.run('BEGIN TRANSACTION');
                        
                        const stmt = db.prepare(`
                            INSERT INTO vendors (vendorId, vendorName, companyLegalName)
                            VALUES (?, ?, ?)
                            ON CONFLICT(vendorId) DO UPDATE SET
                                vendorName = excluded.vendorName,
                                companyLegalName = excluded.companyLegalName
                        `);
                        
                        let processedCount = 0;
                        
                        // Process each vendor in the array
                        for (const vendor of vendors) {
                            // First, check if the vendor already exists
                            db.get('SELECT vendorId FROM vendors WHERE vendorId = ?', [vendor.vendorId], (err: Error | null, row: any) => {
                                if (err) {
                                    log.error(`[DB] Error checking if vendor exists: ${err.message}`);
                                    processedCount++;
                                    return;
                                }
                                
                                stmt.run(
                                    vendor.vendorId,
                                    vendor.vendorName,
                                    vendor.companyLegalName,
                                    function(this: { changes: number }, err: Error | null) {
                                        if (err) {
                                            log.error(`[DB] Error inserting/updating vendor: ${err.message}`);
                                        } else {
                                            // If changes were made, it could be an insert or update
                                            if (this.changes > 0) {
                                                if (row) {
                                                    updated++;
                                                } else {
                                                    added++;
                                                }
                                            }
                                        }
                                        
                                        processedCount++;
                                        
                                        // Check if all vendors have been processed
                                        if (processedCount === vendors.length) {
                                            stmt.finalize();
                                            
                                            db.run('COMMIT', function(err: Error | null) {
                                                if (err) {
                                                    log.error('[DB] Error committing transaction:', err);
                                                    db.run('ROLLBACK');
                                                    rejectTransaction(err);
                                                    return;
                                                }
                                                
                                                resolveTransaction();
                                            });
                                        }
                                    }
                                );
                            });
                        }
                    });
                });
                
                log.info(`[DB] Vendors update completed: ${added} added, ${updated} updated, total ${vendors.length}`);
                resolve({
                    added,
                    updated,
                    total: vendors.length
                });
            } catch (dbError) {
                log.error('[DB] Database error during vendor update:', dbError);
                resolve({
                    added: 0,
                    updated: 0, 
                    total: vendors.length,
                    error: dbError instanceof Error ? dbError.message : String(dbError)
                });
            }
        } catch (error) {
            log.error('[DB] Error fetching and updating vendors:', error);
            resolve({
                added: 0,
                updated: 0,
                total: 0,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    });
}

/**
 * Get vendors from the database
 * @returns Array of vendors
 */
export async function getVendors(): Promise<Vendor[]> {
    return new Promise((resolve, reject) => {
        db.all('SELECT * FROM vendors ORDER BY vendorId', (err, rows) => {
            if (err) {
                log.error('[DB] Error getting vendors:', err);
                reject(err);
                return;
            }
            
            resolve(rows as Vendor[]);
        });
    });
}

/**
 * Get all existing product URLs from the database for validation purposes
 * Used in 1.5 stage validation to check for duplicates
 */
export async function getExistingProductUrls(): Promise<Set<string>> {
    return new Promise((resolve, reject) => {
        const query = `SELECT url FROM product_details WHERE url IS NOT NULL AND url != ''`;
        
        db.all(query, [], (err, rows: any[]) => {
            if (err) {
                log.error('[DB] Error fetching existing URLs:', err);
                reject(err);
                return;
            }
            
            const urlSet = new Set(rows.map(row => row.url));
            log.info(`[DB] Found ${urlSet.size} existing URLs in database`);
            resolve(urlSet);
        });
    });
}

/**
 * Find products that exist in products table but not in product_details table
 */
export async function findMissingProductDetails(): Promise<Array<{url: string, pageId: number, indexInPage: number}>> {
    return new Promise((resolve, reject) => {
        const query = `
            SELECT p.url, p.pageId, p.indexInPage
            FROM products p
            LEFT JOIN product_details pd ON p.url = pd.url
            WHERE pd.url IS NULL
            ORDER BY p.pageId DESC, p.indexInPage DESC
        `;
        
        db.all(query, [], (err, rows: any[]) => {
            if (err) {
                log.error('[DB] Error finding missing product details:', err);
                reject(err);
                return;
            }
            
            log.info(`[DB] Found ${rows.length} products missing details`);
            resolve(rows.map(row => ({
                url: row.url,
                pageId: row.pageId,
                indexInPage: row.indexInPage
            })));
        });
    });
}

/**
 * Find incomplete pages (pages that don't have all indices 0-11)
 */
export async function findIncompletePages(): Promise<Array<{pageId: number, missingIndices: number[], expectedCount: number, actualCount: number}>> {
    return new Promise((resolve, reject) => {
        // First, find pages with incomplete index coverage
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
                actualCount
            FROM page_stats
            WHERE actualCount < 12 OR minIndex != 0 OR maxIndex != 11
            ORDER BY pageId DESC
        `;
        
        db.all(query, [], (err, rows: any[]) => {
            if (err) {
                log.error('[DB] Error finding incomplete pages:', err);
                reject(err);
                return;
            }
            
            if (rows.length === 0) {
                resolve([]);
                return;
            }
            
            // For each incomplete page, find missing indices
            const incompletePages: Array<{pageId: number, missingIndices: number[], expectedCount: number, actualCount: number}> = [];
            let processedPages = 0;
            
            rows.forEach(row => {
                const pageId = row.pageId;
                const expectedIndices = Array.from({length: 12}, (_, i) => i);
                
                db.all(
                    "SELECT indexInPage FROM products WHERE pageId = ? ORDER BY indexInPage",
                    [pageId],
                    (err, indexRows: any[]) => {
                        if (err) {
                            log.error(`[DB] Error getting indices for page ${pageId}:`, err);
                            processedPages++;
                            if (processedPages === rows.length) {
                                resolve(incompletePages);
                            }
                            return;
                        }
                        
                        const actualIndices = indexRows.map(r => r.indexInPage);
                        const missingIndices = expectedIndices.filter(idx => !actualIndices.includes(idx));
                        
                        incompletePages.push({
                            pageId,
                            missingIndices,
                            expectedCount: 12,
                            actualCount: actualIndices.length
                        });
                        
                        processedPages++;
                        if (processedPages === rows.length) {
                            log.info(`[DB] Found ${incompletePages.length} incomplete pages`);
                            resolve(incompletePages);
                        }
                    }
                );
            });
        });
    });
}

/**
 * Get database comparison summary (products vs product_details count)
 */
export async function getTableComparisonSummary(): Promise<{
    productsCount: number;
    productDetailsCount: number;
    difference: number;
}> {
    return new Promise((resolve, reject) => {
        let results: any = {};
        let completedQueries = 0;
        
        const checkComplete = () => {
            completedQueries++;
            if (completedQueries === 2) {
                const summary = {
                    productsCount: results.productsCount || 0,
                    productDetailsCount: results.productDetailsCount || 0,
                    difference: (results.productsCount || 0) - (results.productDetailsCount || 0)
                };
                log.info(`[DB] Table comparison: products=${summary.productsCount}, product_details=${summary.productDetailsCount}, diff=${summary.difference}`);
                resolve(summary);
            }
        };
        
        // Count products
        db.get("SELECT COUNT(*) as count FROM products", (err, row: any) => {
            if (err) {
                reject(err);
                return;
            }
            results.productsCount = row.count;
            checkComplete();
        });
        
        // Count product_details
        db.get("SELECT COUNT(*) as count FROM product_details", (err, row: any) => {
            if (err) {
                reject(err);
                return;
            }
            results.productDetailsCount = row.count;
            checkComplete();
        });
    });
}

/**
 * Update product_details records with NULL pageId by matching with products table
 * @returns Number of updated records
 */
export async function updateProductDetailsPageIds(): Promise<{updatedCount: number, matchedCount: number, unmatchedUrls: string[]}> {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run('BEGIN TRANSACTION', (err) => {
                if (err) {
                    log.error('[DB] Failed to begin transaction for pageId update:', err);
                    reject(err);
                    return;
                }

                // First, get product_details records with NULL pageId
                const selectQuery = `
                    SELECT pd.url, pd.id as detailId
                    FROM product_details pd
                    WHERE pd.pageId IS NULL
                    ORDER BY pd.url
                `;

                db.all(selectQuery, [], (err, nullPageIdRows: any[]) => {
                    if (err) {
                        log.error('[DB] Error fetching product_details with NULL pageId:', err);
                        db.run('ROLLBACK', () => reject(err));
                        return;
                    }

                    if (nullPageIdRows.length === 0) {
                        log.info('[DB] No product_details records with NULL pageId found');
                        db.run('COMMIT', () => resolve({updatedCount: 0, matchedCount: 0, unmatchedUrls: []}));
                        return;
                    }

                    log.info(`[DB] Found ${nullPageIdRows.length} product_details records with NULL pageId`);

                    // Update each record by matching with products table
                    const updateQuery = `
                        UPDATE product_details 
                        SET pageId = (
                            SELECT p.pageId 
                            FROM products p 
                            WHERE p.url = product_details.url 
                            AND p.pageId IS NOT NULL
                        ),
                        indexInPage = (
                            SELECT p.indexInPage 
                            FROM products p 
                            WHERE p.url = product_details.url 
                            AND p.indexInPage IS NOT NULL
                        )
                        WHERE product_details.pageId IS NULL 
                        AND EXISTS (
                            SELECT 1 FROM products p 
                            WHERE p.url = product_details.url 
                            AND p.pageId IS NOT NULL 
                            AND p.indexInPage IS NOT NULL
                        )
                    `;

                    db.run(updateQuery, [], function(err) {
                        if (err) {
                            log.error('[DB] Error updating product_details pageId:', err);
                            db.run('ROLLBACK', () => reject(err));
                            return;
                        }

                        const updatedCount = this.changes;
                        log.info(`[DB] Updated ${updatedCount} product_details records with pageId`);

                        // Check which URLs couldn't be matched
                        const unmatchedQuery = `
                            SELECT pd.url
                            FROM product_details pd
                            WHERE pd.pageId IS NULL
                            AND NOT EXISTS (
                                SELECT 1 FROM products p 
                                WHERE p.url = pd.url 
                                AND p.pageId IS NOT NULL
                            )
                        `;

                        db.all(unmatchedQuery, [], (err, unmatchedRows: any[]) => {
                            if (err) {
                                log.error('[DB] Error finding unmatched URLs:', err);
                                db.run('ROLLBACK', () => reject(err));
                                return;
                            }

                            const unmatchedUrls = unmatchedRows.map(row => row.url);
                            log.info(`[DB] ${unmatchedUrls.length} URLs could not be matched`);

                            db.run('COMMIT', (err) => {
                                if (err) {
                                    log.error('[DB] Failed to commit pageId update transaction:', err);
                                    reject(err);
                                    return;
                                }

                                resolve({
                                    updatedCount,
                                    matchedCount: updatedCount,
                                    unmatchedUrls
                                });
                            });
                        });
                    });
                });
            });
        });
    });
}
