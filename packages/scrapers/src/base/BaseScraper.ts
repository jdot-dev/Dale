import Debug from 'debug';

import type {
  ScrapeConfig,
  ScrapeResult,
  ScrapedData,
  ScraperCapabilities,
  ScraperHooks,
  SourceType,
} from './types';

const debug = Debug('lobechat:scrapers:base');

/**
 * Abstract base class for all scrapers
 * 
 * Provides common functionality including:
 * - Lifecycle hooks
 * - Retry logic
 * - Error handling
 * - Timeout management
 */
export abstract class BaseScraper<TConfig extends ScrapeConfig = ScrapeConfig> {
  protected readonly name: string;
  protected readonly sourceType: SourceType;
  protected readonly hooks: ScraperHooks;
  protected readonly capabilities: ScraperCapabilities;

  constructor(
    name: string,
    sourceType: SourceType,
    hooks: ScraperHooks = {},
    capabilities: ScraperCapabilities = {},
  ) {
    this.name = name;
    this.sourceType = sourceType;
    this.hooks = hooks;
    this.capabilities = capabilities;
  }

  /**
   * Main entry point for scraping
   * Handles lifecycle, retries, and error management
   */
  async scrape(config: TConfig): Promise<ScrapeResult> {
    const startTime = Date.now();
    const maxRetries = config.maxRetries ?? 3;
    let lastError: Error | undefined;

    debug(`Starting scrape for ${this.name}`, { config });

    try {
      // Call before hook
      await this.hooks.onBeforeScrape?.(config);

      // Attempt scraping with retries
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          if (attempt > 0) {
            await this.hooks.onRetry?.(attempt, config);
            debug(`Retry attempt ${attempt}/${maxRetries}`);
          }

          // Execute actual scraping logic
          const data = await this.executeWithTimeout(config);

          // Call after hook
          const result: ScrapeResult = {
            success: true,
            data,
            executionTime: Date.now() - startTime,
          };

          await this.hooks.onAfterScrape?.(result);

          debug(`Scrape completed successfully`, { executionTime: result.executionTime });
          return result;
        } catch (error) {
          lastError = error as Error;
          debug(`Scrape attempt ${attempt} failed:`, error);

          // Check if error is retryable
          if (!this.isRetryableError(error as Error)) {
            break;
          }

          // Wait before retry (exponential backoff)
          if (attempt < maxRetries) {
            await this.sleep(Math.pow(2, attempt) * 1000);
          }
        }
      }

      // All retries exhausted
      throw lastError || new Error('Scraping failed after all retries');
    } catch (error) {
      const err = error as Error;
      await this.hooks.onError?.(err, config);

      debug(`Scrape failed:`, error);

      return {
        success: false,
        error: {
          message: err.message,
          code: (err as any).code,
          retryable: this.isRetryableError(err),
        },
        executionTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute scraping with timeout
   */
  private async executeWithTimeout(config: TConfig): Promise<ScrapedData> {
    const timeout = config.timeout ?? 30000; // 30 seconds default

    return Promise.race([
      this.doScrape(config),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Scraping timeout')), timeout),
      ),
    ]);
  }

  /**
   * Abstract method to be implemented by concrete scrapers
   * Contains the actual scraping logic
   */
  protected abstract doScrape(config: TConfig): Promise<ScrapedData>;

  /**
   * Validate configuration before scraping
   */
  protected validateConfig(config: TConfig): void {
    if (!config.sourceType) {
      throw new Error('Source type is required');
    }

    if (config.sourceType !== this.sourceType) {
      throw new Error(
        `Invalid source type: expected ${this.sourceType}, got ${config.sourceType}`,
      );
    }
  }

  /**
   * Generate unique ID for scraped data
   */
  protected generateId(prefix = 'scrape'): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }

  /**
   * Check if an error is retryable
   */
  protected isRetryableError(error: Error): boolean {
    const retryableErrors = [
      'ETIMEDOUT',
      'ECONNRESET',
      'ENOTFOUND',
      'ECONNREFUSED',
      'timeout',
      'network',
      'rate limit',
    ];

    const errorMessage = error.message.toLowerCase();
    const errorCode = (error as any).code?.toLowerCase();

    return retryableErrors.some(
      (retryable) => errorMessage.includes(retryable) || errorCode === retryable,
    );
  }

  /**
   * Sleep utility for retry delays
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get scraper information
   */
  getInfo() {
    return {
      name: this.name,
      sourceType: this.sourceType,
      capabilities: this.capabilities,
    };
  }

  /**
   * Check if scraper supports a specific capability
   */
  supportsCapability(capability: keyof ScraperCapabilities): boolean {
    return Boolean(this.capabilities[capability]);
  }
}

