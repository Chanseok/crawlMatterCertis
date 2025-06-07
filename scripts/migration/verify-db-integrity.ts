/**
 * verify-db-integrity.ts
 * 
 * 마이그레이션 후 데이터베이스 무결성을 검증하는 스크립트
 */

import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';

// SQLite 설정
const { Database } = sqlite3;

// 테스트 환경에서의 DB 경로 설정
// 사용자 데이터 경로 - 애플리케이션과 동일한 경로 사용
const userDataPath = path.join(process.env.HOME || process.env.USERPROFILE || '.', 'Library', 'Application Support', 'crawlMatterCertis');
const dbPath = path.join(userDataPath, 'dev-database.sqlite');

console.log(`데이터베이스 경로: ${dbPath}`);

// 디렉토리가 존재하는지 확인하고 없으면 생성
if (!fs.existsSync(userDataPath)) {
  console.log(`사용자 데이터 디렉토리를 생성합니다: ${userDataPath}`);
  fs.mkdirSync(userDataPath, { recursive: true });
}

// 데이터베이스 파일이 존재하는지 확인
if (!fs.existsSync(dbPath)) {
  console.error(`오류: 데이터베이스 파일을 찾을 수 없습니다: ${dbPath}`);
  process.exit(1);
}

// 데이터베이스 연결
const db = new Database(dbPath);

async function verifyDatabaseIntegrity() {
  console.log('데이터베이스 무결성 검증 시작...');
  
  try {
    // 1. 테이블 존재 확인
    const tables = await new Promise<string[]>((resolve, reject) => {
      db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, rows: {name: string}[]) => {
        if (err) reject(err);
        else resolve(rows.map(row => row.name));
      });
    });
    
    console.log(`\n1. 발견된 테이블: ${tables.join(', ')}`);
    
    if (!tables.includes('product_details')) {
      console.error('❌ product_details 테이블이 존재하지 않습니다!');
      return;
    }
    
    // 2. product_details 테이블 레코드 수 확인
    const recordCount = await new Promise<number>((resolve, reject) => {
      db.get("SELECT COUNT(*) as count FROM product_details", (err, row: {count: number}) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });
    
    console.log(`\n2. 레코드 수: ${recordCount}`);
    
    if (recordCount === 0) {
      console.warn('⚠️ product_details 테이블에 레코드가 없습니다.');
    }
    
    // 3. 스키마 확인
    const columns = await new Promise<any[]>((resolve, reject) => {
      db.all("PRAGMA table_info(product_details)", (err, cols) => {
        if (err) reject(err);
        else resolve(cols);
      });
    });
    
    console.log('\n3. 컬럼 정보:');
    columns.forEach(col => {
      console.log(`   ${col.name}: ${col.type}`);
    });
    
    // 4. vid, pid 컬럼 타입 확인
    const vidColumn = columns.find(col => col.name === 'vid');
    const pidColumn = columns.find(col => col.name === 'pid');
    
    if (vidColumn && vidColumn.type === 'TEXT') {
      console.log('\n✅ vid 컬럼이 TEXT 타입입니다.');
    } else {
      console.error('\n❌ vid 컬럼이 TEXT 타입이 아닙니다!');
    }
    
    if (pidColumn && pidColumn.type === 'TEXT') {
      console.log('✅ pid 컬럼이 TEXT 타입입니다.');
    } else {
      console.error('❌ pid 컬럼이 TEXT 타입이 아닙니다!');
    }
    
    // 5. 무작위 샘플 데이터 확인
    const sampleRecords = await new Promise<any[]>((resolve, reject) => {
      db.all("SELECT url, vid, pid, primaryDeviceTypeId FROM product_details ORDER BY RANDOM() LIMIT 3", (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    console.log('\n5. 무작위 샘플 데이터:');
    sampleRecords.forEach(record => {
      console.log(`   URL: ${record.url}`);
      console.log(`   VID: ${record.vid} (${typeof record.vid})`);
      console.log(`   PID: ${record.pid} (${typeof record.pid})`);
      console.log(`   primaryDeviceTypeId: ${record.primaryDeviceTypeId}`);
      console.log('   ---');
    });
    
    // 6. 데이터베이스 무결성 체크
    const integrityCheck = await new Promise<string>((resolve, reject) => {
      db.get("PRAGMA integrity_check", (err, result: any) => {
        if (err) reject(err);
        else resolve(result.integrity_check);
      });
    });
    
    if (integrityCheck === 'ok') {
      console.log('\n✅ 데이터베이스 무결성 검사 통과');
    } else {
      console.error(`\n❌ 데이터베이스 무결성 검사 실패: ${integrityCheck}`);
    }
    
  } catch (error) {
    console.error('데이터베이스 검증 중 오류 발생:', error);
  } finally {
    db.close();
  }
}

verifyDatabaseIntegrity();
