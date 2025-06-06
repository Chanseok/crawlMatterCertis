/**
 * gapCollectionIntegration.ts
 * 
 * Gap Detection과 Collection 시스템을 기존 Crawler와 통합하는 스크립트
 * 누락된 제품을 자동으로 감지하고 수집하는 통합 워크플로우를 제공합니다.
 * 
 * 사용법:
 *   npm run gap-collect -- --detect-and-collect
 *   npm run gap-collect -- --detect-only
 *   npm run gap-collect -- --collect-range --startPage=200 --endPage=210
 */

import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ES 모듈에서 __dirname 대체
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 갭 감지 및 수집 시스템 임포트
import { GapDetector } from '../src/electron/crawler/gap-detector.js';
import { GapCollector } from '../src/electron/crawler/gap-collector.js';

// 기존 크롤러 시스템 임포트
import { CrawlerEngine } from '../src/electron/crawler/core/CrawlerEngine.js';
import { BrowserManager } from '../src/electron/crawler/browser/BrowserManager.js';
import { PageCrawler } from '../src/electron/crawler/tasks/page-crawler.js';
import { configManager } from '../src/electron/ConfigManager.js';
import type { CrawlerConfig } from '../types.js';

// 데이터베이스 설정
const userDataPath = path.join(process.env.HOME || process.env.USERPROFILE || '.', 'Library', 'Application Support', 'crawlMatterCertis');
const dbPath = path.join(userDataPath, 'dev-database.sqlite');

console.log(`데이터베이스 경로: ${dbPath}`);

// 데이터베이스 파일 존재 여부 확인
if (!fs.existsSync(dbPath)) {
    console.error(`오류: 데이터베이스 파일이 존재하지 않습니다: ${dbPath}`);
    console.error(`먼저 npm run populate-dev-db 명령어로 데이터베이스를 생성하세요.`);
    process.exit(1);
}

// 명령줄 인수 파싱
const args = process.argv.slice(2);
const options: {
    detectAndCollect?: boolean;
    detectOnly?: boolean;
    collectRange?: boolean;
    startPage?: number;
    endPage?: number;
    dryRun?: boolean;
    maxConcurrency?: number;
    retryAttempts?: number;
} = {};

// 인수 파싱 로직
for (const arg of args) {
    if (arg === '--detect-and-collect') {
        options.detectAndCollect = true;
    } else if (arg === '--detect-only') {
        options.detectOnly = true;
    } else if (arg === '--collect-range') {
        options.collectRange = true;
    } else if (arg.startsWith('--startPage=')) {
        options.startPage = parseInt(arg.split('=')[1], 10) - 1; // UI는 1부터 시작, DB는 0부터 시작
    } else if (arg.startsWith('--endPage=')) {
        options.endPage = parseInt(arg.split('=')[1], 10) - 1; // UI는 1부터 시작, DB는 0부터 시작
    } else if (arg === '--dry-run') {
        options.dryRun = true;
    } else if (arg.startsWith('--max-concurrency=')) {
        options.maxConcurrency = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--retry-attempts=')) {
        options.retryAttempts = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--help') {
        showHelp();
        process.exit(0);
    }
}

// 도움말 표시 함수
function showHelp(): void {
    console.log(`
Gap Collection Integration CLI 사용법:
  npm run gap-collect -- --detect-and-collect  : 갭을 감지하고 자동으로 수집합니다.
  npm run gap-collect -- --detect-only  : 갭만 감지하고 보고서를 출력합니다.
  npm run gap-collect -- --collect-range --startPage=<숫자> --endPage=<숫자>  : 지정된 페이지 범위의 갭을 수집합니다.
  npm run gap-collect -- --dry-run  : 실제 수집 없이 계획만 출력합니다 (다른 옵션과 함께 사용).
  npm run gap-collect -- --max-concurrency=<숫자>  : 최대 동시 실행 수를 설정합니다 (기본값: 3).
  npm run gap-collect -- --retry-attempts=<숫자>  : 재시도 횟수를 설정합니다 (기본값: 2).
  npm run gap-collect -- --help  : 이 도움말을 표시합니다.

참고: 페이지 번호는 1부터 시작하는 UI 표시와 같습니다. (내부 pageId는 0부터 시작)
`);
}

