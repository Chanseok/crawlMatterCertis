/**
 * index.ts
 * 크롤러 모듈의 메인 진입점
 */

import type { CrawlerConfig } from '../../../types.js';
import { CrawlerEngine } from './core/CrawlerEngine.js';
import { configManager } from '../ConfigManager.js';
import { createElectronLogger } from '../utils/logger.js';

import type { CrawlingSummary } from './utils/types.js';

// 크롤러 인스턴스 생성
const crawler = new CrawlerEngine();
const logger = createElectronLogger('CrawlerIndex');

/**
 * 크롤링 작업을 시작하는 함수
 * @param config UI에서 전달받은 크롤러 설정
 * @returns 크롤링 작업 시작 성공 여부
 */
export async function startCrawling(config: CrawlerConfig): Promise<boolean> {
  logger.info('startCrawling called');
  logger.info('Config received from UI', { data: JSON.stringify(config) });
  return crawler.startCrawling(config);
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
 * 세션 설정을 무효화하여 다음 작업 시 최신 설정을 사용하도록 함
 */
export function invalidateSessionConfig(): void {
  return crawler.invalidateSessionConfig();
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