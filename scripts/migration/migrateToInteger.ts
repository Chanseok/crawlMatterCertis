/**
 * migrateToInteger.ts
 * 
 * 데이터베이스를 TEXT 타입에서 INTEGER 타입으로 마이그레이션하는 실행 스크립트
 */

import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

console.log('데이터베이스 INTEGER 타입 마이그레이션 프로세스를 시작합니다...');

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

// Step 1: 데이터 값 변환 (TEXT 형식 -> INTEGER 값)
console.log('1단계: 16진수 문자열을 정수로 변환 중...');
try {
  execSync('npx ts-node scripts/migration/convertHexToInt.ts', { stdio: 'inherit' });
  console.log('✅ 데이터 값 변환이 성공적으로 완료되었습니다.');
} catch (error) {
  console.error('❌ 데이터 값 변환 실패:', error);
  process.exit(1);
}

// Step 2: 스키마 마이그레이션 (TEXT 컬럼 -> INTEGER 컬럼)
console.log('2단계: 데이터베이스 스키마 타입 변경 중...');
try {
  execSync('npx ts-node scripts/migration/updateSchema.ts', { stdio: 'inherit' });
  console.log('✅ 스키마 마이그레이션이 성공적으로 완료되었습니다.');
} catch (error) {
  console.error('❌ 스키마 마이그레이션 실패:', error);
  process.exit(1);
}

// Step 3: 마이그레이션 검증
console.log('3단계: 마이그레이션 결과 검증 중...');
try {
  execSync('npx ts-node scripts/migration/verifyIntegerSchema.ts', { stdio: 'inherit' });
  console.log('✅ 마이그레이션 검증이 성공적으로 완료되었습니다.');
} catch (error) {
  console.error('❌ 마이그레이션 검증 실패:', error);
  process.exit(1);
}

console.log('✅ INTEGER 타입 마이그레이션이 성공적으로 완료되었습니다!');
console.log('이제 애플리케이션 코드를 업데이트하여 새로운 스키마를 지원하도록 해야 합니다.');
console.log('다음 명령을 실행하여 애플리케이션을 다시 빌드하세요: npm run transpile:electron && npm run build');
