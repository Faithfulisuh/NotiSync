import { databaseService, SyncQueueItem } from './database';
import { CapturedNotification, SyncedNotification, NotificationStats } from '../types/notification';

export interface StorageConfig {
  maxNotifications: number;
  syncRetryAttempts: number;
  cleanupIntervalHours: number;
  offlineQueueLimit: number;
}

class StorageService {
  private static instance: StorageService;
  private config: StorageConfig = {
    maxNotifications: 1000,
    syncRetryAttempts: 3,
    cleanupIntervalHours: 24,
    offlineQueueLimit: 500,
  };

  private constructor() {}

  static getInstance(): StorageService {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService();
    }
    return StorageService.instance;
  }

  async initialize(): Promise<void> {
    await databaseService.initialize();
    await this.scheduleCleanup();
  }

  // Notification CRUD operations
  async saveNotification(notification: CapturedNotification): Promise<SyncedNotification> {
    const syncedNotification: SyncedNotification = {
      ...notification,
      synced: false,
      syncAttempts: 0,
      isRead: false,
      isDismissed: false,
    };

    await databaseService.saveNotification(syncedNotification);
    
    // Add to sync queue for background sync
    await this.addToSyncQueue(syncedNotification.id, 'create', syncedNotification);
    
    return syncedNotification;
  }

  async getNotifications(limit = 50, offset = 0): Promise<SyncedNotification[]> {
    return await databaseService.getNotifications(limit, offset);
  }

  async getNotificationById(id: string): Promise<SyncedNotification | null> {
    return await databaseService.getNotificationById(id);
  }

  async updateNotification(id: string, updates: Partial<SyncedNotification>): Promise<void> {
    const existing = await databaseService.getNotificationById(id);
    if (!existing) {
      throw new Error(`Notification with id ${id} not found`);
    }

    const updated: SyncedNotification = { ...existing, ...updates };
    await databaseService.saveNotification(updated);

    // Add to sync queue if this affects server state
    if (updates.isRead !== undefined || updates.isDismissed !== undefined) {
      await this.addToSyncQueue(id, 'update', { 
        isRead: updated.isRead, 
        isDismissed: updated.isDismissed 
      });
    }
  }

  async deleteNotification(id: string): Promise<void> {
    await databaseService.deleteNotification(id);
    await this.addToSyncQueue(id, 'delete', { id });
  }

  async markAsRead(id: string): Promise<void> {
    await databaseService.updateNotificationStatus(id, true, undefined);
    await this.addToSyncQueue(id, 'update', { isRead: true });
  }

  async markAsDismissed(id: string): Promise<void> {
    await databaseService.updateNotificationStatus(id, undefined, true);
    await this.addToSyncQueue(id, 'update', { isDismissed: true });
  }

  async markAsClicked(id: string): Promise<void> {
    await databaseService.updateNotificationStatus(id, true, undefined);
    await this.addToSyncQueue(id, 'update', { isRead: true, action: 'click' });
  }

  // Sync operations
  async getUnsyncedNotifications(): Promise<SyncedNotification[]> {
    return await databaseService.getUnsyncedNotifications();
  }

  async markAsSynced(id: string, serverId?: string): Promise<void> {
    await databaseService.updateNotificationSyncStatus(id, true, serverId);
  }

  async incrementSyncAttempts(id: string): Promise<void> {
    const notification = await databaseService.getNotificationById(id);
    if (notification) {
      await databaseService.updateNotificationSyncStatus(
        id, 
        false, 
        notification.serverId, 
        notification.syncAttempts + 1
      );
    }
  }

  // Sync queue operations
  private async addToSyncQueue(
    notificationId: string, 
    action: 'create' | 'update' | 'delete', 
    data: any
  ): Promise<void> {
    try {
      await databaseService.addToSyncQueue({
        notificationId,
        action,
        data: JSON.stringify(data),
        attempts: 0,
      });
    } catch (error) {
      console.error('Failed to add to sync queue:', error);
    }
  }

  async getSyncQueue(limit = 50): Promise<SyncQueueItem[]> {
    return await databaseService.getSyncQueue(limit);
  }

  async updateSyncQueueItem(id: string, attempts: number, error?: string): Promise<void> {
    await databaseService.updateSyncQueueItem(id, attempts, error);
  }

  async removeSyncQueueItem(id: string): Promise<void> {
    await databaseService.removeSyncQueueItem(id);
  }

  async clearSyncQueue(): Promise<void> {
    await databaseService.clearSyncQueue();
  }

  // Search and filtering
  async searchNotifications(query: string, limit = 50): Promise<SyncedNotification[]> {
    // For now, get all notifications and filter in memory
    // In a production app, you'd want to implement proper SQL search
    const notifications = await databaseService.getNotifications(1000, 0);
    
    const searchTerm = query.toLowerCase();
    return notifications
      .filter(n => 
        n.title.toLowerCase().includes(searchTerm) ||
        n.body.toLowerCase().includes(searchTerm) ||
        n.appName.toLowerCase().includes(searchTerm)
      )
      .slice(0, limit);
  }

  async getNotificationsByCategory(category: 'Work' | 'Personal' | 'Junk', limit = 50): Promise<SyncedNotification[]> {
    const notifications = await databaseService.getNotifications(1000, 0);
    return notifications
      .filter(n => n.category === category)
      .slice(0, limit);
  }

  async getNotificationsByApp(appName: string, limit = 50): Promise<SyncedNotification[]> {
    const notifications = await databaseService.getNotifications(1000, 0);
    return notifications
      .filter(n => n.appName === appName)
      .slice(0, limit);
  }

  async getNotificationsByDateRange(startDate: Date, endDate: Date): Promise<SyncedNotification[]> {
    const notifications = await databaseService.getNotifications(1000, 0);
    return notifications.filter(n => 
      n.timestamp >= startDate.getTime() && 
      n.timestamp <= endDate.getTime()
    );
  }

  // Statistics and analytics
  async getNotificationStats(): Promise<NotificationStats> {
    return await databaseService.getNotificationStats();
  }

  async getDailyNotificationCount(date: Date): Promise<number> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const notifications = await this.getNotificationsByDateRange(startOfDay, endOfDay);
    return notifications.length;
  }

  async getAppNotificationCounts(): Promise<Record<string, number>> {
    const notifications = await databaseService.getNotifications(1000, 0);
    const counts: Record<string, number> = {};
    
    notifications.forEach(n => {
      counts[n.appName] = (counts[n.appName] || 0) + 1;
    });
    
    return counts;
  }

  async getCategoryNotificationCounts(): Promise<Record<string, number>> {
    const notifications = await databaseService.getNotifications(1000, 0);
    const counts: Record<string, number> = {};
    
    notifications.forEach(n => {
      const category = n.category || 'Personal';
      counts[category] = (counts[category] || 0) + 1;
    });
    
    return counts;
  }

  // Cleanup and maintenance
  async cleanupExpiredNotifications(olderThanDays = 7): Promise<number> {
    return await databaseService.deleteExpiredNotifications(olderThanDays);
  }

  async cleanupFailedSyncItems(): Promise<void> {
    const syncQueue = await databaseService.getSyncQueue(1000);
    const failedItems = syncQueue.filter(item => item.attempts >= this.config.syncRetryAttempts);
    
    for (const item of failedItems) {
      await databaseService.removeSyncQueueItem(item.id);
    }
  }

  private async scheduleCleanup(): Promise<void> {
    // Run cleanup every 24 hours
    setInterval(async () => {
      try {
        await this.cleanupExpiredNotifications();
        await this.cleanupFailedSyncItems();
        console.log('Scheduled cleanup completed');
      } catch (error) {
        console.error('Scheduled cleanup failed:', error);
      }
    }, this.config.cleanupIntervalHours * 60 * 60 * 1000);
  }

  // Batch operations
  async batchSaveNotifications(notifications: CapturedNotification[]): Promise<SyncedNotification[]> {
    const syncedNotifications: SyncedNotification[] = [];
    
    for (const notification of notifications) {
      const synced = await this.saveNotification(notification);
      syncedNotifications.push(synced);
    }
    
    return syncedNotifications;
  }

  async batchUpdateNotificationStatus(
    ids: string[], 
    updates: { isRead?: boolean; isDismissed?: boolean }
  ): Promise<void> {
    for (const id of ids) {
      if (updates.isRead !== undefined) {
        await databaseService.updateNotificationStatus(id, updates.isRead, undefined);
      }
      if (updates.isDismissed !== undefined) {
        await databaseService.updateNotificationStatus(id, undefined, updates.isDismissed);
      }
      
      // Add to sync queue
      await this.addToSyncQueue(id, 'update', updates);
    }
  }

  // Export/Import for backup
  async exportNotifications(): Promise<SyncedNotification[]> {
    return await databaseService.getNotifications(10000, 0);
  }

  async importNotifications(notifications: SyncedNotification[]): Promise<void> {
    for (const notification of notifications) {
      await databaseService.saveNotification(notification);
    }
  }

  // Configuration
  updateConfig(newConfig: Partial<StorageConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  getConfig(): StorageConfig {
    return { ...this.config };
  }

  // Database info and debugging
  async getDatabaseInfo(): Promise<{
    notificationCount: number;
    syncQueueCount: number;
    databaseSize: string;
    oldestNotification?: Date;
    newestNotification?: Date;
  }> {
    const info = await databaseService.getDatabaseInfo();
    const notifications = await databaseService.getNotifications(1, 0);
    const oldestNotifications = await databaseService.getNotifications(1, info.notificationCount - 1);
    
    return {
      ...info,
      oldestNotification: oldestNotifications.length > 0 ? new Date(oldestNotifications[0].timestamp) : undefined,
      newestNotification: notifications.length > 0 ? new Date(notifications[0].timestamp) : undefined,
    };
  }

  async clearAllData(): Promise<void> {
    await databaseService.clearAllData();
  }
}

export const storageService = StorageService.getInstance();