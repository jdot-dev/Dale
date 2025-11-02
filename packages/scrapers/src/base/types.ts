/**
 * Core types for the scraper system
 */

/**
 * Source types supported by the scraper system
 */
export type SourceType = 'web' | 'twitter' | 'reddit' | 'discord' | 'mobile' | 'api' | 'rss';

/**
 * Scrape status
 */
export type ScrapeStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * Base configuration for all scrapers
 */
export interface BaseScrapeConfig {
  /** Unique identifier for the scrape job */
  id?: string;
  /** Source type */
  sourceType: SourceType;
  /** Maximum retries on failure */
  maxRetries?: number;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Custom metadata */
  metadata?: Record<string, any>;
}

/**
 * Web scraping configuration
 */
export interface WebScrapeConfig extends BaseScrapeConfig {
  sourceType: 'web';
  /** URL to scrape */
  url: string;
  /** Proxy configuration */
  proxy?: {
    server: string;
    username?: string;
    password?: string;
  };
  /** Custom JavaScript to extract data */
  extractorScript?: string;
  /** Wait for specific selector before scraping */
  waitForSelector?: string;
  /** Screenshots configuration */
  takeScreenshot?: boolean;
}

/**
 * Social media scraping configuration
 */
export interface SocialScrapeConfig extends BaseScrapeConfig {
  sourceType: 'twitter' | 'reddit' | 'discord';
  /** API credentials */
  credentials: {
    apiKey?: string;
    apiSecret?: string;
    accessToken?: string;
    refreshToken?: string;
  };
  /** Query or search terms */
  query?: string;
  /** Maximum number of items to fetch */
  maxItems?: number;
}

/**
 * Mobile scraping configuration
 */
export interface MobileScrapeConfig extends BaseScrapeConfig {
  sourceType: 'mobile';
  /** Device ID for ADB connection */
  deviceId: string;
  /** Package name of the app */
  packageName: string;
  /** Activity to launch */
  activity?: string;
}

/**
 * RSS feed scraping configuration
 */
export interface RSSFeedConfig extends BaseScrapeConfig {
  sourceType: 'rss';
  /** RSS feed URL */
  feedUrl: string;
  /** Maximum number of items to fetch */
  maxItems?: number;
}

/**
 * Union type of all scrape configurations
 */
export type ScrapeConfig =
  | WebScrapeConfig
  | SocialScrapeConfig
  | MobileScrapeConfig
  | RSSFeedConfig;

/**
 * Scraped data structure
 */
export interface ScrapedData<T = any> {
  /** Unique identifier */
  id: string;
  /** Source type */
  sourceType: SourceType;
  /** Original source URL or identifier */
  source: string;
  /** Scraped content */
  content: string;
  /** Title of the content */
  title?: string;
  /** Content type */
  contentType: 'text' | 'html' | 'json';
  /** Raw data (original format) */
  rawData?: T;
  /** Extracted metadata */
  metadata: {
    /** Timestamp when scraped */
    scrapedAt: number;
    /** Content length */
    contentLength: number;
    /** Language detected */
    language?: string;
    /** Author information */
    author?: string;
    /** Publication date */
    publishedAt?: number;
    /** Additional custom metadata */
    [key: string]: any;
  };
  /** S3 storage path (if uploaded) */
  s3Path?: string;
  /** Processing status */
  status: ScrapeStatus;
  /** Error information if failed */
  error?: {
    message: string;
    code?: string;
    stack?: string;
  };
}

/**
 * Scrape result
 */
export interface ScrapeResult {
  /** Scrape was successful */
  success: boolean;
  /** Scraped data if successful */
  data?: ScrapedData;
  /** Error information if failed */
  error?: {
    message: string;
    code?: string;
    retryable?: boolean;
  };
  /** Execution time in milliseconds */
  executionTime: number;
}

/**
 * Sentiment analysis result
 */
export interface SentimentResult {
  /** Overall sentiment */
  sentiment: 'positive' | 'negative' | 'neutral';
  /** Sentiment score (-1 to 1) */
  score: number;
  /** Confidence (0 to 1) */
  confidence: number;
  /** Detailed emotions */
  emotions?: {
    joy?: number;
    anger?: number;
    sadness?: number;
    fear?: number;
    surprise?: number;
    [key: string]: number | undefined;
  };
  /** Model used for analysis */
  model: string;
  /** Processing time in milliseconds */
  processingTime: number;
}

/**
 * Scraper lifecycle hooks
 */
export interface ScraperHooks {
  /** Called before scraping starts */
  onBeforeScrape?: (config: ScrapeConfig) => Promise<void> | void;
  /** Called after scraping completes */
  onAfterScrape?: (result: ScrapeResult) => Promise<void> | void;
  /** Called on scraping error */
  onError?: (error: Error, config: ScrapeConfig) => Promise<void> | void;
  /** Called before retry */
  onRetry?: (attempt: number, config: ScrapeConfig) => Promise<void> | void;
}

/**
 * Scraper capabilities
 */
export interface ScraperCapabilities {
  /** Supports JavaScript rendering */
  supportsJavaScript?: boolean;
  /** Supports proxy configuration */
  supportsProxy?: boolean;
  /** Supports authentication */
  supportsAuth?: boolean;
  /** Supports rate limiting */
  supportsRateLimiting?: boolean;
  /** Maximum concurrent requests */
  maxConcurrency?: number;
}

