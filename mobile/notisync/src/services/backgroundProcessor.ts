import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import { storageService } from './storage';
import { notificationFilterService } from './notificationFilter';
import { rulesEngine } from './rulesEngine';
import { CapturedNotification, SyncedNotification } from '../types/notification';

const BACKGROUND_PROCESSING_TASK = 'BACKGROUND_NOTIFICATION_PROCESSING';
const CLEANUP_TASK = 'BACKGROUND_CLEANUP_TASK';
const RULES_EVALUATION_TASK = 'BACKGROUND_RULES_EVALUATION';

export interface BackgroundProcessingConfig {
  enabled: boolean;
  processingInterval: number; // seconds
  cleanupInterval: number; // seconds
  rulesEvaluationInterval: number; // seconds
  batchSize: number;
  maxProcessingTime: number; // milliseconds
  retryAttempts: number;
  retryDelay: number; // milliseconds
}

export interface ProcessingStats {
  totalProcessed: number;
  successfullyProcessed: number;
  failedProcessing: number;
  rulesApplied: number;
  categorized: number;
  prioritized: number;
  lastProcessingTime?: number;
  averageProcessingTime: number;
  processingErrors: string[];
}

class BackgroundProcessor {
  private static instance: BackgroundProcessor;
  private isRunning = false;
  private config: BackgroundProcessingConfig;
  private stats: ProcessingStats;
  private processingQueue: CapturedNotification[] = [];
  private isProcessing = false;

  private constructor() {
    this.config = {
      enabled: true,
      processingInterval: 30, // 30 seconds
      cleanupInterval: 3600, // 1 hour
      rulesEvaluationInterval: 60, // 1 minute
      batchSize: 20,
      maxProcessingTime: 30000, // 30 seconds
      retryAttempts: 3,
      retryDelay: 5000, // 5 seconds
    };

    this.stats = {
      totalProcessed: 0,
      successfullyProcessed: 0,
      failedProcessing: 0,
      rulesApplied: 0,
      categorized: 0,
      prioritized: 0,
      averageProcessingTime: 0,
      processingErrors: [],
    };

    this.setupTaskManager();
    this.loadConfiguration();
  }

  static getInstance(): BackgroundProcessor {
    if (!BackgroundProcessor.instance) {
      BackgroundProcessor.instance = new BackgroundProcessor();
    }
    return BackgroundProcessor.instance;
  }

  private async loadConfiguration(): Promise<void> {
    try {
      const config = await storageService.getSetting<BackgroundProcessingConfig>('background_processing_config');
      if (config) {
        this.config = { ...this.config, ...config };
      }

      const stats = await storageService.getSetting<ProcessingStats>('background_processing_stats');
      if (stats) {
        this.stats = { ...this.stats, ...stats };
      }
    } catch (error) {
      console.error('Failed to load background processing configuration:', error);
    }
  }

  private async saveConfiguration(): Promise<void> {
    try {
      await storageService.setSetting('background_processing_config', this.config);
      await storageService.setSetting('background_processing_stats', this.stats);
    } catch (error) {
      console.error('Failed to save background processing configuration:', error);
    }
  }

  private setupTaskManager(): void {
    // Main background processing task
    TaskManager.defineTask(BACKGROUND_PROCESSING_TASK, async () => {
      try {
        if (!this.config.enabled || this.isProcessing) {
          return BackgroundFetch.BackgroundFetchResult.NoData;
        }

        const result = await this.processNotificationQueue();
        return result ? BackgroundFetch.BackgroundFetchResult.NewData : BackgroundFetch.BackgroundFetchResult.NoData;
      } catch (error) {
        console.error('Background processing task failed:', error);
        this.addProcessingError(`Background processing failed: ${error}`);
        return BackgroundFetch.BackgroundFetchResult.Failed;
      }
    });

    // Cleanup task
    TaskManager.defineTask(CLEANUP_TASK, async () => {
      try {
        if (!this.config.enabled) {
          return BackgroundFetch.BackgroundFetchResult.NoData;
        }

        await this.performCleanup();
        return BackgroundFetch.BackgroundFetchResult.NewData;
      } catch (error) {
        console.error('Background cleanup task failed:', error);
        return BackgroundFetch.BackgroundFetchResult.Failed;
      }
    });

    // Rules evaluation task
    TaskManager.defineTask(RULES_EVALUATION_TASK, async () => {
      try {
        if (!this.config.enabled) {
          return BackgroundFetch.BackgroundFetchResult.NoData;
        }

        await this.evaluateRulesOnExistingNotifications();
        return BackgroundFetch.BackgroundFetchResult.NewData;
      } catch (error) {
        console.error('Background rules evaluation task failed:', error);
        return BackgroundFetch.BackgroundFetchResult.Failed;
      }
    });
  }