/**
 * 전체 갭 감지 및 수집 워크플로우
 */
async function detectAndCollectGaps(): Promise<void> {
    console.log('\n==================== Gap Detection & Collection ====================');
    
    const db = new sqlite3.Database(dbPath);
    
    try {
        // 1. 갭 감지
        console.log('1단계: 갭 감지 중...');
        const gapResult = await GapDetector.detectMissingProducts();
        
        if (gapResult.totalMissingProducts === 0) {
            console.log('✅ 갭이 발견되지 않았습니다. 모든 제품이 완전히 수집되었습니다.');
            return;
        }
        
        // 갭 보고서 출력
        GapDetector.printGapReport(gapResult);
        
        if (options.dryRun) {
            console.log('\n🔍 [Dry Run] 실제 수집 없이 계획만 출력했습니다.');
            return;
        }
        
        // 2. 브라우저 및 크롤러 설정
        console.log('\n2단계: 크롤러 시스템 초기화 중...');
        const config = await setupCrawlerConfiguration();
        const browserManager = new BrowserManager(config);
        await browserManager.initialize();
        
        // 크롤러 인스턴스 생성 (PageCrawler 사용)
        const pageCrawler = new PageCrawler(browserManager, config);
        
        // 3. 갭 수집
        console.log('\n3단계: 갭 수집 시작...');
        
        const collectionOptions = {
            maxConcurrentPages: options.maxConcurrency || 3,
            maxRetries: options.retryAttempts || 2,
            delayBetweenPages: 1000
        };
        
        const collectionResult = await GapCollector.collectMissingProducts(gapResult, pageCrawler, collectionOptions);
        
        // 4. 결과 보고
        console.log('\n==================== Collection Results ====================');
        console.log(`총 갭 감지: ${gapResult.totalMissingProducts}개`);
        console.log(`성공적으로 수집: ${collectionResult.collected}개`);
        console.log(`실패: ${collectionResult.failed}개`);
        
        if (collectionResult.errors.length > 0) {
            console.log('\n실패한 갭:');
            collectionResult.errors.forEach(error => {
                console.log(`  - ${error}`);
            });
        }
        
        if (collectionResult.collected > 0) {
            console.log(`\n✅ ${collectionResult.collected}개의 누락된 제품이 성공적으로 수집되었습니다!`);
        }
        
        // 리소스 정리
        await browserManager.close();
        
    } catch (error) {
        console.error('Gap detection and collection failed:', error);
        throw error;
    } finally {
        db.close();
    }
}

/**
 * 갭 감지만 실행
 */
async function detectGapsOnly(): Promise<void> {
    console.log('\n==================== Gap Detection Only ====================');
    
    const db = new sqlite3.Database(dbPath);
    
    try {
        const gapResult = await GapDetector.detectMissingProducts();
        
        if (gapResult.missingPages.length === 0) {
            console.log('✅ 갭이 발견되지 않았습니다. 모든 제품이 완전히 수집되었습니다.');
        } else {
            GapDetector.printGapReport(gapResult);
        }
    } catch (error) {
        console.error('Gap detection failed:', error);
        throw error;
    } finally {
        db.close();
    }
}

/**
 * 특정 페이지 범위의 갭 수집
 */
