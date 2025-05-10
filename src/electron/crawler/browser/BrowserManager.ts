/**
 * BrowserManager.ts
 * 브라우저 인스턴스 생명주기를 관리하는 클래스
 */
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-chromium';
import { debugLog } from '../../util.js';
import type { CrawlerConfig } from '../../../../types.d.ts';

export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private readonly config: CrawlerConfig;

  constructor(config: CrawlerConfig) {
    this.config = config;
  }

  /**
   * 브라우저 및 컨텍스트 초기화
   */
  public async initialize(): Promise<void> {
    if (await this.isValid()) {
      return;
    }

    await this.close();

    const headless = this.config.headlessBrowser ?? true;
    debugLog(`[BrowserManager] Initializing browser (headless: ${headless})...`);
    
    try {
      this.browser = await chromium.launch({ headless });
      this.context = await this.browser.newContext();
      debugLog('[BrowserManager] Browser and context initialized.');
    } catch (error) {
      debugLog('[BrowserManager] Failed to initialize browser:', error);
      await this.close();
      throw new Error(`Failed to initialize browser: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 현재 브라우저와 컨텍스트가 유효한지 확인
   */
  public async isValid(): Promise<boolean> {
    if (!this.browser || !this.browser.isConnected()) {
      return false;
    }

    if (!this.context) {
      return false;
    }

    try {
      await this.context.pages();
      return true;
    } catch (e) {
      debugLog('[BrowserManager] Browser context seems invalid:', e);
      return false;
    }
  }

  /**
   * 새 페이지 생성
   */
  public async newPage(): Promise<Page> {
    if (!await this.isValid()) {
      await this.initialize();
    }

    if (!this.context) {
      throw new Error('[BrowserManager] Browser context is not initialized.');
    }

    return await this.context.newPage();
  }

  /**
   * 새 페이지 생성 (newPage의 별칭, 호환성을 위함)
   */
  public async getPage(): Promise<Page> {
    return this.newPage();
  }

  /**
   * 페이지 닫기
   */
  public async closePage(page: Page): Promise<void> {
    if (page && !page.isClosed()) {
      try {
        await page.close();
        // debugLog('[BrowserManager] Page closed.');
      } catch (e) {
        debugLog('[BrowserManager] Error closing page:', e);
      }
    }
  }

  /**
   * 모든 리소스 정리 (close의 별칭, 호환성을 위함)
   */
  public async cleanupResources(): Promise<void> {
    await this.close();
  }

  /**
   * 브라우저 및 컨텍스트 종료
   */
  public async close(): Promise<void> {
    try {
      if (this.context) {
        await this.context.close();
        this.context = null;
        debugLog('[BrowserManager] Browser context closed.');
      }
    } catch (e) {
      debugLog('[BrowserManager] Error while closing context:', e);
    }

    try {
      if (this.browser && this.browser.isConnected()) {
        await this.browser.close();
        this.browser = null;
        debugLog('[BrowserManager] Browser closed.');
      }
    } catch (e) {
      debugLog('[BrowserManager] Error while closing browser:', e);
    }

    this.browser = null;
    this.context = null;
  }
}