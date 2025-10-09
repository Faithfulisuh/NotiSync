import { storageService } from '../storage';
import { databaseService } from '../database';
import { CapturedNotification, SyncedNotification } from '../../types/notification';

// Mock the database service
jest.mock('../database', () => ({
  databaseService: {
    initialize: jest.fn(),
    saveNotification: jest.fn(),
    getNotifications: jest.fn(),
    getNotificationById: jest.fn(),
    getUnsyncedNotifications: jest.fn(),
    updateNotificationSyncStatus: jest.fn(),
    updateNotificationStatus: jest.fn(),
    deleteNotification: jest.fn(),
    deleteExpiredNotifications: jest.fn(),
    addToSyncQueue: jest.fn(),
    getSyncQueue: jest.fn(),
    updateSyncQueueItem: jest.fn(),
    removeSyncQueueItem: jest.fn(),
    clearSyncQueue: jest.fn(),
    getNotificationStats: jest.fn(),
    getDatabaseInfo: jest.fn(),
    clearAllData: jest.fn(),
  },
}));

describe('StorageService', () => {
  const mockCapturedNotification: CapturedNotification = {
    id: 'notif-123',
    appName: 'Test App',
    title: 'Test Notification',
    body: 'This is a test notification',
    category: 'Personal',
    priority: 1,
    timestamp: Date.now(),
    packageName: 'com.test.app',
  };

  const mockSyncedNotification: SyncedNotification = {
    ...mockCapturedNotification,
    synced: false,
    syncAttempts: 0,
    isRead: false,
    isDismissed: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Clear any existing intervals
    jest.clearAllTimers();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      (databaseService.initialize as jest.Mock).mockResolvedValue(undefined);
      
      await expect(storageService.initialize()).resolves.not.toThrow();
      expect(databaseService.initialize).toHaveBeenCalled();
    });
  });

  describe('notification CRUD operations', () => {
    beforeEach(async () => {
      (databaseService.initialize as jest.Mock).mockResolvedValue(undefined);
      await storageService.initialize();
    });

    it('should save notification', async () => {
      (databaseService.saveNotification as jest.Mock).mockResolvedValue(undefined);
      (databaseService.addToSyncQueue as jest.Mock).mockResolvedValue(undefined);

      const result = await storageService.saveNotification(mockCapturedNotification);
      
      expect(result).toEqual(expect.objectContaining({
        ...mockCapturedNotification,
        synced: false,
        syncAttempts: 0,
        isRead: false,
        isDismissed: false,
      }));
      expect(databaseService.saveNotification).toHaveBeenCalled();
      expect(databaseService.addToSyncQueue).toHaveBeenCalled();
    });

    it('should get notifications', async () => {
      const mockNotifications = [mockSyncedNotification];
      (databaseService.getNotifications as jest.Mock).mockResolvedValue(mockNotifications);

      const result = await storageService.getNotifications(10, 0);
      
      expect(result).toEqual(mockNotifications);
      expect(databaseService.getNotifications).toHaveBeenCalledWith(10, 0);
    });

    it('should get notification by id', async () => {
      (databaseService.getNotificationById as jest.Mock).mockResolvedValue(mockSyncedNotification);

      const result = await storageService.getNotificationById('notif-123');
      
      expect(result).toEqual(mockSyncedNotification);
      expect(databaseService.getNotificationById).toHaveBeenCalledWith('notif-123');
    });

    it('should update notification', async () => {
      (databaseService.getNotificationById as jest.Mock).mockResolvedValue(mockSyncedNotification);
      (databaseService.saveNotification as jest.Mock).mockResolvedValue(undefined);
      (databaseService.addToSyncQueue as jest.Mock).mockResolvedValue(undefined);

      await storageService.updateNotification('notif-123', { isRead: true });
      
      expect(databaseService.getNotificationById).toHaveBeenCalledWith('notif-123');
      expect(databaseService.saveNotification).toHaveBeenCalled();
      expect(databaseService.addToSyncQueue).toHaveBeenCalled();
    });

    it('should throw error when updating non-existent notification', async () => {
      (databaseService.getNotificationById as jest.Mock).mockResolvedValue(null);

      await expect(
        storageService.updateNotification('nonexistent', { isRead: true })
      ).rejects.toThrow('Notification with id nonexistent not found');
    });

    it('should delete notification', async () => {
      (databaseService.deleteNotification as jest.Mock).mockResolvedValue(undefined);
      (databaseService.addToSyncQueue as jest.Mock).mockResolvedValue(undefined);

      await storageService.deleteNotification('notif-123');
      
      expect(databaseService.deleteNotification).toHaveBeenCalledWith('notif-123');
      expect(databaseService.addToSyncQueue).toHaveBeenCalled();
    });

    it('should mark as read', async () => {
      (databaseService.updateNotificationStatus as jest.Mock).mockResolvedValue(undefined);
      (databaseService.addToSyncQueue as jest.Mock).mockResolvedValue(undefined);

      await storageService.markAsRead('notif-123');
      
      expect(databaseService.updateNotificationStatus).toHaveBeenCalledWith('notif-123', true, undefined);
      expect(databaseService.addToSyncQueue).toHaveBeenCalled();
    });

    it('should mark as dismissed', async () => {
      (databaseService.updateNotificationStatus as jest.Mock).mockResolvedValue(undefined);
      (databaseService.addToSyncQueue as jest.Mock).mockResolvedValue(undefined);

      await storageService.markAsDismissed('notif-123');
      
      expect(databaseService.updateNotificationStatus).toHaveBeenCalledWith('notif-123', undefined, true);
      expect(databaseService.addToSyncQueue).toHaveBeenCalled();
    });

    it('should mark as clicked', async () => {
      (databaseService.updateNotificationStatus as jest.Mock).mockResolvedValue(undefined);
      (databaseService.addToSyncQueue as jest.Mock).mockResolvedValue(undefined);

      await storageService.markAsClicked('notif-123');
      
      expect(databaseService.updateNotificationStatus).toHaveBeenCalledWith('notif-123', true, undefined);
      expect(databaseService.addToSyncQueue).toHaveBeenCalled();
    });
  });

  describe('sync operations', () => {
    beforeEach(async () => {
      (databaseService.initialize as jest.Mock).mockResolvedValue(undefined);
      await storageService.initialize();
    });

    it('should get unsynced notifications', async () => {
      const mockNotifications = [mockSyncedNotification];
      (databaseService.getUnsyncedNotifications as jest.Mock).mockResolvedValue(mockNotifications);

      const result = await storageService.getUnsyncedNotifications();
      
      expect(result).toEqual(mockNotifications);
      expect(databaseService.getUnsyncedNotifications).toHaveBeenCalled();
    });

    it('should mark as synced', async () => {
      (databaseService.updateNotificationSyncStatus as jest.Mock).mockResolvedValue(undefined);

      await storageService.markAsSynced('notif-123', 'server-456');
      
      expect(databaseService.updateNotificationSyncStatus).toHaveBeenCalledWith('notif-123', true, 'server-456');
    });

    it('should increment sync attempts', async () => {
      (databaseService.getNotificationById as jest.Mock).mockResolvedValue(mockSyncedNotification);
      (databaseService.updateNotificationSyncStatus as jest.Mock).mockResolvedValue(undefined);

      await storageService.incrementSyncAttempts('notif-123');
      
      expect(databaseService.getNotificationById).toHaveBeenCalledWith('notif-123');
      expect(databaseService.updateNotificationSyncStatus).toHaveBeenCalledWith(
        'notif-123', 
        false, 
        mockSyncedNotification.serverId, 
        1
      );
    });
  });

  describe('search and filtering', () => {
    beforeEach(async () => {
      (databaseService.initialize as jest.Mock).mockResolvedValue(undefined);
      await storageService.initialize();
    });

    it('should search notifications', async () => {
      const mockNotifications = [
        { ...mockSyncedNotification, title: 'Test Message' },
        { ...mockSyncedNotification, id: 'notif-456', title: 'Another Notification' },
      ];
      (databaseService.getNotifications as jest.Mock).mockResolvedValue(mockNotifications);

      const result = await storageService.searchNotifications('test');
      
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Test Message');
    });

    it('should get notifications by category', async () => {
      const mockNotifications = [
        { ...mockSyncedNotification, category: 'Work' },
        { ...mockSyncedNotification, id: 'notif-456', category: 'Personal' },
      ];
      (databaseService.getNotifications as jest.Mock).mockResolvedValue(mockNotifications);

      const result = await storageService.getNotificationsByCategory('Work');
      
      expect(result).toHaveLength(1);
      expect(result[0].category).toBe('Work');
    });

    it('should get notifications by app', async () => {
      const mockNotifications = [
        { ...mockSyncedNotification, appName: 'Slack' },
        { ...mockSyncedNotification, id: 'notif-456', appName: 'WhatsApp' },
      ];
      (databaseService.getNotifications as jest.Mock).mockResolvedValue(mockNotifications);

      const result = await storageService.getNotificationsByApp('Slack');
      
      expect(result).toHaveLength(1);
      expect(result[0].appName).toBe('Slack');
    });

    it('should get notifications by date range', async () => {
      const now = Date.now();
      const mockNotifications = [
        { ...mockSyncedNotification, timestamp: now - 1000 },
        { ...mockSyncedNotification, id: 'notif-456', timestamp: now + 1000 },
      ];
      (databaseService.getNotifications as jest.Mock).mockResolvedValue(mockNotifications);

      const startDate = new Date(now - 2000);
      const endDate = new Date(now);
      const result = await storageService.getNotificationsByDateRange(startDate, endDate);
      
      expect(result).toHaveLength(1);
      expect(result[0].timestamp).toBe(now - 1000);
    });
  });

  describe('statistics', () => {
    beforeEach(async () => {
      (databaseService.initialize as jest.Mock).mockResolvedValue(undefined);
      await storageService.initialize();
    });

    it('should get notification stats', async () => {
      const mockStats = {
        totalCaptured: 100,
        totalSynced: 80,
        pendingSync: 20,
        captureRate: 100,
        syncSuccessRate: 80,
      };
      (databaseService.getNotificationStats as jest.Mock).mockResolvedValue(mockStats);

      const result = await storageService.getNotificationStats();
      
      expect(result).toEqual(mockStats);
    });

    it('should get daily notification count', async () => {
      const today = new Date();
      const mockNotifications = [mockSyncedNotification];
      (databaseService.getNotifications as jest.Mock).mockResolvedValue(mockNotifications);

      // Mock the date range filtering
      jest.spyOn(storageService, 'getNotificationsByDateRange').mockResolvedValue(mockNotifications);

      const result = await storageService.getDailyNotificationCount(today);
      
      expect(result).toBe(1);
    });

    it('should get app notification counts', async () => {
      const mockNotifications = [
        { ...mockSyncedNotification, appName: 'Slack' },
        { ...mockSyncedNotification, id: 'notif-456', appName: 'Slack' },
        { ...mockSyncedNotification, id: 'notif-789', appName: 'WhatsApp' },
      ];
      (databaseService.getNotifications as jest.Mock).mockResolvedValue(mockNotifications);

      const result = await storageService.getAppNotificationCounts();
      
      expect(result).toEqual({
        'Slack': 2,
        'WhatsApp': 1,
      });
    });

    it('should get category notification counts', async () => {
      const mockNotifications = [
        { ...mockSyncedNotification, category: 'Work' },
        { ...mockSyncedNotification, id: 'notif-456', category: 'Work' },
        { ...mockSyncedNotification, id: 'notif-789', category: 'Personal' },
      ];
      (databaseService.getNotifications as jest.Mock).mockResolvedValue(mockNotifications);

      const result = await storageService.getCategoryNotificationCounts();
      
      expect(result).toEqual({
        'Work': 2,
        'Personal': 1,
      });
    });
  });

  describe('cleanup and maintenance', () => {
    beforeEach(async () => {
      (databaseService.initialize as jest.Mock).mockResolvedValue(undefined);
      await storageService.initialize();
    });

    it('should cleanup expired notifications', async () => {
      (databaseService.deleteExpiredNotifications as jest.Mock).mockResolvedValue(5);

      const result = await storageService.cleanupExpiredNotifications(7);
      
      expect(result).toBe(5);
      expect(databaseService.deleteExpiredNotifications).toHaveBeenCalledWith(7);
    });

    it('should cleanup failed sync items', async () => {
      const mockSyncQueue = [
        { id: 'sync-1', attempts: 5 }, // Should be removed
        { id: 'sync-2', attempts: 1 }, // Should be kept
      ];
      (databaseService.getSyncQueue as jest.Mock).mockResolvedValue(mockSyncQueue);
      (databaseService.removeSyncQueueItem as jest.Mock).mockResolvedValue(undefined);

      await storageService.cleanupFailedSyncItems();
      
      expect(databaseService.removeSyncQueueItem).toHaveBeenCalledWith('sync-1');
      expect(databaseService.removeSyncQueueItem).not.toHaveBeenCalledWith('sync-2');
    });

    it('should schedule cleanup', async () => {
      (databaseService.initialize as jest.Mock).mockResolvedValue(undefined);
      (databaseService.deleteExpiredNotifications as jest.Mock).mockResolvedValue(0);
      (databaseService.getSyncQueue as jest.Mock).mockResolvedValue([]);

      await storageService.initialize();
      
      // Fast-forward 24 hours
      jest.advanceTimersByTime(24 * 60 * 60 * 1000);
      
      expect(databaseService.deleteExpiredNotifications).toHaveBeenCalled();
    });
  });

  describe('batch operations', () => {
    beforeEach(async () => {
      (databaseService.initialize as jest.Mock).mockResolvedValue(undefined);
      await storageService.initialize();
    });

    it('should batch save notifications', async () => {
      const mockNotifications = [mockCapturedNotification];
      (databaseService.saveNotification as jest.Mock).mockResolvedValue(undefined);
      (databaseService.addToSyncQueue as jest.Mock).mockResolvedValue(undefined);

      const result = await storageService.batchSaveNotifications(mockNotifications);
      
      expect(result).toHaveLength(1);
      expect(databaseService.saveNotification).toHaveBeenCalledTimes(1);
      expect(databaseService.addToSyncQueue).toHaveBeenCalledTimes(1);
    });

    it('should batch update notification status', async () => {
      const ids = ['notif-1', 'notif-2'];
      (databaseService.updateNotificationStatus as jest.Mock).mockResolvedValue(undefined);
      (databaseService.addToSyncQueue as jest.Mock).mockResolvedValue(undefined);

      await storageService.batchUpdateNotificationStatus(ids, { isRead: true });
      
      expect(databaseService.updateNotificationStatus).toHaveBeenCalledTimes(2);
      expect(databaseService.addToSyncQueue).toHaveBeenCalledTimes(2);
    });
  });

  describe('configuration', () => {
    it('should update config', () => {
      const newConfig = { maxNotifications: 2000 };
      storageService.updateConfig(newConfig);
      
      const config = storageService.getConfig();
      expect(config.maxNotifications).toBe(2000);
    });

    it('should get config', () => {
      const config = storageService.getConfig();
      expect(config).toHaveProperty('maxNotifications');
      expect(config).toHaveProperty('syncRetryAttempts');
    });
  });

  describe('database info', () => {
    beforeEach(async () => {
      (databaseService.initialize as jest.Mock).mockResolvedValue(undefined);
      await storageService.initialize();
    });

    it('should get database info', async () => {
      const mockInfo = {
        notificationCount: 100,
        syncQueueCount: 10,
        databaseSize: '1MB',
      };
      const mockNotifications = [mockSyncedNotification];
      
      (databaseService.getDatabaseInfo as jest.Mock).mockResolvedValue(mockInfo);
      (databaseService.getNotifications as jest.Mock).mockResolvedValue(mockNotifications);

      const result = await storageService.getDatabaseInfo();
      
      expect(result).toEqual(expect.objectContaining(mockInfo));
      expect(result).toHaveProperty('newestNotification');
    });

    it('should clear all data', async () => {
      (databaseService.clearAllData as jest.Mock).mockResolvedValue(undefined);

      await storageService.clearAllData();
      
      expect(databaseService.clearAllData).toHaveBeenCalled();
    });
  });
});