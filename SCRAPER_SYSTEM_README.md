# Multi-Source RAG Pipeline System

## Overview

This document describes the comprehensive multi-source scraper and RAG pipeline system implemented for Dale (LobeChat fork). The system enables ingestion of data from multiple sources (web, social media, mobile apps) into an S3-backed RAG pipeline with sentiment analysis capabilities.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Dale Agent Hub                               │
│  (Centralized AI Agent with ComfyUI & Workflow Integration)     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Multi-Source RAG Pipeline                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  Context     │  │  Sentiment   │  │  RAG Query   │          │
│  │  Engine      │  │  Analysis    │  │  Engine      │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Data Storage Layer                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  PostgreSQL  │  │  S3 Storage  │  │  Vector DB   │          │
│  │  (Metadata)  │  │  (Raw Data)  │  │ (Embeddings) │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Scraper & Scheduler Layer                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  Cron        │  │  Queue       │  │  Scrapers    │          │
│  │  Scheduler   │  │  Manager     │  │  (BullMQ)    │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Data Sources                                   │
│  ┌──────┐  ┌──────┐  ┌────────┐  ┌────────┐  ┌──────────┐    │
│  │ Web  │  │Twitter│  │ Reddit │  │Discord │  │ Mobile   │    │
│  │(Playwright)│  │  (API) │  │ (API)  │  │ (API)  │  │ (ADB)    │    │
│  └──────┘  └──────┘  └────────┘  └────────┘  └──────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## Components Implemented

### 1. Core Scraper Package (`packages/scrapers`)

#### Base Framework
- **`BaseScraper`**: Abstract base class with lifecycle hooks, retry logic, and error handling
- **`ScraperRegistry`**: Registry for managing scraper instances
- **`types.ts`**: Comprehensive type definitions for all scraper configurations

#### Scraper Implementations

##### Web Scrapers
- **`PlaywrightScraper`**: Full browser automation with:
  - Proxy support
  - Screenshot capture
  - Dynamic content handling
  - Custom JavaScript execution
  - Metadata extraction

- **`RSSFeedScraper`**: RSS/Atom feed parsing for news and blogs

##### Social Media Scrapers
- **`TwitterScraper`**: Twitter/X API v2 integration
  - Tweet search
  - Rate limiting
  - Public metrics

- **`RedditScraper`**: Reddit JSON API
  - Post search
  - Subreddit filtering
  - Score and engagement data

- **`DiscordScraper`**: Discord Bot API
  - Channel message fetching
  - Search filtering

##### Mobile Scraper
- **`ADBScraper`**: Android Debug Bridge integration
  - App data extraction
  - UI content scraping
  - Shared preferences access

#### Processors

##### S3Storage (`S3Uploader.ts`)
Organized storage hierarchy:
```
s3://bucket/
├── scraped-data/
│   ├── twitter/
│   ├── reddit/
│   ├── web/
│   └── mobile/
├── processed/
│   ├── embeddings/
│   └── sentiment/
└── raw/
    └── content/
```

Features:
- Automatic path generation
- Content hashing for deduplication
- Metadata tagging
- Multiple content types (JSON, HTML, images, PDFs)

##### Sentiment Analysis (`SentimentProcessor.ts`)
Multi-provider sentiment analysis:
- **HuggingFace**: `cardiffnlp/twitter-roberta-base-sentiment-latest`
- **OpenAI**: GPT-3.5-turbo sentiment analysis
- **Local**: Rule-based fallback

Aggregation strategies:
- Weighted (by confidence)
- Majority vote
- Simple average

Output:
- Sentiment: positive/negative/neutral
- Score: -1 to 1
- Confidence: 0 to 1
- Emotions: joy, anger, sadness, fear, surprise

#### Scheduler & Queue

##### CronScheduler (`CronScheduler.ts`)
- Cron expression validation
- Job enable/disable
- Job statistics
- Execution tracking

##### QueueManager (`QueueManager.ts`)
Powered by BullMQ:
- Redis-backed job queue
- Configurable concurrency
- Automatic retries with exponential backoff
- Job priority
- Job status tracking
- Failed job recovery

### 2. Database Schema

#### New Tables

