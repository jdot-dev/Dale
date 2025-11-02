import Debug from 'debug';
import crypto from 'node:crypto';

import { BaseScraper } from '../../base/BaseScraper';
import type { ScrapedData, SocialScrapeConfig } from '../../base/types';

const debug = Debug('lobechat:scrapers:discord');

interface DiscordMessage {
  id: string;
  content: string;
  author: {
    id: string;
    username: string;
  };
  timestamp: string;
  channel_id: string;
}

/**
 * Discord API Scraper
 * 
 * Fetches messages from Discord channels using Discord Bot API
 */
export class DiscordScraper extends BaseScraper<SocialScrapeConfig> {
  private readonly apiBaseUrl = 'https://discord.com/api/v10';

  constructor() {
    super(
      'discord',
      'discord',
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

    const botToken = config.credentials.accessToken || process.env.DISCORD_BOT_TOKEN;
    if (!botToken) {
      throw new Error('Discord bot token is required');
    }

    // Query should be in format: "channelId" or "channelId:searchTerm"
    const [channelId, searchTerm] = config.query!.split(':');

    debug(`Fetching Discord messages from channel: ${channelId}`);

    const messages = await this.fetchMessages(botToken, channelId, config.maxItems || 50);

    // Filter by search term if provided
    const filteredMessages = searchTerm
      ? messages.filter((msg) => msg.content.toLowerCase().includes(searchTerm.toLowerCase()))
      : messages;

    // Aggregate message content
    const aggregatedContent = filteredMessages
      .map((msg) => {
        return [
          `Message ID: ${msg.id}`,
          `Author: ${msg.author.username} (${msg.author.id})`,
          `Date: ${msg.timestamp}`,
          `Content: ${msg.content}`,
        ].join('\n');
      })
      .join('\n\n---\n\n');

    const contentHash = crypto.createHash('sha256').update(aggregatedContent).digest('hex');

    return {
      id: this.generateId('discord'),
      sourceType: 'discord',
      source: `discord-channel:${channelId}`,
      content: aggregatedContent,
      title: `Discord Channel: ${channelId}`,
      contentType: 'text',
      rawData: {
        messages: filteredMessages,
        channelId,
        searchTerm,
      },
      metadata: {
        scrapedAt: Date.now(),
        contentLength: aggregatedContent.length,
        messageCount: filteredMessages.length,
        channelId,
        contentHash,
      },
      status: 'completed',
    };
  }

  /**
   * Fetch messages from Discord channel
   */
  private async fetchMessages(
    botToken: string,
    channelId: string,
    limit: number,
  ): Promise<DiscordMessage[]> {
    const url = `${this.apiBaseUrl}/channels/${channelId}/messages?limit=${Math.min(limit, 100)}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bot ${botToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Discord API error: ${response.status} - ${errorText}`);
    }

    const messages = await response.json();

    debug(`Found ${messages.length} Discord messages`);
    return messages;
  }

  /**
   * Validate configuration
   */
  protected validateConfig(config: SocialScrapeConfig): void {
    super.validateConfig(config);

    if (!config.query) {
      throw new Error('Query is required for Discord scraping (format: channelId or channelId:searchTerm)');
    }

    if (!config.credentials.accessToken && !process.env.DISCORD_BOT_TOKEN) {
      throw new Error('Discord bot token is required (accessToken or DISCORD_BOT_TOKEN)');
    }
  }
}

