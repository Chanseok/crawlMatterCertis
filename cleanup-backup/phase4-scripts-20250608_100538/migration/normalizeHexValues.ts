/**
 * normalizeHexValues.ts
 * 
 * 데이터베이스의 vid, pid, primaryDeviceTypeId 값들을 표준 0xXXXX 형식으로 정규화하는 스크립트
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

// 데이터베이스 연결
const db = new sqlite3.Database(dbPath);

/**
 * Hex ID를 표준 0xXXXX 형식으로 정규화하는 함수
 */
function normalizeHexId(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  
  // 숫자 타입 처리
  if (typeof value === 'number') {
    return `0x${value.toString(16).toUpperCase().padStart(4, '0')}`;
  }
  
  const stringValue = String(value).trim();
  if (['', 'n/a', '-', 'none', 'unknown'].includes(stringValue.toLowerCase())) {
    return null;
  }
  
  // 이미 정규화된 형식인지 확인
  const normalizedRegex = /^0x[0-9A-F]{4}$/;
  if (normalizedRegex.test(stringValue)) {
    return stringValue;
  }
  
  let hexValue: string;
  
  // 형식에 따른 hex 값 추출
  if (/^0x[0-9A-Fa-f]+$/i.test(stringValue)) {
    hexValue = stringValue.substring(2).toUpperCase();
  } else if (/^[0-9A-Fa-f]+$/i.test(stringValue)) {
    hexValue = stringValue.toUpperCase();
  } else if (/^\d+$/.test(stringValue)) {
    try {
      hexValue = parseInt(stringValue, 10).toString(16).toUpperCase();
    } catch (e) {
      console.error(`"${stringValue}" 파싱 실패:`, e);
      return null;
    }
  } else {
    console.warn(`변환할 수 없는 hex 값: "${stringValue}"`);
    return null;
  }
  
  // 4자리로 표준화
  hexValue = hexValue.padStart(4, '0');
  if (hexValue.length > 4) {
    hexValue = hexValue.substring(hexValue.length - 4);
  }
  
  return `0x${hexValue}`;
}

/**
 * primaryDeviceTypeId 컬럼의 쉼표로 구분된 값들을 정규화
 */
function normalizePrimaryDeviceTypeIds(value: string | null | undefined): string | null {
  if (!value) return null;
  
  const idList = value.split(',').map(id => id.trim());
  const normalizedIds = idList
    .map(id => normalizeHexId(id))
    .filter(Boolean); // null/undefined 제거
  
  return normalizedIds.length > 0 ? normalizedIds.join(', ') : null;
}

// 데이터베이스 백업
const backupPath = `${dbPath}.backup-${new Date().toISOString().replace(/:/g, '-')}`;
fs.copyFileSync(dbPath, backupPath);
console.log(`데이터베이스 백업 완료: ${backupPath}`);

// 모든 업데이트를 트랜잭션으로 처리
db.serialize(() => {
  console.log('데이터 정규화 시작...');
  
  db.run('BEGIN TRANSACTION');
  
  // 테이블이 존재하는지 확인
  db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='product_details'", (err, row) => {
    if (err) {
      console.error('테이블 확인 중 오류 발생:', err);
      db.run('ROLLBACK');
      db.close();
      return;
    }
    
    if (!row) {
      console.error('product_details 테이블이 존재하지 않습니다.');
      db.run('ROLLBACK');
      db.close();
      return;
    }
    
    // vid 값 정규화
    console.log('VID 정규화 중...');
    db.all('SELECT url, vid FROM product_details', (err, rows: { url: string, vid: any }[]) => {
      if (err) {
        console.error('VID 조회 중 오류:', err);
        db.run('ROLLBACK');
        db.close();
        return;
      }
      
      let vidUpdateCount = 0;
      let vidUpdateCompleted = 0;
      
      if (rows.length === 0) {
        console.log('정규화할 VID 데이터가 없습니다.');
        processNextStep();
        return;
      }
      
      rows.forEach(row => {
        const normalizedVid = normalizeHexId(row.vid);
        db.run('UPDATE product_details SET vid = ? WHERE url = ?', [normalizedVid, row.url], function(err) {
          vidUpdateCompleted++;
          
          if (err) {
            console.error(`${row.url}의 VID 업데이트 중 오류:`, err);
          } else if (this.changes > 0) {
            vidUpdateCount++;
          }
          
          if (vidUpdateCompleted === rows.length) {
            console.log(`VID 정규화 완료: ${vidUpdateCount}개 업데이트됨`);
            processPid();
          }
        });
      });
    });
    
    // pid 값 정규화
    function processPid() {
      console.log('PID 정규화 중...');
      db.all('SELECT url, pid FROM product_details', (err, rows: { url: string, pid: any }[]) => {
        if (err) {
          console.error('PID 조회 중 오류:', err);
          db.run('ROLLBACK');
          db.close();
          return;
        }
        
        let pidUpdateCount = 0;
        let pidUpdateCompleted = 0;
        
        if (rows.length === 0) {
          console.log('정규화할 PID 데이터가 없습니다.');
          processNextStep();
          return;
        }
        
        rows.forEach(row => {
          const normalizedPid = normalizeHexId(row.pid);
          db.run('UPDATE product_details SET pid = ? WHERE url = ?', [normalizedPid, row.url], function(err) {
            pidUpdateCompleted++;
            
            if (err) {
              console.error(`${row.url}의 PID 업데이트 중 오류:`, err);
            } else if (this.changes > 0) {
              pidUpdateCount++;
            }
            
            if (pidUpdateCompleted === rows.length) {
              console.log(`PID 정규화 완료: ${pidUpdateCount}개 업데이트됨`);
              processDeviceTypeIds();
            }
          });
        });
      });
    }
    
    // primaryDeviceTypeId 값 정규화
    function processDeviceTypeIds() {
      console.log('primaryDeviceTypeId 정규화 중...');
      db.all('SELECT url, primaryDeviceTypeId FROM product_details', (err, rows: { url: string, primaryDeviceTypeId: string }[]) => {
        if (err) {
          console.error('primaryDeviceTypeId 조회 중 오류:', err);
          db.run('ROLLBACK');
          db.close();
          return;
        }
        
        let typeIdUpdateCount = 0;
        let typeIdUpdateCompleted = 0;
        
        if (rows.length === 0) {
          console.log('정규화할 primaryDeviceTypeId 데이터가 없습니다.');
          processNextStep();
          return;
        }
        
        rows.forEach(row => {
          const normalizedIds = normalizePrimaryDeviceTypeIds(row.primaryDeviceTypeId);
          db.run('UPDATE product_details SET primaryDeviceTypeId = ? WHERE url = ?', [normalizedIds, row.url], function(err) {
            typeIdUpdateCompleted++;
            
            if (err) {
              console.error(`${row.url}의 primaryDeviceTypeId 업데이트 중 오류:`, err);
            } else if (this.changes > 0) {
              typeIdUpdateCount++;
            }
            
            if (typeIdUpdateCompleted === rows.length) {
              console.log(`primaryDeviceTypeId 정규화 완료: ${typeIdUpdateCount}개 업데이트됨`);
              processNextStep();
            }
          });
        });
      });
    }
    
    // 트랜잭션 완료
    function processNextStep() {
      db.run('COMMIT', (err) => {
        if (err) {
          console.error('트랜잭션 커밋 중 오류:', err);
          db.run('ROLLBACK');
        } else {
          console.log('모든 값이 성공적으로 정규화되었습니다.');
        }
        
        // 데이터베이스 연결 종료
        db.close();
      });
    }
  });
});
