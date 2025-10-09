import { digestGenerator, NotificationDigest, DigestConfig } from '../digestGenerator';
import { storageService } from '../storage';
import { SyncedNotification } from '../../types/notification';

// Mock dependencies
jest.mock('../storage');
jest.mock('expo-task-manager');
jest.mock('expo-background-fetch');

const mockStorageService = storageService as jest.Mocked<typeof storageService>;

describe('DigestGenerator', () => {
  const mockNotifications: SyncedNotification[] = [
    {
      id: 'notif-1',
      appName: 'Slack',
      title: 'New message from John',
      body: 'Hey, can we discuss the project?',
      category: 'Work',
      priority: 2,
      timestamp: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
      packageName: 'com.slack.android',
      synced: true,
      syncAttempts: 0,
      isRead: false,
      isDismissed: false,
    },
    {
      id: 'notif-2',
      appName: 'WhatsApp',
      title: 'Mom',
      body: 'Don\'t forget dinner tonight!',
      category: 'Personal',
      priority: 1,
      timestamp: Date.now() - 1 * 60 * 60 * 1000, // 1 hour ago
      packageName: 'com.whatsapp',
      synced: true,
      syncAttempts: 0,
      isRead: false,
      isDismissed: false,
    },
    {
      id: 'notif-3',
      appName: 'Bank App',
      title: 'Security Alert',
      body: 'Your OTP is 123456',
      category: 'Personal',
      priority: 3,
      timestamp: Date.now() - 30 * 60 * 1000, // 30 minutes ago
      packageName: 'com.bank.app',
      synced: true,
      syncAttempts: 0,
      isRead: false,
      isDismissed: false,
    },
    {
      id: 'notif-4',
      appName: 'Shopping App',
      title: 'Flash Sale!',
      body: 'Limited time offer - 50% off everything!',
      category: 'Junk',
      priority: 0,
      timestamp: Date.now() - 4 * 60 * 60 * 1000, // 4 hours ago
      packageName: 'com.shopping.app',
      synced: true,
      syncAttempts: 0,
      isRead: true,
      isDismissed: false,
    },
    {
      id: 'notif-5',
      appName: 'Email',
      title: 'Meeting Reminder',
      body: 'Team standup in 15 minutes',
      category: 'Work',
      priority: 2,
      timestamp: Date.now() - 15 * 60 * 1000, // 15 minutes ago
      packageName: 'com.google.android.gm',
      synced: true,
      syncAttempts: 0,
      isRead: false,
      isDismissed: false,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    
    // Mock current time to a specific date for consistent testing
    const mockDate = new Date('2024-01-15T10:00:00Z');
    jest.setSystemTime(mockDate);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      mockStorageService.initialize.mockResolvedValue();
      mockStorageService.getSetting.mockResolvedValue(undefined);

      const result = await digestGenerator.startDigestGeneration();
      
      expect(result).toBe(true);
      expect(mockStorageService.initialize).toHaveBeenCalled();
    });

    it('should load existing configuration', async () => {
      const mockConfig: Partial<DigestConfig> = {
        enabled: true,
        maxNotificationsInDigest: 15,
        lookbackHours: 24,
      };

      mockStorageService.initialize.mockResolvedValue();
      mockStorageService.getSetting
        .mockResolvedValueOnce(mockConfig)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([]);

      await digestGenerator.startDigestGeneration();
      
      const config = digestGenerator.getConfig();
      expect(config.maxNotificationsInDigest).toBe(15);
      expect(config.lookbackHours).toBe(24);
    });
  });

  describe('digest generation', () => {
    beforeEach(async () => {
      mockStorageService.initialize.mockResolvedValue();
      mockStorageService.getSetting.mockResolvedValue(undefined);
      mockStorageService.setSetting.mockResolvedValue();
      await digestGenerator.startDigestGeneration();
    });

    it('should generate morning digest', async () => {
      mockStorageService.getNotifications.mockResolvedValue(mockNotifications);

      const digest = await digestGenerator.generateDigest('morning');
      
      expect(digest).toBeDefined();
      expect(digest.type).toBe('morning');
      expect(digest.summary).toBeDefined();
      expect(digest.topNotifications).toBeDefined();
      expect(digest.categoryBreakdown).toBeDefined();
      expect(digest.insights).toBeDefined();
      expect(digest.actionableItems).toBeDefined();
    });

    it('should generate evening digest', async () => {
      mockStorageService.getNotifications.mockResolvedValue(mockNotifications);

      const digest = await digestGenerator.generateDigest('evening');
      
      expect(digest).toBeDefined();
      expect(digest.type).toBe('evening');
      expect(digest.periodStart).toBeLessThan(digest.periodEnd);
    });

    it('should generate manual digest', async () => {
      mockStorageService.getNotifications.mockResolvedValue(mockNotifications);

      const digest = await digestGenerator.generateDigest('manual');
      
      expect(digest).toBeDefined();
      expect(digest.type).toBe('manual');
    });

    it('should filter notifications by configuration', async () => {
      // Update config to exclude junk notifications
      await digestGenerator.updateConfig({
        categoriesEnabled: ['Work', 'Personal'],
        includeReadNotifications: false,
      });

      mockStorageService.getNotifications.mockResolvedValue(mockNotifications);

      const digest = await digestGenerator.generateDigest('manual');
      
      // Should exclude junk and read notifications
      const junkNotifications = digest.topNotifications.filter(n => n.category === 'Junk');
      const readNotifications = digest.topNotifications.filter(n => n.isRead);
      
      expect(junkNotifications).toHaveLength(0);
      expect(readNotifications).toHaveLength(0);
    });

    it('should limit notifications in digest', async () => {
      await digestGenerator.updateConfig({
        maxNotificationsInDigest: 3,
      });

      mockStorageService.getNotifications.mockResolvedValue(mockNotifications);

      const digest = await digestGenerator.generateDigest('manual');
      
      expect(digest.topNotifications.length).toBeLessThanOrEqual(3);
    });
  });

  describe('summary generation', () => {
    beforeEach(async () => {
      mockStorageService.initialize.mockResolvedValue();
      mockStorageService.getSetting.mockResolvedValue(undefined);
      mockStorageService.setSetting.mockResolvedValue();
      await digestGenerator.startDigestGeneration();
    });

    it('should generate accurate summary statistics', async () => {
      mockStorageService.getNotifications.mockResolvedValue(mockNotifications);

      const digest = await digestGenerator.generateDigest('manual');
      
      expect(digest.summary.totalNotifications).toBe(4); // Excluding junk by default
      expect(digest.summary.unreadNotifications).toBe(4); // All work/personal are unread
      expect(digest.summary.highPriorityNotifications).toBe(1); // Only OTP notification
      expect(digest.summary.categoryCounts.Work).toBe(2);
      expect(digest.summary.categoryCounts.Personal).toBe(2);
    });

    it('should calculate time distribution correctly', async () => {
      mockStorageService.getNotifications.mockResolvedValue(mockNotifications);

      const digest = await digestGenerator.generateDigest('manual');
      
      expect(digest.summary.timeDistribution).toBeDefined();
      expect(typeof digest.summary.timeDistribution.morning).toBe('number');
      expect(typeof digest.summary.timeDistribution.afternoon).toBe('number');
      expect(typeof digest.summary.timeDistribution.evening).toBe('number');
      expect(typeof digest.summary.timeDistribution.night).toBe('number');
    });

    it('should track app counts', async () => {
      mockStorageService.getNotifications.mockResolvedValue(mockNotifications);

      const digest = await digestGenerator.generateDigest('manual');
      
      expect(digest.summary.appCounts).toBeDefined();
      expect(digest.summary.appCounts['Slack']).toBe(1);
      expect(digest.summary.appCounts['WhatsApp']).toBe(1);
      expect(digest.summary.appCounts['Bank App']).toBe(1);
      expect(digest.summary.appCounts['Email']).toBe(1);
    });
  });

  describe('relevance scoring', () => {
    beforeEach(async () => {
      mockStorageService.initialize.mockResolvedValue();
      mockStorageService.getSetting.mockResolvedValue(undefined);
      mockStorageService.setSetting.mockResolvedValue();
      await digestGenerator.startDigestGeneration();
    });

    it('should prioritize high priority notifications', async () => {
      mockStorageService.getNotifications.mockResolvedValue(mockNotifications);

      const digest = await digestGenerator.generateDigest('manual');
      
      // OTP notification should be first due to high priority and security content
      const topNotification = digest.topNotifications[0];
      expect(topNotification.title).toBe('Security Alert');
      expect(topNotification.priority).toBe(3);
    });

    it('should boost OTP and security notifications', async () => {
      const otpNotification: SyncedNotification = {
        ...mockNotifications[0],
        title: 'Verification Code',
        body: 'Your OTP is 654321',
        priority: 1, // Lower base priority
      };

      mockStorageService.getNotifications.mockResolvedValue([otpNotification, ...mockNotifications.slice(1)]);

      const digest = await digestGenerator.generateDigest('manual');
      
      // OTP notification should still rank high despite lower base priority
      const otpInDigest = digest.topNotifications.find(n => n.body.includes('654321'));
      expect(otpInDigest).toBeDefined();
      expect(otpInDigest?.relevanceScore).toBeGreaterThan(20); // Should get OTP boost
    });

    it('should penalize junk notifications', async () => {
      await digestGenerator.updateConfig({
        categoriesEnabled: ['Work', 'Personal', 'Junk'], // Include junk for this test
      });

      mockStorageService.getNotifications.mockResolvedValue(mockNotifications);

      const digest = await digestGenerator.generateDigest('manual');
      
      const junkNotification = digest.topNotifications.find(n => n.category === 'Junk');
      if (junkNotification) {
        // Junk notifications should have lower relevance scores
        const workNotification = digest.topNotifications.find(n => n.category === 'Work');
        expect(junkNotification.relevanceScore).toBeLessThan(workNotification?.relevanceScore || 0);
      }
    });
  });

  describe('category breakdown', () => {
    beforeEach(async () => {
      mockStorageService.initialize.mockResolvedValue();
      mockStorageService.getSetting.mockResolvedValue(undefined);
      mockStorageService.setSetting.mockResolvedValue();
      await digestGenerator.startDigestGeneration();
    });

    it('should generate category breakdown', async () => {
      mockStorageService.getNotifications.mockResolvedValue(mockNotifications);

      const digest = await digestGenerator.generateDigest('manual');
      
      expect(digest.categoryBreakdown.work).toBeDefined();
      expect(digest.categoryBreakdown.personal).toBeDefined();
      expect(digest.categoryBreakdown.junk).toBeDefined();
      
      expect(digest.categoryBreakdown.work.count).toBe(2);
      expect(digest.categoryBreakdown.personal.count).toBe(2);
      expect(digest.categoryBreakdown.work.unread).toBe(2);
      expect(digest.categoryBreakdown.personal.highPriority).toBe(1); // OTP notification
    });

    it('should identify top apps per category', async () => {
      mockStorageService.getNotifications.mockResolvedValue(mockNotifications);

      const digest = await digestGenerator.generateDigest('manual');
      
      expect(digest.categoryBreakdown.work.topApps).toContain('Slack');
      expect(digest.categoryBreakdown.work.topApps).toContain('Email');
      expect(digest.categoryBreakdown.personal.topApps).toContain('WhatsApp');
      expect(digest.categoryBreakdown.personal.topApps).toContain('Bank App');
    });
  });

  describe('insights generation', () => {
    beforeEach(async () => {
      mockStorageService.initialize.mockResolvedValue();
      mockStorageService.getSetting.mockResolvedValue(undefined);
      mockStorageService.setSetting.mockResolvedValue();
      await digestGenerator.startDigestGeneration();
    });

    it('should generate high unread rate insight', async () => {
      // All notifications are unread
      const unreadNotifications = mockNotifications.map(n => ({ ...n, isRead: false }));
      mockStorageService.getNotifications.mockResolvedValue(unreadNotifications);

      const digest = await digestGenerator.generateDigest('manual');
      
      const unreadInsight = digest.insights.find(i => i.title.includes('Unread'));
      expect(unreadInsight).toBeDefined();
      expect(unreadInsight?.severity).toBe('warning');
      expect(unreadInsight?.actionable).toBe(true);
    });

    it('should generate quiet period insight', async () => {
      // Very few notifications
      const fewNotifications = mockNotifications.slice(0, 2);
      mockStorageService.getNotifications.mockResolvedValue(fewNotifications);

      const digest = await digestGenerator.generateDigest('manual');
      
      const quietInsight = digest.insights.find(i => i.title.includes('Quiet'));
      expect(quietInsight).toBeDefined();
      expect(quietInsight?.severity).toBe('success');
    });

    it('should generate work-heavy period insight', async () => {
      // Mostly work notifications
      const workNotifications = mockNotifications.map(n => ({ ...n, category: 'Work' as const }));
      mockStorageService.getNotifications.mockResolvedValue(workNotifications);

      const digest = await digestGenerator.generateDigest('manual');
      
      const workInsight = digest.insights.find(i => i.title.includes('Work-Heavy'));
      expect(workInsight).toBeDefined();
      expect(workInsight?.severity).toBe('info');
    });

    it('should generate app dominance insight', async () => {
      // Many notifications from same app
      const slackNotifications = Array(10).fill(null).map((_, i) => ({
        ...mockNotifications[0],
        id: `slack-${i}`,
        title: `Slack message ${i}`,
      }));
      
      mockStorageService.getNotifications.mockResolvedValue(slackNotifications);

      const digest = await digestGenerator.generateDigest('manual');
      
      const dominanceInsight = digest.insights.find(i => i.title.includes('Dominance'));
      expect(dominanceInsight).toBeDefined();
      expect(dominanceInsight?.data?.appName).toBe('Slack');
    });
  });

  describe('actionable items', () => {
    beforeEach(async () => {
      mockStorageService.initialize.mockResolvedValue();
      mockStorageService.getSetting.mockResolvedValue(undefined);
      mockStorageService.setSetting.mockResolvedValue();
      await digestGenerator.startDigestGeneration();
    });

    it('should identify unread important notifications', async () => {
      mockStorageService.getNotifications.mockResolvedValue(mockNotifications);

      const digest = await digestGenerator.generateDigest('manual');
      
      const unreadAction = digest.actionableItems.find(a => a.type === 'unread_important');
      expect(unreadAction).toBeDefined();
      expect(unreadAction?.notificationIds?.length).toBeGreaterThan(0);
      expect(unreadAction?.priority).toBe(3);
    });

    it('should identify OTP follow-up items', async () => {
      mockStorageService.getNotifications.mockResolvedValue(mockNotifications);

      const digest = await digestGenerator.generateDigest('manual');
      
      const otpAction = digest.actionableItems.find(a => a.type === 'follow_up');
      expect(otpAction).toBeDefined();
      expect(otpAction?.title).toContain('OTP');
    });

    it('should suggest cleanup for junk notifications', async () => {
      // Many junk notifications
      const junkNotifications = Array(15).fill(null).map((_, i) => ({
        ...mockNotifications[3], // Junk notification template
        id: `junk-${i}`,
        title: `Promotion ${i}`,
      }));

      await digestGenerator.updateConfig({
        categoriesEnabled: ['Work', 'Personal', 'Junk'],
      });

      mockStorageService.getNotifications.mockResolvedValue(junkNotifications);

      const digest = await digestGenerator.generateDigest('manual');
      
      const cleanupAction = digest.actionableItems.find(a => a.type === 'cleanup');
      expect(cleanupAction).toBeDefined();
      expect(cleanupAction?.title).toContain('Junk');
    });

    it('should suggest rules for noisy apps', async () => {
      // Many notifications from same app
      const noisyAppNotifications = Array(8).fill(null).map((_, i) => ({
        ...mockNotifications[0],
        id: `noisy-${i}`,
        title: `Notification ${i}`,
      }));

      mockStorageService.getNotifications.mockResolvedValue(noisyAppNotifications);

      const digest = await digestGenerator.generateDigest('manual');
      
      const ruleAction = digest.actionableItems.find(a => a.type === 'rule_suggestion');
      expect(ruleAction).toBeDefined();
      expect(ruleAction?.title).toContain('Rules');
    });
  });

  describe('custom digest generation', () => {
    beforeEach(async () => {
      mockStorageService.initialize.mockResolvedValue();
      mockStorageService.getSetting.mockResolvedValue(undefined);
      mockStorageService.setSetting.mockResolvedValue();
      await digestGenerator.startDigestGeneration();
    });

    it('should generate custom digest for specific time range', async () => {
      const startTime = Date.now() - 6 * 60 * 60 * 1000; // 6 hours ago
      const endTime = Date.now();

      mockStorageService.getNotifications.mockResolvedValue(mockNotifications);

      const digest = await digestGenerator.generateCustomDigest(startTime, endTime);
      
      expect(digest.type).toBe('manual');
      expect(digest.periodStart).toBe(startTime);
      expect(digest.periodEnd).toBe(endTime);
    });

    it('should apply custom options to digest generation', async () => {
      const startTime = Date.now() - 6 * 60 * 60 * 1000;
      const endTime = Date.now();

      mockStorageService.getNotifications.mockResolvedValue(mockNotifications);

      const digest = await digestGenerator.generateCustomDigest(startTime, endTime, {
        maxNotificationsInDigest: 2,
        categoriesEnabled: ['Work'],
      });
      
      expect(digest.topNotifications.length).toBeLessThanOrEqual(2);
      
      // Should only include work notifications
      const nonWorkNotifications = digest.topNotifications.filter(n => n.category !== 'Work');
      expect(nonWorkNotifications).toHaveLength(0);
    });
  });

  describe('statistics tracking', () => {
    beforeEach(async () => {
      mockStorageService.initialize.mockResolvedValue();
      mockStorageService.getSetting.mockResolvedValue(undefined);
      mockStorageService.setSetting.mockResolvedValue();
      await digestGenerator.startDigestGeneration();
    });

    it('should track digest generation statistics', async () => {
      mockStorageService.getNotifications.mockResolvedValue(mockNotifications);

      await digestGenerator.generateDigest('morning');
      
      const stats = digestGenerator.getStats();
      expect(stats.totalDigestsGenerated).toBe(1);
      expect(stats.morningDigests).toBe(1);
      expect(stats.lastDigestGenerated).toBeDefined();
    });

    it('should track different digest types separately', async () => {
      mockStorageService.getNotifications.mockResolvedValue(mockNotifications);

      await digestGenerator.generateDigest('morning');
      await digestGenerator.generateDigest('evening');
      await digestGenerator.generateDigest('manual');
      
      const stats = digestGenerator.getStats();
      expect(stats.totalDigestsGenerated).toBe(3);
      expect(stats.morningDigests).toBe(1);
      expect(stats.eveningDigests).toBe(1);
      expect(stats.manualDigests).toBe(1);
    });

    it('should reset statistics', async () => {
      mockStorageService.getNotifications.mockResolvedValue(mockNotifications);

      await digestGenerator.generateDigest('morning');
      
      let stats = digestGenerator.getStats();
      expect(stats.totalDigestsGenerated).toBe(1);

      await digestGenerator.resetStats();
      
      stats = digestGenerator.getStats();
      expect(stats.totalDigestsGenerated).toBe(0);
      expect(stats.morningDigests).toBe(0);
    });
  });

  describe('digest history management', () => {
    beforeEach(async () => {
      mockStorageService.initialize.mockResolvedValue();
      mockStorageService.getSetting.mockResolvedValue(undefined);
      mockStorageService.setSetting.mockResolvedValue();
      await digestGenerator.startDigestGeneration();
    });

    it('should maintain digest history', async () => {
      mockStorageService.getNotifications.mockResolvedValue(mockNotifications);

      await digestGenerator.generateDigest('morning');
      await digestGenerator.generateDigest('evening');
      
      const history = digestGenerator.getDigestHistory();
      expect(history).toHaveLength(2);
      expect(history[0].type).toBe('evening'); // Most recent first
      expect(history[1].type).toBe('morning');
    });

    it('should get latest digest', async () => {
      mockStorageService.getNotifications.mockResolvedValue(mockNotifications);

      await digestGenerator.generateDigest('morning');
      
      const latest = digestGenerator.getLatestDigest();
      expect(latest).toBeDefined();
      expect(latest?.type).toBe('morning');
    });

    it('should get digest by ID', async () => {
      mockStorageService.getNotifications.mockResolvedValue(mockNotifications);

      const digest = await digestGenerator.generateDigest('morning');
      
      const retrieved = await digestGenerator.getDigestById(digest.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(digest.id);
    });

    it('should clear digest history', async () => {
      mockStorageService.getNotifications.mockResolvedValue(mockNotifications);

      await digestGenerator.generateDigest('morning');
      
      let history = digestGenerator.getDigestHistory();
      expect(history).toHaveLength(1);

      await digestGenerator.clearDigestHistory();
      
      history = digestGenerator.getDigestHistory();
      expect(history).toHaveLength(0);
    });
  });

  describe('engagement tracking', () => {
    beforeEach(async () => {
      mockStorageService.initialize.mockResolvedValue();
      mockStorageService.getSetting.mockResolvedValue(undefined);
      mockStorageService.setSetting.mockResolvedValue();
      await digestGenerator.startDigestGeneration();
    });

    it('should track digest views', async () => {
      await digestGenerator.markDigestAsViewed('digest-123');
      
      const stats = digestGenerator.getStats();
      expect(stats.digestEngagement.viewed).toBe(1);
    });

    it('should track action clicks', async () => {
      await digestGenerator.markActionClicked('digest-123', 'action-456');
      
      const stats = digestGenerator.getStats();
      expect(stats.digestEngagement.actionsClicked).toBe(1);
    });

    it('should track insight views', async () => {
      await digestGenerator.markInsightViewed('digest-123', 'pattern');
      
      const stats = digestGenerator.getStats();
      expect(stats.digestEngagement.insightsViewed).toBe(1);
    });
  });

  describe('configuration management', () => {
    it('should update configuration', async () => {
      mockStorageService.initialize.mockResolvedValue();
      mockStorageService.getSetting.mockResolvedValue(undefined);
      mockStorageService.setSetting.mockResolvedValue();

      await digestGenerator.startDigestGeneration();

      const newConfig = {
        maxNotificationsInDigest: 20,
        lookbackHours: 48,
        enableInsights: false,
      };

      await digestGenerator.updateConfig(newConfig);
      
      const config = digestGenerator.getConfig();
      expect(config.maxNotificationsInDigest).toBe(20);
      expect(config.lookbackHours).toBe(48);
      expect(config.enableInsights).toBe(false);
    });

    it('should get current configuration', () => {
      const config = digestGenerator.getConfig();
      
      expect(config).toHaveProperty('enabled');
      expect(config).toHaveProperty('generateMorningDigest');
      expect(config).toHaveProperty('maxNotificationsInDigest');
      expect(config).toHaveProperty('categoriesEnabled');
    });
  });
});