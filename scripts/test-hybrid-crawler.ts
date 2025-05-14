/**
 * test-hybrid-crawler.ts
 * 하이브리드 크롤링 전략을 테스트하기 위한 스크립트
 */

import { ProductDetailCollector } from '../src/electron/crawler/tasks/productDetail';
import { CrawlerState } from '../src/electron/crawler/core/CrawlerState';
import { BrowserManager } from '../src/electron/crawler/browser/BrowserManager';
import type { CrawlerConfig, Product } from '../types';

async function testHybridCrawlerStrategy() {
  console.log('==== 하이브리드 크롤링 전략 테스트 시작 ====');
  
  // 테스트를 위한 구성 설정
  const config: CrawlerConfig = {
    baseUrl: 'https://csa-iot.org/all_products/',
    matterFilterUrl: 'https://csa-iot.org/csa_product/?ps=matter',
    pageTimeoutMs: 60000,
    productDetailTimeoutMs: 30000,
    initialConcurrency: 1,
    detailConcurrency: 2,
    retryConcurrency: 1,
    minRequestDelayMs: 500,
    maxRequestDelayMs: 2000,
    productsPerPage: 12,
    retryStart: 1,
    retryMax: 3,
    autoAddToLocalDB: true,
    cacheTtlMs: 3600000,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    // 하이브리드 전략 설정
    useHybridStrategy: true,
    adaptiveConcurrency: true,
    baseRetryDelayMs: 1000,
    maxRetryDelayMs: 10000,
    axiosTimeoutMs: 20000
  };
  
  // 테스트용 제품 샘플
  const sampleProducts: Product[] = [
    {
      url: 'https://csa-iot.org/csa_product/ai-smart-light-bulb/',
      manufacturer: 'ACME',
      model: 'AI Smart Light Bulb',
      certificateId: 'CSA-123456',
      pageId: 1,
      indexInPage: 1
    },
    {
      url: 'https://csa-iot.org/csa_product/connected-thermostat/',
      manufacturer: 'Smart Home',
      model: 'Connected Thermostat',
      certificateId: 'CSA-234567',
      pageId: 1,
      indexInPage: 2
    }
  ];
  
  const abortController = new AbortController();
  const state = new CrawlerState();
  
  try {
    console.log('브라우저 매니저 초기화 중...');
    const browserManager = new BrowserManager();
    await browserManager.initialize(config);
    
    console.log('ProductDetailCollector 초기화 중...');
    const collector = new ProductDetailCollector(
      state,
      abortController,
      config,
      browserManager
    );
    
    console.log(`${sampleProducts.length}개의 제품 상세 정보 수집 시작...`);
    const results = await collector.collect(sampleProducts);
    
    console.log('==== 결과 ====');
    console.log(`성공적으로 수집한 제품 수: ${results.length}`);
    results.forEach((product, index) => {
      console.log(`[${index + 1}] ${product.manufacturer} - ${product.model}`);
      console.log(`- 인증 ID: ${product.certificateId}`);
      console.log(`- 기기 유형: ${product.deviceType}`);
      console.log('');
    });
    
    await browserManager.close();
  } catch (error) {
    console.error('테스트 중 오류 발생:', error);
  } finally {
    console.log('==== 하이브리드 크롤링 전략 테스트 종료 ====');
  }
}

// 자동 실행 또는 CLI 인자로 실행 여부 확인
if (process.argv[1].includes('test-hybrid-crawler.ts')) {
  console.log('테스트 스크립트 직접 실행...');
  testHybridCrawlerStrategy().catch(error => {
    console.error('=== 테스트 실행 중 오류 발생 ===', error);
    process.exit(1);
  });
}
