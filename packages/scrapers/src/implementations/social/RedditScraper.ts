import Debug from 'debug';
import crypto from 'node:crypto';

import { BaseScraper } from '../../base/BaseScraper';
import type { ScrapedData, SocialScrapeConfig } from '../../base/types';

const debug = Debug('lobechat:scrapers:reddit');

interface RedditPost {
  id: string;
  title: string;
  selftext: string;
  author: string;
  created_utc: number;
  score: number;
  num_comments: number;
  url: string;
  subreddit: string;
}

/**
 * Reddit API Scraper
 * 
 * Fetches posts from Reddit using the public JSON API
 */
export class RedditScraper extends BaseScraper<SocialScrapeConfig> {
  private readonly apiBaseUrl = 'https://www.reddit.com';

  constructor() {
    super(
      'reddit',
      'reddit',
      {},
      {
        supportsAuth: false,
        supportsRateLimiting: true,
        maxConcurrency: 2,
      },
    );
  }

  protected async doScrape(config: SocialScrapeConfig): Promise<ScrapedData> {
    this.validateConfig(config);

    debug(`Searching Reddit for: ${config.query}`);

    const posts = await this.searchReddit(config.query!, config.maxItems || 25);

    // Aggregate post content
    const aggregatedContent = posts
      .map((post) => {
        return [
          `Title: ${post.title}`,
          `Subreddit: r/${post.subreddit}`,
          `Author: u/${post.author}`,
          `Score: ${post.score} | Comments: ${post.num_comments}`,
          `URL: ${post.url}`,
          `Date: ${new Date(post.created_utc * 1000).toISOString()}`,
          post.selftext ? `\nContent:\n${post.selftext}` : '',
        ]
          .filter(Boolean)
          .join('\n');
      })
      .join('\n\n---\n\n');

    const contentHash = crypto.createHash('sha256').update(aggregatedContent).digest('hex');

    return {
      id: this.generateId('reddit'),
      sourceType: 'reddit',
      source: `reddit-search:${config.query}`,
      content: aggregatedContent,
      title: `Reddit Search: ${config.query}`,
      contentType: 'text',
      rawData: {
        posts,
        query: config.query,
      },
      metadata: {
        scrapedAt: Date.now(),
        contentLength: aggregatedContent.length,
        postCount: posts.length,
        query: config.query,
        contentHash,
      },
      status: 'completed',
    };
  }

  /**
   * Search Reddit posts
   */
  private async searchReddit(query: string, limit: number): Promise<RedditPost[]> {
    const url = new URL(`${this.apiBaseUrl}/search.json`);
    url.searchParams.set('q', query);
    url.searchParams.set('limit', Math.min(limit, 100).toString());
    url.searchParams.set('sort', 'relevance');
    url.searchParams.set('t', 'week'); // time filter: week

    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'LobeChat/1.0 Reddit Scraper',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Reddit API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    const posts: RedditPost[] = data.data.children.map((child: any) => ({
      id: child.data.id,
      title: child.data.title,
      selftext: child.data.selftext || '',
      author: child.data.author,
      created_utc: child.data.created_utc,
      score: child.data.score,
      num_comments: child.data.num_comments,
      url: child.data.url,
      subreddit: child.data.subreddit,
    }));

    debug(`Found ${posts.length} Reddit posts`);
    return posts;
  }

  /**
   * Validate configuration
   */
  protected validateConfig(config: SocialScrapeConfig): void {
    super.validateConfig(config);

    if (!config.query) {
      throw new Error('Query is required for Reddit scraping');
    }
  }
}

