/**
 * convertHexToInt.ts
 * 
 * 데이터베이스의 vid, pid, primaryDeviceTypeId 값들을 TEXT 형식에서 INTEGER 형식으로 변환하는 스크립트
 * - vid: 0xXXXX 형식의 TEXT에서 INTEGER로 변환
 * - pid: 0xXXXX 형식의 TEXT에서 INTEGER로 변환
 * - primaryDeviceTypeId: 0xXXXX, 0xYYYY 형식의 TEXT를 JSON 배열의 INTEGER로 변환
 */

import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';

// 실행 환경에 따른 DB 경로 설정
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

// 데이터베이스 백업
const backupPath = `${dbPath}.convert-backup-${new Date().toISOString().replace(/:/g, '-')}`;
fs.copyFileSync(dbPath, backupPath);
console.log(`데이터베이스 백업 완료: ${backupPath}`);

// 데이터베이스 연결
const db = new sqlite3.Database(dbPath);

// Helper function to convert hex string to integer
function hexToInteger(hexValue: string | null | undefined): number | null {
  if (!hexValue) return null;
  
  // Remove '0x' prefix if present and convert to integer
  const stringValue = String(hexValue).trim();
  if (['', 'n/a', '-', 'none', 'unknown'].includes(stringValue.toLowerCase())) {
    return null;
  }
  
  try {
    const cleanHex = stringValue.toLowerCase().startsWith('0x') 
      ? stringValue.substring(2) 
      : stringValue;
      
    const intValue = parseInt(cleanHex, 16);
    return isNaN(intValue) ? null : intValue;
  } catch (e) {
    console.error(`16진수 변환 실패: ${hexValue}`, e);
    return null;
  }
}

// Process the conversion in a transaction
db.serialize(() => {
  db.run('BEGIN TRANSACTION');
  
  // Convert VID values from hex strings to integers
  console.log('VID 값을 정수로 변환 중...');
  db.all('SELECT url, vid FROM product_details', (err, rows: { url: string, vid: string }[]) => {
    if (err) {
      console.error('VID 값 조회 중 오류 발생:', err);
      db.run('ROLLBACK');
      db.close();
      return;
    }
    
    let vidUpdateCount = 0;
    let vidProcessed = 0;
    
    if (rows.length === 0) {
      console.log('변환할 VID 데이터가 없습니다.');
      processPID();
      return;
    }
    
    rows.forEach(row => {
      const intValue = hexToInteger(row.vid);
      if (intValue === null) {
        console.log(`경고: 변환할 수 없는 VID 값: ${row.vid} (url: ${row.url})`);
      }
      
      db.run('UPDATE product_details SET vid = ? WHERE url = ?', [intValue, row.url], function(err) {
        vidProcessed++;
        
        if (err) {
          console.error(`VID 업데이트 오류 (${row.url}):`, err);
        } else if (this.changes > 0) {
          vidUpdateCount++;
        }
        
        if (vidProcessed === rows.length) {
          console.log(`VID 변환 완료: ${vidUpdateCount}개 레코드 업데이트됨`);
          processPID();
        }
      });
    });
  });
  
  // Convert PID values
  function processPID() {
    console.log('PID 값을 정수로 변환 중...');
    db.all('SELECT url, pid FROM product_details', (err, rows: { url: string, pid: string }[]) => {
      if (err) {
        console.error('PID 값 조회 중 오류 발생:', err);
        db.run('ROLLBACK');
        db.close();
        return;
      }
      
      let pidUpdateCount = 0;
      let pidProcessed = 0;
      
      if (rows.length === 0) {
        console.log('변환할 PID 데이터가 없습니다.');
        processDeviceTypeIds();
        return;
      }
      
      rows.forEach(row => {
        const intValue = hexToInteger(row.pid);
        if (intValue === null) {
          console.log(`경고: 변환할 수 없는 PID 값: ${row.pid} (url: ${row.url})`);
        }
        
        db.run('UPDATE product_details SET pid = ? WHERE url = ?', [intValue, row.url], function(err) {
          pidProcessed++;
          
          if (err) {
            console.error(`PID 업데이트 오류 (${row.url}):`, err);
          } else if (this.changes > 0) {
            pidUpdateCount++;
          }
          
          if (pidProcessed === rows.length) {
            console.log(`PID 변환 완료: ${pidUpdateCount}개 레코드 업데이트됨`);
            processDeviceTypeIds();
          }
        });
      });
    });
  }
  
  // Convert primaryDeviceTypeId values (as a JSON array of integers)
  function processDeviceTypeIds() {
    console.log('primaryDeviceTypeId 값을 정수 배열로 변환 중...');
    db.all('SELECT url, primaryDeviceTypeId FROM product_details', (err, rows: { url: string, primaryDeviceTypeId: string }[]) => {
      if (err) {
        console.error('primaryDeviceTypeId 값 조회 중 오류 발생:', err);
        db.run('ROLLBACK');
        db.close();
        return;
      }
      
      let typeIdUpdateCount = 0;
      let typeIdProcessed = 0;
      
      if (rows.length === 0) {
        console.log('변환할 primaryDeviceTypeId 데이터가 없습니다.');
        finalize();
        return;
      }
      
      rows.forEach(row => {
        if (!row.primaryDeviceTypeId) {
          typeIdProcessed++;
          if (typeIdProcessed === rows.length) {
            console.log(`primaryDeviceTypeId 변환 완료: ${typeIdUpdateCount}개 레코드 업데이트됨`);
            finalize();
          }
          return;
        }
        
        // Split by comma and convert each ID to integer
        const ids = row.primaryDeviceTypeId.split(',')
          .map(id => id.trim())
          .filter(Boolean)
          .map(hexId => hexToInteger(hexId))
          .filter(id => id !== null);
          
        // Store as JSON string array
        const jsonValue = JSON.stringify(ids);
        
        db.run('UPDATE product_details SET primaryDeviceTypeId = ? WHERE url = ?', [jsonValue, row.url], function(err) {
          typeIdProcessed++;
          
          if (err) {
            console.error(`primaryDeviceTypeId 업데이트 오류 (${row.url}):`, err);
          } else if (this.changes > 0) {
            typeIdUpdateCount++;
          }
          
          if (typeIdProcessed === rows.length) {
            console.log(`primaryDeviceTypeId 변환 완료: ${typeIdUpdateCount}개 레코드 업데이트됨`);
            finalize();
          }
        });
      });
    });
  }
  
  function finalize() {
    db.run('COMMIT', err => {
      if (err) {
        console.error('트랜잭션 커밋 오류:', err);
        db.run('ROLLBACK');
      } else {
        console.log('데이터 변환이 성공적으로 완료되었습니다.');
      }
      db.close();
    });
  }
});
