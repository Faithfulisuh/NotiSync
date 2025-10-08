// Web-compatible notification capture service for React Native Web
import { Storage } from '../utils/storage';
import { Platform } from 'react-native';
import { 
  CapturedNotification, 
  NotificationPermissionStatus, 
  NotificationCaptureConfig,
  SyncedNotification,
  NotificationStats
} from '../types/notification';
import { apiService } from './api';

const STORAGE_KEYS = {
  CAPTURED_NOTIFICATIONS: 'captured_notifications_web',
  CAPTURE_CONFIG: 'capture_config_web',
  NOTIFICATION_STATS: 'notification_stats_web',
  LAST_SYNC_TIME: 'last_sync_time_web',
};

class WebNotificationCaptureService {
  private static instance: WebNotificationCaptureService;
  private captureConfig: NotificationCaptureConfig;
  private isCapturing = false;


  constructor() {
    this.captureConfig = {
      enabled: true,
      captureSystemNotifications: false, // Not possible on web
      captureAppNotifications: true,
      excludedApps: [],
      includedApps: [],
      filterKeywords: [],
    };
    this.loadConfig();
  }

  static getInstance(): WebNotificationCaptureService {
    if (!WebNotificationCaptureService.instance) {
      WebNotificationCaptureService.instance = new WebNotificationCaptureService();
    }
    return WebNotificationCaptureService.instance;
  }

  private async loadConfig(): Promise<void> {
    try {
      const config = await Storage.getItem(STORAGE_KEYS.CAPTURE_CONFIG);
      if (config) {
        this.captureConfig = { ...this.captureConfig, ...JSON.parse(config) };
      }
    } catch (error) {
      console.error('Failed to load capture config:', error);
    }
  }

  private async saveConfig(): Promise<void> {
    try {
      await Storage.setItem(
        STORAGE_KEYS.CAPTURE_CONFIG, 
        JSON.stringify(this.captureConfig)
      );
    } catch (error) {
      console.error('Failed to save capture config:', error);
    }
  }

  async requestPermissions(): Promise<NotificationPermissionStatus> {
    try {
      if (Platform.OS === 'web') {
        // Web notification permissions
        if (!('Notification' in window)) {
          return {
            granted: false,
            canAskAgain: false,
            status: 'denied',
          };
        }

        let permission = Notification.permission;
        
        if (permission === 'default') {
          permission = await Notification.requestPermission();
        }

        return {
          granted: permission === 'granted',
          canAskAgain: permission !== 'denied',
          status: permission === 'granted' ? 'granted' : permission === 'denied' ? 'denied' : 'undetermined',
        };
      } else {
        // For mobile platforms, return granted for testing
        return {
          granted: true,
          canAskAgain: true,
          status: 'granted',
        };
      }
    } catch (error) {
      console.error('Permission request failed:', error);
      return {
        granted: false,
        canAskAgain: true,
        status: 'denied',
      };
    }
  }

  async startCapturing(): Promise<boolean> {
    if (this.isCapturing) {
      console.log('Web notification capture is already running');
      return true;
    }

    try {
      console.log('Starting web notification capture...');
      
      const permissions = await this.requestPermissions();
      if (!permissions.granted) {
        throw new Error('Notification permissions not granted');
      }

      this.isCapturing = true;
      
      // Demo notifications disabled - no automatic simulation
      console.log('Web notification capture started successfully (demo notifications disabled)');
      return true;
    } catch (error) {
      console.error('Failed to start web notification capture:', error);
      this.isCapturing = false;
      return false;
    }
  }

  async stopCapturing(): Promise<void> {
    console.log('Stopping web notification capture...');
    this.isCapturing = false;
    console.log('Web notification capture stopped successfully');
  }



  private async getStoredNotifications(): Promise<SyncedNotification[]> {
    try {
      const stored = await Storage.getItem(STORAGE_KEYS.CAPTURED_NOTIFICATIONS);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Failed to get stored notifications:', error);
      return [];
    }
  }

