import {
  PutObjectCommand,
  S3Client,
  type PutObjectCommandInput,
} from '@aws-sdk/client-s3';
import crypto from 'node:crypto';
import Debug from 'debug';
import { z } from 'zod';

import type { ScrapedData, SourceType } from '../base/types';

const debug = Debug('lobechat:scrapers:s3-uploader');

/**
 * S3 Configuration schema
 */
const S3ConfigSchema = z.object({
  accessKeyId: z.string().optional(),
  bucket: z.string(),
  enablePathStyle: z.boolean().default(false),
  endpoint: z.string().url().optional(),
  region: z.string().default('us-east-1'),
  secretAccessKey: z.string().optional(),
  setACL: z.boolean().default(true),
});

export type S3Config = z.infer<typeof S3ConfigSchema>;

/**
 * Storage path configuration
 */
interface StoragePathConfig {
  /** Base path for scraped data */
  basePath?: string;
  /** Whether to include timestamp in path */
  includeTimestamp?: boolean;
  /** Custom path generator */
  customPathGenerator?: (data: ScrapedData) => string;
}

/**
 * S3 Uploader for scraped data
 * 
 * Organizes data in S3 with the following hierarchy:
 * s3://bucket/scraped-data/
 * ├── twitter/           # Social media data
 * ├── reddit/
 * ├── web/               # Web scrapes
 * └── mobile/            # Mobile app data
 */
export class ScraperS3Storage {
  private readonly client: S3Client;
  private readonly config: S3Config;
  private readonly pathConfig: StoragePathConfig;

  constructor(config: S3Config, pathConfig: StoragePathConfig = {}) {
    this.config = S3ConfigSchema.parse(config);
    this.pathConfig = {
      basePath: pathConfig.basePath || 'scraped-data',
      includeTimestamp: pathConfig.includeTimestamp ?? true,
      customPathGenerator: pathConfig.customPathGenerator,
    };

    this.client = new S3Client({
      credentials: this.config.accessKeyId
        ? {
            accessKeyId: this.config.accessKeyId,
            secretAccessKey: this.config.secretAccessKey!,
          }
        : undefined,
      endpoint: this.config.endpoint,
      forcePathStyle: this.config.enablePathStyle,
      region: this.config.region,
    });

    debug('Initialized S3 storage', {
      bucket: this.config.bucket,
      region: this.config.region,
      basePath: this.pathConfig.basePath,
    });
  }

  /**
   * Store scraped data to S3
   */
  async storeScrapedData(data: ScrapedData): Promise<string> {
    const s3Key = this.generateStoragePath(data);
    const content = JSON.stringify(data, null, 2);

    await this.uploadToS3(s3Key, Buffer.from(content, 'utf-8'), {
      contentType: 'application/json',
      metadata: {
        sourceType: data.sourceType,
        scrapedAt: data.metadata.scrapedAt.toString(),
        contentLength: data.metadata.contentLength.toString(),
      },
    });

    debug('Stored scraped data', { s3Key, dataId: data.id });
    return s3Key;
  }

  /**
   * Store raw content (HTML, images, PDFs, etc.)
   */
  async storeRawContent(
    content: Buffer,
    metadata: {
      sourceType: SourceType;
      contentType?: string;
      filename?: string;
      source: string;
    },
  ): Promise<string> {
    const timestamp = Date.now();
    const hash = this.generateContentHash(content);
    const extension = this.getFileExtension(metadata.contentType, metadata.filename);
    
    const s3Key = `${this.pathConfig.basePath}/raw/${metadata.sourceType}/${this.formatTimestamp(timestamp)}/${hash}${extension}`;

    await this.uploadToS3(s3Key, content, {
      contentType: metadata.contentType || 'application/octet-stream',
      metadata: {
        sourceType: metadata.sourceType,
        source: metadata.source,
        originalFilename: metadata.filename || '',
      },
    });

    debug('Stored raw content', { s3Key, size: content.length });
    return s3Key;
  }

