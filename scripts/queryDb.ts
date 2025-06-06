/**
 * 데이터베이스 쿼리 CLI 스크립트
 * 
 * 이 스크립트는 pageId 범위를 기준으로 데이터베이스를 조회합니다.
 * 
 * 사용법: 
 *   npm run query-db -- --startPage=5 --endPage=10
 *   npm run query-db -- --startPage=5 --endPage=5 --count
 *   npm run query-db -- --startPage=5 --endPage=5 --details
 *   npm run query-db -- --summary
 *   npm run query-db -- --maxPageId
 *   npm run query-db -- --top=10
 *   npm run query-db -- --bottom=10
 *   npm run query-db -- --top=5 --bottom=5
 *   npm run query-db -- --debug
 *   npm run query-db -- --delete-null-pageids
 */

import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ES 모듈에서 __dirname 대체
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// MatterProduct 인터페이스 직접 정의
interface Product {
    url: string;
    manufacturer?: string;
    model?: string;
    certificateId?: string;
    pageId?: number;
    indexInPage?: number;
}

interface ProductDetail extends Product {
    id?: string;
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
    applicationCategories?: any;
}

// 사용자 데이터 디렉터리 경로 - 앱과 동일한 위치 사용
const userDataPath = path.join(process.env.HOME || process.env.USERPROFILE || '.', 'Library', 'Application Support', 'crawlMatterCertis');
const dbPath = path.join(userDataPath, 'dev-database.sqlite');

console.log(`데이터베이스 경로: ${dbPath}`);

// 데이터베이스 파일 존재 여부 확인
if (!fs.existsSync(dbPath)) {
    console.error(`오류: 데이터베이스 파일이 존재하지 않습니다: ${dbPath}`);
    console.error(`먼저 npm run populate-dev-db 명령어로 데이터베이스를 생성하세요.`);
    process.exit(1);
}

// 데이터베이스 연결
const db = new sqlite3.Database(dbPath);

// 명령줄 인수 파싱
const args = process.argv.slice(2);
const options: { 
    startPage?: number; 
    endPage?: number; 
    count?: boolean; 
    details?: boolean; 
    summary?: boolean;
    maxPageId?: boolean;
    top?: number;
    bottom?: number;
    debug?: boolean;
    deleteNullPageIds?: boolean;
    gapAnalysis?: boolean;
    gapRange?: boolean;
} = {};

// 간단한 인수 파싱 로직
for (const arg of args) {
    if (arg.startsWith('--startPage=')) {
        options.startPage = parseInt(arg.split('=')[1], 10) - 1; // UI는 1부터 시작, DB는 0부터 시작
    } else if (arg.startsWith('--endPage=')) {
        options.endPage = parseInt(arg.split('=')[1], 10) - 1; // UI는 1부터 시작, DB는 0부터 시작
    } else if (arg === '--count') {
        options.count = true;
    } else if (arg === '--details') {
        options.details = true;
    } else if (arg === '--summary') {
        options.summary = true;
    } else if (arg === '--maxPageId') {
        options.maxPageId = true;
    } else if (arg.startsWith('--top=')) {
        options.top = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--bottom=')) {
        options.bottom = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--debug') {
        options.debug = true;
    } else if (arg === '--delete-null-pageids') {
        options.deleteNullPageIds = true;
    } else if (arg === '--gap-analysis') {
        options.gapAnalysis = true;
    } else if (arg === '--gap-range') {
        options.gapRange = true;
    } else if (arg === '--help') {
        showHelp();
        process.exit(0);
    }
}

// 도움말 표시 함수
function showHelp(): void {
    console.log(`
데이터베이스 쿼리 CLI 사용법:
  npm run query-db -- --startPage=<숫자> --endPage=<숫자>  : 지정된 페이지 범위의 제품 목록을 조회합니다.
  npm run query-db -- --startPage=<숫자> --endPage=<숫자> --count  : 지정된 페이지 범위의 제품 수만 조회합니다.
  npm run query-db -- --startPage=<숫자> --endPage=<숫자> --details  : 지정된 페이지 범위의 제품 상세 정보를 조회합니다.
  npm run query-db -- --summary  : 데이터베이스 요약 정보를 표시합니다.
  npm run query-db -- --maxPageId  : 최대 페이지 ID를 조회합니다.
  npm run query-db -- --top=<숫자>  : 데이터베이스의 상위 N개 레코드를 조회합니다.
  npm run query-db -- --bottom=<숫자>  : 데이터베이스의 하위 N개 레코드를 조회합니다.
  npm run query-db -- --top=<숫자> --bottom=<숫자>  : 상위 및 하위 레코드를 모두 조회합니다.
  npm run query-db -- --debug  : 데이터베이스 구조 및 샘플 데이터를 상세히 분석합니다.
  npm run query-db -- --delete-null-pageids  : pageId가 null인 레코드를 모두 삭제합니다.
  npm run query-db -- --gap-analysis  : 전체 데이터베이스의 제품 갭을 분석합니다.
  npm run query-db -- --gap-range --startPage=<숫자> --endPage=<숫자>  : 지정된 페이지 범위의 제품 갭을 분석합니다.
  npm run query-db -- --help  : 이 도움말을 표시합니다.

참고: 페이지 번호는 1부터 시작하는 UI 표시와 같습니다. (내부 pageId는 0부터 시작)
`);
}

