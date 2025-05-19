/**
 * migrateDatabaseExec.ts
 * 
 * 데이터베이스 마이그레이션을 실행하는 스크립트
 * 1. 데이터 정규화
 * 2. 스키마 마이그레이션
 */

import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

console.log('데이터베이스 마이그레이션 프로세스를 시작합니다...');

// 데이터베이스가 존재하는지 확인
const userDataPath = path.join(process.env.HOME || process.env.USERPROFILE || '', 'Library', 'Application Support', 'crawlMatterCertis');
const dbPath = path.join(userDataPath, 'dev-database.sqlite');

// 디렉토리 존재 확인 및 생성
if (!fs.existsSync(userDataPath)) {
  console.log(`사용자 데이터 디렉토리를 생성합니다: ${userDataPath}`);
  fs.mkdirSync(userDataPath, { recursive: true });
}

// 데이터베이스 파일 확인
if (!fs.existsSync(dbPath)) {
  console.log(`⚠️ 데이터베이스 파일이 존재하지 않습니다: ${dbPath}`);
  console.log('데이터베이스를 먼저 생성하거나 애플리케이션을 실행해 주세요.');
  process.exit(1);
}

// Step 1: Hex 값 정규화
console.log('1단계: 데이터베이스의 hex 값 정규화 중...');
try {
  execSync('npx ts-node scripts/migration/normalizeHexValues.ts', { stdio: 'inherit' });
  console.log('✅ Hex 값 정규화가 성공적으로 완료되었습니다.');
} catch (error) {
  console.error('❌ Hex 값 정규화 실패:', error);
  process.exit(1);
}

// Step 2: 스키마 마이그레이션
console.log('2단계: 데이터베이스 스키마 마이그레이션 중...');
try {
  execSync('npx ts-node scripts/migration/migrateDbSchema.ts', { stdio: 'inherit' });
  console.log('✅ 스키마 마이그레이션이 성공적으로 완료되었습니다.');
} catch (error) {
  console.error('❌ 스키마 마이그레이션 실패:', error);
  process.exit(1);
}

console.log('✅ 데이터베이스 마이그레이션이 성공적으로 완료되었습니다!');
console.log('애플리케이션을 다시 빌드하여 코드 변경사항을 적용하세요.');
