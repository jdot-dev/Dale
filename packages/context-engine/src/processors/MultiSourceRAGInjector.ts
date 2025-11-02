import debug from 'debug';

import { BaseProcessor } from '../base/BaseProcessor';
import type { PipelineContext, ProcessorOptions } from '../types';

const log = debug('context-engine:processor:MultiSourceRAGInjector');

export interface MultiSourceRAGConfig {
  /** Enable RAG injection */
  enabled?: boolean;
  /** Source types to query */
  sources?: Array<'twitter' | 'reddit' | 'web' | 'mobile' | 'discord' | 'rss'>;
  /** Maximum results per source */
  maxResultsPerSource?: number;
  /** Similarity threshold (0-1) */
  similarityThreshold?: number;
  /** Whether to include source metadata */
  includeMetadata?: boolean;
}

/**
 * Multi-Source RAG Injector Processor
 * Queries across all scraped sources and injects relevant context
 */
export class MultiSourceRAGInjector extends BaseProcessor {
  readonly name = 'MultiSourceRAGInjector';

  constructor(
    private config: MultiSourceRAGConfig,
    options: ProcessorOptions = {},
  ) {
    super(options);
  }

  protected async doProcess(context: PipelineContext): Promise<PipelineContext> {
    const clonedContext = this.cloneContext(context);

    // Skip if disabled
    if (this.config.enabled === false) {
      log('Multi-source RAG injection disabled, skipping');
      return this.markAsExecuted(clonedContext);
    }

    try {
      // Extract query from most recent user message
      const query = this.extractQuery(context);
      if (!query) {
        log('No query found in context');
        return this.markAsExecuted(clonedContext);
      }

      log(`Performing multi-source RAG query: "${query}"`);

      // Query across all sources
      const results = await this.vectorSearch(query, {
        sources: this.config.sources || ['twitter', 'reddit', 'web', 'mobile'],
        limit: this.config.maxResultsPerSource || 5,
        threshold: this.config.similarityThreshold || 0.7,
      });

      if (results.length === 0) {
        log('No relevant results found');
        return this.markAsExecuted(clonedContext);
      }

      // Format results
      const formattedResults = this.formatResults(results, this.config.includeMetadata);

      // Inject as system message
      const ragMessage = {
        id: `rag-${Date.now()}`,
        role: 'system' as const,
        content: formattedResults,
        createdAt: Date.now(),
      };

      // Add to beginning of messages (after system role if present)
      const insertIndex = clonedContext.messages.findIndex((m) => m.role !== 'system') || 0;
      clonedContext.messages.splice(insertIndex, 0, ragMessage);

      // Update metadata
      clonedContext.metadata.ragInjected = true;
      clonedContext.metadata.ragResultCount = results.length;
      clonedContext.metadata.ragSources = [...new Set(results.map((r) => r.source))];

      log(`Injected RAG context: ${results.length} results from ${clonedContext.metadata.ragSources.length} sources`);
    } catch (error) {
      log.extend('error')(`Failed to inject RAG context: ${error}`);
      // Continue processing even if RAG injection fails
    }

    return this.markAsExecuted(clonedContext);
  }

  /**
   * Extract query from context
   */
  private extractQuery(context: PipelineContext): string | null {
    // Get most recent user message
    const userMessages = context.messages.filter((m) => m.role === 'user');
    if (userMessages.length === 0) {
      return null;
    }

    const lastMessage = userMessages[userMessages.length - 1];
    return typeof lastMessage.content === 'string' ? lastMessage.content : null;
  }

  /**
   * Perform vector search across sources
   */
  private async vectorSearch(
    query: string,
    options: {
      sources: string[];
      limit: number;
      threshold: number;
    },
  ): Promise<any[]> {
    // This would perform vector similarity search using embeddings
    // For now, return empty array as placeholder
    // In production, this would use the embeddings table and vector search

    log(`Vector search: query="${query.slice(0, 50)}...", sources=${options.sources.join(',')}, limit=${options.limit}`);

    // Placeholder for vector search
    // const embeddings = await db.select()
    //   .from(embeddingsTable)
    //   .join(chunks)
    //   .join(documents)
    //   .where(and(
    //     inArray(documents.sourceType, options.sources),
    //     sql`cosine_similarity(embeddings.embeddings, ${queryEmbedding}) > ${options.threshold}`
    //   ))
    //   .limit(options.limit * options.sources.length);

    return [];
  }

  /**
   * Format results for injection
   */
  private formatResults(results: any[], includeMetadata = true): string {
    if (results.length === 0) {
      return 'No relevant context found.';
    }

    const sections = [
      '# Relevant Context from Multiple Sources',
      '',
      `Found ${results.length} relevant results:`,
      '',
    ];

    // Group by source
    const groupedResults = results.reduce(
      (acc, result) => {
        const source = result.source || 'unknown';
        if (!acc[source]) {
          acc[source] = [];
        }
        acc[source].push(result);
        return acc;
      },
      {} as Record<string, any[]>,
    );

    // Format each source group
    for (const [source, sourceResults] of Object.entries(groupedResults)) {
      sections.push(`## ${this.capitalizeSourceName(source)} (${sourceResults.length} results)`);
      sections.push('');

      for (const result of sourceResults) {
        sections.push(`### Result ${result.id || 'unknown'}`);

        if (includeMetadata && result.metadata) {
          sections.push(`**Scraped**: ${new Date(result.metadata.scrapedAt).toLocaleString()}`);
          if (result.metadata.author) {
            sections.push(`**Author**: ${result.metadata.author}`);
          }
          sections.push('');
        }

        sections.push(result.content.slice(0, 500)); // Truncate long content
        if (result.content.length > 500) {
          sections.push('...(truncated)');
        }
        sections.push('');
        sections.push('---');
        sections.push('');
      }
    }

    sections.push('Use the above context to provide informed and relevant responses.');

    return sections.join('\n');
  }

  /**
   * Capitalize source name
   */
  private capitalizeSourceName(source: string): string {
    const nameMap: Record<string, string> = {
      twitter: 'Twitter/X',
      reddit: 'Reddit',
      web: 'Web Scraping',
      mobile: 'Mobile Apps',
      discord: 'Discord',
      rss: 'RSS Feeds',
    };

    return nameMap[source] || source.charAt(0).toUpperCase() + source.slice(1);
  }
}

