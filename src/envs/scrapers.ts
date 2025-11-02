import { createEnv } from '@t3-oss/env-nextjs';
import { z} from 'zod';

/**
 * Environment variables for scraper system
 */
export const scrapersEnv = createEnv({
  runtimeEnv: {
    // Scraper Configuration
    SCRAPER_CONCURRENCY: process.env.SCRAPER_CONCURRENCY,
    SCRAPER_MAX_RETRIES: process.env.SCRAPER_MAX_RETRIES,
    SCRAPER_S3_PATH: process.env.SCRAPER_S3_PATH,

    // Social Media APIs
    TWITTER_API_KEY: process.env.TWITTER_API_KEY,
    TWITTER_API_SECRET: process.env.TWITTER_API_SECRET,
    TWITTER_BEARER_TOKEN: process.env.TWITTER_BEARER_TOKEN,
    REDDIT_CLIENT_ID: process.env.REDDIT_CLIENT_ID,
    REDDIT_CLIENT_SECRET: process.env.REDDIT_CLIENT_SECRET,
    DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN,

    // Proxies
    PROXY_ROTATION_ENABLED: process.env.PROXY_ROTATION_ENABLED,
    PROXY_LIST: process.env.PROXY_LIST,

    // Mobile Scraping
    ADB_DEVICE_IDS: process.env.ADB_DEVICE_IDS,

    // Sentiment Analysis
    SENTIMENT_MODELS: process.env.SENTIMENT_MODELS,
    HUGGINGFACE_SENTIMENT_MODEL: process.env.HUGGINGFACE_SENTIMENT_MODEL,
    HUGGINGFACE_API_KEY: process.env.HUGGINGFACE_API_KEY,

    // Redis (for queue management)
    REDIS_HOST: process.env.REDIS_HOST,
    REDIS_PORT: process.env.REDIS_PORT,
    REDIS_PASSWORD: process.env.REDIS_PASSWORD,
  },
  server: {
    // Scraper Configuration
    SCRAPER_CONCURRENCY: z.coerce.number().default(5),
    SCRAPER_MAX_RETRIES: z.coerce.number().default(3),
    SCRAPER_S3_PATH: z.string().default('scraped-data'),

    // Social Media APIs
    TWITTER_API_KEY: z.string().optional(),
    TWITTER_API_SECRET: z.string().optional(),
    TWITTER_BEARER_TOKEN: z.string().optional(),
    REDDIT_CLIENT_ID: z.string().optional(),
    REDDIT_CLIENT_SECRET: z.string().optional(),
    DISCORD_BOT_TOKEN: z.string().optional(),

    // Proxies
    PROXY_ROTATION_ENABLED: z.boolean().default(false),
    PROXY_LIST: z.string().optional(),

    // Mobile Scraping
    ADB_DEVICE_IDS: z.string().optional(),

    // Sentiment Analysis
    SENTIMENT_MODELS: z.string().default('huggingface'),
    HUGGINGFACE_SENTIMENT_MODEL: z
      .string()
      .default('cardiffnlp/twitter-roberta-base-sentiment-latest'),
    HUGGINGFACE_API_KEY: z.string().optional(),

    // Redis (for queue management)
    REDIS_HOST: z.string().default('localhost'),
    REDIS_PORT: z.string().default('6379'),
    REDIS_PASSWORD: z.string().optional(),
  },
});

