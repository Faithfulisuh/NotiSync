import { Storage } from '../utils/storage';
import { Platform } from 'react-native';

// Conditional imports for native modules
let Notifications: any = null;
let Device: any = null;
let TaskManager: any = null;

if (Platform.OS !== 'web') {
  try {
    Notifications = require('expo-notifications');
    Device = require('expo-device');
    TaskManager = require('expo-task-manager');
  } catch (error) {
    console.warn('Native modules not available:', error);
  }
}
import { 
  CapturedNotification, 
  NotificationPermissionStatus, 
  NotificationCaptureConfig,
  SyncedNotification,
  NotificationStats
} from '../types/notification';
import { apiService } from './api';

const NOTIFICATION_CAPTURE_TASK = 'NOTIFICATION_CAPTURE_TASK';
const STORAGE_KEYS = {
  CAPTURED_NOTIFICATIONS: 'captured_notifications',
  CAPTURE_CONFIG: 'capture_config',
  NOTIFICATION_STATS: 'notification_stats',
  LAST_SYNC_TIME: 'last_sync_time',
};

// Configure notification handling (only on native platforms)
if (Platform.OS !== 'web' && Notifications && TaskManager) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  // Background task for notification capture
  TaskManager.defineTask(NOTIFICATION_CAPTURE_TASK, async ({ data, error }) => {
    if (error) {
      console.error('Notification capture task error:', error);
      return;
    }

    if (data) {
      // Handle background notification capture
      await NotificationCaptureService.handleBackgroundNotification(data);
    }
  });
}

class NotificationCaptureService {
  private static instance: NotificationCaptureService;
  private captureConfig: NotificationCaptureConfig;
  private isCapturing = false;
  private notificationListener: any;
  private responseListener: any;

  constructor() {
    this.captureConfig = {
      enabled: true,
      captureSystemNotifications: true,
      captureAppNotifications: true,
      excludedApps: ['com.android.systemui', 'android'],
      includedApps: [],
      filterKeywords: [],
    };
    this.loadConfig();
  }

