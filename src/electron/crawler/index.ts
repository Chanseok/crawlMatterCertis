/**
 * index.ts
 * 크롤러 모듈의 공개 API를 내보내는 파일
 */

// 크롤러의 핵심 기능들 내보내기
export { startCrawling, stopCrawling, checkCrawlingStatus } from './crawler.js';

// 이벤트 이미터 내보내기
export { crawlerEvents } from './utils/progress.js';

// 크롤링 단계 상수 내보내기
export { CRAWLING_PHASES } from './utils/progress.js';