  async startBackgroundProcessing(): Promise<boolean> {
    if (this.isRunning) {
      console.log('Background processing is already running');
      return true;
    }

    try {
      await storageService.initialize();

      // Register background tasks
      await BackgroundFetch.registerTaskAsync(BACKGROUND_PROCESSING_TASK, {
        minimumInterval: this.config.processingInterval,
        stopOnTerminate: false,
        startOnBoot: true,
      });

      await BackgroundFetch.registerTaskAsync(CLEANUP_TASK, {
        minimumInterval: this.config.cleanupInterval,
        stopOnTerminate: false,
        startOnBoot: true,
      });

      await BackgroundFetch.registerTaskAsync(RULES_EVALUATION_TASK, {
        minimumInterval: this.config.rulesEvaluationInterval,
        stopOnTerminate: false,
        startOnBoot: true,
      });

      this.isRunning = true;
      console.log('Background processing started successfully');
      return true;
    } catch (error) {
      console.error('Failed to start background processing:', error);
      return false;
    }
  }

  async stopBackgroundProcessing(): Promise<void> {
    if (!this.isRunning) {
      console.log('Background processing is not running');
      return;
    }

    try {
      await BackgroundFetch.unregisterTaskAsync(BACKGROUND_PROCESSING_TASK);
      await BackgroundFetch.unregisterTaskAsync(CLEANUP_TASK);
      await BackgroundFetch.unregisterTaskAsync(RULES_EVALUATION_TASK);

      this.isRunning = false;
      console.log('Background processing stopped successfully');
    } catch (error) {
      console.error('Failed to stop background processing:', error);
    }
  }

  async addNotificationToQueue(notification: CapturedNotification): Promise<void> {
    this.processingQueue.push(notification);
    
    // If queue is getting large, process immediately
    if (this.processingQueue.length >= this.config.batchSize) {
      await this.processNotificationQueue();
    }
  }

  private async processNotificationQueue(): Promise<boolean> {
    if (this.isProcessing || this.processingQueue.length === 0) {
      return false;
    }

    this.isProcessing = true;
    const startTime = Date.now();
    let processedCount = 0;

    try {
      // Process notifications in batches
      const batch = this.processingQueue.splice(0, this.config.batchSize);
      
      for (const notification of batch) {
        try {
          await this.processNotification(notification);
          processedCount++;
          this.stats.successfullyProcessed++;
        } catch (error) {
          console.error('Failed to process notification:', error);
          this.stats.failedProcessing++;
          this.addProcessingError(`Failed to process notification ${notification.id}: ${error}`);
        }

        // Check if we're exceeding max processing time
        if (Date.now() - startTime > this.config.maxProcessingTime) {
          console.warn('Background processing time limit reached, stopping batch');
          break;
        }
      }

      // Update stats
      this.stats.totalProcessed += processedCount;
      this.stats.lastProcessingTime = Date.now();
      
      const processingTime = Date.now() - startTime;
      this.stats.averageProcessingTime = 
        (this.stats.averageProcessingTime + processingTime) / 2;

      await this.saveConfiguration();

      console.log(`Background processing completed: ${processedCount} notifications processed in ${processingTime}ms`);
      return processedCount > 0;
    } finally {
      this.isProcessing = false;
    }
  }

