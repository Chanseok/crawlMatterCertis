import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import type { MatterProduct, DatabaseSummary, ProductDetail } from '../ui/types.js'; // Fixed import with extension and added explicit type import


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
