import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import { storageService } from './storage';
import { SyncedNotification } from '../types/notification';

const DIGEST_GENERATION_TASK = 'DIGEST_GENERATION_TASK';

export interface DigestConfig {
  enabled: boolean;
  generateMorningDigest: boolean;
  generateEveningDigest: boolean;
  morningDigestTime: string; // HH:MM format
  eveningDigestTime: string; // HH:MM format
  maxNotificationsInDigest: number;
  includeReadNotifications: boolean;
  includeDismissedNotifications: boolean;
  priorityThreshold: number; // Minimum priority to include
  categoriesEnabled: ('Work' | 'Personal' | 'Junk')[];
  lookbackHours: number; // How far back to look for notifications
  enableInsights: boolean;
  enableTrends: boolean;
}

export interface NotificationDigest {
  id: string;
  type: 'morning' | 'evening' | 'manual';
  generatedAt: number;
  periodStart: number;
  periodEnd: number;
  summary: DigestSummary;
  topNotifications: DigestNotification[];
  categoryBreakdown: CategoryBreakdown;
  insights: DigestInsight[];
  trends: DigestTrend[];
  actionableItems: ActionableItem[];
}

export interface DigestSummary {
  totalNotifications: number;
  unreadNotifications: number;
  highPriorityNotifications: number;
  categoryCounts: Record<string, number>;
  appCounts: Record<string, number>;
  timeDistribution: TimeDistribution;
  comparisonToPrevious?: {
    totalChange: number;
    categoryChanges: Record<string, number>;
    trendDirection: 'up' | 'down' | 'stable';
  };
}

export interface DigestNotification {
  id: string;
  title: string;
  body: string;
  appName: string;
  category: string;
  priority: number;
  timestamp: number;
  isRead: boolean;
  isDismissed: boolean;
  relevanceScore: number;
  tags?: string[];
}

export interface CategoryBreakdown {
  work: {
    count: number;
    unread: number;
    highPriority: number;
    topApps: string[];
    trends: string[];
  };
  personal: {
    count: number;
    unread: number;
    highPriority: number;
    topApps: string[];
    trends: string[];
  };
  junk: {
    count: number;
    unread: number;
    highPriority: number;
    topApps: string[];
    trends: string[];
  };
}

export interface DigestInsight {
  type: 'pattern' | 'anomaly' | 'recommendation' | 'achievement';
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'success';
  actionable: boolean;
  data?: any;
}

export interface DigestTrend {
  metric: string;
  direction: 'up' | 'down' | 'stable';
  change: number;
  period: string;
  significance: 'low' | 'medium' | 'high';
}

export interface ActionableItem {
  id: string;
  type: 'unread_important' | 'follow_up' | 'cleanup' | 'rule_suggestion';
  title: string;
  description: string;
  priority: number;
  notificationIds?: string[];
  suggestedAction?: string;
}

export interface TimeDistribution {
  morning: number; // 6-12
  afternoon: number; // 12-18
  evening: number; // 18-22
  night: number; // 22-6
}

export interface DigestStats {
  totalDigestsGenerated: number;
  morningDigests: number;
  eveningDigests: number;
  manualDigests: number;
  averageNotificationsPerDigest: number;
  averageGenerationTime: number;
  lastDigestGenerated?: number;
  digestEngagement: {
    viewed: number;
    actionsClicked: number;
    insightsViewed: number;
  };
}

class DigestGenerator {
  private static instance: DigestGenerator;
  private isRunning = false;
  private config: DigestConfig;
  private stats: DigestStats;
  private digestHistory: NotificationDigest[] = [];

