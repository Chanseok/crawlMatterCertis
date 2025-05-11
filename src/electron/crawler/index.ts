/**
 * index.ts
 * 크롤러 모듈의 메인 진입점
 */

import { CrawlerConfig } from '../../../types.js';
import { CrawlerEngine } from './core/CrawlerEngine.js';
import { configManager } from '../ConfigManager.js';

import type { CrawlingSummary } from './utils/types.js';

// 크롤러 인스턴스 생성
const crawler = new CrawlerEngine();

/**
 * 크롤링 작업을 시작하는 함수
 * @returns 크롤링 작업 시작 성공 여부
 */
export async function startCrawling(): Promise<boolean> {
  console.log('[Crawler] startCrawling called');
  
  // 최종 설정값 로깅 (업데이트 후)
  const finalConfig = configManager.getConfig();
  console.log('[Crawler] Final config before starting crawling:', JSON.stringify(finalConfig));
  console.log(`[Crawler] autoAddToLocalDB is set to: ${finalConfig.autoAddToLocalDB}`);
  
  return crawler.startCrawling();
}

/**
 * 크롤링 작업을 중지하는 함수
 * @returns 중지 요청 성공 여부
 */
export function stopCrawling(): boolean {
  return crawler.stopCrawling();
}

/**
 * 크롤링 상태 체크(요약 정보) 함수
 */
export async function checkCrawlingStatus(): Promise<CrawlingSummary> {
  return crawler.checkCrawlingStatus();
}

/**
 * 크롤링이 현재 진행 중인지 확인
 */
export function isRunning(): boolean {
  return crawler.isRunning();
}

/**
 * 현재 크롤러 설정 가져오기
 */
export function getCrawlerConfig(): CrawlerConfig {
  return configManager.getConfig();
}

/**
 * 크롤러 설정 업데이트
 * @param config 업데이트할 설정 객체
 */
export function updateCrawlerConfig(config: Partial<CrawlerConfig>): void {
  configManager.updateConfig(config);
}

/**
 * 크롤러 설정을 기본값으로 초기화
 */
export function resetCrawlerConfig(): void {
  configManager.resetConfig();
}

// 모든 크롤러 기능 노출
export {
  crawler
};