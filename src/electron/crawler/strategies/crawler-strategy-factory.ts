/**
 * crawler-strategy-factory.ts
 * 크롤러 전략을 생성하는 팩토리 클래스
 */

import { BrowserManager } from '../browser/BrowserManager.js';
import { type CrawlerConfig } from '../core/config.js';
import { ICrawlerStrategy } from './crawler-strategy.js';
import { PlaywrightCrawlerStrategy } from './playwright-crawler.js';
import { AxiosCrawlerStrategy } from './axios-crawler.js';

/**
 * 크롤러 전략 유형
 */
export type CrawlerType = 'playwright' | 'axios';

/**
 * 크롤러 전략 팩토리 클래스
 */
export class CrawlerStrategyFactory {
  /**
   * 크롤러 전략 인스턴스 생성
   * @param type 전략 유형 ('playwright' 또는 'axios')
   * @param config 크롤러 설정
   * @param browserManager Playwright 전략에 필요한 브라우저 매니저 (optional)
   */
  static createStrategy(
    type: CrawlerType,
    config: CrawlerConfig,
    browserManager?: BrowserManager
  ): ICrawlerStrategy {
    switch (type) {
      case 'playwright':
        if (!browserManager) {
          throw new Error('BrowserManager is required for Playwright crawler strategy');
        }
        return new PlaywrightCrawlerStrategy(browserManager, config);
        
      case 'axios':
        return new AxiosCrawlerStrategy(config);
        
      default:
        throw new Error(`Unsupported crawler strategy type: ${type}`);
    }
  }
}
