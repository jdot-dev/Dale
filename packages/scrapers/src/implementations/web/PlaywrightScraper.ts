import { chromium, type Browser, type Page } from 'playwright';
import Debug from 'debug';
import crypto from 'node:crypto';

import { BaseScraper } from '../../base/BaseScraper';
import type { ScrapedData, WebScrapeConfig } from '../../base/types';

const debug = Debug('lobechat:scrapers:playwright');

/**
 * Playwright-based web scraper with full browser automation
 * 
 * Features:
 * - Full JavaScript rendering
 * - Proxy support
 * - Screenshot capture
 * - Dynamic content handling
 * - Custom extractor scripts
 */
export class PlaywrightScraper extends BaseScraper<WebScrapeConfig> {
  private browser: Browser | null = null;

  constructor() {
    super(
      'playwright',
      'web',
      {},
      {
        supportsJavaScript: true,
        supportsProxy: true,
        supportsAuth: true,
        maxConcurrency: 5,
      },
    );
  }

  /**
   * Core scraping logic
   */
  protected async doScrape(config: WebScrapeConfig): Promise<ScrapedData> {
    this.validateConfig(config);

    const startTime = Date.now();
    let page: Page | null = null;

    try {
      // Launch browser with configuration
      this.browser = await this.launchBrowser(config);
      page = await this.browser.newPage();

      // Set viewport and user agent
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.setExtraHTTPHeaders({
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      });

      debug(`Navigating to ${config.url}`);

      // Navigate to URL
      await page.goto(config.url, {
        waitUntil: 'networkidle',
        timeout: config.timeout || 30000,
      });

      // Wait for specific selector if provided
      if (config.waitForSelector) {
        debug(`Waiting for selector: ${config.waitForSelector}`);
        await page.waitForSelector(config.waitForSelector, {
          timeout: 10000,
        });
      }

      // Extract data
      const extractedData = await this.extractContent(page, config);

      // Take screenshot if requested
      let screenshot: Buffer | undefined;
      if (config.takeScreenshot) {
        debug('Taking screenshot');
        screenshot = await page.screenshot({ fullPage: false });
      }

      // Get final URL (after redirects)
      const finalUrl = page.url();

      // Extract metadata
      const metadata = await this.extractMetadata(page);

      const content = extractedData.content;
      const contentHash = this.generateContentHash(content);

      const scrapedData: ScrapedData = {
        id: this.generateId('web'),
        sourceType: 'web',
        source: finalUrl,
        content,
        title: extractedData.title || metadata.title,
        contentType: 'text',
        rawData: {
          html: extractedData.html,
          screenshot: screenshot?.toString('base64'),
        },
        metadata: {
          scrapedAt: Date.now(),
          contentLength: content.length,
          language: metadata.language,
          author: metadata.author,
          publishedAt: metadata.publishedAt,
          description: metadata.description,
          contentHash,
          userAgent: await page.evaluate(() => navigator.userAgent),
          finalUrl,
        },
        status: 'completed',
      };

      debug(`Scraping completed in ${Date.now() - startTime}ms`);
      return scrapedData;
    } finally {
      // Cleanup
      if (page) {
        await page.close();
      }
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
    }
  }

  /**
   * Launch browser with configuration
   */
  private async launchBrowser(config: WebScrapeConfig): Promise<Browser> {
    const launchOptions: any = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
      ],
    };

    // Add proxy configuration if provided
    if (config.proxy) {
      debug(`Using proxy: ${config.proxy.server}`);
      launchOptions.proxy = {
        server: config.proxy.server,
        username: config.proxy.username,
        password: config.proxy.password,
      };
    }

    return chromium.launch(launchOptions);
  }

  /**
   * Extract content from page
   */
  private async extractContent(
    page: Page,
    config: WebScrapeConfig,
  ): Promise<{ content: string; title?: string; html: string }> {
    // If custom extractor script provided, use it
    if (config.extractorScript) {
      debug('Using custom extractor script');
      const customResult = await page.evaluate(config.extractorScript);
      
      const html = await page.content();
      const title = await page.title();

      return {
        content: typeof customResult === 'string' ? customResult : JSON.stringify(customResult),
        title,
        html,
      };
    }

    // Default extraction: get main content
    const result = await page.evaluate(() => {
      // Remove script, style, and other non-content elements
      const elementsToRemove = document.querySelectorAll(
        'script, style, nav, header, footer, aside, .advertisement, .ads',
      );
      elementsToRemove.forEach((el) => el.remove());

      // Try to find main content area
      const mainContent =
        document.querySelector('main') ||
        document.querySelector('article') ||
        document.querySelector('[role="main"]') ||
        document.body;

      return {
        content: mainContent?.innerText || '',
        title: document.title,
        html: document.documentElement.outerHTML,
      };
    });

    return result;
  }

  /**
   * Extract metadata from page
   */
  private async extractMetadata(page: Page): Promise<{
    title: string;
    description?: string;
    author?: string;
    publishedAt?: number;
    language?: string;
  }> {
    return page.evaluate(() => {
      const getMetaContent = (name: string): string | undefined => {
        const element =
          document.querySelector(`meta[name="${name}"]`) ||
          document.querySelector(`meta[property="${name}"]`) ||
          document.querySelector(`meta[property="og:${name}"]`);
        return element?.getAttribute('content') || undefined;
      };

      const getPublishedDate = (): number | undefined => {
        const dateStr =
          getMetaContent('article:published_time') ||
          getMetaContent('datePublished') ||
          getMetaContent('publishdate');

        if (dateStr) {
          const timestamp = Date.parse(dateStr);
          return isNaN(timestamp) ? undefined : timestamp;
        }
        return undefined;
      };

      return {
        title: document.title,
        description: getMetaContent('description'),
        author: getMetaContent('author'),
        publishedAt: getPublishedDate(),
        language: document.documentElement.lang || 'en',
      };
    });
  }

  /**
   * Generate content hash for deduplication
   */
  private generateContentHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Validate configuration
   */
  protected validateConfig(config: WebScrapeConfig): void {
    super.validateConfig(config);

    if (!config.url) {
      throw new Error('URL is required for web scraping');
    }

    try {
      new URL(config.url);
    } catch {
      throw new Error(`Invalid URL: ${config.url}`);
    }
  }

  /**
   * Cleanup browser instance
   */
  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      debug('Browser cleaned up');
    }
  }
}