// 디버깅 데이터 확인
async function debugDatabase(): Promise<void> {
    try {
        console.log('\n===== 데이터베이스 디버깅 정보 =====');
        
        // 1. 테이블 스키마 확인
        console.log('\n--- 테이블 스키마 ---');
        await new Promise<void>((resolve) => {
            db.all("SELECT sql FROM sqlite_master WHERE type='table'", (err, rows) => {
                if (err) console.error('테이블 스키마 조회 실패:', err);
                else {
                    rows.forEach((row: any) => {
                        console.log(row.sql);
                    });
                }
                resolve();
            });
        });
        
        // 2. pageId 분포 확인
        console.log('\n--- pageId 분포 ---');
        await new Promise<void>((resolve) => {
            db.all("SELECT DISTINCT pageId FROM products ORDER BY pageId", (err, rows) => {
                if (err) console.error('pageId 분포 조회 실패:', err);
                else {
                    const pageIds = rows.map((row: any) => row.pageId);
                    console.log('존재하는 pageId 목록:', pageIds);
                    console.log(`총 ${pageIds.length}개의 서로 다른 pageId 값이 있습니다.`);
                }
                resolve();
            });
        });
        
        // 3. 샘플 데이터 확인
        console.log('\n--- 샘플 데이터 ---');
        await new Promise<void>((resolve) => {
            db.all("SELECT * FROM products LIMIT 3", (err, rows) => {
                if (err) console.error('샘플 데이터 조회 실패:', err);
                else {
                    console.log('첫 3개 레코드:', JSON.stringify(rows, null, 2));
                }
                resolve();
            });
        });
        
        // 4. 테이블 통계 정보
        console.log('\n--- 테이블 통계 ---');
        await new Promise<void>((resolve) => {
            db.get("SELECT COUNT(*) as count FROM products", (err, row) => {
                if (err) console.error('제품 수 조회 실패:', err);
                else console.log(`products 테이블 레코드 수: ${(row as { count: number }).count}`);
                resolve();
            });
        });
        
        await new Promise<void>((resolve) => {
            db.get("SELECT COUNT(*) as count FROM product_details", (err, row) => {
                if (err) console.error('제품 상세 정보 수 조회 실패:', err);
                else console.log(`product_details 테이블 레코드 수: ${(row as { count: number }).count}`);
                resolve();
            });
        });
        
        // 5. 테스트 쿼리 실행
        console.log('\n--- 테스트 쿼리 ---');
        const testQueries = [
            "SELECT * FROM products WHERE pageId = 0 LIMIT 5",
            "SELECT * FROM products WHERE pageId = 1 LIMIT 5",
            "SELECT * FROM products WHERE pageId BETWEEN 0 AND 2 LIMIT 5"
        ];
        
        for (const query of testQueries) {
            await new Promise<void>((resolve) => {
                console.log(`\n실행 쿼리: ${query}`);
                db.all(query, (err, rows) => {
                    if (err) console.error('쿼리 실행 실패:', err);
                    else {
                        console.log(`결과 수: ${rows.length}`);
                        if (rows.length > 0) {
                            console.log('첫 번째 결과:', JSON.stringify(rows[0], null, 2));
                        } else {
                            console.log('결과 없음');
                        }
                    }
                    resolve();
                });
            });
        }
        
        console.log('\n===== 디버깅 정보 끝 =====\n');
    } catch (error) {
        console.error('데이터베이스 디버깅 중 오류 발생:', error);
    }
}

