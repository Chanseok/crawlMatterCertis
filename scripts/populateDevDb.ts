/**
 * 개발용 데이터베이스 초기화 스크립트
 * 
 * 이 스크립트는 개발 모드에서 사용할 SQLite 데이터베이스를 생성하고
 * data-for-dev 폴더의 JSON 파일에서 데이터를 로드합니다.
 * 
 * 실행 방법: npx ts-node scripts/populateDevDb.ts
 */

import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ES 모듈에서 __dirname 대체
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// MatterProduct 인터페이스 직접 정의 (types.ts에서 가져오지 않음)
interface Product {
    url: string;
    manufacturer?: string;
    model?: string;
    certificateId?: string;
    pageId?: number;
    indexInPage?: number;
}

interface Detailed {
    url: string;
    pageId?: number;
    indexInPage?: number;
    id?: string;
    manufacturer?: string;
    model?: string;
    deviceType?: string;
    certificationId?: string;
    certificationDate?: string;
    softwareVersion?: string;
    hardwareVersion?: string;
    vid?: string;
    pid?: string;
    familySku?: string;
    familyVariantSku?: string;
    firmwareVersion?: string;
    familyId?: string;
    tisTrpTested?: string;
    specificationVersion?: string;
    transportInterface?: string;
    primaryDeviceTypeId?: string;
    applicationCategories?: string[];
}

// DatabaseSummary 인터페이스 직접 정의
interface DatabaseSummary {
    totalProducts: number;
    lastUpdated: Date | null;
    newlyAddedCount: number;
}

// 개발 환경에서 사용자 디렉토리 경로 - 실제 앱과 동일한 위치에 DB 생성
// const userDataPath = path.join(process.env.HOME || process.env.USERPROFILE || '.', '.config', 'crawlMatterCertis');
const userDataPath = path.join(process.env.HOME || process.env.USERPROFILE || '.', 'Library', 'Application Support', 'crawlMatterCertis');
if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
}
const dbPath = path.join(userDataPath, 'dev-database.sqlite');

console.log(`데이터베이스 경로: ${dbPath}`);

// 데이터 파일 경로
const rootDir = path.resolve(__dirname, '..');
const productsPath = path.join(rootDir, 'data-for-dev', 'merged_devices.json');
const detailedPath = path.join(rootDir, 'data-for-dev', 'merged_matter_devices.json');

console.log(`데이터 파일 경로: 
  products info - merged_devices.json: ${productsPath}
  detailed info - merged_matter_devices.json: ${detailedPath}
`);

// 데이터베이스 연결
const db = new sqlite3.Database(dbPath);

// 'products' 테이블 생성
function createProductsTable(): Promise<void> {
    return new Promise((resolve, reject) => {
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
            if (err) {
                reject(err);
            } else {
                console.log("'products' 테이블이 생성되었습니다.");
                resolve();
            }
        });
    });
}

// 'product_details' 테이블 생성
function createProductDetailsTable(): Promise<void> {
    return new Promise((resolve, reject) => {
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
            if (err) {
                reject(err);
            } else {
                console.log("'product_details' 테이블이 생성되었습니다.");
                resolve();
            }
        });
    });
}

