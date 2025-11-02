# @lobechat/scrapers

Multi-source web scraping and data ingestion system for LobeChat.

## Features

- **Multi-Source Scraping**: Web (Playwright, Firecrawl), Social Media (Twitter, Reddit, Discord), Mobile (ADB)
- **Sentiment Analysis**: Multi-provider sentiment analysis with aggregation
- **S3 Storage**: Efficient storage of scraped data with organized hierarchy
- **Scheduling**: Cron-based scheduling with queue management
- **RAG Integration**: Direct integration with LobeChat's RAG pipeline

## Architecture

```
@lobechat/scrapers
├── base/              # Abstract base classes and interfaces
├── implementations/   # Concrete scraper implementations
├── processors/        # Data processing (sentiment, embeddings, storage)
└── scheduler/         # Job scheduling and queue management
```

## Usage

```typescript
import { PlaywrightScraper, ScraperRegistry } from '@lobechat/scrapers';

// Register a scraper
const registry = new ScraperRegistry();
registry.register('playwright', new PlaywrightScraper());

// Execute scraping
const scraper = registry.get('playwright');
const result = await scraper.scrape({
  url: 'https://example.com',
  extractorScript: '() => document.body.innerText',
});
```

## Development

```bash
# Run tests
pnpm test

# Type check
pnpm type-check
```

