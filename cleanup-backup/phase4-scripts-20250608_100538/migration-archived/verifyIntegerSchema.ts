/**
 * verifyIntegerSchema.ts
 * 
 * INTEGER 타입으로 변경된 스키마의 무결성을 검증하는 스크립트
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

// 16진수 정수를 0xXXXX 형식으로 변환
function integerToHexId(value: number | null | undefined): string | null {
  if (value === null || value === undefined || isNaN(value)) return null;
  
  // 16진수로 변환하고 4자리로 패딩
  const hexString = value.toString(16).toUpperCase().padStart(4, '0');
  
  // 4자리로 맞추기
  const normalizedHex = hexString.length > 4 
    ? hexString.substring(hexString.length - 4) 
    : hexString;
  
  return `0x${normalizedHex}`;
}

// primaryDeviceTypeId JSON 배열을 HEX 문자열로 변환
function jsonArrayToHexString(jsonStr: string | null): string | null {
  if (!jsonStr) return null;
  
  try {
    const intArray = JSON.parse(jsonStr);
    if (!Array.isArray(intArray) || intArray.length === 0) return null;
    
    const hexValues = intArray
      .map(value => integerToHexId(value))
      .filter(Boolean);
      
    return hexValues.length > 0 ? hexValues.join(', ') : null;
  } catch (e) {
    console.error(`JSON 배열 파싱 오류: ${jsonStr}`, e);
    return null;
  }
}

async function verifyDatabaseSchema() {
  console.log('데이터베이스 스키마 검증 시작...');
  
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
    
    // 2. 레코드 수 확인
    const count = await new Promise<number>((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM product_details', (err, row: {count: number}) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });
    
    console.log(`\n2. 레코드 수: ${count}`);
    
    if (count === 0) {
      console.error('⚠️ product_details 테이블에 데이터가 없습니다!');
    }
    
    // 3. 컬럼 정보 확인
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
    
    // 타입 변경 확인
    const vidColumn = columns.find(col => col.name === 'vid');
    const pidColumn = columns.find(col => col.name === 'pid');
    
    if (vidColumn && vidColumn.type === 'INTEGER') {
      console.log('✅ vid 컬럼이 INTEGER 타입입니다.');
    } else {
      console.error('❌ vid 컬럼이 INTEGER 타입이 아닙니다:', vidColumn?.type);
    }
    
    if (pidColumn && pidColumn.type === 'INTEGER') {
      console.log('✅ pid 컬럼이 INTEGER 타입입니다.');
    } else {
      console.error('❌ pid 컬럼이 INTEGER 타입이 아닙니다:', pidColumn?.type);
    }
    
    // 4. 샘플 데이터 확인
    const samples = await new Promise<any[]>((resolve, reject) => {
      db.all('SELECT url, vid, pid, primaryDeviceTypeId FROM product_details ORDER BY RANDOM() LIMIT 3', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    console.log('\n4. 샘플 데이터:');
    samples.forEach(sample => {
      console.log(`   URL: ${sample.url}`);
      console.log(`   VID: ${sample.vid} (${typeof sample.vid}) => 16진수: ${integerToHexId(sample.vid)}`);
      console.log(`   PID: ${sample.pid} (${typeof sample.pid}) => 16진수: ${integerToHexId(sample.pid)}`);
      
      let primaryIdDisplay = '없음';
      if (sample.primaryDeviceTypeId) {
        try {
          // 배열인지 확인
          const parsed = JSON.parse(sample.primaryDeviceTypeId);
          if (Array.isArray(parsed)) {
            primaryIdDisplay = jsonArrayToHexString(sample.primaryDeviceTypeId) || '빈 배열';
          } else {
            primaryIdDisplay = `파싱 오류: ${sample.primaryDeviceTypeId}`;
          }
        } catch (e) {
          primaryIdDisplay = `형식 오류: ${sample.primaryDeviceTypeId}`;
        }
      }
      
      console.log(`   primaryDeviceTypeId: ${primaryIdDisplay}`);
      console.log('   ---');
    });
    
    console.log('\n✅ 데이터베이스 스키마 검증이 완료되었습니다.');
    
  } catch (error) {
    console.error('데이터베이스 검증 중 오류 발생:', error);
  } finally {
    db.close();
  }
}

verifyDatabaseSchema();
