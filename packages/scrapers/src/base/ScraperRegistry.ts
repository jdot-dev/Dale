import Debug from 'debug';

import type { BaseScraper } from './BaseScraper';
import type { ScrapeConfig, SourceType } from './types';

const debug = Debug('lobechat:scrapers:registry');

/**
 * Registry for managing scraper instances
 * 
 * Provides centralized scraper registration, retrieval, and lifecycle management
 */
export class ScraperRegistry {
  private scrapers: Map<string, BaseScraper>;
  private scrapersByType: Map<SourceType, BaseScraper[]>;

  constructor() {
    this.scrapers = new Map();
    this.scrapersByType = new Map();
  }

  /**
   * Register a new scraper
   */
  register(name: string, scraper: BaseScraper): void {
    if (this.scrapers.has(name)) {
      debug(`Scraper ${name} already registered, replacing...`);
    }

    this.scrapers.set(name, scraper);

    // Index by source type
    const info = scraper.getInfo();
    const scrapersForType = this.scrapersByType.get(info.sourceType) || [];
    scrapersForType.push(scraper);
    this.scrapersByType.set(info.sourceType, scrapersForType);

    debug(`Registered scraper: ${name} (${info.sourceType})`);
  }

  /**
   * Unregister a scraper
   */
  unregister(name: string): boolean {
    const scraper = this.scrapers.get(name);
    if (!scraper) {
      return false;
    }

    this.scrapers.delete(name);

    // Remove from type index
    const info = scraper.getInfo();
    const scrapersForType = this.scrapersByType.get(info.sourceType) || [];
    const filtered = scrapersForType.filter((s) => s !== scraper);
    this.scrapersByType.set(info.sourceType, filtered);

    debug(`Unregistered scraper: ${name}`);
    return true;
  }

  /**
   * Get a scraper by name
   */
  get(name: string): BaseScraper | undefined {
    return this.scrapers.get(name);
  }

  /**
   * Get all scrapers for a source type
   */
  getByType(sourceType: SourceType): BaseScraper[] {
    return this.scrapersByType.get(sourceType) || [];
  }

  /**
   * Get the best scraper for a configuration
   * Selects based on capabilities and source type
   */
  getBestScraper(config: ScrapeConfig): BaseScraper | undefined {
    const scrapers = this.getByType(config.sourceType);

    if (scrapers.length === 0) {
      return undefined;
    }

    // Return first scraper for now
    // TODO: Implement capability-based selection
    return scrapers[0];
  }

  /**
   * List all registered scrapers
   */
  list(): Array<{ name: string; sourceType: SourceType }> {
    return Array.from(this.scrapers.entries()).map(([name, scraper]) => ({
      name,
      sourceType: scraper.getInfo().sourceType,
    }));
  }

  /**
   * Check if a scraper is registered
   */
  has(name: string): boolean {
    return this.scrapers.has(name);
  }

  /**
   * Get total number of registered scrapers
   */
  count(): number {
    return this.scrapers.size;
  }

  /**
   * Clear all registered scrapers
   */
  clear(): void {
    this.scrapers.clear();
    this.scrapersByType.clear();
    debug('Cleared all scrapers from registry');
  }

  /**
   * Get scrapers grouped by source type
   */
  groupByType(): Record<SourceType, string[]> {
    const grouped: Record<string, string[]> = {};

    for (const [name, scraper] of this.scrapers.entries()) {
      const info = scraper.getInfo();
      if (!grouped[info.sourceType]) {
        grouped[info.sourceType] = [];
      }
      grouped[info.sourceType].push(name);
    }

    return grouped as Record<SourceType, string[]>;
  }
}

/**
 * Global scraper registry instance
 */
export const globalRegistry = new ScraperRegistry();