// 'products' 테이블에 데이터 추가
async function populateProductsTable(): Promise<void> {
    try {
        // 기존 데이터 지우기
        await new Promise<void>((resolve, reject) => {
            db.run("DELETE FROM products", (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        const data = fs.readFileSync(productsPath, 'utf-8');
        const products: Product[] = JSON.parse(data);

        // 데이터가 없으면 종료
        if (!products || !Array.isArray(products) || products.length === 0) {
            console.error("all_matter_devices.json 파일에 유효한 데이터가 없습니다.");
            return;
        }

        console.log(`${products.length}개의 제품 데이터를 가져왔습니다.`);

        const stmt = db.prepare(`
      INSERT INTO products (
        url, manufacturer, model, certificateId, pageId, indexInPage  
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

        // 트랜잭션 시작
        await new Promise<void>((resolve, reject) => {
            db.run("BEGIN TRANSACTION", (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        let insertedCount = 0;
        for (const product of products) {
            try {
                await new Promise<void>((resolve, reject) => {
                    stmt.run(
                        product.url,
                        product.manufacturer || null,
                        product.model || null,
                        product.certificateId || null,
                        product.pageId || null,
                        product.indexInPage || null,
                        function (err) {
                            if (err) reject(err);
                            else {
                                insertedCount++;
                                resolve();
                            }
                        }
                    );
                });
            } catch (error) {
                console.error(`제품 데이터 삽입 중 오류 발생: ${JSON.stringify(product)}`, error);
            }
        }

        // 트랜잭션 종료
        await new Promise<void>((resolve, reject) => {
            db.run("COMMIT", (err) => {
                if (err) {
                    db.run("ROLLBACK");
                    reject(err);
                } else {
                    resolve();
                }
            });
        });

        stmt.finalize();
        console.log(`'products' 테이블에 ${insertedCount}개의 레코드가 추가되었습니다.`);
    } catch (error) {
        console.error("제품 데이터 추가 중 오류 발생:", error);
        // 트랜잭션 롤백
        db.run("ROLLBACK");
    }
}

// 'product_details' 테이블에 데이터 추가
async function populateProductDetailsTable(): Promise<void> {
    try {
        // 기존 데이터 지우기
        await new Promise<void>((resolve, reject) => {
            db.run("DELETE FROM product_details", (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        const data = fs.readFileSync(detailedPath, 'utf-8');
        const details: Detailed[] = JSON.parse(data);

        // 데이터가 없으면 종료
        if (!details || !Array.isArray(details) || details.length === 0) {
            console.error("merged_matter_devices.json 파일에 유효한 데이터가 없습니다.");
            return;
        }

        console.log(`${details.length}개의 제품 상세 정보를 가져왔습니다.`);

        const stmt = db.prepare(`
      INSERT INTO product_details (
        url, pageId, indexInPage, id, manufacturer, model, deviceType, 
        certificationId, certificationDate, softwareVersion, hardwareVersion, 
        vid, pid, familySku, familyVariantSku, firmwareVersion, familyId, 
        tisTrpTested, specificationVersion, transportInterface, 
        primaryDeviceTypeId, applicationCategories
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

        // 트랜잭션 시작
        await new Promise<void>((resolve, reject) => {
            db.run("BEGIN TRANSACTION", (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        let insertedCount = 0;
        for (const detail of details) {
            try {
                await new Promise<void>((resolve, reject) => {
                    stmt.run(
                        detail.url,
                        detail.pageId || null,
                        detail.indexInPage || null,
                        detail.id || null,
                        detail.manufacturer || null,
                        detail.model || null,
                        detail.deviceType || null,
                        detail.certificationId || null,
                        detail.certificationDate || null,
                        detail.softwareVersion || null,
                        detail.hardwareVersion || null,
                        detail.vid || null,
                        detail.pid || null,
                        detail.familySku || null,
                        detail.familyVariantSku || null,
                        detail.firmwareVersion || null,
                        detail.familyId || null,
                        detail.tisTrpTested || null,
                        detail.specificationVersion || null,
                        detail.transportInterface || null,
                        detail.primaryDeviceTypeId || null,
                        JSON.stringify(detail.applicationCategories || []), // 배열을 JSON 문자열로 저장
                        function (err) {
                            if (err) reject(err);
                            else {
                                insertedCount++;
                                resolve();
                            }
                        }
                    );
                });
            } catch (error) {
                console.error(`제품 상세 정보 삽입 중 오류 발생: ${JSON.stringify(detail)}`, error);
            }
        }

        // 트랜잭션 종료
        await new Promise<void>((resolve, reject) => {
            db.run("COMMIT", (err) => {
                if (err) {
                    db.run("ROLLBACK");
                    reject(err);
                } else {
                    resolve();
                }
            });
        });

        stmt.finalize();
        console.log(`'product_details' 테이블에 ${insertedCount}개의 레코드가 추가되었습니다.`);
    } catch (error) {
        console.error("제품 상세 정보 추가 중 오류 발생:", error);
        // 트랜잭션 롤백
        db.run("ROLLBACK");
    }
}

// 데이터베이스 요약 정보 업데이트
async function updateDatabaseSummary(): Promise<void> {
    try {
        // 제품 수 조회
        const totalProducts = await new Promise<number>((resolve, reject) => {
            db.get("SELECT COUNT(*) as total FROM products", (err, row: { total: number }) => {
                if (err) reject(err);
                else resolve(row.total);
            });
        });

        // 요약 정보 저장
        const summaryData = {
            lastUpdated: new Date().toISOString(),
            newlyAddedCount: totalProducts
        };

        const summaryFilePath = path.join(userDataPath, 'db_summary.json');
        fs.writeFileSync(summaryFilePath, JSON.stringify(summaryData, null, 2));
        console.log(`데이터베이스 요약 정보가 업데이트되었습니다. 총 제품 수: ${totalProducts}`);
    } catch (error) {
        console.error("데이터베이스 요약 정보 업데이트 중 오류 발생:", error);
    }
}

// 메인 함수
async function main() {

    try {
        console.log("데이터베이스 초기화 및 데이터 로드를 시작합니다...");

        // 테이블 생성
        await createProductsTable();
        await createProductDetailsTable();

        // 데이터 로드
        await populateProductsTable();
        await populateProductDetailsTable();

        // 요약 정보 업데이트
        await updateDatabaseSummary();

        console.log("데이터베이스 초기화 및 데이터 로드가 완료되었습니다.");
    } catch (error) {
        console.error("스크립트 실행 중 오류 발생:", error);
    } finally {
        // 데이터베이스 연결 종료
        db.close((err) => {
            if (err) {
                console.error("데이터베이스 연결 종료 중 오류 발생:", err);
            } else {
                console.log("데이터베이스 연결이 종료되었습니다.");
            }
        });
    }
}

// 스크립트 실행
main();