  private constructor() {
    this.config = {
      enabled: true,
      generateMorningDigest: true,
      generateEveningDigest: false,
      morningDigestTime: '08:00',
      eveningDigestTime: '18:00',
      maxNotificationsInDigest: 10,
      includeReadNotifications: false,
      includeDismissedNotifications: false,
      priorityThreshold: 1,
      categoriesEnabled: ['Work', 'Personal'],
      lookbackHours: 16, // Since last evening
      enableInsights: true,
      enableTrends: true,
    };

    this.stats = {
      totalDigestsGenerated: 0,
      morningDigests: 0,
      eveningDigests: 0,
      manualDigests: 0,
      averageNotificationsPerDigest: 0,
      averageGenerationTime: 0,
      digestEngagement: {
        viewed: 0,
        actionsClicked: 0,
        insightsViewed: 0,
      },
    };

    this.setupTaskManager();
    this.loadConfiguration();
  }

  static getInstance(): DigestGenerator {
    if (!DigestGenerator.instance) {
      DigestGenerator.instance = new DigestGenerator();
    }
    return DigestGenerator.instance;
  }

  private async loadConfiguration(): Promise<void> {
    try {
      const config = await storageService.getSetting<DigestConfig>('digest_config');
      if (config) {
        this.config = { ...this.config, ...config };
      }

      const stats = await storageService.getSetting<DigestStats>('digest_stats');
      if (stats) {
        this.stats = { ...this.stats, ...stats };
      }

      const history = await storageService.getSetting<NotificationDigest[]>('digest_history', []);
      this.digestHistory = history;
    } catch (error) {
      console.error('Failed to load digest configuration:', error);
    }
  }

  private async saveConfiguration(): Promise<void> {
    try {
      await storageService.setSetting('digest_config', this.config);
      await storageService.setSetting('digest_stats', this.stats);
      await storageService.setSetting('digest_history', this.digestHistory);
    } catch (error) {
      console.error('Failed to save digest configuration:', error);
    }
  }

  private setupTaskManager(): void {
    TaskManager.defineTask(DIGEST_GENERATION_TASK, async () => {
      try {
        if (!this.config.enabled) {
          return BackgroundFetch.BackgroundFetchResult.NoData;
        }

        const shouldGenerate = await this.shouldGenerateScheduledDigest();
        if (shouldGenerate) {
          await this.generateScheduledDigest();
          return BackgroundFetch.BackgroundFetchResult.NewData;
        }

        return BackgroundFetch.BackgroundFetchResult.NoData;
      } catch (error) {
        console.error('Digest generation task failed:', error);
        return BackgroundFetch.BackgroundFetchResult.Failed;
      }
    });
  }

  async startDigestGeneration(): Promise<boolean> {
    if (this.isRunning) {
      console.log('Digest generation is already running');
      return true;
    }

    try {
      await storageService.initialize();

      // Register background task to check for scheduled digests
      await BackgroundFetch.registerTaskAsync(DIGEST_GENERATION_TASK, {
        minimumInterval: 3600, // Check every hour
        stopOnTerminate: false,
        startOnBoot: true,
      });

      this.isRunning = true;
      console.log('Digest generation started successfully');
      return true;
    } catch (error) {
      console.error('Failed to start digest generation:', error);
      return false;
    }
  }

  async stopDigestGeneration(): Promise<void> {
    if (!this.isRunning) {
      console.log('Digest generation is not running');
      return;
    }

    try {
      await BackgroundFetch.unregisterTaskAsync(DIGEST_GENERATION_TASK);
      this.isRunning = false;
      console.log('Digest generation stopped successfully');
    } catch (error) {
      console.error('Failed to stop digest generation:', error);
    }
  }

  private async shouldGenerateScheduledDigest(): Promise<boolean> {
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    // Check if it's time for morning digest
    if (this.config.generateMorningDigest && this.isTimeMatch(currentTime, this.config.morningDigestTime)) {
      const lastMorningDigest = this.digestHistory
        .filter(d => d.type === 'morning')
        .sort((a, b) => b.generatedAt - a.generatedAt)[0];
      
      // Only generate if we haven't generated one today
      if (!lastMorningDigest || !this.isSameDay(lastMorningDigest.generatedAt, now.getTime())) {
        return true;
      }
    }

    // Check if it's time for evening digest
    if (this.config.generateEveningDigest && this.isTimeMatch(currentTime, this.config.eveningDigestTime)) {
      const lastEveningDigest = this.digestHistory
        .filter(d => d.type === 'evening')
        .sort((a, b) => b.generatedAt - a.generatedAt)[0];
      
      // Only generate if we haven't generated one today
      if (!lastEveningDigest || !this.isSameDay(lastEveningDigest.generatedAt, now.getTime())) {
        return true;
      }
    }

    return false;
  }