##### `scraped_sources`
Configuration for scraping sources:
```sql
- id: varchar(30)
- source_type: text (twitter, reddit, web, mobile, etc.)
- source_url: text
- scrape_config: jsonb
- last_scraped_at: timestamp
- scrape_frequency: text (cron expression)
- is_active: boolean
- user_id: text
```

##### `sentiment_data`
Sentiment analysis results:
```sql
- id: uuid
- document_id: varchar(30)
- sentiment: text (positive, negative, neutral)
- sentiment_score: real (-1 to 1)
- confidence: real (0 to 1)
- emotions: jsonb
- model: text
- metadata: jsonb
```

##### `scraped_data_cache`
Content deduplication:
```sql
- id: uuid
- source_id: varchar(30)
- content_hash: text
- document_id: varchar(30)
- scraped_at: timestamp
- s3_path: text
- metadata: jsonb
```

### 3. Context Engine Integration

#### SentimentInjector
Injects aggregated sentiment data into agent context:
- Configurable time windows
- Sentiment filtering (positive/negative/neutral)
- Statistical summaries
- Distribution analysis

#### MultiSourceRAGInjector
Queries across all scraped sources:
- Vector similarity search
- Multi-source aggregation
- Configurable similarity threshold
- Source metadata inclusion

### 4. Environment Variables

New environment variables in `src/envs/scrapers.ts`:

```bash
# Scraper Configuration
SCRAPER_CONCURRENCY=5
SCRAPER_MAX_RETRIES=3
SCRAPER_S3_PATH=scraped-data

# Social Media APIs
TWITTER_BEARER_TOKEN=
REDDIT_CLIENT_ID=
REDDIT_CLIENT_SECRET=
DISCORD_BOT_TOKEN=

# Proxies
PROXY_ROTATION_ENABLED=false
PROXY_LIST=

# Mobile Scraping
ADB_DEVICE_IDS=

# Sentiment Analysis
SENTIMENT_MODELS=huggingface,openai
HUGGINGFACE_SENTIMENT_MODEL=cardiffnlp/twitter-roberta-base-sentiment-latest
HUGGINGFACE_API_KEY=

# Redis (Queue Management)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
```

## Usage Examples

### Basic Web Scraping

```typescript
import { PlaywrightScraper, ScraperRegistry } from '@lobechat/scrapers';

const registry = new ScraperRegistry();
registry.register('playwright', new PlaywrightScraper());

const scraper = registry.get('playwright');
const result = await scraper.scrape({
  sourceType: 'web',
  url: 'https://example.com',
  proxy: {
    server: 'http://proxy.example.com:8080',
  },
  takeScreenshot: true,
});

console.log(result);
```

### Social Media Scraping

```typescript
import { TwitterScraper } from '@lobechat/scrapers';

const scraper = new TwitterScraper();
const result = await scraper.scrape({
  sourceType: 'twitter',
  credentials: {
    accessToken: process.env.TWITTER_BEARER_TOKEN,
  },
  query: 'AI trends',
  maxItems: 50,
});
```

### Sentiment Analysis

```typescript
import { SentimentProcessor } from '@lobechat/scrapers';

const processor = new SentimentProcessor({
  enableHuggingFace: true,
  enableOpenAI: true,
  aggregationStrategy: 'weighted',
});

const sentiment = await processor.analyze(
  "This product is amazing! I love how easy it is to use.",
);

console.log(sentiment);
// {
//   sentiment: 'positive',
//   score: 0.89,
//   confidence: 0.94,
//   emotions: { joy: 0.85, ... },
//   model: 'aggregated:huggingface+openai'
// }
```

### Job Scheduling

```typescript
import { CronScheduler, QueueManager } from '@lobechat/scrapers';

// Create scheduler
const scheduler = new CronScheduler(async (job) => {
  console.log(`Executing job: ${job.id}`);
  // Execute scraping
});

// Schedule daily scraping
scheduler.scheduleJob({
  id: 'daily-twitter-scrape',
  name: 'Daily Twitter Trends',
  cronExpression: '0 9 * * *', // Every day at 9 AM
  config: {
    sourceType: 'twitter',
    query: 'trending topics',
  },
  enabled: true,
});

// Use queue for immediate jobs
const queue = new QueueManager(async (jobData) => {
  // Process scraping job
  return await executeScrape(jobData.config);
});

await queue.addJob({
  jobId: 'scrape-123',
  config: { sourceType: 'web', url: 'https://example.com' },
  priority: 1,
});
```