  static getInstance(): NotificationCaptureService {
    if (!NotificationCaptureService.instance) {
      NotificationCaptureService.instance = new NotificationCaptureService();
    }
    return NotificationCaptureService.instance;
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
    if (Platform.OS === 'web' || !Notifications) {
      // Web doesn't support the same notification permissions
      return {
        granted: false,
        canAskAgain: false,
        status: 'denied',
      };
    }

    try {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
        });
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync({
          ios: {
            allowAlert: true,
            allowBadge: true,
            allowSound: true,
          },
        });
        finalStatus = status;
      }

      return {
        granted: finalStatus === 'granted',
        canAskAgain: finalStatus !== 'denied',
        status: finalStatus as 'granted' | 'denied' | 'undetermined',
      };
    } catch (error) {
      console.error('Permission request failed:', error);
      return {
        granted: false,
        canAskAgain: true,
        status: 'undetermined',
      };
    }
  }

  async startCapturing(): Promise<boolean> {
    if (this.isCapturing) {
      console.log('Notification capture is already running');
      return true;
    }

    if (Platform.OS === 'web' || !Notifications) {
      console.log('Web platform detected or native modules not available - notification capture not supported');
      return false;
    }

    try {
      console.log('Starting notification capture...');
      
      const permissions = await this.requestPermissions();
      if (!permissions.granted) {
        throw new Error('Notification permissions not granted');
      }

      console.log('Setting up notification listeners...');
      
      // Set up notification listeners
      this.notificationListener = Notifications.addNotificationReceivedListener(
        this.handleNotificationReceived.bind(this)
      );

      this.responseListener = Notifications.addNotificationResponseReceivedListener(
        this.handleNotificationResponse.bind(this)
      );

      console.log('Notification listeners set up successfully');
      console.log('⚠️  IMPORTANT: Expo notifications only capture notifications sent TO this app, not FROM other apps');
      console.log('📱 To test: Send a push notification to this app or use Expo push tool');

      // Register background task
      if (Device && Device.isDevice) {
        try {
          console.log('Registering background task...');
          await Notifications.registerTaskAsync(NOTIFICATION_CAPTURE_TASK);
          console.log('Background task registered successfully');
        } catch (taskError) {
          console.warn('Failed to register background task:', taskError);
          // Continue anyway, as foreground capture can still work
        }
      }

      this.isCapturing = true;
      console.log('Notification capture started successfully');
      return true;
    } catch (error) {
      console.error('Failed to start notification capture:', error);
      
      // Clean up any partially set up listeners
      if (this.notificationListener && Notifications) {
        Notifications.removeNotificationSubscription(this.notificationListener);
        this.notificationListener = null;
      }
      if (this.responseListener && Notifications) {
        Notifications.removeNotificationSubscription(this.responseListener);
        this.responseListener = null;
      }
      
      this.isCapturing = false;
      return false;
    }
  }

  async stopCapturing(): Promise<void> {
    console.log('stopCapturing called, current state:', this.isCapturing);
    
    if (!this.isCapturing) {
      console.log('Notification capture is already stopped');
      return;
    }

    if (Platform.OS === 'web' || !Notifications) {
      console.log('Web platform or native modules not available - no capture to stop');
      this.isCapturing = false;
      return;
    }

    try {
      console.log('Stopping notification capture...');
      
      // Update state first to prevent race conditions
      this.isCapturing = false;
      
      // Remove listeners
      if (this.notificationListener && Notifications) {
        console.log('Removing notification listener...');
        try {
          Notifications.removeNotificationSubscription(this.notificationListener);
          console.log('Notification listener removed successfully');
        } catch (listenerError) {
          console.warn('Failed to remove notification listener:', listenerError);
        }
        this.notificationListener = null;
      }

      if (this.responseListener && Notifications) {
        console.log('Removing response listener...');
        try {
          Notifications.removeNotificationSubscription(this.responseListener);
          console.log('Response listener removed successfully');
        } catch (listenerError) {
          console.warn('Failed to remove response listener:', listenerError);
        }
        this.responseListener = null;
      }

      // Unregister background task
      if (Device && Device.isDevice && TaskManager) {
        try {
          console.log('Unregistering background task...');
          const isTaskRegistered = await TaskManager.isTaskRegisteredAsync(NOTIFICATION_CAPTURE_TASK);
          console.log('Task registered status:', isTaskRegistered);
          
          if (isTaskRegistered) {
            await TaskManager.unregisterTaskAsync(NOTIFICATION_CAPTURE_TASK);
            console.log('Background task unregistered successfully');
          } else {
            console.log('Background task was not registered, skipping unregistration');
          }
        } catch (taskError) {
          console.warn('Failed to unregister background task:', taskError);
          // Don't throw here, as the task might not have been registered
        }
      }

      console.log('Notification capture stopped successfully, final state:', this.isCapturing);
    } catch (error) {
      console.error('Failed to stop notification capture:', error);
      // Ensure state is set to false even if there's an error
      this.isCapturing = false;
      // Don't re-throw the error to prevent UI issues
      console.log('Stop capture completed with errors, final state:', this.isCapturing);
    }
  }

  private async handleNotificationReceived(notification: any): Promise<void> {
    console.log('🔔 Notification received!', {
      identifier: notification.request?.identifier,
      title: notification.request?.content?.title,
      body: notification.request?.content?.body,
      data: notification.request?.content?.data,
      configEnabled: this.captureConfig.enabled
    });

    if (!this.captureConfig.enabled) {
      console.log('❌ Notification capture disabled in config');
      return;
    }

    try {
      const capturedNotification = this.extractNotificationData(notification);
      console.log('📝 Extracted notification data:', capturedNotification);
      
      if (this.shouldCaptureNotification(capturedNotification)) {
        console.log('✅ Notification passed filters, storing...');
        await this.storeNotification(capturedNotification);
        await this.updateStats('captured');
        
        // Attempt immediate sync if online
        this.syncNotificationInBackground(capturedNotification);
        console.log('💾 Notification stored and sync initiated');
      } else {
        console.log('❌ Notification filtered out');
      }
    } catch (error) {
      console.error('Failed to handle received notification:', error);
    }
  }

  private async handleNotificationResponse(response: any): Promise<void> {
    try {
      const notificationId = response.notification.request.identifier;
      const actionIdentifier = response.actionIdentifier;
      
      // Update local notification status
      await this.updateLocalNotificationStatus(notificationId, actionIdentifier);
      
      // Sync status update to server
      if (apiService.isAuthenticated()) {
        await apiService.updateNotificationStatus(notificationId, 'click');
      }
    } catch (error) {
      console.error('Failed to handle notification response:', error);
    }
  }

  static async handleBackgroundNotification(data: any): Promise<void> {
    // Handle background notification capture
    console.log('Background notification captured:', data);
  }

  private extractNotificationData(notification: any): CapturedNotification {
    const request = notification.request;
    const content = request.content;
    
    return {
      id: request.identifier,
      appName: this.extractAppName(notification),
      title: content.title || 'No Title',
      body: content.body || '',
      priority: this.mapPriority(content),
      timestamp: Date.now(),
      packageName: this.extractPackageName(notification),
      icon: content.data?.icon as string,
      actions: this.extractActions(content),
      extras: content.data || {},
    };
  }

  private extractAppName(notification: any): string {
    // Try to extract app name from various sources
    const data = notification.request.content.data;
    
    if (data?.appName) return data.appName as string;
    if (data?.app) return data.app as string;
    if (data?.source) return data.source as string;
    
    // Fallback to package name or default
    return this.extractPackageName(notification) || 'Unknown App';
  }

  private extractPackageName(notification: any): string {
    const data = notification.request.content.data;
    return (data?.packageName as string) || (data?.package as string) || 'unknown';
  }

  private mapPriority(content: any): number {
    // Map notification priority to our scale (0-3)
    if (Platform.OS === 'android') {
      // Android priority mapping - check data for priority info
      const priority = (content.data as any)?.priority;
      if (priority === 'max' || priority === 'high') return 3;
      if (priority === 'default') return 2;
      if (priority === 'low') return 1;
      return 1; // Default priority for Android
    } else {
      // iOS priority mapping
      const interruptionLevel = (content as any).interruptionLevel;
      if (interruptionLevel === 'critical') return 3;
      if (interruptionLevel === 'timeSensitive') return 2;
      if (interruptionLevel === 'active') return 1;
      return 1; // Default priority for iOS
    }
  }

  private extractActions(content: any): any[] {
    // Extract notification actions if available
    // This would need to be implemented based on registered categories
    return [];
  }

  private shouldCaptureNotification(notification: CapturedNotification): boolean {
    // Check if app is excluded
    if (this.captureConfig.excludedApps.includes(notification.packageName || '')) {
      return false;
    }

    // Check if only specific apps are included
    if (this.captureConfig.includedApps.length > 0) {
      if (!this.captureConfig.includedApps.includes(notification.packageName || '')) {
        return false;
      }
    }

    // Check filter keywords
    if (this.captureConfig.filterKeywords.length > 0) {
      const text = `${notification.title} ${notification.body}`.toLowerCase();
      const hasKeyword = this.captureConfig.filterKeywords.some(keyword =>
        text.includes(keyword.toLowerCase())
      );
      if (!hasKeyword) {
        return false;
      }
    }

    return true;
  }

  private async storeNotification(notification: CapturedNotification): Promise<void> {
    try {
      const stored = await this.getStoredNotifications();
      const syncedNotification: SyncedNotification = {
        ...notification,
        synced: false,
        syncAttempts: 0,
        isRead: false,
        isDismissed: false,
      };
      
      stored.push(syncedNotification);
      
      // Keep only last 1000 notifications to prevent storage bloat
      if (stored.length > 1000) {
        stored.splice(0, stored.length - 1000);
      }
      
      await Storage.setItem(
        STORAGE_KEYS.CAPTURED_NOTIFICATIONS,
        JSON.stringify(stored)
      );
    } catch (error) {
      console.error('Failed to store notification:', error);
    }
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

  private async updateLocalNotificationStatus(
    notificationId: string, 
    action: string
  ): Promise<void> {
    try {
      const notifications = await this.getStoredNotifications();
      const notification = notifications.find(n => n.id === notificationId);
      
      if (notification) {
        if (action === (Notifications?.DEFAULT_ACTION_IDENTIFIER || 'default')) {
          notification.isRead = true;
        } else if (action === 'dismiss') {
          notification.isDismissed = true;
        }
        
        await Storage.setItem(
          STORAGE_KEYS.CAPTURED_NOTIFICATIONS,
          JSON.stringify(notifications)
        );
      }
    } catch (error) {
      console.error('Failed to update local notification status:', error);
    }
  }

  private async syncNotificationInBackground(notification: CapturedNotification): Promise<void> {
    try {
      if (!apiService.isAuthenticated()) {
        return;
      }

      const result = await apiService.syncNotification(notification);
      
      if (result.success) {
        await this.markNotificationAsSynced(notification.id, result.data?.id);
        await this.updateStats('synced');
      } else {
        await this.incrementSyncAttempts(notification.id);
      }
    } catch (error) {
      console.error('Background sync failed:', error);
      await this.incrementSyncAttempts(notification.id);
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
    const hasListeners = !!(this.notificationListener && this.responseListener);
    console.log('getCurrentStatus - isCapturing:', this.isCapturing, 'hasListeners:', hasListeners);
    
    return {
      isCapturing: this.isCapturing,
      hasListeners,
      configEnabled: this.captureConfig.enabled,
    };
  }

  async clearAllNotifications(): Promise<void> {
    await Storage.removeItem(STORAGE_KEYS.CAPTURED_NOTIFICATIONS);
    await Storage.removeItem(STORAGE_KEYS.NOTIFICATION_STATS);
  }

  // Test method to send a local notification for testing capture
  async sendTestNotification(): Promise<void> {
    if (Platform.OS === 'web' || !Notifications) {
      console.log('Test notifications not supported on web');
      return;
    }

    try {
      console.log('📤 Sending test notification...');
      
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Test Notification 📱",
          body: 'This is a test notification to verify capture is working',
          data: { 
            appName: 'NotiSync Test',
            packageName: 'com.notisync.test',
            priority: 'high'
          },
        },
        trigger: { seconds: 1 },
      });
      
      console.log('✅ Test notification scheduled');
    } catch (error) {
      console.error('❌ Failed to send test notification:', error);
    }
  }
}

export const notificationCaptureService = NotificationCaptureService.getInstance();