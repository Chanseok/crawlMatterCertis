# 데이터베이스 마이그레이션 가이드

이 문서는 `product_details` 테이블의 `vid`, `pid`, `primaryDeviceTypeId` 필드의 데이터 타입 변경과 값 표준화에 대한 안내입니다.

## 마이그레이션 내용

- `vid` 필드: INTEGER → TEXT (0xXXXX 형식의 16진수 문자열)
- `pid` 필드: INTEGER → TEXT (0xXXXX 형식의 16진수 문자열)
- `primaryDeviceTypeId` 필드: TEXT (이미 TEXT이나, 값을 0xXXXX 형식으로 정규화)

## 마이그레이션 절차

### 1. 애플리케이션 종료

마이그레이션 전에 실행 중인 애플리케이션을 모두 종료하세요.

```bash
# 실행 중인 Electron 프로세스 확인
ps aux | grep electron

# 필요시 강제 종료
kill -9 [프로세스ID]
```

### 2. 데이터베이스 백업

마이그레이션 스크립트는 자동으로 백업을 생성하지만, 수동 백업도 권장합니다.

```bash
# 사용자 데이터 디렉토리 위치
cd ~/Library/Application\ Support/crawlMatterCertis/

# 수동 백업 (현재 날짜로)
cp dev-database.sqlite dev-database.sqlite.bak-$(date +%Y%m%d)
```

### 3. 마이그레이션 실행

```bash
# 프로젝트 디렉토리로 이동
cd ~/Codes/crawlMatterCertis

# 마이그레이션 실행
npm run migrate-db
```

### 4. 마이그레이션 테스트

마이그레이션이 올바르게 적용되었는지 확인합니다.

```bash
npm run test-migration
```

### 5. 애플리케이션 재빌드 및 재시작

```bash
# 재빌드
npm run rebuild

# 애플리케이션 실행
npm run dev
```

## 문제 해결

마이그레이션 중 오류가 발생하면:

1. 로그 확인: 오류 메시지 분석
2. 백업에서 복원: `~/Library/Application Support/crawlMatterCertis/` 디렉토리의 백업 파일을 이용해 복원
3. 개발팀 문의: 오류 로그와 함께 상황 공유

## 추가 정보

- 마이그레이션 시 데이터의 손실이나 파손 위험을 최소화하기 위해 여러 단계로 진행됩니다.
- 마이그레이션 스크립트는 `/scripts/migration/` 디렉토리에 있습니다.
