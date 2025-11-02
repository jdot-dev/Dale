import cron from 'node-cron';
import Debug from 'debug';

import type { ScrapeConfig } from '../base/types';

const debug = Debug('lobechat:scrapers:scheduler');

/**
 * Scheduled job configuration
 */
export interface ScheduledJob {
  id: string;
  name: string;
  cronExpression: string;
  config: ScrapeConfig;
  enabled: boolean;
  lastRun?: number;
  nextRun?: number;
}

/**
 * Job execution callback
 */
export type JobExecutor = (job: ScheduledJob) => Promise<void>;

/**
 * Cron-based job scheduler for scraping tasks
 */
export class CronScheduler {
  private jobs: Map<string, { job: ScheduledJob; task: cron.ScheduledTask }> = new Map();
  private executor: JobExecutor;

  constructor(executor: JobExecutor) {
    this.executor = executor;
  }

  /**
   * Schedule a new job
   */
  scheduleJob(job: ScheduledJob): void {
    // Validate cron expression
    if (!cron.validate(job.cronExpression)) {
      throw new Error(`Invalid cron expression: ${job.cronExpression}`);
    }

    // Remove existing job if it exists
    this.removeJob(job.id);

    // Create scheduled task
    const task = cron.schedule(
      job.cronExpression,
      async () => {
        if (!job.enabled) {
          debug(`Job ${job.id} is disabled, skipping`);
          return;
        }

        debug(`Executing scheduled job: ${job.id}`);

        try {
          job.lastRun = Date.now();
          await this.executor(job);
          debug(`Job ${job.id} completed successfully`);
        } catch (error) {
          debug(`Job ${job.id} failed:`, error);
        }
      },
      {
        scheduled: job.enabled,
      },
    );

    this.jobs.set(job.id, { job, task });

    debug(`Scheduled job: ${job.id} (${job.cronExpression})`);
  }

  /**
   * Remove a scheduled job
   */
  removeJob(jobId: string): boolean {
    const entry = this.jobs.get(jobId);
    if (!entry) {
      return false;
    }

    entry.task.stop();
    this.jobs.delete(jobId);

    debug(`Removed job: ${jobId}`);
    return true;
  }

  /**
   * Start a job
   */
  startJob(jobId: string): boolean {
    const entry = this.jobs.get(jobId);
    if (!entry) {
      return false;
    }

    entry.job.enabled = true;
    entry.task.start();

    debug(`Started job: ${jobId}`);
    return true;
  }

  /**
   * Stop a job
   */
  stopJob(jobId: string): boolean {
    const entry = this.jobs.get(jobId);
    if (!entry) {
      return false;
    }

    entry.job.enabled = false;
    entry.task.stop();

    debug(`Stopped job: ${jobId}`);
    return true;
  }

  /**
   * Get job by ID
   */
  getJob(jobId: string): ScheduledJob | undefined {
    return this.jobs.get(jobId)?.job;
  }

  /**
   * List all jobs
   */
  listJobs(): ScheduledJob[] {
    return Array.from(this.jobs.values()).map((entry) => entry.job);
  }

  /**
   * Check if a job exists
   */
  hasJob(jobId: string): boolean {
    return this.jobs.has(jobId);
  }

  /**
   * Update job configuration
   */
  updateJob(jobId: string, updates: Partial<ScheduledJob>): boolean {
    const entry = this.jobs.get(jobId);
    if (!entry) {
      return false;
    }

    // Update job configuration
    Object.assign(entry.job, updates);

    // If cron expression changed, reschedule
    if (updates.cronExpression && updates.cronExpression !== entry.job.cronExpression) {
      this.scheduleJob(entry.job);
    }

    debug(`Updated job: ${jobId}`);
    return true;
  }

  /**
   * Stop all jobs and cleanup
   */
  shutdown(): void {
    for (const [jobId, entry] of this.jobs.entries()) {
      entry.task.stop();
      debug(`Stopped job: ${jobId}`);
    }

    this.jobs.clear();
    debug('Scheduler shutdown complete');
  }

  /**
   * Get scheduler statistics
   */
  getStats() {
    const jobs = this.listJobs();

    return {
      totalJobs: jobs.length,
      enabledJobs: jobs.filter((j) => j.enabled).length,
      disabledJobs: jobs.filter((j) => !j.enabled).length,
      jobs: jobs.map((j) => ({
        id: j.id,
        name: j.name,
        enabled: j.enabled,
        cronExpression: j.cronExpression,
        lastRun: j.lastRun,
      })),
    };
  }
}

