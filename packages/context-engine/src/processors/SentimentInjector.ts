import debug from 'debug';

import { BaseProcessor } from '../base/BaseProcessor';
import type { PipelineContext, ProcessorOptions } from '../types';

const log = debug('context-engine:processor:SentimentInjector');

export interface SentimentInjectorConfig {
  /** Enable sentiment injection */
  enabled?: boolean;
  /** Maximum number of sentiment records to fetch */
  maxRecords?: number;
  /** Time window in days */
  timeWindowDays?: number;
  /** Filter by sentiment type */
  sentimentFilter?: 'positive' | 'negative' | 'neutral' | 'all';
}

/**
 * Sentiment Injector Processor
 * Injects aggregated sentiment data into agent context
 */
export class SentimentInjector extends BaseProcessor {
  readonly name = 'SentimentInjector';

  constructor(
    private config: SentimentInjectorConfig,
    options: ProcessorOptions = {},
  ) {
    super(options);
  }

  protected async doProcess(context: PipelineContext): Promise<PipelineContext> {
    const clonedContext = this.cloneContext(context);

    // Skip if disabled
    if (this.config.enabled === false) {
      log('Sentiment injection disabled, skipping');
      return this.markAsExecuted(clonedContext);
    }

    try {
      // Fetch relevant sentiment data
      const sentimentData = await this.fetchRelevantSentiment(context);

      if (!sentimentData || sentimentData.length === 0) {
        log('No sentiment data found');
        return this.markAsExecuted(clonedContext);
      }

      // Build sentiment summary
      const sentimentSummary = this.buildSentimentSummary(sentimentData);

      // Inject as system message
      const sentimentMessage = {
        id: `sentiment-${Date.now()}`,
        role: 'system' as const,
        content: sentimentSummary,
        createdAt: Date.now(),
      };

      // Add to beginning of messages (after system role if present)
      const insertIndex = clonedContext.messages.findIndex((m) => m.role !== 'system') || 0;
      clonedContext.messages.splice(insertIndex, 0, sentimentMessage);

      // Update metadata
      clonedContext.metadata.sentimentInjected = true;
      clonedContext.metadata.sentimentRecordCount = sentimentData.length;

      log(`Injected sentiment data: ${sentimentData.length} records`);
    } catch (error) {
      log.extend('error')(`Failed to inject sentiment: ${error}`);
      // Continue processing even if sentiment injection fails
    }

    return this.markAsExecuted(clonedContext);
  }

  /**
   * Fetch relevant sentiment data based on context
   */
  private async fetchRelevantSentiment(context: PipelineContext): Promise<any[]> {
    // This would query the database for sentiment data
    // For now, return empty array as placeholder
    // In production, this would use the sentimentData table from the database

    const timeWindow = this.config.timeWindowDays || 7;
    const maxRecords = this.config.maxRecords || 50;
    const sentimentFilter = this.config.sentimentFilter || 'all';

    log(`Fetching sentiment data: window=${timeWindow} days, max=${maxRecords}, filter=${sentimentFilter}`);

    // Placeholder for database query
    // const sentiments = await db.select()
    //   .from(sentimentData)
    //   .where(and(
    //     gte(sentimentData.createdAt, new Date(Date.now() - timeWindow * 24 * 60 * 60 * 1000)),
    //     sentimentFilter !== 'all' ? eq(sentimentData.sentiment, sentimentFilter) : undefined
    //   ))
    //   .limit(maxRecords);

    return [];
  }

  /**
   * Build sentiment summary from data
   */
  private buildSentimentSummary(sentimentData: any[]): string {
    if (sentimentData.length === 0) {
      return 'No recent sentiment data available.';
    }

    // Calculate aggregates
    const totalRecords = sentimentData.length;
    const positiveCount = sentimentData.filter((s) => s.sentiment === 'positive').length;
    const negativeCount = sentimentData.filter((s) => s.sentiment === 'negative').length;
    const neutralCount = sentimentData.filter((s) => s.sentiment === 'neutral').length;

    const avgScore = sentimentData.reduce((sum, s) => sum + s.sentimentScore, 0) / totalRecords;

    const summary = [
      '# Recent Sentiment Analysis',
      ``,
      `**Total Records**: ${totalRecords}`,
      `**Average Sentiment Score**: ${avgScore.toFixed(2)} (range: -1 to 1)`,
      ``,
      `**Distribution**:`,
      `- Positive: ${positiveCount} (${((positiveCount / totalRecords) * 100).toFixed(1)}%)`,
      `- Negative: ${negativeCount} (${((negativeCount / totalRecords) * 100).toFixed(1)}%)`,
      `- Neutral: ${neutralCount} (${((neutralCount / totalRecords) * 100).toFixed(1)}%)`,
      ``,
      `Use this sentiment context to inform your responses and understand the emotional tone of recent interactions.`,
    ].join('\n');

    return summary;
  }
}