  /**
   * Store processed embeddings
   */
  async storeEmbeddings(
    embeddings: number[],
    metadata: {
      sourceId: string;
      model: string;
      chunkId?: string;
    },
  ): Promise<string> {
    const timestamp = Date.now();
    const s3Key = `${this.pathConfig.basePath}/processed/embeddings/${metadata.model}/${this.formatTimestamp(timestamp)}/${metadata.sourceId}.json`;

    const content = JSON.stringify({
      embeddings,
      metadata,
      createdAt: timestamp,
    }, null, 2);

    await this.uploadToS3(s3Key, Buffer.from(content, 'utf-8'), {
      contentType: 'application/json',
      metadata: {
        model: metadata.model,
        sourceId: metadata.sourceId,
      },
    });

    debug('Stored embeddings', { s3Key, vectorCount: embeddings.length });
    return s3Key;
  }

  /**
   * Store sentiment analysis results
   */
  async storeSentimentResults(
    sentiment: any,
    metadata: {
      documentId: string;
      model: string;
    },
  ): Promise<string> {
    const timestamp = Date.now();
    const s3Key = `${this.pathConfig.basePath}/processed/sentiment/${metadata.model}/${this.formatTimestamp(timestamp)}/${metadata.documentId}.json`;

    const content = JSON.stringify({
      sentiment,
      metadata,
      analyzedAt: timestamp,
    }, null, 2);

    await this.uploadToS3(s3Key, Buffer.from(content, 'utf-8'), {
      contentType: 'application/json',
      metadata: {
        model: metadata.model,
        documentId: metadata.documentId,
      },
    });

    debug('Stored sentiment results', { s3Key });
    return s3Key;
  }

  /**
   * Upload to S3
   */
  private async uploadToS3(
    key: string,
    content: Buffer,
    options: {
      contentType?: string;
      metadata?: Record<string, string>;
    } = {},
  ): Promise<void> {
    const params: PutObjectCommandInput = {
      Body: content,
      Bucket: this.config.bucket,
      ContentType: options.contentType || 'application/octet-stream',
      Key: key,
      Metadata: options.metadata,
    };

    // Set ACL if enabled
    if (this.config.setACL) {
      params.ACL = 'private';
    }

    const command = new PutObjectCommand(params);
    await this.client.send(command);
  }

  /**
   * Generate storage path for scraped data
   */
  private generateStoragePath(data: ScrapedData): string {
    // Use custom path generator if provided
    if (this.pathConfig.customPathGenerator) {
      return this.pathConfig.customPathGenerator(data);
    }

    const parts = [this.pathConfig.basePath, data.sourceType];

    // Add timestamp directory if enabled
    if (this.pathConfig.includeTimestamp) {
      parts.push(this.formatTimestamp(data.metadata.scrapedAt));
    }

    // Add data ID as filename
    parts.push(`${data.id}.json`);

    return parts.join('/');
  }

  /**
   * Format timestamp for directory structure (YYYY/MM/DD)
   */
  private formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}/${month}/${day}`;
  }

  /**
   * Generate content hash for deduplication
   */
  private generateContentHash(content: Buffer): string {
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
  }

  /**
   * Get file extension from content type or filename
   */
  private getFileExtension(contentType?: string, filename?: string): string {
    if (filename) {
      const match = filename.match(/\.([^.]+)$/);
      if (match) {
        return `.${match[1]}`;
      }
    }

    if (contentType) {
      const extensionMap: Record<string, string> = {
        'text/html': '.html',
        'application/pdf': '.pdf',
        'image/png': '.png',
        'image/jpeg': '.jpg',
        'image/gif': '.gif',
        'image/webp': '.webp',
        'text/plain': '.txt',
        'application/json': '.json',
      };
      return extensionMap[contentType] || '';
    }

    return '';
  }

  /**
   * Get S3 client for advanced operations
   */
  getClient(): S3Client {
    return this.client;
  }

  /**
   * Get bucket name
   */
  getBucket(): string {
    return this.config.bucket;
  }
}

/**
 * Create S3 storage instance from environment variables
 */
export const createScraperS3StorageFromEnv = (): ScraperS3Storage => {
  const config: S3Config = {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    bucket: process.env.S3_BUCKET || '',
    enablePathStyle: process.env.S3_ENABLE_PATH_STYLE === '1',
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION || 'us-east-1',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    setACL: process.env.S3_SET_ACL !== '0',
  };

  return new ScraperS3Storage(config, {
    basePath: process.env.SCRAPER_S3_PATH || 'scraped-data',
  });
};

