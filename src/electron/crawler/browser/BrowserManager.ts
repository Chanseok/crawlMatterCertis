/**
 * BrowserManager.ts
 * 브라우저 인스턴스 생명주기를 관리하는 클래스
 */
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-chromium';
import { debugLog } from '../../util.js';
import type { CrawlerConfig } from '../../../../types.d.ts';

// It's good practice to define user agent strings or import them if they are many.
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99.0.4844.51 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.3 Safari/605.1.15',
  // Add more user agents if needed
];

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private readonly config: CrawlerConfig;

  constructor(config: CrawlerConfig) {
    this.config = config;
  }

  /**
   * Initializes the browser instance.
   */
  private async initializeBrowserInternal(): Promise<void> {
    if (this.browser && this.browser.isConnected()) {
      debugLog('[BrowserManager] Browser is already initialized and connected.');
      return;
    }
    // Attempt to close any existing browser instance before creating a new one
    if (this.browser) {
      debugLog('[BrowserManager] Closing existing browser instance before re-initializing.');
      await this.browser.close().catch(e => debugLog('[BrowserManager] Error closing existing browser:', e));
      this.browser = null;
    }

    const headless = this.config.headlessBrowser ?? true;
    debugLog(`[BrowserManager] Initializing new browser instance (headless: ${headless})...`);
    try {
      this.browser = await chromium.launch({ headless });
      debugLog('[BrowserManager] New browser instance initialized.');
    } catch (error) {
      debugLog('[BrowserManager] Failed to initialize browser instance:', error);
      this.browser = null; // Ensure browser is null if launch fails
      throw new Error(`Failed to initialize browser: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Initializes a new browser context.
   * Ensures the browser is initialized first.
   */
  private async initializeContextInternal(): Promise<void> {
    if (!this.browser || !this.browser.isConnected()) {
      debugLog('[BrowserManager] Browser not available or not connected. Initializing browser first.');
      await this.initializeBrowserInternal();
      if (!this.browser) { // Check again after attempt to initialize
        throw new Error('[BrowserManager] Browser failed to initialize. Cannot create context.');
      }
    }

    // Close existing context if any, before creating a new one
    if (this.context) {
      debugLog('[BrowserManager] Closing existing browser context before creating a new one.');
      await this.context.close().catch(e => debugLog('[BrowserManager] Error closing existing context:', e));
      this.context = null;
    }
    
    debugLog('[BrowserManager] Creating new browser context...');
    try {
      this.context = await this.browser.newContext({
        userAgent: getRandomUserAgent(),
        // Consider other context options from your config if necessary
        // e.g., viewport, locale, permissions, etc.
      });
      debugLog('[BrowserManager] New browser context created.');
    } catch (error) {
      debugLog('[BrowserManager] Failed to create new browser context:', error);
      this.context = null; // Ensure context is null if creation fails
      throw new Error(`Failed to create browser context: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 브라우저 및 컨텍스트 초기화
   */
  public async initialize(): Promise<void> {
    debugLog('[BrowserManager] Full initialization process started.');
    if (await this.isValid()) {
      debugLog('[BrowserManager] Browser and context are already valid. Skipping initialization.');
      return;
    }

    // Ensure any old resources are cleaned up before starting fresh.
    // This is more robust than relying on initializeBrowserInternal/initializeContextInternal to clean up.
    await this.close(); 

    try {
      await this.initializeBrowserInternal();
      await this.initializeContextInternal();
      debugLog('[BrowserManager] Browser and context successfully initialized.');
    } catch (error) {
      debugLog('[BrowserManager] Error during full initialization process:', error);
      await this.close(); // Ensure cleanup if any part of initialization fails
      throw error; // Re-throw the error to be handled by the caller
    }
  }

  /**
   * Cleans up the current browser context and initializes a new one.
   * This is useful when a fresh context is needed without restarting the entire browser.
   */
  public async forceRefreshContext(): Promise<void> {
    debugLog('[BrowserManager] Forcing browser context refresh...');
    try {
      // Ensure browser is running, initialize if not.
      if (!this.browser || !this.browser.isConnected()) {
        debugLog('[BrowserManager] Browser not initialized or connected. Running full initialization.');
        await this.initialize(); // This will set up both browser and a new context.
      } else {
        // If browser is fine, just refresh the context.
        await this.initializeContextInternal();
      }
      debugLog('[BrowserManager] Browser context refreshed successfully.');
    } catch (error) {
      debugLog('[BrowserManager] Error during force context refresh:', error);
      // Attempt a full cleanup and re-initialization as a recovery measure.
      await this.close();
      await this.initialize(); // Try to get back to a good state.
      // If initialize also fails, it will throw, which is appropriate.
    }
  }

  /**
   * 현재 브라우저와 컨텍스트가 유효한지 확인
   */
  public async isValid(): Promise<boolean> {
    if (!this.browser || !this.browser.isConnected()) {
      debugLog('[BrowserManager] isValid check: Browser is not initialized or not connected.');
      return false;
    }

    if (!this.context) {
      debugLog('[BrowserManager] isValid check: Context is not initialized.');
      return false;
    }

    try {
      // A more robust check for context validity might be to check its pages or a specific property.
      // For Playwright, a context is generally valid if it hasn't been closed and the browser is connected.
      // The `pages()` call is a reasonable check.
      await this.context.pages(); 
      // debugLog('[BrowserManager] isValid check: Browser and context appear to be valid.');
      return true;
    } catch (e) {
      // This catch block means the context.pages() call failed, indicating an issue.
      debugLog('[BrowserManager] isValid check: Browser context seems invalid or closed:', e);
      return false;
    }
  }

  /**
   * 새 페이지 생성
   */
  public async newPage(): Promise<Page> {
    debugLog('[BrowserManager] Attempting to create a new page...');
    if (!await this.isValid()) {
      debugLog('[BrowserManager] Browser/context not valid. Attempting re-initialization before creating page.');
      await this.initialize(); // This ensures both browser and context are fresh if they weren't valid.
    }

    if (!this.context) { // Should be extremely rare if initialize() worked.
      debugLog('[BrowserManager] Critical error: Context is null even after initialization attempt.');
      throw new Error('[BrowserManager] Browser context is not initialized, cannot create page.');
    }

    try {
      const page = await this.context.newPage();
      debugLog('[BrowserManager] New page created successfully.');
      return page;
    } catch (error) {
      debugLog('[BrowserManager] Failed to create new page:', error);
      // If newPage fails, the context might be corrupted. Try to refresh it.
      await this.forceRefreshContext();
      // Then try creating a page one more time. If it fails again, let the error propagate.
      if (!this.context) { // Check context again after forceRefresh
         throw new Error('[BrowserManager] Context is null after attempting to refresh and create page.');
      }
      debugLog('[BrowserManager] Retrying newPage creation after context refresh...');
      return await this.context.newPage();
    }
  }

  /**
   * 새 페이지 생성 (newPage의 별칭, 호환성을 위함)
   */
  public async getPage(): Promise<Page> {
    // debugLog('[BrowserManager] getPage called (alias for newPage).');
    return this.newPage();
  }

  /**
   * 페이지 닫기
   */
  public async closePage(page: Page): Promise<void> {
    if (page && !page.isClosed()) {
      // debugLog('[BrowserManager] Attempting to close a page.');
      try {
        await page.close();
        // debugLog('[BrowserManager] Page closed successfully.');
      } catch (e) {
        debugLog('[BrowserManager] Error closing page:', e);
        // Depending on the error, you might not need to do anything further.
        // If page close errors are critical, consider further actions.
      }
    } else {
      // debugLog('[BrowserManager] Page already closed or not provided.');
    }
  }

  /**
   * 모든 리소스 정리 (close의 별칭, 호환성을 위함)
   */
  public async cleanupResources(): Promise<void> {
    debugLog('[BrowserManager] cleanupResources called (alias for close).');
    await this.close();
  }

  /**
   * 브라우저 및 컨텍스트 종료
   */
  public async close(): Promise<void> {
    debugLog('[BrowserManager] Closing browser resources (context and browser).');
    if (this.context) {
      try {
        await this.context.close();
        debugLog('[BrowserManager] Browser context closed successfully.');
      } catch (e) {
        debugLog('[BrowserManager] Error while closing context:', e);
      } finally {
        this.context = null;
      }
    } else {
      debugLog('[BrowserManager] No active context to close.');
    }

    if (this.browser && this.browser.isConnected()) {
      try {
        await this.browser.close();
        debugLog('[BrowserManager] Browser closed successfully.');
      } catch (e) {
        debugLog('[BrowserManager] Error while closing browser:', e);
      } finally {
        this.browser = null;
      }
    } else {
      debugLog('[BrowserManager] No active or connected browser to close.');
    }
    // Ensure they are nullified even if already null or if close threw an error that was caught.
    this.browser = null;
    this.context = null;
    debugLog('[BrowserManager] All browser resources have been addressed for closure.');
  }
}