  private async processNotification(notification: CapturedNotification): Promise<void> {
    // Step 1: Apply filters
    const filterResult = await notificationFilterService.processNotification(notification);
    
    if (!filterResult.shouldCapture) {
      console.log(`Notification filtered out: ${filterResult.reason}`);
      return;
    }

    let processedNotification = filterResult.modifiedNotification || notification;

    // Step 2: Apply rules engine
    const rulesResult = await rulesEngine.evaluateNotification(processedNotification);
    
    if (rulesResult.modified) {
      processedNotification = rulesResult.notification;
      this.stats.rulesApplied++;
    }

    // Step 3: Categorize if not already categorized
    if (!processedNotification.category || processedNotification.category === 'Personal') {
      const category = await this.categorizeNotification(processedNotification);
      if (category !== processedNotification.category) {
        processedNotification.category = category;
        this.stats.categorized++;
      }
    }

    // Step 4: Prioritize based on content and rules
    const priority = await this.prioritizeNotification(processedNotification);
    if (priority !== processedNotification.priority) {
      processedNotification.priority = priority;
      this.stats.prioritized++;
    }

    // Step 5: Store the processed notification
    const syncedNotification: SyncedNotification = {
      ...processedNotification,
      synced: false,
      syncAttempts: 0,
      isRead: false,
      isDismissed: false,
    };

    await storageService.saveNotification(syncedNotification);
  }

  private async categorizeNotification(notification: CapturedNotification): Promise<'Work' | 'Personal' | 'Junk'> {
    const text = `${notification.title} ${notification.body}`.toLowerCase();
    const appName = notification.appName.toLowerCase();
    const packageName = notification.packageName?.toLowerCase() || '';

    // Work-related detection
    const workKeywords = [
      'meeting', 'calendar', 'email', 'slack', 'teams', 'zoom', 'work', 'office',
      'project', 'deadline', 'conference', 'presentation', 'document', 'spreadsheet'
    ];
    
    const workApps = [
      'slack', 'microsoft teams', 'zoom', 'gmail', 'outlook', 'google calendar',
      'trello', 'asana', 'jira', 'confluence', 'notion'
    ];

    const workPackages = [
      'com.slack.android', 'com.microsoft.teams', 'us.zoom.videomeetings',
      'com.google.android.gm', 'com.microsoft.office.outlook',
      'com.google.android.calendar', 'com.trello', 'com.asana.app'
    ];

    // Junk/promotional detection
    const junkKeywords = [
      'offer', 'discount', 'sale', 'promotion', 'deal', 'free', 'win', 'prize',
      'limited time', 'act now', 'exclusive', 'special offer', 'save money',
      'cashback', 'reward', 'gift card', 'lottery', 'congratulations'
    ];

    const junkApps = [
      'shopping', 'deals', 'coupons', 'ads', 'marketing'
    ];

    // Check for work indicators
    if (workPackages.includes(packageName) || 
        workApps.some(app => appName.includes(app)) ||
        workKeywords.some(keyword => text.includes(keyword))) {
      return 'Work';
    }

    // Check for junk indicators
    if (junkApps.some(app => appName.includes(app)) ||
        junkKeywords.some(keyword => text.includes(keyword))) {
      return 'Junk';
    }

    // Default to Personal
    return 'Personal';
  }

  private async prioritizeNotification(notification: CapturedNotification): Promise<number> {
    let priority = notification.priority || 1;

    const text = `${notification.title} ${notification.body}`.toLowerCase();
    const appName = notification.appName.toLowerCase();

    // High priority indicators
    const highPriorityKeywords = [
      'urgent', 'emergency', 'important', 'asap', 'critical', 'alert',
      'otp', 'verification code', 'security', 'login attempt', 'password'
    ];

    const highPriorityApps = [
      'banking', 'security', 'authenticator', 'phone', 'messages'
    ];

    // Low priority indicators
    const lowPriorityKeywords = [
      'newsletter', 'update available', 'backup complete', 'sync complete'
    ];

    // Check for high priority
    if (highPriorityKeywords.some(keyword => text.includes(keyword)) ||
        highPriorityApps.some(app => appName.includes(app))) {
      priority = Math.max(priority, 3);
    }

    // Check for OTP specifically (highest priority)
    if (/\b\d{4,6}\b/.test(text) && 
        (text.includes('otp') || text.includes('code') || text.includes('verification'))) {
      priority = 3;
    }

    // Check for low priority
    if (lowPriorityKeywords.some(keyword => text.includes(keyword))) {
      priority = Math.min(priority, 1);
    }

    // Time-based priority adjustment
    const hour = new Date().getHours();
    if (hour >= 22 || hour <= 6) { // Night time
      if (priority < 3) { // Don't lower critical notifications
        priority = Math.max(0, priority - 1);
      }
    }

    return Math.max(0, Math.min(3, priority));
  }

