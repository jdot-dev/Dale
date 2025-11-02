-- Add scraper system tables for multi-source data ingestion

-- Scraped sources configuration table
CREATE TABLE IF NOT EXISTS "scraped_sources" (
  "id" varchar(30) PRIMARY KEY NOT NULL,
  "source_type" text NOT NULL,
  "source_url" text NOT NULL,
  "scrape_config" jsonb,
  "last_scraped_at" timestamp,
  "scrape_frequency" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "user_id" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "scraped_sources_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade
);

-- Sentiment analysis data table
CREATE TABLE IF NOT EXISTS "sentiment_data" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "document_id" varchar(30),
  "sentiment" text NOT NULL,
  "sentiment_score" real NOT NULL,
  "confidence" real NOT NULL,
  "emotions" jsonb,
  "model" text NOT NULL,
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "sentiment_data_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE cascade
);

-- Scraped data cache table (for deduplication and tracking)
CREATE TABLE IF NOT EXISTS "scraped_data_cache" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "source_id" varchar(30) NOT NULL,
  "content_hash" text NOT NULL,
  "document_id" varchar(30),
  "scraped_at" timestamp DEFAULT now() NOT NULL,
  "s3_path" text,
  "metadata" jsonb,
  CONSTRAINT "scraped_data_cache_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "scraped_sources"("id") ON DELETE cascade,
  CONSTRAINT "scraped_data_cache_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE set null
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS "scraped_sources_user_id_idx" ON "scraped_sources" ("user_id");
CREATE INDEX IF NOT EXISTS "scraped_sources_source_type_idx" ON "scraped_sources" ("source_type");
CREATE INDEX IF NOT EXISTS "scraped_sources_is_active_idx" ON "scraped_sources" ("is_active");
CREATE INDEX IF NOT EXISTS "scraped_sources_last_scraped_at_idx" ON "scraped_sources" ("last_scraped_at");

CREATE INDEX IF NOT EXISTS "sentiment_data_document_id_idx" ON "sentiment_data" ("document_id");
CREATE INDEX IF NOT EXISTS "sentiment_data_sentiment_idx" ON "sentiment_data" ("sentiment");
CREATE INDEX IF NOT EXISTS "sentiment_data_created_at_idx" ON "sentiment_data" ("created_at");

CREATE INDEX IF NOT EXISTS "scraped_data_cache_source_id_idx" ON "scraped_data_cache" ("source_id");
CREATE INDEX IF NOT EXISTS "scraped_data_cache_content_hash_idx" ON "scraped_data_cache" ("content_hash");
CREATE INDEX IF NOT EXISTS "scraped_data_cache_document_id_idx" ON "scraped_data_cache" ("document_id");
CREATE INDEX IF NOT EXISTS "scraped_data_cache_scraped_at_idx" ON "scraped_data_cache" ("scraped_at");

-- Unique constraint for content deduplication
CREATE UNIQUE INDEX IF NOT EXISTS "scraped_data_cache_source_content_unique" 
  ON "scraped_data_cache" ("source_id", "content_hash");

