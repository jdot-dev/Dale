import { Queue, Worker, type Job, type JobsOptions } from 'bullmq';
import type { Redis } from 'ioredis';
import Debug from 'debug';

import type { ScrapeConfig, ScrapeResult } from '../base/types';

const debug = Debug('lobechat:scrapers:queue');

/**
 * Queue job data
 */
export interface QueueJobData {
  jobId: string;
  config: ScrapeConfig;
  priority?: number;
  attempts?: number;
}

/**
 * Queue configuration
 */
export interface QueueConfig {
  /** Redis connection */
  connection?: Redis;
  /** Redis connection options */
  redis?: {
    host: string;
    port: number;
    password?: string;
  };
  /** Queue name */
  queueName?: string;
  /** Maximum concurrent jobs */
  concurrency?: number;
  /** Job options */
  defaultJobOptions?: JobsOptions;
}

/**
 * Job processor callback
 */
export type JobProcessor = (data: QueueJobData) => Promise<ScrapeResult>;

/**
 * Queue manager for scraping jobs using BullMQ
 */
export class QueueManager {
  private queue: Queue;
  private worker?: Worker;
  private readonly config: Required<QueueConfig>;

  constructor(processor: JobProcessor, config: QueueConfig = {}) {
    this.config = {
      connection: config.connection,
      redis: config.redis || {
        host: process.env.REDIS_HOST || 'localhost',
        port: Number.parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
      },
      queueName: config.queueName || 'scraper-queue',
      concurrency: config.concurrency || 5,
      defaultJobOptions: config.defaultJobOptions || {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: {
          age: 86400, // 24 hours
          count: 1000,
        },
        removeOnFail: {
          age: 604800, // 7 days
        },
      },
    };

    // Create queue
    this.queue = new Queue(this.config.queueName, {
      connection: this.config.connection || this.config.redis,
      defaultJobOptions: this.config.defaultJobOptions,
    });

    // Create worker
    this.worker = new Worker(
      this.config.queueName,
      async (job: Job<QueueJobData>) => {
        debug(`Processing job: ${job.id}`);

        try {
          const result = await processor(job.data);

          debug(`Job ${job.id} completed:`, {
            success: result.success,
            executionTime: result.executionTime,
          });

          return result;
        } catch (error) {
          debug(`Job ${job.id} failed:`, error);
          throw error;
        }
      },
      {
        connection: this.config.connection || this.config.redis,
        concurrency: this.config.concurrency,
      },
    );

    // Set up event listeners
    this.setupEventListeners();

    debug(`Queue manager initialized: ${this.config.queueName}`);
  }

  /**
   * Add a job to the queue
   */
  async addJob(
    data: QueueJobData,
    options?: JobsOptions,
  ): Promise<Job<QueueJobData>> {
    const job = await this.queue.add(
      `scrape-${data.config.sourceType}`,
      data,
      {
        ...this.config.defaultJobOptions,
        ...options,
        priority: data.priority,
      },
    );

    debug(`Added job to queue: ${job.id}`, {
      sourceType: data.config.sourceType,
      priority: data.priority,
    });

    return job;
  }

  /**
   * Get job by ID
   */
  async getJob(jobId: string): Promise<Job<QueueJobData> | undefined> {
    return this.queue.getJob(jobId);
  }

  /**
   * Get job counts
   */
  async getJobCounts() {
    return this.queue.getJobCounts(
      'active',
      'completed',
      'failed',
      'delayed',
      'waiting',
    );
  }

  /**
   * Get waiting jobs
   */
  async getWaitingJobs(start = 0, end = 10): Promise<Job<QueueJobData>[]> {
    return this.queue.getWaiting(start, end);
  }

  /**
   * Get active jobs
   */
  async getActiveJobs(start = 0, end = 10): Promise<Job<QueueJobData>[]> {
    return this.queue.getActive(start, end);
  }

  /**
   * Get completed jobs
   */
  async getCompletedJobs(start = 0, end = 10): Promise<Job<QueueJobData>[]> {
    return this.queue.getCompleted(start, end);
  }

  /**
   * Get failed jobs
   */
  async getFailedJobs(start = 0, end = 10): Promise<Job<QueueJobData>[]> {
    return this.queue.getFailed(start, end);
  }

  /**
   * Retry a failed job
   */
  async retryJob(jobId: string): Promise<void> {
    const job = await this.queue.getJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    await job.retry();
    debug(`Retrying job: ${jobId}`);
  }

  /**
   * Remove a job
   */
  async removeJob(jobId: string): Promise<void> {
    const job = await this.queue.getJob(jobId);
    if (job) {
      await job.remove();
      debug(`Removed job: ${jobId}`);
    }
  }

  /**
   * Pause the queue
   */
  async pause(): Promise<void> {
    await this.queue.pause();
    debug('Queue paused');
  }

  /**
   * Resume the queue
   */
  async resume(): Promise<void> {
    await this.queue.resume();
    debug('Queue resumed');
  }

  /**
   * Clean old jobs
   */
  async clean(grace: number, limit: number, status: 'completed' | 'failed'): Promise<string[]> {
    const jobs = await this.queue.clean(grace, limit, status);
    debug(`Cleaned ${jobs.length} ${status} jobs`);
    return jobs;
  }

  /**
   * Obliterate the queue (remove all jobs and data)
   */
  async obliterate(): Promise<void> {
    await this.queue.obliterate();
    debug('Queue obliterated');
  }

  /**
   * Get queue statistics
   */
  async getStats() {
    const counts = await this.getJobCounts();
    const waiting = await this.getWaitingJobs(0, 1);
    const active = await this.getActiveJobs(0, 10);

    return {
      counts,
      queueName: this.config.queueName,
      concurrency: this.config.concurrency,
      isPaused: await this.queue.isPaused(),
      waitingJobs: waiting.length,
      activeJobIds: active.map((j) => j.id),
    };
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    if (!this.worker) return;

    this.worker.on('completed', (job) => {
      debug(`Job completed: ${job.id}`);
    });

    this.worker.on('failed', (job, error) => {
      debug(`Job failed: ${job?.id}`, error);
    });

    this.worker.on('error', (error) => {
      debug('Worker error:', error);
    });

    this.queue.on('error', (error) => {
      debug('Queue error:', error);
    });
  }

  /**
   * Close queue and worker
   */
  async close(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
    }
    await this.queue.close();
    debug('Queue manager closed');
  }
}

