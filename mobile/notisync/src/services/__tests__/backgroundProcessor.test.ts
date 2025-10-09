import { backgroundProcessor } from '../backgroundProcessor';
import { storageService } from '../storage';
import { notificationFilterService } from '../notificationFilter';
import { rulesEngine } from '../rulesEngine';
import { CapturedNotification } from '../../types/notification';

// Mock dependencies
jest.mock('../storage');
jest.mock('../notificationFilter');
jest.mock('../rulesEngine');
jest.mock('expo-task-manager');
jest.mock('expo-background-fetch');

const mockStorageService = storageService as jest.Mocked<typeof storageService>;
const mockNotificationFilterService = notificationFilterService as jest.Mocked<typeof notificationFilterService>;
const mockRulesEngine = rulesEngine as jest.Mocked<typeof rulesEngine>;

describe('BackgroundProcessor', () => {
  const mockNotification: CapturedNotification = {
    id: 'test-notification-1',
    appName: 'Test App',
    title: 'Test Notification',
    body: 'This is a test notification',
    category: 'Personal',
    priority: 1,
    timestamp: Date.now(),
    packageName: 'com.test.app',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      mockStorageService.initialize.mockResolvedValue();
      mockStorageService.getSetting.mockResolvedValue(undefined);

      const result = await backgroundProcessor.startBackgroundProcessing();
      
      expect(result).toBe(true);
      expect(mockStorageService.initialize).toHaveBeenCalled();
    });

    it('should load existing configuration', async () => {
      const mockConfig = {
        enabled: true,
        processingInterval: 60,
        batchSize: 10,
      };

      mockStorageService.initialize.mockResolvedValue();
      mockStorageService.getSetting
        .mockResolvedValueOnce(mockConfig)
        .mockResolvedValueOnce(undefined);

      await backgroundProcessor.startBackgroundProcessing();
      
      const config = backgroundProcessor.getConfig();
      expect(config.processingInterval).toBe(60);
      expect(config.batchSize).toBe(10);
    });
  });

  describe('notification processing', () => {
    beforeEach(async () => {
      mockStorageService.initialize.mockResolvedValue();
      mockStorageService.getSetting.mockResolvedValue(undefined);
      mockStorageService.setSetting.mockResolvedValue();
      await backgroundProcessor.startBackgroundProcessing();
    });

    it('should process notification through filter and rules', async () => {
      const filterResult = {
        shouldCapture: true,
        modifiedNotification: mockNotification,
        appliedRules: [],
      };

      const rulesResult = {
        notification: { ...mockNotification, synced: false, syncAttempts: 0, isRead: false, isDismissed: false },
        modified: true,
        blocked: false,
        rulesApplied: [],
        totalExecutionTime: 10,
      };

      mockNotificationFilterService.processNotification.mockResolvedValue(filterResult);
      mockRulesEngine.evaluateNotification.mockResolvedValue(rulesResult);
      mockStorageService.saveNotification.mockResolvedValue();

      const result = await backgroundProcessor.testProcessing(mockNotification);
      
      expect(result.processed).toBe(true);
      expect(mockNotificationFilterService.processNotification).toHaveBeenCalledWith(mockNotification);
      expect(mockRulesEngine.evaluateNotification).toHaveBeenCalled();
      expect(mockStorageService.saveNotification).toHaveBeenCalled();
    });

    it('should not process filtered out notifications', async () => {
      const filterResult = {
        shouldCapture: false,
        appliedRules: ['spam-filter'],
        reason: 'Blocked by spam filter',
      };

      mockNotificationFilterService.processNotification.mockResolvedValue(filterResult);

      const result = await backgroundProcessor.testProcessing(mockNotification);
      
      expect(result.processed).toBe(true); // Processing completes, but notification is not stored
      expect(mockRulesEngine.evaluateNotification).not.toHaveBeenCalled();
      expect(mockStorageService.saveNotification).not.toHaveBeenCalled();
    });

    it('should handle processing errors gracefully', async () => {
      mockNotificationFilterService.processNotification.mockRejectedValue(new Error('Filter error'));

      const result = await backgroundProcessor.testProcessing(mockNotification);
      
      expect(result.processed).toBe(false);
      expect(result.error).toContain('Filter error');
    });
  });

  describe('categorization', () => {
    beforeEach(async () => {
      mockStorageService.initialize.mockResolvedValue();
      mockStorageService.getSetting.mockResolvedValue(undefined);
      await backgroundProcessor.startBackgroundProcessing();
    });

    it('should categorize work notifications correctly', async () => {
      const workNotification: CapturedNotification = {
        ...mockNotification,
        appName: 'Slack',
        packageName: 'com.slack.android',
        title: 'Meeting reminder',
        body: 'Team meeting in 15 minutes',
      };

      const filterResult = {
        shouldCapture: true,
        modifiedNotification: workNotification,
        appliedRules: [],
      };

      const rulesResult = {
        notification: { ...workNotification, synced: false, syncAttempts: 0, isRead: false, isDismissed: false },
        modified: false,
        blocked: false,
        rulesApplied: [],
        totalExecutionTime: 10,
      };

      mockNotificationFilterService.processNotification.mockResolvedValue(filterResult);
      mockRulesEngine.evaluateNotification.mockResolvedValue(rulesResult);
      mockStorageService.saveNotification.mockResolvedValue();

      await backgroundProcessor.testProcessing(workNotification);
      
      // Verify that the notification was categorized as Work
      const saveCall = mockStorageService.saveNotification.mock.calls[0][0];
      expect(saveCall.category).toBe('Work');
    });

    it('should categorize junk notifications correctly', async () => {
      const junkNotification: CapturedNotification = {
        ...mockNotification,
        title: 'Special Offer!',
        body: 'Limited time discount - 50% off everything!',
      };

      const filterResult = {
        shouldCapture: true,
        modifiedNotification: junkNotification,
        appliedRules: [],
      };

      const rulesResult = {
        notification: { ...junkNotification, synced: false, syncAttempts: 0, isRead: false, isDismissed: false },
        modified: false,
        blocked: false,
        rulesApplied: [],
        totalExecutionTime: 10,
      };

      mockNotificationFilterService.processNotification.mockResolvedValue(filterResult);
      mockRulesEngine.evaluateNotification.mockResolvedValue(rulesResult);
      mockStorageService.saveNotification.mockResolvedValue();

      await backgroundProcessor.testProcessing(junkNotification);
      
      // Verify that the notification was categorized as Junk
      const saveCall = mockStorageService.saveNotification.mock.calls[0][0];
      expect(saveCall.category).toBe('Junk');
    });
  });

  describe('prioritization', () => {
    beforeEach(async () => {
      mockStorageService.initialize.mockResolvedValue();
      mockStorageService.getSetting.mockResolvedValue(undefined);
      await backgroundProcessor.startBackgroundProcessing();
    });

    it('should set high priority for OTP notifications', async () => {
      const otpNotification: CapturedNotification = {
        ...mockNotification,
        title: 'Verification Code',
        body: 'Your OTP is 123456',
      };

      const filterResult = {
        shouldCapture: true,
        modifiedNotification: otpNotification,
        appliedRules: [],
      };

      const rulesResult = {
        notification: { ...otpNotification, synced: false, syncAttempts: 0, isRead: false, isDismissed: false },
        modified: false,
        blocked: false,
        rulesApplied: [],
        totalExecutionTime: 10,
      };

      mockNotificationFilterService.processNotification.mockResolvedValue(filterResult);
      mockRulesEngine.evaluateNotification.mockResolvedValue(rulesResult);
      mockStorageService.saveNotification.mockResolvedValue();

      await backgroundProcessor.testProcessing(otpNotification);
      
      // Verify that the notification was given high priority
      const saveCall = mockStorageService.saveNotification.mock.calls[0][0];
      expect(saveCall.priority).toBe(3);
    });

    it('should reduce priority during night hours', async () => {
      // Mock night time (11 PM)
      const nightTime = new Date();
      nightTime.setHours(23, 0, 0, 0);
      jest.spyOn(Date.prototype, 'getHours').mockReturnValue(23);

      const nightNotification: CapturedNotification = {
        ...mockNotification,
        priority: 2,
      };

      const filterResult = {
        shouldCapture: true,
        modifiedNotification: nightNotification,
        appliedRules: [],
      };

      const rulesResult = {
        notification: { ...nightNotification, synced: false, syncAttempts: 0, isRead: false, isDismissed: false },
        modified: false,
        blocked: false,
        rulesApplied: [],
        totalExecutionTime: 10,
      };

      mockNotificationFilterService.processNotification.mockResolvedValue(filterResult);
      mockRulesEngine.evaluateNotification.mockResolvedValue(rulesResult);
      mockStorageService.saveNotification.mockResolvedValue();

      await backgroundProcessor.testProcessing(nightNotification);
      
      // Verify that the priority was reduced
      const saveCall = mockStorageService.saveNotification.mock.calls[0][0];
      expect(saveCall.priority).toBe(1); // Reduced from 2 to 1
    });
  });

  describe('queue management', () => {
    beforeEach(async () => {
      mockStorageService.initialize.mockResolvedValue();
      mockStorageService.getSetting.mockResolvedValue(undefined);
      await backgroundProcessor.startBackgroundProcessing();
    });

    it('should add notifications to processing queue', async () => {
      await backgroundProcessor.addNotificationToQueue(mockNotification);
      
      expect(backgroundProcessor.getQueueSize()).toBe(1);
    });

    it('should process queue when batch size is reached', async () => {
      const config = backgroundProcessor.getConfig();
      config.batchSize = 2;
      await backgroundProcessor.updateConfig(config);

      mockNotificationFilterService.processNotification.mockResolvedValue({
        shouldCapture: true,
        modifiedNotification: mockNotification,
        appliedRules: [],
      });

      mockRulesEngine.evaluateNotification.mockResolvedValue({
        notification: { ...mockNotification, synced: false, syncAttempts: 0, isRead: false, isDismissed: false },
        modified: false,
        blocked: false,
        rulesApplied: [],
        totalExecutionTime: 10,
      });

      mockStorageService.saveNotification.mockResolvedValue();

      // Add notifications to reach batch size
      await backgroundProcessor.addNotificationToQueue(mockNotification);
      await backgroundProcessor.addNotificationToQueue({ ...mockNotification, id: 'test-2' });

      // Queue should be processed automatically
      expect(mockStorageService.saveNotification).toHaveBeenCalledTimes(2);
    });
  });

  describe('cleanup operations', () => {
    beforeEach(async () => {
      mockStorageService.initialize.mockResolvedValue();
      mockStorageService.getSetting.mockResolvedValue(undefined);
      await backgroundProcessor.startBackgroundProcessing();
    });

    it('should perform cleanup operations', async () => {
      mockStorageService.cleanupExpiredNotifications.mockResolvedValue(5);
      mockStorageService.cleanupFailedSyncItems.mockResolvedValue();

      // Trigger cleanup by advancing time
      jest.advanceTimersByTime(3600 * 1000); // 1 hour

      expect(mockStorageService.cleanupExpiredNotifications).toHaveBeenCalled();
      expect(mockStorageService.cleanupFailedSyncItems).toHaveBeenCalled();
    });
  });

  describe('statistics', () => {
    beforeEach(async () => {
      mockStorageService.initialize.mockResolvedValue();
      mockStorageService.getSetting.mockResolvedValue(undefined);
      await backgroundProcessor.startBackgroundProcessing();
    });

    it('should track processing statistics', async () => {
      mockNotificationFilterService.processNotification.mockResolvedValue({
        shouldCapture: true,
        modifiedNotification: mockNotification,
        appliedRules: [],
      });

      mockRulesEngine.evaluateNotification.mockResolvedValue({
        notification: { ...mockNotification, synced: false, syncAttempts: 0, isRead: false, isDismissed: false },
        modified: true,
        blocked: false,
        rulesApplied: [],
        totalExecutionTime: 10,
      });

      mockStorageService.saveNotification.mockResolvedValue();

      await backgroundProcessor.testProcessing(mockNotification);
      
      const stats = backgroundProcessor.getStats();
      expect(stats.successfullyProcessed).toBe(1);
      expect(stats.rulesApplied).toBe(1);
    });

    it('should track processing errors', async () => {
      mockNotificationFilterService.processNotification.mockRejectedValue(new Error('Processing failed'));

      await backgroundProcessor.testProcessing(mockNotification);
      
      const stats = backgroundProcessor.getStats();
      expect(stats.failedProcessing).toBe(1);
      expect(stats.processingErrors.length).toBeGreaterThan(0);
    });

    it('should reset statistics', async () => {
      // Process a notification to generate some stats
      mockNotificationFilterService.processNotification.mockResolvedValue({
        shouldCapture: true,
        modifiedNotification: mockNotification,
        appliedRules: [],
      });

      mockRulesEngine.evaluateNotification.mockResolvedValue({
        notification: { ...mockNotification, synced: false, syncAttempts: 0, isRead: false, isDismissed: false },
        modified: false,
        blocked: false,
        rulesApplied: [],
        totalExecutionTime: 10,
      });

      mockStorageService.saveNotification.mockResolvedValue();

      await backgroundProcessor.testProcessing(mockNotification);
      
      let stats = backgroundProcessor.getStats();
      expect(stats.successfullyProcessed).toBe(1);

      // Reset stats
      await backgroundProcessor.resetStats();
      
      stats = backgroundProcessor.getStats();
      expect(stats.successfullyProcessed).toBe(0);
      expect(stats.totalProcessed).toBe(0);
    });
  });

  describe('configuration management', () => {
    it('should update configuration', async () => {
      mockStorageService.initialize.mockResolvedValue();
      mockStorageService.getSetting.mockResolvedValue(undefined);
      mockStorageService.setSetting.mockResolvedValue();

      await backgroundProcessor.startBackgroundProcessing();

      const newConfig = {
        processingInterval: 120,
        batchSize: 50,
      };

      await backgroundProcessor.updateConfig(newConfig);
      
      const config = backgroundProcessor.getConfig();
      expect(config.processingInterval).toBe(120);
      expect(config.batchSize).toBe(50);
      expect(mockStorageService.setSetting).toHaveBeenCalledWith(
        'background_processing_config',
        expect.objectContaining(newConfig)
      );
    });

    it('should get current configuration', () => {
      const config = backgroundProcessor.getConfig();
      
      expect(config).toHaveProperty('enabled');
      expect(config).toHaveProperty('processingInterval');
      expect(config).toHaveProperty('batchSize');
      expect(config).toHaveProperty('maxProcessingTime');
    });
  });

  describe('service lifecycle', () => {
    it('should start and stop background processing', async () => {
      mockStorageService.initialize.mockResolvedValue();
      mockStorageService.getSetting.mockResolvedValue(undefined);

      expect(backgroundProcessor.isRunning()).toBe(false);

      const startResult = await backgroundProcessor.startBackgroundProcessing();
      expect(startResult).toBe(true);
      expect(backgroundProcessor.isRunning()).toBe(true);

      await backgroundProcessor.stopBackgroundProcessing();
      expect(backgroundProcessor.isRunning()).toBe(false);
    });

    it('should not start if already running', async () => {
      mockStorageService.initialize.mockResolvedValue();
      mockStorageService.getSetting.mockResolvedValue(undefined);

      await backgroundProcessor.startBackgroundProcessing();
      expect(backgroundProcessor.isRunning()).toBe(true);

      // Try to start again
      const secondStartResult = await backgroundProcessor.startBackgroundProcessing();
      expect(secondStartResult).toBe(true);
      expect(backgroundProcessor.isRunning()).toBe(true);
    });
  });
});