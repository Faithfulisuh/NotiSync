import { backgroundSyncService, SyncOperation, ConflictResolution } from '../backgroundSync';
import { storageService } from '../storage';
import { apiService } from '../api';
import { SyncedNotification } from '../../types/notification';
import { SyncQueueItem } from '../database';

// Mock dependencies
jest.mock('../storage');
jest.mock('../api');
jest.mock('expo-task-manager');
jest.mock('expo-background-fetch');
jest.mock('expo-network');

const mockStorageService = storageService as jest.Mocked<typeof storageService>;
const mockApiService = apiService as jest.Mocked<typeof apiService>;

// Mock Network
const mockNetwork = require('expo-network');
mockNetwork.getNetworkStateAsync = jest.fn();

describe('BackgroundSyncService', () => {
  const mockNotification: SyncedNotification = {
    id: 'test-notification-1',
    serverId: 'server-123',
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

  const mockSyncQueueItem: SyncQueueItem = {
    id: 'sync-item-1',
    notificationId: 'test-notification-1',
    action: 'create',
    data: JSON.stringify(mockNotification),
    attempts: 0,
    createdAt: Date.now(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    
    // Default network state - connected
    mockNetwork.getNetworkStateAsync.mockResolvedValue({
      isConnected: true,
      type: 'WIFI',
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      mockStorageService.initialize.mockResolvedValue();
      mockStorageService.getSetting.mockResolvedValue(undefined);

      const result = await backgroundSyncService.startBackgroundSync();
      
      expect(result).toBe(true);
      expect(mockStorageService.initialize).toHaveBeenCalled();
    });

    it('should load existing configuration', async () => {
      const mockConfig = {
        enabled: true,
        syncInterval: 60,
        batchSize: 10,
      };

      mockStorageService.initialize.mockResolvedValue();
      mockStorageService.getSetting
        .mockResolvedValueOnce(mockConfig)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([]);

      await backgroundSyncService.startBackgroundSync();
      
      const config = backgroundSyncService.getConfig();
      expect(config.syncInterval).toBe(60);
      expect(config.batchSize).toBe(10);
    });

    it('should not start if already running', async () => {
      mockStorageService.initialize.mockResolvedValue();
      mockStorageService.getSetting.mockResolvedValue(undefined);

      await backgroundSyncService.startBackgroundSync();
      expect(backgroundSyncService.isRunning()).toBe(true);

      const secondStart = await backgroundSyncService.startBackgroundSync();
      expect(secondStart).toBe(true);
      expect(backgroundSyncService.isRunning()).toBe(true);
    });
  });

  describe('network handling', () => {
    beforeEach(async () => {
      mockStorageService.initialize.mockResolvedValue();
      mockStorageService.getSetting.mockResolvedValue(undefined);
      await backgroundSyncService.startBackgroundSync();
    });

    it('should skip sync when network is unavailable', async () => {
      mockNetwork.getNetworkStateAsync.mockResolvedValue({
        isConnected: false,
        type: 'NONE',
      });

      mockStorageService.getSyncQueue.mockResolvedValue([mockSyncQueueItem]);

      const result = await backgroundSyncService.forceSyncNow();
      
      expect(result).toBe(false);
      expect(mockApiService.syncNotification).not.toHaveBeenCalled();
    });

    it('should proceed with sync when network is available', async () => {
      mockNetwork.getNetworkStateAsync.mockResolvedValue({
        isConnected: true,
        type: 'WIFI',
      });

      mockStorageService.getSyncQueue.mockResolvedValue([mockSyncQueueItem]);
      mockStorageService.setSetting.mockResolvedValue();
      mockApiService.syncNotification.mockResolvedValue({
        success: true,
        data: { id: 'server-123' },
      });
      mockStorageService.markAsSynced.mockResolvedValue();
      mockStorageService.removeSyncQueueItem.mockResolvedValue();

      const result = await backgroundSyncService.forceSyncNow();
      
      expect(result).toBe(true);
      expect(mockApiService.syncNotification).toHaveBeenCalled();
    });
  });

  describe('sync operations', () => {
    beforeEach(async () => {
      mockStorageService.initialize.mockResolvedValue();
      mockStorageService.getSetting.mockResolvedValue(undefined);
      mockStorageService.setSetting.mockResolvedValue();
      await backgroundSyncService.startBackgroundSync();
    });

    it('should sync create operations', async () => {
      mockStorageService.getSyncQueue.mockResolvedValue([mockSyncQueueItem]);
      mockApiService.syncNotification.mockResolvedValue({
        success: true,
        data: { id: 'server-123' },
      });
      mockStorageService.markAsSynced.mockResolvedValue();
      mockStorageService.removeSyncQueueItem.mockResolvedValue();

      const result = await backgroundSyncService.forceSyncNow();
      
      expect(result).toBe(true);
      expect(mockApiService.syncNotification).toHaveBeenCalledWith(mockNotification);
      expect(mockStorageService.markAsSynced).toHaveBeenCalledWith('test-notification-1', 'server-123');
      expect(mockStorageService.removeSyncQueueItem).toHaveBeenCalledWith('sync-item-1');
    });

    it('should sync update operations', async () => {
      const updateItem: SyncQueueItem = {
        ...mockSyncQueueItem,
        action: 'update',
        data: JSON.stringify({ notificationId: 'test-notification-1', action: 'read' }),
      };

      mockStorageService.getSyncQueue.mockResolvedValue([updateItem]);
      mockApiService.updateNotificationStatus.mockResolvedValue({
        success: true,
        data: {},
      });
      mockStorageService.removeSyncQueueItem.mockResolvedValue();

      const result = await backgroundSyncService.forceSyncNow();
      
      expect(result).toBe(true);
      expect(mockApiService.updateNotificationStatus).toHaveBeenCalledWith('test-notification-1', 'read');
      expect(mockStorageService.removeSyncQueueItem).toHaveBeenCalledWith('sync-item-1');
    });

    it('should sync delete operations', async () => {
      const deleteItem: SyncQueueItem = {
        ...mockSyncQueueItem,
        action: 'delete',
        data: JSON.stringify({ notificationId: 'test-notification-1' }),
      };

      mockStorageService.getSyncQueue.mockResolvedValue([deleteItem]);
      mockApiService.updateNotificationStatus.mockResolvedValue({
        success: true,
        data: {},
      });
      mockStorageService.removeSyncQueueItem.mockResolvedValue();

      const result = await backgroundSyncService.forceSyncNow();
      
      expect(result).toBe(true);
      expect(mockApiService.updateNotificationStatus).toHaveBeenCalledWith('test-notification-1', 'dismiss');
      expect(mockStorageService.removeSyncQueueItem).toHaveBeenCalledWith('sync-item-1');
    });

    it('should handle sync failures with retry logic', async () => {
      mockStorageService.getSyncQueue.mockResolvedValue([mockSyncQueueItem]);
      mockApiService.syncNotification.mockRejectedValue(new Error('Network error'));
      mockStorageService.updateSyncQueueItem.mockResolvedValue();

      const result = await backgroundSyncService.forceSyncNow();
      
      expect(result).toBe(false);
      expect(mockStorageService.updateSyncQueueItem).toHaveBeenCalledWith(
        'sync-item-1',
        1,
        'Network error'
      );
    });
  });

  describe('batch optimization', () => {
    beforeEach(async () => {
      mockStorageService.initialize.mockResolvedValue();
      mockStorageService.getSetting.mockResolvedValue(undefined);
      mockStorageService.setSetting.mockResolvedValue();
      
      // Enable batch optimization
      await backgroundSyncService.updateConfig({
        enableBatchOptimization: true,
        batchSize: 3,
      });
      
      await backgroundSyncService.startBackgroundSync();
    });

    it('should batch multiple create operations', async () => {
      const createItems: SyncQueueItem[] = [
        { ...mockSyncQueueItem, id: 'sync-1', notificationId: 'notif-1' },
        { ...mockSyncQueueItem, id: 'sync-2', notificationId: 'notif-2' },
        { ...mockSyncQueueItem, id: 'sync-3', notificationId: 'notif-3' },
      ];

      mockStorageService.getSyncQueue.mockResolvedValue(createItems);
      mockApiService.batchSyncNotifications.mockResolvedValue({
        success: true,
        data: [
          { id: 'server-1' },
          { id: 'server-2' },
          { id: 'server-3' },
        ],
      });
      mockStorageService.removeSyncQueueItem.mockResolvedValue();

      const result = await backgroundSyncService.forceSyncNow();
      
      expect(result).toBe(true);
      expect(mockApiService.batchSyncNotifications).toHaveBeenCalledWith([
        mockNotification,
        mockNotification,
        mockNotification,
      ]);
      expect(mockStorageService.removeSyncQueueItem).toHaveBeenCalledTimes(3);
    });

    it('should handle mixed operation types in separate batches', async () => {
      const mixedItems: SyncQueueItem[] = [
        { ...mockSyncQueueItem, id: 'sync-1', action: 'create' },
        { ...mockSyncQueueItem, id: 'sync-2', action: 'update', data: JSON.stringify({ notificationId: 'notif-2', action: 'read' }) },
        { ...mockSyncQueueItem, id: 'sync-3', action: 'create' },
      ];

      mockStorageService.getSyncQueue.mockResolvedValue(mixedItems);
      mockApiService.batchSyncNotifications.mockResolvedValue({ success: true, data: [] });
      mockApiService.updateNotificationStatus.mockResolvedValue({ success: true, data: {} });
      mockStorageService.removeSyncQueueItem.mockResolvedValue();

      const result = await backgroundSyncService.forceSyncNow();
      
      expect(result).toBe(true);
      expect(mockApiService.batchSyncNotifications).toHaveBeenCalled();
      expect(mockApiService.updateNotificationStatus).toHaveBeenCalled();
    });
  });

  describe('conflict resolution', () => {
    beforeEach(async () => {
      mockStorageService.initialize.mockResolvedValue();
      mockStorageService.getSetting.mockResolvedValue(undefined);
      mockStorageService.setSetting.mockResolvedValue();
      
      // Enable conflict resolution
      await backgroundSyncService.updateConfig({
        enableConflictResolution: true,
        conflictResolutionStrategy: 'timestamp-based',
      });
      
      await backgroundSyncService.startBackgroundSync();
    });

    it('should resolve conflicts using timestamp-based strategy', async () => {
      const olderNotification = { ...mockNotification, timestamp: Date.now() - 10000 };
      const newerServerData = { 
        id: 'server-123', 
        title: 'Updated Title', 
        timestamp: Date.now() 
      };

      mockStorageService.getSyncQueue.mockResolvedValue([mockSyncQueueItem]);
      mockStorageService.getNotificationById.mockResolvedValue(olderNotification);
      mockApiService.syncNotification.mockResolvedValue({
        success: true,
        data: newerServerData,
        conflict: true,
      });
      mockStorageService.updateNotification.mockResolvedValue();
      mockStorageService.removeSyncQueueItem.mockResolvedValue();

      const result = await backgroundSyncService.forceSyncNow();
      
      expect(result).toBe(true);
      expect(mockStorageService.updateNotification).toHaveBeenCalledWith(
        'test-notification-1',
        expect.objectContaining({
          title: 'Updated Title', // Server wins due to newer timestamp
        })
      );

      const stats = backgroundSyncService.getStats();
      expect(stats.conflictsResolved).toBe(1);
    });

    it('should resolve conflicts using client-wins strategy', async () => {
      await backgroundSyncService.updateConfig({
        conflictResolutionStrategy: 'client-wins',
      });

      const clientNotification = { ...mockNotification, title: 'Client Title' };
      const serverData = { 
        id: 'server-123', 
        title: 'Server Title',
      };

      mockStorageService.getSyncQueue.mockResolvedValue([mockSyncQueueItem]);
      mockStorageService.getNotificationById.mockResolvedValue(clientNotification);
      mockApiService.syncNotification.mockResolvedValue({
        success: true,
        data: serverData,
        conflict: true,
      });
      mockStorageService.updateNotification.mockResolvedValue();
      mockStorageService.removeSyncQueueItem.mockResolvedValue();

      await backgroundSyncService.forceSyncNow();
      
      expect(mockStorageService.updateNotification).toHaveBeenCalledWith(
        'test-notification-1',
        expect.objectContaining({
          title: 'Client Title', // Client wins
        })
      );
    });

    it('should track conflict resolutions', async () => {
      const clientNotification = { ...mockNotification };
      const serverData = { id: 'server-123', title: 'Server Title' };

      mockStorageService.getSyncQueue.mockResolvedValue([mockSyncQueueItem]);
      mockStorageService.getNotificationById.mockResolvedValue(clientNotification);
      mockApiService.syncNotification.mockResolvedValue({
        success: true,
        data: serverData,
        conflict: true,
      });
      mockStorageService.updateNotification.mockResolvedValue();
      mockStorageService.removeSyncQueueItem.mockResolvedValue();

      await backgroundSyncService.forceSyncNow();
      
      const resolutions = backgroundSyncService.getConflictResolutions();
      expect(resolutions).toHaveLength(1);
      expect(resolutions[0]).toMatchObject({
        notificationId: 'test-notification-1',
        resolution: expect.any(String),
      });
    });
  });

  describe('exponential backoff', () => {
    beforeEach(async () => {
      mockStorageService.initialize.mockResolvedValue();
      mockStorageService.getSetting.mockResolvedValue(undefined);
      mockStorageService.setSetting.mockResolvedValue();
      
      await backgroundSyncService.updateConfig({
        exponentialBackoffBase: 2,
        maxBackoffDelay: 60000, // 1 minute max
      });
      
      await backgroundSyncService.startBackgroundSync();
    });

    it('should apply exponential backoff for failed operations', async () => {
      const failedItem: SyncQueueItem = {
        ...mockSyncQueueItem,
        attempts: 2,
        lastAttempt: Date.now() - 1000, // 1 second ago
      };

      mockStorageService.getSyncQueue.mockResolvedValue([failedItem]);
      mockApiService.syncNotification.mockRejectedValue(new Error('Server error'));
      mockStorageService.updateSyncQueueItem.mockResolvedValue();

      await backgroundSyncService.forceSyncNow();
      
      // Should update with increased attempts and calculated next retry
      expect(mockStorageService.updateSyncQueueItem).toHaveBeenCalledWith(
        'sync-item-1',
        3, // attempts increased
        'Server error'
      );
    });

    it('should not retry operations that exceed max attempts', async () => {
      const maxAttemptsItem: SyncQueueItem = {
        ...mockSyncQueueItem,
        attempts: 5, // Assuming max is 5
        lastAttempt: Date.now() - 1000,
      };

      mockStorageService.getSyncQueue.mockResolvedValue([maxAttemptsItem]);

      const result = await backgroundSyncService.forceSyncNow();
      
      // Should not attempt to sync operations that exceeded max attempts
      expect(mockApiService.syncNotification).not.toHaveBeenCalled();
    });
  });

  describe('statistics tracking', () => {
    beforeEach(async () => {
      mockStorageService.initialize.mockResolvedValue();
      mockStorageService.getSetting.mockResolvedValue(undefined);
      mockStorageService.setSetting.mockResolvedValue();
      await backgroundSyncService.startBackgroundSync();
    });

    it('should track successful sync statistics', async () => {
      mockStorageService.getSyncQueue.mockResolvedValue([mockSyncQueueItem]);
      mockApiService.syncNotification.mockResolvedValue({
        success: true,
        data: { id: 'server-123' },
      });
      mockStorageService.markAsSynced.mockResolvedValue();
      mockStorageService.removeSyncQueueItem.mockResolvedValue();

      await backgroundSyncService.forceSyncNow();
      
      const stats = backgroundSyncService.getStats();
      expect(stats.totalSyncAttempts).toBe(1);
      expect(stats.successfulSyncs).toBe(1);
      expect(stats.lastSyncTime).toBeDefined();
      expect(stats.lastSuccessfulSync).toBeDefined();
    });

    it('should track failed sync statistics', async () => {
      mockStorageService.getSyncQueue.mockResolvedValue([mockSyncQueueItem]);
      mockApiService.syncNotification.mockRejectedValue(new Error('Sync failed'));
      mockStorageService.updateSyncQueueItem.mockResolvedValue();

      await backgroundSyncService.forceSyncNow();
      
      const stats = backgroundSyncService.getStats();
      expect(stats.totalSyncAttempts).toBe(1);
      expect(stats.failedSyncs).toBe(1);
      expect(stats.syncErrors.length).toBeGreaterThan(0);
    });

    it('should reset statistics', async () => {
      // Generate some stats first
      mockStorageService.getSyncQueue.mockResolvedValue([mockSyncQueueItem]);
      mockApiService.syncNotification.mockResolvedValue({
        success: true,
        data: { id: 'server-123' },
      });
      mockStorageService.markAsSynced.mockResolvedValue();
      mockStorageService.removeSyncQueueItem.mockResolvedValue();

      await backgroundSyncService.forceSyncNow();
      
      let stats = backgroundSyncService.getStats();
      expect(stats.successfulSyncs).toBe(1);

      // Reset stats
      await backgroundSyncService.resetStats();
      
      stats = backgroundSyncService.getStats();
      expect(stats.successfulSyncs).toBe(0);
      expect(stats.totalSyncAttempts).toBe(0);
    });
  });

  describe('configuration management', () => {
    it('should update configuration', async () => {
      mockStorageService.initialize.mockResolvedValue();
      mockStorageService.getSetting.mockResolvedValue(undefined);
      mockStorageService.setSetting.mockResolvedValue();

      await backgroundSyncService.startBackgroundSync();

      const newConfig = {
        syncInterval: 120,
        batchSize: 50,
        maxRetryAttempts: 10,
      };

      await backgroundSyncService.updateConfig(newConfig);
      
      const config = backgroundSyncService.getConfig();
      expect(config.syncInterval).toBe(120);
      expect(config.batchSize).toBe(50);
      expect(config.maxRetryAttempts).toBe(10);
    });

    it('should get sync status', () => {
      const status = backgroundSyncService.getSyncStatus();
      
      expect(status).toHaveProperty('isRunning');
      expect(status).toHaveProperty('isSyncing');
      expect(status).toHaveProperty('pendingOperations');
      expect(status).toHaveProperty('networkAvailable');
    });
  });

  describe('service lifecycle', () => {
    it('should start and stop background sync', async () => {
      mockStorageService.initialize.mockResolvedValue();
      mockStorageService.getSetting.mockResolvedValue(undefined);

      expect(backgroundSyncService.isRunning()).toBe(false);

      const startResult = await backgroundSyncService.startBackgroundSync();
      expect(startResult).toBe(true);
      expect(backgroundSyncService.isRunning()).toBe(true);

      await backgroundSyncService.stopBackgroundSync();
      expect(backgroundSyncService.isRunning()).toBe(false);
    });

    it('should clear sync queue', async () => {
      mockStorageService.initialize.mockResolvedValue();
      mockStorageService.getSetting.mockResolvedValue(undefined);
      mockStorageService.clearSyncQueue.mockResolvedValue();
      mockStorageService.setSetting.mockResolvedValue();

      await backgroundSyncService.startBackgroundSync();
      await backgroundSyncService.clearSyncQueue();
      
      expect(mockStorageService.clearSyncQueue).toHaveBeenCalled();
      expect(backgroundSyncService.getPendingOperationsCount()).toBe(0);
    });

    it('should force sync immediately', async () => {
      mockStorageService.initialize.mockResolvedValue();
      mockStorageService.getSetting.mockResolvedValue(undefined);
      mockStorageService.getSyncQueue.mockResolvedValue([]);
      mockStorageService.setSetting.mockResolvedValue();

      await backgroundSyncService.startBackgroundSync();
      
      const result = await backgroundSyncService.forceSyncNow();
      expect(typeof result).toBe('boolean');
    });

    it('should throw error when forcing sync while not running', async () => {
      expect(backgroundSyncService.isRunning()).toBe(false);
      
      await expect(backgroundSyncService.forceSyncNow()).rejects.toThrow(
        'Background sync is not running'
      );
    });
  });
});