  private isTimeMatch(currentTime: string, targetTime: string): boolean {
    // Allow 5-minute window for scheduled time
    const current = this.timeToMinutes(currentTime);
    const target = this.timeToMinutes(targetTime);
    return Math.abs(current - target) <= 5;
  }

  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  private isSameDay(timestamp1: number, timestamp2: number): boolean {
    const date1 = new Date(timestamp1);
    const date2 = new Date(timestamp2);
    return date1.toDateString() === date2.toDateString();
  }

  private async generateScheduledDigest(): Promise<void> {
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    let digestType: 'morning' | 'evening';
    
    if (this.config.generateMorningDigest && this.isTimeMatch(currentTime, this.config.morningDigestTime)) {
      digestType = 'morning';
    } else if (this.config.generateEveningDigest && this.isTimeMatch(currentTime, this.config.eveningDigestTime)) {
      digestType = 'evening';
    } else {
      return;
    }

    await this.generateDigest(digestType);
  }

  async generateDigest(type: 'morning' | 'evening' | 'manual' = 'manual'): Promise<NotificationDigest> {
    const startTime = Date.now();
    
    try {
      console.log(`Generating ${type} digest...`);

      // Determine time period for digest
      const { periodStart, periodEnd } = this.calculateDigestPeriod(type);

      // Get notifications for the period
      const notifications = await this.getNotificationsForPeriod(periodStart, periodEnd);

      // Filter and process notifications
      const processedNotifications = this.filterAndProcessNotifications(notifications);

      // Generate digest components
      const summary = await this.generateSummary(processedNotifications, periodStart, periodEnd);
      const topNotifications = this.selectTopNotifications(processedNotifications);
      const categoryBreakdown = this.generateCategoryBreakdown(processedNotifications);
      const insights = await this.generateInsights(processedNotifications, summary);
      const trends = await this.generateTrends(processedNotifications, type);
      const actionableItems = this.generateActionableItems(processedNotifications);

      // Create digest
      const digest: NotificationDigest = {
        id: `digest_${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type,
        generatedAt: Date.now(),
        periodStart,
        periodEnd,
        summary,
        topNotifications,
        categoryBreakdown,
        insights,
        trends,
        actionableItems,
      };

      // Save digest to history
      this.digestHistory.unshift(digest);
      
      // Keep only last 30 digests
      if (this.digestHistory.length > 30) {
        this.digestHistory = this.digestHistory.slice(0, 30);
      }

      // Update statistics
      this.updateDigestStats(digest, Date.now() - startTime);

      await this.saveConfiguration();

      console.log(`${type} digest generated successfully with ${topNotifications.length} notifications`);
      return digest;

    } catch (error) {
      console.error('Failed to generate digest:', error);
      throw error;
    }
  }

  private calculateDigestPeriod(type: 'morning' | 'evening' | 'manual'): { periodStart: number; periodEnd: number } {
    const now = Date.now();
    const lookbackMs = this.config.lookbackHours * 60 * 60 * 1000;

    switch (type) {
      case 'morning':
        // Morning digest: from yesterday evening to now
        const yesterdayEvening = new Date();
        yesterdayEvening.setDate(yesterdayEvening.getDate() - 1);
        yesterdayEvening.setHours(18, 0, 0, 0); // 6 PM yesterday
        return {
          periodStart: yesterdayEvening.getTime(),
          periodEnd: now,
        };

      case 'evening':
        // Evening digest: from this morning to now
        const thisMorning = new Date();
        thisMorning.setHours(6, 0, 0, 0); // 6 AM today
        return {
          periodStart: thisMorning.getTime(),
          periodEnd: now,
        };

      case 'manual':
      default:
        // Manual digest: configurable lookback period
        return {
          periodStart: now - lookbackMs,
          periodEnd: now,
        };
    }
  }

  private async getNotificationsForPeriod(periodStart: number, periodEnd: number): Promise<SyncedNotification[]> {
    // Get all notifications and filter by time period
    const allNotifications = await storageService.getNotifications(1000, 0);
    
    return allNotifications.filter(notification => 
      notification.timestamp >= periodStart && 
      notification.timestamp <= periodEnd
    );
  }

  private filterAndProcessNotifications(notifications: SyncedNotification[]): SyncedNotification[] {
    return notifications.filter(notification => {
      // Filter by enabled categories
      if (!this.config.categoriesEnabled.includes(notification.category as any)) {
        return false;
      }

      // Filter by priority threshold
      if (notification.priority < this.config.priorityThreshold) {
        return false;
      }

      // Filter by read/dismissed status
      if (!this.config.includeReadNotifications && notification.isRead) {
        return false;
      }

      if (!this.config.includeDismissedNotifications && notification.isDismissed) {
        return false;
      }

      return true;
    });
  }

  private async generateSummary(
    notifications: SyncedNotification[], 
    periodStart: number, 
    periodEnd: number
  ): Promise<DigestSummary> {
    const totalNotifications = notifications.length;
    const unreadNotifications = notifications.filter(n => !n.isRead).length;
    const highPriorityNotifications = notifications.filter(n => n.priority >= 3).length;

    // Category counts
    const categoryCounts = notifications.reduce((counts, notification) => {
      const category = notification.category || 'Personal';
      counts[category] = (counts[category] || 0) + 1;
      return counts;
    }, {} as Record<string, number>);

    // App counts
    const appCounts = notifications.reduce((counts, notification) => {
      counts[notification.appName] = (counts[notification.appName] || 0) + 1;
      return counts;
    }, {} as Record<string, number>);

    // Time distribution
    const timeDistribution = this.calculateTimeDistribution(notifications);

    // Comparison to previous period
    const comparisonToPrevious = await this.generateComparison(notifications, periodStart, periodEnd);

    return {
      totalNotifications,
      unreadNotifications,
      highPriorityNotifications,
      categoryCounts,
      appCounts,
      timeDistribution,
      comparisonToPrevious,
    };
  }

  private calculateTimeDistribution(notifications: SyncedNotification[]): TimeDistribution {
    const distribution = {
      morning: 0,   // 6-12
      afternoon: 0, // 12-18
      evening: 0,   // 18-22
      night: 0,     // 22-6
    };

    notifications.forEach(notification => {
      const hour = new Date(notification.timestamp).getHours();
      
      if (hour >= 6 && hour < 12) {
        distribution.morning++;
      } else if (hour >= 12 && hour < 18) {
        distribution.afternoon++;
      } else if (hour >= 18 && hour < 22) {
        distribution.evening++;
      } else {
        distribution.night++;
      }
    });

    return distribution;
  }

  private async generateComparison(
    currentNotifications: SyncedNotification[], 
    periodStart: number, 
    periodEnd: number
  ): Promise<DigestSummary['comparisonToPrevious']> {
    try {
      // Get notifications from previous period
      const periodDuration = periodEnd - periodStart;
      const previousPeriodStart = periodStart - periodDuration;
      const previousPeriodEnd = periodStart;

      const previousNotifications = await this.getNotificationsForPeriod(
        previousPeriodStart, 
        previousPeriodEnd
      );

      const currentTotal = currentNotifications.length;
      const previousTotal = previousNotifications.length;
      const totalChange = currentTotal - previousTotal;

      // Category changes
      const currentCategories = currentNotifications.reduce((counts, n) => {
        const category = n.category || 'Personal';
        counts[category] = (counts[category] || 0) + 1;
        return counts;
      }, {} as Record<string, number>);

      const previousCategories = previousNotifications.reduce((counts, n) => {
        const category = n.category || 'Personal';
        counts[category] = (counts[category] || 0) + 1;
        return counts;
      }, {} as Record<string, number>);

      const categoryChanges: Record<string, number> = {};
      for (const category of ['Work', 'Personal', 'Junk']) {
        const current = currentCategories[category] || 0;
        const previous = previousCategories[category] || 0;
        categoryChanges[category] = current - previous;
      }

      // Trend direction
      let trendDirection: 'up' | 'down' | 'stable';
      if (Math.abs(totalChange) <= 2) {
        trendDirection = 'stable';
      } else if (totalChange > 0) {
        trendDirection = 'up';
      } else {
        trendDirection = 'down';
      }

      return {
        totalChange,
        categoryChanges,
        trendDirection,
      };
    } catch (error) {
      console.error('Failed to generate comparison:', error);
      return undefined;
    }
  }

  private selectTopNotifications(notifications: SyncedNotification[]): DigestNotification[] {
    // Calculate relevance score for each notification
    const scoredNotifications = notifications.map(notification => {
      const relevanceScore = this.calculateRelevanceScore(notification);
      
      return {
        id: notification.id,
        title: notification.title,
        body: notification.body,
        appName: notification.appName,
        category: notification.category || 'Personal',
        priority: notification.priority,
        timestamp: notification.timestamp,
        isRead: notification.isRead,
        isDismissed: notification.isDismissed,
        relevanceScore,
        tags: notification.extras?.tags,
      };
    });

    // Sort by relevance score and take top notifications
    return scoredNotifications
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, this.config.maxNotificationsInDigest);
  }

  private calculateRelevanceScore(notification: SyncedNotification): number {
    let score = 0;

    // Base score from priority
    score += notification.priority * 10;

    // Boost for unread notifications
    if (!notification.isRead) {
      score += 15;
    }

    // Boost for recent notifications
    const age = Date.now() - notification.timestamp;
    const ageHours = age / (1000 * 60 * 60);
    if (ageHours < 2) score += 10;
    else if (ageHours < 6) score += 5;

    // Boost for work notifications during work hours
    const hour = new Date(notification.timestamp).getHours();
    if (notification.category === 'Work' && hour >= 9 && hour <= 17) {
      score += 8;
    }

    // Boost for OTP and security notifications
    const text = `${notification.title} ${notification.body}`.toLowerCase();
    if (text.includes('otp') || text.includes('verification') || text.includes('security')) {
      score += 20;
    }

    // Penalty for junk
    if (notification.category === 'Junk') {
      score -= 10;
    }

    // Penalty for dismissed notifications
    if (notification.isDismissed) {
      score -= 5;
    }

    return Math.max(0, score);
  }

  private generateCategoryBreakdown(notifications: SyncedNotification[]): CategoryBreakdown {
    const categories = ['Work', 'Personal', 'Junk'] as const;
    const breakdown = {} as CategoryBreakdown;

    for (const category of categories) {
      const categoryNotifications = notifications.filter(n => n.category === category);
      const unread = categoryNotifications.filter(n => !n.isRead).length;
      const highPriority = categoryNotifications.filter(n => n.priority >= 3).length;
      
      // Top apps for this category
      const appCounts = categoryNotifications.reduce((counts, n) => {
        counts[n.appName] = (counts[n.appName] || 0) + 1;
        return counts;
      }, {} as Record<string, number>);
      
      const topApps = Object.entries(appCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([app]) => app);

      // Generate trends for this category
      const trends = this.generateCategoryTrends(categoryNotifications);

      breakdown[category.toLowerCase() as keyof CategoryBreakdown] = {
        count: categoryNotifications.length,
        unread,
        highPriority,
        topApps,
        trends,
      };
    }

    return breakdown;
  }

  private generateCategoryTrends(notifications: SyncedNotification[]): string[] {
    const trends: string[] = [];

    if (notifications.length === 0) return trends;

    // Analyze patterns
    const hourCounts = notifications.reduce((counts, n) => {
      const hour = new Date(n.timestamp).getHours();
      counts[hour] = (counts[hour] || 0) + 1;
      return counts;
    }, {} as Record<number, number>);

    const peakHour = Object.entries(hourCounts)
      .sort(([, a], [, b]) => b - a)[0];

    if (peakHour) {
      trends.push(`Peak activity at ${peakHour[0]}:00`);
    }

    // Check for high unread rate
    const unreadRate = notifications.filter(n => !n.isRead).length / notifications.length;
    if (unreadRate > 0.7) {
      trends.push('High unread rate');
    }

    // Check for high priority notifications
    const highPriorityRate = notifications.filter(n => n.priority >= 3).length / notifications.length;
    if (highPriorityRate > 0.3) {
      trends.push('Many high priority items');
    }

    return trends;
  }

  private async generateInsights(
    notifications: SyncedNotification[], 
    summary: DigestSummary
  ): Promise<DigestInsight[]> {
    const insights: DigestInsight[] = [];

    if (!this.config.enableInsights) return insights;

    // Insight: High unread rate
    if (summary.unreadNotifications > summary.totalNotifications * 0.7) {
      insights.push({
        type: 'pattern',
        title: 'High Unread Rate',
        description: `You have ${summary.unreadNotifications} unread notifications out of ${summary.totalNotifications} total. Consider reviewing and organizing them.`,
        severity: 'warning',
        actionable: true,
      });
    }

    // Insight: Quiet period achievement
    if (summary.totalNotifications < 5) {
      insights.push({
        type: 'achievement',
        title: 'Quiet Period',
        description: 'You had a relatively quiet notification period. Great for focus!',
        severity: 'success',
        actionable: false,
      });
    }

    // Insight: Work-life balance
    const workCount = summary.categoryCounts.Work || 0;
    const personalCount = summary.categoryCounts.Personal || 0;
    const workRatio = workCount / (workCount + personalCount);

    if (workRatio > 0.8) {
      insights.push({
        type: 'pattern',
        title: 'Work-Heavy Period',
        description: 'Most of your notifications were work-related. Consider setting boundaries for better work-life balance.',
        severity: 'info',
        actionable: true,
      });
    }

    // Insight: Night-time notifications
    if (summary.timeDistribution.night > summary.totalNotifications * 0.3) {
      insights.push({
        type: 'recommendation',
        title: 'Night-time Notifications',
        description: 'You received many notifications during night hours. Consider enabling Do Not Disturb mode.',
        severity: 'warning',
        actionable: true,
      });
    }

    // Insight: App dominance
    const topApp = Object.entries(summary.appCounts)
      .sort(([, a], [, b]) => b - a)[0];
    
    if (topApp && topApp[1] > summary.totalNotifications * 0.4) {
      insights.push({
        type: 'pattern',
        title: 'App Dominance',
        description: `${topApp[0]} sent ${topApp[1]} notifications (${Math.round(topApp[1] / summary.totalNotifications * 100)}% of total). Consider adjusting notification settings for this app.`,
        severity: 'info',
        actionable: true,
        data: { appName: topApp[0], count: topApp[1] },
      });
    }

    return insights;
  }

  private async generateTrends(
    notifications: SyncedNotification[], 
    digestType: 'morning' | 'evening' | 'manual'
  ): Promise<DigestTrend[]> {
    const trends: DigestTrend[] = [];

    if (!this.config.enableTrends) return trends;

    try {
      // Compare with previous digest of same type
      const previousDigest = this.digestHistory
        .filter(d => d.type === digestType)
        .sort((a, b) => b.generatedAt - a.generatedAt)[0];

      if (!previousDigest) return trends;

      // Total notifications trend
      const currentTotal = notifications.length;
      const previousTotal = previousDigest.summary.totalNotifications;
      const totalChange = currentTotal - previousTotal;
      const totalChangePercent = previousTotal > 0 ? (totalChange / previousTotal) * 100 : 0;

      trends.push({
        metric: 'Total Notifications',
        direction: totalChange > 0 ? 'up' : totalChange < 0 ? 'down' : 'stable',
        change: Math.abs(totalChangePercent),
        period: 'vs previous period',
        significance: Math.abs(totalChangePercent) > 20 ? 'high' : Math.abs(totalChangePercent) > 10 ? 'medium' : 'low',
      });

      // Category trends
      const categories = ['Work', 'Personal', 'Junk'];
      for (const category of categories) {
        const currentCount = notifications.filter(n => n.category === category).length;
        const previousCount = previousDigest.summary.categoryCounts[category] || 0;
        const change = currentCount - previousCount;
        const changePercent = previousCount > 0 ? (change / previousCount) * 100 : 0;

        if (Math.abs(changePercent) > 15) {
          trends.push({
            metric: `${category} Notifications`,
            direction: change > 0 ? 'up' : change < 0 ? 'down' : 'stable',
            change: Math.abs(changePercent),
            period: 'vs previous period',
            significance: Math.abs(changePercent) > 50 ? 'high' : Math.abs(changePercent) > 25 ? 'medium' : 'low',
          });
        }
      }

    } catch (error) {
      console.error('Failed to generate trends:', error);
    }

    return trends;
  }

  private generateActionableItems(notifications: SyncedNotification[]): ActionableItem[] {
    const actionableItems: ActionableItem[] = [];

    // Unread important notifications
    const unreadImportant = notifications.filter(n => !n.isRead && n.priority >= 2);
    if (unreadImportant.length > 0) {
      actionableItems.push({
        id: 'unread_important',
        type: 'unread_important',
        title: `${unreadImportant.length} Unread Important Notifications`,
        description: 'You have important notifications that need attention.',
        priority: 3,
        notificationIds: unreadImportant.map(n => n.id),
        suggestedAction: 'Review and mark as read',
      });
    }

    // OTP notifications that might need follow-up
    const otpNotifications = notifications.filter(n => {
      const text = `${n.title} ${n.body}`.toLowerCase();
      return text.includes('otp') || text.includes('verification code');
    });

    if (otpNotifications.length > 0) {
      actionableItems.push({
        id: 'otp_follow_up',
        type: 'follow_up',
        title: `${otpNotifications.length} OTP/Verification Codes`,
        description: 'Make sure you used these verification codes for their intended purpose.',
        priority: 2,
        notificationIds: otpNotifications.map(n => n.id),
        suggestedAction: 'Verify usage and mark as read',
      });
    }

    // Too many junk notifications - suggest cleanup
    const junkNotifications = notifications.filter(n => n.category === 'Junk');
    if (junkNotifications.length > 10) {
      actionableItems.push({
        id: 'junk_cleanup',
        type: 'cleanup',
        title: `${junkNotifications.length} Junk Notifications`,
        description: 'Consider unsubscribing from apps sending too many promotional notifications.',
        priority: 1,
        notificationIds: junkNotifications.map(n => n.id),
        suggestedAction: 'Review and unsubscribe from unwanted sources',
      });
    }

    // Rule suggestions based on patterns
    const appCounts = notifications.reduce((counts, n) => {
      counts[n.appName] = (counts[n.appName] || 0) + 1;
      return counts;
    }, {} as Record<string, number>);

    const noisyApps = Object.entries(appCounts)
      .filter(([, count]) => count > 5)
      .map(([app]) => app);

    if (noisyApps.length > 0) {
      actionableItems.push({
        id: 'rule_suggestion',
        type: 'rule_suggestion',
        title: 'Create Notification Rules',
        description: `Apps like ${noisyApps.slice(0, 2).join(', ')} sent many notifications. Consider creating rules to manage them better.`,
        priority: 2,
        suggestedAction: 'Create filtering rules for noisy apps',
      });
    }

    return actionableItems.sort((a, b) => b.priority - a.priority);
  }

  private updateDigestStats(digest: NotificationDigest, generationTime: number): void {
    this.stats.totalDigestsGenerated++;
    
    switch (digest.type) {
      case 'morning':
        this.stats.morningDigests++;
        break;
      case 'evening':
        this.stats.eveningDigests++;
        break;
      case 'manual':
        this.stats.manualDigests++;
        break;
    }

    // Update averages
    const totalNotifications = digest.topNotifications.length;
    this.stats.averageNotificationsPerDigest = 
      (this.stats.averageNotificationsPerDigest + totalNotifications) / 2;

    this.stats.averageGenerationTime = 
      (this.stats.averageGenerationTime + generationTime) / 2;

    this.stats.lastDigestGenerated = digest.generatedAt;
  }

  // Public API methods
  isRunning(): boolean {
    return this.isRunning;
  }

  getConfig(): DigestConfig {
    return { ...this.config };
  }

  async updateConfig(newConfig: Partial<DigestConfig>): Promise<void> {
    this.config = { ...this.config, ...newConfig };
    await this.saveConfiguration();
  }

  getStats(): DigestStats {
    return { ...this.stats };
  }

  async resetStats(): Promise<void> {
    this.stats = {
      totalDigestsGenerated: 0,
      morningDigests: 0,
      eveningDigests: 0,
      manualDigests: 0,
      averageNotificationsPerDigest: 0,
      averageGenerationTime: 0,
      digestEngagement: {
        viewed: 0,
        actionsClicked: 0,
        insightsViewed: 0,
      },
    };
    await this.saveConfiguration();
  }

  getDigestHistory(limit = 10): NotificationDigest[] {
    return this.digestHistory.slice(0, limit);
  }

  getLatestDigest(): NotificationDigest | null {
    return this.digestHistory[0] || null;
  }

  async getDigestById(id: string): Promise<NotificationDigest | null> {
    return this.digestHistory.find(d => d.id === id) || null;
  }

  async markDigestAsViewed(digestId: string): Promise<void> {
    this.stats.digestEngagement.viewed++;
    await this.saveConfiguration();
  }

  async markActionClicked(digestId: string, actionId: string): Promise<void> {
    this.stats.digestEngagement.actionsClicked++;
    await this.saveConfiguration();
  }

  async markInsightViewed(digestId: string, insightType: string): Promise<void> {
    this.stats.digestEngagement.insightsViewed++;
    await this.saveConfiguration();
  }

  async clearDigestHistory(): Promise<void> {
    this.digestHistory = [];
    await this.saveConfiguration();
  }

  // Generate digest for specific time range
  async generateCustomDigest(
    startTime: number, 
    endTime: number, 
    options?: Partial<DigestConfig>
  ): Promise<NotificationDigest> {
    const originalConfig = { ...this.config };
    
    if (options) {
      this.config = { ...this.config, ...options };
    }

    try {
      const notifications = await this.getNotificationsForPeriod(startTime, endTime);
      const processedNotifications = this.filterAndProcessNotifications(notifications);

      const summary = await this.generateSummary(processedNotifications, startTime, endTime);
      const topNotifications = this.selectTopNotifications(processedNotifications);
      const categoryBreakdown = this.generateCategoryBreakdown(processedNotifications);
      const insights = await this.generateInsights(processedNotifications, summary);
      const trends: DigestTrend[] = []; // No trends for custom digests
      const actionableItems = this.generateActionableItems(processedNotifications);

      const digest: NotificationDigest = {
        id: `digest_custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'manual',
        generatedAt: Date.now(),
        periodStart: startTime,
        periodEnd: endTime,
        summary,
        topNotifications,
        categoryBreakdown,
        insights,
        trends,
        actionableItems,
      };

      return digest;
    } finally {
      this.config = originalConfig;
    }
  }
}

export const digestGenerator = DigestGenerator.getInstance();