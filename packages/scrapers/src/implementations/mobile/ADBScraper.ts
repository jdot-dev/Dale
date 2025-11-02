import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import Debug from 'debug';
import crypto from 'node:crypto';

import { BaseScraper } from '../../base/BaseScraper';
import type { MobileScrapeConfig, ScrapedData } from '../../base/types';

const execAsync = promisify(exec);
const debug = Debug('lobechat:scrapers:adb');

/**
 * Android Debug Bridge (ADB) Scraper
 * 
 * Extracts data from Android apps using ADB commands
 */
export class ADBScraper extends BaseScraper<MobileScrapeConfig> {
  constructor() {
    super('adb', 'mobile', {}, { maxConcurrency: 1 });
  }

  protected async doScrape(config: MobileScrapeConfig): Promise<ScrapedData> {
    this.validateConfig(config);

    debug(`Scraping Android app: ${config.packageName} on device: ${config.deviceId}`);

    // Verify ADB is installed
    await this.verifyADB();

    // Connect to device
    await this.connectDevice(config.deviceId);

    // Extract app data
    const appInfo = await this.getAppInfo(config.deviceId, config.packageName);
    const appData = await this.extractAppData(config.deviceId, config.packageName, config.activity);

    // Aggregate content
    const aggregatedContent = [
      `Package: ${config.packageName}`,
      `Device: ${config.deviceId}`,
      `App Info: ${JSON.stringify(appInfo, null, 2)}`,
      `\nExtracted Data:`,
      appData,
    ].join('\n');

    const contentHash = crypto.createHash('sha256').update(aggregatedContent).digest('hex');

    return {
      id: this.generateId('mobile'),
      sourceType: 'mobile',
      source: `android://${config.deviceId}/${config.packageName}`,
      content: aggregatedContent,
      title: `Android App: ${config.packageName}`,
      contentType: 'text',
      rawData: {
        appInfo,
        deviceId: config.deviceId,
        packageName: config.packageName,
      },
      metadata: {
        scrapedAt: Date.now(),
        contentLength: aggregatedContent.length,
        deviceId: config.deviceId,
        packageName: config.packageName,
        contentHash,
      },
      status: 'completed',
    };
  }

  /**
   * Verify ADB is installed and accessible
   */
  private async verifyADB(): Promise<void> {
    try {
      const { stdout } = await execAsync('adb version');
      debug(`ADB version: ${stdout.trim()}`);
    } catch (error) {
      throw new Error(
        'ADB not found. Please install Android Debug Bridge (ADB) and add it to your PATH.',
      );
    }
  }

  /**
   * Connect to Android device
   */
  private async connectDevice(deviceId: string): Promise<void> {
    try {
      // Check if device is connected
      const { stdout } = await execAsync('adb devices');

      if (!stdout.includes(deviceId)) {
        throw new Error(`Device ${deviceId} not found. Connect device and enable USB debugging.`);
      }

      debug(`Connected to device: ${deviceId}`);
    } catch (error) {
      throw new Error(`Failed to connect to device ${deviceId}: ${(error as Error).message}`);
    }
  }

  /**
   * Get app information
   */
  private async getAppInfo(
    deviceId: string,
    packageName: string,
  ): Promise<Record<string, any>> {
    try {
      const { stdout } = await execAsync(`adb -s ${deviceId} shell dumpsys package ${packageName}`);

      // Parse basic app info
      const versionMatch = stdout.match(/versionName=([^\s]+)/);
      const versionCodeMatch = stdout.match(/versionCode=(\d+)/);
      const installerMatch = stdout.match(/installerPackageName=([^\s]+)/);

      return {
        packageName,
        versionName: versionMatch ? versionMatch[1] : 'unknown',
        versionCode: versionCodeMatch ? versionCodeMatch[1] : 'unknown',
        installer: installerMatch ? installerMatch[1] : 'unknown',
      };
    } catch (error) {
      debug(`Failed to get app info: ${(error as Error).message}`);
      return {};
    }
  }

  /**
   * Extract app data
   */
  private async extractAppData(
    deviceId: string,
    packageName: string,
    activity?: string,
  ): Promise<string> {
    const dataPoints: string[] = [];

    try {
      // Launch activity if specified
      if (activity) {
        await execAsync(
          `adb -s ${deviceId} shell am start -n ${packageName}/${activity}`,
        );
        debug(`Launched activity: ${activity}`);

        // Wait for activity to load
        await this.sleep(2000);
      }

      // Get current activity/screen content
      const { stdout: uiDump } = await execAsync(
        `adb -s ${deviceId} shell uiautomator dump /dev/tty`,
      );

      // Extract text from UI dump (simplified)
      const textMatches = uiDump.matchAll(/text="([^"]+)"/g);
      const texts = Array.from(textMatches, (m) => m[1]).filter(Boolean);

      if (texts.length > 0) {
        dataPoints.push(`Screen Text Content:`);
        dataPoints.push(texts.join('\n'));
      }

      // Get app's shared preferences (if accessible)
      try {
        const { stdout: prefs } = await execAsync(
          `adb -s ${deviceId} shell run-as ${packageName} cat shared_prefs/*.xml 2>/dev/null || echo "No prefs"`,
        );
        if (prefs && !prefs.includes('No prefs')) {
          dataPoints.push(`\nShared Preferences:`);
          dataPoints.push(prefs);
        }
      } catch {
        debug('Could not access shared preferences (app may not be debuggable)');
      }

      // Get app's database names (if accessible)
      try {
        const { stdout: databases } = await execAsync(
          `adb -s ${deviceId} shell run-as ${packageName} ls databases 2>/dev/null || echo "No db"`,
        );
        if (databases && !databases.includes('No db')) {
          dataPoints.push(`\nDatabases:`);
          dataPoints.push(databases);
        }
      } catch {
        debug('Could not access databases (app may not be debuggable)');
      }

      return dataPoints.join('\n\n');
    } catch (error) {
      throw new Error(`Failed to extract app data: ${(error as Error).message}`);
    }
  }

  /**
   * Validate configuration
   */
  protected validateConfig(config: MobileScrapeConfig): void {
    super.validateConfig(config);

    if (!config.deviceId) {
      throw new Error('Device ID is required for ADB scraping');
    }

    if (!config.packageName) {
      throw new Error('Package name is required for ADB scraping');
    }
  }

  /**
   * Cleanup method
   */
  async cleanup(deviceId?: string): Promise<void> {
    if (deviceId) {
      try {
        await execAsync(`adb -s ${deviceId} shell am force-stop *`);
        debug(`Cleaned up device: ${deviceId}`);
      } catch (error) {
        debug(`Cleanup failed: ${(error as Error).message}`);
      }
    }
  }
}