### S3 Storage

```typescript
import { ScraperS3Storage } from '@lobechat/scrapers';

const storage = new ScraperS3Storage({
  bucket: 'my-scraper-bucket',
  region: 'us-east-1',
  accessKeyId: process.env.S3_ACCESS_KEY_ID,
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
});

// Store scraped data
const s3Key = await storage.storeScrapedData(scrapedData);

// Store raw content
const rawKey = await storage.storeRawContent(htmlBuffer, {
  sourceType: 'web',
  contentType: 'text/html',
  source: 'https://example.com',
});
```

## Integration with Dale

### Context Engine Pipeline

```typescript
import { createPipeline } from '@lobechat/context-engine';
import { 
  SentimentInjector, 
  MultiSourceRAGInjector 
} from '@lobechat/context-engine';

const pipeline = createPipeline()
  .add(new SentimentInjector({
    enabled: true,
    maxRecords: 50,
    timeWindowDays: 7,
  }))
  .add(new MultiSourceRAGInjector({
    enabled: true,
    sources: ['twitter', 'reddit', 'web'],
    maxResultsPerSource: 5,
    similarityThreshold: 0.7,
  }))
  .add(/* other processors */);

const result = await pipeline.execute({
  messages: conversationMessages,
});
```

## Deployment

### Docker Setup

```dockerfile
# Add to existing Dockerfile
RUN apt-get update && apt-get install -y \
    android-tools-adb \
    chromium \
    && rm -rf /var/lib/apt/lists/*
```

### Infrastructure Requirements

- **AWS S3**: Primary storage for scraped data
- **PostgreSQL**: Metadata and embeddings
- **Redis**: Job queue (BullMQ)
- **AWS Lambda** (optional): Scheduled scraping jobs
- **AWS ECS** (optional): Continuous browser automation

### Scaling Considerations

1. **Horizontal Scaling**: Multiple scraper workers
2. **Queue Partitioning**: By source type
3. **S3 Lifecycle Policies**: Automatic archival
4. **Database Indexing**: Optimize vector searches
5. **Rate Limiting**: Per-source API limits

## Next Steps

### Recommended Implementations

1. **TRPC API Routes**: Create REST/TRPC endpoints for:
   - Source CRUD operations
   - Schedule management
   - Sentiment queries
   - Real-time scraping status

2. **Frontend Dashboard**: Build UI for:
   - Source configuration
   - Schedule management
   - Sentiment visualization
   - RAG data exploration

3. **ComfyUI Integration**: Create custom nodes for:
   - RAG queries
   - Sentiment filtering
   - Multi-source data aggregation

4. **Advanced Analytics**:
   - Trend detection
   - Anomaly detection
   - Topic modeling
   - Entity extraction

5. **Additional Scrapers**:
   - Telegram
   - Email (IMAP)
   - Slack
   - Microsoft Teams

## Testing

Run tests for individual packages:

```bash
# Scraper package tests
cd packages/scrapers
bunx vitest run --silent='passed-only'

# Context engine tests
cd packages/context-engine
bunx vitest run --silent='passed-only'
```

## Performance Benchmarks

Expected performance metrics:

- **Web Scraping**: 1-5 seconds per page (with Playwright)
- **Social Media API**: 0.5-2 seconds per request
- **Sentiment Analysis**: 0.1-1 second per text (depending on provider)
- **S3 Upload**: 0.1-0.5 seconds per file
- **Queue Processing**: 100-500 jobs/minute (depending on concurrency)

## Security Considerations

1. **API Keys**: Store securely in environment variables
2. **Rate Limiting**: Implement per-source rate limits
3. **Content Validation**: Sanitize scraped content
4. **Access Control**: User-based source permissions
5. **Data Privacy**: Comply with GDPR/CCPA

## License

Follows LobeChat's licensing terms.

## Support

For issues or questions:
1. Check existing documentation
2. Review code examples
3. Open GitHub issue

---

**Status**: ✅ Core system implemented and ready for production use
**Last Updated**: 2025-11-02

