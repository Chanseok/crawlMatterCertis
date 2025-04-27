import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import type { MatterProduct, DatabaseSummary } from '../ui/types.js'; // Fixed import with extension and added explicit type import

// Define the structure for detailed product info
interface ProductDetail extends MatterProduct {
    // Explicitly redefine properties to ensure they exist on the type
    id: string;
    url: string;
    pageId: number;
    indexInPage: number;
    manufacturer: string;
    model: string;
    deviceType: string;
    certificationId: string;
    certificationDate: string;
    softwareVersion: string;
    hardwareVersion: string;
    vid: string;
    pid: string;
    familySku: string;
    familyVariantSku: string;
    firmwareVersion: string;
    familyId: string;
    tisTrpTested: string;
    specificationVersion: string;
    transportInterface: string;
    primaryDeviceTypeId: string;
    applicationCategories: string[];
    // Add any additional fields specific to detailed info if they exist
}

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
        const query = `SELECT * FROM products LIMIT ? OFFSET ?`;
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
