import Debug from 'debug';
import crypto from 'node:crypto';

import { BaseScraper } from '../../base/BaseScraper';
import type { ScrapedData, SocialScrapeConfig } from '../../base/types';

const debug = Debug('lobechat:scrapers:twitter');

interface TwitterTweet {
  id: string;
  text: string;
  author_id: string;
  created_at: string;
  public_metrics?: {
    like_count: number;
    retweet_count: number;
    reply_count: number;
    quote_count: number;
  };
}

/**
 * Twitter/X API Scraper
 * 
 * Uses Twitter API v2 to fetch tweets based on queries
 */
export class TwitterScraper extends BaseScraper<SocialScrapeConfig> {
  private readonly apiBaseUrl = 'https://api.twitter.com/2';

  constructor() {
    super(
      'twitter',
      'twitter',
      {},
      {
        supportsAuth: true,
        supportsRateLimiting: true,
        maxConcurrency: 1,
      },
    );
  }

  protected async doScrape(config: SocialScrapeConfig): Promise<ScrapedData> {
    this.validateConfig(config);

    const bearerToken = config.credentials.accessToken || process.env.TWITTER_BEARER_TOKEN;
    if (!bearerToken) {
      throw new Error('Twitter bearer token is required');
    }

    debug(`Searching Twitter for: ${config.query}`);

    const tweets = await this.searchTweets(bearerToken, config.query!, config.maxItems || 10);

    // Aggregate tweet content
    const aggregatedContent = tweets
      .map((tweet) => {
        return [
          `Tweet ID: ${tweet.id}`,
          `Author: ${tweet.author_id}`,
          `Date: ${tweet.created_at}`,
          `Text: ${tweet.text}`,
          tweet.public_metrics
            ? `Engagement: ❤️ ${tweet.public_metrics.like_count} | 🔄 ${tweet.public_metrics.retweet_count} | 💬 ${tweet.public_metrics.reply_count}`
            : '',
        ]
          .filter(Boolean)
          .join('\n');
      })
      .join('\n\n---\n\n');

    const contentHash = crypto.createHash('sha256').update(aggregatedContent).digest('hex');

    return {
      id: this.generateId('twitter'),
      sourceType: 'twitter',
      source: `twitter-search:${config.query}`,
      content: aggregatedContent,
      title: `Twitter Search: ${config.query}`,
      contentType: 'text',
      rawData: {
        tweets,
        query: config.query,
      },
      metadata: {
        scrapedAt: Date.now(),
        contentLength: aggregatedContent.length,
        tweetCount: tweets.length,
        query: config.query,
        contentHash,
      },
      status: 'completed',
    };
  }

  /**
   * Search tweets using Twitter API v2
   */
  private async searchTweets(
    bearerToken: string,
    query: string,
    maxResults: number,
  ): Promise<TwitterTweet[]> {
    const url = new URL(`${this.apiBaseUrl}/tweets/search/recent`);
    url.searchParams.set('query', query);
    url.searchParams.set('max_results', Math.min(maxResults, 100).toString());
    url.searchParams.set('tweet.fields', 'author_id,created_at,public_metrics');

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Twitter API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    debug(`Found ${data.data?.length || 0} tweets`);
    return data.data || [];
  }

  /**
   * Validate configuration
   */
  protected validateConfig(config: SocialScrapeConfig): void {
    super.validateConfig(config);

    if (!config.query) {
      throw new Error('Query is required for Twitter scraping');
    }

    if (!config.credentials.accessToken && !process.env.TWITTER_BEARER_TOKEN) {
      throw new Error('Twitter bearer token is required (accessToken or TWITTER_BEARER_TOKEN)');
    }
  }
}