// 데이터베이스 요약 정보 조회
async function getDatabaseSummary(): Promise<void> {
    try {
        // 제품 수 조회
        const productsCount = await new Promise<number>((resolve, reject) => {
            db.get("SELECT COUNT(*) as total FROM products", (err, row: { total: number }) => {
                if (err) reject(err);
                else resolve(row.total);
            });
        });

        // 제품 상세 정보 수 조회
        const detailsCount = await new Promise<number>((resolve, reject) => {
            db.get("SELECT COUNT(*) as total FROM product_details", (err, row: { total: number }) => {
                if (err) reject(err);
                else resolve(row.total);
            });
        });

        // 최소 pageId 조회
        const minPageId = await new Promise<number>((resolve, reject) => {
            db.get("SELECT MIN(pageId) as minPageId FROM products", (err, row: { minPageId: number | null }) => {
                if (err) reject(err);
                else resolve(row.minPageId !== null ? row.minPageId : 0);
            });
        });

        // 최대 pageId 조회
        const maxPageId = await new Promise<number>((resolve, reject) => {
            db.get("SELECT MAX(pageId) as maxPageId FROM products", (err, row: { maxPageId: number | null }) => {
                if (err) reject(err);
                else resolve(row.maxPageId !== null ? row.maxPageId : 0);
            });
        });

        // 서로 다른 pageId 값 개수 조회
        const distinctPageIds = await new Promise<number>((resolve, reject) => {
            db.get("SELECT COUNT(DISTINCT pageId) as count FROM products", (err, row: { count: number }) => {
                if (err) reject(err);
                else resolve(row.count);
            });
        });

        // 요약 정보 파일에서 최종 업데이트 시간 조회
        const summaryFilePath = path.join(userDataPath, 'db_summary.json');
        let lastUpdated = '알 수 없음';
        if (fs.existsSync(summaryFilePath)) {
            try {
                const data = JSON.parse(fs.readFileSync(summaryFilePath, 'utf-8'));
                if (data.lastUpdated) {
                    lastUpdated = new Date(data.lastUpdated).toLocaleString();
                }
            } catch (err) {
                console.error('요약 정보 파일 읽기 실패:', err);
            }
        }

        console.log('\n----- 데이터베이스 요약 정보 -----');
        console.log(`총 제품 수: ${productsCount.toLocaleString()}`);
        console.log(`제품 상세 정보 수: ${detailsCount.toLocaleString()}`);
        console.log(`서로 다른 pageId 값 개수: ${distinctPageIds}`);
        console.log(`페이지 ID 범위: ${minPageId + 1} ~ ${maxPageId + 1} (표시 번호)`); // UI 표시용으로 +1
        console.log(`페이지 ID 범위: ${minPageId} ~ ${maxPageId} (내부 값)`);
        console.log(`최종 업데이트: ${lastUpdated}`);
        console.log('----------------------------\n');
    } catch (error) {
        console.error('데이터베이스 요약 정보 조회 중 오류 발생:', error);
    }
}

// 최대 pageId 조회
async function getMaxPageId(): Promise<void> {
    try {
        const maxPageId = await new Promise<number>((resolve, reject) => {
            db.get("SELECT MAX(pageId) as maxPageId FROM products", (err, row: { maxPageId: number | null }) => {
                if (err) reject(err);
                else resolve(row.maxPageId !== null ? row.maxPageId : 0);
            });
        });

        console.log(`최대 pageId: ${maxPageId} (내부 값)`);
        console.log(`최대 페이지 번호: ${maxPageId + 1} (UI 표시)`);
    } catch (error) {
        console.error('최대 pageId 조회 중 오류 발생:', error);
    }
}

// pageId 범위로 제품 수 조회
async function countProductsByPageRange(startPageId: number, endPageId: number): Promise<void> {
    try {
        // 입력값 유효성 검사
        if (startPageId < endPageId) {
            console.error('오류: startPage는 endPage보다 크거나 같아야 합니다.');
            return;
        }

        // 명확한 변수명 사용
        const maxPageId = startPageId;  // 범위의 최대값
        const minPageId = Math.max(0, endPageId);  // 범위의 최소값, 음수 방지

        // 쿼리 로깅 강화
        const query = `SELECT COUNT(*) as count FROM products WHERE pageId BETWEEN ? AND ?`;
        const params = [minPageId, maxPageId];
        console.log(`실행 SQL: ${query}`);
        console.log(`파라미터: ${JSON.stringify(params)}`);

        const count = await new Promise<number>((resolve, reject) => {
            db.get(query, params, (err, row: { count: number }) => {
                if (err) reject(err);
                else resolve(row.count);
            });
        });

        console.log(`페이지 범위 ${minPageId + 1} ~ ${maxPageId + 1} (표시 번호)의 제품 수: ${count.toLocaleString()}`);
    } catch (error) {
        console.error('제품 수 조회 중 오류 발생:', error);
    }
}