  private async markNotificationAsSynced(localId: string, serverId?: string): Promise<void> {
    try {
      const notifications = await this.getStoredNotifications();
      const notification = notifications.find(n => n.id === localId);
      
      if (notification) {
        notification.synced = true;
        notification.serverId = serverId;
        
        await Storage.setItem(
          STORAGE_KEYS.CAPTURED_NOTIFICATIONS,
          JSON.stringify(notifications)
        );
      }
    } catch (error) {
      console.error('Failed to mark notification as synced:', error);
    }
  }

  private async incrementSyncAttempts(notificationId: string): Promise<void> {
    try {
      const notifications = await this.getStoredNotifications();
      const notification = notifications.find(n => n.id === notificationId);
      
      if (notification) {
        notification.syncAttempts++;
        notification.lastSyncAttempt = Date.now();
        
        await Storage.setItem(
          STORAGE_KEYS.CAPTURED_NOTIFICATIONS,
          JSON.stringify(notifications)
        );
      }
    } catch (error) {
      console.error('Failed to increment sync attempts:', error);
    }
  }

  private async updateStats(type: 'captured' | 'synced'): Promise<void> {
    try {
      const stats = await this.getStats();
      
      if (type === 'captured') {
        stats.totalCaptured++;
      } else if (type === 'synced') {
        stats.totalSynced++;
        stats.lastSyncTime = Date.now();
      }
      
      stats.pendingSync = stats.totalCaptured - stats.totalSynced;
      stats.captureRate = stats.totalCaptured > 0 ? 100 : 0;
      stats.syncSuccessRate = stats.totalCaptured > 0 
        ? (stats.totalSynced / stats.totalCaptured) * 100 
        : 0;
      
      await Storage.setItem(STORAGE_KEYS.NOTIFICATION_STATS, JSON.stringify(stats));
    } catch (error) {
      console.error('Failed to update stats:', error);
    }
  }

  // Public methods
  async getStats(): Promise<NotificationStats> {
    try {
      const stored = await Storage.getItem(STORAGE_KEYS.NOTIFICATION_STATS);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to get stats:', error);
    }
    
    return {
      totalCaptured: 0,
      totalSynced: 0,
      pendingSync: 0,
      captureRate: 0,
      syncSuccessRate: 0,
    };
  }

  async syncPendingNotifications(): Promise<{ success: number; failed: number }> {
    const notifications = await this.getStoredNotifications();
    const pending = notifications.filter(n => !n.synced && n.syncAttempts < 3);
    
    let success = 0;
    let failed = 0;
    
    for (const notification of pending) {
      try {
        const result = await apiService.syncNotification(notification);
        
        if (result.success) {
          await this.markNotificationAsSynced(notification.id, result.data?.id);
          success++;
        } else {
          await this.incrementSyncAttempts(notification.id);
          failed++;
        }
      } catch (error) {
        await this.incrementSyncAttempts(notification.id);
        failed++;
      }
    }
    
    return { success, failed };
  }

  async getRecentNotifications(limit = 50): Promise<SyncedNotification[]> {
    const notifications = await this.getStoredNotifications();
    return notifications
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  async updateConfig(config: Partial<NotificationCaptureConfig>): Promise<void> {
    this.captureConfig = { ...this.captureConfig, ...config };
    await this.saveConfig();
  }

  getConfig(): NotificationCaptureConfig {
    return { ...this.captureConfig };
  }

  isCapturingEnabled(): boolean {
    return this.isCapturing && this.captureConfig.enabled;
  }

  getCurrentStatus(): {
    isCapturing: boolean;
    hasListeners: boolean;
    configEnabled: boolean;
  } {
    return {
      isCapturing: this.isCapturing,
      hasListeners: this.isCapturing, // Simplified for web
      configEnabled: this.captureConfig.enabled,
    };
  }

  async clearAllNotifications(): Promise<void> {
    await Storage.removeItem(STORAGE_KEYS.CAPTURED_NOTIFICATIONS);
    await Storage.removeItem(STORAGE_KEYS.NOTIFICATION_STATS);
  }
}

export const webNotificationCaptureService = WebNotificationCaptureService.getInstance();