/**
 * testMigration.ts
 * 
 * 마이그레이션이 성공적으로 적용되었는지 테스트하는 스크립트
 */

import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';

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
const db = new sqlite3.Database(dbPath);

// 테이블 스키마 확인
console.log('테이블 스키마 확인 중...');
db.all("PRAGMA table_info(product_details)", (err, columns) => {
  if (err) {
    console.error('테이블 정보 조회 중 오류:', err);
    db.close();
    return;
  }
  
  // 컬럼 정보 출력
  console.log('\n--- product_details 테이블 스키마 ---');
  columns.forEach(col => {
    console.log(`${col.name}: ${col.type}`);
  });
  
  // vid, pid 컬럼이 TEXT 타입인지 확인
  const vidColumn = columns.find(col => col.name === 'vid');
  const pidColumn = columns.find(col => col.name === 'pid');
  
  if (vidColumn && vidColumn.type === 'TEXT') {
    console.log('\n✅ vid 컬럼이 TEXT 타입입니다.');
  } else {
    console.error('\n❌ vid 컬럼이 TEXT 타입이 아닙니다:', vidColumn?.type);
  }
  
  if (pidColumn && pidColumn.type === 'TEXT') {
    console.log('✅ pid 컬럼이 TEXT 타입입니다.');
  } else {
    console.error('❌ pid 컬럼이 TEXT 타입이 아닙니다:', pidColumn?.type);
  }
  
  // vid, pid, primaryDeviceTypeId 샘플 데이터 확인
  db.all("SELECT url, vid, pid, primaryDeviceTypeId FROM product_details LIMIT 5", (err, rows) => {
    if (err) {
      console.error('샘플 데이터 조회 중 오류:', err);
      db.close();
      return;
    }
    
    console.log('\n--- 샘플 데이터 ---');
    if (rows.length === 0) {
      console.log('데이터가 없습니다.');
    } else {
      rows.forEach(row => {
        console.log(`URL: ${row.url}`);
        console.log(`VID: ${row.vid} (타입: ${typeof row.vid})`);
        console.log(`PID: ${row.pid} (타입: ${typeof row.pid})`);
        console.log(`primaryDeviceTypeId: ${row.primaryDeviceTypeId} (타입: ${typeof row.primaryDeviceTypeId})`);
        console.log('---');
      });
    }
    
    // 데이터베이스 연결 종료
    db.close();
  });
});
