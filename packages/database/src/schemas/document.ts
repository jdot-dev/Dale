/* eslint-disable sort-keys-fix/sort-keys-fix  */
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';

import { LobeDocumentPage } from '@/types/document';

import { idGenerator } from '../utils/idGenerator';
import { createdAt, timestamps } from './_helpers';
import { files } from './file';
import { chunks } from './rag';
import { users } from './user';

/**
 * 文档表 - 存储文件内容或网页搜索结果
 */
export const documents = pgTable(
  'documents',
  {
    id: varchar('id', { length: 30 })
      .$defaultFn(() => idGenerator('documents', 16))
      .primaryKey(),

    // 基本信息
    title: text('title'),
    content: text('content'),
    fileType: varchar('file_type', { length: 255 }).notNull(),
    filename: text('filename'),

    // 统计信息
    totalCharCount: integer('total_char_count').notNull(),
    totalLineCount: integer('total_line_count').notNull(),

    // 元数据
    metadata: jsonb('metadata').$type<Record<string, any>>(),

    // 页面/块数据
    pages: jsonb('pages').$type<LobeDocumentPage[]>(),

    // 来源类型
    sourceType: text('source_type', { enum: ['file', 'web', 'api'] }).notNull(),
    source: text('source').notNull(), // 文件路径或网页URL

    // 关联文件（可选）
    fileId: text('file_id').references(() => files.id, { onDelete: 'set null' }),

    // 用户关联
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    clientId: text('client_id'),

    editorData: jsonb('editor_data').$type<Record<string, any>>(),

    // 时间戳
    ...timestamps,
  },
  (table) => [
    index('documents_source_idx').on(table.source),
    index('documents_file_type_idx').on(table.fileType),
    index('documents_file_id_idx').on(table.fileId),
    uniqueIndex('documents_client_id_user_id_unique').on(table.clientId, table.userId),
  ],
);

export type NewDocument = typeof documents.$inferInsert;
export type DocumentItem = typeof documents.$inferSelect;
export const insertDocumentSchema = createInsertSchema(documents);

/**
 * 文档块表 - 将文档内容分割成块并关联到 chunks 表，用于向量检索
 * 注意：此表可选，如果已经使用 pages 字段存储了文档块，可以不需要此表
 */
export const documentChunks = pgTable(
  'document_chunks',
  {
    documentId: varchar('document_id', { length: 30 })
      .references(() => documents.id, { onDelete: 'cascade' })
      .notNull(),

    chunkId: uuid('chunk_id')
      .references(() => chunks.id, { onDelete: 'cascade' })
      .notNull(),

    pageIndex: integer('page_index'),

    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),

    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.documentId, t.chunkId] })],
);

export type NewDocumentChunk = typeof documentChunks.$inferInsert;
export type DocumentChunkItem = typeof documentChunks.$inferSelect;

/**
 * Scraped sources table - Configuration for data scraping sources
 */
export const scrapedSources = pgTable(
  'scraped_sources',
  {
    id: varchar('id', { length: 30 })
      .$defaultFn(() => idGenerator('scraped_sources', 16))
      .primaryKey(),

    // Source configuration
    sourceType: text('source_type').notNull(), // 'web', 'twitter', 'reddit', 'discord', 'mobile', 'rss'
    sourceUrl: text('source_url').notNull(),
    scrapeConfig: jsonb('scrape_config').$type<Record<string, any>>(),

    // Scraping schedule
    lastScrapedAt: timestamp('last_scraped_at'),
    scrapeFrequency: text('scrape_frequency'), // cron expression
    isActive: boolean('is_active').default(true).notNull(),

    // User association
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),

    // Timestamps
    ...timestamps,
  },
  (table) => [
    index('scraped_sources_user_id_idx').on(table.userId),
    index('scraped_sources_source_type_idx').on(table.sourceType),
    index('scraped_sources_is_active_idx').on(table.isActive),
    index('scraped_sources_last_scraped_at_idx').on(table.lastScrapedAt),
  ],
);

export type NewScrapedSource = typeof scrapedSources.$inferInsert;
export type ScrapedSourceItem = typeof scrapedSources.$inferSelect;

/**
 * Sentiment data table - Store sentiment analysis results
 */
export const sentimentData = pgTable(
  'sentiment_data',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    // Associated document
    documentId: varchar('document_id', { length: 30 }).references(() => documents.id, {
      onDelete: 'cascade',
    }),

    // Sentiment results
    sentiment: text('sentiment').notNull(), // 'positive', 'negative', 'neutral'
    sentimentScore: real('sentiment_score').notNull(), // -1 to 1
    confidence: real('confidence').notNull(), // 0 to 1

    // Detailed emotions
    emotions: jsonb('emotions').$type<Record<string, number>>(),

    // Analysis metadata
    model: text('model').notNull(), // which AI model analyzed
    metadata: jsonb('metadata').$type<Record<string, any>>(),

    // Timestamps
    ...timestamps,
  },
  (table) => [
    index('sentiment_data_document_id_idx').on(table.documentId),
    index('sentiment_data_sentiment_idx').on(table.sentiment),
    index('sentiment_data_created_at_idx').on(table.createdAt),
  ],
);

export type NewSentimentData = typeof sentimentData.$inferInsert;
export type SentimentDataItem = typeof sentimentData.$inferSelect;

/**
 * Scraped data cache table - Track scraped content for deduplication
 */
export const scrapedDataCache = pgTable(
  'scraped_data_cache',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    // Source reference
    sourceId: varchar('source_id', { length: 30 })
      .references(() => scrapedSources.id, { onDelete: 'cascade' })
      .notNull(),

    // Content identification
    contentHash: text('content_hash').notNull(),

    // Associated document (optional)
    documentId: varchar('document_id', { length: 30 }).references(() => documents.id, {
      onDelete: 'set null',
    }),

    // Storage
    scrapedAt: timestamp('scraped_at').defaultNow().notNull(),
    s3Path: text('s3_path'),

    // Additional metadata
    metadata: jsonb('metadata').$type<Record<string, any>>(),
  },
  (table) => [
    index('scraped_data_cache_source_id_idx').on(table.sourceId),
    index('scraped_data_cache_content_hash_idx').on(table.contentHash),
    index('scraped_data_cache_document_id_idx').on(table.documentId),
    index('scraped_data_cache_scraped_at_idx').on(table.scrapedAt),
    uniqueIndex('scraped_data_cache_source_content_unique').on(table.sourceId, table.contentHash),
  ],
);

export type NewScrapedDataCache = typeof scrapedDataCache.$inferInsert;
export type ScrapedDataCacheItem = typeof scrapedDataCache.$inferSelect;