  private async performCleanup(): Promise<void> {
    console.log('Starting background cleanup...');

    try {
      // Clean up expired notifications
      const deletedCount = await storageService.cleanupExpiredNotifications(7);
      console.log(`Cleaned up ${deletedCount} expired notifications`);

      // Clean up failed sync items
      await storageService.cleanupFailedSyncItems();
      console.log('Cleaned up failed sync items');

      // Clean up old processing errors
      if (this.stats.processingErrors.length > 100) {
        this.stats.processingErrors = this.stats.processingErrors.slice(-50);
      }

      // Reset processing queue if it's too large
      if (this.processingQueue.length > 1000) {
        console.warn('Processing queue too large, clearing old items');
        this.processingQueue = this.processingQueue.slice(-100);
      }

      await this.saveConfiguration();
      console.log('Background cleanup completed');
    } catch (error) {
      console.error('Background cleanup failed:', error);
    }
  }

  private async evaluateRulesOnExistingNotifications(): Promise<void> {
    try {
      // Get recent unprocessed notifications
      const notifications = await storageService.getNotifications(50, 0);
      const unprocessedNotifications = notifications.filter(n => 
        !n.extras?.rulesEvaluated && 
        Date.now() - n.timestamp < 24 * 60 * 60 * 1000 // Last 24 hours
      );

      if (unprocessedNotifications.length === 0) {
        return;
      }

      console.log(`Evaluating rules on ${unprocessedNotifications.length} existing notifications`);

      for (const notification of unprocessedNotifications) {
        try {
          const rulesResult = await rulesEngine.evaluateNotification(notification);
          
          if (rulesResult.modified) {
            // Update the notification with rule results
            await storageService.updateNotification(notification.id, {
              ...rulesResult.notification,
              extras: {
                ...notification.extras,
                rulesEvaluated: true,
                rulesAppliedAt: Date.now(),
              },
            });
            this.stats.rulesApplied++;
          } else {
            // Mark as evaluated even if no changes
            await storageService.updateNotification(notification.id, {
              extras: {
                ...notification.extras,
                rulesEvaluated: true,
                rulesAppliedAt: Date.now(),
              },
            });
          }
        } catch (error) {
          console.error(`Failed to evaluate rules for notification ${notification.id}:`, error);
        }
      }

      await this.saveConfiguration();
    } catch (error) {
      console.error('Rules evaluation on existing notifications failed:', error);
    }
  }

  private addProcessingError(error: string): void {
    this.stats.processingErrors.push(`${new Date().toISOString()}: ${error}`);
    
    // Keep only last 50 errors
    if (this.stats.processingErrors.length > 50) {
      this.stats.processingErrors = this.stats.processingErrors.slice(-50);
    }
  }

  // Public API methods
  isRunning(): boolean {
    return this.isRunning;
  }

  getStats(): ProcessingStats {
    return { ...this.stats };
  }

  getConfig(): BackgroundProcessingConfig {
    return { ...this.config };
  }

  async updateConfig(newConfig: Partial<BackgroundProcessingConfig>): Promise<void> {
    this.config = { ...this.config, ...newConfig };
    await this.saveConfiguration();

    // Restart background processing if running to apply new config
    if (this.isRunning) {
      await this.stopBackgroundProcessing();
      await this.startBackgroundProcessing();
    }
  }

  async resetStats(): Promise<void> {
    this.stats = {
      totalProcessed: 0,
      successfullyProcessed: 0,
      failedProcessing: 0,
      rulesApplied: 0,
      categorized: 0,
      prioritized: 0,
      averageProcessingTime: 0,
      processingErrors: [],
    };
    await this.saveConfiguration();
  }

  getQueueSize(): number {
    return this.processingQueue.length;
  }

  async processQueueNow(): Promise<boolean> {
    return await this.processNotificationQueue();
  }

  async testProcessing(notification: CapturedNotification): Promise<{
    processed: boolean;
    result?: SyncedNotification;
    error?: string;
  }> {
    try {
      await this.processNotification(notification);
      const result = await storageService.getNotificationById(notification.id);
      return {
        processed: true,
        result: result || undefined,
      };
    } catch (error) {
      return {
        processed: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export const backgroundProcessor = BackgroundProcessor.getInstance();