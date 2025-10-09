import { databaseService, AuthTokens, DatabaseUser } from '../database';
import { SyncedNotification } from '../../types/notification';

// Mock expo-sqlite
jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(() => Promise.resolve({
    execAsync: jest.fn(),
    runAsync: jest.fn(),
    getFirstAsync: jest.fn(),
    getAllAsync: jest.fn(),
  })),
}));

// Mock migrations
jest.mock('../migrations', () => ({
  migrationService: {
    runMigrations: jest.fn(),
  },
}));

describe('DatabaseService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize database successfully', async () => {
      await expect(databaseService.initialize()).resolves.not.toThrow();
    });

    it('should not reinitialize if already initialized', async () => {
      await databaseService.initialize();
      await databaseService.initialize(); // Should not throw or cause issues
    });
  });

  describe('auth tokens', () => {
    const mockTokens: AuthTokens = {
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      expiresAt: Date.now() + 3600000,
    };

    it('should save auth tokens', async () => {
      await databaseService.initialize();
      await expect(databaseService.saveAuthTokens(mockTokens)).resolves.not.toThrow();
    });

    it('should retrieve auth tokens', async () => {
      await databaseService.initialize();
      
      // Mock the database response
      const mockDb = require('expo-sqlite').openDatabaseAsync();
      (await mockDb).getFirstAsync.mockResolvedValue({
        access_token: mockTokens.accessToken,
        refresh_token: mockTokens.refreshToken,
        expires_at: mockTokens.expiresAt,
      });

      const tokens = await databaseService.getAuthTokens();
      expect(tokens).toEqual(mockTokens);
    });

    it('should return null when no tokens exist', async () => {
      await databaseService.initialize();
      
      const mockDb = require('expo-sqlite').openDatabaseAsync();
      (await mockDb).getFirstAsync.mockResolvedValue(null);

      const tokens = await databaseService.getAuthTokens();
      expect(tokens).toBeNull();
    });

    it('should clear auth tokens', async () => {
      await databaseService.initialize();
      await expect(databaseService.clearAuthTokens()).resolves.not.toThrow();
    });
  });

  describe('user management', () => {
    const mockUser: DatabaseUser = {
      id: 'user-123',
      email: 'test@example.com',
      firstName: 'John',
      lastName: 'Doe',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    it('should save user', async () => {
      await databaseService.initialize();
      await expect(databaseService.saveUser(mockUser)).resolves.not.toThrow();
    });

    it('should retrieve user', async () => {
      await databaseService.initialize();
      
      const mockDb = require('expo-sqlite').openDatabaseAsync();
      (await mockDb).getFirstAsync.mockResolvedValue({
        id: mockUser.id,
        email: mockUser.email,
        first_name: mockUser.firstName,
        last_name: mockUser.lastName,
        created_at: mockUser.createdAt,
        updated_at: mockUser.updatedAt,
      });

      const user = await databaseService.getUser();
      expect(user).toEqual(mockUser);
    });

    it('should clear user', async () => {
      await databaseService.initialize();
      await expect(databaseService.clearUser()).resolves.not.toThrow();
    });
  });

  describe('notifications', () => {
    const mockNotification: SyncedNotification = {
      id: 'notif-123',
      serverId: 'server-456',
      appName: 'Test App',
      title: 'Test Notification',
      body: 'This is a test notification',
      category: 'Personal',
      priority: 1,
      timestamp: Date.now(),
      packageName: 'com.test.app',
      synced: false,
      syncAttempts: 0,
      isRead: false,
      isDismissed: false,
    };

    it('should save notification', async () => {
      await databaseService.initialize();
      await expect(databaseService.saveNotification(mockNotification)).resolves.not.toThrow();
    });

    it('should retrieve notifications', async () => {
      await databaseService.initialize();
      
      const mockDb = require('expo-sqlite').openDatabaseAsync();
      (await mockDb).getAllAsync.mockResolvedValue([{
        id: mockNotification.id,
        server_id: mockNotification.serverId,
        app_name: mockNotification.appName,
        title: mockNotification.title,
        body: mockNotification.body,
        category: mockNotification.category,
        priority: mockNotification.priority,
        timestamp: mockNotification.timestamp,
        package_name: mockNotification.packageName,
        icon: null,
        actions: null,
        extras: null,
        synced: 0,
        sync_attempts: 0,
        last_sync_attempt: null,
        is_read: 0,
        is_dismissed: 0,
      }]);

      const notifications = await databaseService.getNotifications(10, 0);
      expect(notifications).toHaveLength(1);
      expect(notifications[0].id).toBe(mockNotification.id);
    });

    it('should get notification by id', async () => {
      await databaseService.initialize();
      
      const mockDb = require('expo-sqlite').openDatabaseAsync();
      (await mockDb).getFirstAsync.mockResolvedValue({
        id: mockNotification.id,
        server_id: mockNotification.serverId,
        app_name: mockNotification.appName,
        title: mockNotification.title,
        body: mockNotification.body,
        category: mockNotification.category,
        priority: mockNotification.priority,
        timestamp: mockNotification.timestamp,
        package_name: mockNotification.packageName,
        icon: null,
        actions: null,
        extras: null,
        synced: 0,
        sync_attempts: 0,
        last_sync_attempt: null,
        is_read: 0,
        is_dismissed: 0,
      });

      const notification = await databaseService.getNotificationById(mockNotification.id);
      expect(notification?.id).toBe(mockNotification.id);
    });

    it('should update notification sync status', async () => {
      await databaseService.initialize();
      await expect(
        databaseService.updateNotificationSyncStatus(mockNotification.id, true, 'server-789', 1)
      ).resolves.not.toThrow();
    });

    it('should update notification status', async () => {
      await databaseService.initialize();
      await expect(
        databaseService.updateNotificationStatus(mockNotification.id, true, false)
      ).resolves.not.toThrow();
    });

    it('should delete notification', async () => {
      await databaseService.initialize();
      await expect(databaseService.deleteNotification(mockNotification.id)).resolves.not.toThrow();
    });

    it('should delete expired notifications', async () => {
      await databaseService.initialize();
      
      const mockDb = require('expo-sqlite').openDatabaseAsync();
      (await mockDb).runAsync.mockResolvedValue({ changes: 5 });

      const deletedCount = await databaseService.deleteExpiredNotifications(7);
      expect(deletedCount).toBe(5);
    });
  });

  describe('sync queue', () => {
    const mockSyncItem = {
      notificationId: 'notif-123',
      action: 'create' as const,
      data: JSON.stringify({ test: 'data' }),
      attempts: 0,
    };

    it('should add to sync queue', async () => {
      await databaseService.initialize();
      await expect(databaseService.addToSyncQueue(mockSyncItem)).resolves.not.toThrow();
    });

    it('should get sync queue', async () => {
      await databaseService.initialize();
      
      const mockDb = require('expo-sqlite').openDatabaseAsync();
      (await mockDb).getAllAsync.mockResolvedValue([{
        id: 'sync-123',
        notification_id: mockSyncItem.notificationId,
        action: mockSyncItem.action,
        data: mockSyncItem.data,
        attempts: mockSyncItem.attempts,
        created_at: Date.now(),
        last_attempt: null,
        error: null,
      }]);

      const syncQueue = await databaseService.getSyncQueue(10);
      expect(syncQueue).toHaveLength(1);
      expect(syncQueue[0].notificationId).toBe(mockSyncItem.notificationId);
    });

    it('should update sync queue item', async () => {
      await databaseService.initialize();
      await expect(
        databaseService.updateSyncQueueItem('sync-123', 1, 'Test error')
      ).resolves.not.toThrow();
    });

    it('should remove sync queue item', async () => {
      await databaseService.initialize();
      await expect(databaseService.removeSyncQueueItem('sync-123')).resolves.not.toThrow();
    });

    it('should clear sync queue', async () => {
      await databaseService.initialize();
      await expect(databaseService.clearSyncQueue()).resolves.not.toThrow();
    });
  });

  describe('statistics', () => {
    it('should get notification stats', async () => {
      await databaseService.initialize();
      
      const mockDb = require('expo-sqlite').openDatabaseAsync();
      (await mockDb).getFirstAsync
        .mockResolvedValueOnce({ count: 100 }) // total
        .mockResolvedValueOnce({ count: 80 })  // synced
        .mockResolvedValueOnce({ count: 20 })  // pending
        .mockResolvedValueOnce({ last_sync: Date.now() }); // last sync

      const stats = await databaseService.getNotificationStats();
      expect(stats.totalCaptured).toBe(100);
      expect(stats.totalSynced).toBe(80);
      expect(stats.pendingSync).toBe(20);
      expect(stats.syncSuccessRate).toBe(80);
    });
  });

  describe('settings', () => {
    it('should set and get setting', async () => {
      await databaseService.initialize();
      
      const mockDb = require('expo-sqlite').openDatabaseAsync();
      (await mockDb).getFirstAsync.mockResolvedValue({
        value: JSON.stringify({ test: 'value' }),
      });

      await databaseService.setSetting('test_key', { test: 'value' });
      const value = await databaseService.getSetting('test_key');
      expect(value).toEqual({ test: 'value' });
    });

    it('should return default value when setting not found', async () => {
      await databaseService.initialize();
      
      const mockDb = require('expo-sqlite').openDatabaseAsync();
      (await mockDb).getFirstAsync.mockResolvedValue(null);

      const value = await databaseService.getSetting('nonexistent', 'default');
      expect(value).toBe('default');
    });

    it('should delete setting', async () => {
      await databaseService.initialize();
      await expect(databaseService.deleteSetting('test_key')).resolves.not.toThrow();
    });
  });

  describe('utility methods', () => {
    it('should clear all data', async () => {
      await databaseService.initialize();
      await expect(databaseService.clearAllData()).resolves.not.toThrow();
    });

    it('should get database info', async () => {
      await databaseService.initialize();
      
      const mockDb = require('expo-sqlite').openDatabaseAsync();
      (await mockDb).getFirstAsync
        .mockResolvedValueOnce({ count: 50 })  // notifications
        .mockResolvedValueOnce({ count: 10 }); // sync queue

      const info = await databaseService.getDatabaseInfo();
      expect(info.notificationCount).toBe(50);
      expect(info.syncQueueCount).toBe(10);
    });
  });
});