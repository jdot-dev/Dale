import Debug from 'debug';
import crypto from 'node:crypto';

import { BaseScraper } from '../../base/BaseScraper';
import type { RSSFeedConfig, ScrapedData } from '../../base/types';

const debug = Debug('lobechat:scrapers:rss');

interface RSSItem {
  title?: string;
  link?: string;
  description?: string;
  pubDate?: string;
  author?: string;
  content?: string;
  guid?: string;
}

/**
 * RSS Feed Scraper
 * 
 * Fetches and parses RSS feeds from news sites and blogs
 */
export class RSSFeedScraper extends BaseScraper<RSSFeedConfig> {
  constructor() {
    super('rss-feed', 'rss', {}, { supportsRateLimiting: true });
  }

  protected async doScrape(config: RSSFeedConfig): Promise<ScrapedData> {
    this.validateConfig(config);

    debug(`Fetching RSS feed: ${config.feedUrl}`);

    const response = await fetch(config.feedUrl, {
      headers: {
        'User-Agent': 'LobeChat/1.0 RSS Reader',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch RSS feed: ${response.statusText}`);
    }

    const xmlText = await response.text();
    const items = this.parseRSS(xmlText);

    // Limit items if specified
    const limitedItems = config.maxItems ? items.slice(0, config.maxItems) : items;

    // Aggregate content
    const aggregatedContent = limitedItems
      .map((item) => {
        const parts = [];
        if (item.title) parts.push(`Title: ${item.title}`);
        if (item.link) parts.push(`Link: ${item.link}`);
        if (item.description) parts.push(`Description: ${item.description}`);
        if (item.content) parts.push(`Content: ${item.content}`);
        if (item.pubDate) parts.push(`Published: ${item.pubDate}`);
        if (item.author) parts.push(`Author: ${item.author}`);
        return parts.join('\n');
      })
      .join('\n\n---\n\n');

    const contentHash = crypto.createHash('sha256').update(aggregatedContent).digest('hex');

    return {
      id: this.generateId('rss'),
      sourceType: 'rss',
      source: config.feedUrl,
      content: aggregatedContent,
      title: this.extractFeedTitle(xmlText),
      contentType: 'text',
      rawData: {
        items: limitedItems,
        xml: xmlText,
      },
      metadata: {
        scrapedAt: Date.now(),
        contentLength: aggregatedContent.length,
        itemCount: limitedItems.length,
        contentHash,
      },
      status: 'completed',
    };
  }

  /**
   * Parse RSS XML
   */
  private parseRSS(xml: string): RSSItem[] {
    const items: RSSItem[] = [];

    // Simple regex-based parsing (for production, consider using a proper XML parser)
    const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/gi);

    for (const match of itemMatches) {
      const itemXml = match[1];

      const item: RSSItem = {
        title: this.extractTag(itemXml, 'title'),
        link: this.extractTag(itemXml, 'link'),
        description: this.extractTag(itemXml, 'description'),
        pubDate: this.extractTag(itemXml, 'pubDate'),
        author: this.extractTag(itemXml, 'author') || this.extractTag(itemXml, 'dc:creator'),
        content: this.extractTag(itemXml, 'content:encoded'),
        guid: this.extractTag(itemXml, 'guid'),
      };

      items.push(item);
    }

    debug(`Parsed ${items.length} items from RSS feed`);
    return items;
  }

  /**
   * Extract feed title
   */
  private extractFeedTitle(xml: string): string | undefined {
    const channelMatch = xml.match(/<channel>([\s\S]*?)<\/channel>/i);
    if (channelMatch) {
      return this.extractTag(channelMatch[1], 'title');
    }
    return undefined;
  }

  /**
   * Extract content from XML tag
   */
  private extractTag(xml: string, tagName: string): string | undefined {
    const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
    const match = xml.match(regex);
    if (match) {
      // Decode HTML entities and clean up
      return this.decodeHTMLEntities(match[1].trim());
    }
    return undefined;
  }

  /**
   * Decode HTML entities
   */
  private decodeHTMLEntities(text: string): string {
    return text
      .replaceAll('&amp;', '&')
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&quot;', '"')
      .replaceAll('&#39;', "'")
      .replaceAll('<![CDATA[', '')
      .replaceAll(']]>', '');
  }

  /**
   * Validate configuration
   */
  protected validateConfig(config: RSSFeedConfig): void {
    super.validateConfig(config);

    if (!config.feedUrl) {
      throw new Error('Feed URL is required for RSS scraping');
    }

    try {
      new URL(config.feedUrl);
    } catch {
      throw new Error(`Invalid feed URL: ${config.feedUrl}`);
    }
  }
}

