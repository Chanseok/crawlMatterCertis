/**
 * test-crawler-strategy.ts
 * 크롤러 전략 패턴 테스트 스크립트
 */

import { BrowserManager } from '../crawler/browser/BrowserManager.js';
import { CrawlerState } from '../crawler/core/CrawlerState.js';
import { PageCrawler } from '../crawler/tasks/page-crawler.js';
import { CrawlerConfig } from '../../../types.js';
import { debugLog } from '../util.js';
import { CrawlerStrategyFactory, CrawlerType } from '../crawler/strategies/crawler-strategy-factory.js';
import { ProductListCollector } from '../crawler/tasks/productList.js';

/**
 * 다양한 크롤러 전략을 테스트하는 함수
 */
async function testCrawlerStrategies() {
  console.log('크롤러 전략 테스트 시작...');

  // 기본 설정 생성
  const config: CrawlerConfig = {
    pageRangeLimit: 50,
    productListRetryCount: 3,
    productDetailRetryCount: 3,
    productsPerPage: 12,
    autoAddToLocalDB: false,
    matterFilterUrl: 'https://csa-iot.org/all-solutions/matter/?_filter_company_1=all&_filter_device_type_1=all',
    pageTimeoutMs: 30000,
    minRequestDelayMs: 500,
    maxConcurrentTasks: 3
  };

  // 브라우저 매니저 초기화 (Playwright 전략에 필요)
  const browserManager = new BrowserManager({
    headlessBrowser: true,
    pageRangeLimit: 50,
    productListRetryCount: 3,
    productDetailRetryCount: 3,
    productsPerPage: 12,
    autoAddToLocalDB: false
  });
  await browserManager.initialize();

  // 중단 컨트롤러 생성
  const abortController = new AbortController();
  const state = new CrawlerState();

  try {
    // 1. PageCrawler 클래스 테스트
    console.log('\n1. PageCrawler 클래스 테스트 (Playwright 전략)');
    const pageCrawler = new PageCrawler(browserManager, config, 'playwright');
    let result = await pageCrawler.fetchTotalPages();
    console.log(`Playwright 전략으로 조회한 총 페이지 수: ${result.totalPages}, 마지막 페이지 제품 수: ${result.lastPageProductCount}`);
    
    console.log('\nPlaywright 전략으로 첫 페이지 크롤링...');
    const page1Result = await pageCrawler.crawlPage(1, abortController.signal);
    console.log(`페이지 1에서 ${page1Result.rawProducts.length}개의 제품 발견`);
    
    // 2. 전략 전환 테스트
    console.log('\n2. Axios 전략으로 전환 테스트');
    await pageCrawler.switchCrawlerStrategy('axios');
    console.log(`현재 전략: ${pageCrawler.getCurrentStrategy()}`);
    
    result = await pageCrawler.fetchTotalPages();
    console.log(`Axios 전략으로 조회한 총 페이지 수: ${result.totalPages}, 마지막 페이지 제품 수: ${result.lastPageProductCount}`);
    
    console.log('\nAxios 전략으로 첫 페이지 크롤링...');
    const page1ResultAxios = await pageCrawler.crawlPage(1, abortController.signal);
    console.log(`페이지 1에서 ${page1ResultAxios.rawProducts.length}개의 제품 발견`);

    // 3. ProductListCollector 테스트
    console.log('\n3. ProductListCollector 테스트');
    const collector = new ProductListCollector(state, abortController, config, browserManager);
    console.log(`ProductListCollector 기본 전략: ${collector.getCurrentCrawlerStrategy()}`);
    
    // 전략 전환
    await collector.switchCrawlerStrategy('axios');
    console.log(`ProductListCollector 변경된 전략: ${collector.getCurrentCrawlerStrategy()}`);

    console.log('\n테스트 완료!');
    
  } catch (error) {
    console.error('테스트 중 오류 발생:', error);
  } finally {
    // 리소스 정리
    await browserManager.close();
    console.log('테스트 종료 - 브라우저 리소스 정리 완료');
  }
}

// 테스트 실행
testCrawlerStrategies().catch(console.error);
