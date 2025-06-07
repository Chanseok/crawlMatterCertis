/**
 * updateSchema.ts
 * 
 * 데이터베이스 스키마를 업데이트하는 스크립트
 * - vid: TEXT → INTEGER
 * - pid: TEXT → INTEGER
 * - primaryDeviceTypeId: TEXT (사실상 형식만 변경: JSON 배열로 정수 저장)
 */

import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';

// SQLite 설정
const { Database } = sqlite3;

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
const backupPath = `${dbPath}.schema-backup-${new Date().toISOString().replace(/:/g, '-')}`;
fs.copyFileSync(dbPath, backupPath);
console.log(`데이터베이스 백업 완료: ${backupPath}`);

// 데이터베이스 연결
const db = new Database(dbPath);

// 스키마 변경 시작
db.serialize(() => {
  db.run('BEGIN TRANSACTION');
  
  // 테이블이 존재하는지 확인
  db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='product_details'", (err, row) => {
    if (err || !row) {
      console.error('오류: product_details 테이블을 찾을 수 없습니다.');
      db.close();
      return;
    }
    
    // 현재 테이블 스키마 확인
    db.all("PRAGMA table_info(product_details)", (err, columns) => {
      if (err) {
        console.error('테이블 정보 조회 중 오류:', err);
        db.run('ROLLBACK');
        db.close();
        return;
      }
      
      console.log('현재 테이블 구조:', columns.map((col: any) => `${col.name} (${col.type})`).join(', '));
      
      // 새로운 테이블 생성 (vid, pid를 INTEGER 타입으로 변경)
      db.run(`
        CREATE TABLE product_details_new (
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
          vid INTEGER,  -- TEXT에서 INTEGER로 변경
          pid INTEGER,  -- TEXT에서 INTEGER로 변경
          familySku TEXT,
          familyVariantSku TEXT,
          firmwareVersion TEXT,
          familyId TEXT,
          tisTrpTested TEXT,
          specificationVersion TEXT,
          transportInterface TEXT,
          primaryDeviceTypeId TEXT, -- TEXT 유지 (JSON 배열 형태로 저장)
          applicationCategories TEXT
        )
      `, function(err) {
        if (err) {
          console.error('새 테이블 생성 중 오류:', err);
          db.run('ROLLBACK');
          db.close();
          return;
        }
        
        // 데이터 복사
        db.run(`INSERT INTO product_details_new SELECT * FROM product_details`, function(err) {
          if (err) {
            console.error('데이터 복사 중 오류:', err);
            db.run('ROLLBACK');
            db.close();
            return;
          }
          
          console.log(`데이터 복사 완료: ${this.changes}개 행 처리됨`);
          
          // 기존 테이블 삭제
          db.run('DROP TABLE product_details', function(err) {
            if (err) {
              console.error('기존 테이블 삭제 중 오류:', err);
              db.run('ROLLBACK');
              db.close();
              return;
            }
            
            console.log('기존 테이블 삭제 완료');
            
            // 새 테이블 이름 변경
            db.run('ALTER TABLE product_details_new RENAME TO product_details', function(err) {
              if (err) {
                console.error('테이블 이름 변경 중 오류:', err);
                db.run('ROLLBACK');
                db.close();
                return;
              }
              
              console.log('테이블 이름 변경 완료');
              
              // 변경사항 확정
              db.run('COMMIT', err => {
                if (err) {
                  console.error('트랜잭션 커밋 오류:', err);
                  db.run('ROLLBACK');
                  db.close();
                  return;
                }
                
                console.log('스키마 마이그레이션이 성공적으로 완료되었습니다.');
                
                // 새 스키마 확인
                db.all("PRAGMA table_info(product_details)", (err, columns) => {
                  if (err) {
                    console.error('새 테이블 정보 조회 중 오류:', err);
                  } else {
                    console.log('새 테이블 구조:', columns.map((col: any) => `${col.name} (${col.type})`).join(', '));
                  }
                  db.close();
                });
              });
            });
          });
        });
      });
    });
  });
});