async function collectRangeGaps(): Promise<void> {
    if (options.startPage === undefined || options.endPage === undefined) {
        console.error('오류: --collect-range 옵션 사용 시 --startPage와 --endPage를 모두 지정해야 합니다.');
        process.exit(1);
    }
    
    console.log(`\n==================== Range Gap Collection (${options.startPage + 1}-${options.endPage + 1}) ====================`);
    
    const db = new sqlite3.Database(dbPath);
    
    try {
        // 1. 지정된 범위의 갭 감지
        console.log('1단계: 범위 갭 감지 중...');
        const gapResult = await GapDetector.detectMissingProductsInRange(options.startPage, options.endPage);
        
        if (gapResult.missingPages.length === 0) {
            console.log(`✅ 지정된 범위 (PageID ${options.startPage}-${options.endPage})에서 갭이 발견되지 않았습니다.`);
            return;
        }
        
        // 갭 보고서 출력
        GapDetector.printGapReport(gapResult);
        
        if (options.dryRun) {
            console.log('\n🔍 [Dry Run] 실제 수집 없이 계획만 출력했습니다.');
            return;
        }
        
        // 2. 브라우저 및 크롤러 설정
        console.log('\n2단계: 크롤러 시스템 초기화 중...');
        const config = await setupCrawlerConfiguration();
        const browserManager = new BrowserManager(config);
        await browserManager.initialize();
        
        // 크롤러 인스턴스 생성 (PageCrawler 사용)
        const pageCrawler = new PageCrawler(browserManager, config);
        
        // 3. 갭 수집
        console.log('\n3단계: 범위 갭 수집 시작...');
        
        const collectionOptions = {
            maxConcurrentPages: options.maxConcurrency || 3,
            maxRetries: options.retryAttempts || 2,
            delayBetweenPages: 1000
        };
        
        const collectionResult = await GapCollector.collectMissingProducts(gapResult, pageCrawler, collectionOptions);
        
        // 4. 결과 보고
        console.log('\n==================== Range Collection Results ====================');
        console.log(`범위: PageID ${options.startPage}-${options.endPage}`);
        console.log(`총 갭 감지: ${gapResult.missingPages.length}개`);
        console.log(`성공적으로 수집: ${collectionResult.collected}개`);
        console.log(`실패: ${collectionResult.failed}개`);
        
        if (collectionResult.errors.length > 0) {
            console.log('\n실패한 갭:');
            collectionResult.errors.forEach(error => {
                console.log(`  - ${error}`);
            });
        }
        
        if (collectionResult.collected > 0) {
            console.log(`\n✅ ${collectionResult.collected}개의 누락된 제품이 성공적으로 수집되었습니다!`);
        }
        
        // 리소스 정리
        await browserManager.close();
        
    } catch (error) {
        console.error('Range gap collection failed:', error);
        throw error;
    } finally {
        db.close();
    }
}

/**
 * 크롤러 설정 준비
 */
async function setupCrawlerConfiguration(): Promise<CrawlerConfig> {
    // 기존 설정 로드
    const baseConfig = configManager.getConfig();
    
    // 갭 수집에 최적화된 설정
    const gapCollectionConfig: CrawlerConfig = {
        ...baseConfig,
        // 갭 수집은 정확성이 중요하므로 안정적인 설정 사용
        crawlerType: 'playwright', // 더 안정적
        pageTimeoutMs: 30000, // 충분한 시간 제공
        initialConcurrency: options.maxConcurrency || 3, // 낮은 동시 실행으로 안정성 확보
        productListRetryCount: options.retryAttempts || 2, // Use appropriate retry property
        autoAddToLocalDB: true, // 자동 DB 저장 활성화
        productsPerPage: 12,
        
        // 갭 수집 시에는 페이지 범위 제한 무시
        pageRangeLimit: 0 // 제한 없음
    };
    
    return gapCollectionConfig;
}

/**
 * 메인 함수
 */
async function main(): Promise<void> {
    try {
        if (options.detectAndCollect) {
            await detectAndCollectGaps();
        } else if (options.detectOnly) {
            await detectGapsOnly();
        } else if (options.collectRange) {
            await collectRangeGaps();
        } else {
            console.error('오류: 실행할 작업을 지정해야 합니다.');
            showHelp();
            process.exit(1);
        }
    } catch (error) {
        console.error('스크립트 실행 중 오류 발생:', error);
        process.exit(1);
    }
}

// 스크립트 실행
main();