// pageId 범위로 제품 조회
async function queryProductsByPageRange(startPageId: number, endPageId: number): Promise<void> {
    try {
        // 입력값 유효성 검사
        if (startPageId < endPageId) {
            console.error('오류: startPage는 endPage보다 크거나 같아야 합니다.');
            return;
        }

        // 명확한 변수명 사용
        const maxPageId = startPageId;  // 범위의 최대값
        const minPageId = Math.max(0, endPageId);  // 범위의 최소값, 음수 방지

        // 쿼리 로깅 강화
        const query = `SELECT * FROM products WHERE pageId BETWEEN ? AND ? ORDER BY pageId DESC, indexInPage DESC`;
        const params = [minPageId, maxPageId];
        console.log(`실행 SQL: ${query}`);
        console.log(`파라미터: ${JSON.stringify(params)}`);

        const products = await new Promise<Product[]>((resolve, reject) => {
            db.all(query, params, (err, rows: Product[]) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        // 결과 로깅
        console.log(`쿼리 결과 개수: ${products.length}`);
        if (products.length > 0 && options.debug) {
            console.log(`첫 번째 레코드 샘플:`, JSON.stringify(products[0], null, 2));
        }

        console.log(`페이지 범위 ${minPageId + 1} ~ ${maxPageId + 1} (표시 번호)의 제품 목록 (${products.length}개):`);
        
        if (products.length === 0) {
            console.log('조회된 제품이 없습니다.');
            return;
        }

        // 결과를 테이블 형태로 출력
        console.log('-------------------------------------------------------------------------------------------------------');
        console.log('페이지 | 인덱스 | 제조사                    | 모델명                   | 인증 ID');
        console.log('-------------------------------------------------------------------------------------------------------');
        
        products.forEach(product => {
            const pageId = product.pageId !== undefined ? (product.pageId + 1).toString() : 'N/A';
            const indexInPage = product.indexInPage !== undefined ? product.indexInPage.toString() : 'N/A';
            const manufacturer = (product.manufacturer || 'N/A').padEnd(25).substring(0, 25);
            const model = (product.model || 'N/A').padEnd(25).substring(0, 25);
            const certificateId = product.certificateId || 'N/A';
            
            console.log(`${pageId.padStart(5)} | ${indexInPage.padStart(6)} | ${manufacturer} | ${model} | ${certificateId}`);
        });
        
        console.log('-------------------------------------------------------------------------------------------------------');
    } catch (error) {
        console.error('제품 조회 중 오류 발생:', error);
    }
}

// pageId 범위로 제품 상세 정보 조회
async function queryProductDetailsByPageRange(startPageId: number, endPageId: number): Promise<void> {
    try {
        // 입력값 유효성 검사
        if (startPageId < endPageId) {
            console.error('오류: startPage는 endPage보다 크거나 같아야 합니다.');
            return;
        }

        // 명확한 변수명 사용
        const maxPageId = startPageId;  // 범위의 최대값
        const minPageId = Math.max(0, endPageId);  // 범위의 최소값, 음수 방지

        // 쿼리 로깅 강화
        const query = `SELECT * FROM product_details WHERE pageId BETWEEN ? AND ? ORDER BY pageId DESC, indexInPage DESC`;
        const params = [minPageId, maxPageId];
        console.log(`실행 SQL: ${query}`);
        console.log(`파라미터: ${JSON.stringify(params)}`);

        const details = await new Promise<ProductDetail[]>((resolve, reject) => {
            db.all(query, params, (err, rows: ProductDetail[]) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        // 결과 로깅
        console.log(`쿼리 결과 개수: ${details.length}`);
        console.log(`페이지 범위 ${minPageId + 1} ~ ${maxPageId + 1} (표시 번호)의 제품 상세 정보 (${details.length}개):`);
        
        if (details.length === 0) {
            console.log('조회된 제품 상세 정보가 없습니다.');
            return;
        }

        // 각 제품 상세 정보를 JSON 형식으로 표시
        details.forEach((detail, index) => {
            try {
                // applicationCategories를 파싱
                if (typeof detail.applicationCategories === 'string') {
                    detail.applicationCategories = JSON.parse(detail.applicationCategories);
                }
            } catch (e) {
                detail.applicationCategories = [];
            }
            
            console.log(`\n[제품 #${index + 1}]`);
            console.log(JSON.stringify(detail, null, 2));
            console.log('---------------------------------------');
        });
    } catch (error) {
        console.error('제품 상세 정보 조회 중 오류 발생:', error);
    }
}

// 상위 N개 레코드 조회
async function queryTopRecords(count: number): Promise<void> {
    try {
        if (count <= 0) {
            console.error('오류: 조회할 레코드 수는 1 이상이어야 합니다.');
            return;
        }

        // 쿼리 로깅 강화
        const query = `SELECT * FROM products ORDER BY pageId DESC, indexInPage DESC LIMIT ?`;
        const params = [count];
        if (options.debug) {
            console.log(`실행 SQL: ${query}`);
            console.log(`파라미터: ${JSON.stringify(params)}`);
        }

        const products = await new Promise<Product[]>((resolve, reject) => {
            db.all(query, params, (err, rows: Product[]) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        // 결과 로깅
        if (options.debug) {
            console.log(`쿼리 결과 개수: ${products.length}`);
            if (products.length > 0) {
                console.log(`첫 번째 레코드 샘플:`, JSON.stringify(products[0], null, 2));
            }
        }

        console.log(`상위 ${count}개 제품 레코드:`);
        
        if (products.length === 0) {
            console.log('조회된 제품이 없습니다.');
            return;
        }

        // 결과를 테이블 형태로 출력
        console.log('-------------------------------------------------------------------------------------------------------');
        console.log('페이지 | 인덱스 | 제조사                    | 모델명                   | 인증 ID');
        console.log('-------------------------------------------------------------------------------------------------------');
        
        products.forEach(product => {
            const pageId = product.pageId !== undefined ? (product.pageId + 1).toString() : 'N/A';
            const indexInPage = product.indexInPage !== undefined ? product.indexInPage.toString() : 'N/A';
            const manufacturer = (product.manufacturer || 'N/A').padEnd(25).substring(0, 25);
            const model = (product.model || 'N/A').padEnd(25).substring(0, 25);
            const certificateId = product.certificateId || 'N/A';
            
            console.log(`${pageId.padStart(5)} | ${indexInPage.padStart(6)} | ${manufacturer} | ${model} | ${certificateId}`);
        });
        
        console.log('-------------------------------------------------------------------------------------------------------');
    } catch (error) {
        console.error('상위 레코드 조회 중 오류 발생:', error);
    }
}

// 하위 N개 레코드 조회
async function queryBottomRecords(count: number): Promise<void> {
    try {
        if (count <= 0) {
            console.error('오류: 조회할 레코드 수는 1 이상이어야 합니다.');
            return;
        }

        // SQLite에서는 OFFSET을 사용한 페이징이 필요하므로 전체 개수를 먼저 구함
        const totalCount = await new Promise<number>((resolve, reject) => {
            db.get(`SELECT COUNT(*) as total FROM products`, (err, row: { total: number }) => {
                if (err) reject(err);
                else resolve(row.total);
            });
        });

        // 전체 개수에서 요청한 개수를 뺀 위치부터 조회
        const offset = Math.max(0, totalCount - count);
        
        // 쿼리 로깅 강화
        const query = `SELECT * FROM products ORDER BY pageId ASC, indexInPage ASC LIMIT ? OFFSET ?`;
        const params = [count, offset];
        if (options.debug) {
            console.log(`실행 SQL: ${query}`);
            console.log(`파라미터: ${JSON.stringify(params)}`);
        }

        const products = await new Promise<Product[]>((resolve, reject) => {
            db.all(query, params, (err, rows: Product[]) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        console.log(`하위 ${count}개 제품 레코드:`);
        
        if (products.length === 0) {
            console.log('조회된 제품이 없습니다.');
            return;
        }

        // 결과를 테이블 형태로 출력
        console.log('-------------------------------------------------------------------------------------------------------');
        console.log('페이지 | 인덱스 | 제조사                    | 모델명                   | 인증 ID');
        console.log('-------------------------------------------------------------------------------------------------------');
        
        products.forEach(product => {
            const pageId = product.pageId !== undefined ? (product.pageId + 1).toString() : 'N/A';
            const indexInPage = product.indexInPage !== undefined ? product.indexInPage.toString() : 'N/A';
            const manufacturer = (product.manufacturer || 'N/A').padEnd(25).substring(0, 25);
            const model = (product.model || 'N/A').padEnd(25).substring(0, 25);
            const certificateId = product.certificateId || 'N/A';
            
            console.log(`${pageId.padStart(5)} | ${indexInPage.padStart(6)} | ${manufacturer} | ${model} | ${certificateId}`);
        });
        
        console.log('-------------------------------------------------------------------------------------------------------');
    } catch (error) {
        console.error('하위 레코드 조회 중 오류 발생:', error);
    }
}

// pageId가 null인 레코드 삭제
async function deleteNullPageIds(): Promise<void> {
    try {
        console.log('\n===== pageId가 null인 레코드 삭제 =====');
        
        // 1. null pageId 레코드 수 조회 (삭제 전)
        const nullCountBefore = await new Promise<number>((resolve, reject) => {
            db.get(`SELECT COUNT(*) as count FROM products WHERE pageId IS NULL`, (err, row: { count: number }) => {
                if (err) reject(err);
                else resolve(row.count);
            });
        });
        
        console.log(`삭제 전 pageId가 null인 레코드 수: ${nullCountBefore}`);
        
        // 2. null pageId를 가진 레코드를 확인하기 위한 샘플 조회
        if (nullCountBefore > 0) {
            const nullSamples = await new Promise<Product[]>((resolve, reject) => {
                db.all(`SELECT * FROM products WHERE pageId IS NULL LIMIT 5`, (err, rows: Product[]) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });
            
            console.log(`pageId가 null인 레코드 샘플 ${Math.min(5, nullCountBefore)}개:`);
            nullSamples.forEach((sample, index) => {
                console.log(`[${index + 1}] ${JSON.stringify(sample, null, 2)}`);
            });
            
            // 3. 확인 요청
            console.log(`\n총 ${nullCountBefore}개의 pageId가 null인 레코드를 삭제하시겠습니까? (5초 내에 Ctrl+C로 취소할 수 있습니다.)`);
            await new Promise(resolve => setTimeout(resolve, 5000)); // 5초 대기
            
            // 4. 트랜잭션 시작
            await new Promise<void>((resolve, reject) => {
                db.run('BEGIN TRANSACTION', (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
            
            // 5. products 테이블에서 삭제
            const deleteProductsResult = await new Promise<{ changes: number }>((resolve, reject) => {
                db.run(`DELETE FROM products WHERE pageId IS NULL`, function(err) {
                    if (err) reject(err);
                    else resolve({ changes: this.changes });
                });
            });
            
            console.log(`products 테이블에서 ${deleteProductsResult.changes}개의 레코드 삭제됨`);
            
            // 6. product_details 테이블에서 삭제
            const deleteDetailsResult = await new Promise<{ changes: number }>((resolve, reject) => {
                db.run(`DELETE FROM product_details WHERE pageId IS NULL`, function(err) {
                    if (err) reject(err);
                    else resolve({ changes: this.changes });
                });
            });
            
            console.log(`product_details 테이블에서 ${deleteDetailsResult.changes}개의 레코드 삭제됨`);
            
            // 7. 트랜잭션 커밋
            await new Promise<void>((resolve, reject) => {
                db.run('COMMIT', (err) => {
                    if (err) {
                        db.run('ROLLBACK');
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });
            
            // 8. null pageId 레코드 수 조회 (삭제 후)
            const nullCountAfter = await new Promise<number>((resolve, reject) => {
                db.get(`SELECT COUNT(*) as count FROM products WHERE pageId IS NULL`, (err, row: { count: number }) => {
                    if (err) reject(err);
                    else resolve(row.count);
                });
            });
            
            console.log(`\n===== 삭제 결과 =====`);
            console.log(`- products 테이블에서 삭제된 레코드: ${deleteProductsResult.changes}`);
            console.log(`- product_details 테이블에서 삭제된 레코드: ${deleteDetailsResult.changes}`);
            console.log(`- 삭제 후 pageId가 null인 레코드 수: ${nullCountAfter}`);
            console.log(`===== 삭제 완료 =====\n`);
        } else {
            console.log(`pageId가 null인 레코드가 없습니다. 삭제할 것이 없습니다.\n`);
        }
    } catch (error) {
        console.error('pageId가 null인 레코드 삭제 중 오류 발생:', error);
        // 오류 발생 시 트랜잭션 롤백
        await new Promise<void>((resolve) => {
            db.run('ROLLBACK', () => resolve());
        });
    }
}

// 갭 탐지 관련 인터페이스 추가
interface PageGapInfo {
    pageId: number;
    actualCount: number;
    expectedCount: number;
    missingIndices: number[];
}

interface GapAnalysisResult {
    totalPages: number;
    completePages: number;
    partialPages: number;
    emptyPages: number;
    totalMissingProducts: number;
    gapDetails: PageGapInfo[];
}

// 갭 분석 함수
async function analyzeProductGaps(db: sqlite3.Database): Promise<GapAnalysisResult> {
    console.log('\n데이터베이스 갭 분석 중...\n');
    
    return new Promise((resolve, reject) => {
        // 먼저 최대 pageId 가져오기
        db.get(`SELECT MAX(pageId) as maxPageId FROM products`, (err, row: { maxPageId: number | null }) => {
            if (err) {
                return reject(err);
            }
            
            const maxPageId = row.maxPageId || 0;
            const expectedProductsPerPage = 12;
            
            // 각 페이지별 제품 수와 인덱스 정보 가져오기
            db.all(`
                SELECT 
                    pageId, 
                    COUNT(*) as actualCount,
                    GROUP_CONCAT(indexInPage ORDER BY indexInPage) as indices
                FROM products 
                WHERE pageId IS NOT NULL AND indexInPage IS NOT NULL
                GROUP BY pageId 
                ORDER BY pageId
            `, (err, rows: Array<{ pageId: number; actualCount: number; indices: string }>) => {
                if (err) {
                    return reject(err);
                }
                
                const pageData = new Map<number, { actualCount: number; indices: Set<number> }>();
                
                // 수집된 데이터 정리
                rows.forEach(row => {
                    const indices = new Set(
                        row.indices.split(',').map(i => parseInt(i.trim())).filter(i => !isNaN(i))
                    );
                    pageData.set(row.pageId, {
                        actualCount: row.actualCount,
                        indices
                    });
                });
                
                const gapDetails: PageGapInfo[] = [];
                let totalMissingProducts = 0;
                let completePages = 0;
                let partialPages = 0;
                let emptyPages = 0;
                
                // 0부터 maxPageId까지 모든 페이지 분석
                for (let pageId = 0; pageId <= maxPageId; pageId++) {
                    const pageInfo = pageData.get(pageId);
                    const actualCount = pageInfo?.actualCount || 0;
                    const expectedCount = expectedProductsPerPage;
                    
                    if (actualCount === 0) {
                        emptyPages++;
                        totalMissingProducts += expectedCount;
                        
                        gapDetails.push({
                            pageId,
                            actualCount: 0,
                            expectedCount,
                            missingIndices: Array.from({ length: expectedCount }, (_, i) => i)
                        });
                    } else if (actualCount < expectedCount) {
                        partialPages++;
                        const existingIndices = pageInfo?.indices || new Set();
                        const missingIndices = Array.from({ length: expectedCount }, (_, i) => i)
                            .filter(i => !existingIndices.has(i));
                        
                        totalMissingProducts += missingIndices.length;
                        
                        gapDetails.push({
                            pageId,
                            actualCount,
                            expectedCount,
                            missingIndices
                        });
                    } else {
                        completePages++;
                    }
                }
                
                const result: GapAnalysisResult = {
                    totalPages: maxPageId + 1,
                    completePages,
                    partialPages,
                    emptyPages,
                    totalMissingProducts,
                    gapDetails: gapDetails.filter(gap => gap.missingIndices.length > 0)
                };
                
                resolve(result);
            });
        });
    });
}

// 갭 분석 결과 출력
function printGapAnalysis(analysis: GapAnalysisResult): void {
    console.log('==================== 제품 수집 갭 분석 ====================');
    console.log(`총 페이지 수: ${analysis.totalPages}`);
    console.log(`완전한 페이지: ${analysis.completePages}개`);
    console.log(`부분적 누락 페이지: ${analysis.partialPages}개`);
    console.log(`완전히 비어있는 페이지: ${analysis.emptyPages}개`);
    console.log(`총 누락 제품 수: ${analysis.totalMissingProducts}개`);
    
    if (analysis.gapDetails.length > 0) {
        console.log('\n상세 갭 정보:');
        console.log('PageID | 실제수 | 예상수 | 누락 인덱스');
        console.log('-------|--------|--------|--------------------------------------------------');
        
        analysis.gapDetails.forEach(gap => {
            const pageId = gap.pageId.toString().padStart(6);
            const actual = gap.actualCount.toString().padStart(6);
            const expected = gap.expectedCount.toString().padStart(6);
            const missing = gap.missingIndices.length > 10 
                ? `[${gap.missingIndices.slice(0, 10).join(', ')}...]` 
                : `[${gap.missingIndices.join(', ')}]`;
            
            console.log(`${pageId} | ${actual} | ${expected} | ${missing}`);
        });
    }
    
    console.log('========================================================\n');
}

// 특정 pageId 범위의 갭 분석
async function analyzePageRangeGaps(
    db: sqlite3.Database, 
    startPageId: number, 
    endPageId: number
): Promise<void> {
    console.log(`\nPageID ${startPageId}-${endPageId} 범위 갭 분석 중...\n`);
    
    return new Promise((resolve, reject) => {
        db.all(`
            SELECT 
                pageId, 
                COUNT(*) as actualCount,
                GROUP_CONCAT(indexInPage ORDER BY indexInPage) as indices
            FROM products 
            WHERE pageId >= ? AND pageId <= ? AND pageId IS NOT NULL AND indexInPage IS NOT NULL
            GROUP BY pageId 
            ORDER BY pageId
        `, [startPageId, endPageId], (err, rows: Array<{ pageId: number; actualCount: number; indices: string }>) => {
            if (err) {
                return reject(err);
            }
            
            const expectedProductsPerPage = 12;
            const pageData = new Map<number, { actualCount: number; indices: Set<number> }>();
            
            rows.forEach(row => {
                const indices = new Set(
                    row.indices.split(',').map(i => parseInt(i.trim())).filter(i => !isNaN(i))
                );
                pageData.set(row.pageId, {
                    actualCount: row.actualCount,
                    indices
                });
            });
            
            console.log('PageID | 실제수 | 예상수 | 상태 | 누락 인덱스');
            console.log('-------|--------|--------|------|--------------------------------------------------');
            
            for (let pageId = startPageId; pageId <= endPageId; pageId++) {
                const pageInfo = pageData.get(pageId);
                const actualCount = pageInfo?.actualCount || 0;
                const expectedCount = expectedProductsPerPage;
                
                let status = '';
                let missingInfo = '';
                
                if (actualCount === 0) {
                    status = '완전누락';
                    missingInfo = '[0,1,2,3,4,5,6,7,8,9,10,11]';
                } else if (actualCount < expectedCount) {
                    status = '부분누락';
                    const existingIndices = pageInfo?.indices || new Set();
                    const missing = Array.from({ length: expectedCount }, (_, i) => i)
                        .filter(i => !existingIndices.has(i));
                    missingInfo = `[${missing.join(', ')}]`;
                } else {
                    status = '완전';
                    missingInfo = '-';
                }
                
                const pageIdStr = pageId.toString().padStart(6);
                const actualStr = actualCount.toString().padStart(6);
                const expectedStr = expectedCount.toString().padStart(6);
                const statusStr = status.padEnd(6);
                
                console.log(`${pageIdStr} | ${actualStr} | ${expectedStr} | ${statusStr} | ${missingInfo}`);
            }
            
            console.log('');
            resolve();
        });
    });
}

// 메인 함수
async function main() {
    try {
        // 옵션에 따라 적절한 작업 실행
        if (options.debug) {
            await debugDatabase();
        } else if (options.summary) {
            await getDatabaseSummary();
        } else if (options.maxPageId) {
            await getMaxPageId();
        } else if (options.deleteNullPageIds) {
            await deleteNullPageIds();
        } else if (options.gapAnalysis) {
            // 전체 갭 분석
            const analysis = await analyzeProductGaps(db);
            printGapAnalysis(analysis);
        } else if (options.gapRange && options.startPage !== undefined && options.endPage !== undefined) {
            // 특정 범위 갭 분석
            await analyzePageRangeGaps(db, options.endPage, options.startPage);
        } else if (options.startPage !== undefined && options.endPage !== undefined) {
            if (options.count) {
                await countProductsByPageRange(options.startPage, options.endPage);
            } else if (options.details) {
                await queryProductDetailsByPageRange(options.startPage, options.endPage);
            } else {
                await queryProductsByPageRange(options.startPage, options.endPage);
            }
        } else if (options.top !== undefined || options.bottom !== undefined) {
            // top 또는 bottom 옵션이 지정된 경우
            if (options.top !== undefined) {
                await queryTopRecords(options.top);
            }
            if (options.bottom !== undefined) {
                // 상위와 하위 둘 다 조회하는 경우 구분선 추가
                if (options.top !== undefined) {
                    console.log('\n');
                }
                await queryBottomRecords(options.bottom);
            }
        } else {
            console.error('오류: 필수 옵션이 제공되지 않았습니다.');
            showHelp();
        }
    } catch (error) {
        console.error('스크립트 실행 중 오류 발생:', error);
    } finally {
        // 데이터베이스 연결 종료
        db.close((err) => {
            if (err) {
                console.error('데이터베이스 연결 종료 중 오류 발생:', err);
            }
        });
    }
}

// 스크립트 실행
main();